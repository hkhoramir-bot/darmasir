"use client";

import { MI, PageHeader } from "@/components/metro/shell";
import { useAboutPage } from "@/components/metro/panel-banners";

/* ============================================================
   درباره ما — همه متن‌ها و ردیف‌ها از پنل مدیریت (تک منبع حقیقت)
   — لوگو در هدر نیست؛ بخش «طراح» و «پشتیبانی» حذف شده
   — هر تغییر در پنل تا حداکثر ۱۵ ثانیه (یا با فوکوس دوباره) اینجا می‌افتد
   ============================================================ */

export default function AboutPage() {
  const about = useAboutPage();

  return (
    <>
      <PageHeader title={about.title} subtitle={about.subtitle} />

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-28 space-y-4">
        {/* ------------------- معرفی ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-5 shadow-sm flex flex-col items-center text-center gap-3">
          <img
            src="/metrojo-logo.svg"
            alt="لوگوی درمسیر"
            className="w-16 h-16 object-contain"
          />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-on-surface">{about.appName}</h2>
            <span className="text-[10px] font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">
              {about.versionBadge}
            </span>
          </div>
          <p className="text-body-md text-on-surface-variant leading-relaxed">{about.description}</p>
        </section>

        {/* ------------------- مشخصات (ردیف‌های مدیریت‌شده در پنل) ------------------- */}
        {about.rows.some((r) => r.enabled) && (
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm divide-y divide-outline-variant/30 text-xs">
            {about.rows
              .filter((r) => r.enabled)
              .map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5">
                  <span className="text-on-surface-variant">{r.label}</span>
                  {r.link ? (
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-primary flex items-center gap-1 active:scale-95 transition-all"
                    >
                      {r.value}
                      <MI name="open_in_new" size={13} />
                    </a>
                  ) : (
                    <span className="font-bold text-on-surface flex items-center gap-1.5">
                      {r.live && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />}
                      {r.value}
                    </span>
                  )}
                </div>
              ))}
          </section>
        )}

        {/* ------------------- پانوشت ------------------- */}
        <div className="text-center pt-2 pb-6 space-y-1">
          <p className="text-body-sm text-on-surface-variant">{about.footerNote}</p>
          <p className="text-label-sm text-on-surface-variant font-medium">{about.footerCopy}</p>
        </div>
      </main>
    </>
  );
}
