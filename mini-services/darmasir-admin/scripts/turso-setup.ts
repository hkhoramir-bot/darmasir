// ============================================================
// درمسیر — راه‌اندازی دیتابیس ابری Turso
// این اسکریپت یک‌بار اجرا می‌شود تا:
//   ۱) جداول پنل در دیتابیس Turso ساخته شوند (بر اساس DDL استخراج
//      شده از schema.prisma — سازگار کامل با libSQL)
//   ۲) داده اولیه (مدیران، خطوط/ایستگاه‌های واقعی، نمونه‌ها) ریخته شود
//
// پیش‌نیاز: دیتابیس رایگان در app.turso.tech ساخته شده و URL/Token داشته باشید.
//
// اجرا (از ریشه پنل):
//   TURSO_DATABASE_URL=libsql://<name>-<org>.turso.io \
//   TURSO_AUTH_TOKEN=<token> \
//   bun scripts/turso-setup.ts
//
// تست محلی بدون Turso (فایل):
//   TURSO_DATABASE_URL=file:/tmp/turso-test.db bun scripts/turso-setup.ts
// ============================================================
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve } from "path";
import { seedMain } from "../prisma/seed";
import { db } from "../src/lib/db";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("خطا: TURSO_DATABASE_URL تنظیم نشده است");
  process.exit(1);
}

async function main() {
  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // ---------- ساخت جداول (idempotent) ----------
  const ddl = readFileSync(resolve(__dirname, "../prisma/turso-ddl.sql"), "utf-8");
  // حالت‌های CREATE TABLE / CREATE INDEX به IF NOT EXISTS تبدیل می‌شوند تا
  // اجرای دوباره اسکریپت بی‌خطر باشد
  const ddlSafe = ddl
    .replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "')
    .replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "')
    .replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "');

  console.log("applying DDL (tables + indexes)...");
  await client.executeMultiple(ddlSafe);
  console.log("tables created.");

  // ---------- داده اولیه ----------
  await seedMain();
  console.log("Turso setup complete ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
