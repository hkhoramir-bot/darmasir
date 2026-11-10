/* ============================================================
   متروجو — هسته داده شبکه مترو
   Data core for the Metrojo transit network (Tehran + regional)
   ============================================================ */

export type CityId = "tehran" | "karaj" | "mashhad" | "isfahan";

export interface City {
  id: CityId;
  name: string;
  subtitle: string;
  lineIds: string[];
}

export interface LineDef {
  id: string;
  cityId: CityId;
  number: number;
  name: string; // خط ۱
  color: string;
  textOnColor: string;
  terminals: [string, string]; // [south/west side, north/east side] by array order
  direction: string; // شمال - جنوب
  headway: number; // minutes
  firstTrain: string; // 05:30
  lastTrain: string; // 23:00
  segmentMinutes: number; // avg travel time per adjacent hop
  badges?: string[]; // e.g. فرودگاه
  status?: "normal" | "crowded" | "delay" | "closed";
  statusNote?: string;
}

export interface StationDef {
  id: string;
  name: string;
  cityId: CityId;
  lines: { lineId: string; order: number }[]; // order: index along the line array
  amenities: AmenityKey[];
  featured?: boolean;
}

export type AmenityKey =
  | "elevator"
  | "escalator"
  | "wc"
  | "atm"
  | "baby"
  | "parking"
  | "bus"
  | "taxi"
  | "bike"
  | "wifi";

export const AMENITIES: Record<
  AmenityKey,
  { label: string; icon: string }
> = {
  elevator: { label: "آسانسور", icon: "elevator" },
  escalator: { label: "پله‌برقی", icon: "escalator" },
  wc: { label: "سرویس بهداشتی", icon: "wc" },
  atm: { label: "خودپرداز", icon: "local_atm" },
  baby: { label: "اتاق مادر و کودک", icon: "child_care" },
  parking: { label: "پارکینگ", icon: "local_parking" },
  bus: { label: "اتوبوس تندرو", icon: "directions_bus" },
  taxi: { label: "تاکسی درون‌شهری", icon: "local_taxi" },
  bike: { label: "دوچرخه عمومی", icon: "pedal_bike" },
  wifi: { label: "اینترنت رایگان", icon: "wifi" },
};

/* ------------------------------ Cities ------------------------------ */

export const CITIES: City[] = [
  {
    id: "tehran",
    name: "تهران",
    subtitle: "شبکه مترو پایتخت",
    lineIds: ["l1", "l2", "l3", "l4", "l5", "l6", "l7"],
  },
  {
    id: "karaj",
    name: "کرج",
    subtitle: "شبکه ریلی کلان‌شهر کرج",
    lineIds: ["l5", "k1"],
  },
  {
    id: "mashhad",
    name: "مشهد",
    subtitle: "قطار شهری مشهد مقدس",
    lineIds: ["m1", "m2"],
  },
  {
    id: "isfahan",
    name: "اصفهان",
    subtitle: "قطار شهری نصف جهان",
    lineIds: ["e1"],
  },
];

/* ------------------------------ Lines ------------------------------ */

export const LINES: LineDef[] = [
  {
    id: "l1",
    cityId: "tehran",
    number: 1,
    name: "خط ۱",
    color: "#e52421",
    textOnColor: "#ffffff",
    terminals: ["کهریزک", "تجریش"],
    direction: "شمال - جنوب",
    headway: 4,
    firstTrain: "05:30",
    lastTrain: "23:00",
    segmentMinutes: 2.4,
    status: "normal",
  },
  {
    id: "l2",
    cityId: "tehran",
    number: 2,
    name: "خط ۲",
    color: "#15397a",
    textOnColor: "#ffffff",
    terminals: ["صادقیه", "فرهنگسرا"],
    direction: "غرب - شرق",
    headway: 3.5,
    firstTrain: "05:45",
    lastTrain: "22:45",
    segmentMinutes: 2.2,
    status: "normal",
  },
  {
    id: "l3",
    cityId: "tehran",
    number: 3,
    name: "خط ۳",
    color: "#00a3e0",
    textOnColor: "#ffffff",
    terminals: ["آزادگان", "قائم"],
    direction: "شمال‌شرق - جنوب‌غرب",
    headway: 5,
    firstTrain: "06:00",
    lastTrain: "22:30",
    segmentMinutes: 2.5,
    status: "crowded",
    statusNote: "ازدحام بالا در ساعات اوج",
  },
  {
    id: "l4",
    cityId: "tehran",
    number: 4,
    name: "خط ۴",
    color: "#f6b400",
    textOnColor: "#1a1a1a",
    terminals: ["ارم سبز", "شهید کلاهدوز"],
    direction: "شرق - غرب",
    headway: 4.5,
    firstTrain: "05:40",
    lastTrain: "22:50",
    segmentMinutes: 2.3,
    badges: ["فرودگاه"],
    status: "normal",
  },
  {
    id: "l5",
    cityId: "tehran",
    number: 5,
    name: "خط ۵",
    color: "#009640",
    textOnColor: "#ffffff",
    terminals: ["صادقیه", "گلشهر (کرج)"],
    direction: "تهران - کرج",
    headway: 10,
    firstTrain: "06:15",
    lastTrain: "22:15",
    segmentMinutes: 4.5,
    status: "delay",
    statusNote: "تأخیر ۸ دقیقه‌ای در حرکت قطارها",
  },
  {
    id: "l6",
    cityId: "tehran",
    number: 6,
    name: "خط ۶",
    color: "#d82572",
    textOnColor: "#ffffff",
    terminals: ["دولت‌آباد", "شهید آرمان علی‌وردی"],
    direction: "جنوب‌شرق - شمال‌غرب",
    headway: 7,
    firstTrain: "06:00",
    lastTrain: "22:30",
    segmentMinutes: 2.6,
    status: "normal",
  },
  {
    id: "l7",
    cityId: "tehran",
    number: 7,
    name: "خط ۷",
    color: "#7d2382",
    textOnColor: "#ffffff",
    terminals: ["میدان کتاب", "بسیج"],
    direction: "شمال‌غرب - جنوب‌شرق",
    headway: 6,
    firstTrain: "06:00",
    lastTrain: "22:30",
    segmentMinutes: 2.4,
    status: "normal",
  },
  {
    id: "k1",
    cityId: "karaj",
    number: 1,
    name: "مترو کرج",
    color: "#009640",
    textOnColor: "#ffffff",
    terminals: ["محمدشهر", "گلشهر"],
    direction: "غرب - شرق",
    headway: 12,
    firstTrain: "06:30",
    lastTrain: "21:30",
    segmentMinutes: 4,
    status: "normal",
  },
  {
    id: "m1",
    cityId: "mashhad",
    number: 1,
    name: "خط ۱ مشهد",
    color: "#e52421",
    textOnColor: "#ffffff",
    terminals: ["وکیل‌آباد", "نواب"],
    direction: "جنوب‌غرب - شمال‌شرق",
    headway: 8,
    firstTrain: "06:00",
    lastTrain: "22:00",
    segmentMinutes: 2.6,
    status: "normal",
  },
  {
    id: "m2",
    cityId: "mashhad",
    number: 2,
    name: "خط ۲ مشهد",
    color: "#15397a",
    textOnColor: "#ffffff",
    terminals: ["شهرک غدیر", "طوریه"],
    direction: "غرب - شرق",
    headway: 10,
    firstTrain: "06:15",
    lastTrain: "21:45",
    segmentMinutes: 2.8,
    status: "normal",
  },
  {
    id: "e1",
    cityId: "isfahan",
    number: 1,
    name: "خط ۱ اصفهان",
    color: "#15397a",
    textOnColor: "#ffffff",
    terminals: ["شازینک", "صدره"],
    direction: "شمال - جنوب",
    headway: 12,
    firstTrain: "06:30",
    lastTrain: "21:30",
    segmentMinutes: 3.2,
    status: "normal",
  },
];

/* ------------------------------ Stations ------------------------------ */
/* order = index along line array (direction of terminals[0] -> terminals[1]) */

type RawStation = { id: string; name: string; line: string; order: number; amenities?: AmenityKey[]; featured?: boolean };

const RAW: RawStation[] = [
  // ---------- Tehran Line 1 (کهریزک -> تجریش) ----------
  { id: "kahrizak", name: "کهریزک", line: "l1", order: 0, featured: true },
  { id: "haram", name: "حرم مطهر امام خمینی", line: "l1", order: 1, featured: true },
  { id: "shahrerey", name: "شهر ری", line: "l1", order: 2 },
  { id: "javanmard", name: "جوانمرد قصاب", line: "l1", order: 3 },
  { id: "nabard", name: "نبرد", line: "l1", order: 4 },
  { id: "khorasan-l1", name: "خراسان", line: "l1", order: 5 },
  { id: "molavi", name: "مولوی", line: "l1", order: 6 },
  { id: "mohammadieh", name: "میدان محمدیه", line: "l1", order: 7, featured: true },
  { id: "panzdah", name: "پانزده خرداد", line: "l1", order: 8, featured: true },
  { id: "bazaar", name: "بازار بزرگ", line: "l1", order: 9, featured: true },
  { id: "emam-khomeini-sq", name: "میدان امام خمینی", line: "l1", order: 10, featured: true },
  { id: "dowlat", name: "دروازه دولت", line: "l1", order: 11, featured: true },
  { id: "taleghani", name: "طالقانی", line: "l1", order: 12 },
  { id: "beheshti", name: "شهید بهشتی", line: "l1", order: 13, featured: true },
  { id: "dr-shariati", name: "دکتر شریعتی", line: "l1", order: 14 },
  { id: "vanak-sq", name: "میدان ونک", line: "l1", order: 15, featured: true },
  { id: "saba", name: "میدان صبا", line: "l1", order: 16 },
  { id: "hemmat-l1", name: "همت", line: "l1", order: 17 },
  { id: "mirdamad", name: "میرداماد", line: "l1", order: 18, featured: true },
  { id: "gholhak", name: "قلهک", line: "l1", order: 19 },
  { id: "nobonyad", name: "نوبنیاد", line: "l1", order: 20, featured: true },
  { id: "shahid-sadr", name: "شهید صدر", line: "l1", order: 21 },
  { id: "tajrish", name: "تجریش", line: "l1", order: 22, featured: true },

  // ---------- Tehran Line 2 (صادقیه -> فرهنگسرا) ----------
  { id: "sadeghieh", name: "صادقیه", line: "l2", order: 0, featured: true },
  { id: "almahdi", name: "المهدی", line: "l2", order: 1 },
  { id: "shadman", name: "شادمان", line: "l2", order: 2 },
  { id: "enghelab-sq", name: "میدان انقلاب", line: "l2", order: 3, featured: true },
  { id: "emam-khomeini-sq", name: "میدان امام خمینی", line: "l2", order: 4, featured: true },
  { id: "hasanabad", name: "میدان حسن‌آباد", line: "l2", order: 5 },
  { id: "khorasan-sq", name: "میدان خراسان", line: "l2", order: 6, featured: true },
  { id: "resalat-sq", name: "میدان رسالت", line: "l2", order: 7 },
  { id: "shahid-kaveh", name: "شهید کاوه", line: "l2", order: 8 },
  { id: "farhangsara", name: "فرهنگسرا", line: "l2", order: 9, featured: true },

  // ---------- Tehran Line 3 (آزادگان -> قائم) ----------
  { id: "azadegan", name: "آزادگان", line: "l3", order: 0 },
  { id: "naziabad", name: "نازی‌آباد", line: "l3", order: 1 },
  { id: "theater-shahr", name: "تئاتر شهر (چهارراه ولیعصر)", line: "l3", order: 2, featured: true },
  { id: "haft-tir", name: "میدان هفت تیر", line: "l3", order: 3, featured: true },
  { id: "beheshti", name: "شهید بهشتی", line: "l3", order: 4, featured: true },
  { id: "baharestan", name: "بهارستان", line: "l3", order: 5 },
  { id: "emam-hossein-sq", name: "میدان امام حسین", line: "l3", order: 6, featured: true },
  { id: "zeynoddin", name: "شهید زین‌الدین", line: "l3", order: 7 },
  { id: "qaem", name: "قائم", line: "l3", order: 8, featured: true },

  // ---------- Tehran Line 4 (ارم سبز -> شهید کلاهدوز) ----------
  { id: "erm-sabz", name: "ارم سبز", line: "l4", order: 0, featured: true },
  { id: "mehrabad", name: "مهرآباد", line: "l4", order: 1 },
  { id: "towhid", name: "توحید", line: "l4", order: 2, featured: true },
  { id: "enghelab-sq", name: "میدان انقلاب", line: "l4", order: 3, featured: true },
  { id: "theater-shahr", name: "تئاتر شهر (چهارراه ولیعصر)", line: "l4", order: 4, featured: true },
  { id: "ferdowsi", name: "فردوسی", line: "l4", order: 5 },
  { id: "dowlat", name: "دروازه دولت", line: "l4", order: 6, featured: true },
  { id: "shohada-sq", name: "میدان شهدا", line: "l4", order: 7, featured: true },
  { id: "piroozi-sq", name: "میدان پیروزی", line: "l4", order: 8 },
  { id: "babaei", name: "شهید بابایی", line: "l4", order: 9 },
  { id: "kolahdouz", name: "شهید کلاهدوز", line: "l4", order: 10, featured: true },

  // ---------- Tehran Line 5 (صادقیه -> گلشهر) ----------
  { id: "sadeghieh", name: "صادقیه", line: "l5", order: 0, featured: true },
  { id: "chitgar", name: "چیتگر", line: "l5", order: 1 },
  { id: "vardavard", name: "وردآورد", line: "l5", order: 2 },
  { id: "mahdasht", name: "ماهداشت", line: "l5", order: 3 },
  { id: "andisheh", name: "اندیشه", line: "l5", order: 4 },
  { id: "golshahr", name: "گلشهر", line: "l5", order: 5, featured: true },

  // ---------- Tehran Line 6 (دولت‌آباد -> آرمان علی‌وردی) ----------
  { id: "dolatabad", name: "دولت‌آباد", line: "l6", order: 0 },
  { id: "khorasan-sq", name: "میدان خراسان", line: "l6", order: 1, featured: true },
  { id: "solh", name: "صلح", line: "l6", order: 2 },
  { id: "emam-hossein-sq", name: "میدان امام حسین", line: "l6", order: 3, featured: true },
  { id: "mahdieh", name: "مهدیه", line: "l6", order: 4, featured: true },
  { id: "valiasr-sq", name: "میدان ولیعصر", line: "l6", order: 5 },
  { id: "aliardi", name: "شهید آرمان علی‌وردی", line: "l6", order: 6 },

  // ---------- Tehran Line 7 (میدان کتاب -> بسیج) ----------
  { id: "ketab-sq", name: "میدان کتاب", line: "l7", order: 0, featured: true },
  { id: "towhid", name: "توحید", line: "l7", order: 1, featured: true },
  { id: "sanat-sq", name: "میدان صنعت", line: "l7", order: 2, featured: true },
  { id: "mahdieh", name: "مهدیه", line: "l7", order: 3, featured: true },
  { id: "mohammadieh", name: "میدان محمدیه", line: "l7", order: 4, featured: true },
  { id: "basij", name: "بسیج", line: "l7", order: 5, featured: true },

  // ---------- Karaj ----------
  { id: "kr-mohammadshahr", name: "محمدشهر", line: "k1", order: 0 },
  { id: "kr-mehrshahr", name: "مهرشهر", line: "k1", order: 1 },
  { id: "kr-karaj", name: "کرج (میدان آزادگان)", line: "k1", order: 2, featured: true },
  { id: "kr-azimieh", name: "عظیمیه", line: "k1", order: 3 },
  { id: "kr-golshahr", name: "گلشهر کرج", line: "k1", order: 4, featured: true },

  // ---------- Mashhad ----------
  { id: "mh-vakilabad", name: "وکیل‌آباد", line: "m1", order: 0, featured: true },
  { id: "mh-kuhsangi", name: "کوهسنگی", line: "m1", order: 1 },
  { id: "mh-shohada", name: "میدان شهدا", line: "m1", order: 2 },
  { id: "mh-haram", name: "حرم مطهر امام رضا (ع)", line: "m1", order: 3, featured: true },
  { id: "mh-navab", name: "نواب", line: "m1", order: 4, featured: true },
  { id: "mh-ghadir", name: "شهرک غدیر", line: "m2", order: 0 },
  { id: "mh-mosalla", name: "مصلی", line: "m2", order: 1 },
  { id: "mh-taqiabad", name: "تقی‌آباد", line: "m2", order: 2 },
  { id: "mh-torghabeh", name: "طوریه", line: "m2", order: 3 },

  // ---------- Isfahan ----------
  { id: "es-sadre", name: "صدره", line: "e1", order: 0, featured: true },
  { id: "es-azadi-sq", name: "میدان آزادی", line: "e1", order: 1 },
  { id: "es-chaharbagh", name: "چهارباغ", line: "e1", order: 2, featured: true },
  { id: "es-siosopol", name: "سی‌وسه‌پل", line: "e1", order: 3 },
  { id: "es-kaveh", name: "کاوه", line: "e1", order: 4 },
  { id: "es-shazand", name: "شازینک", line: "e1", order: 5 },
];

/* derive stations: merge same-id entries across lines (interchanges are separate ids) */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const AMENITY_POOL: AmenityKey[] = [
  "escalator", "elevator", "wc", "atm", "bus", "taxi", "parking", "baby", "bike", "wifi",
];

export const STATIONS: StationDef[] = RAW.map((r) => {
  const h = hash(r.id);
  const pool = AMENITY_POOL.filter((_, i) => (h >> i) % 3 !== 0);
  const amenities = r.amenities ?? (pool.length >= 3 ? pool.slice(0, 3 + (h % 3)) : ["escalator" as AmenityKey]);
  return {
    id: r.id,
    name: r.name,
    cityId: LINES.find((l) => l.id === r.line)!.cityId,
    lines: [{ lineId: r.line, order: r.order }],
    amenities,
    featured: r.featured,
  };
}).reduce<StationDef[]>((acc, s) => {
  const found = acc.find((x) => x.id === s.id);
  if (found) found.lines.push(...s.lines);
  else acc.push(s);
  return acc;
}, []);

/* ------------------------------ Lookup helpers ------------------------------ */

export function getCity(id: CityId): City {
  return CITIES.find((c) => c.id === id) ?? CITIES[0];
}
export function getLine(id: string): LineDef {
  return LINES.find((l) => l.id === id) ?? LINES[0];
}
export function getStation(id: string): StationDef | undefined {
  return STATIONS.find((s) => s.id === id);
}
export function stationsOfLine(lineId: string): StationDef[] {
  const line = getLine(lineId);
  return STATIONS.filter((s) => s.lines.some((l) => l.lineId === lineId)).sort(
    (a, b) =>
      a.lines.find((l) => l.lineId === lineId)!.order -
      b.lines.find((l) => l.lineId === lineId)!.order
  );
}
export function interchangeLinesOf(stationId: string): string[] {
  const s = getStation(stationId);
  return s ? s.lines.map((l) => l.lineId) : [];
}
export function lineInterchanges(lineId: string): string[] {
  return STATIONS.filter((s) => s.lines.length > 1 && s.lines.some((l) => l.lineId === lineId))
    .map((s) => s.id);
}

/* ------------------------------ Persian formatting ------------------------------ */

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
export function toFa(n: number | string): string {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
export function toEnDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
export function faMoney(n: number): string {
  return toFa(n.toLocaleString("en-US"));
}

/* ------------------------------ Simulated live ops ------------------------------ */

export function nextArrivals(lineId: string, stationId: string, now = Date.now()): number[] {
  const line = getLine(lineId);
  const headwaySec = Math.round(line.headway * 60);
  const phase = hash(stationId + lineId + new Date(now).getHours()) % headwaySec;
  const elapsed = Math.floor(now / 1000) % headwaySec;
  let next = phase - elapsed;
  while (next <= 0) next += headwaySec;
  const late = line.status === "delay" ? 8 * 60 : 0;
  return [next + late, next + headwaySec + late];
}

export type CrowdLevel = "quiet" | "moderate" | "busy";

export function crowdingNow(lineId: string, now = new Date()): CrowdLevel {
  const h = now.getHours();
  const peak = (h >= 7 && h <= 9) || (h >= 16.5 && h <= 19);
  const mid = (h >= 10 && h <= 16) || (h >= 19.5 && h <= 22);
  const line = getLine(lineId);
  if (line.status === "crowded") return peak ? "busy" : mid ? "busy" : "moderate";
  if (peak) return hash(lineId + h) % 4 === 0 ? "quiet" : "busy";
  if (mid) return hash(lineId + h) % 3 === 0 ? "busy" : "moderate";
  return hash(lineId + h) % 3 === 0 ? "moderate" : "quiet";
}

export const CROWD_LABEL: Record<CrowdLevel, string> = {
  quiet: "خلوت",
  moderate: "ازدحام متوسط",
  busy: "شلوغ",
};
export const CROWD_COLOR: Record<CrowdLevel, string> = {
  quiet: "#006638",
  moderate: "#b45309",
  busy: "#bc000c",
};

/* ------------------------------ Timetable ------------------------------ */

export interface TimetableRow {
  direction: string;
  first: string;
  last: string;
  headwayPeak: string;
  headwayOff: string;
}

export function timetableFor(lineId: string): TimetableRow[] {
  const line = getLine(lineId);
  const fmt = (t: string, add = 0) => {
    const [h, m] = t.split(":").map(Number);
    const mm = m + add;
    return toFa(`${String(h + Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`);
  };
  return [
    {
      direction: `به سمت ${line.terminals[1]}`,
      first: fmt(line.firstTrain),
      last: fmt(line.lastTrain),
      headwayPeak: toFa(`${line.headway} دقیقه`),
      headwayOff: toFa(`${Math.round(line.headway * 1.6 * 2) / 2} دقیقه`),
    },
    {
      direction: `به سمت ${line.terminals[0]}`,
      first: fmt(line.firstTrain, 5),
      last: fmt(line.lastTrain, -6),
      headwayPeak: toFa(`${Math.round(line.headway * 1.15 * 2) / 2} دقیقه`),
      headwayOff: toFa(`${Math.round(line.headway * 1.8 * 2) / 2} دقیقه`),
    },
  ];
}

/* ------------------------------ Exits, equipment, landmarks ------------------------------ */

export interface ExitDef {
  label: string;
  direction: string;
  accessibility: string;
  landmarks: string[];
}

const FEATURED_EXITS: Record<string, ExitDef[]> = {
  dowlat: [
    { label: "خروجی ۱", direction: "شمال شرقی", accessibility: "پله‌برقی + رمپ", landmarks: ["میدان انقلاب اسلامی", "پارک ملت"] },
    { label: "خروجی ۲", direction: "شمال غربی", accessibility: "آسانسور فعال", landmarks: ["موزه ملی ایران", "سازمان اسناد"] },
    { label: "خروجی ۳", direction: "جنوب شرقی", accessibility: "پله‌برقی", landmarks: ["دانشگاه امیرکبیر", "خیابان طالقانی"] },
    { label: "خروجی ۴", direction: "جنوب غربی", accessibility: "رمپ", landmarks: ["بازار فرش", "تالار فردوسی"] },
  ],
  "theater-shahr": [
    { label: "خروجی ۱", direction: "شمال شرقی", accessibility: "پله برقی + رمپ", landmarks: ["مجموعه تئاتر شهر (۵۰ متر)", "پارک دانشجو"] },
    { label: "خروجی ۲", direction: "شمال غربی", accessibility: "آسانسور فعال", landmarks: ["دانشگاه تهران (۷ دقیقه پیاده)", "راسته ناشران و کتاب‌فروشی‌ها"] },
    { label: "خروجی ۳", direction: "جنوب شرقی", accessibility: "پله‌برقی", landmarks: ["تالار وحدت (۴۰۰ متر)", "پارکینگ طبقاتی رازی"] },
    { label: "خروجی ۴", direction: "جنوب غربی", accessibility: "رمپ", landmarks: ["چهارراه ولیعصر", "ایستگاه BRT ولیعصر"] },
  ],
  tajrish: [
    { label: "خروجی ۱", direction: "شمال", accessibility: "پله‌برقی + آسانسور", landmarks: ["میدان تجریش", "بازار تجریش"] },
    { label: "خروجی ۲", direction: "شرق", accessibility: "پله‌برقی", landmarks: ["موزه ابگر", "پارک ساعی"] },
    { label: "خروجی ۳", direction: "غرب", accessibility: "رمپ", landmarks: ["درکه (۱۵ دقیقه پیاده)", "پیست دوچرخه‌سواری"] },
  ],
  "enghelab-sq": [
    { label: "خروجی ۱", direction: "شمال", accessibility: "آسانسور فعال", landmarks: ["دانشگاه تهران", "پیاده‌راه انقلاب"] },
    { label: "خروجی ۲", direction: "جنوب", accessibility: "پله‌برقی", landmarks: ["دانشگاه صنعتی امیرکبیر", "خیابان ۱۶ آذر"] },
    { label: "خروجی ۳", direction: "شرق", accessibility: "پله‌برقی", landmarks: ["میدان فردوسی", "هتل فردوسی"] },
    { label: "خروجی ۴", direction: "غرب", accessibility: "رمپ", landmarks: ["خیابان آزادی", "پارک لاله"] },
  ],
  "emam-khomeini-sq": [
    { label: "خروجی ۱", direction: "شمال", accessibility: "پله‌برقی", landmarks: ["میدان توپخانه", "ساختمان شهرداری"] },
    { label: "خروجی ۲", direction: "جنوب", accessibility: "آسانسور فعال", landmarks: ["بازار تهران (دروازه)", "کاخ گلستان (۱۰ دقیقه)"] },
  ],
};

export function exitsFor(stationId: string): ExitDef[] {
  if (FEATURED_EXITS[stationId]) return FEATURED_EXITS[stationId];
  const h = hash(stationId);
  const dirs = ["شمال شرقی", "شمال غربی", "جنوب شرقی", "جنوب غربی"];
  const acc = ["پله‌برقی", "آسانسور فعال", "رمپ ویژه ویلچر", "پله ثابت"];
  const n = 2 + (h % 3);
  return Array.from({ length: n }, (_, i) => ({
    label: `خروجی ${toFa(i + 1)}`,
    direction: dirs[(h + i) % 4],
    accessibility: acc[(h + i) % 4],
    landmarks: [],
  }));
}

export interface EquipmentStatus {
  type: "escalator" | "elevator" | "ramp";
  typeLabel: string;
  exits: string[];
  total: number;
  active: number;
  note?: string;
}

export function equipmentFor(stationId: string): EquipmentStatus[] {
  const h = hash("eq" + stationId);
  const escT = 6 + (h % 8);
  const escA = escT - (h % 3);
  const elT = 2 + (h % 3);
  const elA = h % 5 === 0 ? elT - 1 : elT;
  return [
    {
      type: "escalator",
      typeLabel: "پله‌برقی",
      exits: ["خروجی ۱", "خروجی ۲", "سکوی اصلی"],
      total: escT,
      active: escA,
      note: escA < escT ? `${toFa(escT - escA)} دستگاه در حال سرویس` : undefined,
    },
    {
      type: "elevator",
      typeLabel: "آسانسور",
      exits: ["خروجی ۱", "سکوی خط"],
      total: elT,
      active: elA,
      note: elA < elT ? `${toFa(elT - elA)} دستگاه در دست بهسازی` : undefined,
    },
    {
      type: "ramp",
      typeLabel: "رمپ متحرک",
      exits: ["ورودی اصلی"],
      total: 2,
      active: 2,
    },
  ];
}

const LANDMARKS: Record<string, string[]> = {
  tajrish: ["بازار تجریش", "موزه ابگر", "کاخ سعدآباد", "پارک ملت"],
  dowlat: ["موزه ملی ایران", "دانشگاه امیرکبیر", "تالار فردوسی"],
  "theater-shahr": ["تئاتر شهر", "دانشگاه تهران", "تالار وحدت", "پارک دانشجو"],
  "enghelab-sq": ["دانشگاه تهران", "دانشگاه امیرکبیر", "پارک لاله"],
  bazaar: ["بازار بزرگ تهران", "مسجد شاه", "کاخ گلستان"],
  "emam-khomeini-sq": ["کاخ گلستان", "موزه ملی", "بازار تهران"],
  "haram": ["حرم مطهر امام خمینی", "بهشت زهرا"],
  "farhangsara": ["بوستان نهر آب", "بازار مبل هفت حوض"],
  "vanak-sq": ["میدان ونک", "برج نگین ایران", "پارک ونک"],
  "qaem": ["بازار قائم", "بوستان لویزان"],
  "kolahdouz": ["پایانه شرق", "بزرگراه بابایی"],
  "sadeghieh": ["پایانه غرب", "بازار صادقیه"],
  "mirdamad": ["بازار میرداماد", "پارک طالقانی"],
  "nobonyad": ["بوستان گفتگو", "مجتمع نیلوفر"],
  "mh-haram": ["حرم مطهر امام رضا (ع)", "بازار رضا", "موزه آستان قدس"],
  "es-chaharbagh": ["میدان نقش جهان", "سی‌وسه‌پل", "کاخ چهلستون"],
  "kr-karaj": ["دریاچه کرج", "میدان آزادگان", "بازار کرج"],
};

export function landmarksFor(stationId: string): string[] {
  return LANDMARKS[stationId] ?? [];
}

/* ------------------------------ Route engine ------------------------------ */

export interface RouteLeg {
  lineId: string;
  lineName: string;
  color: string;
  textOnColor: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  stationIds: string[];
  stationNames: string[];
  stops: number;
  minutes: number;
}

export interface RoutePlan {
  legs: RouteLeg[];
  totalMinutes: number;
  totalStations: number;
  transfers: number;
  transferStations: string[];
  fare: number;
  pref: "fastest" | "least_transfers" | "quietest";
  crowdNote: string;
}

const TRANSFER_MIN = 4.5;
const BOARDING_MIN = 1.5;

export function fareFor(stops: number): number {
  if (stops <= 6) return 2800;
  if (stops <= 12) return 3200;
  if (stops <= 20) return 3800;
  return 4500;
}

interface State {
  station: string;
  line: string | null;
  time: number;
  transfers: number;
  path: { station: string; line: string | null }[];
}

/** Dijkstra over (station, line) states. */
export function computeRoute(
  fromId: string,
  toId: string,
  pref: "fastest" | "least_transfers" | "quietest" = "fastest",
  now = new Date()
): RoutePlan | null {
  const from = getStation(fromId);
  const to = getStation(toId);
  if (!from || !to || fromId === toId) return null;

  const seg = (lineId: string) => {
    const base = getLine(lineId).segmentMinutes;
    const crowd = crowdingNow(lineId, now);
    const factor = pref === "quietest" ? (crowd === "busy" ? 1.35 : crowd === "moderate" ? 1.1 : 0.95) : 1;
    return base * factor;
  };

  const start: State = { station: fromId, line: null, time: 0, transfers: 0, path: [{ station: fromId, line: null }] };
  const best = new Map<string, number>();
  const key = (s: State) => `${s.station}|${s.line ?? "*"}`;
  const queue: State[] = [start];
  best.set(key(start), 0);

  let done: State | null = null;
  const visited = new Set<string>();

  while (queue.length) {
    // pick min
    let idx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].time < queue[idx].time) idx = i;
    }
    const cur = queue.splice(idx, 1)[0];
    if (visited.has(key(cur))) continue;
    visited.add(key(cur));

    if (cur.station === toId) {
      done = cur;
      break;
    }

    const st = getStation(cur.station)!;
    for (const ls of st.lines) {
      // board / continue on line ls.lineId
      const isTransfer = cur.line !== null && cur.line !== ls.lineId;
      const penalty = cur.line === null ? BOARDING_MIN : isTransfer ? TRANSFER_MIN : 0;
      const transferCost =
        pref === "least_transfers" ? (isTransfer ? 40 : 0) : 0;

      // neighbors along the line
      const list = stationsOfLine(ls.lineId);
      const myIdx = list.findIndex((x) => x.id === cur.station);
      for (const delta of [-1, 1]) {
        const nIdx = myIdx + delta;
        if (nIdx < 0 || nIdx >= list.length) continue;
        const nb = list[nIdx];
        const t = cur.time + seg(ls.lineId) + penalty + transferCost;
        const ns: State = {
          station: nb.id,
          line: ls.lineId,
          time: t,
          transfers: cur.transfers + (isTransfer ? 1 : 0),
          path: [...cur.path, { station: nb.id, line: ls.lineId }],
        };
        const k = key(ns);
        if (!best.has(k) || t < best.get(k)! - 1e-9) {
          best.set(k, t);
          queue.push(ns);
        }
      }
    }
  }

  if (!done) return null;

  // compress path into legs
  const legs: RouteLeg[] = [];
  const path = done.path.slice(1);
  let curLine: string | null = null;
  let legStart = path[0].station;
  let prev = fromId;

  const flush = (endStation: string) => {
    if (!curLine) return;
    const line = getLine(curLine);
    const ids = stationsOfLine(curLine).map((s) => s.id);
    const i1 = ids.indexOf(legStart);
    const i2 = ids.indexOf(endStation);
    const slice = i1 <= i2 ? ids.slice(i1, i2 + 1) : ids.slice(i2, i1 + 1).reverse();
    const names = slice.map((id) => getStation(id)!.name);
    legs.push({
      lineId: curLine,
      lineName: line.name,
      color: line.color,
      textOnColor: line.textOnColor,
      fromId: slice[0],
      fromName: names[0],
      toId: slice[slice.length - 1],
      toName: names[names.length - 1],
      stationIds: slice,
      stationNames: names,
      stops: slice.length - 1,
      minutes: Math.max(1, Math.round((slice.length - 1) * line.segmentMinutes)),
    });
  };

  for (const step of path) {
    if (curLine === null) {
      curLine = step.line;
      legStart = prev;
    } else if (step.line !== curLine) {
      flush(prev);
      curLine = step.line;
      legStart = prev;
    }
    prev = step.station;
  }
  flush(prev);

  const totalStops = legs.reduce((a, l) => a + l.stops, 0);
  // زمان نمایشی واقعی = جمع زمان لگ‌ها + هزینه تعویض خط + سوار شدن (بدون وزن بهینه‌سازی)
  const totalMinutes = Math.round(
    legs.reduce((a, l) => a + l.minutes, 0) + (legs.length - 1) * TRANSFER_MIN + BOARDING_MIN
  );
  const transferStations = legs.slice(0, -1).map((l) => l.toName);
  const busyLeg = legs.find((l) => crowdingNow(l.lineId, now) === "busy");

  return {
    legs,
    totalMinutes,
    totalStations: totalStops + 1,
    transfers: legs.length - 1,
    transferStations,
    fare: fareFor(totalStops),
    pref,
    crowdNote: busyLeg
      ? `ازدحام بالا روی ${busyLeg.lineName} در ساعات اوج`
      : "سرویس‌دهی همه خطوط مسیر عادی و روان است",
  };
}

/* ------------------------------ Search ------------------------------ */

export function amenitiesLabels(keys: AmenityKey[]): { key: AmenityKey; label: string; icon: string }[] {
  return keys.map((k) => ({ key: k, label: AMENITIES[k].label, icon: AMENITIES[k].icon }));
}

export function searchStations(opts: {
  q?: string;
  lineId?: string;
  facility?: AmenityKey;
  cityId?: CityId;
}): StationDef[] {
  const q = opts.q?.trim();
  let res = STATIONS;
  if (opts.cityId) res = res.filter((s) => s.cityId === opts.cityId);
  if (opts.lineId) res = res.filter((s) => s.lines.some((l) => l.lineId === opts.lineId));
  if (opts.facility) res = res.filter((s) => s.amenities.includes(opts.facility!));
  if (q) {
    const nq = toEnDigits(q).toLowerCase();
    res = res.filter(
      (s) => s.name.toLowerCase().includes(nq) || s.name.replace(/ /g, "").includes(nq.replace(/ /g, ""))
    );
  }
  return res;
}
