// Next.js 16 — proxy (جایگزین middleware)
// محافظ سطح اول مسیرهای پنل بر اساس «وجود کوکی»؛
// اعتبارسنجی کامل توکن در layout صفحات و API انجام می‌شود.
//
// قاعده طلایی: صفحه ورود (/login) هرگز بر اساس «وجود کوکی» ریدایرکت
// نمی‌شود — کوکی ممکن است ماندگِ نشستِ حذف‌شده در دیتابیس باشد و این
// باعث حلقه ریدایرکت و صفحه سفید می‌شود.

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "darmasir_admin_session";

// مسیرهای عمومی (بدون basePath — پروکسی basePath را نمی‌بیند)
const PUBLIC_PATHS = new Set(["/login"]);

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // حلقه نمی‌سازد چون /login همیشه next() می‌شود
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // همه چیز به‌جز assets و API ورود
    "/((?!api/v1/auth/login|_next/static|_next/image|fonts|favicon.ico).*)",
  ],
};
