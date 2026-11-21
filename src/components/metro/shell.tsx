"use client";

import { create } from "zustand";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toFa } from "@/lib/metro-data";
import { ensureLexiconLoaded } from "@/lib/voice-lexicon";
import { isInIframe, openStandaloneTab } from "@/components/metro/voice";
import { usePanelCities, useAppVersion, useAppSubtitle } from "@/components/metro/panel-banners";

/* ============================================================
   کروم اپ درمسیر — بر اساس طراحی جدید ui.zip
   (AppBar + Drawer منو + ناوبری ۵ تابه: خانه، نقشه، مسیریابی،
   ذخیره‌ها، حساب من)
   ============================================================ */

/* ------------------------- استور پوسته ------------------------- */
export type ShellCity = "tehran" | "karaj" | "mashhad" | "isfahan";

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
      if (c === "mashhad" || c === "isfahan" || c === "tehran" || c === "karaj") {
        if (useShell.getState().city !== c) useShell.setState({ city: c });
      }
    } catch {}
    // پیش‌بارگذاری فرهنگ تلفظ پنل — از اولین اعلام صوتی، تلفظ درست
    // پنل (مثل شوش → شوُش) بدون تأخیر اعمال می‌شود
    void ensureLexiconLoaded().catch(() => {});
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

/* --------------- هدر اصلی (بر اساس طراحی جدید درمسیر) --------------- */

/* نگاشت نام شهر پنل به شناسه اپ — شهرهای با داده واقعی موتور مسیریابی */
const PANEL_CITY_TO_SHELL: Record<string, ShellCity> = {
  "تهران": "tehran",
  "کرج": "karaj",
  "مشهد": "mashhad",
  "اصفهان": "isfahan",
};

const CITY_NAME_FA: Record<ShellCity, string> = {
  tehran: "تهران",
  karaj: "کرج",
  mashhad: "مشهد",
  isfahan: "اصفهان",
};

interface CityOption {
  id: ShellCity | null;
  name: string;
  soon: boolean;
}

/* پیش‌فرض در نبود پنل — همان رفتار قبلی */
const FALLBACK_CITY_OPTIONS: CityOption[] = [
  { id: "tehran", name: "تهران", soon: false },
  { id: "mashhad", name: "مشهد", soon: false },
  { id: null, name: "شیراز", soon: true },
  { id: "isfahan", name: "اصفهان", soon: false },
  { id: null, name: "تبریز", soon: true },
];

export function AppBar() {
  const city = useShell((s) => s.city);
  const setCity = useShell((s) => s.setCity);
  const setDrawer = useShell((s) => s.setDrawer);
  const [cityOpen, setCityOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /* شهرها از پنل مدیریت — شهر غیرفعال اصلاً نمایش داده نمی‌شود (نه با برچسب «بزودی»)؛
     فقط شهر فعالِ دارای داده واقعی اپ در لیست می‌آید؛
     شهر فعال ولی بدون داده اپ با برچسب «به‌زودی» می‌آید */
  const panelCities = usePanelCities();
  /* زیرنویس زیر لوگو — از تنظیمات پنل (app_subtitle)، پیش‌فرض «دستیار هوشمند سفر شهری» */
  const appSubtitle = useAppSubtitle();
  const cityOptions: CityOption[] = useMemo(() => {
    if (!panelCities || panelCities.length === 0) return FALLBACK_CITY_OPTIONS;
    const active = panelCities
      .filter((c) => c.isActive)
      .map((c) => {
        const id = PANEL_CITY_TO_SHELL[c.name] ?? null;
        return { id, name: c.name, soon: !id };
      });
    /* هیچ شهری فعال نیست — فالبک به شهرهای پیش‌فرض تا دراپ‌داون خالی نشود */
    if (active.length === 0) return FALLBACK_CITY_OPTIONS;
    return active;
  }, [panelCities]);

  const cityName = CITY_NAME_FA[city];

  /* شهر ذخیره‌شده که دیگر قابل انتخاب نیست (غیرفعال شدن از پنل) — رفتن به اولین شهر فعال */
  useEffect(() => {
    if (!panelCities || panelCities.length === 0) return;
    const currentName = CITY_NAME_FA[city];
    const stillThere = cityOptions.some((o) => o.name === currentName && !o.soon);
    if (!stillThere) {
      const first = cityOptions.find((o) => !o.soon && o.id);
      if (first?.id) setCity(first.id);
    }
  }, [panelCities, cityOptions, city, setCity]);

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
            src="/metrojo-logo.svg"
            alt="لوگوی درمسیر"
            className="w-8 h-8 object-contain shrink-0"
          />
          <div className="flex flex-col">
            <h1 className="text-base font-extrabold text-primary tracking-tight leading-tight">درمسیر</h1>
            <span className="text-[11px] text-on-surface-variant leading-tight">{appSubtitle}</span>
          </div>
        </div>
      </div>

      {/* چپ (انتهای RTL): اعلان‌ها + انتخابگر شهر */}
      <div className="flex items-center gap-2 relative min-w-0" ref={dropRef}>
        <button
          aria-label="اطلاعیه‌ها"
          onClick={() => router.push("/status")}
          className="relative w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all"
        >
          <MI name="notifications" size={22} />
          <span className="absolute top-2.5 left-2.5 w-2 h-2 bg-secondary rounded-full" aria-hidden />
        </button>
        <button
          id="cityToggleBtn"
          aria-label="انتخاب شهر"
          onClick={() => setCityOpen((v) => !v)}
          className="flex items-center gap-1.5 bg-surface-container-low hover:bg-surface-container px-3 py-1 rounded-full border border-outline-variant/50 text-primary active:scale-95 transition-all text-xs font-bold"
        >
          <MI name="location_on" size={16} className="text-primary" />
          <span>{cityName}</span>
          <MI name="expand_more" size={15} className="text-on-surface-variant" />
        </button>
        {cityOpen && (
          <div
            id="cityDropdown"
            className="absolute top-10 left-0 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 py-1.5 w-32 z-50 text-xs text-on-surface font-medium"
          >
            {cityOptions.map((o, i) => (
              <button
                key={`${o.name}-${i}`}
                disabled={o.soon}
                onClick={() => {
                  if (o.soon || !o.id) return;
                  setCity(o.id);
                  setCityOpen(false);
                }}
                className={`w-full text-right px-3 py-1.5 flex items-center justify-between ${
                  o.soon ? "text-on-surface-variant/60 cursor-not-allowed" : "hover:bg-surface-container"
                } ${!o.soon && o.id === city ? "text-primary font-bold" : ""}`}
              >
                <span>{o.name}</span>
                {o.soon && <span className="text-[9px] text-on-surface-variant bg-surface-container px-1 rounded">به‌زودی</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

/* ------------------------- دراور منو (دقیقاً code.html) ------------------------- */
const DRAWER_LINKS: { label: string; icon: string; href: string; hint?: string }[] = [
  { label: "خانه", icon: "home", href: "/" },
  { label: "نقشه تعاملی حمل‌ونقل", icon: "map", href: "/map" },
  { label: "مسیریابی چندمرحله‌ای", icon: "alt_route", href: "/plan" },
  { label: "ذخیره‌ها و مقاصد برگزیده", icon: "bookmark", href: "/saved" },
  { label: "تاریخچه سفر", icon: "history", href: "/history" },
  { label: "تنظیمات", icon: "settings", href: "/app-settings" },
  { label: "تماس با ما", icon: "support_agent", href: "/contact" },
  { label: "درباره ما", icon: "info", href: "/about" },
];

/* گروه «مترو» — سه بخش خطوط/ایستگاه‌ها/وضعیت داخل زیرمنوی بازشو */
const METRO_GROUP: {
  label: string;
  icon: string;
  children: { label: string; icon: string; href: string }[];
} = {
  label: "مترو",
  icon: "directions_subway",
  children: [
    { label: "خطوط مترو", icon: "route", href: "/lines" },
    { label: "ایستگاه‌ها", icon: "directions_subway", href: "/stations" },
    { label: "اطلاعیه‌ها", icon: "campaign", href: "/status" },
  ],
};

/** تطبیق مسیر فعال — با اسلش انتهایی و زیرصفحه‌ها هم کار می‌کند */
export function isNavActive(pathname: string | undefined, href: string): boolean {
  const p = (pathname ?? "").replace(/\/+$/, "") || "/";
  if (href === "/") return p === "/";
  // هاب «مترو» — صفحات خطوط/ایستگاه‌ها/وضعیت هم آن را فعال می‌کنند
  if (href === "/metro" && ["/lines", "/stations", "/status"].includes(p)) return true;
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
  const appVersion = useAppVersion();

  /* زیرمنوی مترو — پیش‌فرض با مسیر فعال هماهنگ است؛ لمس کاربر اولویت دارد */
  const metroActive = isNavActive(pathname, "/metro");
  const [metroToggle, setMetroToggle] = useState<boolean | null>(null);
  const metroOpen = metroToggle ?? metroActive;

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
              <img
                src="/metrojo-logo.svg"
                alt="لوگوی درمسیر هوشمند"
                className="w-9 h-9 object-contain shrink-0"
              />
              <div>
                <h2 className="font-bold text-sm text-primary">درمسیر هوشمند</h2>
                <span className="text-[10px] text-tertiary font-bold bg-tertiary-fixed/40 px-1.5 py-0.5 rounded">
                  نسخه {toFa(appVersion)} — دستیار سفر شهری
                </span>
              </div>
            </div>
            <button
              aria-label="بستن منو"
              onClick={() => setDrawer(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant"
            >
              <MI name="close" size={20} />
            </button>
          </div>

          {/* لینک‌های ناوبری */}
          <nav className="pt-2 space-y-1">
            {DRAWER_LINKS.map((l) => (
              <Fragment key={l.href}>
                {/* گروه مترو — بعد از «حساب من»، با زیرمنوی بازشو */}
                {l.href === "/history" && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setMetroToggle(!metroOpen)}
                      aria-expanded={metroOpen}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all active:scale-[0.98] ${
                        metroActive
                          ? "bg-primary/10 text-primary font-bold"
                          : "text-on-surface-variant hover:bg-surface-container font-medium"
                      }`}
                    >
                      <MI
                        name={METRO_GROUP.icon}
                        size={20}
                        className={metroActive ? "text-primary" : "text-on-surface-variant"}
                      />
                      {METRO_GROUP.label}
                      <MI
                        name="expand_more"
                        size={18}
                        className={`mr-auto text-on-surface-variant transition-transform duration-200 ${
                          metroOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {metroOpen && (
                      <div className="mt-1 mb-1.5 mr-6 pr-3 border-r-2 border-outline-variant/30 space-y-0.5">
                        {METRO_GROUP.children.map((c) => {
                          const childActive = isNavActive(pathname, c.href);
                          return (
                            <button
                              key={c.href}
                              onClick={() => {
                                setDrawer(false);
                                router.push(c.href);
                              }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-all active:scale-[0.98] ${
                                childActive
                                  ? "bg-primary/10 text-primary font-bold"
                                  : "text-on-surface-variant hover:bg-surface-container font-medium"
                              }`}
                            >
                              <MI
                                name={c.icon}
                                size={17}
                                className={childActive ? "text-primary" : "text-on-surface-variant"}
                              />
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={() => {
                    setDrawer(false);
                    router.push(l.href);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all active:scale-[0.98] ${
                    isNavActive(pathname, l.href)
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-on-surface-variant hover:bg-surface-container font-medium"
                  }`}
                >
                  <MI
                    name={l.icon}
                    size={20}
                    className={isNavActive(pathname, l.href) ? "text-primary" : "text-on-surface-variant"}
                  />
                  {l.label}
                  <MI name="chevron_left" size={16} className="mr-auto text-on-surface-variant" />
                </button>
              </Fragment>
            ))}
          </nav>

          <div className="pt-4 border-t border-outline-variant/30 space-y-2">
            <p className="text-[11px] font-bold text-on-surface-variant">دسترسی سریع صوتی</p>
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
                    میکروفن فقط روی آدرس‌های https فعال می‌شود — اگر آدرس با http شروع می‌شود، نسخه اندروید درمسیر را نصب کنید یا سایت را با لینک https باز کنید.
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-error/10 p-2.5 rounded-xl text-xs text-error flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <MI name="mic_off" size={18} className="shrink-0" />
                  <span>
                    {iframed
                      ? "میکروفن در این پنجره (پیش‌نمایش) مسدود است — درمسیر را در تب جدید باز کنید."
                      : "میکروفن در این مرورگر در دسترس نیست — از کروم یا نسخه اندروید استفاده کنید."}
                  </span>
                </div>
                {iframed && (
                  <button
                    type="button"
                    onClick={openStandaloneTab}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0fa37c] text-white text-[11px] font-bold active:scale-95 transition-all"
                  >
                    <MI name="open_in_new" size={14} />
                    باز کردن در تب جدید
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="text-[11px] text-on-surface-variant text-center border-t border-outline-variant/30 pt-3">
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
        {subtitle && <span className="text-[11px] text-on-surface-variant truncate w-full text-center">{subtitle}</span>}
      </div>
      <div className="flex items-center gap-1 min-w-10 justify-end px-1">{actions}</div>
    </header>
  );
}

/* ---------------------------------
   ناوبری پایین شناور (طراحی جدید — نوار کامل ۵ تابه)
   نکته مهم: عنصر دارای backdrop-filter نباید خودش transition/transform
   داشته باشد — در WebView اندروید این ترکیب هنگام اسکرول باعث تار شدن
   «کل صفحه» می‌شود. به همین دلیل:
   - انیمیشن نمایش/مخفی‌سازی (همراه دراور) روی wrapper انجام می‌شود
   - نوار شیشه‌ای خودش کاملاً ثابت است و فقط ناحیه پشت خودش را تار می‌کند
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

/* آیکون‌های SVG تازه برای تاب‌های جدید — سبک خطی یکدست با بقیه */
function RouteIconSvg() {
  return (
    <svg className="w-5 h-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24" aria-hidden>
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="5" r="3" />
      <path d="M12 19h4.5a3.5 3.5 0 000-7h-9a3.5 3.5 0 010-7H12" strokeLinecap="round" />
    </svg>
  );
}
function BookmarkIconSvg() {
  return (
    <svg className="w-5 h-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h12a1 1 0 011 1v16l-7-4-7 4V5a1 1 0 011-1z" />
    </svg>
  );
}
function PersonIconSvg() {
  return (
    <svg className="w-5 h-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path strokeLinecap="round" d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}

/* ناوبری ۵ تابه طبق طراحی جدید: خانه، نقشه، مسیریابی، ذخیره‌ها، حساب من */
const NAV_ITEMS = [
  { href: "/", label: "خانه", Icon: HomeIconSvg },
  { href: "/map", label: "نقشه", Icon: MapIconSvg },
  { href: "/plan", label: "مسیریابی", Icon: RouteIconSvg },
  { href: "/saved", label: "ذخیره‌ها", Icon: BookmarkIconSvg },
  { href: "/settings", label: "حساب من", Icon: PersonIconSvg },
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
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-hidden={drawerOpen}
    >
      <nav
        className="mj-nav-frost pointer-events-auto w-full max-w-md bg-surface/95 backdrop-blur-lg rounded-t-2xl shadow-[0_-4px_16px_rgba(15,23,42,0.08)] border-t border-outline-variant/30 px-2 py-1.5 flex justify-around items-center flex-nowrap"
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
              className={`flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 shrink-0 ${
                active
                  ? "bg-primary-container text-white px-3.5 py-1.5 font-bold shadow-sm"
                  : "text-on-surface-variant px-2.5 py-1.5 font-medium hover:bg-surface-container hover:text-on-surface"
              }`}
            >
              <Icon />
              <span className="text-[10px] whitespace-nowrap leading-tight mt-0.5">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
