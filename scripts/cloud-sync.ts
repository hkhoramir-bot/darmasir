/**
 * cloud-sync.ts — پوش کامل محتوا و تنظیمات پنل به ورکر ابری
 *
 * کپی دقیق readFullContent از mini-services/darmasir-admin/src/api.ts
 * هدف: بازسازی KV ابری بعد از هر گم‌شدگی (اسنپ‌شات/خطا) به‌صورت خودکار.
 *
 * اجرا:  bun scripts/cloud-sync.ts
 */
import { Database } from "bun:sqlite";

const DB_PATH = "mini-services/darmasir-admin/data/admin.db";
const CLOUD_URL_DEFAULT = "https://dataid.hurremmed.ir";
const SYNC_KEY_DEFAULT = "darmasir-sync-1404";

const db = new Database(DB_PATH, { readonly: true });

const q = (sql: string) => db.query(sql).all() as any[];

const adsMasterOff = () => {
  const row = q(`SELECT value FROM settings WHERE key = 'ads_enabled'`)[0];
  const v = String(row?.value ?? "on").trim();
  return v === "off" || v === "0" || v === "false";
};

/* ---------------- خواندن کامل محتوا (مشابه پنل) ---------------- */
const cities = q(`SELECT id, name, is_active, sort FROM cities ORDER BY sort, id`);
const lines = q(`SELECT id, city_id, mode, number, name, color, terminals, direction, is_active, sort FROM lines ORDER BY city_id, sort, id`);
const stations = q(`SELECT id, line_id, name, lat, lng, city_id, order_index, is_active FROM stations ORDER BY line_id, order_index, id`);
const ads = adsMasterOff()
  ? []
  : q(`SELECT id, title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, starts_at, ends_at, is_active, priority FROM ads ORDER BY id`);
const lexicon = q(`SELECT spoken, written, priority FROM voice_lexicon ORDER BY id`);

const settings: Record<string, string> = {};
for (const r of q(`SELECT key, value FROM settings`)) {
  const k = String(r.key);
  if (k === "cloud_api_url" || k === "cloud_sync_key") continue;
  settings[k] = String(r.value ?? "");
}

const cloudUrlRow = q(`SELECT value FROM settings WHERE key = 'cloud_api_url'`)[0];
const cloudKeyRow = q(`SELECT value FROM settings WHERE key = 'cloud_sync_key'`)[0];
const cloudUrl = String(cloudUrlRow?.value ?? "").trim().replace(/\/+$/, "") || CLOUD_URL_DEFAULT;
const syncKey = String(cloudKeyRow?.value ?? "").trim() || SYNC_KEY_DEFAULT;

db.close();

const payload = { cities, lines, stations, ads, settings, lexicon };

console.log(`[cloud-sync] cities=${cities.length} lines=${lines.length} stations=${stations.length} ads=${ads.length} lexicon=${lexicon.length} settings=${Object.keys(settings).length}`);
console.log(`[cloud-sync] app_version در پیلو = ${settings.app_version ?? "(موجود نیست!)"}`);

if (!settings.app_version) {
  console.error("[cloud-sync] خطا: app_version در DB پنل تنظیم نشده — پوش لغو شد تا نسخه خالی اپلود نشود");
  process.exit(1);
}

/* ---------------- پوش به ورکر ---------------- */
const res = await fetch(`${cloudUrl}/api/v1/public/content/sync`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Sync-Key": syncKey },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(15000),
});

const body = await res.json().catch(() => ({}));
if (res.ok && (body as any)?.ok) {
  console.log(`[cloud-sync] ✓ موفق: ${JSON.stringify((body as any).data?.synced)} at ${(body as any).data?.at}`);

  /* تایید پس از پوش — پاسخ ورکر در قالب {ok, data} پیچیده می‌شود */
  await new Promise((r) => setTimeout(r, 1500));
  const check = await fetch(`${cloudUrl}/api/v1/public/content`, { signal: AbortSignal.timeout(15000) });
  const resJson: any = await check.json().catch(() => ({}));
  const data = resJson?.data ?? resJson;
  const remoteVersion = data?.settings?.app_version;
  const remoteCities = (data?.cities ?? []).length;
  console.log(`[cloud-sync] تایید ابری: app_version=${remoteVersion} cities=${remoteCities} last_sync=${data?.last_content_sync}`);
  if (remoteVersion !== settings.app_version) {
    console.error(`[cloud-sync] ✗ عدم تطابق نسخه ابری (${remoteVersion}) با پنل (${settings.app_version})`);
    process.exit(2);
  }
  console.log(`[cloud-sync] ✓ نسخه ابری با پنل MATCH است: ${remoteVersion}`);
} else {
  console.error(`[cloud-sync] ✗ پوش ناموفق: HTTP ${res.status}`, body);
  process.exit(3);
}
