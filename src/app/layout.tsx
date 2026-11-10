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
      {/* بدنه: بوم موبایل — روی دسکتاپ هم اپ در ستون موبایل (max-w-md) وسط چین می‌ماند */}
      <body className="antialiased">
        <div className="min-h-dvh w-full bg-metro-surface-dim/70 flex justify-center">
          <div className="relative w-full max-w-md min-h-dvh flex flex-col bg-surface shadow-[0_0_60px_rgba(13,88,166,0.14)] sm:border-x sm:border-outline-variant/40 selection:bg-primary-fixed selection:text-on-primary-fixed">
            {children}
          </div>
        </div>
        <Toaster />
        <PwaRegister />
      </body>
    </html>
  );
}
