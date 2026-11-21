/* ============================================================
   لایه دیتابیس درمسیر — سه حالته (اولویت بالا به پایین):
   ۱) Turso (libSQL ابری — darmasir-darmasir.turso.io) وقتی env تنظیم باشد:
      TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
      ← تک منبع حقیقت: اپ + پنل مدیریت + ورکر ابری همه به همین دیتابیس وصل‌اند
   ۲) Cloudflare D1 (رایگان) وقتی env تنظیم باشد:
      CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN + CLOUDFLARE_D1_DATABASE_ID
   ۳) Prisma/SQLite محلی — فالبک توسعه (وقتی هیچکدام تنظیم نشده باشد)

   API با Prisma سازگار است (findMany/findFirst/findUnique/create/update/
   updateMany/delete/deleteMany/count/upsert) — مسیرهای API تغییری نمی‌کنند.
   تاریخ‌ها به‌صورت epoch-millis ذخیره می‌شوند (مطابق Prisma SQLite).
   ============================================================ */

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

type Row = Record<string, any>;

/* ---------------- پیکربندی بکاند‌ها ---------------- */

const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const CF_DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID || "";
const D1_ON = !!(CF_ACCOUNT && CF_TOKEN && CF_DB_ID);

const TURSO_URL_RAW = (process.env.TURSO_DATABASE_URL || "").trim();
const TURSO_TOKEN = (process.env.TURSO_AUTH_TOKEN || "").trim();

/** libsql://darmasir-darmasir.turso.io → https://darmasir-darmasir.turso.io */
function tursoHttpUrl(raw: string): string {
  const t = raw.replace(/\/+$/, "");
  if (t.startsWith("libsql://")) return `https://${t.slice("libsql://".length)}`;
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return `https://${t}`;
}

const TURSO_URL = TURSO_URL_RAW ? tursoHttpUrl(TURSO_URL_RAW) : "";
const TURSO_ON = !!(TURSO_URL && TURSO_TOKEN);

/* ---------------- تعریف مدل‌ها ---------------- */

const MODEL_DEFS: Record<
  string,
  { table: string; dates: string[]; bools: string[]; defaults: Row }
> = {
  favorite: { table: "Favorite", dates: ["createdAt"], bools: [], defaults: { createdAt: "now" } },
  dailyRoute: { table: "DailyRoute", dates: ["createdAt"], bools: [], defaults: { createdAt: "now" } },
  tripHistory: {
    table: "TripHistory",
    dates: ["createdAt"],
    bools: [],
    defaults: { pref: "fastest", createdAt: "now" },
  },
  user: {
    table: "User",
    dates: ["createdAt", "lastLoginAt"],
    bools: [],
    defaults: { status: "active", createdAt: "now" },
  },
  session: {
    table: "Session",
    dates: ["createdAt", "lastSeenAt", "expiresAt"],
    bools: [],
    defaults: { device: "web", createdAt: "now", lastSeenAt: "now" },
  },
  otpCode: {
    table: "OtpCode",
    dates: ["expiresAt", "createdAt"],
    bools: ["used"],
    defaults: { attempts: 0, used: false, createdAt: "now" },
  },
  supportTicket: {
    table: "SupportTicket",
    dates: ["createdAt", "repliedAt"],
    bools: [],
    defaults: { status: "open", category: "general", createdAt: "now" },
  },
  /* فعالیت واقعی کاربران اپ اندروید — سفرها/علاقه‌مندی‌ها/مسیرهای روزمره (منبع: ورکر ابری) */
  appUserTrip: {
    table: "AppUserTrip",
    dates: ["createdAt"],
    bools: [],
    defaults: { minutes: 0, transfers: 0, fare: 0, createdAt: "now" },
  },
  appUserFavorite: {
    table: "AppUserFavorite",
    dates: ["createdAt"],
    bools: [],
    defaults: { createdAt: "now" },
  },
  appUserDailyRoute: {
    table: "AppUserDailyRoute",
    dates: ["createdAt"],
    bools: [],
    defaults: { kind: "custom", createdAt: "now" },
  },
};

/* ---------------- کلاینت Turso (libSQL HTTP v2 — بدون وابستگی) ---------------- */

/** مقدار JSON → آرگومان استاندارد Hrana (تاریخ→millis، بولین→0/1)
 *  نکته پروتکل: مقدار integer باید به‌صورت رشته ارسال شود (دقت i64) و null تایپ‌دار است */
function tursoArg(v: any): any {
  if (v instanceof Date) return { type: "integer", value: String(v.getTime()) };
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "bigint") return { type: "integer", value: v.toString() };
  if (typeof v === "number")
    return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  return { type: "text", value: String(v) };
}

/** رمزگشایی مقدار Hrana از پاسخ → مقدار JS (صحیح‌ها در پاسخ رشته‌اند) */
function tursoVal(v: any): any {
  if (!v || typeof v !== "object") return v;
  switch (v.type) {
    case "null": return null;
    case "integer": return Number(v.value);
    case "float": return Number(v.value);
    case "text": return v.value;
    case "blob": return v.base64 ?? null;
    default: return v.value ?? null;
  }
}

async function tursoQuery(sql: string, params: any[] = []): Promise<{ rows: Row[]; changes: number }> {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TURSO_TOKEN}`,
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql, args: params.map(tursoArg) } },
        { type: "close" },
      ],
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Turso HTTP ${res.status} — sql: ${sql.slice(0, 120)}`);
  }
  const json = (await res.json().catch(() => null)) as any;
  const first = json?.results?.[0];
  if (!first || first.type !== "ok") {
    const msg = first?.error?.message ?? json?.error?.message ?? "unknown turso error";
    throw new Error(`Turso query failed: ${msg} — sql: ${sql.slice(0, 120)}`);
  }
  const result = first.response?.result ?? {};
  /* نکته پروتکل Hrana v2: هر «ردیف» خودش آرایهٔ مقادیر است
     (rows: Array<Array<Value>>) — نه شیء {value: [...]}. خطای قبلی
     باعث می‌شد همهٔ خواندنی‌ها (ورود/ثبت‌نام/نشست/کاربران پنل) شیء خالی بدهند. */
  const cols: { name: string }[] = result.cols ?? [];
  const rawRows: any[][] = result.rows ?? [];
  const rows: Row[] = rawRows.map((cells) => {
    const row: Row = {};
    cols.forEach((c, i) => {
      row[c.name] = tursoVal(Array.isArray(cells) ? cells[i] : (cells as any)?.value?.[i]);
    });
    return row;
  });
  return { rows, changes: Number(result.affected_row_count ?? 0) };
}

/* ---------------- کلاینت D1 (REST) ---------------- */

async function d1Query(sql: string, params: any[] = []): Promise<{ rows: Row[]; changes: number }> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${CF_DB_ID}/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CF_TOKEN}` },
      body: JSON.stringify({ sql, params }),
      cache: "no-store",
    }
  );
  const json = (await res.json().catch(() => null)) as any;
  if (!json?.success) {
    const err = JSON.stringify(json?.errors ?? json);
    throw new Error(`D1 query failed: ${err} — sql: ${sql.slice(0, 120)}`);
  }
  const first = Array.isArray(json.result) ? json.result[0] : null;
  return {
    rows: (first?.results ?? []) as Row[],
    changes: Number(first?.meta?.changes ?? 0),
  };
}

/** مقدار را برای ذخیره/مقایسه در SQLite آماده می‌کند (تاریخ→millis، بولین→0/1) */
function enc(v: any): any {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === undefined) return null;
  return v;
}

function cuid(): string {
  return `c${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

function decodeRow(row: Row, m: { dates: string[]; bools: string[] }): Row {
  for (const c of m.dates) {
    const v = row[c];
    if (v === null || v === undefined) continue;
    row[c] = typeof v === "number" ? new Date(v) : new Date(Number(v) || String(v));
  }
  for (const c of m.bools) {
    row[c] = !!row[c];
  }
  return row;
}

/** where پرisma-مانند → SQL (پشتیبانی: تساوی، lt/lte/gt/gte، contains، OR، AND) */
function whereToSql(where?: Row | null): { sql: string; params: any[] } {
  if (!where || Object.keys(where).length === 0) return { sql: "1=1", params: [] };
  const clauses: string[] = [];
  const params: any[] = [];
  for (const [key, val] of Object.entries(where)) {
    if ((key === "OR" || key === "AND") && Array.isArray(val)) {
      const parts: string[] = [];
      for (const sub of val) {
        const s = whereToSql(sub);
        parts.push(`(${s.sql})`);
        params.push(...s.params);
      }
      if (parts.length) clauses.push(`(${parts.join(key === "OR" ? " OR " : " AND ")})`);
    } else if (val && typeof val === "object" && !(val instanceof Date)) {
      const ops: string[] = [];
      if ("lt" in val) { ops.push(`< ?`); params.push(enc(val.lt)); }
      if ("lte" in val) { ops.push(`<= ?`); params.push(enc(val.lte)); }
      if ("gt" in val) { ops.push(`> ?`); params.push(enc(val.gt)); }
      if ("gte" in val) { ops.push(`>= ?`); params.push(enc(val.gte)); }
      if ("contains" in val) {
        const q = String(val.contains).replace(/[\\%_]/g, (ch) => `\\${ch}`);
        ops.push(`LIKE ? ESCAPE '\\'`); params.push(`%${q}%`);
      }
      clauses.push(`"${key}" ${ops.join(" AND ")}`);
    } else {
      clauses.push(`"${key}" = ?`);
      params.push(enc(val));
    }
  }
  return { sql: clauses.join(" AND ") || "1=1", params };
}

/* ---------------- ساخت مدل — با تزریق تابع کوئری (Turso/D1) ---------------- */

type QueryFn = (sql: string, params?: any[]) => Promise<{ rows: Row[]; changes: number }>;

function makeModel(name: string, q: QueryFn) {
  const m = MODEL_DEFS[name];
  const T = m.table;
  const decode = (row: Row) => decodeRow(row, m);

  async function orderBySql(opts: any): Promise<string> {
    const ob = opts?.orderBy;
    if (!ob) return "";
    const [col, dir] = Object.entries(ob)[0] as [string, string];
    return ` ORDER BY "${col}" ${dir === "asc" ? "ASC" : "DESC"}`;
  }

  async function attachSessionCounts(users: Row[]): Promise<void> {
    const { rows } = await q(`SELECT "userId", COUNT(*) AS c FROM "Session" GROUP BY "userId"`);
    const map = new Map<string, number>(rows.map((r) => [r.userId, Number(r.c)]));
    for (const u of users) u._count = { sessions: map.get(u.id) ?? 0 };
  }

  return {
    async findMany(opts: any = {}): Promise<any[]> {
      const { sql: wsql, params: wp } = whereToSql(opts.where);
      const sql = `SELECT * FROM "${T}" WHERE ${wsql}${await orderBySql(opts)}${
        opts.take ? ` LIMIT ${Number(opts.take)}` : ""
      }`;
      const { rows } = await q(sql, wp);
      const out = rows.map(decode);
      if (opts.select?._count?.select?.sessions) await attachSessionCounts(out);
      return out;
    },

    async findFirst(opts: any = {}): Promise<any | null> {
      const rows = await this.findMany({ ...opts, take: 1 });
      return rows[0] ?? null;
    },

    async findUnique(opts: any): Promise<any | null> {
      const [col, val] = Object.entries(opts.where)[0] as [string, any];
      const { rows } = await q(`SELECT * FROM "${T}" WHERE "${col}" = ? LIMIT 1`, [enc(val)]);
      if (!rows[0]) return null;
      const row = decode(rows[0]);
      if (opts.include?.user) {
        const u = await q(`SELECT * FROM "User" WHERE "id" = ? LIMIT 1`, [row.userId]);
        row.user = u.rows[0] ? decodeRow(u.rows[0], MODEL_DEFS.user) : null;
      }
      return row;
    },

    /* شمارش گروهی بر اساس ستون — برای آمار فعالیت کاربران در پنل */
    async groupCount(groupByCol: string, where?: Row | null): Promise<Record<string, number>> {
      const { sql: wsql, params: wp } = whereToSql(where);
      const { rows } = await q(
        `SELECT "${groupByCol}" AS k, COUNT(*) AS c FROM "${T}" WHERE ${wsql} GROUP BY "${groupByCol}"`,
        wp
      );
      const out: Record<string, number> = {};
      for (const r of rows) out[String(r.k)] = Number(r.c);
      return out;
    },

    async create(opts: any): Promise<any> {
      const data: Row = { id: cuid() };
      for (const [k, v] of Object.entries(m.defaults)) {
        if (v === "now") data[k] = Date.now();
        else data[k] = v;
      }
      for (const [k, v] of Object.entries(opts.data ?? {})) {
        if (v !== undefined) data[k] = v;
      }
      const cols = Object.keys(data);
      await q(
        `INSERT INTO "${T}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        cols.map((c) => enc(data[c]))
      );
      const { rows } = await q(`SELECT * FROM "${T}" WHERE "id" = ? LIMIT 1`, [data.id]);
      return decode(rows[0]);
    },

    async update(opts: any): Promise<any | null> {
      const [wcol, wval] = Object.entries(opts.where)[0] as [string, any];
      const sets: string[] = [];
      const params: any[] = [];
      for (const [k, v] of Object.entries(opts.data ?? {})) {
        if (v && typeof v === "object" && "increment" in (v as Row)) {
          sets.push(`"${k}" = "${k}" + ?`);
          params.push((v as Row).increment);
        } else {
          sets.push(`"${k}" = ?`);
          params.push(enc(v));
        }
      }
      if (sets.length) {
        await q(`UPDATE "${T}" SET ${sets.join(", ")} WHERE "${wcol}" = ?`, [...params, enc(wval)]);
      }
      const { rows } = await q(`SELECT * FROM "${T}" WHERE "${wcol}" = ? LIMIT 1`, [enc(wval)]);
      return rows[0] ? decode(rows[0]) : null;
    },

    async updateMany(opts: any): Promise<{ count: number }> {
      const { sql: wsql, params: wp } = whereToSql(opts?.where);
      const sets: string[] = [];
      const params: any[] = [];
      for (const [k, v] of Object.entries(opts?.data ?? {})) {
        if (v && typeof v === "object" && "increment" in (v as Row)) {
          sets.push(`"${k}" = "${k}" + ?`);
          params.push((v as Row).increment);
        } else {
          sets.push(`"${k}" = ?`);
          params.push(enc(v));
        }
      }
      if (!sets.length) return { count: 0 };
      const { changes } = await q(`UPDATE "${T}" SET ${sets.join(", ")} WHERE ${wsql}`, [...params, ...wp]);
      return { count: changes };
    },

    async delete(opts: any): Promise<any> {
      const [wcol, wval] = Object.entries(opts.where)[0] as [string, any];
      await q(`DELETE FROM "${T}" WHERE "${wcol}" = ?`, [enc(wval)]);
      return null;
    },

    async deleteMany(opts?: any): Promise<{ count: number }> {
      const { sql: wsql, params: wp } = whereToSql(opts?.where);
      const { changes } = await q(`DELETE FROM "${T}" WHERE ${wsql}`, wp);
      return { count: changes };
    },

    async count(opts?: any): Promise<number> {
      const { sql: wsql, params: wp } = whereToSql(opts?.where);
      const { rows } = await q(`SELECT COUNT(*) AS c FROM "${T}" WHERE ${wsql}`, wp);
      return Number(rows[0]?.c ?? 0);
    },

    async upsert(opts: any): Promise<any> {
      const [col, val] = Object.entries(opts.where)[0] as [string, any];
      const { rows } = await q(`SELECT * FROM "${T}" WHERE "${col}" = ? LIMIT 1`, [enc(val)]);
      if (rows[0]) {
        const row = decode(rows[0]);
        const updates = opts.update ?? {};
        if (Object.keys(updates).length) {
          return this.update({ where: { id: row.id }, data: updates });
        }
        return row;
      }
      return this.create({ data: { ...opts.create, [col]: val } });
    },
  };
}

/* ---------------- ساخت کلاینت ابری (Turso یا D1) ---------------- */

function buildCloudClient(q: QueryFn): any {
  const client: Row = {};
  for (const name of Object.keys(MODEL_DEFS)) {
    client[name] = makeModel(name, q);
  }
  return client;
}

/* ---------------- صادرات db — سه حالته ---------------- */

const globalForDb = globalThis as unknown as { __darmasir_db?: any };

function resolveDb(): any {
  const backend = TURSO_ON ? "Turso (libSQL ابری)" : D1_ON ? "Cloudflare D1 (ابری)" : "Prisma/SQLite (محلی)";
  console.log(`[DB] backend = ${backend}`);
  if (TURSO_ON) return buildCloudClient(tursoQuery);
  if (D1_ON) return buildCloudClient(d1Query);
  const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
  return (
    globalForPrisma.prisma ??
    new PrismaClient({
      log: ["query"],
    })
  );
}

/** کلاینت دیتابیس — امضای PrismaClient (برای تایپ‌چک مسیرهای API) */
export const db = (globalForDb.__darmasir_db ?? resolveDb()) as PrismaClient;

globalForDb.__darmasir_db = db;

/** بکاند فعال — برای تشخیص/مانیتورینگ */
export const DB_BACKEND: "turso" | "d1" | "prisma" = TURSO_ON ? "turso" : D1_ON ? "d1" : "prisma";
