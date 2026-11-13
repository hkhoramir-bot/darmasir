"use client";

import { create } from "zustand";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toFa } from "@/lib/metro-data";
import { isInIframe, openStandaloneTab } from "@/components/metro/voice";

/* ============================================================
   کروم اپ متروجو — دقیقاً بر اساس code.html تاییدشده
   (AppBar + Drawer منو + ناوبری شناور قرصی)
   ============================================================ */

/* ------------------------- استور پوسته ------------------------- */
export type ShellCity = "tehran" | "mashhad" | "isfahan";

interface ShellState {
  drawerOpen: boolean;
  setDrawer: (v: boolean) => void;
  city: ShellCity;
  setCity: (c: ShellCity) => void;
}

export const useShell = create<ShellState>((set, get) => ({
  drawerOpen: false,
  setDrawer: (v) => set({ drawerOpen: v }),
  city: "tehran",
  setCity: (c) => {
    set({ city: c });
    try {
      localStorage.setItem("metrojo-city", c);
    } catch {}
  },
}));

/** مقداردهی اولیه شهر از حافظه (سمت کلاینت) */
export function useInitCity() {
  useEffect(() => {
    try {
      const c = localStorage.getItem("metrojo-city");
      if (c === "mashhad" || c === "isfahan" || c === "tehran") {
        if (useShell.getState().city !== c) useShell.setState({ city: c });
      }
    } catch {}
  }, []);
}

/* ------------------------- آیکون متریال ------------------------- */
export function MI({
  name,
  size = 24,
  fill = false,
  className = "",
}: {
  name: string;
  size?: number;
  fill?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${fill ? "ms-fill" : ""} ${className}`}
      style={{ fontSize: size }}
      aria-hidden
    >
      {name}
    </span>
  );
}

/* --------------- هدر اصلی (بر اساس طراحی code.html — نسخه ۷) --------------- */
const CITY_OPTIONS: { id: ShellCity | "shiraz" | "tabriz"; name: string; soon?: boolean }[] = [
  { id: "tehran", name: "تهران" },
  { id: "mashhad", name: "مشهد" },
  { id: "shiraz", name: "شیراز", soon: true },
  { id: "isfahan", name: "اصفهان" },
  { id: "tabriz", name: "تبریز", soon: true },
];

export function AppBar() {
  const city = useShell((s) => s.city);
  const setCity = useShell((s) => s.setCity);
  const setDrawer = useShell((s) => s.setDrawer);
  const [cityOpen, setCityOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const cityName = city === "tehran" ? "تهران" : city === "mashhad" ? "مشهد" : "اصفهان";

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setCityOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-outline-variant/30 flex justify-between items-center w-full h-16 px-4 transition-colors bg-surface">
      {/* راست (شروع RTL): دکمه منو + لوگو و عنوان اپ */}
      <div className="flex items-center gap-3">
        <button
          aria-label="منو"
          onClick={() => setDrawer(true)}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container active:scale-95 transition-transform text-on-surface"
        >
          <MI name="menu" size={24} />
        </button>
        <div className="flex items-center gap-2">
          <img
            src="/metrojo-symbol.png"
            alt="لوگوی متروجو"
            className="w-8 h-8 rounded-full object-contain shrink-0 shadow-sm"
          />
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-primary tracking-tight leading-tight">متروجو</h1>
            <span className="text-xs text-outline">دستیار صوتی و ناوبری</span>
          </div>
        </div>
      </div>

      {/* چپ (انتهای RTL): انتخابگر شهر */}
      <div className="flex items-center gap-2 relative min-w-0" ref={dropRef}>
        <button
          id="cityToggleBtn"
          aria-label="انتخاب شهر"
          onClick={() => setCityOpen((v) => !v)}
          className="flex items-center gap-1.5 bg-surface-container-low hover:bg-surface-container px-3 py-1 rounded-full border border-outline-variant/50 text-primary active:scale-95 transition-all text-xs font-bold"
        >
          <MI name="location_on" size={16} className="text-primary" />
          <span>{cityName}</span>
          <MI name="expand_more" size={15} className="text-outline" />
        </button>
        {cityOpen && (
          <div
            id="cityDropdown"
            className="absolute top-10 left-0 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 py-1.5 w-32 z-50 text-xs text-on-surface font-medium"
          >
            {CITY_OPTIONS.map((o) => (
              <button
                key={o.id}
                disabled={o.soon}
                onClick={() => {
                  if (o.soon) return;
                  if (o.id !== "shiraz" && o.id !== "tabriz") setCity(o.id as ShellCity);
                  setCityOpen(false);
                }}
                className={`w-full text-right px-3 py-1.5 flex items-center justify-between ${
                  o.soon ? "text-outline/60 cursor-not-allowed" : "hover:bg-surface-container"
                } ${!o.soon && o.id === city ? "text-primary font-bold" : ""}`}
              >
                <span>{o.name}</span>
                {o.soon && <span className="text-[9px] text-outline bg-surface-container px-1 rounded">به‌زودی</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

/* ------------------------- دراور منو (دقیقاً code.html) ------------------------- */
const DRAWER_LINKS: { label: string; icon: string; href: string }[] = [
  { label: "خانه", icon: "home", href: "/" },
  { label: "خطوط و نقشه", icon: "route", href: "/lines" },
  { label: "ایستگاه‌ها", icon: "directions_subway", href: "/stations" },
  { label: "وضعیت خطوط و اطلاعیه‌ها", icon: "campaign", href: "/status" },
  { label: "مسیرهای برگزیده", icon: "bookmark_add", href: "/saved" },
  { label: "نقشه تعاملی شبکه", icon: "map", href: "/map" },
  { label: "تاریخچه سفر", icon: "history", href: "/history" },
  { label: "تنظیمات", icon: "settings", href: "/settings" },
];

/** تطبیق مسیر فعال — با اسلش انتهایی و زیرصفحه‌ها هم کار می‌کند */
export function isNavActive(pathname: string | undefined, href: string): boolean {
  const p = (pathname ?? "").replace(/\/+$/, "") || "/";
  if (href === "/") return p === "/";
  return p === href || p.startsWith(`${href}/`);
}

/* وضعیت زنده میکروفن برای جعبه «دسترسی سریع صوتی» دراور */
type MicState = "checking" | "ok" | "blocked" | "denied" | "insecure";

function useMicStatus(active: boolean): MicState {
  const [state, setState] = useState<MicState>("checking");
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const check = async () => {
      const w = window as unknown as {
        SpeechRecognition?: unknown;
        webkitSpeechRecognition?: unknown;
      };
      const hasSR = !!w.SpeechRecognition || !!w.webkitSpeechRecognition;
      const hasGetUserMedia = !!navigator.mediaDevices?.getUserMedia;

      // آدرس‌های http (بدون https) — مرورگر میکروفن را کلاً می‌بندد حتی با اجازه ثبت‌شده
      if (typeof window.isSecureContext === "boolean" && !window.isSecureContext) {
        if (alive) setState("insecure");
        return;
      }
      // جستجوی صوتی مرورگر (SpeechRecognition) به getUserMedia نیاز ندارد
      // و خودش اجازه میکروفن را مستقیم می‌پرسد
      if (!hasGetUserMedia && hasSR) {
        if (alive) setState("ok");
        return;
      }
      if (!hasGetUserMedia) {
        if (alive) setState("blocked");
        return;
      }
      try {
        const st = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (alive) {
          // داخل iframe (پیش‌نمایش) «denied» یعنی سیاست مرورگر پنجره را بسته — راهکار همان تب جدید است
          setState(st.state === "denied" ? (isInIframe() ? "blocked" : "denied") : "ok");
        }
      } catch {
        // برخی مرورگرها query نمی‌پذیرند — با فرض قابل‌دسترس بودن ادامه می‌دهیم
        if (alive) setState("ok");
      }
    };
    void check();
    return () => {
      alive = false;
    };
  }, [active]);
  return state;
}

export function MenuDrawer() {
  const open = useShell((s) => s.drawerOpen);
  const setDrawer = useShell((s) => s.setDrawer);
  const router = useRouter();
  const pathname = usePathname();
  const micState = useMicStatus(open);
  const iframed = isInIframe();

  return (
    <div
      className={`fixed inset-0 z-[70] transition-all duration-300 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* پس‌زمینه — با محو شیشه‌ای پشت منو */}
      <div
        onClick={() => setDrawer(false)}
        className={`absolute inset-0 bg-black/35 backdrop-blur-md transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* پنل */}
      <aside
        className={`absolute top-0 right-0 h-full w-[min(18rem,85vw)] bg-surface-container-lowest/95 backdrop-blur-2xl shadow-2xl p-5 transform transition-transform duration-300 flex flex-col justify-between z-10 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white shadow-sm">
                <MI name="subway" size={20} />
              </div>
              <div>
                <h2 className="font-bold text-sm text-primary">متروجو هوشمند</h2>
                <span className="text-[10px] text-tertiary font-bold bg-tertiary-fixed/40 px-1.5 py-0.5 rounded">
                  نسخه {toFa("4.8.10")} آنلاین
                </span>
              </div>
            </div>
            <button
              aria-label="بستن منو"
              onClick={() => setDrawer(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container text-outline"
            >
              <MI name="close" size={20} />
            </button>
          </div>

          {/* لینک‌های ناوبری */}
          <nav className="pt-2 space-y-1">
            {DRAWER_LINKS.map((l) => {
              const active = isNavActive(pathname, l.href);
              return (
                <button
                  key={l.href}
                  onClick={() => {
                    setDrawer(false);
                    router.push(l.href);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all active:scale-[0.98] ${
                    active
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-on-surface-variant hover:bg-surface-container font-medium"
                  }`}
                >
                  <MI name={l.icon} size={20} className={active ? "text-primary" : "text-outline"} />
                  {l.label}
                  <MI name="chevron_left" size={16} className="mr-auto text-outline-variant" />
                </button>
              );
            })}
          </nav>

          <div className="pt-4 border-t border-outline-variant/30 space-y-2">
            <p className="text-[11px] font-bold text-outline">دسترسی سریع صوتی</p>
            {micState === "ok" || micState === "checking" ? (
              <div className="bg-surface-container-low p-2.5 rounded-xl text-xs text-on-surface-variant flex items-center gap-2">
                <MI name="graphic_eq" size={18} className="text-secondary" />
                <span>
                  {micState === "checking"
                    ? "بررسی دسترسی میکروفن..."
                    : "دستیار هوشمند صوتی آماده دریافت فرامین است."}
                </span>
              </div>
            ) : micState === "denied" ? (
              <div className="bg-error/10 p-2.5 rounded-xl text-xs text-error flex items-center gap-2">
                <MI name="mic_off" size={18} className="shrink-0" />
                <span>اجازه میکروفن داده نشده — از تنظیمات مرورگر یا آیکون قفل کنار آدرس، اجازه بدهید.</span>
              </div>
            ) : micState === "insecure" ? (
              <div className="bg-error/10 p-2.5 rounded-xl text-xs text-error flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <MI name="mic_off" size={18} className="shrink-0" />
                  <span>
                    میکروفن فقط روی آدرس‌های https فعال می‌شود — اگر آدرس با http شروع می‌شود، نسخه اندروید متروجو را نصب کنید یا سایت را با لینک https باز کنید.
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-error/10 p-2.5 rounded-xl text-xs text-error flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <MI name="mic_off" size={18} className="shrink-0" />
                  <span>
                    {iframed
                      ? "میکروفن در این پنجره (پیش‌نمایش) مسدود است — متروجو را در تب جدید باز کنید."
                      : "میکروفن در این مرورگر در دسترس نیست — از کروم یا نسخه اندروید استفاده کنید."}
                  </span>
                </div>
                {iframed && (
                  <button
                    type="button"
                    onClick={openStandaloneTab}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0d58a6] text-white text-[11px] font-bold active:scale-95 transition-all"
                  >
                    <MI name="open_in_new" size={14} />
                    باز کردن در تب جدید
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="text-[11px] text-outline text-center border-t border-outline-variant/30 pt-3">
          طراحی شده برای ناوبری صوتی و سریع مسافران
        </div>
      </aside>
    </div>
  );
}

/* ------------------- هدر صفحه‌های داخلی (بازگشت) ------------------- */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 border-b border-outline-variant/30 flex justify-between items-center w-full h-16 px-2 transition-colors bg-surface/85 backdrop-blur-xl backdrop-saturate-150">
      <button
        aria-label="بازگشت"
        onClick={() => router.back()}
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container active:scale-95 transition-transform text-primary"
      >
        <MI name="arrow_forward" size={24} />
      </button>
      <div className="flex flex-col items-center flex-1 min-w-0 px-1">
        <h1 className="text-base font-bold text-primary tracking-tight truncate w-full text-center leading-tight">
          {title}
        </h1>
        {subtitle && <span className="text-[11px] text-outline truncate w-full text-center">{subtitle}</span>}
      </div>
      <div className="flex items-center gap-1 min-w-10 justify-end px-1">{actions}</div>
    </header>
  );
}

/* ---------------------------------
   ناوبری پایین شناور (دقیقاً code.html)
   نکته مهم: عنصر دارای backdrop-filter نباید خودش transition/transform
   داشته باشد — در WebView اندروید این ترکیب هنگام اسکرول باعث تار شدن
   «کل صفحه» می‌شود. به همین دلیل:
   - انیمیشن نمایش/مخفی‌سازی (همراه دراور) روی wrapper انجام می‌شود
   - قرص شیشه‌ای خودش کاملاً ثابت است و فقط ناحیه پشت خودش را تار می‌کند
   --------------------------------- */
function HomeIconSvg() {
  return (
    <svg className="w-5 h-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}
function MapIconSvg() {
  return (
    <svg className="w-5 h-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
      />
    </svg>
  );
}
function TrainIconSvg() {
  return (
    <svg className="w-5 h-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="3" width="16" height="13" rx="2" />
      <path d="M4 11h16M12 3v8M8 19l-2 3M16 19l2 3M9 16h6" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/", label: "خانه", Icon: HomeIconSvg },
  { href: "/lines", label: "خطوط و نقشه", Icon: MapIconSvg },
  { href: "/stations", label: "ایستگاه‌ها", Icon: TrainIconSvg },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const drawerOpen = useShell((s) => s.drawerOpen);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none transition-[opacity,visibility] duration-300 ${
        drawerOpen ? "opacity-0 invisible" : "opacity-100 visible"
      }`}
      style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
      aria-hidden={drawerOpen}
    >
      <nav
        className="mj-nav-frost pointer-events-auto w-[90%] max-w-[360px] bg-surface-container-lowest/90 backdrop-blur-lg rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.12)] border border-outline-variant/40 p-1.5 flex items-center justify-between flex-nowrap"
        dir="rtl"
        aria-label="ناوبری اصلی"
      >
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-full transition-all active:scale-95 shrink-0 ${
                active
                  ? "bg-primary-container text-white px-5 py-2.5 font-bold text-sm shadow-sm"
                  : "text-on-surface-variant px-3 py-2 font-medium text-sm hover:bg-surface-container hover:text-on-surface"
              }`}
            >
              <Icon />
              <span className="whitespace-nowrap leading-none">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
