/**
 * پوش یک‌باره کل محتوای پنل به سرور ابری (هم‌شکل cloudPublishContent در api.ts)
 * از لایه دیتابیس مشترک پنل استفاده می‌کند — Turso (ابری) یا SQLite محلی
 * اجرا: bun scripts/push-content-once.ts
 */
import { q, q1 } from "../src/db";

const adsMasterOff = async () => {
  const v = String(
    ((await q1("SELECT value FROM settings WHERE key = 'ads_enabled'", [])) as any)?.value ?? "on"
  ).trim();
  return v === "off" || v === "0" || v === "false";
};

const readFullContent = async () => {
  const cities = await q("SELECT id, name, is_active, sort FROM cities ORDER BY sort, id", []);
  const lines = await q(
    "SELECT id, city_id, mode, number, name, color, terminals, direction, is_active, sort FROM lines ORDER BY city_id, sort, id",
    []
  );
  const stations = await q(
    "SELECT id, line_id, name, lat, lng, city_id, order_index, is_active FROM stations ORDER BY line_id, order_index, id",
    []
  );
  const ads = (await adsMasterOff())
    ? []
    : await q(
        "SELECT id, title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, starts_at, ends_at, is_active, priority FROM ads ORDER BY id",
        []
      );
  const lexicon = await q("SELECT spoken, written, priority FROM voice_lexicon ORDER BY id", []);
  const settings: Record<string, string> = {};
  for (const r of (await q("SELECT key, value FROM settings", [])) as any[]) {
    const k = String(r.key);
    if (k === "cloud_api_url" || k === "cloud_sync_key") continue;
    settings[k] = String(r.value ?? "");
  }
  return { cities, lines, stations, ads, settings, lexicon };
};

const cloudUrl = String(
  ((await q1("SELECT value FROM settings WHERE key = 'cloud_api_url'", [])) as any)?.value ?? ""
)
  .trim()
  .replace(/\/+$/, "");
const key =
  String(((await q1("SELECT value FROM settings WHERE key = 'cloud_sync_key'", [])) as any)?.value ?? "").trim() ||
  "darmasir-sync-1404";

if (!cloudUrl) {
  console.error("cloud_api_url تنظیم نشده است");
  process.exit(1);
}

const payload = JSON.stringify(await readFullContent());
const res = await fetch(`${cloudUrl}/api/v1/public/content/sync`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Sync-Key": key },
  body: payload,
  signal: AbortSignal.timeout(15000),
});
const text = await res.text();
console.log("status:", res.status);
console.log("response:", text.slice(0, 300));
