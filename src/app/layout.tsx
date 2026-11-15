import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PwaRegister } from "@/components/metro/pwa";
import { NativeApiBridge } from "@/components/metro/native-bridge";
import { ThemeProvider } from "@/components/metro/theme-provider";
import JourneyMonitor from "@/components/metro/journey-monitor";

export const metadata: Metadata = {
  title: "درمسیر | دستیار هوشمند سفر شهری",
  description:
    "درمسیر — دستیار هوشمند جامع حمل‌ونقل شهری: مسیریاب چندوسیله‌ای، دستیار صوتی، نقشه تعاملی لایه‌ها، ذخیره‌ها و تاریخچه سفر",
  applicationName: "درمسیر",
  manifest: "/manifest.json",
  icons: {
    icon: "/metrojo-app-icon.png",
    apple: "/metrojo-app-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "درمسیر",
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
        {/* فونت‌ها به‌صورت محلی از public/fonts بارگذاری می‌شوند — بدون نیاز به اینترنت */}
      </head>
      {/* بدنه: بوم موبایل — روی دسکتاپ هم اپ در ستون موبایل (max-w-md) وسط چین می‌ماند */}
      <body className="antialiased">
        <ThemeProvider>
          <div className="min-h-dvh w-full bg-metro-surface-dim/70 flex justify-center">
            <div className="relative w-full max-w-md min-h-dvh flex flex-col bg-surface shadow-[0_0_60px_rgba(13,88,166,0.14)] sm:border-x sm:border-outline-variant/40 selection:bg-primary-fixed selection:text-on-primary-fixed">
              {children}
            </div>
          </div>
          <Toaster />
          <PwaRegister />
          <NativeApiBridge />
          <JourneyMonitor />
        </ThemeProvider>
      </body>
    </html>
  );
}
