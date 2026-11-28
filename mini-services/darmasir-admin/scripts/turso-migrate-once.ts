/**
 * مهاجرت یک‌بارهٔ هر دو پایگاه محلی → Turso (libSQL ابری)
 *   ۱) پنل مدیریت: mini-services/darmasir-admin/data/admin.db  → جداول پنل
 *   ۲) اپ اصلی:    db/custom.db                                → جداول Prisma اپ
 *
 * فایل‌های snapshot از قبل ساخته شده‌اند (VACUUM INTO) تا با WAL سازگار باشد.
 * اجرا:
 *   TURSO_DATABASE_URL=libsql://darmasir-darmasir.turso.io \
 *   TURSO_AUTH_TOKEN=<token> \
 *   bun scripts/turso-migrate-once.ts
 *
 * idempotent است — اجرای دوباره بی‌خطر (CREATE IF NOT EXISTS + INSERT OR REPLACE)
 */
import { Database } from "bun:sqlite";

const RAW_URL = (process.env.TURSO_DATABASE_URL || "").trim();
const TOKEN = (process.env.TURSO_AUTH_TOKEN || "").trim();
if (!RAW_URL || !TOKEN) {
  console.error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN تنظیم نشده است");
  process.exit(1);
}
const HTTP = RAW_URL.replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");

/* ---------------- کلاینت Hrana v2 (بدون وابستگی) ---------------- */

/** Hrana: مقدار صحیح باید به‌صورت رشته ارسال شود (دقت i64) و null هم تایپ‌دار است */
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
    case "blob": return Buffer.from(v.base64 ?? "", "base64");
    default: return v.value ?? null;
  }
}

interface Stmt {
  sql: string;
  args?: any[];
}

async function pipeline(stmts: Stmt[]): Promise<void> {
  // هر فراخوانی pipeline اتصال تازه می‌سازد — PRAGMA برای کل این دسته اعمال می‌شود
  // (ترتیب درج جدول‌ها می‌تواند وابستگی FK را نقض کند؛ هنگام بارگذاری اولیه FK خاموش)
  const all: Stmt[] = [{ sql: "PRAGMA foreign_keys = OFF" }, ...stmts];
  const body = {
    requests: [
      ...all.map((s) => ({ type: "execute", stmt: { sql: s.sql, args: (s.args ?? []).map(encArg) } })),
      { type: "close" },
    ],
  };
  const res = await fetch(`${HTTP}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Turso HTTP ${res.status} — ${txt.slice(0, 400)} — first sql: ${stmts[0]?.sql?.slice(0, 80)}`);
  }
  const j: any = await res.json();
  for (let i = 0; i < all.length; i++) {
    const r = j?.results?.[i];
    if (!r || r.type !== "ok")
      throw new Error(`stmt ${i} failed: ${r?.error?.message ?? "unknown"} — ${all[i].sql.slice(0, 100)}`);
  }
}

/** کوئری خواندنی که سطرها را برمی‌گرداند */
async function select(sql: string, args: any[] = []): Promise<{ cols: string[]; rows: any[][] }> {
  const body = {
    requests: [
      { type: "execute", stmt: { sql, args: args.map(encArg) } },
      { type: "close" },
    ],
  };
  const res = await fetch(`${HTTP}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}`);
  const j: any = await res.json();
  const r = j?.results?.[0];
  if (!r || r.type !== "ok") throw new Error(`select failed: ${r?.error?.message ?? "?"}`);
  const result = r.response?.result ?? {};
  const cols: string[] = (result.cols ?? []).map((c: any) => c.name);
  const rows = (result.rows ?? []).map((row: any) => row.map((v: any) => decVal(v)));
  return { cols, rows };
}

/* ---------------- مهاجرت ---------------- */

const CHUNK = 30;

async function migrateDb(label: string, snapshotPath: string, prelude: Stmt[] = []) {
  console.log(`\n===== ${label} (${snapshotPath}) =====`);
  const db = new Database(snapshotPath, { readonly: true });
  if (prelude.length) await pipeline(prelude); // پاک‌سازی جدول‌های آزمایشی و غیره

  // ۱) DDL جداول و ایندکس‌ها (به‌ترتیب sqlite_master)
  const ddlRows = db
    .query(
      "SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid"
    )
    .all() as any[];

  const ddl = ddlRows.map((r) => {
    let s = String(r.sql);
    if (r.type === "table") s = s.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ");
    else s = s.replace(/^CREATE (UNIQUE )?INDEX\s+/i, "CREATE $1INDEX IF NOT EXISTS ");
    return { sql: s };
  });
  console.log(`objects: ${ddl.length} (tables+indexes)`);

  for (let i = 0; i < ddl.length; i += CHUNK) {
    await pipeline(ddl.slice(i, i + CHUNK));
  }
  console.log("schema created ✓");

  // ۲) کپی داده‌ها
  const tables = ddlRows.filter((r) => r.type === "table").map((r) => String(r.name));
  const summary: string[] = [];
  for (const t of tables) {
    const cols = (db.query(`PRAGMA table_info("${t}")`).all() as any[]).map((c) => c.name);
    const rows = db.query(`SELECT * FROM "${t}"`).all() as any[];
    if (rows.length === 0) {
      summary.push(`${t}: 0`);
      continue;
    }
    const colList = cols.map((c) => `"${c}"`).join(", ");
    const placeholders = cols.map(() => "?").join(", ");
    const stmts: Stmt[] = rows.map((row) => ({
      sql: `INSERT OR REPLACE INTO "${t}" (${colList}) VALUES (${placeholders})`,
      args: cols.map((c) => (row[c] === undefined ? null : row[c])),
    }));
    for (let i = 0; i < stmts.length; i += CHUNK) {
      await pipeline(stmts.slice(i, i + CHUNK));
    }
    summary.push(`${t}: ${rows.length}`);
  }
  console.log(summary.join("\n"));

  // ۳) راستی‌آزمایی تعداد سطرها
  console.log("--- verify ---");
  let allOk = true;
  for (const t of tables) {
    const local = (db.query(`SELECT COUNT(*) AS c FROM "${t}"`).get() as any).c;
    const remote = await select(`SELECT COUNT(*) AS c FROM "${t}"`);
    const rc = Number(remote.rows[0]?.[0] ?? 0);
    const ok = rc >= local;
    if (!ok) allOk = false;
    console.log(`  ${t}: local=${local} turso=${rc} ${ok ? "✓" : "✗ MISMATCH"}`);
  }
  db.close();
  return allOk;
}

const ok1 = await migrateDb("پنل مدیریت", "/tmp/turso-mig/admin-snapshot.db", [
  { sql: "DROP TABLE IF EXISTS \"__probe\"" },
]);
const ok2 = await migrateDb("اپ اصلی (Prisma)", "/tmp/turso-mig/main-snapshot.db");

console.log(`\n${ok1 && ok2 ? "همه‌چیز با موفقیت به Turso منتقل شد ✓" : "خطا در مهاجرت ✗"}`);
if (!(ok1 && ok2)) process.exit(1);
