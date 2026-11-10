import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PwaRegister } from "@/components/metro/pwa";

export const metadata: Metadata = {
  title: "متروجو | دستیار صوتی و ناوبری مترو",
  description:
    "متروجو — دستیار هوشمند سفر با مترو: مسیریاب، دستیار صوتی، نقشه خطوط، زمان‌بندی قطارها و وضعیت شلوغی",
  applicationName: "متروجو",
  manifest: "/manifest.json",
  icons: {
    icon: "/metrojo-app-icon.png",
    apple: "/metrojo-app-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "متروجو",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0d58a6",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      {/* بدنه: اپ موبایل — روی گوشی تمام‌صفحه، روی دسکتاپ داخل قاب دستگاه اندروید */}
      <body className="antialiased">
        <div className="desktop-ambient min-h-dvh w-full flex items-center justify-center md:p-10">
          <div className="relative">
            {/* دکمه‌های جانبی دستگاه — فقط دسکتاپ */}
            <div aria-hidden className="hidden md:block absolute -left-[12px] top-40 w-[3px] h-11 rounded-full bg-[#0b1220]" />
            <div aria-hidden className="hidden md:block absolute -left-[12px] top-56 w-[3px] h-16 rounded-full bg-[#0b1220]" />
            <div aria-hidden className="hidden md:block absolute -right-[12px] top-48 w-[3px] h-20 rounded-full bg-[#0b1220]" />

            {/* قاب گوشی: transform اپ‌های fixed داخل را به خود گوشی محدود می‌کند */}
            <div className="phone-frame relative w-full max-w-md h-dvh md:h-[min(880px,calc(100dvh_-_5rem))] md:rounded-[2.6rem] md:border-[9px] md:border-[#0b1220] md:shadow-[0_50px_120px_-30px_rgba(10,35,80,0.55)] bg-surface overflow-hidden flex flex-col">
              {/* دوربین پانچ‌هول — فقط دسکتاپ */}
              <div
                aria-hidden
                className="hidden md:block absolute top-2 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#0b1220] ring-1 ring-white/10 z-[70] pointer-events-none"
              />
              {children}
              <Toaster />
            </div>

            {/* برچسب محیط دسکتاپ */}
            <p className="hidden md:flex absolute -bottom-9 inset-x-0 items-center justify-center gap-1.5 text-xs font-bold text-[#0d58a6]/70 select-none">
              <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
                smartphone
              </span>
              اپ موبایل متروجو — نمای دستگاه اندروید
            </p>
          </div>
        </div>
        <PwaRegister />
      </body>
    </html>
  );
}
