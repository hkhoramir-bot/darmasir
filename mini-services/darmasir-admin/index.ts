/* ============================================================
   درمسیر — پنل مدیریت مستقل (darmasir-admin)
   سرویس مستقل Bun | پورت ثابت ۳۰۳۵ | بدون وابستگی خارجی
   ⚠️ این پوشه قفل‌شده است — LOCK.md را ببینید. حذف نکنید.
   ============================================================ */
import { handleApi } from "./src/api";
import { UPLOAD_DIR } from "./src/db";
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
  maxRequestBodySize: 20 * 1024 * 1024, // سقف ۲۰ مگابایت — برای آپلود مستندات قراردادها
  async fetch(req) {
    const url = new URL(req.url);
    // پشتیبانی از پیشوند /admin (دروازه) و مسیر مستقیم
    let pathname = url.pathname;
    if (pathname === "/admin") pathname = "/";
    else if (pathname.startsWith("/admin/")) pathname = pathname.slice("/admin".length);

    if (pathname.startsWith("/api/v1/")) {
      return handleApi(req, new URL(pathname + url.search, url.origin));
    }

    // فایل‌های مستندات قراردادها (uploads)
    if (pathname.startsWith("/uploads/")) {
      const name = pathname.slice("/uploads/".length);
      if (name && !name.includes("..") && !name.includes("/")) {
        const f = Bun.file(join(UPLOAD_DIR, name));
        if (await f.exists()) {
          return new Response(f, {
            headers: {
              "Content-Type": f.type || "application/octet-stream",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }
      }
      return new Response("Not found", { status: 404 });
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
