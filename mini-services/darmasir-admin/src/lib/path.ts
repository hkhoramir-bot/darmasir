// کمکی‌های مسیر سمت کلاینت
// gw(path)      → مسیر با basePath (برای fetch و window.location)
// gwNav(path)   → مسیر بدون basePath (برای <Link> و router — Next خودش می‌افزاید)

export const BASE_PATH = "/panel";

export function gw(path: string): string {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    // حالت ابری — API روی Worker مستقل است و basePath ندارد
    return `${process.env.NEXT_PUBLIC_API_BASE}${path}`;
  }
  return `${BASE_PATH}${path}`;
}

export function gwNav(path: string): string {
  return path;
}
