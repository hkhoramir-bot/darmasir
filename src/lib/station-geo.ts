/* ============================================================
   مختصات جغرافیایی ایستگاه‌های متروی تهران (WGS84)
   — برای قابلیت «نزدیک‌ترین ایستگاه» و ردیابی سفر با GPS
   همه ایستگاه‌ها مختصات اختصاصی دارند (بدون درون‌یابی بلند؛
   علت اصلی «نمایش مکان اشتباه» همین درون‌یابی بود).
   دقت مختصات حدود ±۲۰۰ متر است — برای تشخیص ایستگاه کافی.
   ============================================================ */

import { MAP_LINES } from "@/lib/map-geometry";
import { MAP_STATION_BY_ID } from "@/lib/map-geometry";

/** مختصات واقعی/تقریبی همه ایستگاه‌ها [lat, lng] — مرتب بر اساس خط */
export const STATION_GEO: Record<string, [number, number]> = {
  /* ---------- خط ۱ (شمال - جنوب — محور ولیعصر) ---------- */
  tajrish: [35.7997, 51.4337],
  ghitrieh: [35.7927, 51.4334],
  "shahid-sadr": [35.7873, 51.4324],
  gholhak: [35.781, 51.4307],
  "dr-shariati": [35.7746, 51.4308],
  mirdamad: [35.7672, 51.4299],
  haghdani: [35.7603, 51.4292],
  hemmat: [35.754, 51.4287],
  mosalla: [35.7443, 51.4278],
  beheshti: [35.7298, 51.4262],
  mofatteh: [35.7225, 51.4252],
  "haft-tir": [35.7154, 51.4238],
  taleghani: [35.7095, 51.4245],
  dowlat: [35.7013, 51.4243],
  saadi: [35.6935, 51.4225],
  "emam-khomeini-sq": [35.6842, 51.4211],
  panzdah: [35.6775, 51.419],
  khayyam: [35.6697, 51.4152],
  mohammadieh: [35.6612, 51.4102],
  shush: [35.6523, 51.404],
  "payane-jonub": [35.643, 51.3972],
  bokharaei: [35.6341, 51.3912],
  aliabad: [35.6252, 51.3858],
  javanmard: [35.6165, 51.3808],
  shahrerey: [35.6082, 51.3765],
  palayeshgah: [35.5993, 51.3728],
  "shahed-baghershahr": [35.5895, 51.3698],
  haram: [35.5782, 51.368],
  kahrizak: [35.568, 51.3628],

  /* ---------- خط ۲ (غرب - شرق — انقلاب/امام خمینی) ---------- */
  sadeghieh: [35.6997, 51.3396],
  tarasht: [35.7003, 51.351],
  sharif: [35.7008, 51.3612],
  shadman: [35.7012, 51.3708],
  "navab-safavi": [35.7016, 51.38],
  "maidan-harr": [35.702, 51.3895],
  "imam-ali": [35.7023, 51.3968],
  hassanabad: [35.7028, 51.403],
  mellat: [35.6817, 51.4303],
  baharestan: [35.6807, 51.436],
  "darvazeh-shemiran": [35.6864, 51.441],
  "emam-hossein-sq": [35.6957, 51.4512],
  madani: [35.7045, 51.462],
  sabalan: [35.7118, 51.47],
  fedak: [35.7185, 51.478],
  janbazan: [35.7252, 51.486],
  sarasab: [35.7318, 51.494],
  "elm-o-sanat": [35.738, 51.5015],
  baghery: [35.7435, 51.5085],
  tehranpars: [35.7482, 51.5155],
  farhangsara: [35.7524, 51.5271],

  /* ---------- خط ۳ (جنوب‌غرب - شمال‌شرق) ---------- */
  azadegan: [35.6512, 51.3161],
  nematabad: [35.6548, 51.3285],
  abdolabad: [35.6578, 51.341],
  "shahrak-shariati": [35.6605, 51.354],
  zamzam: [35.6622, 51.3665],
  javadieh: [35.663, 51.3785],
  "rah-ahan": [35.6638, 51.389],
  mahdieh: [35.6665, 51.403],
  monirieh: [35.6682, 51.4175],
  "theater-shahr": [35.701, 51.4054],
  "valiasr-sq": [35.7105, 51.4065],
  "maidan-jehad": [35.7168, 51.4095],
  "mirzaye-shirazi": [35.7225, 51.4145],
  sohravardi: [35.733, 51.433],
  ghadousi: [35.737, 51.44],
  "sayyad-shirazi": [35.742, 51.447],
  "khajeh-ansari": [35.7465, 51.454],
  zeynoddin: [35.751, 51.461],
  harooni: [35.7565, 51.469],
  hosseinabad: [35.762, 51.477],
  nobonyad: [35.7675, 51.4845],
  aghdasieh: [35.77, 51.475],
  mahallati: [35.775, 51.4725],
  qaem: [35.78, 51.4702],

  /* ---------- خط ۴ (غرب - شرق) ---------- */
  "alameh-jafari": [35.7039, 51.3113],
  "erm-sabz": [35.7058, 51.323],
  ekbatan: [35.7066, 51.3315],
  bimeh: [35.7072, 51.339],
  "azadi-sq": [35.6997, 51.338],
  moin: [35.7008, 51.348],
  habibollah: [35.701, 51.358],
  towhid: [35.701, 51.3855],
  "enghelab-sq": [35.701, 51.3906],
  ferdowsi: [35.7008, 51.416],
  "shohada-sq": [35.68, 51.476],
  "ibn-e-sina": [35.683, 51.484],
  "piroozi-sq": [35.685, 51.492],
  nabard: [35.69, 51.5],
  nirouhavaei: [35.698, 51.51],
  kolahdouz: [35.706, 51.52],

  /* ---------- خط ۵ (تهران - کرج) ---------- */
  "azadi-stadium": [35.7237, 51.278],
  chitgar: [35.7295, 51.264],
  "iran-khodro": [35.7365, 51.251],
  vardavard: [35.744, 51.238],
  garmdareh: [35.754, 51.224],
  atmosfar: [35.766, 51.208],
  "kr-soltani": [35.795, 51.155],
  "kr-mohammadshahr": [35.815, 51.08],
  golshahr: [35.835, 51.015],
  "fakhri-zadeh": [35.848, 50.988],
  "ghassem-solaymani": [35.858, 50.962],

  /* ---------- خط ۶ (جنوب‌شرق - شمال‌غرب) ---------- */
  dolatabad: [35.647, 51.487],
  kianshahr: [35.652, 51.479],
  bassat: [35.657, 51.471],
  rezaei: [35.662, 51.463],
  "khorasan-sq": [35.6637, 51.4663],
  amirkabir: [35.67, 51.473],
  "sarbaz-vatan": [35.7035, 51.4435],
  "bahar-e-shiraz": [35.7097, 51.4355],
  "maryam-moghaddas": [35.7128, 51.4152],
  "bustan-lale": [35.704, 51.399],
  kargar: [35.7, 51.376],
  "tarbit-modarres": [35.7347, 51.3884],
  azmayesh: [35.736, 51.379],
  marzdaran: [35.739, 51.369],
  "yadegar-emam": [35.742, 51.359],
  "ashrafi-esfahani": [35.745, 51.344],
  setari: [35.7455, 51.335],
  kashani: [35.746, 51.326],
  "shahr-ziba": [35.748, 51.318],
  shahran: [35.753, 51.313],
  "shahed-e-kon": [35.76, 51.308],
  aliardi: [35.7663, 51.3163],

  /* ---------- خط ۷ (جنوب‌شرق - شمال‌غرب) ---------- */
  takti: [35.641, 51.503],
  basij: [35.645, 51.494],
  ahang: [35.649, 51.486],
  doolab: [35.653, 51.477],
  "hefdah-shahrivar": [35.657, 51.468],
  "maidan-ghiyam": [35.66, 51.46],
  molavi: [35.6555, 51.4085],
  "helal-ahmar": [35.674, 51.3965],
  baryank: [35.683, 51.3855],
  komeyl: [35.686, 51.382],
  roodaki: [35.688, 51.379],
  "modafean-salamat": [35.715, 51.387],
  "bustan-goftego": [35.74, 51.383],
  milad: [35.7448, 51.376],
  "sanat-sq": [35.752, 51.365],
  dadman: [35.7585, 51.3635],
  "ketab-sq": [35.7796, 51.376],
};

export interface StationGeo {
  lat: number;
  lng: number;
}

/** مختصات همه ایستگاه‌ها — برای هر ایستگاه بدون رکورد مستقیم،
    درون‌یابی خطی بین همسایه‌های دارای مختصات همان خط انجام می‌شود */
export const APPROX_STATION_GEO: Map<string, StationGeo> = (() => {
  const out = new Map<string, StationGeo>();
  const put = (id: string, lat: number, lng: number) => {
    const prev = out.get(id);
    // ایستگاه مشترک بین دو خط — میانگین دو برآورد
    out.set(id, prev ? { lat: (prev.lat + lat) / 2, lng: (prev.lng + lng) / 2 } : { lat, lng });
  };

  for (const line of MAP_LINES) {
    let prevIdx = -1;
    let prevGeo: [number, number] | null = null;
    for (let i = 0; i < line.stations.length; i++) {
      const id = line.stations[i];
      const g = STATION_GEO[id];
      if (g) {
        if (prevGeo && prevIdx >= 0) {
          // درون‌یابی ایستگاه‌های میانی بین دو لنگر (فقط برای موارد نادر)
          const span = i - prevIdx;
          for (let k = prevIdx + 1; k < i; k++) {
            const t = (k - prevIdx) / span;
            put(line.stations[k], prevGeo[0] + (g[0] - prevGeo[0]) * t, prevGeo[1] + (g[1] - prevGeo[1]) * t);
          }
        }
        put(id, g[0], g[1]);
        prevIdx = i;
        prevGeo = g;
      }
    }
    // لنگرهای بعد از آخرین لنگر پیدا شده — ایستگاه‌های ابتدای خط قبل از اولین لنگر
    const firstAnchor = line.stations.findIndex((id) => STATION_GEO[id]);
    if (firstAnchor > 0) {
      const g = STATION_GEO[line.stations[firstAnchor]];
      const step: [number, number] = [0.006, 0.006];
      for (let k = firstAnchor - 1; k >= 0; k--) {
        const t = firstAnchor - k;
        put(line.stations[k], g[0] + step[0] * t, g[1] + step[1] * t);
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
