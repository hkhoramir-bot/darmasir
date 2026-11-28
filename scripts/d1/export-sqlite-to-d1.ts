/* ============================================================
   خروجی داده‌های SQLite محلی برای ایمپورت به Cloudflare D1
   اجرا: bun scripts/d1/export-sqlite-to-d1.ts
   خروجی: scripts/d1/data.sql
   ============================================================ */

import { Database } from "bun:sqlite";
import { writeFileSync } from "node:fs";

const DB_PATH = process.env.DATABASE_URL?.replace("file:", "") || "/home/z/my-project/db/custom.db";

const TABLES = ["Favorite", "DailyRoute", "TripHistory", "User", "Session", "OtpCode", "SupportTicket"];

const db = new Database(DB_PATH, { readonly: true });

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "bigint") return String(Number(v));
  if (Buffer.isBuffer(v)) return `'${v.toString("hex")}'`;
  // رشته — تاریخ‌ها از Prisma به‌صورت ISO ذخیره شده‌اند و مستقیم منتقل می‌شوند
  return `'${String(v).replace(/'/g, "''")}'`;
}

const lines: string[] = [
  "-- تولید خودکار توسط export-sqlite-to-d1.ts — داده‌های محلی درمسیر",
  "-- اجرا: bunx wrangler d1 execute darmasir-db --remote --file=scripts/d1/data.sql -y",
  "",
];

for (const table of TABLES) {
  // بررسی وجود جدول
  const tbl = db
    .query<{ name: string }, []>(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(table);
  if (!tbl) {
    console.log(`skip ${table} (not found)`);
    continue;
  }
  const rows = db.query<Record<string, unknown>, []>(`SELECT * FROM "${table}"`).all();
  lines.push(`DELETE FROM "${table}";`);
  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = cols.map((c) => sqlValue(row[c]));
    lines.push(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${vals.join(", ")});`);
  }
  lines.push("");
  console.log(`${table}: ${rows.length} rows`);
}

writeFileSync(new URL("./data.sql", import.meta.url), lines.join("\n") + "\n");
console.log("done → scripts/d1/data.sql");
