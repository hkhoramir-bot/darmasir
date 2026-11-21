/* ============================================================
   همگام‌سازی یک‌طرفه پنل → سرور ابری درمسیر (Cloudflare Workers KV)
   اجرا: CLOUD_API_BASE=... bun scripts/sync-panel-to-cloud.ts
   داده‌ها مستقیم از دیتابیس پنل خوانده و به /public/content/sync
   پوش می‌شود؛ سپس با خواندن مجدد صحت‌سنجی می‌شود (MATCH).
   ============================================================ */
import { DatabaseSync } from "node:sqlite";

const PANEL_DB =
  process.env.PANEL_DB?.trim() ||
  "/home/z/my-project/mini-services/darmasir-admin/data/admin.db";
const CLOUD =
  process.env.CLOUD_API_BASE?.trim() ||
  "https://darmasir-api.hkhoramir.workers.dev";
const SYNC_KEY = process.env.DARMASIR_SYNC_KEY?.trim() || "darmasir-sync-1404";

interface Row {
  [k: string]: unknown;
}

const db = new DatabaseSync(PANEL_DB, { readOnly: true });
const all = (sql: string) => db.prepare(sql).all() as Row[];
const num = (v: unknown) => (v == null ? null : Number(v));
const str = (v: unknown) => (v == null ? null : String(v));

const cities = all("SELECT * FROM cities ORDER BY sort, id").map((c) => ({
  id: num(c.id),
  name: str(c.name),
  is_active: num(c.is_active) ?? 1,
  sort: num(c.sort) ?? 0,
}));

const lines = all("SELECT * FROM lines ORDER BY city_id, sort, id").map((l) => ({
  id: num(l.id),
  city_id: num(l.city_id),
  mode: str(l.mode) ?? "metro",
  number: str(l.number),
  name: str(l.name),
  color: str(l.color) ?? "#009640",
  terminals: str(l.terminals),
  direction: str(l.direction),
  is_active: num(l.is_active) ?? 1,
  sort: num(l.sort) ?? 0,
}));

const stations = all(
  "SELECT * FROM stations ORDER BY line_id, order_index, id"
).map((s) => ({
  id: num(s.id),
  line_id: num(s.line_id),
  name: str(s.name),
  lat: num(s.lat),
  lng: num(s.lng),
  city_id: num(s.city_id),
  order_index: num(s.order_index) ?? 0,
  is_active: num(s.is_active) ?? 1,
}));

const ads = all("SELECT * FROM ads ORDER BY id").map((a) => ({
  id: num(a.id),
  title: str(a.title),
  subtitle: str(a.subtitle),
  badge: str(a.badge),
  cta_text: str(a.cta_text),
  advertiser: str(a.advertiser),
  image_url: str(a.image_url),
  link_url: str(a.link_url),
  placement: str(a.placement) ?? "home",
  starts_at: str(a.starts_at),
  ends_at: str(a.ends_at),
  is_active: num(a.is_active) ?? 0,
  priority: num(a.priority) ?? 0,
}));

const lexicon = all("SELECT * FROM voice_lexicon ORDER BY id").map((l) => ({
  spoken: str(l.spoken),
  written: str(l.written),
  priority: num(l.priority) ?? 0,
}));

const settings: Record<string, string> = {};
for (const r of all("SELECT key, value FROM settings")) {
  const k = String(r.key);
  if (k === "cloud_api_url" || k === "cloud_sync_key") continue; // کلیدهای ابری محلی پنل — به ابر پوش نمی‌شوند
  settings[k] = String(r.value ?? "");
}
db.close();

const payload = { cities, lines, stations, ads, settings, lexicon };

async function main() {
  const res = await fetch(`${CLOUD}/api/v1/public/content/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sync-Key": SYNC_KEY },
    body: JSON.stringify(payload),
  });
  const j = (await res.json()) as Record<string, unknown>;
  console.log("push status:", res.status, JSON.stringify(j));

  // صحت‌سنجی با خواندن مجدد (سرور فقط موارد فعال را برمی‌گرداند)
  const activeCities = cities.filter((c) => c.is_active === 1).length;
  const activeLines = lines.filter((l) => l.is_active === 1).length;
  const activeStations = stations.filter((s) => s.is_active === 1).length;
  const activeAds = ads.filter((a) => a.is_active === 1).length;
  const res2 = await fetch(`${CLOUD}/api/v1/public/content`, {
    cache: "no-store",
  });
  const j2 = (await res2.json()) as {
    data?: {
      cities: unknown[];
      lines: unknown[];
      stations: unknown[];
      ads: unknown[];
      lexicon: { spoken: string; written: string }[];
    };
  };
  const d = j2.data;
  const ok =
    d &&
    d.cities.length === activeCities &&
    d.lines.length === activeLines &&
    d.stations.length === activeStations &&
    d.ads.length === activeAds &&
    d.lexicon.length === lexicon.length;
  console.log(
    `verify: cloud cities=${d?.cities.length}/${activeCities} lines=${d?.lines.length}/${activeLines} stations=${d?.stations.length}/${activeStations} ads=${d?.ads.length}/${activeAds} lexicon=${d?.lexicon.length}/${lexicon.length}`
  );
  const sh = d?.lexicon.find((w) => w.written === "شوش");
  console.log("shosh:", JSON.stringify(sh));
  console.log(ok ? "MATCH ✓" : "MISMATCH ✗");
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("sync failed:", e);
  process.exit(1);
});
