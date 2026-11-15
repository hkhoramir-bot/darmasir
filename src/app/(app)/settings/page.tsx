"use client";

import { useEffect, useState } from "react";
import { MI, PageHeader } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";
import { toFa } from "@/lib/metro-data";

/* ============================================================
   حساب من — پروفایل کاربر
   (تنظیمات به صفحه جدا /app-settings منتقل شد)
   ============================================================ */

const APP_VERSION = "4.8.17";
const APK_HREF = "/metrojo-4.8.17.apk";

export default function AccountPage() {
  const { toast } = useToast();

  /* ---------- نسخه اندروید (در خود اپ نیتیو مخفی می‌شود) ---------- */
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const w = window as unknown as { Capacitor?: unknown };
        setIsNative(!!w.Capacitor);
      } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      <PageHeader
        title="حساب من"
        subtitle="پروفایل و اطلاعات کاربری"
        actions={
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <MI name="person" size={20} />
          </div>
        }
      />

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-28 space-y-4">
        {/* ------------------- بنر آگهی ------------------- */}
        <section
          aria-label="آگهی"
          className="w-full bg-surface-container-low rounded-2xl border border-outline-variant/40 p-3 flex items-center justify-between shadow-sm relative overflow-hidden"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
              <MI name="campaign" size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-label-sm bg-outline-variant/50 text-on-surface-variant px-1.5 py-0.5 rounded shrink-0">
                  آگهی
                </span>
                <p className="text-sm font-bold text-on-surface truncate">
                  تهیه بلیت آنلاین مترو و اتوبوس
                </p>
              </div>
            </div>
          </div>
          <a
            href="#"
            className="text-body-sm font-bold bg-primary text-white px-3 py-1.5 rounded-lg active:scale-95 transition-all flex items-center gap-1 shrink-0"
          >
            <span>مشاهده</span>
            <MI name="chevron_left" size={14} />
          </a>
        </section>

        {/* ------------------- کارت پروفایل ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-5 shadow-sm flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-sm">
            <MI name="person" size={34} />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-on-surface">کاربر مهمان</h2>
            <p className="text-body-sm text-outline">
              برای ذخیره‌سازی سفرها و همگام‌سازی روی همه دستگاه‌ها وارد شوید
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              toast({
                title: "به‌زودی",
                description: "ورود و ثبت‌نام حساب کاربری به‌زودی فعال می‌شود",
              })
            }
            className="w-full bg-primary hover:bg-primary-container text-white rounded-xl py-3 text-sm font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <MI name="login" size={18} />
            ورود یا ثبت‌نام
          </button>
        </section>

        {/* ------------------- آمار سریع کاربر ------------------- */}
        <section className="grid grid-cols-3 gap-2" aria-label="آمار کاربر">
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3 text-center shadow-sm flex flex-col justify-between h-20">
            <span className="text-label-sm text-outline">سفرهای ذخیره‌شده</span>
            <span className="text-title-md font-bold text-primary">—</span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3 text-center shadow-sm flex flex-col justify-between h-20">
            <span className="text-label-sm text-outline">مسیرهای روزمره</span>
            <span className="text-title-md font-bold text-on-surface">—</span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3 text-center shadow-sm flex flex-col justify-between h-20">
            <span className="text-label-sm text-outline">تاریخچه سفر</span>
            <span className="text-title-md font-bold text-on-surface">—</span>
          </div>
        </section>

        {/* ------------------- دریافت نسخه اندروید ------------------- */}
        {!isNative && (
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <MI name="download_for_offline" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-bold text-on-surface">دریافت نسخه اندروید متروجو</p>
                  <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 shrink-0">
                    نسخه {toFa(APP_VERSION)}
                  </span>
                </div>
                <p className="text-body-sm text-outline mt-0.5">نصب مستقیم بسته نصبی روی گوشی</p>
              </div>
              <a
                href={APK_HREF}
                download="metrojo-4.8.17.apk"
                className="bg-primary text-white px-3 py-2 rounded-lg text-label-md font-bold flex items-center gap-1 active:scale-95 transition-all shrink-0"
              >
                <MI name="download_for_offline" size={15} />
                نصب بسته نصبی
              </a>
            </div>
          </section>
        )}

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
