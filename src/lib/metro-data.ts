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
  headway: number; // minutes — فاصله پیش‌فرض (fallback)
  headwayPeak?: number; // فاصله حرکت در ساعات اوج — جدول رسمی ۱۴۰۴
  headwayOff?: number; // فاصله حرکت در ساعات غیراوج — جدول رسمی ۱۴۰۴
  firstTrain: string; // 04:30
  lastTrain: string; // 22:30
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
/* ساعات و سرفاصله‌ها بر اساس جدول حرکت رسمی شرکت مترو تهران:
   شنبه تا چهارشنبه از ۵:۳۰ تا ۲۲:۳۰ — پنجشنبه ۶:۰۰ — جمعه ۶:۳۰ */

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
    headway: 5,
    headwayPeak: 5,
    headwayOff: 10,
    firstTrain: "05:30",
    lastTrain: "22:30",
    segmentMinutes: 2.6,
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
    headway: 6,
    headwayPeak: 6,
    headwayOff: 10,
    firstTrain: "05:30",
    lastTrain: "22:30",
    segmentMinutes: 2.1,
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
    headway: 8,
    headwayPeak: 8,
    headwayOff: 12,
    firstTrain: "05:30",
    lastTrain: "22:30",
    segmentMinutes: 2.1,
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
    terminals: ["علامه جعفری", "شهید کلاهدوز"],
    direction: "غرب - شرق",
    headway: 6,
    headwayPeak: 6,
    headwayOff: 10,
    firstTrain: "05:30",
    lastTrain: "22:30",
    segmentMinutes: 2,
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
    terminals: ["صادقیه", "شهید قاسم سلیمانی"],
    direction: "تهران - کرج",
    headway: 12,
    headwayPeak: 12,
    headwayOff: 15,
    firstTrain: "05:30",
    lastTrain: "22:30",
    segmentMinutes: 4,
    status: "normal",
  },
  {
    id: "l6",
    cityId: "tehran",
    number: 6,
    name: "خط ۶",
    color: "#d82572",
    textOnColor: "#ffffff",
    terminals: ["شهدای دولت‌آباد", "شهید آرمان علی‌وردی"],
    direction: "جنوب‌شرق - شمال‌غرب",
    headway: 10,
    headwayPeak: 10,
    headwayOff: 12,
    firstTrain: "05:30",
    lastTrain: "22:30",
    segmentMinutes: 2,
    status: "normal",
  },
  {
    id: "l7",
    cityId: "tehran",
    number: 7,
    name: "خط ۷",
    color: "#7d2382",
    textOnColor: "#ffffff",
    terminals: ["ورزشگاه تختی", "میدان کتاب"],
    direction: "جنوب‌شرق - شمال‌غرب",
    headway: 12,
    headwayPeak: 12,
    headwayOff: 15,
    firstTrain: "05:30",
    lastTrain: "22:30",
    segmentMinutes: 2,
    status: "normal",
  },
  {
    id: "k1",
    cityId: "karaj",
    number: 1,
    name: "مترو کرج",
    color: "#009640",
    textOnColor: "#ffffff",
    terminals: ["آیت‌الله طالقانی", "چهل‌وپنج متری گلشهر"],
    direction: "شمال - جنوب",
    headway: 15,
    headwayPeak: 15,
    headwayOff: 15,
    firstTrain: "06:30",
    lastTrain: "21:30",
    segmentMinutes: 3.5,
    status: "normal",
  },
  {
    id: "m1",
    cityId: "mashhad",
    number: 1,
    name: "خط ۱ مشهد",
    color: "#e52421",
    textOnColor: "#ffffff",
    terminals: ["وکیل‌آباد", "فرودگاه شهید هاشمی‌نژاد"],
    direction: "جنوب‌غرب - شمال‌شرق",
    headway: 6,
    headwayPeak: 6,
    headwayOff: 10,
    firstTrain: "06:00",
    lastTrain: "22:00",
    segmentMinutes: 2,
    status: "normal",
  },
  {
    id: "m2",
    cityId: "mashhad",
    number: 2,
    name: "خط ۲ مشهد",
    color: "#15397a",
    textOnColor: "#ffffff",
    terminals: ["طبرسی", "شهید فکوری"],
    direction: "شمال‌غرب - جنوب‌شرق",
    headway: 10,
    headwayPeak: 10,
    headwayOff: 15,
    firstTrain: "06:15",
    lastTrain: "21:45",
    segmentMinutes: 2,
    status: "normal",
  },
  {
    id: "e1",
    cityId: "isfahan",
    number: 1,
    name: "خط ۱ اصفهان",
    color: "#15397a",
    textOnColor: "#ffffff",
    terminals: ["قدس", "دفاع مقدس"],
    direction: "شمال - جنوب",
    headway: 12,
    headwayPeak: 12,
    headwayOff: 15,
    firstTrain: "06:00",
    lastTrain: "22:00",
    segmentMinutes: 2.2,
    status: "normal",
  },
];

/* ------------------------------ Stations ------------------------------ */
/* order = index along line array (direction of terminals[0] -> terminals[1]) */

type RawStation = { id: string; name: string; line: string; order: number; amenities?: AmenityKey[]; featured?: boolean };

const RAW: RawStation[] = [
  // ---------- تهران | خط ۱ (کهریزک -> تجریش) — ۲۹ ایستگاه ----------
  { id: "kahrizak", name: "کهریزک", line: "l1", order: 0, featured: true },
  { id: "haram", name: "حرم مطهر امام خمینی", line: "l1", order: 1, featured: true },
  { id: "shahed-baghershahr", name: "شاهد - باقرشهر", line: "l1", order: 2 },
  { id: "palayeshgah", name: "پالایشگاه", line: "l1", order: 3 },
  { id: "shahrerey", name: "شهرری", line: "l1", order: 4 },
  { id: "javanmard", name: "جوانمرد قصاب", line: "l1", order: 5 },
  { id: "aliabad", name: "علی‌آباد", line: "l1", order: 6 },
  { id: "bokharaei", name: "شهید بخارایی", line: "l1", order: 7 },
  { id: "payane-jonub", name: "پایانه جنوب", line: "l1", order: 8 },
  { id: "shush", name: "شوش", line: "l1", order: 9 },
  { id: "mohammadieh", name: "میدان محمدیه", line: "l1", order: 10, featured: true },
  { id: "khayyam", name: "خیام", line: "l1", order: 11 },
  { id: "panzdah", name: "پانزده خرداد", line: "l1", order: 12, featured: true },
  { id: "emam-khomeini-sq", name: "امام خمینی", line: "l1", order: 13, featured: true },
  { id: "saadi", name: "سعدی", line: "l1", order: 14 },
  { id: "dowlat", name: "دروازه دولت", line: "l1", order: 15, featured: true },
  { id: "taleghani", name: "طالقانی", line: "l1", order: 16 },
  { id: "haft-tir", name: "شهدای هفتم تیر", line: "l1", order: 17, featured: true },
  { id: "mofatteh", name: "شهید مفتح", line: "l1", order: 18 },
  { id: "beheshti", name: "شهید بهشتی", line: "l1", order: 19, featured: true },
  { id: "mosalla", name: "مصلی امام خمینی", line: "l1", order: 20 },
  { id: "hemmat", name: "شهید همت", line: "l1", order: 21 },
  { id: "haghdani", name: "شهید حقانی", line: "l1", order: 22 },
  { id: "mirdamad", name: "میرداماد", line: "l1", order: 23, featured: true },
  { id: "dr-shariati", name: "دکتر شریعتی", line: "l1", order: 24 },
  { id: "gholhak", name: "قلهک", line: "l1", order: 25 },
  { id: "shahid-sadr", name: "شهید صدر", line: "l1", order: 26 },
  { id: "ghitrieh", name: "قیطریه", line: "l1", order: 27 },
  { id: "tajrish", name: "تجریش", line: "l1", order: 28, featured: true },

  // ---------- تهران | خط ۲ (صادقیه -> فرهنگسرا) — ۲۲ ایستگاه ----------
  { id: "sadeghieh", name: "صادقیه", line: "l2", order: 0, featured: true },
  { id: "tarasht", name: "طرشت", line: "l2", order: 1 },
  { id: "sharif", name: "دانشگاه شریف", line: "l2", order: 2 },
  { id: "shadman", name: "شادمان", line: "l2", order: 3, featured: true },
  { id: "navab-safavi", name: "شهید نواب صفوی", line: "l2", order: 4, featured: true },
  { id: "maidan-harr", name: "میدان حر", line: "l2", order: 5 },
  { id: "imam-ali", name: "دانشگاه امام علی", line: "l2", order: 6 },
  { id: "hassanabad", name: "حسن‌آباد", line: "l2", order: 7 },
  { id: "emam-khomeini-sq", name: "امام خمینی", line: "l2", order: 8, featured: true },
  { id: "mellat", name: "ملت", line: "l2", order: 9 },
  { id: "baharestan", name: "بهارستان", line: "l2", order: 10 },
  { id: "darvazeh-shemiran", name: "دروازه شمیران", line: "l2", order: 11 },
  { id: "emam-hossein-sq", name: "امام حسین", line: "l2", order: 12, featured: true },
  { id: "madani", name: "شهید مدنی", line: "l2", order: 13 },
  { id: "sabalan", name: "سبلان", line: "l2", order: 14 },
  { id: "fedak", name: "فدک", line: "l2", order: 15 },
  { id: "janbazan", name: "جانبازان", line: "l2", order: 16 },
  { id: "sarasab", name: "سرسبز", line: "l2", order: 17 },
  { id: "elm-o-sanat", name: "دانشگاه علم و صنعت", line: "l2", order: 18 },
  { id: "baghery", name: "شهید باقری", line: "l2", order: 19 },
  { id: "tehranpars", name: "تهرانپارس", line: "l2", order: 20 },
  { id: "farhangsara", name: "فرهنگسرا", line: "l2", order: 21, featured: true },

  // ---------- تهران | خط ۳ (آزادگان -> قائم) — ۲۵ ایستگاه ----------
  { id: "azadegan", name: "آزادگان", line: "l3", order: 0 },
  { id: "nematabad", name: "نعمت‌آباد", line: "l3", order: 1 },
  { id: "abdolabad", name: "عبدل‌آباد", line: "l3", order: 2 },
  { id: "shahrak-shariati", name: "شهرک شریعتی", line: "l3", order: 3 },
  { id: "zamzam", name: "زمزم", line: "l3", order: 4 },
  { id: "javadieh", name: "جوادیه", line: "l3", order: 5 },
  { id: "rah-ahan", name: "راه‌آهن", line: "l3", order: 6 },
  { id: "mahdieh", name: "مهدیه", line: "l3", order: 7 },
  { id: "monirieh", name: "منیریه", line: "l3", order: 8 },
  { id: "theater-shahr", name: "تئاتر شهر", line: "l3", order: 9, featured: true },
  { id: "valiasr-sq", name: "میدان ولیعصر", line: "l3", order: 10, featured: true },
  { id: "maidan-jehad", name: "میدان جهاد", line: "l3", order: 11 },
  { id: "mirzaye-shirazi", name: "میرزای شیرازی", line: "l3", order: 12 },
  { id: "beheshti", name: "شهید بهشتی", line: "l3", order: 13, featured: true },
  { id: "sohravardi", name: "سهروردی", line: "l3", order: 14 },
  { id: "ghadousi", name: "شهید قدوسی", line: "l3", order: 15 },
  { id: "sayyad-shirazi", name: "شهید صیاد شیرازی", line: "l3", order: 16 },
  { id: "khajeh-ansari", name: "خواجه عبدالله انصاری", line: "l3", order: 17 },
  { id: "zeynoddin", name: "شهید زین‌الدین", line: "l3", order: 18 },
  { id: "harooni", name: "هروی", line: "l3", order: 19 },
  { id: "hosseinabad", name: "حسین‌آباد", line: "l3", order: 20 },
  { id: "nobonyad", name: "نوبنیاد", line: "l3", order: 21, featured: true },
  { id: "aghdasieh", name: "اقدسیه", line: "l3", order: 22 },
  { id: "mahallati", name: "شهید محلاتی", line: "l3", order: 23 },
  { id: "qaem", name: "قائم", line: "l3", order: 24, featured: true },

  // ---------- تهران | خط ۴ (علامه جعفری -> شهید کلاهدوز) — ۲۰ ایستگاه ----------
  { id: "alameh-jafari", name: "علامه جعفری", line: "l4", order: 0 },
  { id: "erm-sabz", name: "ارم سبز", line: "l4", order: 1, featured: true },
  { id: "ekbatan", name: "شهرک اکباتان", line: "l4", order: 2 },
  { id: "bimeh", name: "بیمه", line: "l4", order: 3 },
  { id: "azadi-sq", name: "میدان آزادی", line: "l4", order: 4 },
  { id: "moin", name: "استاد معین", line: "l4", order: 5 },
  { id: "habibollah", name: "دکتر حبیب‌الله", line: "l4", order: 6 },
  { id: "shadman", name: "شادمان", line: "l4", order: 7, featured: true },
  { id: "towhid", name: "توحید", line: "l4", order: 8, featured: true },
  { id: "enghelab-sq", name: "میدان انقلاب اسلامی", line: "l4", order: 9, featured: true },
  { id: "theater-shahr", name: "تئاتر شهر", line: "l4", order: 10, featured: true },
  { id: "ferdowsi", name: "فردوسی", line: "l4", order: 11 },
  { id: "dowlat", name: "دروازه دولت", line: "l4", order: 12, featured: true },
  { id: "darvazeh-shemiran", name: "دروازه شمیران", line: "l4", order: 13 },
  { id: "shohada-sq", name: "میدان شهدا", line: "l4", order: 14, featured: true },
  { id: "ibn-e-sina", name: "ابن‌سینا", line: "l4", order: 15 },
  { id: "piroozi-sq", name: "پیروزی", line: "l4", order: 16 },
  { id: "nabard", name: "نبرد", line: "l4", order: 17 },
  { id: "nirouhavaei", name: "نیروهوایی", line: "l4", order: 18 },
  { id: "kolahdouz", name: "شهید کلاهدوز", line: "l4", order: 19, featured: true },

  // ---------- تهران | خط ۵ (صادقیه -> شهید قاسم سلیمانی) — ۱۳ ایستگاه ----------
  { id: "sadeghieh", name: "صادقیه", line: "l5", order: 0, featured: true },
  { id: "erm-sabz", name: "ارم سبز", line: "l5", order: 1, featured: true },
  { id: "azadi-stadium", name: "ورزشگاه آزادی", line: "l5", order: 2 },
  { id: "chitgar", name: "چیتگر", line: "l5", order: 3 },
  { id: "iran-khodro", name: "ایران خودرو", line: "l5", order: 4 },
  { id: "vardavard", name: "وردآورد", line: "l5", order: 5 },
  { id: "garmdareh", name: "گرم‌دره", line: "l5", order: 6 },
  { id: "atmosfar", name: "اتمسفر", line: "l5", order: 7 },
  { id: "kr-soltani", name: "کرج (شهید سلطانی)", line: "l5", order: 8, featured: true },
  { id: "kr-mohammadshahr", name: "محمدشهر", line: "l5", order: 9 },
  { id: "golshahr", name: "گلشهر", line: "l5", order: 10, featured: true },
  { id: "fakhri-zadeh", name: "شهید فخری‌زاده", line: "l5", order: 11 },
  { id: "ghassem-solaymani", name: "شهید قاسم سلیمانی", line: "l5", order: 12 },

  // ---------- تهران | خط ۶ (شهدای دولت‌آباد -> شهید آرمان علی‌وردی) — ۲۶ ایستگاه ----------
  { id: "dolatabad", name: "شهدای دولت‌آباد", line: "l6", order: 0, featured: true },
  { id: "kianshahr", name: "کیان‌شهر", line: "l6", order: 1 },
  { id: "bassat", name: "بعثت", line: "l6", order: 2 },
  { id: "rezaei", name: "شهید رضایی", line: "l6", order: 3 },
  { id: "khorasan-sq", name: "میدان خراسان", line: "l6", order: 4, featured: true },
  { id: "amirkabir", name: "امیرکبیر", line: "l6", order: 5 },
  { id: "shohada-sq", name: "میدان شهدا", line: "l6", order: 6, featured: true },
  { id: "emam-hossein-sq", name: "امام حسین", line: "l6", order: 7, featured: true },
  { id: "sarbaz-vatan", name: "سرباز وطن", line: "l6", order: 8 },
  { id: "bahar-e-shiraz", name: "بهار شیراز", line: "l6", order: 9 },
  { id: "haft-tir", name: "شهدای هفتم تیر", line: "l6", order: 10, featured: true },
  { id: "maryam-moghaddas", name: "مریم مقدس", line: "l6", order: 11 },
  { id: "valiasr-sq", name: "میدان ولیعصر", line: "l6", order: 12, featured: true },
  { id: "bustan-lale", name: "بوستان لاله", line: "l6", order: 13 },
  { id: "kargar", name: "کارگر", line: "l6", order: 14 },
  { id: "tarbit-modarres", name: "دانشگاه تربیت مدرس", line: "l6", order: 15, featured: true },
  { id: "azmayesh", name: "شهرک آزمایش", line: "l6", order: 16 },
  { id: "marzdaran", name: "مرزداران", line: "l6", order: 17 },
  { id: "yadegar-emam", name: "یادگار امام", line: "l6", order: 18 },
  { id: "ashrafi-esfahani", name: "شهید اشرفی اصفهانی", line: "l6", order: 19 },
  { id: "setari", name: "شهید ستاری", line: "l6", order: 20 },
  { id: "kashani", name: "آیت‌الله کاشانی", line: "l6", order: 21 },
  { id: "shahr-ziba", name: "شهر زیبا", line: "l6", order: 22 },
  { id: "shahran", name: "شهران", line: "l6", order: 23 },
  { id: "shahed-e-kon", name: "شهدای کن", line: "l6", order: 24 },
  { id: "aliardi", name: "شهید آرمان علی‌وردی", line: "l6", order: 25 },

  // ---------- تهران | خط ۷ (ورزشگاه تختی -> میدان کتاب) — ۲۲ ایستگاه ----------
  { id: "takti", name: "ورزشگاه تختی", line: "l7", order: 0 },
  { id: "basij", name: "بسیج", line: "l7", order: 1, featured: true },
  { id: "ahang", name: "آهنگ", line: "l7", order: 2 },
  { id: "doolab", name: "دولاب", line: "l7", order: 3 },
  { id: "hefdah-shahrivar", name: "هفده شهریور", line: "l7", order: 4 },
  { id: "maidan-ghiyam", name: "میدان قیام", line: "l7", order: 5 },
  { id: "molavi", name: "مولوی", line: "l7", order: 6 },
  { id: "mohammadieh", name: "میدان محمدیه", line: "l7", order: 7, featured: true },
  { id: "mahdieh", name: "مهدیه", line: "l7", order: 8 },
  { id: "helal-ahmar", name: "هلال احمر", line: "l7", order: 9 },
  { id: "baryank", name: "بریانک", line: "l7", order: 10 },
  { id: "komeyl", name: "کمیل", line: "l7", order: 11 },
  { id: "roodaki", name: "رودکی", line: "l7", order: 12 },
  { id: "navab-safavi", name: "شهید نواب صفوی", line: "l7", order: 13, featured: true },
  { id: "towhid", name: "توحید", line: "l7", order: 14, featured: true },
  { id: "modafean-salamat", name: "مدافعان سلامت", line: "l7", order: 15 },
  { id: "tarbit-modarres", name: "دانشگاه تربیت مدرس", line: "l7", order: 16, featured: true },
  { id: "bustan-goftego", name: "بوستان گفتگو", line: "l7", order: 17 },
  { id: "milad", name: "برج میلاد تهران", line: "l7", order: 18 },
  { id: "sanat-sq", name: "میدان صنعت", line: "l7", order: 19, featured: true },
  { id: "dadman", name: "شهید دادمان", line: "l7", order: 20 },
  { id: "ketab-sq", name: "میدان کتاب", line: "l7", order: 21, featured: true },

  // ---------- کرج | خط ۲ قطار شهری کرج ----------
  { id: "kr-taleghani", name: "آیت‌الله طالقانی", line: "k1", order: 0 },
  { id: "kr-rajaee", name: "رجایی‌شهر", line: "k1", order: 1 },
  { id: "kr-45m", name: "چهل‌وپنج متری گلشهر", line: "k1", order: 2, featured: true },

  // ---------- مشهد | خط ۱ (وکیل‌آباد -> فرودگاه) — ۲۴ ایستگاه ----------
  { id: "mh-vakilabad", name: "وکیل‌آباد", line: "m1", order: 0, featured: true },
  { id: "mh-kuhestan-park", name: "کوهستان پارک", line: "m1", order: 1 },
  { id: "mh-namayeshgah", name: "نمایشگاه", line: "m1", order: 2 },
  { id: "mh-iqbal", name: "اقبال لاهوری", line: "m1", order: 3 },
  { id: "mh-sayyad", name: "شهید صیاد شیرازی", line: "m1", order: 4 },
  { id: "mh-sadaf", name: "صدف", line: "m1", order: 5 },
  { id: "mh-haft-tir", name: "هفت تیر", line: "m1", order: 6 },
  { id: "mh-danesh-amooz", name: "دانش‌آموز", line: "m1", order: 7 },
  { id: "mh-seyyed-razzi", name: "سید رضی", line: "m1", order: 8 },
  { id: "mh-kowsar", name: "کوثر", line: "m1", order: 9 },
  { id: "mh-park-mellat", name: "پارک ملت (دانشگاه فردوسی)", line: "m1", order: 10 },
  { id: "mh-azadi", name: "میدان آزادی", line: "m1", order: 11 },
  { id: "mh-khayyam", name: "خیام", line: "m1", order: 12 },
  { id: "mh-falestin", name: "میدان فلسطین", line: "m1", order: 13 },
  { id: "mh-shoushtari", name: "شهید فرج‌الله شوشتری", line: "m1", order: 14 },
  { id: "mh-ghaem", name: "قائم", line: "m1", order: 15 },
  { id: "mh-shariati", name: "میدان شریعتی (تقی‌آباد)", line: "m1", order: 16, featured: true },
  { id: "mh-emam-khomeini", name: "امام خمینی (ره)", line: "m1", order: 17, featured: true },
  { id: "mh-basij", name: "میدان بسیج", line: "m1", order: 18 },
  { id: "mh-17-shahrivar", name: "هفده شهریور", line: "m1", order: 19 },
  { id: "mh-parvin", name: "پروین اعتصامی", line: "m1", order: 20 },
  { id: "mh-ghadir", name: "غدیر", line: "m1", order: 21 },
  { id: "mh-reyhaneh", name: "بوستان ریحانه", line: "m1", order: 22 },
  { id: "mh-airport", name: "فرودگاه شهید هاشمی‌نژاد", line: "m1", order: 23 },

  // ---------- مشهد | خط ۲ (طبرسی -> شهید فکوری) — ۱۳ ایستگاه ----------
  { id: "mh-tabarsi", name: "طبرسی", line: "m2", order: 0 },
  { id: "mh-velayat", name: "ولایت", line: "m2", order: 1 },
  { id: "mh-fajr", name: "فجر", line: "m2", order: 2 },
  { id: "mh-nobovat", name: "نبوت", line: "m2", order: 3 },
  { id: "mh-mofatteh", name: "شهید مفتح", line: "m2", order: 4 },
  { id: "mh-rahahan", name: "راه‌آهن", line: "m2", order: 5 },
  { id: "mh-shohada", name: "شهدا", line: "m2", order: 6 },
  { id: "mh-saadi", name: "سعدی", line: "m2", order: 7 },
  { id: "mh-shariati", name: "میدان شریعتی (تقی‌آباد)", line: "m2", order: 8, featured: true },
  { id: "mh-alandasht", name: "الندشت", line: "m2", order: 9 },
  { id: "mh-kuhsangi", name: "کوهسنگی", line: "m2", order: 10 },
  { id: "mh-kaveh", name: "شهید کاوه", line: "m2", order: 11 },
  { id: "mh-fakoori", name: "شهید فکوری", line: "m2", order: 12 },

  // ---------- اصفهان | خط ۱ (قدس -> دفاع مقدس) — ۲۰ ایستگاه ----------
  { id: "es-ghods", name: "قدس", line: "e1", order: 0, featured: true },
  { id: "es-baharestan", name: "بهارستان", line: "e1", order: 1 },
  { id: "es-golestan", name: "گلستان", line: "e1", order: 2 },
  { id: "es-mofatteh", name: "شهید مفتح", line: "e1", order: 3 },
  { id: "es-alikhani", name: "شهید علیخانی", line: "e1", order: 4 },
  { id: "es-jaber", name: "جابر", line: "e1", order: 5 },
  { id: "es-kaveh", name: "کاوه", line: "e1", order: 6, featured: true },
  { id: "es-chamran", name: "شهید چمران", line: "e1", order: 7 },
  { id: "es-bahonar", name: "شهید باهنر", line: "e1", order: 8 },
  { id: "es-shohada", name: "شهدا", line: "e1", order: 9 },
  { id: "es-takhti", name: "تختی", line: "e1", order: 10 },
  { id: "es-emam-hossein", name: "امام حسین", line: "e1", order: 11 },
  { id: "es-enghelab", name: "انقلاب", line: "e1", order: 12 },
  { id: "es-siosopol", name: "سی‌وسه‌پل", line: "e1", order: 13, featured: true },
  { id: "es-shariati", name: "دکتر شریعتی", line: "e1", order: 14 },
  { id: "es-azadi", name: "آزادی", line: "e1", order: 15 },
  { id: "es-daneshgah", name: "دانشگاه", line: "e1", order: 16 },
  { id: "es-kargar", name: "کارگر", line: "e1", order: 17 },
  { id: "es-koye-emam", name: "کوی امام", line: "e1", order: 18 },
  { id: "es-defa-moghaddas", name: "دفاع مقدس", line: "e1", order: 19 },
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

/* ------------------------------ موتور جدول حرکت رسمی (۱۴۰۴) ------------------------------ */
/**
 * مترو تهران فید لحظه‌ای عمومی ندارد؛ زمان ورود قطارها بر اساس
 * جدول حرکت رسمی شرکت مترو تهران (سامانه metro.tehran.ir) محاسبه می‌شود:
 * ساعات سرویس: شنبه تا چهارشنبه ۵:۳۰ تا ۲۲:۳۰ — پنجشنبه ۶:۰۰ — جمعه ۶:۳۰
 * و سرفاصله اوج/غیراوج رسمی هر خط.
 */

/** بازه‌های ساعات اوج (دقیقه از نیمه‌شب) — صبح و عصر */
const PEAK_WINDOWS: [number, number][] = [
  [420, 570], // ۷:۰۰ تا ۹:۳۰
  [990, 1140], // ۱۶:۳۰ تا ۱۹:۰۰
];

/** فاصله حرکت قطارها در یک لحظه از روز — اوج / غیراوج */
export function headwayAt(line: LineDef, mins: number): number {
  const peak = PEAK_WINDOWS.some(([a, b]) => mins >= a && mins < b);
  return peak ? (line.headwayPeak ?? line.headway) : (line.headwayOff ?? line.headway);
}

/**
 * ساعت شروع سرویس بر اساس روز هفته (الگوی رسمی ۱۴۰۴):
 * شنبه تا چهارشنبه: ۵:۳۰ | پنجشنبه: ۶:۰۰ | جمعه: ۶:۳۰
 */
export function serviceStartMin(line: LineDef, d = new Date()): number {
  const [fh, fm] = line.firstTrain.split(":").map(Number);
  let start = fh * 60 + fm;
  const day = d.getDay(); // ۰ یکشنبه … ۳ چهارشنبه، ۴ پنجشنبه، ۵ جمعه، ۶ شنبه
  if (day === 4) start += 30; // پنجشنبه ۶:۰۰
  else if (day === 5) start += 60; // جمعه ۶:۳۰
  return start;
}

/** ساعت حرکت آخرین قطار از سرخط */
export function serviceEndMin(line: LineDef): number {
  const [lh, lm] = line.lastTrain.split(":").map(Number);
  return lh * 60 + lm;
}

/** آیا الان داخل ساعات سرویس‌دهی خط هستیم؟ */
export function isWithinService(line: { firstTrain: string; lastTrain: string }, d = new Date()): boolean {
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= serviceStartMin(line as LineDef, d) && mins <= serviceEndMin(line as LineDef);
}

/** زمان‌های حرکت قطارها از سرخط با فاصله اوج/غیراوج */
function departureGrid(line: LineDef, fromMin: number, toMin: number): number[] {
  const out: number[] = [];
  let t = fromMin;
  while (t <= toMin + 1e-9) {
    out.push(t);
    t += headwayAt(line, t);
  }
  return out;
}

const fmtClock = (m: number) => {
  const mm = Math.round(m) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
};

export interface ArrivalDirDetail {
  /** دقایق تا قطار بعدی و پس از آن */
  minutes: number[];
  /** ساعت رسیدن دو قطار بعدی (HH:MM) */
  at: string[];
  /** خارج از ساعات سرویس */
  outOfService: boolean;
}

/** دو قطار بعدی یک ایستگاه در یک جهت مشخص — محاسبه قطعی از جدول حرکت */
function scheduleArrivalsDir(
  lineId: string,
  stationId: string,
  dir: 0 | 1,
  now: number
): ArrivalDirDetail {
  const line = getLine(lineId);
  const list = stationsOfLine(lineId);
  const idx = list.findIndex((s) => s.id === stationId);
  if (idx < 0) return { minutes: [], at: [], outOfService: true };

  const d = new Date(now);
  const nowMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const start = serviceStartMin(line, d);
  const end = serviceEndMin(line);
  // تا ۴۵ دقیقه پس از پایان، رسیدن آخرین قطارها به ایستگاه‌های انتهایی ادامه دارد
  if (nowMin < start || nowMin > end + 45) {
    return { minutes: [], at: [], outOfService: true };
  }

  const hops = dir === 0 ? idx : list.length - 1 - idx;
  const travel = hops * line.segmentMinutes;
  // ۴۰ ثانیه توقف در ایستگاه برای سوار و پیاده شدن
  const deps = departureGrid(line, start, end).filter((dep) => dep + travel >= nowMin + 0.6);
  const next2 = deps.slice(0, 2);
  return {
    minutes: next2.map((dep) => Math.max(1, Math.round(dep + travel - nowMin))),
    at: next2.map((dep) => fmtClock(dep + travel)),
    outOfService: false,
  };
}

/** ورودهای بعدی به سمت terminals[1] — سازگاری با نسخه قبل */
export function nextArrivals(lineId: string, stationId: string, now = Date.now()): number[] {
  return scheduleArrivalsDir(lineId, stationId, 0, now).minutes;
}

export interface DirectionalArrival {
  /** نام ایستگاه مقصد قطار در این جهت (مثل تجریش) */
  to: string;
  /** دقایق تا قطار بعدی و قطار پس از آن */
  minutes: number[];
  /** ساعت رسیدن دو قطار بعدی (HH:MM) */
  at: string[];
  /** خارج از ساعات سرویس */
  outOfService: boolean;
  crowd: CrowdLevel;
  crowdLabel: string;
}

/**
 * ورودهای بعدی به هر دو جهت — با نام درستِ مقصد هر جهت و بر اساس جدول حرکت رسمی.
 * ایستگاه سرخط فقط یک جهت دارد؛ ایستگاه میانی هر دو جهت.
 */
export function nextArrivalsBoth(
  lineId: string,
  stationId: string,
  now = Date.now()
): DirectionalArrival[] {
  const line = getLine(lineId);
  const list = stationsOfLine(lineId);
  const idx = list.findIndex((s) => s.id === stationId);
  if (idx < 0) return [];

  const out: DirectionalArrival[] = [];
  const mk = (to: string, dir: 0 | 1): DirectionalArrival => {
    const r = scheduleArrivalsDir(lineId, stationId, dir, now);
    const crowd = crowdingNow(lineId, new Date(now));
    return {
      to,
      minutes: r.minutes,
      at: r.at,
      outOfService: r.outOfService,
      crowd,
      crowdLabel: CROWD_LABEL[crowd],
    };
  };

  // به سمت terminals[1] — مگر این ایستگاه خودش همان سرخط باشد
  if (idx < list.length - 1) out.push(mk(line.terminals[1], 0));
  // به سمت terminals[0] — مگر این ایستگاه خودش همان سرخط باشد
  if (idx > 0) out.push(mk(line.terminals[0], 1));
  return out;
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

export function timetableFor(lineId: string, d = new Date()): TimetableRow[] {
  const line = getLine(lineId);
  const start = serviceStartMin(line, d);
  const fmtM = (m: number) => toFa(fmtClock(m));
  const peak = line.headwayPeak ?? line.headway;
  const off = line.headwayOff ?? line.headway;
  return [
    {
      direction: `به سمت ${line.terminals[1]}`,
      first: fmtM(start),
      last: toFa(line.lastTrain),
      headwayPeak: toFa(`${peak} دقیقه`),
      headwayOff: toFa(`${off} دقیقه`),
    },
    {
      direction: `به سمت ${line.terminals[0]}`,
      first: fmtM(start + 5),
      last: fmtM(serviceEndMin(line) - 6),
      headwayPeak: toFa(`${peak} دقیقه`),
      headwayOff: toFa(`${off} دقیقه`),
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
  tajrish: ["بازار تجریش", "کاخ سعدآباد", "پارک ملت", "موزه ابگر"],
  ghitrieh: ["باغ کتاب", "پارک قیطریه"],
  mirdamad: ["بانک مرکزی", "بوستان طالقانی", "پاساژ میرداماد"],
  mosalla: ["مصلی بزرگ تهران", "بزرگ‌راه رسالت"],
  hemmat: ["سازمان تبلیغات اسلامی", "بوستان طالقانی"],
  dowlat: ["موزه ملی ایران", "دانشگاه امیرکبیر", "چهارراه گلوبندک"],
  saadi: ["خیابان سعدی", "مجله سعدی"],
  "emam-khomeini-sq": ["کاخ گلستان", "موزه ملی", "بازار تهران", "میدان توپخانه"],
  panzdah: ["بازار بزرگ تهران", "چهارراه گلوبندک", "مسجد جامع تهران"],
  khayyam: ["بازار بزرگ", "امامزاده یحیی", "حمام علیقلی‌آقا"],
  mohammadieh: ["میدان محمدیه", "بازار تهران", "مسجد امیر"],
  shush: ["خیابان شوش", "محله قدیمی شوش"],
  "payane-jonub": ["پایانه جنوب", "بازار افشار"],
  haram: ["حرم مطهر امام خمینی", "بهشت زهرا", "بزرگ‌راه علامه عسگری"],
  javanmard: ["بلوار دستواره", "پارک نماز"],
  shahrerey: ["خیابان فرمانداری شهرری", "بازار شهرری"],
  "theater-shahr": ["تئاتر شهر", "دانشگاه تهران", "تالار وحدت", "پارک دانشجو"],
  "enghelab-sq": ["میدان انقلاب", "دانشگاه تهران", "پیاده‌راه انقلاب"],
  ferdowsi: ["میدان فردوسی", "هتل فردوسی", "راسته ناشران"],
  "azadi-sq": ["میدان آزادی", "برج آزادی", "پارک لاله"],
  "shohada-sq": ["میدان شهدا", "بازار شهدا", "خیابان بهارستان"],
  "emam-hossein-sq": ["میدان امام حسین", "خیابان انقلاب", "BRT انقلاب"],
  "haft-tir": ["میدان هفت تیر", "برج سی‌گل", "خیابان کریم‌خان"],
  "valiasr-sq": ["میدان ولیعصر", "خیابان ولیعصر", "پارک ساعی"],
  "piroozi-sq": ["میدان پیروزی", "بزرگ‌راه امام علی"],
  "navab-safavi": ["بزرگ‌راه نواب", "BRT نواب", "میدان حر"],
  "sadeghieh": ["پایانه غرب", "بازار صادقیه", "بزرگ‌راه جناح"],
  "sharif": ["دانشگاه صنعتی شریف", "بلوار تیموری"],
  "shadman": ["میدان شادمان", "بازار شادمان", "BRT آزادی"],
  "towhid": ["میدان توحید", "بیمارستان توحید"],
  "farhangsara": ["فرهنگسرای اشراق", "بازار مبل هفت حوض", "بوستان نهر آب"],
  tehranpars: ["فلکه دوم تهرانپارس", "بازار تهرانپارس"],
  qaem: ["بازار قائم", "بوستان لویزان"],
  nobonyad: ["میدان نوبنیاد", "بوستان گفتگو", "بزرگ‌راه شهید بابایی"],
  kolahdouz: ["پایانه شرق", "بزرگ‌راه دوران", "بوستان پیروزی"],
  "eram-sabz": ["شهرک ارم سبز", "بزرگ‌راه آزادراه"],
  ekbatan: ["شهرک اکباتان", "پارک اکباتان"],
  "ketab-sq": ["میدان کتاب", "شهرک غرب", "بزرگ‌راه دادمان"],
  "sanat-sq": ["میدان صنعت", "شهرک صنعت"],
  milad: ["برج میلاد تهران", "نمایشگاه بین‌المللی"],
  "tarbit-modarres": ["دانشگاه تربیت مدرس", "بزرگ‌راه چمران"],
  "dolatabad": ["شهدای دولت‌آباد", "بزرگ‌راه یاسینی"],
  aliardi: ["کوهسار", "شهرک کوهسار"],
  "mh-emam-khomeini": ["حرم مطهر امام رضا (ع)", "بازار رضا", "موزه آستان قدس"],
  "mh-shariati": ["میدان شریعتی (تقی‌آباد)", "مرکز خرید زیست خاور"],
  "mh-kuhsangi": ["بوستان کوهسنگی", "میدان تلویزیون"],
  "mh-airport": ["فرودگاه شهید هاشمی‌نژاد"],
  "mh-vakilabad": ["بوستان وکیل‌آباد", "سه‌راه طرقبه"],
  "es-siosopol": ["سی‌وسه‌پل", "چهارباغ", "کاخ چهلستون"],
  "es-kaveh": ["پایانه بزرگ کاوه", "بلوار کاوه"],
  "es-defa-moghaddas": ["پل دفاع مقدس", "پایانه صفه"],
  "es-ghods": ["شهرک قدس اصفهان", "خیابان امام خمینی"],
  "kr-soltani": ["پل شهید سلطانی", "میدان آزادگان کرج", "بازار کرج"],
  golshahr: ["چهل‌وپنج متری گلشهر", "بوستان گلشهر"],
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
