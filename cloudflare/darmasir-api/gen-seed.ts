/* ============================================================
   تبدیل seed-data.json پنل به SQL برای D1
   اجرا:  bun cloudflare/darmasir-api/gen-seed.ts
   خروجی: cloudflare/darmasir-api/seed.sql
   ============================================================ */

import { readFileSync, writeFileSync } from "fs";

const SRC =
  "/home/z/my-project/mini-services/darmasir-admin/prisma/seed-data.json";
const OUT = "/home/z/my-project/cloudflare/darmasir-api/seed.sql";

const data = JSON.parse(readFileSync(SRC, "utf8")) as {
  lines: Record<string, unknown>[];
  stations: Record<string, unknown>[];
};

function q(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}

const stmts: string[] = [];
stmts.push("-- تولیدشده از seed-data.json — داده واقعی شبکه مترو");
stmts.push("-- اعمال: wrangler d1 execute darmasir-db --remote --file seed.sql");
stmts.push("");

for (const l of data.lines) {
  stmts.push(
    `INSERT OR REPLACE INTO lines (id, city_id, number, name, color, text_on_color, terminals, direction, headway, headway_peak, headway_off, first_train, last_train, segment_minutes, badges, status, status_note, created_at, updated_at) VALUES (${q(l.id)}, ${q(l.cityId)}, ${q(l.number)}, ${q(l.name)}, ${q(l.color)}, ${q(l.textOnColor)}, ${q(l.terminals)}, ${q(l.direction)}, ${q(l.headway)}, ${q(l.headwayPeak)}, ${q(l.headwayOff)}, ${q(l.firstTrain)}, ${q(l.lastTrain)}, ${q(l.segmentMinutes)}, ${q(l.badges)}, ${q(l.status)}, ${q(l.statusNote)}, datetime('now'), datetime('now'));`
  );
}

for (const s of data.stations) {
  stmts.push(
    `INSERT OR REPLACE INTO stations (id, name, city_id, lines, amenities, featured, lat, lng, created_at, updated_at) VALUES (${q(s.id)}, ${q(s.name)}, ${q(s.cityId)}, ${q(s.lines)}, ${q(s.amenities)}, ${s.featured ? 1 : 0}, ${q(s.lat)}, ${q(s.lng)}, datetime('now'), datetime('now'));`
  );
}

const settings: Record<string, string> = {
  "app.name": "درمسیر",
  "app.tagline": "دستیار هوشمند سفر شهری",
  "app.supportMessage":
    "برای پشتیبانی از بخش «حساب من» در اپلیکیشن پیام بگذارید.",
  "app.minVersion": "4.8.17",
  "app.notice": "",
  "ads.enabled": "true",
  "api.publicBaseUrl": "",
};
for (const [k, v] of Object.entries(settings)) {
  stmts.push(
    `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (${q(k)}, ${q(v)}, datetime('now'));`
  );
}

stmts.push(
  `INSERT OR REPLACE INTO app_versions (id, version_name, version_code, apk_url, notes, mandatory, active, created_at) VALUES ('v497', '4.8.17', 497, '/metrojo-4.8.17.apk', 'نسخه پایدار فعلی', 0, 1, datetime('now'));`
);

stmts.push("");
stmts.push("-- مدیر اولیه با POST /api/v1/setup ساخته می‌شود (نه با seed)");
stmts.push("");

writeFileSync(OUT, stmts.join("\n"), "utf8");
console.log(
  `seed.sql: ${data.lines.length} lines, ${data.stations.length} stations, ${stmts.length} statements`
);
