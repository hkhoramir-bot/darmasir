import type { NextConfig } from "next";

// NEXT_EXPORT=1 → خروجی استاتیک برای ساخت APK اندروید (Capacitor)
const isExport = process.env.NEXT_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isExport ? "export" : "standalone",
  trailingSlash: isExport,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
