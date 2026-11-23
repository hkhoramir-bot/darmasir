/* ============================================================
   استخراج داده شبکه مترو برای seed پنل مدیریت «درمسیر»
   اجرا در پروژه اصلی:  bun scripts/export-admin-seed.ts
   خروجی: mini-services/darmasir-admin/prisma/seed-data.json
   ============================================================ */

import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { LINES, STATIONS } from "../src/lib/metro-data";
import { STATION_GEO } from "../src/lib/station-geo";

const seed = {
  lines: LINES.map((l) => ({
    id: l.id,
    cityId: l.cityId,
    number: l.number,
    name: l.name,
    color: l.color,
    textOnColor: l.textOnColor,
    terminals: JSON.stringify(l.terminals),
    direction: l.direction,
    headway: l.headway,
    headwayPeak: l.headwayPeak ?? null,
    headwayOff: l.headwayOff ?? null,
    firstTrain: l.firstTrain,
    lastTrain: l.lastTrain,
    segmentMinutes: l.segmentMinutes,
    badges: l.badges ? JSON.stringify(l.badges) : null,
    status: l.status ?? "normal",
    statusNote: l.statusNote ?? null,
  })),
  stations: STATIONS.map((s) => {
    const geo = STATION_GEO[s.id];
    return {
      id: s.id,
      name: s.name,
      cityId: s.cityId,
      lines: JSON.stringify(s.lines),
      amenities: JSON.stringify(s.amenities),
      featured: Boolean(s.featured),
      lat: geo ? geo[0] : null,
      lng: geo ? geo[1] : null,
    };
  }),
};

const OUT = new URL(
  "../mini-services/darmasir-admin/prisma/seed-data.json",
  import.meta.url
).pathname;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(seed, null, 1), "utf8");

console.log(
  `seed-data.json written: ${seed.lines.length} lines, ${seed.stations.length} stations`
);
