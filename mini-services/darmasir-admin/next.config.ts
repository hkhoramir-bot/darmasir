import type { NextConfig } from "next";

/**
 * پنل مدیریت «درمسیر» — سرویس مستقل از اپلیکیشن
 * روی پورت ۳۰۳۰ و basePath «/panel» سرو می‌شود؛
 * در سندباکس از طریق Caddy gateway (مسیر /panel/*) در دسترس است.
 */
const nextConfig: NextConfig = {
  basePath: "/panel",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  poweredByHeader: false,
};

export default nextConfig;
