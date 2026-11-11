"use client";

import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

/* ============================================================
   تم متروجو — روشن / تاریک / هماهنگ با دستگاه
   کلاس dark روی <html> اعمال می‌شود و پالت CSS (globals.css)
   به‌صورت کامل سوییچ می‌کند. رنگ نوار سیستم (theme-color) هم
   همزمان با تم به‌روز می‌شود.
   ============================================================ */

function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    try {
      const color = resolvedTheme === "dark" ? "#0b101a" : "#0d58a6";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", color);
    } catch {
      /* بی‌خطر */
    }
  }, [resolvedTheme]);
  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}
