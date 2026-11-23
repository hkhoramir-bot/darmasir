/* ============================================================
   مهاجرت کامل دیتابیس درمسیر به Turso (یک‌بارمصرف)
   منابع: ۱) D1 کلادفلر  ۲) Prisma محلی (db/custom.db)
          ۳) پنل محلی (mini-services/darmasir-admin/data/admin.db)
   مقصد:  Turso — libsql://darmasir-darmasir.turso.io
   استراتژی:
     - User: ادغام با کلید phone/email — ردیف موجود دست نمی‌خورد؛
       فیلدهای خالی (passwordHash/name) از منابع پر می‌شود
     - Session/OtpCode/TripHistory/Favorite/DailyRoute/SupportTicket/
       AppUser*: INSERT OR IGNORE با id
     - جداول محتوایی پنل (cities/lines/stations/ads/voice_lexicon/
       settings/admins/revenues/...): INSERT OR REPLACE — پنل محلی مرجع است
     - app_users: ادغام با کلید phone (UNIQUE)
     - audit_log/change_log/api_stats: INSERT OR IGNORE (فقط‌الحاق)
   ============================================================ */
import { Database } from "bun:sqlite";

const TURSO_TOKEN = process.env.TURSO_TOKEN || "";
const TURSO_BASE = "https://darmasir-darmasir.turso.io";
const CF_ACCOUNT = "732f026fc120a50b835fa91d8a6b303e";
const CF_DB_ID = "9313466b-e4ae-431a-ac48-9a4cf43410c3";
const CF_TOKEN = process.env.CF_TOKEN || "";

if (!TURSO_TOKEN || !CF_TOKEN) {
  console.error("TURSO_TOKEN / CF_TOKEN env required");
  process.exit(1);
}

/* ---------------- کلاینت‌ها ---------------- */

function encArg(v: any): any {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  if (v instanceof Uint8Array) return { type: "blob", base64: Buffer.from(v).toString("base64") };
  return { type: "text", value: String(v) };
}

async function tursoExec(stmts: { sql: string; args?: any[] }[]): Promise<void> {
  const res = await fetch(`${TURSO_BASE}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TURSO_TOKEN}` },
    body: JSON.stringify({
      requests: [
        ...stmts.map((s) => ({ type: "execute", stmt: { sql: s.sql, args: (s.args ?? []).map(encArg) } })),
        { type: "close" },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}`);
  const j: any = await res.json();
  const results: any[] = j?.results ?? [];
  for (let i = 0; i < stmts.length; i++) {
    const r = results[i];
    if (!r || r.type !== "ok") throw new Error(`Turso: ${r?.error?.message} — ${stmts[i].sql.slice(0, 100)}`);
  }
}

async function tursoRows(sql: string, args: any[] = []): Promise<Record<string, any>[]> {
  const res = await fetch(`${TURSO_BASE}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TURSO_TOKEN}` },
    body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql, args: args.map(encArg) } }, { type: "close" }] }),
  });
  const j: any = await res.json();
  const r = j?.results?.[0];
  if (!r || r.type !== "ok") throw new Error(`Turso read: ${r?.error?.message}`);
  const cols = (r.response?.result?.cols ?? []).map((c: any) => c.name);
  return (r.response?.result?.rows ?? []).map((row: any[]) => {
    const o: Record<string, any> = {};
    cols.forEach((c, i) => (o[c] = row[i]?.value ?? null));
    return o;
  });
}

async function d1Query(sql: string): Promise<Record<string, any>[]> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${CF_DB_ID}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CF_TOKEN}` },
    body: JSON.stringify({ sql }),
  });
  const j: any = await res.json();
  if (!j?.success) throw new Error(`D1: ${JSON.stringify(j?.errors).slice(0, 200)}`);
  return (j.result?.[0]?.results ?? []) as Record<string, any>[];
}

function openLocal(path: string): Database {
  const db = new Database(path, { readonly: true });
  return db;
}

/* ---------------- کمکی‌ها ---------------- */

const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function mapKeysCamel(row: Record<string, any>): Record<string, any> {
  const o: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) o[snakeToCamel(k)] = v;
  return o;
}

function normPhone(v: any): string | null {
  let p = String(v ?? "").trim();
  if (!p) return null;
  p = p.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^\d+]/g, "");
  if (p.startsWith("+98")) p = "0" + p.slice(3);
  else if (p.startsWith("98") && p.length === 12) p = "0" + p.slice(2);
  else if (/^9\d{9}$/.test(p)) p = "0" + p;
  return /^09\d{9}$/.test(p) ? p : null;
}
function normEmail(v: any): string | null {
  const e = String(v ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

function insertStmt(table: string, row: Record<string, any>, mode: "ignore" | "replace"): { sql: string; args: any[] } {
  const cols = Object.keys(row);
  const sql =
    mode === "ignore"
      ? `INSERT OR IGNORE INTO ${table} (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`
      : `INSERT OR REPLACE INTO ${table} (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
  return { sql, args: cols.map((c) => row[c]) };
}

async function insertRows(table: string, rows: Record<string, any>[], mode: "ignore" | "replace", label: string): Promise<number> {
  let n = 0;
  const BATCH = 40;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).filter((r) => Object.keys(r).length);
    if (!chunk.length) continue;
    await tursoExec(chunk.map((r) => insertStmt(table, r, mode)));
    n += chunk.length;
  }
  console.log(`  ${label}: ${n} rows → ${table} (${mode})`);
  return n;
}

/* ============================================================
   ۱) User — ادغام سه‌منبعی با کلید phone/email
   ============================================================ */

async function mergeUsers(): Promise<void> {
  console.log("== User merge ==");
  const existing = await tursoRows(`SELECT * FROM "User"`);
  const byKey = new Map<string, Record<string, any>>();
  const keyOf = (r: Record<string, any>): string | null => {
    const p = normPhone(r.phone);
    if (p) return `p:${p}`;
    const e = normEmail(r.email);
    if (e) return `e:${e}`;
    return null;
  };
  for (const r of existing) {
    const k = keyOf(r);
    if (k) byKey.set(k, r);
  }
  console.log(`  Turso existing: ${existing.length}`);

  const sources: { label: string; rows: Record<string, any>[] }[] = [];

  /* D1 (نام جدول‌ها camelCase — ساخت ورکر قبلی) */
  try {
    const d1Users = (await d1Query(`SELECT * FROM "User"`)).map(mapKeysCamel);
    sources.push({ label: "D1", rows: d1Users });
  } catch (e) {
    console.log("  D1 users read failed:", (e as Error).message);
  }

  /* Prisma محلی (camelCase از قبل) */
  try {
    const pdb = openLocal("db/custom.db");
    const prismaUsers = pdb.prepare(`SELECT * FROM "User"`).all() as Record<string, any>[];
    pdb.close();
    sources.push({ label: "Prisma-local", rows: prismaUsers });
  } catch (e) {
    console.log("  Prisma users read failed:", (e as Error).message);
  }

  const toInsert: Record<string, any>[] = [];
  const toUpdate: { id: string; patch: Record<string, any> }[] = [];
  for (const src of sources) {
    for (const u of src.rows) {
      const k = keyOf(u);
      if (!k) {
        /* بدون شماره/ایمیل معتبر — با id ثبت می‌شود اگر تکراری نباشد */
        if (u.id && !existing.some((x) => x.id === u.id) && !toInsert.some((x) => x.id === u.id)) {
          toInsert.push({
            id: String(u.id), name: String(u.name ?? "کاربر درمسیر").slice(0, 80),
            phone: null, email: null, passwordHash: u.passwordHash ?? null,
            status: u.status === "blocked" ? "blocked" : "active",
            createdAt: String(u.createdAt ?? Date.now()), lastLoginAt: u.lastLoginAt ? String(u.lastLoginAt) : null,
          });
        }
        continue;
      }
      const ex = byKey.get(k);
      if (!ex) {
        if (toInsert.some((x) => keyOf(x) === k)) continue;
        const row = {
          id: String(u.id), name: String(u.name ?? "کاربر درمسیر").slice(0, 80),
          phone: normPhone(u.phone), email: normEmail(u.email),
          passwordHash: u.passwordHash ?? null,
          status: u.status === "blocked" ? "blocked" : "active",
          createdAt: String(u.createdAt ?? Date.now()),
          lastLoginAt: u.lastLoginAt != null ? String(u.lastLoginAt) : null,
        };
        toInsert.push(row);
        byKey.set(k, row);
      } else {
        /* ردیف موجود — فقط فیلدهای خالی پر می‌شود */
        const patch: Record<string, any> = {};
        if (!ex.passwordHash && u.passwordHash) patch.passwordHash = u.passwordHash;
        if ((!ex.email || ex.email === "") && normEmail(u.email)) patch.email = normEmail(u.email);
        if ((!ex.phone || ex.phone === "") && normPhone(u.phone)) patch.phone = normPhone(u.phone);
        if (Object.keys(patch).length) toUpdate.push({ id: String(ex.id), patch });
      }
    }
  }

  await insertRows('"User"', toInsert, "ignore", "inserted");
  for (const { id, patch } of toUpdate) {
    const sets = Object.keys(patch).map((c) => `"${c}" = ?`).join(", ");
    await tursoExec([{ sql: `UPDATE "User" SET ${sets} WHERE "id" = ?`, args: [...Object.values(patch), id] }]);
  }
  console.log(`  patched existing: ${toUpdate.length}`);
}

/* ============================================================
   ۲) جداول فعالیت وب (Prisma + D1) — INSERT OR IGNORE با id
   ============================================================ */

async function mergeWebActivity(): Promise<void> {
  console.log("== Web activity tables ==");
  const simple = [
    { src: '"Session"', dst: '"Session"', pk: "token" },
    { src: '"OtpCode"', dst: '"OtpCode"', pk: "id" },
    { src: '"TripHistory"', dst: '"TripHistory"', pk: "id" },
    { src: '"Favorite"', dst: '"Favorite"', pk: "id" },
    { src: '"DailyRoute"', dst: '"DailyRoute"', pk: "id" },
    { src: '"SupportTicket"', dst: '"SupportTicket"', pk: "id" },
    { src: '"AppUserTrip"', dst: '"AppUserTrip"', pk: "id" },
    { src: '"AppUserFavorite"', dst: '"AppUserFavorite"', pk: "id" },
    { src: '"AppUserDailyRoute"', dst: '"AppUserDailyRoute"', pk: "id" },
  ];

  /* Prisma محلی */
  try {
    const pdb = openLocal("db/custom.db");
    for (const m of simple) {
      const rows = pdb.prepare(`SELECT * FROM ${m.src}`).all() as Record<string, any>[];
      if (!rows.length) continue;
      await insertRows(m.dst, rows, "ignore", `prisma ${m.src}`);
    }
    pdb.close();
  } catch (e) {
    console.log("  Prisma activity failed:", (e as Error).message);
  }

  /* D1 — snake_case → camelCase */
  try {
    const pairs: [string, string][] = [
      ["\"Session\"", '"Session"'],
      ["\"OtpCode\"", '"OtpCode"'],
      ["\"TripHistory\"", '"TripHistory"'],
      ["\"Favorite\"", '"Favorite"'],
      ["\"DailyRoute\"", '"DailyRoute"'],
      ["\"SupportTicket\"", '"SupportTicket"'],
    ];
    for (const [src, dst] of pairs) {
      const rows = (await d1Query(`SELECT * FROM ${src}`)).map(mapKeysCamel);
      if (!rows.length) continue;
      /* نوع id در D1 ممکن است integer باشد — به text تبدیل برای جداول TEXT-PK */
      const fixed = rows.map((r) => {
        if (r.id != null && dst !== '"Session"') r.id = String(r.id);
        if (dst === '"OtpCode"' && r.used != null) r.used = r.used ? 1 : 0;
        return r;
      });
      await insertRows(dst, fixed, "ignore", `d1 ${src}`);
    }
  } catch (e) {
    console.log("  D1 activity failed:", (e as Error).message);
  }
}

/* ============================================================
   ۳) پنل محلی → Turso (محتوای مدیریتی — مرجع: پنل)
   ============================================================ */

async function mergePanelData(): Promise<void> {
  console.log("== Panel data ==");
  const db = openLocal("mini-services/darmasir-admin/data/admin.db");

  const replaceById: [string, string][] = [
    ["admins", "admins"],
    ["cities", "cities"],
    ["lines", "lines"],
    ["stations", "stations"],
    ["ads", "ads"],
    ["voice_lexicon", "voice_lexicon"],
    ["revenues", "revenues"],
    ["revenue_payments", "revenue_payments"],
    ["revenue_docs", "revenue_docs"],
    ["invoices", "invoices"],
    ["tickets", "tickets"],
  ];
  for (const [src, dst] of replaceById) {
    const rows = db.prepare(`SELECT * FROM ${src}`).all() as Record<string, any>[];
    await insertRows(dst, rows, "replace", src);
  }

  /* ad_stats_daily — کلید مرکب */
  const stats = db.prepare(`SELECT * FROM ad_stats_daily`).all() as Record<string, any>[];
  await insertRows("ad_stats_daily", stats, "replace", "ad_stats_daily");

  /* sessions پنل — کلید token */
  const psess = db.prepare(`SELECT * FROM sessions`).all() as Record<string, any>[];
  await insertRows("sessions", psess, "replace", "panel sessions");

  /* settings — REPLACE با کلید + فورس نسخه */
  const settings = db.prepare(`SELECT * FROM settings`).all() as Record<string, any>[];
  await insertRows("settings", settings, "replace", "settings");
  await tursoExec([
    { sql: `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('app_version', '4.8.20', ?)`, args: [new Date().toISOString()] },
  ]);
  console.log("  settings.app_version forced → 4.8.20");

  /* app_users — ادغام با کلید phone (ردیف‌های ابری حفظ می‌شوند) */
  const locals = db.prepare(`SELECT * FROM app_users`).all() as Record<string, any>[];
  const cloud = await tursoRows(`SELECT * FROM app_users`);
  const cloudPhones = new Set(cloud.map((r) => String(r.phone ?? "").trim()));
  const newOnes = locals.filter((r) => r.phone && !cloudPhones.has(String(r.phone).trim()));
  await insertRows("app_users", newOnes, "ignore", "app_users (local-only)");
  /* بروزرسانی نام/وضعیت شماره‌های مشترک از پنل (مرجع مدیر) */
  for (const r of locals) {
    if (!r.phone) continue;
    await tursoExec([
      { sql: `UPDATE app_users SET display_name = ?, status = ?, trips_count = ? WHERE phone = ?`,
        args: [r.display_name, r.status, r.trips_count, String(r.phone)] },
    ]);
  }
  console.log(`  app_users updated from panel: ${locals.length}`);

  /* لاگ‌های فقط‌الحاق */
  const appendOnly: [string, string, string][] = [
    ["audit_log", "audit_log", "id"],
    ["change_log", "change_log", "id"],
    ["api_stats", "api_stats", "day"],
  ];
  for (const [src, dst, pk] of appendOnly) {
    const rows = db.prepare(`SELECT * FROM ${src}`).all() as Record<string, any>[];
    const existingIds = new Set((await tursoRows(`SELECT ${pk} FROM ${dst}`)).map((r) => String(r[pk])));
    const fresh = rows.filter((r) => !existingIds.has(String(r[pk])));
    await insertRows(dst, fresh, "ignore", `${src} (fresh)`);
  }

  db.close();
}

/* ============================================================
   اجرا
   ============================================================ */

async function main() {
  console.log("=== درمسیر — مهاجرت کامل به Turso ===");
  await mergeUsers();
  await mergeWebActivity();
  await mergePanelData();

  console.log("\n== نتیجه نهایی ==")
  for (const t of ['"User"', '"Session"', '"OtpCode"', '"TripHistory"', '"SupportTicket"', "app_users", "settings", "cities", "lines", "stations", "ads", "admins", "voice_lexicon", "audit_log", "change_log"]) {
    const rows = await tursoRows(`SELECT COUNT(*) AS n FROM ${t}`);
    console.log(`  ${t}: ${rows[0]?.n}`);
  }
  const ver = await tursoRows(`SELECT value FROM settings WHERE key = 'app_version'`);
  console.log(`  app_version = ${ver[0]?.value}`);
}

main().catch((e) => {
  console.error("MIGRATION FAILED:", e);
  process.exit(1);
});
