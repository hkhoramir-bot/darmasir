"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { gw, gwNav } from "@/lib/gw";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AdminInfo = { id: string; username: string; name: string; role: string };

const NAV = [
  { href: "/", label: "داشبورد مدیریتی", icon: "dashboard" },
  { href: "/users", label: "کاربران", icon: "group", badgeKey: "users" as const },
  { href: "/lines", label: "خطوط و ایستگاه‌ها", icon: "alt_route", badgeKey: "lines" as const },
  { href: "/tickets", label: "تیکت‌ها و پشتیبانی", icon: "support_agent", badgeKey: "openTickets" as const, badgeAccent: true },
  { href: "/ads", label: "تبلیغات و بنرها", icon: "campaign" },
  { href: "/voice", label: "دستیار صوتی و آواشناسی", icon: "record_voice_over" },
  { href: "/settings", label: "تنظیمات سامانه", icon: "settings" },
  { href: "/reports", label: "گزارش‌ها و تحلیل داده", icon: "monitoring" },
  { href: "/security", label: "امنیت و وقایع‌نگاری", icon: "security" },
];

const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: "مدیر ارشد",
  OPERATOR: "اپراتور",
  VIEWER: "ناظر",
};

const SECTION_TITLE: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "داشبورد جامع نظارت و پایش سامانه درمسیر", subtitle: "مرکز عملیات شبکه حمل‌ونقل مترو و اتوبوسرانی کلان‌شهرها" },
  "/users": { title: "مدیریت کاربران و مسافران", subtitle: "مشاهده، بررسی وضعیت و مدیریت حساب کاربران اپلیکیشن" },
  "/lines": { title: "مدیریت خطوط و ایستگاه‌های ناوگان شهری", subtitle: "ویرایش و انتشار داده‌های مترو، اتوبوس و BRT با ثبت تاریخچه" },
  "/tickets": { title: "مدیریت تیکت‌ها و پشتیبانی کاربران", subtitle: "رسیدگی به درخواست‌ها و پیگیری موضوعات پشتیبانی" },
  "/ads": { title: "مدیریت تبلیغات و بنرها", subtitle: "ایجاد، زمان‌بندی و گزارش کمپین‌های درون‌برنامه‌ای" },
  "/voice": { title: "دستیار صوتی و آواشناسی", subtitle: "تنظیم متن‌های ثابت، فرهنگ تلفظ و محدوده‌های مجاز سرویس صوتی" },
  "/settings": { title: "تنظیمات سامانه و نسخه‌گذاری اپلیکیشن", subtitle: "پیکربندی عمومی برنامه، پیام‌ها و مدیریت نسخه‌های انتشار" },
  "/reports": { title: "گزارش‌ها و تحلیل داده", subtitle: "آمار استفاده، عملکرد API و روند‌های مصرف سرویس" },
  "/security": { title: "امنیت، نشست‌ها و لاگ‌های ممیزی", subtitle: "مدیران، نقش‌ها، نشست‌های فعال و رویدادهای امنیتی" },
};

const FA_DIGITS = (v: number | string) =>
  String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    /* اولین تیک با تاخیر — setState همگام در افکت رندر آبشاری می‌سازد */
    const t0 = setTimeout(() => setNow(new Date()), 0);
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);
  if (!now) return "۰۰:۰۰:۰۰";
  return FA_DIGITS(
    now.toLocaleTimeString("fa-IR", { hour12: false, timeZone: "Asia/Tehran" })
  );
}

function NavItems({
  active,
  counts,
  onNavigate,
}: {
  active: string;
  counts: Partial<Record<"users" | "lines" | "openTickets", number>>;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="text-label-sm font-label-sm text-outline px-3 mb-2 font-bold">
        بخش‌های مدیریتی
      </div>
      {NAV.map((item) => {
        const isActive = active === item.href;
        const badge = item.badgeKey ? counts[item.badgeKey] : undefined;
        return (
          <Link
            key={item.href}
            href={gwNav(item.href)}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3 transition-all",
              isActive
                ? "bg-primary-container text-on-primary-container shadow-sm"
                : "text-on-surface-variant hover:bg-surface-container-low"
            )}
          >
            <span className="material-symbols-outlined" style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}>
              {item.icon}
            </span>
            <span className="flex-1 text-body-md font-body-md">{item.label}</span>
            {badge !== undefined && badge > 0 && (
              <span
                className={cn(
                  "text-label-sm font-label-sm px-2 py-0.5 rounded-full font-bold",
                  item.badgeAccent
                    ? "bg-secondary text-on-primary"
                    : "bg-surface-container text-primary"
                )}
              >
                {FA_DIGITS(badge)}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}

export default function Shell({
  admin,
  children,
}: {
  admin: AdminInfo;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const clock = useClock();
  const [counts, setCounts] = useState<Partial<Record<"users" | "lines" | "openTickets", number>>>({});
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(gw("/api/v1/stats"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && d.ok && d.counters) setCounts(d.counters);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  const section = useMemo(() => {
    const base = "/" + (pathname.split("/").filter(Boolean)[0] ?? "");
    return SECTION_TITLE[base] ?? SECTION_TITLE[base.replace(/\/$/, "")] ?? { title: "پنل مدیریت درمسیر", subtitle: "سامانه ناوبری شهری" };
  }, [pathname]);

  async function logout() {
    try {
      await fetch(gw("/api/v1/auth/logout"), { method: "POST" });
    } catch {
      // حتی با خطا کاربر به صفحه ورود برود
    }
    // حذف کوکی سمت کلاینت هم انجام می‌شود چون در برخی محیط‌ها
    // هدر Set-Cookie پاسخ (حذف کوکی) در تونل از بین می‌رود
    document.cookie = "darmasir_admin_session=; path=/; max-age=0; samesite=lax";
    window.location.href = gw("/login");
  }

  return (
    <div className="h-full min-h-screen flex overflow-hidden bg-background">
      {/* ===== سایدبار راست‌چین (دسکتاپ) ===== */}
      <aside className="hidden lg:flex fixed right-0 top-0 h-screen w-72 flex-col z-40 bg-surface-container-lowest border-l border-outline-variant shadow-sm select-none">
        <div className="px-6 py-5 border-b border-outline-variant flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-sm">
              <span className="material-symbols-outlined text-title-lg">alt_route</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-headline-md font-headline-md font-bold text-primary tracking-tight">
                  درمسیر
                </span>
                <span className="px-1.5 py-0.5 rounded text-label-sm font-label-sm bg-surface-container-high text-primary font-bold">
                  نسخه ۲.۴
                </span>
              </div>
              <p className="text-body-sm font-body-sm text-outline">
                پنل مدیریت سامانه ناوبری شهری
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1 custom-scrollbar">
          <NavItems active={pathname} counts={counts} />
        </nav>

        <div className="p-4 border-t border-outline-variant bg-surface-container-lowest space-y-2">
          <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-body-sm font-body-sm text-outline hover:text-on-surface hover:bg-surface-container transition-colors" href={gwNav("/tickets")}>
            <span className="material-symbols-outlined text-title-md">help</span>
            <span>پشتیبانی فنی</span>
          </a>
          <div className="pt-2 border-t border-outline-variant">
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-error bg-error-container/40 hover:bg-error-container text-body-md font-title-md transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-title-md">logout</span>
              <span>خروج از حساب</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ===== محتوای اصلی ===== */}
      <div className="flex-1 flex flex-col min-h-screen lg:mr-72 overflow-hidden">
        {/* هدر */}
        <header className="h-16 bg-surface-container-lowest border-b border-outline-variant px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* دکمه منو در موبایل */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  className="lg:hidden p-2 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
                  aria-label="باز کردن منو"
                >
                  <span className="material-symbols-outlined">menu</span>
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0 bg-surface-container-lowest">
                <SheetTitle className="sr-only">منوی پنل مدیریت</SheetTitle>
                <div className="px-6 py-5 border-b border-outline-variant flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary">
                    <span className="material-symbols-outlined text-title-lg">alt_route</span>
                  </div>
                  <div>
                    <span className="text-headline-md font-headline-md font-bold text-primary">درمسیر</span>
                    <p className="text-body-sm font-body-sm text-outline">پنل مدیریت</p>
                  </div>
                </div>
                <nav className="px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
                  <NavItems active={pathname} counts={counts} onNavigate={() => setMenuOpen(false)} />
                </nav>
              </SheetContent>
            </Sheet>

            <div className="min-w-0">
              <h1 className="text-title-lg font-title-lg text-primary font-bold truncate">
                {section.title}
              </h1>
              <p className="hidden sm:block text-label-sm font-label-sm text-outline truncate">
                {section.subtitle}
              </p>
            </div>
          </div>

          {/* جستجوی سریع */}
          <div className="w-72 relative hidden md:block shrink-0">
            <input
              className="w-full pl-4 pr-10 py-1.5 text-body-sm font-body-sm bg-surface-container-low border border-outline-variant rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-outline"
              placeholder="جستجوی سریع ایستگاه، کاربر، تراکنش..."
              type="text"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const q = (e.target as HTMLInputElement).value.trim();
                  if (q) window.location.href = gw(`/users?q=${encodeURIComponent(q)}`);
                }
              }}
            />
            <span className="material-symbols-outlined absolute right-3 top-2 text-outline text-title-md">search</span>
            <kbd className="absolute left-2.5 top-2 text-label-sm font-label-sm text-outline bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant font-mono">⌘K</kbd>
          </div>

          {/* ساعت و پروفایل */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden lg:flex flex-col items-end pl-3 border-l border-outline-variant">
              <div className="text-label-md font-label-md text-on-surface font-bold flex items-center gap-1" dir="ltr">
                <span className="material-symbols-outlined text-body-sm text-primary">schedule</span>
                {clock}
              </div>
              <span className="text-label-sm font-label-sm text-outline">همگام با سرور تهران</span>
            </div>

            <button className="relative p-2 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors" title="اعلانات سامانه">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-secondary rounded-full ring-2 ring-surface-container-lowest" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 p-1.5 pr-3 rounded-xl hover:bg-surface-container transition-colors">
                  <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container">
                    <span className="material-symbols-outlined">person</span>
                  </div>
                  <div className="hidden sm:block text-right">
                    <div className="text-title-md font-title-md text-on-surface">{admin.name}</div>
                    <div className="text-label-sm font-label-sm text-outline">{ROLE_LABEL[admin.role] ?? admin.role}</div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant text-title-md">expand_more</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel className="text-body-md">
                  {admin.name}
                  <div className="text-label-sm text-outline font-normal" dir="ltr">
                    @{admin.username}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={gwNav("/security")} className="cursor-pointer">
                    <span className="material-symbols-outlined text-title-md ml-0 mr-1">security</span>
                    امنیت حساب
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-error focus:text-error focus:bg-error-container/40"
                >
                  <span className="material-symbols-outlined text-title-md ml-0 mr-1">logout</span>
                  خروج از حساب
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* بدنه صفحه */}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </main>
      </div>
    </div>
  );
}
