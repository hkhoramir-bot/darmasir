/* ============================================================
   هندسه نقشه شماتیک متروی تهران (SVG)
   مختصات تقریبی نقشه شماتیک — همه ایستگاه‌های مشترک یک مختصات دارند
   ============================================================ */

export interface MapStation {
  id: string;
  name: string;
  x: number;
  y: number;
  label: boolean; // always show label
}

export const MAP_CANVAS = { w: 420, h: 780 };

export const MAP_STATIONS: MapStation[] = [
  // L1 vertical spine (x=260)
  { id: "tajrish", name: "تجریش", x: 260, y: 65, label: true },
  { id: "gholhak", name: "قلهک", x: 260, y: 95, label: false },
  { id: "nobonyad", name: "نوبنیاد", x: 260, y: 125, label: false },
  { id: "shahid-sadr", name: "شهید صدر", x: 260, y: 155, label: false },
  { id: "mirdamad", name: "میرداماد", x: 260, y: 185, label: true },
  { id: "hemmat-l1", name: "همت", x: 260, y: 215, label: false },
  { id: "saba", name: "میدان صبا", x: 260, y: 245, label: false },
  { id: "vanak-sq", name: "میدان ونک", x: 260, y: 275, label: true },
  { id: "dr-shariati", name: "دکتر شریعتی", x: 260, y: 305, label: false },
  { id: "beheshti", name: "شهید بهشتی", x: 260, y: 335, label: true },
  { id: "taleghani", name: "طالقانی", x: 260, y: 365, label: false },
  { id: "dowlat", name: "دروازه دولت", x: 260, y: 395, label: true },
  { id: "emam-khomeini-sq", name: "میدان امام خمینی", x: 260, y: 425, label: true },
  { id: "bazaar", name: "بازار بزرگ", x: 260, y: 455, label: false },
  { id: "panzdah", name: "پانزده خرداد", x: 260, y: 485, label: false },
  { id: "mohammadieh", name: "میدان محمدیه", x: 260, y: 515, label: true },
  { id: "molavi", name: "مولوی", x: 260, y: 545, label: false },
  { id: "khorasan-l1", name: "خراسان", x: 260, y: 575, label: false },
  { id: "nabard", name: "نبرد", x: 260, y: 605, label: false },
  { id: "javanmard", name: "جوانمرد قصاب", x: 260, y: 635, label: false },
  { id: "shahrerey", name: "شهر ری", x: 260, y: 665, label: false },
  { id: "haram", name: "حرم امام خمینی", x: 260, y: 695, label: true },
  { id: "kahrizak", name: "کهریزک", x: 260, y: 725, label: true },

  // L2 west-east at y=425
  { id: "sadeghieh", name: "صادقیه", x: 35, y: 425, label: true },
  { id: "almahdi", name: "المهدی", x: 75, y: 425, label: false },
  { id: "shadman", name: "شادمان", x: 115, y: 425, label: false },
  { id: "enghelab-sq", name: "میدان انقلاب", x: 160, y: 425, label: true },
  { id: "hasanabad", name: "حسن‌آباد", x: 305, y: 460, label: false },
  { id: "khorasan-sq", name: "میدان خراسان", x: 335, y: 505, label: true },
  { id: "resalat-sq", name: "میدان رسالت", x: 372, y: 540, label: false },
  { id: "shahid-kaveh", name: "شهید کاوه", x: 372, y: 580, label: false },
  { id: "farhangsara", name: "فرهنگسرا", x: 372, y: 620, label: true },

  // L4 west-east
  { id: "erm-sabz", name: "ارم سبز", x: 35, y: 330, label: true },
  { id: "mehrabad", name: "مهرآباد", x: 75, y: 348, label: false },
  { id: "towhid", name: "توحید", x: 115, y: 370, label: true },
  { id: "theater-shahr", name: "تئاتر شهر", x: 195, y: 455, label: true },
  { id: "ferdowsi", name: "فردوسی", x: 225, y: 435, label: false },
  { id: "shohada-sq", name: "میدان شهدا", x: 300, y: 370, label: true },
  { id: "piroozi-sq", name: "میدان پیروزی", x: 340, y: 350, label: false },
  { id: "babaei", name: "شهید بابایی", x: 360, y: 320, label: false },
  { id: "kolahdouz", name: "شهید کلاهدوز", x: 378, y: 290, label: true },

  // L3 diagonal NE -> SW
  { id: "qaem", name: "قائم", x: 372, y: 120, label: true },
  { id: "zeynoddin", name: "شهید زین‌الدین", x: 330, y: 172, label: false },
  { id: "emam-hossein-sq", name: "میدان امام حسین", x: 300, y: 230, label: true },
  { id: "baharestan", name: "بهارستان", x: 285, y: 300, label: false },
  { id: "haft-tir", name: "میدان هفت تیر", x: 225, y: 380, label: true },
  { id: "naziabad", name: "نازی‌آباد", x: 170, y: 540, label: false },
  { id: "azadegan", name: "آزادگان", x: 140, y: 620, label: true },

  // L5 NW diagonal
  { id: "chitgar", name: "چیتگر", x: 42, y: 355, label: false },
  { id: "vardavard", name: "وردآورد", x: 48, y: 290, label: false },
  { id: "mahdasht", name: "ماهداشت", x: 56, y: 225, label: false },
  { id: "andisheh", name: "اندیشه", x: 62, y: 160, label: false },
  { id: "golshahr", name: "گلشهر", x: 70, y: 95, label: true },

  // L6
  { id: "dolatabad", name: "دولت‌آباد", x: 320, y: 660, label: true },
  { id: "solh", name: "صلح", x: 310, y: 470, label: false },
  { id: "mahdieh", name: "مهدیه", x: 225, y: 550, label: true },
  { id: "valiasr-sq", name: "میدان ولیعصر", x: 175, y: 570, label: false },
  { id: "aliardi", name: "شهید آرمان علی‌وردی", x: 130, y: 600, label: true },

  // L7
  { id: "ketab-sq", name: "میدان کتاب", x: 85, y: 300, label: true },
  { id: "sanat-sq", name: "میدان صنعت", x: 90, y: 450, label: true },
  { id: "basij", name: "بسیج", x: 320, y: 590, label: true },
];

/** مسیر هر خط به ترتیب ایستگاه‌ها */
export const MAP_LINES: { lineId: string; color: string; stations: string[] }[] = [
  {
    lineId: "l1",
    color: "#e52421",
    stations: ["kahrizak", "haram", "shahrerey", "javanmard", "nabard", "khorasan-l1", "molavi", "mohammadieh", "panzdah", "bazaar", "emam-khomeini-sq", "dowlat", "taleghani", "beheshti", "dr-shariati", "vanak-sq", "saba", "hemmat-l1", "mirdamad", "gholhak", "nobonyad", "shahid-sadr", "tajrish"],
  },
  {
    lineId: "l2",
    color: "#15397a",
    stations: ["sadeghieh", "almahdi", "shadman", "enghelab-sq", "emam-khomeini-sq", "hasanabad", "khorasan-sq", "resalat-sq", "shahid-kaveh", "farhangsara"],
  },
  {
    lineId: "l3",
    color: "#00a3e0",
    stations: ["azadegan", "naziabad", "theater-shahr", "haft-tir", "beheshti", "baharestan", "emam-hossein-sq", "zeynoddin", "qaem"],
  },
  {
    lineId: "l4",
    color: "#f6b400",
    stations: ["erm-sabz", "mehrabad", "towhid", "enghelab-sq", "theater-shahr", "ferdowsi", "dowlat", "shohada-sq", "piroozi-sq", "babaei", "kolahdouz"],
  },
  {
    lineId: "l5",
    color: "#009640",
    stations: ["sadeghieh", "chitgar", "vardavard", "mahdasht", "andisheh", "golshahr"],
  },
  {
    lineId: "l6",
    color: "#d82572",
    stations: ["dolatabad", "khorasan-sq", "solh", "emam-hossein-sq", "mahdieh", "valiasr-sq", "aliardi"],
  },
  {
    lineId: "l7",
    color: "#7d2382",
    stations: ["ketab-sq", "towhid", "sanat-sq", "mahdieh", "mohammadieh", "basij"],
  },
];

export const MAP_STATION_BY_ID = new Map(MAP_STATIONS.map((s) => [s.id, s]));
