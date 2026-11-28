// ============================================================
// ساخت URLهای داخلی پنل:
//  - BASE_PATH (سندباکس): همه آدرس‌ها زیر /api/panel تا از اپ اصلی
//    پروکسی شوند و CSS/JS از gateway درست بارگذاری شود.
//  - در پروداکشن BASE_PATH خالی است و آدرس‌ها همان مسیر عادی‌اند.
// ============================================================
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function gw(path: string): string {
  return `${BASE}${path}`;
}

export function basePath(): string {
  return BASE;
}

// برای <Link> و router.push/replace و redirect — Next خودش basePath اضافه می‌کند
// پس مسیر باید خالص باشد؛ در پروداکشن هم همین است.
export function gwNav(path: string): string {
  return path;
}
