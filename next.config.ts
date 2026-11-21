import type { NextConfig } from "next";

// NEXT_EXPORT=1 → خروجی استاتیک برای ساخت APK اندروید (Capacitor)
const isExport = process.env.NEXT_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isExport ? "export" : "standalone",
  // در حالت خروجی استاتیک، از .next جدا باشد تا سرور توسعه خراب نشود
  distDir: isExport ? ".next-export" : ".next",
  trailingSlash: isExport,
  // در حالت استاتیک (APK) روت‌های API سرور وجود ندارند — پل بومی (native-api)
  // درخواست‌های /api/* را داخل WebView پاسخ می‌دهد؛ پس route.ts ها از بیلد حذف می‌شوند
  ...(isExport ? { pageExtensions: ["tsx"] } : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // در حالت استاتیک (APK) ریرایت مجاز نیست
  ...(isExport
    ? {}
    : {
        async rewrites() {
          return [
            // پنل مدیریت روی همان دامین اپ: /admin → سرور پنل (پورت 3035)
            // پنل خودش پیشوند /admin را داخلی حذف می‌کند (سازگار با دروازه)
            { source: "/admin", destination: "http://127.0.0.1:3035/admin" },
            { source: "/admin/", destination: "http://127.0.0.1:3035/admin/" },
            { source: "/admin/:path*", destination: "http://127.0.0.1:3035/admin/:path*" },
          ];
        },
      }),
};

export default nextConfig;
