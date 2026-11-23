/* ============================================================
   مهاجرت دیتابیس درمسیر از Cloudflare D1 به Turso (libSQL)
   ------------------------------------------------------------
   اجرا:
     bunx tsx scripts/migrate-d1-to-turso.ts
   نیازمندی (.env):
     CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN + CLOUDFLARE_D1_DATABASE_ID  (منبع)
     TURSO_DATABASE_URL + TURSO_AUTH_TOKEN                                     (مقصد)

   کارها:
     ۱) ساخت همه جداول و ایندکس‌ها در Turso (اسکیمای دقیق D1)
     ۲) کپی همه ردیف‌ها با INSERT OR IGNORE (مهاجرت قابل اجرای مجدد)
     ۳) مقایسه شمارش ردیف‌ها — گزارش نهایی
   ============================================================ */

import { readFileSync } from "node:fs";

/* ---------- env ---------- */

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* .env نبود — فقط از env سیستم */
  }
}
loadEnv();

const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const CF_DB_ID = process.env.CLOUDFLARE_D1_DATABASE_ID || "";

const TURSO_RAW = (process.env.TURSO_DATABASE_URL || "").trim();
const TURSO_TOKEN = (process.env.TURSO_AUTH_TOKEN || "").trim();

if (!CF_ACCOUNT || !CF_TOKEN || !CF_DB_ID) {
  console.error("خطا: متغیرهای Cloudflare (منبع) تنظیم نشده‌اند");
  process.exit(1);
}
if (!TURSO_RAW || !TURSO_TOKEN) {
  console.error("خطا: TURSO_DATABASE_URL و TURSO_AUTH_TOKEN تنظیم نشده‌اند");
  process.exit(1);
}

const TURSO_URL = TURSO_RAW.startsWith("libsql://")
  ? `https://${TURSO_RAW.slice("libsql://".length)}`.replace(/\/+$/, "")
  : TURSO_RAW.replace(/\/+$/, "");

/* ---------- کلاینت‌ها ---------- */

async function d1Query(sql: string, params: any[] = []): Promise<any[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${CF_DB_ID}/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${CF_TOKEN}` },
      body: JSON.stringify({ sql, params }),
    }
  );
  const json: any = await res.json().catch(() => null);
  if (!json?.success) throw new Error(`D1: ${JSON.stringify(json?.errors ?? json)}`);
  return json.result?.[0]?.results ?? [];
}

function tursoArg(v: any): any {
  if (v instanceof Date) return { type: "integer", value: v.getTime() };
  if (typeof v === "boolean") return { type: "integer", value: v ? 1 : 0 };
  if (v === undefined) return null;
  if (typeof v === "bigint") return { type: "text", value: v.toString() };
  if (typeof v === "number")
    return Number.isInteger(v) ? { type: "integer", value: v } : { type: "float", value: v };
  return v;
}

type PipeItem =
  | { type: "error"; error: { message: string } }
  | { type: "ok"; response: { result: any } };

async function tursoPipeline(
  stmts: { sql: string; args?: any[] }[]
): Promise<PipeItem[]> {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TURSO_TOKEN}` },
    body: JSON.stringify({
      requests: [
        ...stmts.map((s) => ({ type: "execute", stmt: { sql: s.sql, args: (s.args ?? []).map(tursoArg) } })),
        { type: "close" },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json: any = await res.json().catch(() => null);
  if (!json?.results) throw new Error(`Turso پاسخ نامعتبر: ${JSON.stringify(json).slice(0, 300)}`);
  const out: PipeItem[] = json.results.slice(0, stmts.length);
  for (const r of out) {
    if (r.type === "error") throw new Error(`Turso: ${r.error?.message ?? "error"}`);
  }
  return out;
}

/* ---------- جداول (ترتیب مهم است — User قبل از Session) ---------- */

const TABLES = [
  "User",
  "Session",
  "OtpCode",
  "Favorite",
  "DailyRoute",
  "TripHistory",
  "SupportTicket",
  "AppUserTrip",
  "AppUserFavorite",
  "AppUserDailyRoute",
];

const SCHEMA: { sql: string }[] = [
  { sql: `CREATE TABLE IF NOT EXISTS "User" ("id" TEXT PRIMARY KEY NOT NULL, "name" TEXT NOT NULL, "phone" TEXT, "email" TEXT, "passwordHash" TEXT, "status" TEXT NOT NULL DEFAULT 'active', "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastLoginAt" TEXT)` },
  { sql: `CREATE TABLE IF NOT EXISTS "Session" ("id" TEXT PRIMARY KEY NOT NULL, "token" TEXT NOT NULL, "userId" TEXT NOT NULL, "device" TEXT NOT NULL DEFAULT 'web', "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TEXT NOT NULL, FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE)` },
  { sql: `CREATE TABLE IF NOT EXISTS "OtpCode" ("id" TEXT PRIMARY KEY NOT NULL, "phone" TEXT NOT NULL, "code" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, "used" INTEGER NOT NULL DEFAULT 0, "expiresAt" TEXT NOT NULL, "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { sql: `CREATE TABLE IF NOT EXISTS "Favorite" ("id" TEXT PRIMARY KEY NOT NULL, "stationId" TEXT NOT NULL, "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { sql: `CREATE TABLE IF NOT EXISTS "DailyRoute" ("id" TEXT PRIMARY KEY NOT NULL, "kind" TEXT NOT NULL, "label" TEXT NOT NULL, "fromStationId" TEXT NOT NULL, "toStationId" TEXT NOT NULL, "fromName" TEXT NOT NULL, "toName" TEXT NOT NULL, "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { sql: `CREATE TABLE IF NOT EXISTS "TripHistory" ("id" TEXT PRIMARY KEY NOT NULL, "fromStationId" TEXT NOT NULL, "fromName" TEXT NOT NULL, "toStationId" TEXT NOT NULL, "toName" TEXT NOT NULL, "minutes" INTEGER NOT NULL, "transfers" INTEGER NOT NULL, "fare" INTEGER NOT NULL, "pref" TEXT NOT NULL DEFAULT 'fastest', "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { sql: `CREATE TABLE IF NOT EXISTS "SupportTicket" ("id" TEXT PRIMARY KEY NOT NULL, "name" TEXT NOT NULL, "contact" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT 'general', "subject" TEXT NOT NULL, "message" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'open', "reply" TEXT, "repliedAt" TEXT, "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { sql: `CREATE TABLE IF NOT EXISTS "AppUserTrip" ("id" TEXT PRIMARY KEY NOT NULL, "identifier" TEXT NOT NULL, "fromName" TEXT NOT NULL, "toName" TEXT NOT NULL, "minutes" INTEGER NOT NULL DEFAULT 0, "transfers" INTEGER NOT NULL DEFAULT 0, "fare" INTEGER NOT NULL DEFAULT 0, "createdAt" TEXT NOT NULL)` },
  { sql: `CREATE TABLE IF NOT EXISTS "AppUserFavorite" ("id" TEXT PRIMARY KEY NOT NULL, "identifier" TEXT NOT NULL, "stationId" TEXT NOT NULL, "stationName" TEXT NOT NULL DEFAULT '', "createdAt" TEXT NOT NULL)` },
  { sql: `CREATE TABLE IF NOT EXISTS "AppUserDailyRoute" ("id" TEXT PRIMARY KEY NOT NULL, "identifier" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'custom', "label" TEXT NOT NULL DEFAULT '', "fromName" TEXT NOT NULL, "toName" TEXT NOT NULL, "createdAt" TEXT NOT NULL)` },
  { sql: `CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User" ("phone")` },
  { sql: `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User" ("email")` },
  { sql: `CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session" ("token")` },
  { sql: `CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session" ("userId")` },
  { sql: `CREATE INDEX IF NOT EXISTS "OtpCode_phone_idx" ON "OtpCode" ("phone")` },
  { sql: `CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_stationId_key" ON "Favorite" ("stationId")` },
  { sql: `CREATE INDEX IF NOT EXISTS "AppUserTrip_identifier_idx" ON "AppUserTrip" ("identifier")` },
  { sql: `CREATE UNIQUE INDEX IF NOT EXISTS "AppUserFavorite_ident_station_key" ON "AppUserFavorite" ("identifier", "stationId")` },
  { sql: `CREATE INDEX IF NOT EXISTS "AppUserDailyRoute_identifier_idx" ON "AppUserDailyRoute" ("identifier")` },
];

/* ---------- مهاجرت ---------- */

async function main() {
  console.log(`مقصد: ${TURSO_URL}`);

  /* ۱) اسکیما */
  await tursoPipeline(SCHEMA.map((s) => ({ sql: s.sql })));
  console.log(`✓ اسکیما ساخته شد (${SCHEMA.length} دستور)`);

  /* ۲) کپی ردیف‌ها */
  const BATCH_STMTS = 40; // تعداد INSERT در هر درخواست pipeline
  const report: { table: string; d1: number; turso: number }[] = [];

  for (const T of TABLES) {
    const rows = await d1Query(`SELECT * FROM "${T}"`);
    let sent = 0;
    for (let i = 0; i < rows.length; i += BATCH_STMTS) {
      const slice = rows.slice(i, i + BATCH_STMTS);
      const stmts = slice.map((r: Record<string, any>) => {
        const cols = Object.keys(r);
        return {
          sql: `INSERT OR IGNORE INTO "${T}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
          args: cols.map((c) => r[c]),
        };
      });
      await tursoPipeline(stmts);
      sent += slice.length;
      process.stdout.write(`  ${T}: ${sent}/${rows.length}\r`);
    }
    const cnt = await tursoPipeline([{ sql: `SELECT COUNT(*) AS c FROM "${T}"` }]);
    const tursoCount = Number(cnt[0]?.response?.result?.rows?.[0]?.value?.[0] ?? 0);
    report.push({ table: T, d1: rows.length, turso: tursoCount });
    console.log(`✓ ${T}: D1=${rows.length} → Turso=${tursoCount}`);
  }

  /* ۳) گزارش */
  console.log("\n──── گزارش نهایی ────");
  let bad = 0;
  for (const r of report) {
    const okFlag = r.d1 === r.turso ? "OK " : "!! ";
    if (r.d1 !== r.turso) bad++;
    console.log(`${okFlag}${r.table.padEnd(18)} D1=${r.d1}\tTurso=${r.turso}`);
  }
  console.log(bad === 0 ? "\nهمه جداول کامل منتقل شدند ✓" : `\n${bad} جدول ناقص است — دوباره اجرا کنید (INSERT OR IGNORE امن است)`);
  process.exit(bad === 0 ? 0 : 2);
}

main().catch((e) => {
  console.error("مهاجرت ناموفق:", e?.message ?? e);
  process.exit(1);
});
