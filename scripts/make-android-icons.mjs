/* ============================================================
   ساخت آیکون‌ها و اسپلش سبز درمسیر برای APK اندروید
   اجرا: bun scripts/make-android-icons.mjs
   ============================================================ */
import sharp from "sharp";
import fs from "fs";

const RES = "android/app/src/main/res";
const logoBuf = fs.readFileSync("public/metrojo-logo.svg");

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function composePng({ size, logoFrac, bg, out }) {
  const logoSize = Math.round(size * logoFrac);
  const logo = await sharp(logoBuf, { density: 300 })
    .resize(logoSize, logoSize)
    .png()
    .toBuffer();
  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg || { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  await base.composite([{ input: logo, gravity: "center" }]).png().toFile(out);
}

/* آیکون کلاسیک لانچر — پس‌زمینه سفید + لوگوی سبز */
for (const [d, f] of Object.entries(densities)) {
  const s = Math.round(48 * f);
  await composePng({ size: s, logoFrac: 0.72, bg: "#ffffff", out: `${RES}/mipmap-${d}/ic_launcher.png` });
  await composePng({ size: s, logoFrac: 0.72, bg: "#ffffff", out: `${RES}/mipmap-${d}/ic_launcher_round.png` });
}

/* فورگراند آیکون تطبیقی — لوگو روی شفاف (پس‌زمینه سبز از colors.xml) */
for (const [d, f] of Object.entries(densities)) {
  const s = Math.round(108 * f);
  await composePng({ size: s, logoFrac: 0.58, bg: null, out: `${RES}/mipmap-${d}/ic_launcher_foreground.png` });
}

/* اسپلش — پس‌زمینه سبز خیلی روشن + لوگوی سبز وسط */
let splashCount = 0;
const dirs = fs.readdirSync(RES).filter((d) => d.startsWith("drawable"));
for (const d of dirs) {
  const p = `${RES}/${d}/splash.png`;
  if (!fs.existsSync(p)) continue;
  const m = await sharp(p).metadata();
  if (!m.width || !m.height) continue;
  const logoSize = Math.round(Math.min(m.width, m.height) * 0.3);
  const logo = await sharp(logoBuf, { density: 300 }).resize(logoSize, logoSize).png().toBuffer();
  await sharp({
    create: { width: m.width, height: m.height, channels: 4, background: "#eef8f4" },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(p);
  splashCount++;
}

console.log(`OK icons regenerated: 10 launcher + 5 foreground + ${splashCount} splash`);
