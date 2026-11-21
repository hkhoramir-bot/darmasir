import { getLine, getStation, toFa, type CityId } from "@/lib/metro-data";
import { STATION_GEO } from "@/lib/station-geo";
import { BRT_LINES, type BrtLine } from "@/lib/brt-data";
import { normalizeFa } from "@/lib/fa-normalize";

/* ============================================================
   نشانه‌های شهری درمسیر (POI) — بدون هوش مصنوعی، کاملاً قانون‌محور
   بیمارستان/برج/دانشگاه/پارک/پایانه/فرودگاه با مختصات واقعی WGS84
   برای:
   • «میخوام با مترو برم بیمارستان میلاد»
   • «پیاده تا برج میلاد چقدر راهه؟»
   تطابق با تطابق فازی (لون‌اشتاین) — تحمل غلط املایی و لحن عامیانه
   («بیمارستان میلام»، «ایرانمال»، ...)
   ============================================================ */

export type PoiCategory =
  | "hospital"
  | "tower"
  | "university"
  | "park"
  | "mall"
  | "stadium"
  | "airport"
  | "cemetery"
  | "monument";

export interface CityPoi {
  id: string;
  name: string;
  /** نام‌های عامیانه/تلفظ‌های رایج — ASR گاهی «میلام» می‌نویسد */
  aliases: string[];
  category: PoiCategory;
  cityId: CityId;
  /** مختصات واقعی [lat, lng] */
  lat: number;
  lng: number;
  /** نزدیک‌ترین ایستگاه مترو — تایید دستی؛ اگر نبود خودکار محاسبه می‌شود */
  stationId?: string;
  /** خط بی‌آرتی مناسب اگر نزدیک باشد */
  brtLineId?: string;
}

export const POI_CATEGORY_FA: Record<PoiCategory, string> = {
  hospital: "بیمارستان",
  tower: "برج",
  university: "دانشگاه",
  park: "پارک",
  mall: "مرکز خرید",
  stadium: "ورزشگاه",
  airport: "فرودگاه",
  cemetery: "آرامستان",
  monument: "اثر تاریخی",
};

export const CITY_POIS: CityPoi[] = [
  /* ---------- درمانی ---------- */
  {
    id: "poi-milad-hospital",
    name: "بیمارستان میلاد",
    aliases: ["بیمارستان میلام", "بیمارستان میلادو", "میلام بیمارستان"],
    category: "hospital",
    cityId: "tehran",
    lat: 35.7706,
    lng: 51.4758, // بلوار نلسون ماندلا، بالاتر از نوبنیاد
    stationId: "nobonyad", // خط ۳ — حدود ۱ کیلومتر
  },
  {
    id: "poi-rasool",
    name: "بیمارستان رسول اکرم",
    aliases: ["بیمارستان رسول", "رسول اکرم", "بیمارستان رسول‌اکرم"],
    category: "hospital",
    cityId: "tehran",
    lat: 35.708,
    lng: 51.352, // بزرگراه ساتاری
    stationId: "tarasht", // خط ۲ — حدود ۹۰۰ متر
  },
  {
    id: "poi-rajaee-heart",
    name: "بیمارستان قلب شهید رجایی",
    aliases: ["بیمارستان رجایی", "قلب رجایی", "بیمارستان قلب"],
    category: "hospital",
    cityId: "tehran",
    lat: 35.7529,
    lng: 51.403, // ولیعصر، پارک وی
  },
  {
    id: "poi-tohid-hospital",
    name: "بیمارستان توحید",
    aliases: ["بیمارستان میلام توحید"],
    category: "hospital",
    cityId: "tehran",
    lat: 35.7038,
    lng: 51.3743, // خیابان آزادی
    stationId: "towhid",
  },

  /* ---------- برج و بناهای شاخص ---------- */
  {
    id: "poi-milad-tower",
    name: "برج میلاد",
    aliases: ["میلاد", "برج میلام", "برج میلادو", "برج میلاد تهران"],
    category: "tower",
    cityId: "tehran",
    lat: 35.7448,
    lng: 51.3752,
    stationId: "milad", // خط ۷ — ایستگاه هم‌نام
  },
  {
    id: "poi-azadi-tower",
    name: "برج آزادی",
    aliases: ["آزادی", "برج آزادی تهران", "میدان آزادی"],
    category: "monument",
    cityId: "tehran",
    lat: 35.6997,
    lng: 51.338,
    stationId: "azadi-sq",
  },
  {
    id: "poi-golestan",
    name: "کاخ گلستان",
    aliases: ["گلستان", "موزه گلستان"],
    category: "monument",
    cityId: "tehran",
    lat: 35.6797,
    lng: 51.42,
    stationId: "emam-khomeini-sq",
  },

  /* ---------- دانشگاه‌ها ---------- */
  {
    id: "poi-tehran-uni",
    name: "دانشگاه تهران",
    aliases: ["تهرون دانشگاه", "دانشگاه تهرون"],
    category: "university",
    cityId: "tehran",
    lat: 35.7014,
    lng: 51.3938, // دروازه اصلی — میدان انقلاب
    stationId: "enghelab-sq",
  },
  {
    id: "poi-sharif",
    name: "دانشگاه صنعتی شریف",
    aliases: ["دانشگاه شریف", "شریف"],
    category: "university",
    cityId: "tehran",
    lat: 35.7043,
    lng: 51.351, // خیابان آزادی
    stationId: "sharif",
  },
  {
    id: "poi-modares",
    name: "دانشگاه تربیت مدرس",
    aliases: ["تربییت مدرس", "دانشگاه مدرس"],
    category: "university",
    cityId: "tehran",
    lat: 35.759,
    lng: 51.3788, // بزرگراه چمران
    stationId: "tarbit-modarres",
  },
  {
    id: "poi-iust",
    name: "دانشگاه علم و صنعت",
    aliases: ["علم و صنعت", "علم وصنعت", "دانشگاه علم وصنعت"],
    category: "university",
    cityId: "tehran",
    lat: 35.7196,
    lng: 51.5073,
    stationId: "kolahdouz",
  },
  {
    id: "poi-shahid-beheshti-uni",
    name: "دانشگاه شهید بهشتی",
    aliases: ["دانشگاه بهشتی", "بهشتی"],
    category: "university",
    cityId: "tehran",
    lat: 35.756,
    lng: 51.4255,
  },

  /* ---------- پارک‌ها ---------- */
  {
    id: "poi-mellat-park",
    name: "پارک ملت",
    aliases: ["پارک ملت تهران"],
    category: "park",
    cityId: "tehran",
    lat: 35.7668,
    lng: 51.4104, // ولیعصر، شمال رسالت
  },
  {
    id: "poi-laleh-park",
    name: "پارک لاله",
    aliases: ["لاله پارک"],
    category: "park",
    cityId: "tehran",
    lat: 35.7077,
    lng: 51.337,
    stationId: "azadi-sq",
  },
  {
    id: "poi-saee-park",
    name: "پارک ساعی",
    aliases: ["ساعی", "بوستان ساعی"],
    category: "park",
    cityId: "tehran",
    lat: 35.7395,
    lng: 51.4232,
    stationId: "mosalla",
  },
  {
    id: "poi-ab-atash",
    name: "پارک آب و آتش",
    aliases: ["طبیعت", "پارک طبیعت", "پل طبیعت", "آب و آتش"],
    category: "park",
    cityId: "tehran",
    lat: 35.7552,
    lng: 51.414,
  },
  {
    id: "poi-goftogoo",
    name: "بوستان گفتگو",
    aliases: ["پارک گفتگو", "گفتگو"],
    category: "park",
    cityId: "tehran",
    lat: 35.7677,
    lng: 51.482,
    stationId: "nobonyad",
  },

  /* ---------- خرید و ورزش و سفر ---------- */
  {
    id: "poi-iranmall",
    name: "ایران مال",
    aliases: ["ایرانمال", "ایران مالو", "ایران مول"],
    category: "mall",
    cityId: "tehran",
    lat: 35.7394,
    lng: 51.2264,
  },
  {
    id: "poi-azadi-stadium",
    name: "ورزشگاه آزادی",
    aliases: ["استادیوم آزادی", "ورزشگاهازادی"],
    category: "stadium",
    cityId: "tehran",
    lat: 35.7241,
    lng: 51.278,
  },
  {
    id: "poi-mehrabad",
    name: "فرودگاه مهرآباد",
    aliases: ["مهراباد", "فرودگاه", "پایانه مهرآباد"],
    category: "airport",
    cityId: "tehran",
    lat: 35.6925,
    lng: 51.312,
  },
  {
    id: "poi-behesht-zahra",
    name: "بهشت زهرا",
    aliases: ["آرامستان بهشت زهرا"],
    category: "cemetery",
    cityId: "tehran",
    lat: 35.5683,
    lng: 51.3657,
    stationId: "haram",
  },
];

/* ------------------------------ فاصله ------------------------------ */

/** فاصله هوایی (Haversine) به کیلومتر */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ------------------------------ تطابق فازی ------------------------------ */

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

interface PoiHit {
  poi: CityPoi;
  score: number;
}

/** یافتن نشانه شهری از عبارت گفته‌شده — دقیق، نام مستعار، شمول، فازی */
export function matchPoiPhrase(
  phrase: string,
  pois: CityPoi[] = CITY_POIS,
  cityId?: CityId
): CityPoi | null {
  const p = normalizeFa(phrase);
  if (!p || p.length < 3) return null;
  const pool = cityId ? pois.filter((x) => x.cityId === cityId) : pois;

  const hits: PoiHit[] = [];
  for (const poi of pool) {
    const names = [normalizeFa(poi.name), ...poi.aliases.map((a) => normalizeFa(a))];
    let best = 0;
    for (const n of names) {
      if (!n) continue;
      if (n === p) best = Math.max(best, 100);
      else if (p.includes(n)) best = Math.max(best, 80 + n.length); // جمله شامل نام
      else if (n.includes(p) && p.length >= 5) best = Math.max(best, 60 + p.length);
      else {
        const d = levenshtein(p, n);
        const threshold = n.length >= 8 ? 3 : 2;
        if (d <= threshold) best = Math.max(best, 50 - d * 5);
      }
    }
    if (best > 0) hits.push({ poi, score: best });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score);
  return hits[0].poi;
}

export function getCityPoi(id: string): CityPoi | null {
  return CITY_POIS.find((x) => x.id === id) ?? null;
}

/* ------------------------ نزدیک‌ترین ایستگاه/بی‌آرتی ------------------------ */

export interface PoiStationInfo {
  station: { id: string; name: string } | null;
  /** فاصله پیاده تا ایستگاه (کیلومتر، هوایی) */
  km: number;
  /** نام خط‌های ایستگاه برای اعلام صوتی */
  lineNames: string[];
}

/** نزدیک‌ترین ایستگاه مترو به نشانه — تایید دستی یا محاسبه با Haversine */
export function nearestStationToPoi(poi: CityPoi): PoiStationInfo {
  const curated = poi.stationId ? getStation(poi.stationId) : undefined;
  let stationId = curated?.id;
  let km = 0;
  if (stationId) {
    const g = STATION_GEO[stationId];
    km = g ? haversineKm(poi.lat, poi.lng, g[0], g[1]) : 0;
  } else {
    let bestKm = Infinity;
    for (const [sid, g] of Object.entries(STATION_GEO)) {
      const st = getStation(sid);
      if (!st || st.cityId !== poi.cityId) continue;
      const d = haversineKm(poi.lat, poi.lng, g[0], g[1]);
      if (d < bestKm) {
        bestKm = d;
        stationId = sid;
      }
    }
    km = bestKm;
  }
  const st = stationId ? getStation(stationId) : undefined;
  const lineNames = st
    ? st.lines.map((l) => getLine(l.lineId)?.name ?? "").filter(Boolean)
    : [];
  return {
    station: st ? { id: st.id, name: st.name } : null,
    km,
    lineNames,
  };
}

export interface PoiBrtInfo {
  line: BrtLine | null;
  /** نزدیک‌ترین فاصله مسیر خط به نشانه (کیلومتر) */
  km: number;
  /** نقطه مسیر با نام پایانه نزدیک */
  pointName: string | null;
}

/** نزدیک‌ترین خط بی‌آرتی به نشانه — کمترین فاصله تا نقاط مسیر خط */
export function nearestBrtToPoi(poi: CityPoi): PoiBrtInfo {
  let best: { line: BrtLine; km: number; idx: number } | null = null;
  for (const line of BRT_LINES) {
    let lineBest = { km: Infinity, idx: 0 };
    line.path.forEach(([lat, lng], idx) => {
      const d = haversineKm(poi.lat, poi.lng, lat, lng);
      if (d < lineBest.km) lineBest = { km: d, idx };
    });
    if (!best || lineBest.km < best.km) {
      best = { line, km: lineBest.km, idx: lineBest.idx };
    }
  }
  if (!best || best.km > 4) {
    return { line: null, km: best?.km ?? Infinity, pointName: null };
  }
  return { line: best.line, km: best.km, pointName: null };
}

/* ------------------------------ قالب‌بندی ------------------------------ */

/** فاصله به قالب فارسی خوانا — «۰٫۹ کیلومتر» یا «۴۵۰ متر» */
export function formatKmFa(km: number): string {
  if (km < 1) return `${toFa(Math.round(km * 1000))} متر`;
  const r = Math.round(km * 10) / 10;
  return `${toFa(r.toLocaleString("fa-IR"))} کیلومتر`;
}
