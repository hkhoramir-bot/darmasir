"use client";

import { MI, PageHeader } from "@/components/metro/shell";
import { toFa } from "@/lib/metro-data";

/* ============================================================
   درباره ما — معرفی متروجو و درمسیر
   ============================================================ */

const APP_VERSION = "4.8.17";

export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="درباره ما"
        subtitle="معرفی سامانه هوشمند حمل‌ونقل"
        actions={
          <img
            src="/metrojo-symbol.png"
            alt="لوگوی متروجو"
            className="w-9 h-9 rounded-full object-contain shrink-0 shadow-sm"
          />
        }
      />

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-28 space-y-4">
        {/* ------------------- معرفی ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-5 shadow-sm flex flex-col items-center text-center gap-3">
          <img
            src="/metrojo-symbol.png"
            alt="لوگوی متروجو"
            className="w-16 h-16 rounded-full object-contain shadow-sm"
          />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-on-surface">متروجو / درمسیر</h2>
            <span className="text-[10px] font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">
              نسخه {toFa(APP_VERSION)} (پایدار)
            </span>
          </div>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            متروجو سامانه هوشمند حمل‌ونقل ریلی است؛ ناوبری کامل مترو، نقشه تعاملی شبکه، وضعیت
            لحظه‌ای خطوط، مسیریابی و دستیار صوتی کامل فارسی — بدون نیاز به هیچ کلید یا سرویس
            خارجی.
          </p>
        </section>

        {/* ------------------- مشخصات ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm divide-y divide-outline-variant/30 text-xs">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-on-surface-variant">وضعیت سرویس</span>
            <span className="font-bold text-tertiary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              آنلاین
            </span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-on-surface-variant">پشتیبانی</span>
            <span className="font-bold text-on-surface">۲۴ ساعته — ۰۲۱-۹۱۰۰۰۰۰۰</span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-on-surface-variant">طراحی</span>
            <span className="font-bold text-on-surface">Material Design 3</span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-on-surface-variant">وب‌سایت</span>
            <a
              href="https://metrojo.ir"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-primary flex items-center gap-1 active:scale-95 transition-all"
            >
              metrojo.ir
              <MI name="open_in_new" size={13} />
            </a>
          </div>
        </section>

        {/* ------------------- پانوشت ------------------- */}
        <div className="text-center pt-2 pb-6 space-y-1">
          <p className="text-body-sm text-outline">طراحی شده برای ناوبری سریع مسافران کلان‌شهرها</p>
          <p className="text-label-sm text-outline-variant font-medium">
            تمامی حقوق برای سامانه متروجو محفوظ است © ۱۴۰۳
          </p>
        </div>
      </main>
    </>
  );
}
