/* ============================================================
   رنگ‌های تطبیقی — متن خوانا روی هر دو تم (روشن/تاریک)
   رنگ خطوط مترو و وضعیت‌ها (ازدحام/تجهیزات) به‌صورت hex ثابت
   در داده می‌آیند؛ روی زمینه تیره باید روشن و روی زمینه روشن
   در صورت نیاز کمی تیره شوند تا همیشه خوانا بمانند.
   ============================================================ */

interface RGB {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): RGB {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6) || "000000", 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
const rgbToHex = ({ r, g, b }: RGB) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;

/** درخشش ادراکی ۰..۱ */
export function hexLuma(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** ترکیب دو رنگ — t=0 یعنی کاملاً a و t=1 یعنی کاملاً b */
export function mixHex(a: string, b: string, t: number): string {
  const A = parseHex(a);
  const B = parseHex(b);
  return rgbToHex({
    r: A.r + (B.r - A.r) * t,
    g: A.g + (B.g - A.g) * t,
    b: A.b + (B.b - A.b) * t,
  });
}

/**
 * رنگ متن خوانا برای رنگ‌های برند (خط مترو/وضعیت) روی زمینه تم فعلی.
 * dark=true → رنگ‌های تیره به سمت سفید روشن می‌شوند (مثل قرمز خط ۱ روی تم تاریک)
 * dark=false → رنگ‌های خیلی روشن کمی تیره می‌شوند تا روی سفید پن نمیزنند
 */
export function inkOn(hex: string, dark: boolean): string {
  if (!hex) return hex;
  const luma = hexLuma(hex);
  if (dark) {
    if (luma >= 0.52) return hex;
    /* هرچه تیره‌تر، ترکیب با سفید بیشتر — سقف ۷۲٪ برای حفظ هویت رنگ */
    const t = Math.min(0.72, Math.max(0.3, (0.55 - luma) * 1.5));
    return mixHex(hex, "#ffffff", t);
  }
  if (luma <= 0.3) return hex;
  const t = Math.min(0.38, Math.max(0.08, (luma - 0.3) * 0.75));
  return mixHex(hex, "#1a1a1a", t);
}

/**
 * پس‌زمینه ملایم هم‌خانواده با رنگ برند (تینت آلفا) —
 * روی تم تاریک آلفای بیشتر برای دیده‌شدن تینت روی سطح تیره.
 */
export function tintOn(hex: string, dark: boolean): string {
  if (!hex) return hex;
  return `${hex}${dark ? "26" : "14"}`;
}

/** نسخه آلفای آزاد برای حاشیه‌ها و خطوط ظریف */
export function alphaOn(hex: string, dark: boolean): string {
  if (!hex) return hex;
  return `${hex}${dark ? "55" : "45"}`;
}
