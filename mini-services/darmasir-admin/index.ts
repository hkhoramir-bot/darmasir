/* ============================================================
   درمسیر — پنل مدیریت مستقل (darmasir-admin)
   سرویس مستقل Bun | پورت ثابت ۳۰۳۵ | بدون وابستگی خارجی
   ⚠️ این پوشه قفل‌شده است — LOCK.md را ببینید. حذف نکنید.
   ============================================================ */
import { handleApi } from "./src/api";
import { extname, join } from "node:path";

const PORT = 3035;
const PUBLIC = join(import.meta.dir, "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

Bun.serve({
  port: PORT,
  maxRequestBodySize: 1024 * 1024, // 1MB کافی برای پنل؛ جلوگیری از سوءاستفاده
  async fetch(req) {
    const url = new URL(req.url);
    // پشتیبانی از پیشوند /admin (دروازه) و مسیر مستقیم
    let pathname = url.pathname;
    if (pathname === "/admin") pathname = "/";
    else if (pathname.startsWith("/admin/")) pathname = pathname.slice("/admin".length);

    if (pathname.startsWith("/api/v1/")) {
      return handleApi(req, new URL(pathname + url.search, url.origin));
    }

    // فایل‌های استاتیک پنل
    const p = pathname === "/" ? "/index.html" : pathname;
    if (!p.includes("..")) {
      const file = Bun.file(join(PUBLIC, p));
      if (await file.exists()) {
        return new Response(file, {
          headers: {
            "Content-Type": MIME[extname(p)] ?? "application/octet-stream",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    // SPA fallback
    const index = Bun.file(join(PUBLIC, "index.html"));
    return new Response(index, {
      headers: { "Content-Type": MIME[".html"], "Cache-Control": "no-store" },
    });
  },
});

console.log(`[darmasir-admin] پنل مدیریت درمسیر آماده است — http://localhost:${PORT}`);
