/* ============================================================
   موقعیت جغرافیایی تقریبی ایستگاه‌های متروی تهران (WGS84)
   — برای قابلیت «نزدیک‌ترین ایستگاه» با GPS دستگاه
   مختصات سرخط‌ها و تقاطع‌های اصلی لنگر هستند و بقیه ایستگاه‌ها
   به‌صورت خطی بین دو لنگر مجاور درون‌یابی می‌شوند (دقت تقریبی).
   ============================================================ */

import { MAP_LINES, MAP_STATION_BY_ID } from "@/lib/map-geometry";

/** لنگرهای جغرافیایی: سرخط‌ها + ایستگاه‌های شناخته‌شده [lat, lng] */
const GEO_ANCHORS: Record<string, [number, number]> = {
  /* ---------- خط ۱ (شمال - جنوب) ---------- */
  tajrish: [35.7997, 51.4337],
  "emam-khomeini-sq": [35.6842, 51.4211],
  kahrizak: [35.5417, 51.3432],

  /* ---------- خط ۲ (غرب - شرق) ---------- */
  sadeghieh: [35.6997, 51.3396],
  "emam-hossein-sq": [35.6957, 51.4512],
  farhangsara: [35.7524, 51.5271],

  /* ---------- خط ۳ (شمال‌شرق - جنوب‌غرب) ---------- */
  azadegan: [35.6512, 51.3161],
  monirieh: [35.7061, 51.4123],
  "theater-shahr": [35.701, 51.4054],
  "valiasr-sq": [35.7105, 51.4065],
  beheshti: [35.7267, 51.4467],
  qaem: [35.78, 51.4702],

  /* ---------- خط ۴ (غرب - شرق) ---------- */
  "alameh-jafari": [35.7039, 51.3113],
  "azadi-sq": [35.6997, 51.338],
  "enghelab-sq": [35.701, 51.3906],
  dowlat: [35.7075, 51.426],
  "shohada-sq": [35.6787, 51.4763],
  kolahdouz: [35.7294, 51.5296],

  /* ---------- خط ۵ (تهران - کرج) ---------- */
  "erm-sabz": [35.7058, 51.323],
  "azadi-stadium": [35.7237, 51.278],
  "ghassem-solaymani": [35.8395, 51.466],

  /* ---------- خط ۶ (جنوب‌شرق - شمال‌غرب) ---------- */
  dolatabad: [35.647, 51.487],
  "khorasan-sq": [35.6637, 51.4663],
  "haft-tir": [35.715, 51.426],
  "tarbit-modarres": [35.7347, 51.3884],
  aliardi: [35.7663, 51.3163],

  /* ---------- خط ۷ (جنوب‌شرق - شمال‌غرب) ---------- */
  takti: [35.641, 51.503],
  molavi: [35.654, 51.405],
  mohammadieh: [35.661, 51.419],
  "navab-safavi": [35.709, 51.403],
  towhid: [35.702, 51.384],
  "ketab-sq": [35.7796, 51.376],
};

export interface StationGeo {
  lat: number;
  lng: number;
}

/** مختصات تقریبی همه ایستگاه‌های تهران — درون‌یابی خطی بین لنگرها */
export const APPROX_STATION_GEO: Map<string, StationGeo> = (() => {
  const out = new Map<string, StationGeo>();
  for (const line of MAP_LINES) {
    const anchors = line.stations
      .map((id, i) => ({ id, i }))
      .filter((a) => Array.isArray(GEO_ANCHORS[a.id]));
    if (anchors.length === 0) continue;

    for (let k = 0; k < anchors.length - 1; k++) {
      const a = anchors[k];
      const b = anchors[k + 1];
      const ga = GEO_ANCHORS[a.id];
      const gb = GEO_ANCHORS[b.id];
      const span = Math.max(1, b.i - a.i);
      for (let i = a.i; i <= b.i; i++) {
        const t = (i - a.i) / span;
        const lat = ga[0] + (gb[0] - ga[0]) * t;
        const lng = ga[1] + (gb[1] - ga[1]) * t;
        const prev = out.get(line.stations[i]);
        // ایستگاه مشترک بین دو خط — میانگین دو برآورد
        out.set(
          line.stations[i],
          prev ? { lat: (prev.lat + lat) / 2, lng: (prev.lng + lng) / 2 } : { lat, lng }
        );
      }
    }
  }
  return out;
})();

/** فاصله هوایی (متر) بین دو نقطه جغرافیایی — Haversine */
export function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NearestStationResult {
  id: string;
  name: string;
  distanceM: number;
}

/** نزدیک‌ترین ایستگاه مترو به یک مختصات — null یعنی خارج از محدوده شبکه */
export function nearestStationTo(
  lat: number,
  lng: number,
  maxDistanceM = 2500
): NearestStationResult | null {
  let best: { id: string; d: number } | null = null;
  for (const [id, g] of APPROX_STATION_GEO) {
    const d = haversineM(lat, lng, g.lat, g.lng);
    if (!best || d < best.d) best = { id, d };
  }
  if (!best || best.d > maxDistanceM) return null;
  const name = MAP_STATION_BY_ID.get(best.id)?.name ?? best.id;
  return { id: best.id, name, distanceM: best.d };
}
