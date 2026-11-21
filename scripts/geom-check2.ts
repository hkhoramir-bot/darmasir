/* Find near-PARALLEL overlapping segment pairs (angle-filtered) */
import * as M from "../src/lib/map-geometry";

const st = new Map(M.MAP_STATIONS.map((s: any) => [s.id, s]));

interface Seg { line: string; a: any; b: any; aId: string; bId: string; }
const segs: Seg[] = [];
for (const ml of M.MAP_LINES) {
  for (let i = 0; i < ml.stations.length - 1; i++) {
    const a = st.get(ml.stations[i]);
    const b = st.get(ml.stations[i + 1]);
    if (!a || !b) continue;
    segs.push({ line: ml.lineId, a, b, aId: a.id, bId: b.id });
  }
}

function closestPtSegSeg(s1: Seg, s2: Seg) {
  // exact segment-segment closest points
  const p1 = { x: s1.a.x, y: s1.a.y }, q1 = { x: s1.b.x, y: s1.b.y };
  const p2 = { x: s2.a.x, y: s2.a.y }, q2 = { x: s2.b.x, y: s2.b.y };
  const d1 = { x: q1.x - p1.x, y: q1.y - p1.y };
  const d2 = { x: q2.x - p2.x, y: q2.y - p2.y };
  const r = { x: p1.x - p2.x, y: p1.y - p2.y };
  const a = d1.x * d1.x + d1.y * d1.y;
  const e = d2.x * d2.x + d2.y * d2.y;
  const f = d2.x * r.x + d2.y * r.y;
  const c = d1.x * r.x + d1.y * r.y;
  const b = d1.x * d2.x + d1.y * d2.y;
  const denom = a * e - b * b;
  let s = 0, t = 0;
  if (denom !== 0) {
    t = (b * f - c * e) / denom;
    s = (a * f - b * c) / denom;
  } else { s = 0; t = f; }
  s = Math.max(0, Math.min(1, s));
  t = Math.max(0, Math.min(1, t));
  const pt1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s };
  const pt2 = { x: p2.x + d2.x * s, y: p2.y + d2.y * t };
  return { d: Math.hypot(pt1.x - pt2.x, pt1.y - pt2.y), pt1, pt2, s, t };
}

function segAngle(s1: Seg, s2: Seg): number {
  const d1 = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y };
  const d2 = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y };
  const dot = (d1.x * d2.x + d1.y * d2.y) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y));
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

console.log("=== NEAR-PARALLEL OVERLAPS (angle<=45deg, min-dist<24, interior approach) ===");
const out: string[] = [];
for (let i = 0; i < segs.length; i++) {
  for (let j = i + 1; j < segs.length; j++) {
    const s1 = segs[i], s2 = segs[j];
    if (s1.line === s2.line) continue;
    if (s1.aId === s2.aId || s1.aId === s2.bId || s1.bId === s2.aId || s1.bId === s2.bId) continue;
    const ang = segAngle(s1, s2);
    const ang2 = Math.min(ang, 180 - ang);
    if (ang2 > 45) continue; // steep crossing - fine
    const r = closestPtSegSeg(s1, s2);
    // only flag if the closest approach is in the interior of BOTH segments (parallel stretch)
    if (r.s < 0.05 || r.s > 0.95 || r.t < 0.05 || r.t > 0.95) continue;
    if (r.d < 24) {
      out.push(`${r.d.toFixed(1).padStart(5)} ang=${ang2.toFixed(0).padStart(3)}  ${s1.line}[${s1.aId}->${s1.bId}] vs ${s2.line}[${s2.aId}->${s2.bId}] @(${r.pt1.x.toFixed(0)},${r.pt1.y.toFixed(0)})`);
    }
  }
}
out.sort();
for (const l of out) console.log(l);

console.log("\n=== STATION near-parallel to foreign segment (perp foot interior, dist<20) ===");
const out2: string[] = [];
for (const s of M.MAP_STATIONS) {
  for (const seg of segs) {
    if (seg.aId === s.id || seg.bId === s.id) continue;
    const onSameLine = M.MAP_LINES.some((ml: any) => ml.lineId === seg.line && ml.stations.includes(s.id));
    if (onSameLine) continue;
    const d1x = seg.b.x - seg.a.x, d1y = seg.b.y - seg.a.y;
    const len2 = d1x * d1x + d1y * d1y;
    const t = ((s.x - seg.a.x) * d1x + (s.y - seg.a.y) * d1y) / len2;
    if (t < 0.12 || t > 0.88) continue; // foot must be interior (not at interchange approach)
    const px = seg.a.x + d1x * t, py = seg.a.y + d1y * t;
    const d = Math.hypot(px - s.x, py - s.y);
    if (d < 20) out2.push(`${d.toFixed(1).padStart(5)}  ${s.id}(${s.x},${s.y})  near ${seg.line}[${seg.aId}->${seg.bId}] t=${t.toFixed(2)}`);
  }
}
out2.sort();
for (const l of out2) console.log(l);
