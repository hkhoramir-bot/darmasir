/* بررسی هندسه نقشه: فاصله قطعه‌قطعه‌های خطوط مختلف از هم
   کاربرد: node scripts/check-map-geometry.mjs */
import { readFileSync } from "fs";

const src = readFileSync("src/lib/map-geometry.ts", "utf8");

// استخراج ساده ایستگاه‌ها و خطوط از فایل TS
const stations = [];
for (const m of src.matchAll(/\{ id: "([^"]+)", name: "[^"]*", x: ([\d.]+), y: ([\d.]+)/g)) {
  stations.push({ id: m[1], x: +m[2], y: +m[3] });
}
const S = new Map(stations.map((s) => [s.id, s]));
const lines = [];
for (const m of src.matchAll(/lineId: "(l\d)",[\s\S]*?stations: \[([\s\S]*?)\]/g)) {
  const ids = [...m[2].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]);
  lines.push({ lineId: m[1], stations: ids });
}

function segDist(p, p2, q, q2) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dir = (a, b) => ({ x: b.x - a.x, y: b.y - a.y });
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  // فاصله نقطه از پاره‌خط
  const ptSeg = (p, a, b) => {
    const ab = dir(a, b), ap = dir(a, p);
    const len2 = ab.x * ab.x + ab.y * ab.y || 1;
    const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / len2));
    return d(p, { x: a.x + ab.x * t, y: a.y + ab.y * t });
  };
  // تقاطع واقعی؟
  const d1 = cross(p, p2, q), d2 = cross(p, p2, q2), d3 = cross(q, q2, p), d4 = cross(q, q2, p2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return { dist: 0, cross: true };
  return {
    dist: Math.min(ptSeg(p, q, q2), ptSeg(p2, q, q2), ptSeg(q, p, p2), ptSeg(q2, p, p2)),
    cross: false,
  };
}

// ایستگاه‌های مشترک بین خطوط
const shared = new Set();
for (let i = 0; i < lines.length; i++)
  for (let j = i + 1; j < lines.length; j++)
    for (const id of lines[i].stations)
      if (lines[j].stations.includes(id)) shared.add(id);

const TH = 9; // آستانه هشدار (واحد viewBox)
const issues = [];
for (let i = 0; i < lines.length; i++) {
  const A = lines[i].stations.map((id) => S.get(id));
  for (let j = i + 1; j < lines.length; j++) {
    const B = lines[j].stations.map((id) => S.get(id));
    for (let a = 0; a < A.length - 1; a++) {
      for (let b = 0; b < B.length - 1; b++) {
        const r = segDist(A[a], A[a + 1], B[b], B[b + 1]);
        if (r.dist >= TH) continue;
        // اگر دو قطعه در ایستگاه مشترک به هم می‌رسند، طبیعی است
        const idA0 = lines[i].stations[a], idA1 = lines[i].stations[a + 1];
        const idB0 = lines[j].stations[b], idB1 = lines[j].stations[b + 1];
        const touch = idA0 === idB0 || idA0 === idB1 || idA1 === idB0 || idA1 === idB1;
        if (touch && r.dist < 2) continue; // همگرایی در خود ایستگاه تبادلی
        issues.push({
          pair: `${lines[i].lineId}[${idA0}→${idA1}] × ${lines[j].lineId}[${idB0}→${idB1}]`,
          dist: +r.dist.toFixed(1),
          cross: r.cross,
          touch,
        });
      }
    }
  }
}
console.log(`stations: ${stations.length}, lines: ${lines.length}, shared: ${shared.size}`);
if (!issues.length) console.log(`✓ هیچ همپوشانی زیر آستانه ${TH} واحد وجود ندارد`);
else {
  console.log(`⚠ ${issues.length} نقطه پرتنش (فاصله < ${TH}):`);
  for (const it of issues)
    console.log(`  ${it.dist}${it.cross ? " تقاطع" : ""}${it.touch ? " (لمس ایستگاه مشترک)" : ""} — ${it.pair}`);
}
