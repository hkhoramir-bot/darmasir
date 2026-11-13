/* ============================================================
   هندسه نقشه شماتیک متروی تهران (SVG) — بر اساس شبکه واقعی
   همه ایستگاه‌های مشترک (تبادلی) دقیقاً یک مختصات دارند
   نسخه ۷۴۴px: بوم بزرگ‌تر، خطوط موازی با فاصله زیاد و
   برچسب‌ها بدون هم‌پوشانی (خوانایی در زوم ۱)
   ============================================================ */

export interface MapStation {
  id: string;
  name: string;
  x: number;
  y: number;
  label: boolean; // always show label
}

export const MAP_CANVAS = { w: 744, h: 1020 };

export const MAP_STATIONS: MapStation[] = [
  // ---------- خط ۱: ستون شمالی-جنوبی (x=370) ----------
  { id: "tajrish", name: "تجریش", x: 370, y: 48, label: true },
  { id: "ghitrieh", name: "قیطریه", x: 370, y: 81, label: false },
  { id: "shahid-sadr", name: "شهید صدر", x: 370, y: 114, label: false },
  { id: "gholhak", name: "قلهک", x: 370, y: 147, label: false },
  { id: "dr-shariati", name: "دکتر شریعتی", x: 370, y: 180, label: false },
  { id: "mirdamad", name: "میرداماد", x: 370, y: 213, label: true },
  { id: "haghdani", name: "شهید حقانی", x: 370, y: 246, label: false },
  { id: "hemmat", name: "شهید همت", x: 370, y: 279, label: false },
  { id: "mosalla", name: "مصلی امام خمینی", x: 370, y: 312, label: false },
  { id: "beheshti", name: "شهید بهشتی", x: 370, y: 345, label: true },
  { id: "mofatteh", name: "شهید مفتح", x: 370, y: 378, label: false },
  { id: "haft-tir", name: "شهدای هفتم تیر", x: 370, y: 411, label: true },
  { id: "taleghani", name: "طالقانی", x: 370, y: 444, label: false },
  { id: "dowlat", name: "دروازه دولت", x: 370, y: 477, label: true },
  { id: "saadi", name: "سعدی", x: 370, y: 510, label: false },
  { id: "emam-khomeini-sq", name: "امام خمینی", x: 370, y: 543, label: true },
  { id: "panzdah", name: "پانزده خرداد", x: 370, y: 576, label: false },
  { id: "khayyam", name: "خیام", x: 370, y: 609, label: false },
  { id: "mohammadieh", name: "میدان محمدیه", x: 370, y: 642, label: true },
  { id: "shush", name: "شوش", x: 370, y: 675, label: false },
  { id: "payane-jonub", name: "پایانه جنوب", x: 370, y: 708, label: false },
  { id: "bokharaei", name: "شهید بخارایی", x: 370, y: 741, label: false },
  { id: "aliabad", name: "علی‌آباد", x: 370, y: 774, label: false },
  { id: "javanmard", name: "جوانمرد قصاب", x: 370, y: 807, label: false },
  { id: "shahrerey", name: "شهرری", x: 370, y: 840, label: false },
  { id: "palayeshgah", name: "پالایشگاه", x: 370, y: 873, label: false },
  { id: "shahed-baghershahr", name: "شاهد - باقرشهر", x: 370, y: 906, label: false },
  { id: "haram", name: "حرم مطهر امام خمینی", x: 370, y: 939, label: true },
  { id: "kahrizak", name: "کهریزک", x: 370, y: 972, label: true },

  // ---------- خط ۲: غرب به شرق از صادقیه ----------
  { id: "sadeghieh", name: "صادقیه", x: 36, y: 555, label: true },
  { id: "tarasht", name: "طرشت", x: 74, y: 555, label: false },
  { id: "sharif", name: "دانشگاه شریف", x: 112, y: 555, label: false },
  { id: "shadman", name: "شادمان", x: 188, y: 555, label: true },
  { id: "navab-safavi", name: "شهید نواب صفوی", x: 222, y: 555, label: false },
  { id: "maidan-harr", name: "میدان حر", x: 254, y: 555, label: false },
  { id: "imam-ali", name: "دانشگاه امام علی", x: 286, y: 555, label: false },
  { id: "hassanabad", name: "حسن‌آباد", x: 316, y: 555, label: false },
  { id: "mellat", name: "ملت", x: 404, y: 561, label: false },
  { id: "baharestan", name: "بهارستان", x: 438, y: 563, label: false },
  { id: "darvazeh-shemiran", name: "دروازه شمیران", x: 486, y: 541, label: false },
  { id: "emam-hossein-sq", name: "امام حسین", x: 516, y: 529, label: true },
  { id: "madani", name: "شهید مدنی", x: 548, y: 489, label: false },
  { id: "sabalan", name: "سبلان", x: 568, y: 475, label: false },
  { id: "fedak", name: "فدک", x: 584, y: 455, label: false },
  { id: "janbazan", name: "جانبازان", x: 598, y: 435, label: false },
  { id: "sarasab", name: "سرسبز", x: 612, y: 415, label: false },
  { id: "elm-o-sanat", name: "دانشگاه علم و صنعت", x: 624, y: 393, label: false },
  { id: "baghery", name: "شهید باقری", x: 636, y: 369, label: false },
  { id: "tehranpars", name: "تهرانپارس", x: 648, y: 345, label: false },
  { id: "farhangsara", name: "فرهنگسرا", x: 662, y: 321, label: true },

  // ---------- خط ۳: قطر جنوب‌غرب به شمال‌شرق ----------
  { id: "azadegan", name: "آزادگان", x: 150, y: 749, label: true },
  { id: "nematabad", name: "نعمت‌آباد", x: 188, y: 729, label: false },
  { id: "abdolabad", name: "عبدل‌آباد", x: 224, y: 709, label: false },
  { id: "shahrak-shariati", name: "شهرک شریعتی", x: 256, y: 689, label: false },
  { id: "zamzam", name: "زمزم", x: 286, y: 665, label: false },
  { id: "javadieh", name: "جوادیه", x: 306, y: 651, label: false },
  { id: "rah-ahan", name: "راه‌آهن", x: 322, y: 639, label: false },
  { id: "mahdieh", name: "مهدیه", x: 330, y: 605, label: false },
  { id: "monirieh", name: "منیریه", x: 334, y: 577, label: false },
  { id: "theater-shahr", name: "تئاتر شهر", x: 302, y: 477, label: true },
  { id: "valiasr-sq", name: "میدان ولیعصر", x: 322, y: 390, label: true },
  { id: "maidan-jehad", name: "میدان جهاد", x: 340, y: 372, label: false },
  { id: "mirzaye-shirazi", name: "میرزای شیرازی", x: 354, y: 358, label: false },
  { id: "sohravardi", name: "سهروردی", x: 392, y: 333, label: false },
  { id: "ghadousi", name: "شهید قدوسی", x: 414, y: 321, label: false },
  { id: "sayyad-shirazi", name: "شهید صیاد شیرازی", x: 436, y: 309, label: false },
  { id: "khajeh-ansari", name: "خواجه عبدالله انصاری", x: 458, y: 297, label: false },
  { id: "zeynoddin", name: "شهید زین‌الدین", x: 480, y: 285, label: false },
  { id: "harooni", name: "هروی", x: 502, y: 273, label: false },
  { id: "hosseinabad", name: "حسین‌آباد", x: 524, y: 261, label: false },
  { id: "nobonyad", name: "نوبنیاد", x: 546, y: 249, label: true },
  { id: "aghdasieh", name: "اقدسیه", x: 568, y: 237, label: false },
  { id: "mahallati", name: "شهید محلاتی", x: 590, y: 225, label: false },
  { id: "qaem", name: "قائم", x: 612, y: 213, label: true },

  // ---------- خط ۴: غرب به شرق از علامه جعفری ----------
  { id: "alameh-jafari", name: "علامه جعفری", x: 22, y: 425, label: true },
  { id: "erm-sabz", name: "ارم سبز", x: 64, y: 443, label: true },
  { id: "ekbatan", name: "شهرک اکباتان", x: 94, y: 461, label: false },
  { id: "bimeh", name: "بیمه", x: 118, y: 469, label: false },
  { id: "azadi-sq", name: "میدان آزادی", x: 144, y: 473, label: true },
  { id: "moin", name: "استاد معین", x: 170, y: 465, label: false },
  { id: "habibollah", name: "دکتر حبیب‌الله", x: 200, y: 471, label: false },
  { id: "towhid", name: "توحید", x: 244, y: 477, label: false },
  { id: "enghelab-sq", name: "میدان انقلاب اسلامی", x: 272, y: 477, label: true },
  { id: "ferdowsi", name: "فردوسی", x: 336, y: 477, label: false },
  { id: "shohada-sq", name: "میدان شهدا", x: 524, y: 553, label: true },
  { id: "ibn-e-sina", name: "ابن‌سینا", x: 556, y: 545, label: false },
  { id: "piroozi-sq", name: "پیروزی", x: 588, y: 533, label: false },
  { id: "nabard", name: "نبرد", x: 620, y: 519, label: false },
  { id: "nirouhavaei", name: "نیروهوایی", x: 652, y: 505, label: false },
  { id: "kolahdouz", name: "شهید کلاهدوز", x: 682, y: 491, label: true },

  // ---------- خط ۵: قطار شهری تهران-کرج (شمال‌غرب) ----------
  { id: "azadi-stadium", name: "ورزشگاه آزادی", x: 44, y: 393, label: false },
  { id: "chitgar", name: "چیتگر", x: 30, y: 357, label: false },
  { id: "iran-khodro", name: "ایران خودرو", x: 20, y: 321, label: false },
  { id: "vardavard", name: "وردآورد", x: 14, y: 287, label: false },
  { id: "garmdareh", name: "گرم‌دره", x: 10, y: 253, label: false },
  { id: "atmosfar", name: "اتمسفر", x: 8, y: 219, label: false },
  { id: "kr-soltani", name: "کرج (شهید سلطانی)", x: 8, y: 185, label: false },
  { id: "kr-mohammadshahr", name: "محمدشهر", x: 10, y: 151, label: false },
  { id: "golshahr", name: "گلشهر", x: 12, y: 117, label: true },
  { id: "fakhri-zadeh", name: "شهید فخری‌زاده", x: 14, y: 83, label: false },
  { id: "ghassem-solaymani", name: "شهید قاسم سلیمانی", x: 16, y: 49, label: true },

  // ---------- خط ۶: جنوب‌شرق به شمال‌غرب ----------
  { id: "dolatabad", name: "شهدای دولت‌آباد", x: 708, y: 729, label: true },
  { id: "kianshahr", name: "کیان‌شهر", x: 692, y: 705, label: false },
  { id: "bassat", name: "بعثت", x: 676, y: 681, label: false },
  { id: "rezaei", name: "شهید رضایی", x: 660, y: 657, label: false },
  { id: "khorasan-sq", name: "میدان خراسان", x: 644, y: 633, label: true },
  { id: "amirkabir", name: "امیرکبیر", x: 600, y: 595, label: false },
  { id: "sarbaz-vatan", name: "سرباز وطن", x: 458, y: 495, label: false },
  { id: "bahar-e-shiraz", name: "بهار شیراز", x: 412, y: 470, label: false },
  { id: "maryam-moghaddas", name: "مریم مقدس", x: 348, y: 401, label: false },
  { id: "bustan-lale", name: "بوستان لاله", x: 292, y: 404, label: false },
  { id: "kargar", name: "کارگر", x: 260, y: 423, label: false },
  { id: "tarbit-modarres", name: "دانشگاه تربیت مدرس", x: 196, y: 351, label: false },
  { id: "azmayesh", name: "شهرک آزمایش", x: 142, y: 347, label: false },
  { id: "marzdaran", name: "مرزداران", x: 130, y: 325, label: false },
  { id: "yadegar-emam", name: "یادگار امام", x: 122, y: 301, label: false },
  { id: "ashrafi-esfahani", name: "شهید اشرفی اصفهانی", x: 114, y: 277, label: false },
  { id: "setari", name: "شهید ستاری", x: 106, y: 253, label: false },
  { id: "kashani", name: "آیت‌الله کاشانی", x: 100, y: 229, label: false },
  { id: "shahr-ziba", name: "شهر زیبا", x: 96, y: 205, label: false },
  { id: "shahran", name: "شهران", x: 92, y: 181, label: false },
  { id: "shahed-e-kon", name: "شهدای کن", x: 88, y: 157, label: false },
  { id: "aliardi", name: "شهید آرمان علی‌وردی", x: 84, y: 133, label: true },

  // ---------- خط ۷: ورزشگاه تختی به میدان کتاب ----------
  { id: "takti", name: "ورزشگاه تختی", x: 636, y: 757, label: true },
  { id: "basij", name: "بسیج", x: 612, y: 737, label: true },
  { id: "ahang", name: "آهنگ", x: 588, y: 717, label: false },
  { id: "doolab", name: "دولاب", x: 564, y: 697, label: false },
  { id: "hefdah-shahrivar", name: "هفده شهریور", x: 540, y: 677, label: false },
  { id: "maidan-ghiyam", name: "میدان قیام", x: 516, y: 657, label: false },
  { id: "molavi", name: "مولوی", x: 492, y: 637, label: false },
  { id: "helal-ahmar", name: "هلال احمر", x: 296, y: 593, label: false },
  { id: "baryank", name: "بریانک", x: 266, y: 585, label: false },
  { id: "komeyl", name: "کمیل", x: 240, y: 579, label: false },
  { id: "roodaki", name: "رودکی", x: 212, y: 573, label: false },
  { id: "modafean-salamat", name: "مدافعان سلامت", x: 234, y: 437, label: false },
  { id: "bustan-goftego", name: "بوستان گفتگو", x: 180, y: 329, label: false },
  { id: "milad", name: "برج میلاد تهران", x: 158, y: 319, label: true },
  { id: "sanat-sq", name: "میدان صنعت", x: 152, y: 289, label: true },
  { id: "dadman", name: "شهید دادمان", x: 158, y: 257, label: false },
  { id: "ketab-sq", name: "میدان کتاب", x: 164, y: 225, label: true },
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
