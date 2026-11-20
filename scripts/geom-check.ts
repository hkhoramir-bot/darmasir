/* Find near-parallel close segment pairs + station-to-foreign-segment distances */
import * as M from "../src/lib/map-geometry";

type P = { x: number; y: number };
const st = new Map(M.MAP_STATIONS.map((s: any) => [s.id, s]));

interface Seg {
  line: string;
  color: string;
  a: P;
  b: P;
  aId: string;
  bId: string;
}
const segs: Seg[] = [];
for (const ml of M.MAP_LINES) {
  for (let i = 0; i < ml.stations.length - 1; i++) {
    const a = st.get(ml.stations[i]);
    const b = st.get(ml.stations[i + 1]);
    if (!a || !b) continue;
    segs.push({ line: ml.lineId, color: ml.color, a, b, aId: a.id, bId: b.id });
  }
}

function distSegSeg(s1: Seg, s2: Seg): number {
  let min = Infinity;
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const p = {
      x: s1.a.x + ((s1.b.x - s1.a.x) * i) / N,
      y: s1.a.y + ((s1.b.y - s1.a.y) * i) / N,
    };
    for (let j = 0; j <= N; j++) {
      const q = {
        x: s2.a.x + ((s2.b.x - s2.a.x) * j) / N,
        y: s2.a.y + ((s2.b.y - s2.a.y) * j) / N,
      };
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < min) min = d;
    }
  }
  return min;
}

const results: { d: number; s1: Seg; s2: Seg }[] = [];
for (let i = 0; i < segs.length; i++) {
  for (let j = i + 1; j < segs.length; j++) {
    const s1 = segs[i];
    const s2 = segs[j];
    if (s1.line === s2.line) continue;
    if (s1.aId === s2.aId || s1.aId === s2.bId || s1.bId === s2.aId || s1.bId === s2.bId) continue;
    const d = distSegSeg(s1, s2);
    if (d < 26) results.push({ d, s1, s2 });
  }
}
results.sort((a, b) => a.d - b.d);
console.log("=== SEGMENT-SEGMENT min distance < 26 (different lines, no shared station) ===");
for (const r of results.slice(0, 40)) {
  console.log(
    `${r.d.toFixed(1).padStart(5)}  ${r.s1.line}[${r.s1.aId}->${r.s1.bId}]  vs  ${r.s2.line}[${r.s2.aId}->${r.s2.bId}]`
  );
}

console.log("\n=== STATION to foreign SEGMENT distance < 20 (station not on that line) ===");
const stRes: { d: number; sid: string; seg: Seg }[] = [];
for (const s of M.MAP_STATIONS) {
  for (const seg of segs) {
    if (seg.aId === s.id || seg.bId === s.id) continue;
    const onSameLine = M.MAP_LINES.some(
      (ml: any) => ml.lineId === seg.line && ml.stations.includes(s.id)
    );
    if (onSameLine) continue;
    const N = 60;
    let min = Infinity;
    for (let k = 0; k <= N; k++) {
      const p = {
        x: seg.a.x + ((seg.b.x - seg.a.x) * k) / N,
        y: seg.a.y + ((seg.b.y - seg.a.y) * k) / N,
      };
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < min) min = d;
    }
    if (min < 20) stRes.push({ d: min, sid: s.id, seg });
  }
}
stRes.sort((a, b) => a.d - b.d);
const seen = new Set<string>();
for (const r of stRes.slice(0, 50)) {
  const key = `${r.sid}|${r.seg.line}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`${r.d.toFixed(1).padStart(5)}  ${r.sid}  near ${r.seg.line}[${r.seg.aId}->${r.seg.bId}]`);
}
