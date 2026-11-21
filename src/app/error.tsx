"use client";

/* ============================================================
   مرز خطای سطح اپ — به‌جای صفحه سفید «Application error»،
   پیام فارسی دوستانه با امکان تلاش دوباره و بازگشت به خانه
   ============================================================ */

import { useEffect } from "react";
import { MI } from "@/components/metro/shell";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[metrojo] client error:", error);
  }, [error]);

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-surface p-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-full max-w-sm bg-surface-container-lowest rounded-3xl border border-outline-variant/40 shadow-sm p-6 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-error-container flex items-center justify-center text-error shrink-0">
          <MI name="error" size={30} />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-bold text-sm text-on-surface">مشکلی پیش آمد</h1>
          <p className="text-[11px] text-on-surface-variant leading-6">
            متأسفیم — یک خطای غیرمنتظره رخ داد. می‌توانید دوباره تلاش کنید یا به صفحه اصلی بازگردید.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full">
          <button
            type="button"
            onClick={reset}
            className="flex-1 h-10 rounded-xl bg-primary text-white text-xs font-bold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            <MI name="refresh" size={15} />
            تلاش دوباره
          </button>
          <a
            href="/"
            className="flex-1 h-10 rounded-xl border border-outline-variant text-xs font-bold text-on-surface active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            <MI name="home" size={15} />
            صفحه اصلی
          </a>
        </div>
      </div>
    </div>
  );
}
