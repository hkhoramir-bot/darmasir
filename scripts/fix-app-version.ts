/* ============================================================
   اصلاح یک‌باره: هم‌ترازسازی app_version پنل با نسخه واقعی APK
   • UPDATE settings.app_version → 4.8.21 در دیتابیس پنل
   • پوش کامل محتوا به ورکر ابری (مثل cloudPublishContent پنل)
   • تأیید: GET /api/v1/public/content باید 4.8.21 برگرداند
   اجرا: bun run scripts/fix-app-version.ts
   ============================================================ */
import { Database } from "bun:sqlite";

const DB_PATH = "mini-services/darmasir-admin/data/admin.db";
const TARGET_VERSION = process.argv[2] || "4.8.21";

const db = new Database(DB_PATH); // read-write — WAL اجازه نوشتن هم‌زمان با پنل را می‌دهد

/* ---------- ۱) آپدیت نسخه ---------- */
const cur = db
  .query("SELECT value FROM settings WHERE key = 'app_version'")
  .get() as { value?: string } | null;
console.log("app_version فعلی:", cur?.value ?? "(نامشخص)");

if (cur?.value !== TARGET_VERSION) {
  db.query(
    "INSERT INTO settings (key, value) VALUES ('app_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(TARGET_VERSION);
  console.log("app_version →", TARGET_VERSION);
} else {
  console.log("app_version از قبل درست است");
}

/* ---------- ۲) خواندن کل محتوا (مطابق readFullContent پنل) ---------- */
const adsMasterOff = (() => {
  const r = db
    .query("SELECT value FROM settings WHERE key = 'ads_enabled'")
    .get() as { value?: string } | null;
  const v = String(r?.value ?? "on").trim();
  return v === "off" || v === "0" || v === "false";
})();

const cities = db
  .query("SELECT id, name, is_active, sort FROM cities ORDER BY sort, id")
  .all();
const lines = db
  .query(
    "SELECT id, city_id, mode, number, name, color, terminals, direction, is_active, sort FROM lines ORDER BY city_id, sort, id"
  )
  .all();
const stations = db
  .query(
    "SELECT id, line_id, name, lat, lng, city_id, order_index, is_active FROM stations ORDER BY line_id, order_index, id"
  )
  .all();
const ads = adsMasterOff
  ? []
  : db
      .query(
        "SELECT id, title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, starts_at, ends_at, is_active, priority FROM ads ORDER BY id"
      )
      .all();
const lexicon = db
  .query("SELECT spoken, written, priority FROM voice_lexicon ORDER BY id")
  .all();
const settings: Record<string, string> = {};
for (const r of db.query("SELECT key, value FROM settings").all() as any[]) {
  const k = String(r.key);
  if (k === "cloud_api_url" || k === "cloud_sync_key") continue;
  settings[k] = String(r.value ?? "");
}

const cloudUrlRow = db
  .query("SELECT value FROM settings WHERE key = 'cloud_api_url'")
  .get() as { value?: string } | null;
const syncKeyRow = db
  .query("SELECT value FROM settings WHERE key = 'cloud_sync_key'")
  .get() as { value?: string } | null;
const cloudUrl = String(cloudUrlRow?.value ?? "")
  .trim()
  .replace(/\/+$/, "");
const syncKey =
  String(syncKeyRow?.value ?? "").trim() || "darmasir-sync-1404";

console.log("شهرها:", cities.length, "| خطوط:", lines.length, "| ایستگاه‌ها:", stations.length, "| بنرها:", ads.length);

/* ---------- ۳) پوش به ورکر ابری ---------- */
if (!cloudUrl) {
  console.error("cloud_api_url خالی است — پوش ابری رد شد");
} else {
  const res = await fetch(`${cloudUrl}/api/v1/public/content/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sync-Key": syncKey },
    body: JSON.stringify({ cities, lines, stations, ads, settings, lexicon }),
    signal: AbortSignal.timeout(15000),
  });
  console.log("sync status:", res.status);
  const j = (await res.json().catch(() => ({}))) as any;
  console.log("sync ok:", j?.ok ?? false, j?.error?.code ?? "");

  /* ---------- ۴) تأیید نهایی ---------- */
  const check = await fetch(`${cloudUrl}/api/v1/public/content`, {
    signal: AbortSignal.timeout(15000),
  });
  const cj = (await check.json().catch(() => ({}))) as any;
  const version =
    cj?.data?.settings?.app_version ?? cj?.content?.settings?.app_version;
  console.log("نسخه ابری پس از sync:", version);
  if (version === TARGET_VERSION) console.log("✅ موفق — اپ موبایل حالا", TARGET_VERSION, "نشان می‌دهد");
  else console.error("❌ نسخه ابری هنوز:", version);
}

db.close();
