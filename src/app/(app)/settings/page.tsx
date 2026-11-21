"use client";

import { useEffect, useState } from "react";
import { MI, PageHeader } from "@/components/metro/shell";
import { PanelAdSlot, useAppVersion } from "@/components/metro/panel-banners";
import { useToast } from "@/hooks/use-toast";
import { toFa } from "@/lib/metro-data";
import { AuthUser, useAuth } from "@/lib/auth-client";

/* ============================================================
   حساب من — پروفایل کاربر (حساب فعال پس از ورود)
   (تنظیمات به صفحه جدا /app-settings منتقل شد)
   ============================================================ */

const APK_HREF = "/metrojo-4.8.21.apk";

/* حروف اول نام برای آواتار */
function initialOf(name: string): string {
  return name.trim().charAt(0) || "؟";
}

/** تاریخ شمسی کوتاه */
function faDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fa-IR", { year: "numeric", month: "long" });
  } catch {
    return "—";
  }
}

export default function AccountPage() {
  const { toast } = useToast();
  const user = useAuth((s) => s.user) as AuthUser | null;
  const logout = useAuth((s) => s.logout);
  const appVersion = useAppVersion();

  /* ---------- نسخه اندروید (در خود اپ نیتیو مخفی می‌شود) ---------- */
  const [isNative, setIsNative] = useState(false);

  /* ---------- آمار واقعی کاربر ---------- */
  const [stats, setStats] = useState<{ favs: number; daily: number; trips: number } | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const w = window as unknown as { Capacitor?: unknown };
        setIsNative(!!w.Capacitor);
      } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  /* شمارش ذخیره‌ها / مسیرهای روزمره / تاریخچه سفر */
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = async () => {
      try {
        const [fRes, dRes, hRes] = await Promise.all([
          fetch("/api/favorites").then((r) => r.json()),
          fetch("/api/daily-routes").then((r) => r.json()),
          fetch("/api/history").then((r) => r.json()),
        ]);
        if (!alive) return;
        setStats({
          favs: Array.isArray(fRes?.ids) ? fRes.ids.length : Array.isArray(fRes?.favorites) ? fRes.favorites.length : 0,
          daily: Array.isArray(dRes?.routes) ? dRes.routes.length : 0,
          trips: Number(hRes?.stats?.count ?? 0),
        });
      } catch {
        /* آفلاین — خط تیره باقی می‌ماند */
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [user]);

  const onLogout = async () => {
    if (!window.confirm("از حساب خود خارج می‌شوید؟")) return;
    await logout();
    toast({ title: "خارج شدید", description: "برای استفاده مجدد از برنامه، وارد حساب شوید" });
  };

  /* حالت جایگزین (نباید معمولاً رخ دهد — دروازه حساب اجازه مهمان نمی‌دهد) */
  if (!user) {
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
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-5 shadow-sm flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-sm">
              <MI name="person" size={34} />
            </div>
            <h2 className="text-base font-bold text-on-surface">کاربر مهمان</h2>
            <p className="text-body-sm text-on-surface-variant">برای دسترسی به این بخش وارد حساب خود شوید</p>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="حساب من"
        subtitle="پروفایل و اطلاعات کاربری"
        actions={
          <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shrink-0 font-bold">
            {initialOf(user.name)}
          </div>
        }
      />

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-28 space-y-4">
        {/* ------------------- جایگاه آگهی — محتوای واقعی از پنل مدیریت (placement = settings) ------------------- */}
        <PanelAdSlot placement="settings" />

        {/* ------------------- کارت پروفایل کاربر واردشده ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-5 shadow-sm flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center shadow-sm text-xl font-extrabold">
            {initialOf(user.name)}
          </div>
          <div className="space-y-1 w-full">
            <h2 className="text-base font-bold text-on-surface">{user.name}</h2>
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {user.phone && (
                <span className="text-label-md text-on-surface-variant bg-surface-container-low rounded-full px-2.5 py-1 flex items-center gap-1" dir="ltr">
                  <MI name="smartphone" size={13} className="text-primary" />
                  {toFa(user.phone)}
                </span>
              )}
              {user.email && (
                <span className="text-label-md text-on-surface-variant bg-surface-container-low rounded-full px-2.5 py-1 flex items-center gap-1" dir="ltr">
                  <MI name="mail" size={13} className="text-primary" />
                  {user.email}
                </span>
              )}
            </div>
            <p className="text-label-sm text-on-surface-variant flex items-center justify-center gap-1 pt-0.5">
              <MI name="verified_user" size={13} className="text-tertiary" />
              عضو از {faDate(user.createdAt)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void onLogout()}
            className="w-full bg-error/10 hover:bg-error/15 text-error rounded-xl py-2.5 text-label-md font-bold border border-error/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
          >
            <MI name="logout" size={17} />
            خروج از حساب
          </button>
        </section>

        {/* ------------------- آمار سریع کاربر (واقعی) ------------------- */}
        <section className="grid grid-cols-3 gap-2" aria-label="آمار کاربر">
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3 text-center shadow-sm flex flex-col justify-between h-20">
            <span className="text-label-sm text-on-surface-variant">سفرهای ذخیره‌شده</span>
            <span className="text-title-md font-bold text-primary">{stats ? toFa(stats.favs) : "—"}</span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3 text-center shadow-sm flex flex-col justify-between h-20">
            <span className="text-label-sm text-on-surface-variant">مسیرهای روزمره</span>
            <span className="text-title-md font-bold text-on-surface">{stats ? toFa(stats.daily) : "—"}</span>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3 text-center shadow-sm flex flex-col justify-between h-20">
            <span className="text-label-sm text-on-surface-variant">تاریخچه سفر</span>
            <span className="text-title-md font-bold text-on-surface">{stats ? toFa(stats.trips) : "—"}</span>
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
                  <p className="text-sm font-bold text-on-surface">دریافت نسخه اندروید درمسیر</p>
                  <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 shrink-0">
                    نسخه {toFa(appVersion)}
                  </span>
                </div>
                <p className="text-body-sm text-on-surface-variant mt-0.5">نصب مستقیم بسته نصبی روی گوشی</p>
              </div>
              <a
                href={APK_HREF}
                download="metrojo-4.8.21.apk"
                className="bg-primary text-white px-3 py-2 rounded-lg text-label-md font-bold flex items-center gap-1 active:scale-95 transition-all shrink-0"
              >
                <MI name="download_for_offline" size={15} />
                نصب بسته نصبی
              </a>
            </div>
          </section>
        )}

      </main>
    </>
  );
}
