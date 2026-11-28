/* ============================================================
   درمسیر — پنل مدیریت | لایه دیتابیس (دومدونه، API ناهمگام)
   ۱) Turso (libSQL ابری — libsql://darmasir-darmasir.turso.io)
      وقتی TURSO_DATABASE_URL + TURSO_AUTH_TOKEN تنظیم باشد — منبع حقیقت ابری:
      اپ + پنل + ورکر همه به همان دیتابیس وصل‌اند.
   ۲) bun:sqlite محلی — فالبک توسعه (وقتی env تنظیم نشده باشد)

   API ناهمگام برای هر دو حالت یکسان است:
     q(sql, args)   → آرایه سطرها (SELECT چندسطری)
     q1(sql, args)  → سطر اول یا null (SELECT تکی)
     run(sql, args) → { changes, lastInsertRowid } (نوشتن)
     exec(sql)      → اجرای چنددستوری DDL
   ============================================================ */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { hashPassword } from "./auth";

const DB_DIR = join(import.meta.dir, "..", "data");
mkdirSync(DB_DIR, { recursive: true });

/* پوشه ذخیره مستندات قراردادها (تصویر/PDF/آفیس) — همیشه محلی */
export const UPLOAD_DIR = join(import.meta.dir, "..", "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------------- پیکربندی بکاند ---------------- */

const TURSO_URL_RAW = (process.env.TURSO_DATABASE_URL || "").trim();
const TURSO_TOKEN = (process.env.TURSO_AUTH_TOKEN || "").trim();

/** libsql://darmasir-darmasir.turso.io → https://darmasir-darmasir.turso.io */
function tursoHttpUrl(raw: string): string {
  const t = raw.replace(/\/+$/, "");
  if (t.startsWith("libsql://")) return `https://${t.slice("libsql://".length)}`;
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return `https://${t}`;
}

const TURSO_HTTP = TURSO_URL_RAW ? tursoHttpUrl(TURSO_URL_RAW) : "";
export const DB_BACKEND: "turso" | "sqlite" = TURSO_HTTP && TURSO_TOKEN ? "turso" : "sqlite";

export const now = () => new Date().toISOString();

/* ---------------- کلاینت Turso (Hrana v2 — بدون وابستگی) ---------------- */

/** مقدار JS → آرگومان استاندارد Hrana — صحیح باید رشته شود (دقت i64) و null تایپ‌دار است */
function encArg(v: any): any {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  if (typeof v === "bigint") return { type: "integer", value: v.toString() };
  if (typeof v === "number") {
    if (Number.isInteger(v)) return { type: "integer", value: String(v) };
    return { type: "float", value: v };
  }
  if (v instanceof Uint8Array) return { type: "blob", base64: Buffer.from(v).toString("base64") };
  return { type: "text", value: String(v) };
}

/** رمزگشایی مقدار Hrana از پاسخ → مقدار JS */
function decVal(v: any): any {
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

interface HranaResult {
  cols: string[];
  rows: any[];
  changes: number;
  lastInsertRowid: number | null;
}

async function tursoPipeline(stmts: { sql: string; args?: any[] }[]): Promise<HranaResult[]> {
  const body = {
    requests: [
      ...stmts.map((s) => ({
        type: "execute",
        stmt: { sql: s.sql, args: (s.args ?? []).map(encArg) },
      })),
      { type: "close" },
    ],
  };
  const res = await fetch(`${TURSO_HTTP}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TURSO_TOKEN}` },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Turso HTTP ${res.status} — ${stmts[0]?.sql?.slice(0, 80)}`);
  const j: any = await res.json().catch(() => null);
  const out: HranaResult[] = [];
  for (let i = 0; i < stmts.length; i++) {
    const r = j?.results?.[i];
    if (!r || r.type !== "ok")
      throw new Error(`Turso query failed: ${r?.error?.message ?? "unknown"} — ${stmts[i].sql.slice(0, 120)}`);
    const result = r.response?.result ?? {};
    const cols: string[] = (result.cols ?? []).map((c: any) => c.name);
    const rows = (result.rows ?? []).map((row: any) => {
      const o: any = {};
      cols.forEach((c, k) => (o[c] = decVal(row[k])));
      return o;
    });
    out.push({
      cols,
      rows,
      changes: Number(result.affected_row_count ?? 0),
      lastInsertRowid: result.last_insert_rowid ? decVal(result.last_insert_rowid) : null,
    });
  }
  return out;
}

/* ---------------- فالبک محلی bun:sqlite ---------------- */

let ldb: Database | null = null;
if (DB_BACKEND === "sqlite") {
  ldb = new Database(join(DB_DIR, "admin.db"));
  ldb.exec("PRAGMA journal_mode = WAL;");
  ldb.exec("PRAGMA foreign_keys = ON;");
}

/* ---------------- API ناهمگام یکسان ----------------
   نسخه‌های raw بدون گارد ready — فقط برای راه‌اندازی (bootstrap) استفاده می‌شوند */

async function rawQ(sql: string, params: any[] = []): Promise<any[]> {
  if (DB_BACKEND === "turso") {
    const [r] = await tursoPipeline([{ sql, args: params }]);
    return r.rows;
  }
  return ldb!.prepare(sql).all(...params) as any[];
}

async function rawQ1(sql: string, params: any[] = []): Promise<any | null> {
  const rows = await rawQ(sql, params);
  return rows[0] ?? null;
}

async function rawRun(
  sql: string,
  params: any[] = []
): Promise<{ changes: number; lastInsertRowid: number | null }> {
  if (DB_BACKEND === "turso") {
    const [r] = await tursoPipeline([{ sql, args: params }]);
    return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
  }
  const r = ldb!.prepare(sql).run(...params) as any;
  return {
    changes: Number(r?.changes ?? 0),
    lastInsertRowid: r?.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
  };
}

/** اجرای چنددستوری DDL (raw) */
async function rawExec(sql: string): Promise<void> {
  if (DB_BACKEND === "turso") {
    const parts = sql
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length) await tursoPipeline(parts.map((p) => ({ sql: p })));
    return;
  }
  ldb!.exec(sql);
}

/** اجرای دسته‌ای دستورات DDL — چنددستوری */
export async function exec(sql: string): Promise<void> {
  await ensureReady();
  await rawExec(sql);
}

export async function q(sql: string, params: any[] = []): Promise<any[]> {
  await ensureReady();
  return rawQ(sql, params);
}

export async function q1(sql: string, params: any[] = []): Promise<any | null> {
  await ensureReady();
  const rows = await rawQ(sql, params);
  return rows[0] ?? null;
}

export async function run(
  sql: string,
  params: any[] = []
): Promise<{ changes: number; lastInsertRowid: number | null }> {
  await ensureReady();
  return rawRun(sql, params);
}

/* ---------------- Schema ---------------- */

const DDL = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  admin_name TEXT,
  action TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  trips_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_seen TEXT
);
CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL DEFAULT 'metro',
  number INTEGER,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#009640',
  terminals TEXT,
  direction TEXT,
  city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_id INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat REAL,
  lng REAL,
  city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  image_url TEXT,
  link_url TEXT,
  placement TEXT NOT NULL DEFAULT 'home',
  starts_at TEXT,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS voice_lexicon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spoken TEXT NOT NULL,
  written TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  admin_name TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_stats (
  day TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS revenues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  org_name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  contract_no TEXT,
  contract_start TEXT,
  contract_end TEXT,
  terms TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revenue_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revenue_id INTEGER NOT NULL REFERENCES revenues(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  method TEXT,
  reference TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revenue_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revenue_id INTEGER NOT NULL REFERENCES revenues(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reply TEXT,
  replied_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE NOT NULL,
  title TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  items TEXT NOT NULL DEFAULT '[]',
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'issued',
  issue_date TEXT,
  due_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ad_stats_daily (
  ad_id INTEGER NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_id, day)
);
`;

/* ---------------- Migrations (idempotent) ---------------- */

async function ensureColumn(table: string, name: string, ddl: string): Promise<void> {
  const cols = await rawQ(`PRAGMA table_info(${table})`);
  if (!cols.some((c: any) => c.name === name)) {
    await rawRun(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

async function migrateColumns(): Promise<void> {
  await ensureColumn("ads", "subtitle", "subtitle TEXT");
  await ensureColumn("ads", "badge", "badge TEXT");
  await ensureColumn("ads", "cta_text", "cta_text TEXT");
  await ensureColumn("ads", "advertiser", "advertiser TEXT");
  await ensureColumn("ads", "priority", "priority INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("ads", "updated_at", "updated_at TEXT");
  await ensureColumn("lines", "city_id", "city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL");
  await ensureColumn("stations", "city_id", "city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL");
  await ensureColumn("tickets", "cloud_id", "cloud_id TEXT");
  await ensureColumn("tickets", "cloud_status", "cloud_status TEXT");
}

/* ---------------- Seed ---------------- */

async function seed(): Promise<void> {
  const adminCount = Number((await rawQ1("SELECT COUNT(*) AS c FROM admins"))?.c ?? 0);
  if (adminCount === 0) {
    await rawRun(
      "INSERT INTO admins (username, password_hash, display_name, role, created_at) VALUES (?,?,?,?,?)",
      ["admin", hashPassword("darmasir1404"), "مدیر کل درمسیر", "super", now()]
    );
    await rawRun(
      "INSERT INTO admins (username, password_hash, display_name, role, created_at) VALUES (?,?,?,?,?)",
      ["operator", hashPassword("darmasir1404"), "اپراتور درمسیر", "operator", now()]
    );
    await rawRun(
      "INSERT INTO admins (username, password_hash, display_name, role, created_at) VALUES (?,?,?,?,?)",
      ["viewer", hashPassword("darmasir1404"), "ناظر درمسیر", "viewer", now()]
    );
  }

  const settingCount = Number((await rawQ1("SELECT COUNT(*) AS c FROM settings"))?.c ?? 0);
  if (settingCount === 0) {
    const t = now();
    const rows: [string, string][] = [
      ["app_name", "درمسیر"],
      ["app_version", "4.8.21"],
      ["welcome_message", "سفر خود را با درمسیر آغاز کنید"],
      ["maintenance_mode", "off"],
      ["voice_enabled", "on"],
      ["voice_service", "cloudflare-worker"],
      ["support_message", "پشتیبانی درمسیر در خدمت شماست"],
    ];
    for (const [k, v] of rows) {
      await rawRun("INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)", [k, v, t]);
    }
  }

  const cityCount = Number((await rawQ1("SELECT COUNT(*) AS c FROM cities"))?.c ?? 0);
  if (cityCount === 0) {
    // شهرهای دارای شبکه حمل‌ونقل ریلی در ایران — قابل افزودن از صفحه «شهرها»
    const names = ["تهران", "کرج", "مشهد", "اصفهان", "شیراز", "تبریز"];
    for (let i = 0; i < names.length; i++) {
      await rawRun("INSERT INTO cities (name, sort, created_at) VALUES (?,?,?)", [names[i], i, now()]);
    }
  }

  const cityIdByName = async (name: string): Promise<number | null> => {
    const r = await rawQ1("SELECT id FROM cities WHERE name = ?", [name]);
    return r ? Number(r.id) : null;
  };

  const lineCount = Number((await rawQ1("SELECT COUNT(*) AS c FROM lines"))?.c ?? 0);
  if (lineCount === 0) {
    // داده واقعی از هسته داده مترو (src/lib/metro-data.ts)
    const tehran: [number, string, string, string, string][] = [
      [1, "خط ۱", "#e52421", "کهریزک|تجریش", "شمال - جنوب"],
      [2, "خط ۲", "#15397a", "صادقیه|فرهنگسرا", "شرق - غرب"],
      [3, "خط ۳", "#00a3e0", "آزادگان|قائم", "شمال شرق - جنوب غرب"],
      [4, "خط ۴", "#f6b400", "علامه جعفری|شهید کلاهدوز", "شرق - غرب"],
      [5, "خط ۵", "#009640", "صادقیه|شهید قاسم سلیمانی", "غرب - شمال"],
      [6, "خط ۶", "#d82572", "شهدای دولت‌آباد|شهید آرمان علی‌وردی", "شمال غرب - جنوب شرق"],
      [7, "خط ۷", "#7d2382", "ورزشگاه تختی|میدان کتاب", "شمال - جنوب"],
    ];
    const TEHRAN = await cityIdByName("تهران");
    const KARAJ = await cityIdByName("کرج");
    const MASHHAD = await cityIdByName("مشهد");
    const ISFAHAN = await cityIdByName("اصفهان");
    const insLine = async (
      n: number,
      name: string,
      color: string,
      terms: string,
      dir: string,
      cid: number | null,
      sort: number
    ) => {
      await rawRun(
        "INSERT INTO lines (mode, number, name, color, terminals, direction, city_id, is_active, sort) VALUES (?,?,?,?,?,?,?,1,?)",
        ["metro", n, name, color, terms, dir, cid, sort]
      );
    };
    for (let i = 0; i < tehran.length; i++) {
      const [n, name, color, terms, dir] = tehran[i];
      await insLine(n, name, color, terms, dir, TEHRAN, i);
    }
    await insLine(1, "مترو کرج — خط ۱", "#009640", "آیت‌الله طالقانی|چهل‌وپنج متری گلشهر", "غرب - شرق", KARAJ, 7);
    await insLine(1, "مترو مشهد — خط ۱", "#009640", "وکیل‌آباد|فرودگاه شهید هاشمی‌نژاد", "شمال غرب - جنوب شرق", MASHHAD, 8);
    await insLine(2, "مترو مشهد — خط ۲", "#e52421", "طبرسی|شهید فکوری", "شمال غرب - جنوب شرق", MASHHAD, 9);
    await insLine(1, "مترو اصفهان — خط ۱", "#009640", "قدس|دفاع مقدس", "شمال - جنوب", ISFAHAN, 10);

    const lines = (await rawQ("SELECT id, terminals FROM lines")) as any[];
    for (const l of lines) {
      const terms = String(l.terminals ?? "")
        .split("|")
        .filter(Boolean);
      for (let i = 0; i < terms.length; i++) {
        await rawRun(
          "INSERT INTO stations (line_id, name, order_index, city_id) VALUES (?,?,?,(SELECT city_id FROM lines WHERE id = ?))",
          [l.id, terms[i], i, l.id]
        );
      }
    }
  }

  const adCount = Number((await rawQ1("SELECT COUNT(*) AS c FROM ads"))?.c ?? 0);
  if (adCount === 0) {
    await rawRun(
      "INSERT INTO ads (title, subtitle, badge, cta_text, advertiser, placement, priority, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      ["بنر نمونه — جای تبلیغ واقعی شما", "فضای این بنر برای تبلیغ کسب‌وکار شما آماده است", "جدید", "مشاهده", "نمونه‌ستان", "home", 5, 0, now()]
    );
  }

  // نمونه‌های راهنما فقط وقتی تنها بنر پیش‌فرض وجود دارد (idempotent)
  const otherAds = Number(
    (await rawQ1("SELECT COUNT(*) AS c FROM ads WHERE title != 'بنر نمونه — جای تبلیغ واقعی شما'"))?.c ?? 0
  );
  if (otherAds === 0) {
    const t = now();
    const plus7 = new Date(Date.now() + 7 * 86400000).toISOString();
    const plus30 = new Date(Date.now() + 30 * 86400000).toISOString();
    await rawRun(
      "INSERT INTO ads (title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, priority, starts_at, ends_at, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        "کارت یک‌بارگذاری مترو تهران",
        "شارژ مستقیم کارت مترو از داخل اپلیکیشن — بدون صف",
        "پیشنهاد ویژه",
        "شارژ کارت",
        "شهر من",
        "",
        "https://example.com/charge",
        "home",
        20,
        t,
        plus30,
        1,
        t,
      ]
    );
    await rawRun(
      "INSERT INTO ads (title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, priority, starts_at, ends_at, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        "گردشگری مشهد — قطار شهری",
        "راهنمای کامل خطوط مترو مشهد برای زائران و مسافران",
        "همکار",
        "مشاهده راهنما",
        "آژانس نور",
        "",
        "https://example.com/mashhad",
        "map",
        10,
        t,
        plus7,
        1,
        t,
      ]
    );
    // آمار روزانه نمونه برای نمایش نمودار گزارش‌ها (۱۴ روز گذشته)
    const ads = (await rawQ("SELECT id FROM ads WHERE is_active = 1")) as any[];
    for (let idx = 0; idx < ads.length; idx++) {
      for (let i = 13; i >= 0; i--) {
        const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const base = 120 + idx * 40 + Math.round(Math.sin(i / 2) * 30) + (13 - i) * 6;
        const imp = Math.max(30, base);
        const clk = Math.max(1, Math.round(imp * (0.02 + 0.015 * idx + Math.abs(Math.cos(i / 3)) * 0.02)));
        await rawRun(
          "INSERT INTO ad_stats_daily (ad_id, day, impressions, clicks) VALUES (?,?,?,?) ON CONFLICT(ad_id, day) DO UPDATE SET impressions = excluded.impressions, clicks = excluded.clicks",
          [ads[idx].id, day, imp, clk]
        );
      }
    }
    await rawRun(
      "UPDATE ads SET impressions = COALESCE((SELECT SUM(impressions) FROM ad_stats_daily WHERE ad_id = ads.id),0), clicks = COALESCE((SELECT SUM(clicks) FROM ad_stats_daily WHERE ad_id = ads.id),0) WHERE title != 'بنر نمونه — جای تبلیغ واقعی شما'"
    );
  }

  const userCount = Number((await rawQ1("SELECT COUNT(*) AS c FROM app_users"))?.c ?? 0);
  if (userCount === 0) {
    const t = now();
    // داده نمونه با برچسب روشن «نمونه» — داده واقعی از نسخه پنل متصل به بک‌اند اصلی پر می‌شود
    const users: [string, string, string, number][] = [
      ["۰۹۱۲۰۰۰۰۰۱", "کاربر نمونه ۱", "active", 12],
      ["۰۹۱۲۰۰۰۰۰۲", "کاربر نمونه ۲", "active", 5],
      ["۰۹۱۲۰۰۰۰۰۳", "کاربر نمونه ۳", "limited", 0],
      ["۰۹۱۲۰۰۰۰۰۴", "کاربر نمونه ۴", "active", 23],
      ["۰۹۱۲۰۰۰۰۰۵", "کاربر نمونه ۵", "disabled", 1],
    ];
    for (const [phone, name, status, trips] of users) {
      await rawRun(
        "INSERT INTO app_users (phone, display_name, status, trips_count, created_at, last_seen) VALUES (?,?,?,?,?,?)",
        [phone, name, status, trips, t, t]
      );
    }
  }

  const lexCount = Number((await rawQ1("SELECT COUNT(*) AS c FROM voice_lexicon"))?.c ?? 0);
  if (lexCount === 0) {
    const words: [string, string, number][] = [
      ["تجریش", "تجریش", 10],
      ["کهریزک", "کهریزک", 10],
      ["صادقیه", "صادقیه", 10],
      ["ولنجک", "ولنجک", 8],
      ["میلاد", "بیمارستان میلاد", 6],
    ];
    for (const [spoken, written, priority] of words) {
      await rawRun("INSERT INTO voice_lexicon (spoken, written, priority) VALUES (?,?,?)", [spoken, written, priority]);
    }
  }

  // کلیدهای تنظیمات جدید — افزوده شدن حتی اگر جدول قبلاً پر شده باشد (idempotent)
  const ensureSetting = async (key: string, value: string) => {
    const exists = await rawQ1("SELECT key FROM settings WHERE key = ?", [key]);
    if (!exists) {
      await rawRun("INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)", [key, value, now()]);
    }
  };
  await ensureSetting("ads_rotation_seconds", "6");
  await ensureSetting("max_ads_per_placement", "3");
  await ensureSetting("support_phone", "۰۲۱-۹۶۳۰۰۰۰۰");
  await ensureSetting("force_update_version", "");
  await ensureSetting("store_link", "https://cafebazaar.ir/app/ir.metrojo.app");
  await ensureSetting("default_city", "تهران");
  await ensureSetting("cloud_api_url", "");
  await ensureSetting("cloud_sync_key", "darmasir-sync-1404");
  /* نشانی عمومی سرور اپ — مقصد دوم همگام‌سازی کاربر/فعالیت اپ اندروید (مستقیم به Turso) */
  await ensureSetting("app_server_url", "");
  /* تنظیمات ایمیل (SMTP) — برای اطلاع تیکت جدید به مدیر و ارسال پاسخ تیکت به کاربر */
  await ensureSetting("smtp_host", "");
  await ensureSetting("smtp_port", "587");
  await ensureSetting("smtp_user", "");
  await ensureSetting("smtp_pass", "");
  await ensureSetting("smtp_from", "");
  await ensureSetting("admin_email", "");

  /* اتصال خودکار داده‌های قدیمی به شهرها — فقط وقتی خط بی‌شهر وجود دارد (idempotent) */
  const unassignedLines = Number(
    (await rawQ1("SELECT COUNT(*) AS c FROM lines WHERE city_id IS NULL"))?.c ?? 0
  );
  if (unassignedLines > 0) {
    const map: Record<string, number | null> = {};
    for (const c of (await rawQ("SELECT id, name FROM cities")) as any[]) {
      map[c.name] = Number(c.id);
    }
    const detect = (name: string) => {
      if (name.includes("کرج")) return map["کرج"];
      if (name.includes("مشهد")) return map["مشهد"];
      if (name.includes("اصفهان")) return map["اصفهان"];
      if (name.includes("شیراز")) return map["شیراز"];
      if (name.includes("تبریز")) return map["تبریز"];
      return map["تهران"]; // پیش‌فرض: تهران
    };
    const lines = (await rawQ("SELECT id, name FROM lines WHERE city_id IS NULL")) as any[];
    for (const l of lines) {
      await rawRun("UPDATE lines SET city_id = ? WHERE id = ?", [detect(l.name), l.id]);
    }
    await rawRun(
      "UPDATE stations SET city_id = (SELECT l.city_id FROM lines l WHERE l.id = stations.line_id) WHERE city_id IS NULL"
    );
  }
}

/* ---------------- راه‌اندازی یک‌باره (idempotent) ---------------- */

let readyPromise: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (DB_BACKEND === "turso") {
        console.log("[darmasir-admin] backend = Turso (libSQL ابری) —", TURSO_HTTP);
      } else {
        console.log("[darmasir-admin] backend = SQLite محلی (فالبک توسعه)");
      }
      await rawExec(DDL);
      await migrateColumns();
      await seed();
    })().catch((e) => {
      readyPromise = null; // اجازه تلاش دوباره در فراخوانی بعدی
      throw e;
    });
  }
  return readyPromise;
}

/* ---------------- کمکی‌های لاگ ---------------- */

/** آمار فراخوانی API (fire-and-forget — هرگز جریان اصلی را نمی‌شکند) */
export function bumpApiStats(): void {
  const day = new Date().toISOString().slice(0, 10);
  run("INSERT INTO api_stats (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1", [
    day,
  ]).catch((e) => console.error("[db] api_stats:", e?.message ?? e));
}

export function audit(
  adminId: number | null,
  adminName: string,
  action: string,
  details?: string,
  ip?: string
): void {
  run(
    "INSERT INTO audit_log (admin_id, admin_name, action, details, ip, created_at) VALUES (?,?,?,?,?,?)",
    [adminId, adminName, action, details ?? null, ip ?? null, now()]
  ).catch((e) => console.error("[db] audit:", e?.message ?? e));
}

export function changeLog(
  entity: string,
  entityId: number | null,
  action: string,
  adminName: string,
  details?: string
): void {
  run(
    "INSERT INTO change_log (entity, entity_id, action, admin_name, details, created_at) VALUES (?,?,?,?,?,?)",
    [entity, entityId, action, adminName, details ?? null, now()]
  ).catch((e) => console.error("[db] change_log:", e?.message ?? e));
}
