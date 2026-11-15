"use client";

/* کارت دانلود مستقیم نسخه اندروید — داخل خود اپ اندروید مخفی می‌شود */
import { useEffect, useState } from "react";
import { toFa } from "@/lib/metro-data";

export function ApkDownloadCard() {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
      setIsNative(w.Capacitor?.isNativePlatform?.() === true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  if (isNative) return null;

  return (
    <a
      href="/metrojo-4.8.17.apk"
      download="metrojo-4.8.17.apk"
      className="flex items-center gap-3 bg-primary text-white rounded-2xl px-4 py-3 shadow-md active:scale-[0.98] transition-transform"
      aria-label="دانلود نسخه اندروید متروجو"
    >
      <span className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13m0 0l-4-4m4 4l4-4M5 21h14" />
        </svg>
      </span>
      <span className="flex flex-col items-start min-w-0">
        <span className="text-xs font-bold">دانلود نسخه اندروید</span>
        <span className="text-[10px] text-white/80">
          فایل APK — {toFa("14.5")} مگابایت • نصب مستقیم روی گوشی
        </span>
      </span>
      <svg className="w-4 h-4 mr-auto shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </a>
  );
}
