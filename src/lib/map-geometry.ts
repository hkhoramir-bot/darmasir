/* ============================================================
   هندسه نقشه شماتیک متروی تهران (SVG) — بر اساس شبکه واقعی
   همه ایستگاه‌های مشترک (تبادلی) دقیقاً یک مختصات دارند
   نسخه ۸۸۰px «باز»: بوم بزرگ‌تر و خطوط با فاصله واضح از هم
   (طبق نقشه کلاسیک) تا برچسب‌ها روی هم نیفتند — خوانایی در زوم ۱
   ============================================================ */

export interface MapStation {
  id: string;
  name: string;
  x: number;
  y: number;
  label: boolean; // always show label
}

export const MAP_CANVAS = { w: 880, h: 1240 };

export const MAP_STATIONS: MapStation[] = [
  // ---------- خط ۱: ستون شمالی-جنوبی (x=470) ----------
  { id: "tajrish", name: "تجریش", x: 470, y: 70, label: true },
  { id: "ghitrieh", name: "قیطریه", x: 470, y: 110, label: false },
  { id: "shahid-sadr", name: "شهید صدر", x: 470, y: 150, label: false },
  { id: "gholhak", name: "قلهک", x: 470, y: 190, label: false },
  { id: "dr-shariati", name: "دکتر شریعتی", x: 470, y: 230, label: false },
  { id: "mirdamad", name: "میرداماد", x: 470, y: 270, label: true },
  { id: "haghdani", name: "شهید حقانی", x: 470, y: 310, label: false },
  { id: "hemmat", name: "شهید همت", x: 470, y: 350, label: false },
  { id: "mosalla", name: "مصلی امام خمینی", x: 470, y: 390, label: false },
  { id: "beheshti", name: "شهید بهشتی", x: 470, y: 430, label: true },
  { id: "mofatteh", name: "شهید مفتح", x: 470, y: 470, label: false },
  { id: "haft-tir", name: "شهدای هفتم تیر", x: 470, y: 510, label: true },
  { id: "taleghani", name: "طالقانی", x: 470, y: 550, label: false },
  { id: "dowlat", name: "دروازه دولت", x: 470, y: 590, label: true },
  { id: "saadi", name: "سعدی", x: 470, y: 630, label: false },
  { id: "emam-khomeini-sq", name: "امام خمینی", x: 470, y: 670, label: true },
  { id: "panzdah", name: "پانزده خرداد", x: 470, y: 710, label: false },
  { id: "khayyam", name: "خیام", x: 470, y: 750, label: false },
  { id: "mohammadieh", name: "میدان محمدیه", x: 470, y: 790, label: true },
  { id: "shush", name: "شوش", x: 470, y: 830, label: false },
  { id: "payane-jonub", name: "پایانه جنوب", x: 470, y: 870, label: false },
  { id: "bokharaei", name: "شهید بخارایی", x: 470, y: 910, label: false },
  { id: "aliabad", name: "علی‌آباد", x: 470, y: 950, label: false },
  { id: "javanmard", name: "جوانمرد قصاب", x: 470, y: 990, label: false },
  { id: "shahrerey", name: "شهرری", x: 470, y: 1030, label: false },
  { id: "palayeshgah", name: "پالایشگاه", x: 470, y: 1070, label: false },
  { id: "shahed-baghershahr", name: "شاهد - باقرشهر", x: 470, y: 1110, label: false },
  { id: "haram", name: "حرم مطهر امام خمینی", x: 470, y: 1150, label: true },
  { id: "kahrizak", name: "کهریزک", x: 470, y: 1190, label: true },

  // ---------- خط ۲: غرب به شرق از صادقیه ----------
  { id: "sadeghieh", name: "صادقیه", x: 42, y: 660, label: true },
  { id: "tarasht", name: "طرشت", x: 88, y: 660, label: false },
  { id: "sharif", name: "دانشگاه شریف", x: 134, y: 660, label: false },
  { id: "shadman", name: "شادمان", x: 196, y: 660, label: true },
  { id: "navab-safavi", name: "شهید نواب صفوی", x: 240, y: 660, label: false },
  { id: "maidan-harr", name: "میدان حر", x: 282, y: 660, label: false },
  { id: "imam-ali", name: "دانشگاه امام علی", x: 326, y: 660, label: false },
  { id: "hassanabad", name: "حسن‌آباد", x: 370, y: 660, label: false },
  { id: "mellat", name: "ملت", x: 508, y: 678, label: false },
  { id: "baharestan", name: "بهارستان", x: 548, y: 684, label: false },
  { id: "darvazeh-shemiran", name: "دروازه شمیران", x: 590, y: 635, label: false },
  { id: "emam-hossein-sq", name: "امام حسین", x: 630, y: 608, label: true },
  { id: "madani", name: "شهید مدنی", x: 672, y: 566, label: false },
  { id: "sablan", name: "سبلان", x: 702, y: 538, label: false },
  { id: "fedak", name: "فدک", x: 730, y: 510, label: false },
  { id: "janbazan", name: "جانبازان", x: 758, y: 482, label: false },
  { id: "sarasab", name: "سرسبز", x: 786, y: 454, label: false },
  { id: "elm-o-sanat", name: "دانشگاه علم و صنعت", x: 812, y: 422, label: false },
  { id: "baghery", name: "شهید باقری", x: 832, y: 388, label: false },
  { id: "tehranpars", name: "تهرانپارس", x: 850, y: 354, label: false },
  { id: "farhangsara", name: "فرهنگسرا", x: 860, y: 318, label: true },

  // ---------- خط ۳: قطر جنوب‌غرب به شمال‌شرق ----------
  { id: "azadegan", name: "آزادگان", x: 170, y: 985, label: true },
  { id: "nematabad", name: "نعمت‌آباد", x: 215, y: 952, label: false },
  { id: "abdolabad", name: "عبدل‌آباد", x: 258, y: 920, label: false },
  { id: "shahrak-shariati", name: "شهرک شریعتی", x: 300, y: 888, label: false },
  { id: "zamzam", name: "زمزم", x: 340, y: 858, label: false },
  { id: "javadieh", name: "جوادیه", x: 375, y: 832, label: false },
  { id: "rah-ahan", name: "راه‌آهن", x: 402, y: 808, label: false },
  { id: "mahdieh", name: "مهدیه", x: 425, y: 768, label: false },
  { id: "monirieh", name: "منیریه", x: 418, y: 718, label: false },
  { id: "theater-shahr", name: "تئاتر شهر", x: 404, y: 562, label: true },
  { id: "valiasr-sq", name: "میدان ولیعصر", x: 345, y: 470, label: true },
  { id: "maidan-jehad", name: "میدان جهاد", x: 390, y: 448, label: false },
  { id: "mirzaye-shirazi", name: "میرزای شیرازی", x: 425, y: 440, label: false },
  { id: "sohravardi", name: "سهروردی", x: 505, y: 402, label: false },
  { id: "ghadousi", name: "شهید قدوسی", x: 540, y: 374, label: false },
  { id: "sayyad-shirazi", name: "شهید صیاد شیرازی", x: 575, y: 346, label: false },
  { id: "khajeh-ansari", name: "خواجه عبدالله انصاری", x: 610, y: 318, label: false },
  { id: "zeynoddin", name: "شهید زین‌الدین", x: 645, y: 290, label: false },
  { id: "harooni", name: "هروی", x: 680, y: 262, label: false },
  { id: "hosseinabad", name: "حسین‌آباد", x: 715, y: 234, label: false },
  { id: "nobonyad", name: "نوبنیاد", x: 750, y: 206, label: true },
  { id: "aghdasieh", name: "اقدسیه", x: 785, y: 178, label: false },
  { id: "mahallati", name: "شهید محلاتی", x: 820, y: 150, label: false },
  { id: "qaem", name: "قائم", x: 855, y: 122, label: true },

  // ---------- خط ۴: غرب به شرق از علامه جعفری ----------
  { id: "alameh-jafari", name: "علامه جعفری", x: 36, y: 522, label: true },
  { id: "erm-sabz", name: "ارم سبز", x: 90, y: 508, label: true },
  { id: "ekbatan", name: "شهرک اکباتان", x: 132, y: 516, label: false },
  { id: "bimeh", name: "بیمه", x: 174, y: 524, label: false },
  { id: "azadi-sq", name: "میدان آزادی", x: 214, y: 530, label: true },
  { id: "moin", name: "استاد معین", x: 248, y: 540, label: false },
  { id: "habibollah", name: "دکتر حبیب‌الله", x: 284, y: 546, label: false },
  { id: "towhid", name: "توحید", x: 330, y: 548, label: false },
  { id: "enghelab-sq", name: "میدان انقلاب اسلامی", x: 368, y: 554, label: true },
  { id: "ferdowsi", name: "فردوسی", x: 438, y: 570, label: false },
  { id: "shohada-sq", name: "میدان شهدا", x: 648, y: 652, label: true },
  { id: "ibn-e-sina", name: "ابن‌سینا", x: 695, y: 645, label: false },
  { id: "piroozi-sq", name: "پیروزی", x: 740, y: 635, label: false },
  { id: "nabard", name: "نبرد", x: 785, y: 624, label: false },
  { id: "nirouhavaei", name: "نیروهوایی", x: 825, y: 612, label: false },
  { id: "kolahdouz", name: "شهید کلاهدوز", x: 862, y: 600, label: true },

  // ---------- خط ۵: قطار شهری تهران-کرج (شمال‌غرب) ----------
  { id: "azadi-stadium", name: "ورزشگاه آزادی", x: 72, y: 464, label: false },
  { id: "chitgar", name: "چیتگر", x: 61, y: 420, label: false },
  { id: "iran-khodro", name: "ایران خودرو", x: 53, y: 376, label: false },
  { id: "vardavard", name: "وردآورد", x: 47, y: 332, label: false },
  { id: "garmdareh", name: "گرم‌دره", x: 42, y: 288, label: false },
  { id: "atmosfar", name: "اتمسفر", x: 38, y: 244, label: false },
  { id: "kr-soltani", name: "کرج (شهید سلطانی)", x: 35, y: 200, label: false },
  { id: "kr-mohammadshahr", name: "محمدشهر", x: 33, y: 156, label: false },
  { id: "golshahr", name: "گلشهر", x: 32, y: 112, label: true },
  { id: "fakhri-zadeh", name: "شهید فخری‌زاده", x: 33, y: 68, label: false },
  { id: "ghassem-solaymani", name: "شهید قاسم سلیمانی", x: 34, y: 24, label: true },

  // ---------- خط ۶: جنوب‌شرق به شمال‌غرب ----------
  { id: "dolatabad", name: "شهدای دولت‌آباد", x: 800, y: 860, label: true },
  { id: "kianshahr", name: "کیان‌شهر", x: 778, y: 828, label: false },
  { id: "bassat", name: "بعثت", x: 756, y: 796, label: false },
  { id: "rezaei", name: "شهید رضایی", x: 734, y: 764, label: false },
  { id: "khorasan-sq", name: "میدان خراسان", x: 712, y: 732, label: true },
  { id: "amirkabir", name: "امیرکبیر", x: 672, y: 700, label: false },
  { id: "sarbaz-vatan", name: "سرباز وطن", x: 548, y: 568, label: false },
  { id: "bahar-e-shiraz", name: "بهار شیراز", x: 510, y: 538, label: false },
  { id: "maryam-moghaddas", name: "مریم مقدس", x: 430, y: 492, label: false },
  { id: "bustan-lale", name: "بوستان لاله", x: 292, y: 486, label: false },
  { id: "kargar", name: "کارگر", x: 266, y: 508, label: false },
  { id: "tarbit-modarres", name: "دانشگاه تربیت مدرس", x: 214, y: 452, label: false },
  { id: "azmayesh", name: "شهرک آزمایش", x: 198, y: 416, label: false },
  { id: "marzdaran", name: "مرزداران", x: 190, y: 380, label: false },
  { id: "yadegar-emam", name: "یادگار امام", x: 176, y: 348, label: false },
  { id: "ashrafi-esfahani", name: "شهید اشرفی اصفهانی", x: 166, y: 314, label: false },
  { id: "setari", name: "شهید ستاری", x: 156, y: 280, label: false },
  { id: "kashani", name: "آیت‌الله کاشانی", x: 146, y: 246, label: false },
  { id: "shahr-ziba", name: "شهر زیبا", x: 135, y: 212, label: false },
  { id: "shahran", name: "شهران", x: 125, y: 178, label: false },
  { id: "shahed-e-kon", name: "شهدای کن", x: 114, y: 144, label: false },
  { id: "aliardi", name: "شهید آرمان علی‌وردی", x: 105, y: 110, label: true },

  // ---------- خط ۷: ورزشگاه تختی به میدان کتاب ----------
  { id: "takti", name: "ورزشگاه تختی", x: 700, y: 900, label: true },
  { id: "basij", name: "بسیج", x: 668, y: 872, label: true },
  { id: "ahang", name: "آهنگ", x: 636, y: 844, label: false },
  { id: "doolab", name: "دولاب", x: 604, y: 816, label: false },
  { id: "hefdah-shahrivar", name: "هفده شهریور", x: 572, y: 788, label: false },
  { id: "maidan-ghiyam", name: "میدان قیام", x: 540, y: 760, label: false },
  { id: "molavi", name: "مولوی", x: 505, y: 778, label: false },
  { id: "helal-ahmar", name: "هلال احمر", x: 388, y: 735, label: false },
  { id: "baryank", name: "بریانک", x: 352, y: 712, label: false },
  { id: "komeyl", name: "کمیل", x: 318, y: 694, label: false },
  { id: "roodaki", name: "رودکی", x: 285, y: 680, label: false },
  { id: "modafean-salamat", name: "مدافعان سلامت", x: 302, y: 512, label: false },
  { id: "bustan-goftego", name: "بوستان گفتگو", x: 236, y: 394, label: false },
  { id: "milad", name: "برج میلاد تهران", x: 230, y: 360, label: true },
  { id: "sanat-sq", name: "میدان صنعت", x: 222, y: 326, label: true },
  { id: "dadman", name: "شهید دادمان", x: 226, y: 292, label: false },
  { id: "ketab-sq", name: "میدان کتاب", x: 230, y: 258, label: true },
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
      "emam-hossein-sq", "madani", "sablan", "fedak", "janbazan", "sarasab", "elm-o-sanat",
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
