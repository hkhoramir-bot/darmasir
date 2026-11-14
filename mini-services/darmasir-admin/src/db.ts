/* ============================================================
   درمسیر — پنل مدیریت | لایه دیتابیس (bun:sqlite — بدون وابستگی خارجی)
   ============================================================ */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { hashPassword } from "./auth";

const DB_DIR = join(import.meta.dir, "..", "data");
mkdirSync(DB_DIR, { recursive: true });

export const db = new Database(join(DB_DIR, "admin.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

/* ------------------------------ Schema ------------------------------ */

db.exec(`
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
CREATE TABLE IF NOT EXISTS lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL DEFAULT 'metro',
  number INTEGER,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#009640',
  terminals TEXT,
  direction TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_id INTEGER NOT NULL REFERENCES lines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat REAL,
  lng REAL,
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
`);

export const now = () => new Date().toISOString();

export function bumpApiStats() {
  const day = new Date().toISOString().slice(0, 10);
  db.prepare(
    "INSERT INTO api_stats (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1"
  ).run(day);
}

export function audit(
  adminId: number | null,
  adminName: string,
  action: string,
  details?: string,
  ip?: string
) {
  db.prepare(
    "INSERT INTO audit_log (admin_id, admin_name, action, details, ip, created_at) VALUES (?,?,?,?,?,?)"
  ).run(adminId, adminName, action, details ?? null, ip ?? null, now());
}

export function changeLog(
  entity: string,
  entityId: number | null,
  action: string,
  adminName: string,
  details?: string
) {
  db.prepare(
    "INSERT INTO change_log (entity, entity_id, action, admin_name, details, created_at) VALUES (?,?,?,?,?,?)"
  ).run(entity, entityId, action, adminName, details ?? null, now());
}

/* ------------------------------ Seed ------------------------------ */

export function seed() {
  const adminCount = (db.query("SELECT COUNT(*) AS c FROM admins").get() as any).c;
  if (adminCount === 0) {
    const ins = db.prepare(
      "INSERT INTO admins (username, password_hash, display_name, role, created_at) VALUES (?,?,?,?,?)"
    );
    ins.run("admin", hashPassword("darmasir1404"), "مدیر کل درمسیر", "super", now());
    ins.run("operator", hashPassword("darmasir1404"), "اپراتور درمسیر", "operator", now());
    ins.run("viewer", hashPassword("darmasir1404"), "ناظر درمسیر", "viewer", now());
  }

  const settingCount = (db.query("SELECT COUNT(*) AS c FROM settings").get() as any).c;
  if (settingCount === 0) {
    const ins = db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)"
    );
    const t = now();
    ins.run("app_name", "درمسیر", t);
    ins.run("app_version", "4.8.17", t);
    ins.run("welcome_message", "سفر خود را با درمسیر آغاز کنید", t);
    ins.run("maintenance_mode", "off", t);
    ins.run("voice_enabled", "on", t);
    ins.run("voice_service", "cloudflare-worker", t);
    ins.run("support_message", "پشتیبانی درمسیر در خدمت شماست", t);
  }

  const lineCount = (db.query("SELECT COUNT(*) AS c FROM lines").get() as any).c;
  if (lineCount === 0) {
    // داده واقعی از هسته داده مترو (src/lib/metro-data.ts)
    const ins = db.prepare(
      "INSERT INTO lines (mode, number, name, color, terminals, direction, is_active, sort) VALUES (?,?,?,?,?,?,1,?)"
    );
    const tehran: [number, string, string, string, string][] = [
      [1, "خط ۱", "#e52421", "کهریزک|تجریش", "شمال - جنوب"],
      [2, "خط ۲", "#15397a", "صادقیه|فرهنگسرا", "شرق - غرب"],
      [3, "خط ۳", "#00a3e0", "آزادگان|قائم", "شمال شرق - جنوب غرب"],
      [4, "خط ۴", "#f6b400", "علامه جعفری|شهید کلاهدوز", "شرق - غرب"],
      [5, "خط ۵", "#009640", "صادقیه|شهید قاسم سلیمانی", "غرب - شمال"],
      [6, "خط ۶", "#d82572", "شهدای دولت‌آباد|شهید آرمان علی‌وردی", "شمال غرب - جنوب شرق"],
      [7, "خط ۷", "#7d2382", "ورزشگاه تختی|میدان کتاب", "شمال - جنوب"],
    ];
    tehran.forEach(([n, name, color, terms, dir], i) =>
      ins.run("metro", n, name, color, terms, dir, i)
    );
    ins.run("metro", 1, "مترو کرج — خط ۱", "#009640", "آیت‌الله طالقانی|چهل‌وپنج متری گلشهر", "غرب - شرق", 7);
    ins.run("metro", 1, "مترو مشهد — خط ۱", "#009640", "وکیل‌آباد|فرودگاه شهید هاشمی‌نژاد", "شمال غرب - جنوب شرق", 8);
    ins.run("metro", 2, "مترو مشهد — خط ۲", "#e52421", "طبرسی|شهید فکوری", "شمال غرب - جنوب شرق", 9);
    ins.run("metro", 1, "مترو اصفهان — خط ۱", "#009640", "قدس|دفاع مقدس", "شمال - جنوب", 10);

    const st = db.prepare(
      "INSERT INTO stations (line_id, name, order_index) VALUES (?,?,?)"
    );
    const rows = db.query("SELECT id, terminals FROM lines").all() as any[];
    for (const r of rows) {
      const terms = (r.terminals ?? "").split("|").filter(Boolean);
      terms.forEach((name: string, i: number) => st.run(r.id, name, i));
    }
  }

  const adCount = (db.query("SELECT COUNT(*) AS c FROM ads").get() as any).c;
  if (adCount === 0) {
    db.prepare(
      "INSERT INTO ads (title, placement, is_active, created_at) VALUES (?,?,0,?)"
    ).run("بنر نمونه — جای تبلیغ واقعی شما", "home", now());
  }

  const userCount = (db.query("SELECT COUNT(*) AS c FROM app_users").get() as any).c;
  if (userCount === 0) {
    const ins = db.prepare(
      "INSERT INTO app_users (phone, display_name, status, trips_count, created_at, last_seen) VALUES (?,?,?,?,?,?)"
    );
    const t = now();
    // داده نمونه با برچسب روشن «نمونه» — داده واقعی از نسخه پنل متصل به بک‌اند اصلی پر می‌شود
    ins.run("۰۹۱۲۰۰۰۰۰۱", "کاربر نمونه ۱", "active", 12, t, t);
    ins.run("۰۹۱۲۰۰۰۰۰۲", "کاربر نمونه ۲", "active", 5, t, t);
    ins.run("۰۹۱۲۰۰۰۰۰۳", "کاربر نمونه ۳", "limited", 0, t, t);
    ins.run("۰۹۱۲۰۰۰۰۰۴", "کاربر نمونه ۴", "active", 23, t, t);
    ins.run("۰۹۱۲۰۰۰۰۰۵", "کاربر نمونه ۵", "disabled", 1, t, t);
  }

  const lexCount = (db.query("SELECT COUNT(*) AS c FROM voice_lexicon").get() as any).c;
  if (lexCount === 0) {
    const ins = db.prepare(
      "INSERT INTO voice_lexicon (spoken, written, priority) VALUES (?,?,?)"
    );
    ins.run("تجریش", "تجریش", 10);
    ins.run("کهریزک", "کهریزک", 10);
    ins.run("صادقیه", "صادقیه", 10);
    ins.run("ولنجک", "ولنجک", 8);
    ins.run("میلاد", "بیمارستان میلاد", 6);
  }
}

seed();
