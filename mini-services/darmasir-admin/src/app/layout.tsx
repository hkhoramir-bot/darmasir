import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "درمسیر — پنل مدیریت",
  description: "پنل مدیریت دستیار هوشمند حمل‌ونقل شهری درمسیر",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {children}
        <Toaster
          position="bottom-center"
          dir="rtl"
          richColors
          closeButton
          toastOptions={{
            style: { fontFamily: "Vazirmatn, sans-serif" },
          }}
        />
      </body>
    </html>
  );
}
