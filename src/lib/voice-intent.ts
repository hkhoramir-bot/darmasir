import type { StationDef } from "@/lib/metro-data";
import { landmarksFor } from "@/lib/metro-data";
import { matchPoiPhrase, CITY_POIS, type CityPoi } from "@/lib/city-pois";
import { normalizeFa } from "@/lib/fa-normalize";

export { normalizeFa };

/* ============================================================
   هوش صوتی درمسیر — از جمله فارسی کاربر، مبدأ و مقصد را می‌فهمد
   نمونه‌های پشتیبانی‌شده:
   • «از علی آباد تا تجریش میخوام برم»
   • «از میدان انقلاب به قیطریه»
   • «مبدا صادقیه مقصد فردوسی»
   • «از اینجا تا تجریش چقدر راهه؟»  (مبدأ = ایستگاه فعلی GPS)
   • «میخوام برم میدان آزادی»       (فقط مقصد)
   • «میخوام با مترو برم بیمارستان میلاد»  (نشانه شهری + وسیله)
   • «پیاده تا برج میلاد چقدر راهه؟»       (پیاده‌روی/خودرو → نقشه)
   نکته مهم: ASR فارسی معمولاً «نیم‌فاصله» را فاصله می‌نویسد و
   «ي/ك» عربی می‌فرستد — همه‌چیز قبل از مقایسه نرمال می‌شود.
   ============================================================ */

/* ------------------------ تشخیص وسیله نقلیه ------------------------
   قانون‌محور — بدون مدل زبانی؛ فقط الگوی واژگانی */

export type TravelMode = "walking" | "driving" | "metro" | "bus";

const TRAVEL_MODE_PATTERNS: { mode: TravelMode; re: RegExp }[] = [
  { mode: "walking", re: /پیاده|قدم|فوتی/ },
  { mode: "driving", re: /ماشین|اسنپ|تپسی|تاکسی|خودرو|سواری|رانندگی|درایو/ },
  { mode: "metro", re: /مترو|قطار/ },
  { mode: "bus", re: /اتوبوس|بی\s*[آا]ر\s*تی|برتی|بیارتی|تندرو/ },
];

/** تشخیص وسیله نقلیه از جمله — null یعنی چیزی نگفت (پیش‌فرض بهترین حالت) */
export function detectTravelMode(text: string): TravelMode | null {
  const t = normalizeFa(text).toLowerCase();
  if (!t) return null;
  if (TRAVEL_MODE_PATTERNS[0].re.test(t)) return "walking";
  if (TRAVEL_MODE_PATTERNS[1].re.test(t)) return "driving";
  if (TRAVEL_MODE_PATTERNS[2].re.test(t)) return "metro";
  if (TRAVEL_MODE_PATTERNS[3].re.test(t) || /\bbrt\b/.test(t)) return "bus";
  return null;
}

/** فاصله ویرایشی برای تحمل خطای تایپ/گفتار در نام ایستگاه */
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

/** نام‌های محلی و خودمانی ایستگاه‌ها — مردم غالباً با همین اسم صدا می‌زنند */
const LOCAL_NAMES: Record<string, string> = {
  "خزانه بخارایی": "bokharaei",
  "خزانه": "bokharaei",
  "ترمینال جنوب": "payane-jonub",
  "پایانه جنوب": "payane-jonub",
  "پایانه شرق": "kolahdouz",
  "پایانه غرب": "sadeghieh",
  "دستواره": "javanmard",
  "بازار بزرگ": "panzdah",
};

/** یافتن ایستگاه از یک عبارت گفته‌شده — دقیق، شامل، هم‌پوشانی کلمات، فازی */
export function matchStationPhrase(
  phrase: string,
  stations: StationDef[]
): StationDef | null {
  let p = normalizeFa(phrase);
  // حذف کلمات پرکاربرد ابتدای عبارت
  p = p.replace(/^(ایستگاه|مترو|داخل|نزدیک|سمت|از)\s+/g, "").trim();
  if (!p) return null;

  const normName = (s: StationDef) => normalizeFa(s.name);

  /* ۱. تطابق دقیق نام ایستگاه */
  const exact = stations.find((s) => normName(s) === p);
  if (exact) return exact;

  /* ۱٫۵. نام محلی/خودمانی — «خزانه» = شهید بخارایی */
  const localId = LOCAL_NAMES[p];
  if (localId) {
    const local = stations.find((s) => s.id === localId);
    if (local) return local;
  }

  /* ۲. شمول دوطرفه — عبارت اضافه‌های آخر جمله را می‌پوشاند
        («تجریش میخوام برم» شامل «تجریش» است) */
  const contains = stations.filter((s) => {
    const n = normName(s);
    if (n.length < 3) return false;
    return n.includes(p) || p.includes(n);
  });
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) {
    // خاص‌ترین (طولانی‌ترین نام ایستگاه که داخل عبارت جا شده)
    contains.sort((a, b) => normName(b).length - normName(a).length);
    return contains[0];
  }

  /* ۲٫۵. نشانه‌های محلی اطراف ایستگاه — «بازار بزرگ تهران»، «برج میلاد»، «بهشت زهرا»
     اول تطابق کامل نشانه، بعد شمول — تا «بازار بزرگ» (خیام) سرِ راه
     «بازار بزرگ تهران» (پانزده خرداد) سبز نشود */
  const landmarkExact = stations.find((s) =>
    landmarksFor(s.id).some((lm) => normalizeFa(lm) === p)
  );
  if (landmarkExact) return landmarkExact;
  const landmarkPart = stations.find((s) =>
    landmarksFor(s.id).some((lm) => {
      const n = normalizeFa(lm);
      return p.includes(n) || (n.includes(p) && p.length >= 6);
    })
  );
  if (landmarkPart) return landmarkPart;

  /* ۳. هم‌پوشانی کلمات — «میدون آزادی» ↔ «میدان آزادی» */
  const pTokens = p.split(" ").filter((t) => t.length > 1);
  let bestScore = 0;
  let best: StationDef | null = null;
  for (const s of stations) {
    const nTokens = normName(s).split(" ").filter((t) => t.length > 1);
    if (!nTokens.length) continue;
    const overlap = nTokens.filter((t) => pTokens.includes(t)).length;
    const score = overlap / nTokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (bestScore >= 0.6) return best;

  /* ۴. فازی — خطای ASR با فاصله ویرایشی کوچک */
  let bestDist = Infinity;
  let fuzzyBest: StationDef | null = null;
  for (const s of stations) {
    const d = levenshtein(p, normName(s));
    if (d < bestDist) {
      bestDist = d;
      fuzzyBest = s;
    }
  }
  const threshold = p.length >= 6 ? 3 : 2;
  return bestDist <= threshold ? fuzzyBest : null;
}

export interface VoiceRouteIntent {
  /** شناسه ایستگاه مبدأ — null یعنی در جمله نبود (ممکن است با GPS پر شود) */
  fromId: string | null;
  /** شناسه ایستگاه مقصد — null یعنی در جمله نبود */
  toId: string | null;
  /** حداقل یک ایستگاه یا نشانه شهری شناسایی شد؟ */
  matched: boolean;
  /** «از اینجا» گفته شده — مبدأ باید از GPS گرفته شود */
  originFromHere: boolean;
  /** وسیله نقلیه تشخیص داده‌شده — null یعنی نگفت (پیش‌فرض بهترین حالت) */
  mode: TravelMode | null;
  /** نشانه شهری (POI) مقصد — بیمارستان میلاد، برج میلاد، ... */
  poiId: string | null;
  /** نشانه شهری (POI) مبدأ */
  poiFromId: string | null;
}

/** استخراج مبدأ و مقصد از جمله فارسی — ایستگاه + نشانه شهری + وسیله نقلیه
    pois اختیاری است؛ پیش‌فرض همه نشانه‌های شهری درمسیر */
export function parseVoiceRoute(
  text: string,
  stations: StationDef[],
  pois: CityPoi[] = CITY_POIS
): VoiceRouteIntent {
  const t = normalizeFa(text);
  const mode = detectTravelMode(t);

  /** حل یک قطعه جمله به ایستگاه + نشانه شهری (هر دو مستقل امتحان می‌شوند) */
  const resolveSegment = (
    raw: string
  ): { st: StationDef | null; poi: CityPoi | null } => {
    const st = matchStationPhrase(raw, stations);
    const poi = matchPoiPhrase(raw, pois);
    return { st, poi };
  };

  const tryPair = (
    rawFrom: string | undefined,
    rawTo: string
  ): VoiceRouteIntent | null => {
    const from = rawFrom ? resolveSegment(rawFrom) : { st: null, poi: null };
    const to = resolveSegment(rawTo);
    if (!from.st && !from.poi && !to.st && !to.poi) return null;
    return {
      fromId: from.st?.id ?? null,
      toId: to.st?.id ?? null,
      matched: true,
      originFromHere: false,
      mode,
      poiId: to.poi?.id ?? null,
      poiFromId: from.poi?.id ?? null,
    };
  };

  /* ---------- الگوهای جفتی مبدأ/مقصد ---------- */
  const pairPatterns: { re: RegExp; here?: boolean }[] = [
    // «از اینجا تا تجریش» / «از ایستگاه فعلی تا تجریش»
    {
      re: /^.*?از\s+(?:اینجا|ایستگاه\s+فعلی|ایستگاه\s+حاضر|همین\s+جای?|ایستگاه\s+من)\s+(?:تا|به|روی?)\s+(.+)$/u,
      here: true,
    },
    // «از X تا Y» / «از X به Y» / «از X به سمت Y»
    { re: /از\s+(.+?)\s+(?:تا|به\s+سمت|به)\s+(.+)$/u },
    // «مبدأ X مقصد Y»
    { re: /مبدا\s+(.+?)\s+مقصد\s+(.+)$/u },
    // «مقصد Y از X»
    { re: /مقصد\s+(.+?)\s+از\s+(.+)$/u },
  ];
  for (const { re, here } of pairPatterns) {
    const m = t.match(re);
    if (!m) continue;
    if (here) {
      const to = resolveSegment(m[1]);
      if (to.st || to.poi) {
        return {
          fromId: null,
          toId: to.st?.id ?? null,
          matched: true,
          originFromHere: true,
          mode,
          poiId: to.poi?.id ?? null,
          poiFromId: null,
        };
      }
      continue;
    }
    const r = tryPair(m[1], m[2]);
    if (r) {
      // «مقصد Y از X» — ترتیب گروه‌ها برعکس است
      if (t.startsWith("مقصد") && r.fromId && r.toId) {
        return { ...r, fromId: r.toId, toId: r.fromId, poiId: r.poiFromId, poiFromId: r.poiId };
      }
      return r;
    }
  }

  /* ---------- فقط مقصد ---------- */
  const destPatterns: RegExp[] = [
    /(?:میخوام|میخواهم|بخوام|بخواهم)\s+(?:برم|برو|بریم|رفت?ن)\s+(?:به\s+|تا\s+|سمت\s+)?(.+)$/u,
    /(?:برم|برو|بریم)\s+(?:به\s+|تا\s+|سمت\s+)(.+)$/u,
    /(?:برم|برو|بریم)\s+(.+)$/u,
    /(?:مقصد|مسیر|ب).\s+(.+)$/u,
  ];
  for (const re of destPatterns) {
    const m = t.match(re);
    if (!m) continue;
    const to = resolveSegment(m[1]);
    if (to.st || to.poi) {
      return {
        fromId: null,
        toId: to.st?.id ?? null,
        matched: true,
        originFromHere: false,
        mode,
        poiId: to.poi?.id ?? null,
        poiFromId: null,
      };
    }
  }

  /* ---------- آخرین راه: نام ایستگاه/نشانه داخل جمله (طولانی‌ترین تطابق) ---------- */
  let found: StationDef | null = null;
  let foundLen = 0;
  for (const s of stations) {
    const n = normalizeFa(s.name);
    if (n.length >= 3 && t.includes(n) && n.length > foundLen) {
      found = s;
      foundLen = n.length;
    }
  }
  let foundPoi: CityPoi | null = null;
  let foundPoiLen = 0;
  for (const poi of pois) {
    const names = [poi.name, ...poi.aliases].map((x) => normalizeFa(x));
    for (const n of names) {
      if (n.length >= 5 && t.includes(n) && n.length > foundPoiLen) {
        foundPoi = poi;
        foundPoiLen = n.length;
      }
    }
  }
  if (foundPoi && foundPoiLen > foundLen) {
    return {
      fromId: null,
      toId: null,
      matched: true,
      originFromHere: false,
      mode,
      poiId: foundPoi.id,
      poiFromId: null,
    };
  }
  return {
    fromId: null,
    toId: found?.id ?? null,
    matched: found !== null || foundPoi !== null,
    originFromHere: false,
    mode,
    poiId: foundPoi?.id ?? null,
    poiFromId: null,
  };
}
