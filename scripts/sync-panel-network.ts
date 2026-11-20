/* ============================================================
   همگام‌سازی داده واقعی شبکه مترو در دیتابیس پنل مدیریت درمسیر
   — منبع داده: هسته رسمی اپ (src/lib/metro-data.ts + station-geo.ts)
   — مقصد: mini-services/darmasir-admin/data/admin.db (SQLite رایگان)
   اجرا: bun run scripts/sync-panel-network.ts
   Idempotent — هر بار اجرا وضعیت را با داده واقعی اپ هماهنگ می‌کند.
   ============================================================ */
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { CITIES, LINES, stationsOfLine } from "../src/lib/metro-data";
import { STATION_GEO } from "../src/lib/station-geo";

const PANEL_DB = join(import.meta.dir, "..", "mini-services", "darmasir-admin", "data", "admin.db");

const db = new Database(PANEL_DB);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 8000;");
db.exec("PRAGMA foreign_keys = ON;");

const now = () => new Date().toISOString();

/* نگاشت شناسه شهر اپ → نام شهر در پنل */
const CITY_NAME: Record<string, string> = {
  tehran: "تهران",
  karaj: "کرج",
  mashhad: "مشهد",
  isfahan: "اصفهان",
};

const cityIdInPanel = (name: string): number | null => {
  const row = db.query("SELECT id FROM cities WHERE name = ?").get(name) as any;
  return row?.id ?? null;
};

/* ---------------- 1) خطوط: هماهنگ کردن نام/رنگ/ترمینال/جهت با داده واقعی ---------------- */
let linesUpdated = 0;
let linesCreated = 0;
const panelLineIdByAppLine = new Map<string, number>();

for (const line of LINES) {
  const cityName = CITY_NAME[line.cityId];
  const cityId = cityIdInPanel(cityName);
  if (!cityId) {
    console.warn(`? شهر «${cityName}» در پنل نیست — خط ${line.name} رد شد`);
    continue;
  }
  const terminals = `${line.terminals[0]}|${line.terminals[1]}`;
  const existing = db
    .query("SELECT id FROM lines WHERE city_id = ? AND mode = 'metro' AND number = ? ORDER BY id LIMIT 1")
    .get(cityId, line.number) as any;

  let panelLineId: number;
  if (existing) {
    db.prepare(
      "UPDATE lines SET name = ?, color = ?, terminals = ?, direction = ?, is_active = 1 WHERE id = ?"
    ).run(line.name, line.color, terminals, line.direction, existing.id);
    panelLineId = existing.id;
    linesUpdated++;
  } else {
    const r = db
      .prepare(
        "INSERT INTO lines (mode, number, name, color, terminals, direction, city_id, is_active, sort) VALUES ('metro',?,?,?,?,?,?,1,?)"
      )
      .run(line.number, line.name, line.color, terminals, line.direction, cityId, line.number - 1);
    panelLineId = Number(r.lastInsertRowid);
    linesCreated++;
  }
  panelLineIdByAppLine.set(line.id, panelLineId);
}

/* ---------------- 2) ایستگاه‌ها: جایگزینی فهرست فقط-ترمینال با شبکه واقعی کامل ---------------- */
/* ایستگاه‌های فعلی پنل فقط دو ترمینال هر خط بودند (seed اولیه) — با شبکه کامل واقعی جایگزین می‌شوند */
let stationsDeleted = 0;
let stationsInserted = 0;
let stationsWithGeo = 0;

const knownLineIds = new Set<number>();
for (const pid of panelLineIdByAppLine.values()) knownLineIds.add(pid);

for (const [, panelLineId] of panelLineIdByAppLine) {
  const del = db.prepare("DELETE FROM stations WHERE line_id = ?").run(panelLineId);
  stationsDeleted += del.changes;
}

const insStation = db.prepare(
  "INSERT INTO stations (line_id, name, lat, lng, city_id, order_index, is_active) VALUES (?,?,?,?,?,?,1)"
);

for (const line of LINES) {
  const panelLineId = panelLineIdByAppLine.get(line.id);
  if (!panelLineId) continue;
  const cityName = CITY_NAME[line.cityId];
  const cityId = cityIdInPanel(cityName);
  const stations = stationsOfLine(line.id); // مرتب بر اساس ترتیب واقعی ایستگاه‌ها روی خط
  stations.forEach((st, idx) => {
    const geo = STATION_GEO[st.id] ?? null;
    insStation.run(panelLineId, st.name, geo?.[0] ?? null, geo?.[1] ?? null, cityId, idx);
    stationsInserted++;
    if (geo) stationsWithGeo++;
  });
}

/* ---------------- 3) پاک‌سازی داده‌های نمونه — همه موارد باید واقعی باشند ---------------- */
/* شهرهای دارای شبکه واقعی در اپ فعال می‌شوند؛ شهرهای بدون شبکه (شیراز/تبریز) غیرفعال می‌مانند */
const activateCity = db.prepare("UPDATE cities SET is_active = 1 WHERE name = ?");
["تهران", "کرج", "مشهد", "اصفهان"].forEach((n) => activateCity.run(n));

const delSampleUsers = db.prepare("DELETE FROM app_users WHERE display_name LIKE 'کاربر نمونه%'").run();
const delPlaceholderAd = db
  .prepare("DELETE FROM ads WHERE title = 'بنر نمونه — جای تبلیغ واقعی شما'")
  .run();
/* لینک بنرهای کمپین → مقصدهای واقعی */
db.prepare("UPDATE ads SET link_url = ? WHERE title LIKE ?").run(
  "https://cafebazaar.ir/app/ir.metrojo.app",
  "%کارت یک‌بارگذاری%"
);
db.prepare("UPDATE ads SET link_url = ? WHERE title LIKE ?").run(
  "https://fa.wikipedia.org/wiki/%D9%85%D8%AA%D8%B1%D9%88%DB%8C_%D9%85%D8%B4%D9%87%D8%AF",
  "%مشهد%"
);

/* ---------------- 4) گزارش ---------------- */
const count = (table: string) => (db.query(`SELECT COUNT(*) AS c FROM ${table}`).get() as any).c;
const geoCount = (db.query("SELECT COUNT(*) AS c FROM stations WHERE lat IS NOT NULL").get() as any).c;

console.log("── همگام‌سازی پنل با داده واقعی اپ ──");
console.log(`خطوط: ${linesUpdated} بروزرسانی، ${linesCreated} جدید`);
console.log(`ایستگاه‌ها: ${stationsDeleted} قدیمی حذف، ${stationsInserted} واقعی درج شد (مختصات: ${stationsWithGeo})`);
console.log(`پاک‌سازی: ${delSampleUsers.changes} کاربر نمونه، ${delPlaceholderAd.changes} بنر نمونه`);
console.log(`وضعیت پنل: ${count("cities")} شهر، ${count("lines")} خط، ${count("stations")} ایستگاه (${geoCount} با مختصات)، ${count("ads")} بنر، ${count("app_users")} کاربر`);

db.close();
