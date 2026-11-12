/* ============================================================
   هندسه نقشه شماتیک متروی تهران (SVG) — بر اساس شبکه واقعی
   همه ایستگاه‌های مشترک (تبادلی) دقیقاً یک مختصات دارند
   نسخه ۶۴۰px: خطوط با فاصله بازتر، بدون همپوشانی و خواناتر
   ============================================================ */

export interface MapStation {
  id: string;
  name: string;
  x: number;
  y: number;
  label: boolean; // always show label
}

export const MAP_CANVAS = { w: 640, h: 868 };

export const MAP_STATIONS: MapStation[] = [
  // ---------- خط ۱: ستون شمالی-جنوبی (x=316) ----------
  { id: "tajrish", name: "تجریش", x: 316, y: 58, label: true },
  { id: "ghitrieh", name: "قیطریه", x: 316, y: 86, label: false },
  { id: "shahid-sadr", name: "شهید صدر", x: 316, y: 114, label: false },
  { id: "gholhak", name: "قلهک", x: 316, y: 142, label: false },
  { id: "dr-shariati", name: "دکتر شریعتی", x: 316, y: 170, label: false },
  { id: "mirdamad", name: "میرداماد", x: 316, y: 198, label: true },
  { id: "haghdani", name: "شهید حقانی", x: 316, y: 226, label: false },
  { id: "hemmat", name: "شهید همت", x: 316, y: 254, label: false },
  { id: "mosalla", name: "مصلی امام خمینی", x: 316, y: 282, label: false },
  { id: "beheshti", name: "شهید بهشتی", x: 316, y: 310, label: true },
  { id: "mofatteh", name: "شهید مفتح", x: 316, y: 338, label: false },
  { id: "haft-tir", name: "شهدای هفتم تیر", x: 316, y: 366, label: true },
  { id: "taleghani", name: "طالقانی", x: 316, y: 398, label: false },
  { id: "dowlat", name: "دروازه دولت", x: 316, y: 422, label: true },
  { id: "saadi", name: "سعدی", x: 316, y: 450, label: false },
  { id: "emam-khomeini-sq", name: "امام خمینی", x: 316, y: 478, label: true },
  { id: "panzdah", name: "پانزده خرداد", x: 316, y: 506, label: false },
  { id: "khayyam", name: "خیام", x: 316, y: 534, label: false },
  { id: "mohammadieh", name: "میدان محمدیه", x: 316, y: 562, label: true },
  { id: "shush", name: "شوش", x: 316, y: 590, label: false },
  { id: "payane-jonub", name: "پایانه جنوب", x: 316, y: 618, label: false },
  { id: "bokharaei", name: "شهید بخارایی", x: 316, y: 646, label: false },
  { id: "aliabad", name: "علی‌آباد", x: 316, y: 674, label: false },
  { id: "javanmard", name: "جوانمرد قصاب", x: 316, y: 702, label: false },
  { id: "shahrerey", name: "شهرری", x: 316, y: 730, label: false },
  { id: "palayeshgah", name: "پالایشگاه", x: 316, y: 758, label: false },
  { id: "shahed-baghershahr", name: "شاهد - باقرشهر", x: 316, y: 786, label: false },
  { id: "haram", name: "حرم مطهر امام خمینی", x: 316, y: 814, label: true },
  { id: "kahrizak", name: "کهریزک", x: 316, y: 842, label: true },

  // ---------- خط ۲: غرب به شرق از صادقیه ----------
  { id: "sadeghieh", name: "صادقیه", x: 28, y: 478, label: true },
  { id: "tarasht", name: "طرشت", x: 61, y: 470, label: false },
  { id: "sharif", name: "دانشگاه شریف", x: 98, y: 460, label: false },
  { id: "shadman", name: "شادمان", x: 188, y: 452, label: true },
  { id: "navab-safavi", name: "شهید نواب صفوی", x: 222, y: 458, label: false },
  { id: "maidan-harr", name: "میدان حر", x: 268, y: 452, label: false },
  { id: "imam-ali", name: "دانشگاه امام علی", x: 274, y: 464, label: false },
  { id: "hassanabad", name: "حسن‌آباد", x: 296, y: 470, label: false },
  { id: "mellat", name: "ملت", x: 334, y: 480, label: false },
  { id: "baharestan", name: "بهارستان", x: 368, y: 483, label: false },
  { id: "darvazeh-shemiran", name: "دروازه شمیران", x: 400, y: 484, label: false },
  { id: "emam-hossein-sq", name: "امام حسین", x: 444, y: 510, label: true },
  { id: "madani", name: "شهید مدنی", x: 458, y: 454, label: false },
  { id: "sabalan", name: "سبلان", x: 476, y: 442, label: false },
  { id: "fedak", name: "فدک", x: 486, y: 424, label: false },
  { id: "janbazan", name: "جانبازان", x: 496, y: 406, label: false },
  { id: "sarasab", name: "سرسبز", x: 506, y: 386, label: false },
  { id: "elm-o-sanat", name: "دانشگاه علم و صنعت", x: 518, y: 364, label: false },
  { id: "baghery", name: "شهید باقری", x: 528, y: 340, label: false },
  { id: "tehranpars", name: "تهرانپارس", x: 540, y: 316, label: false },
  { id: "farhangsara", name: "فرهنگسرا", x: 552, y: 290, label: true },

  // ---------- خط ۳: قطر شمال‌شرق به جنوب‌غرب ----------
  { id: "azadegan", name: "آزادگان", x: 138, y: 694, label: true },
  { id: "nematabad", name: "نعمت‌آباد", x: 152, y: 666, label: false },
  { id: "abdolabad", name: "عبدل‌آباد", x: 166, y: 638, label: false },
  { id: "shahrak-shariati", name: "شهرک شریعتی", x: 180, y: 610, label: false },
  { id: "zamzam", name: "زمزم", x: 195, y: 582, label: false },
  { id: "javadieh", name: "جوادیه", x: 209, y: 554, label: false },
  { id: "rah-ahan", name: "راه‌آهن", x: 229, y: 534, label: false },
  { id: "mahdieh", name: "مهدیه", x: 242, y: 506, label: false },
  { id: "monirieh", name: "منیریه", x: 248, y: 470, label: false },
  { id: "theater-shahr", name: "تئاتر شهر", x: 266, y: 432, label: true },
  { id: "valiasr-sq", name: "میدان ولیعصر", x: 274, y: 398, label: true },
  { id: "maidan-jehad", name: "میدان جهاد", x: 286, y: 368, label: false },
  { id: "mirzaye-shirazi", name: "میرزای شیرازی", x: 292, y: 338, label: false },
  { id: "sohravardi", name: "سهروردی", x: 340, y: 312, label: false },
  { id: "ghadousi", name: "شهید قدوسی", x: 360, y: 326, label: false },
  { id: "sayyad-shirazi", name: "شهید صیاد شیرازی", x: 384, y: 322, label: false },
  { id: "khajeh-ansari", name: "خواجه عبدالله انصاری", x: 406, y: 316, label: false },
  { id: "zeynoddin", name: "شهید زین‌الدین", x: 424, y: 302, label: false },
  { id: "harooni", name: "هروی", x: 444, y: 290, label: false },
  { id: "hosseinabad", name: "حسین‌آباد", x: 462, y: 276, label: false },
  { id: "nobonyad", name: "نوبنیاد", x: 478, y: 254, label: true },
  { id: "aghdasieh", name: "اقدسیه", x: 494, y: 228, label: false },
  { id: "mahallati", name: "شهید محلاتی", x: 508, y: 200, label: false },
  { id: "qaem", name: "قائم", x: 520, y: 170, label: true },

  // ---------- خط ۴: غرب به شرق از علامه جعفری ----------
  { id: "alameh-jafari", name: "علامه جعفری", x: 21, y: 368, label: true },
  { id: "erm-sabz", name: "ارم سبز", x: 54, y: 392, label: true },
  { id: "ekbatan", name: "شهرک اکباتان", x: 80, y: 414, label: false },
  { id: "bimeh", name: "بیمه", x: 100, y: 428, label: false },
  { id: "azadi-sq", name: "میدان آزادی", x: 122, y: 436, label: true },
  { id: "moin", name: "استاد معین", x: 142, y: 433, label: false },
  { id: "habibollah", name: "دکتر حبیب‌الله", x: 172, y: 435, label: false },
  { id: "towhid", name: "توحید", x: 212, y: 438, label: false },
  { id: "enghelab-sq", name: "میدان انقلاب اسلامی", x: 228, y: 429, label: true },
  { id: "ferdowsi", name: "فردوسی", x: 292, y: 426, label: false },
  { id: "shohada-sq", name: "میدان شهدا", x: 474, y: 466, label: true },
  { id: "ibn-e-sina", name: "ابن‌سینا", x: 496, y: 486, label: false },
  { id: "piroozi-sq", name: "پیروزی", x: 518, y: 478, label: false },
  { id: "nabard", name: "نبرد", x: 526, y: 452, label: false },
  { id: "nirouhavaei", name: "نیروهوایی", x: 538, y: 428, label: false },
  { id: "kolahdouz", name: "شهید کلاهدوز", x: 550, y: 404, label: true },

  // ---------- خط ۵: قطار شهری تهران-کرج (شمال‌غرب) ----------
  { id: "azadi-stadium", name: "ورزشگاه آزادی", x: 49, y: 360, label: false },
  { id: "chitgar", name: "چیتگر", x: 45, y: 328, label: false },
  { id: "iran-khodro", name: "ایران خودرو", x: 40, y: 296, label: false },
  { id: "vardavard", name: "وردآورد", x: 35, y: 264, label: false },
  { id: "garmdareh", name: "گرم‌دره", x: 30, y: 232, label: false },
  { id: "atmosfar", name: "اتمسفر", x: 26, y: 200, label: false },
  { id: "kr-soltani", name: "کرج (شهید سلطانی)", x: 23, y: 168, label: false },
  { id: "kr-mohammadshahr", name: "محمدشهر", x: 21, y: 136, label: false },
  { id: "golshahr", name: "گلشهر", x: 19, y: 104, label: true },
  { id: "fakhri-zadeh", name: "شهید فخری‌زاده", x: 16, y: 72, label: false },
  { id: "ghassem-solaymani", name: "شهید قاسم سلیمانی", x: 14, y: 40, label: true },

  // ---------- خط ۶: جنوب‌شرق به شمال‌غرب ----------
  { id: "dolatabad", name: "شهدای دولت‌آباد", x: 524, y: 654, label: true },
  { id: "kianshahr", name: "کیان‌شهر", x: 512, y: 624, label: false },
  { id: "bassat", name: "بعثت", x: 500, y: 594, label: false },
  { id: "rezaei", name: "شهید رضایی", x: 488, y: 564, label: false },
  { id: "khorasan-sq", name: "میدان خراسان", x: 476, y: 534, label: true },
  { id: "amirkabir", name: "امیرکبیر", x: 462, y: 508, label: false },
  { id: "sarbaz-vatan", name: "سرباز وطن", x: 404, y: 514, label: false },
  { id: "bahar-e-shiraz", name: "بهار شیراز", x: 362, y: 505, label: false },
  { id: "maryam-moghaddas", name: "مریم مقدس", x: 295, y: 386, label: false },
  { id: "bustan-lale", name: "بوستان لاله", x: 252, y: 412, label: false },
  { id: "kargar", name: "کارگر", x: 230, y: 486, label: false },
  { id: "tarbit-modarres", name: "دانشگاه تربیت مدرس", x: 174, y: 410, label: false },
  { id: "azmayesh", name: "شهرک آزمایش", x: 128, y: 470, label: false },
  { id: "marzdaran", name: "مرزداران", x: 113, y: 486, label: false },
  { id: "yadegar-emam", name: "یادگار امام", x: 89, y: 514, label: false },
  { id: "ashrafi-esfahani", name: "شهید اشرفی اصفهانی", x: 66, y: 542, label: false },
  { id: "setari", name: "شهید ستاری", x: 52, y: 572, label: false },
  { id: "kashani", name: "آیت‌الله کاشانی", x: 42, y: 604, label: false },
  { id: "shahr-ziba", name: "شهر زیبا", x: 35, y: 638, label: false },
  { id: "shahran", name: "شهران", x: 33, y: 672, label: false },
  { id: "shahed-e-kon", name: "شهدای کن", x: 30, y: 706, label: false },
  { id: "aliardi", name: "شهید آرمان علی‌وردی", x: 28, y: 740, label: true },

  // ---------- خط ۷: ورزشگاه تختی به میدان کتاب ----------
  { id: "takti", name: "ورزشگاه تختی", x: 431, y: 722, label: true },
  { id: "basij", name: "بسیج", x: 415, y: 700, label: true },
  { id: "ahang", name: "آهنگ", x: 398, y: 678, label: false },
  { id: "doolab", name: "دولاب", x: 382, y: 656, label: false },
  { id: "hefdah-shahrivar", name: "هفده شهریور", x: 366, y: 634, label: false },
  { id: "maidan-ghiyam", name: "میدان قیام", x: 349, y: 612, label: false },
  { id: "molavi", name: "مولوی", x: 336, y: 586, label: false },
  { id: "helal-ahmar", name: "هلال احمر", x: 210, y: 522, label: false },
  { id: "baryank", name: "بریانک", x: 190, y: 512, label: false },
  { id: "komeyl", name: "کمیل", x: 178, y: 490, label: false },
  { id: "roodaki", name: "رودکی", x: 194, y: 474, label: false },
  { id: "modafean-salamat", name: "مدافعان سلامت", x: 184, y: 402, label: false },
  { id: "bustan-goftego", name: "بوستان گفتگو", x: 143, y: 400, label: false },
  { id: "milad", name: "برج میلاد تهران", x: 117, y: 382, label: true },
  { id: "sanat-sq", name: "میدان صنعت", x: 115, y: 348, label: true },
  { id: "dadman", name: "شهید دادمان", x: 117, y: 312, label: false },
  { id: "ketab-sq", name: "میدان کتاب", x: 120, y: 278, label: true },
];

/** مسیر هر خط به ترتیب ایستگاه‌ها (مطابق ترتیب واقعی) */
export const MAP_LINES: { lineId: string; color: string; stations: string[] }[] = [
  {
    lineId: "l1",
    color: "#e52421",
    stations: [
      "kahrizak", "haram", "shahed-baghershahr", "palayeshgah", "shahrerey", "javanmard",
      "aliabad", "bokharaei", "payane-jonub", "shush", "mohammadieh", "khayyam", "panzdah",
      "emam-khomeini-sq", "saadi", "dowlat", "taleghani", "haft-tir", "mofatteh", "beheshti",
      "mosalla", "hemmat", "haghdani", "mirdamad", "dr-shariati", "gholhak", "shahid-sadr",
      "ghitrieh", "tajrish",
    ],
  },
  {
    lineId: "l2",
    color: "#15397a",
    stations: [
      "sadeghieh", "tarasht", "sharif", "shadman", "navab-safavi", "maidan-harr", "imam-ali",
      "hassanabad", "emam-khomeini-sq", "mellat", "baharestan", "darvazeh-shemiran",
      "emam-hossein-sq", "madani", "sabalan", "fedak", "janbazan", "sarasab", "elm-o-sanat",
      "baghery", "tehranpars", "farhangsara",
    ],
  },
  {
    lineId: "l3",
    color: "#00a3e0",
    stations: [
      "azadegan", "nematabad", "abdolabad", "shahrak-shariati", "zamzam", "javadieh",
      "rah-ahan", "mahdieh", "monirieh", "theater-shahr", "valiasr-sq", "maidan-jehad",
      "mirzaye-shirazi", "beheshti", "sohravardi", "ghadousi", "sayyad-shirazi",
      "khajeh-ansari", "zeynoddin", "harooni", "hosseinabad", "nobonyad", "aghdasieh",
      "mahallati", "qaem",
    ],
  },
  {
    lineId: "l4",
    color: "#f6b400",
    stations: [
      "alameh-jafari", "erm-sabz", "ekbatan", "bimeh", "azadi-sq", "moin", "habibollah",
      "shadman", "towhid", "enghelab-sq", "theater-shahr", "ferdowsi", "dowlat",
      "darvazeh-shemiran", "shohada-sq", "ibn-e-sina", "piroozi-sq", "nabard",
      "nirouhavaei", "kolahdouz",
    ],
  },
  {
    lineId: "l5",
    color: "#009640",
    stations: [
      "sadeghieh", "erm-sabz", "azadi-stadium", "chitgar", "iran-khodro", "vardavard",
      "garmdareh", "atmosfar", "kr-soltani", "kr-mohammadshahr", "golshahr", "fakhri-zadeh",
      "ghassem-solaymani",
    ],
  },
  {
    lineId: "l6",
    color: "#d82572",
    stations: [
      "dolatabad", "kianshahr", "bassat", "rezaei", "khorasan-sq", "amirkabir", "shohada-sq",
      "emam-hossein-sq", "sarbaz-vatan", "bahar-e-shiraz", "haft-tir", "maryam-moghaddas",
      "valiasr-sq", "bustan-lale", "kargar", "tarbit-modarres", "azmayesh", "marzdaran",
      "yadegar-emam", "ashrafi-esfahani", "setari", "kashani", "shahr-ziba", "shahran",
      "shahed-e-kon", "aliardi",
    ],
  },
  {
    lineId: "l7",
    color: "#7d2382",
    stations: [
      "takti", "basij", "ahang", "doolab", "hefdah-shahrivar", "maidan-ghiyam", "molavi",
      "mohammadieh", "mahdieh", "helal-ahmar", "baryank", "komeyl", "roodaki",
      "navab-safavi", "towhid", "modafean-salamat", "tarbit-modarres", "bustan-goftego",
      "milad", "sanat-sq", "dadman", "ketab-sq",
    ],
  },
];

export const MAP_STATION_BY_ID = new Map(MAP_STATIONS.map((s) => [s.id, s]));
