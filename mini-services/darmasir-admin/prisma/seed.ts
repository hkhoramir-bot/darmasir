/* ============================================================
   Seed پنل درمسیر — داده واقعی شبکه مترو + مدیر اولیه
   مدیر پیش‌فرض:  admin / admin1234   (در اولین ورود تغییر دهید)
   ============================================================ */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { hashPassword } from "../src/lib/hash-cli";

const db = new PrismaClient();

type SeedLine = {
  id: string;
  cityId: string;
  number: number;
  name: string;
  color: string;
  textOnColor: string;
  terminals: string;
  direction: string;
  headway: number;
  headwayPeak: number | null;
  headwayOff: number | null;
  firstTrain: string;
  lastTrain: string;
  segmentMinutes: number;
  badges: string | null;
  status: string;
  statusNote: string | null;
};

type SeedStation = {
  id: string;
  name: string;
  cityId: string;
  lines: string;
  amenities: string;
  featured: boolean;
  lat: number | null;
  lng: number | null;
};

const DEFAULT_SETTINGS: Record<string, string> = {
  "app.name": "درمسیر",
  "app.tagline": "دستیار هوشمند سفر شهری",
  "app.supportMessage": "برای پشتیبانی از بخش «حساب من» در اپلیکیشن پیام بگذارید.",
  "app.minVersion": "4.8.17",
  "app.notice": "",
  "ads.enabled": "true",
  "api.publicBaseUrl": "",
};

async function main() {
  const file = join(dirname(import.meta.url.replace("file://", "")), "seed-data.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    lines: SeedLine[];
    stations: SeedStation[];
  };

  // خطوط و ایستگاه‌ها — upsert تا seed تکراری خراب نکند
  for (const l of raw.lines) {
    await db.line.upsert({
      where: { id: l.id },
      update: { ...l },
      create: { ...l },
    });
  }
  for (const s of raw.stations) {
    await db.station.upsert({
      where: { id: s.id },
      update: { ...s },
      create: { ...s },
    });
  }
  console.log(`seeded ${raw.lines.length} lines, ${raw.stations.length} stations`);

  // تنظیمات پیش‌فرض
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  // نسخه فعلی اپ
  await db.appVersion.upsert({
    where: { versionCode: 497 },
    update: {
      versionName: "4.8.17",
      apkUrl: "/metrojo-4.8.17.apk",
      notes: "نسخه پایدار فعلی",
      active: true,
    },
    create: {
      versionName: "4.8.17",
      versionCode: 497,
      apkUrl: "/metrojo-4.8.17.apk",
      notes: "نسخه پایدار فعلی",
      mandatory: false,
      active: true,
    },
  });

  // مدیر اولیه — فقط اگر هیچ مدیری وجود نداشته باشد
  const adminCount = await db.adminUser.count();
  if (adminCount === 0) {
    await db.adminUser.create({
      data: {
        username: "admin",
        name: "مدیر کل",
        role: "SUPERADMIN",
        passwordHash: hashPassword("admin1234"),
        active: true,
      },
    });
    console.log("created superadmin: admin / admin1234");
  } else {
    console.log(`admin users already exist (${adminCount}) — skipped`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
