/* ============================================================
   هندسه نقشه شماتیک متروی تهران (SVG) — بر اساس شبکه واقعی
   همه ایستگاه‌های مشترک (تبادلی) دقیقاً یک مختصات دارند
   نسخه ۸۸۰×۱۴۲۰ «باز»: فاصله عمودی خطوط و ایستگاه‌ها ~۱۶٪ بیشتر
   (طبق نقشه کلاسیک) تا برچسب‌ها روی هم نیفتند — خوانایی در زوم ۱
   ============================================================ */

export interface MapStation {
  id: string;
  name: string;
  x: number;
  y: number;
  label: boolean; // always show label
}

export const MAP_CANVAS = { w: 880, h: 1420 };

export const MAP_STATIONS: MapStation[] = [
  // ---------- خط ۱: ستون شمالی-جنوبی (x=470) ----------
  { id: "tajrish", name: "تجریش", x: 470, y: 80, label: true },
  { id: "ghitrieh", name: "قیطریه", x: 470, y: 127, label: false },
  { id: "shahid-sadr", name: "شهید صدر", x: 470, y: 173, label: false },
  { id: "gholhak", name: "قلهک", x: 470, y: 220, label: false },
  { id: "dr-shariati", name: "دکتر شریعتی", x: 470, y: 266, label: false },
  { id: "mirdamad", name: "میرداماد", x: 470, y: 313, label: true },
  { id: "haghdani", name: "شهید حقانی", x: 470, y: 359, label: false },
  { id: "hemmat", name: "شهید همت", x: 470, y: 406, label: false },
  { id: "mosalla", name: "مصلی امام خمینی", x: 470, y: 452, label: false },
  { id: "beheshti", name: "شهید بهشتی", x: 470, y: 499, label: true },
  { id: "mofatteh", name: "شهید مفتح", x: 470, y: 545, label: false },
  { id: "haft-tir", name: "شهدای هفتم تیر", x: 470, y: 592, label: true },
  { id: "taleghani", name: "طالقانی", x: 470, y: 639, label: false },
  { id: "dowlat", name: "دروازه دولت", x: 470, y: 685, label: true },
  { id: "saadi", name: "سعدی", x: 470, y: 732, label: false },
  { id: "emam-khomeini-sq", name: "امام خمینی", x: 470, y: 778, label: true },
  { id: "panzdah", name: "پانزده خرداد", x: 470, y: 825, label: false },
  { id: "khayyam", name: "خیام", x: 470, y: 871, label: false },
  { id: "mohammadieh", name: "میدان محمدیه", x: 470, y: 918, label: true },
  { id: "shush", name: "شوش", x: 470, y: 964, label: false },
  { id: "payane-jonub", name: "پایانه جنوب", x: 470, y: 1011, label: false },
  { id: "bokharaei", name: "شهید بخارایی", x: 470, y: 1057, label: false },
  { id: "aliabad", name: "علی‌آباد", x: 470, y: 1104, label: false },
  { id: "javanmard", name: "جوانمرد قصاب", x: 470, y: 1151, label: false },
  { id: "shahrerey", name: "شهرری", x: 470, y: 1197, label: false },
  { id: "palayeshgah", name: "پالایشگاه", x: 470, y: 1244, label: false },
  { id: "shahed-baghershahr", name: "شاهد - باقرشهر", x: 470, y: 1290, label: false },
  { id: "haram", name: "حرم مطهر امام خمینی", x: 470, y: 1337, label: true },
  { id: "kahrizak", name: "کهریزک", x: 470, y: 1383, label: true },

  // ---------- خط ۲: غرب به شرق از صادقیه ----------
  { id: "sadeghieh", name: "صادقیه", x: 42, y: 767, label: true },
  { id: "tarasht", name: "طرشت", x: 88, y: 767, label: false },
  { id: "sharif", name: "دانشگاه شریف", x: 134, y: 767, label: false },
  { id: "shadman", name: "شادمان", x: 196, y: 767, label: true },
  { id: "navab-safavi", name: "شهید نواب صفوی", x: 240, y: 767, label: false },
  { id: "maidan-harr", name: "میدان حر", x: 282, y: 767, label: false },
  { id: "imam-ali", name: "دانشگاه امام علی", x: 326, y: 767, label: false },
  { id: "hassanabad", name: "حسن‌آباد", x: 370, y: 767, label: false },
  { id: "mellat", name: "ملت", x: 508, y: 787, label: false },
  { id: "baharestan", name: "بهارستان", x: 548, y: 794, label: false },
  { id: "darvazeh-shemiran", name: "دروازه شمیران", x: 590, y: 737, label: false },
  { id: "emam-hossein-sq", name: "امام حسین", x: 630, y: 706, label: true },
  { id: "madani", name: "شهید مدنی", x: 672, y: 657, label: false },
  { id: "sablan", name: "سبلان", x: 702, y: 625, label: false },
  { id: "fedak", name: "فدک", x: 730, y: 592, label: false },
  { id: "janbazan", name: "جانبازان", x: 758, y: 559, label: false },
  { id: "sarasab", name: "سرسبز", x: 786, y: 527, label: false },
  { id: "elm-o-sanat", name: "دانشگاه علم و صنعت", x: 812, y: 490, label: false },
  { id: "baghery", name: "شهید باقری", x: 832, y: 450, label: false },
  { id: "tehranpars", name: "تهرانپارس", x: 850, y: 410, label: false },
  { id: "farhangsara", name: "فرهنگسرا", x: 860, y: 369, label: true },

  // ---------- خط ۳: قطر جنوب‌غرب به شمال‌شرق ----------
  { id: "azadegan", name: "آزادگان", x: 170, y: 1145, label: true },
  { id: "nematabad", name: "نعمت‌آباد", x: 215, y: 1106, label: false },
  { id: "abdolabad", name: "عبدل‌آباد", x: 258, y: 1069, label: false },
  { id: "shahrak-shariati", name: "شهرک شریعتی", x: 300, y: 1032, label: false },
  { id: "zamzam", name: "زمزم", x: 340, y: 997, label: false },
  { id: "javadieh", name: "جوادیه", x: 375, y: 967, label: false },
  { id: "rah-ahan", name: "راه‌آهن", x: 402, y: 939, label: false },
  { id: "mahdieh", name: "مهدیه", x: 425, y: 892, label: false },
  { id: "monirieh", name: "منیریه", x: 418, y: 834, label: false },
  { id: "theater-shahr", name: "تئاتر شهر", x: 404, y: 652, label: true },
  { id: "valiasr-sq", name: "میدان ولیعصر", x: 345, y: 545, label: true },
  { id: "maidan-jehad", name: "میدان جهاد", x: 390, y: 520, label: false },
  { id: "mirzaye-shirazi", name: "میرزای شیرازی", x: 425, y: 511, label: false },
  { id: "sohravardi", name: "سهروردی", x: 505, y: 466, label: false },
  { id: "ghadousi", name: "شهید قدوسی", x: 540, y: 434, label: false },
  { id: "sayyad-shirazi", name: "شهید صیاد شیرازی", x: 575, y: 401, label: false },
  { id: "khajeh-ansari", name: "خواجه عبدالله انصاری", x: 610, y: 369, label: false },
  { id: "zeynoddin", name: "شهید زین‌الدین", x: 645, y: 336, label: false },
  { id: "harooni", name: "هروی", x: 680, y: 303, label: false },
  { id: "hosseinabad", name: "حسین‌آباد", x: 715, y: 271, label: false },
  { id: "nobonyad", name: "نوبنیاد", x: 750, y: 238, label: true },
  { id: "aghdasieh", name: "اقدسیه", x: 785, y: 206, label: false },
  { id: "mahallati", name: "شهید محلاتی", x: 820, y: 173, label: false },
  { id: "qaem", name: "قائم", x: 855, y: 141, label: true },

  // ---------- خط ۴: غرب به شرق از علامه جعفری ----------
  { id: "alameh-jafari", name: "علامه جعفری", x: 36, y: 606, label: true },
  { id: "erm-sabz", name: "ارم سبز", x: 90, y: 590, label: true },
  { id: "ekbatan", name: "شهرک اکباتان", x: 132, y: 599, label: false },
  { id: "bimeh", name: "بیمه", x: 174, y: 608, label: false },
  { id: "azadi-sq", name: "میدان آزادی", x: 214, y: 615, label: true },
  { id: "moin", name: "استاد معین", x: 248, y: 627, label: false },
  { id: "habibollah", name: "دکتر حبیب‌الله", x: 284, y: 634, label: false },
  { id: "towhid", name: "توحید", x: 330, y: 636, label: false },
  { id: "enghelab-sq", name: "میدان انقلاب اسلامی", x: 368, y: 643, label: true },
  { id: "ferdowsi", name: "فردوسی", x: 438, y: 662, label: false },
  { id: "shohada-sq", name: "میدان شهدا", x: 648, y: 757, label: true },
  { id: "ibn-e-sina", name: "ابن‌سینا", x: 695, y: 749, label: false },
  { id: "piroozi-sq", name: "پیروزی", x: 740, y: 737, label: false },
  { id: "nabard", name: "نبرد", x: 785, y: 725, label: false },
  { id: "nirouhavaei", name: "نیروهوایی", x: 825, y: 711, label: false },
  { id: "kolahdouz", name: "شهید کلاهدوز", x: 862, y: 697, label: true },

  // ---------- خط ۵: قطار شهری تهران-کرج (شمال‌غرب) ----------
  { id: "azadi-stadium", name: "ورزشگاه آزادی", x: 72, y: 538, label: false },
  { id: "chitgar", name: "چیتگر", x: 61, y: 487, label: false },
  { id: "iran-khodro", name: "ایران خودرو", x: 53, y: 436, label: false },
  { id: "vardavard", name: "وردآورد", x: 47, y: 385, label: false },
  { id: "garmdareh", name: "گرم‌دره", x: 42, y: 334, label: false },
  { id: "atmosfar", name: "اتمسفر", x: 38, y: 282, label: false },
  { id: "kr-soltani", name: "کرج (شهید سلطانی)", x: 35, y: 231, label: false },
  { id: "kr-mohammadshahr", name: "محمدشهر", x: 33, y: 180, label: false },
  { id: "golshahr", name: "گلشهر", x: 32, y: 129, label: true },
  { id: "fakhri-zadeh", name: "شهید فخری‌زاده", x: 33, y: 78, label: false },
  { id: "ghassem-solaymani", name: "شهید قاسم سلیمانی", x: 34, y: 26, label: true },

  // ---------- خط ۶: جنوب‌شرق به شمال‌غرب ----------
  { id: "dolatabad", name: "شهدای دولت‌آباد", x: 800, y: 999, label: true },
  { id: "kianshahr", name: "کیان‌شهر", x: 778, y: 962, label: false },
  { id: "bassat", name: "بعثت", x: 756, y: 925, label: false },
  { id: "rezaei", name: "شهید رضایی", x: 734, y: 888, label: false },
  { id: "khorasan-sq", name: "میدان خراسان", x: 712, y: 850, label: true },
  { id: "amirkabir", name: "امیرکبیر", x: 672, y: 813, label: false },
  { id: "sarbaz-vatan", name: "سرباز وطن", x: 548, y: 659, label: false },
  { id: "bahar-e-shiraz", name: "بهار شیراز", x: 510, y: 625, label: false },
  { id: "maryam-moghaddas", name: "مریم مقدس", x: 430, y: 571, label: false },
  { id: "bustan-lale", name: "بوستان لاله", x: 292, y: 564, label: false },
  { id: "kargar", name: "کارگر", x: 266, y: 590, label: false },
  { id: "tarbit-modarres", name: "دانشگاه تربیت مدرس", x: 214, y: 524, label: false },
  { id: "azmayesh", name: "شهرک آزمایش", x: 198, y: 483, label: false },
  { id: "marzdaran", name: "مرزداران", x: 190, y: 441, label: false },
  { id: "yadegar-emam", name: "یادگار امام", x: 176, y: 403, label: false },
  { id: "ashrafi-esfahani", name: "شهید اشرفی اصفهانی", x: 166, y: 364, label: false },
  { id: "setari", name: "شهید ستاری", x: 156, y: 324, label: false },
  { id: "kashani", name: "آیت‌الله کاشانی", x: 146, y: 285, label: false },
  { id: "shahr-ziba", name: "شهر زیبا", x: 135, y: 245, label: false },
  { id: "shahran", name: "شهران", x: 125, y: 206, label: false },
  { id: "shahed-e-kon", name: "شهدای کن", x: 114, y: 166, label: false },
  { id: "aliardi", name: "شهید آرمان علی‌وردی", x: 105, y: 127, label: true },

  // ---------- خط ۷: ورزشگاه تختی به میدان کتاب ----------
  { id: "takti", name: "ورزشگاه تختی", x: 700, y: 1046, label: true },
  { id: "basij", name: "بسیج", x: 668, y: 1013, label: true },
  { id: "ahang", name: "آهنگ", x: 636, y: 981, label: false },
  { id: "doolab", name: "دولاب", x: 604, y: 948, label: false },
  { id: "hefdah-shahrivar", name: "هفده شهریور", x: 572, y: 915, label: false },
  { id: "maidan-ghiyam", name: "میدان قیام", x: 540, y: 883, label: false },
  { id: "molavi", name: "مولوی", x: 505, y: 904, label: false },
  { id: "helal-ahmar", name: "هلال احمر", x: 388, y: 854, label: false },
  { id: "baryank", name: "بریانک", x: 352, y: 827, label: false },
  { id: "komeyl", name: "کمیل", x: 318, y: 806, label: false },
  { id: "roodaki", name: "رودکی", x: 285, y: 790, label: false },
  { id: "modafean-salamat", name: "مدافعان سلامت", x: 302, y: 594, label: false },
  { id: "bustan-goftego", name: "بوستان گفتگو", x: 236, y: 457, label: false },
  { id: "milad", name: "برج میلاد تهران", x: 230, y: 417, label: true },
  { id: "sanat-sq", name: "میدان صنعت", x: 222, y: 378, label: true },
  { id: "dadman", name: "شهید دادمان", x: 226, y: 338, label: false },
  { id: "ketab-sq", name: "میدان کتاب", x: 230, y: 299, label: true },
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
