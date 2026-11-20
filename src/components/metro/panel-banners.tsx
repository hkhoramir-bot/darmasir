"use client";

/* ============================================================
   بنرها و اطلاع‌های زنده از پنل مدیریت درمسیر
   — محتوا از دیتابیس پنل (تک منبع حقیقت) به‌صورت زنده می‌آید
   — بنر نمونه ندارد؛ فقط بنرهای واقعی فعال‌شده توسط مدیر
   — کلید اصلی ads_enabled در پنل: خاموش = هیچ جایگاه آگهی‌ای رندر نمی‌شود
   — در نبود بنر یا قطعی پنل، هیچ چیزی رندر نمی‌شود (طراحی سالم می‌ماند)
   ============================================================ */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MI } from "@/components/metro/shell";
import { toFa } from "@/lib/metro-data";

interface PanelAd {
  id: number;
  title: string;
  subtitle: string | null;
  badge: string | null;
  cta_text: string | null;
  advertiser: string | null;
  image_url: string | null;
  link_url: string | null;
  placement: string;
}

interface PanelContentShape {
  ads: PanelAd[];
  settings: Record<string, string>;
  cities?: { id: number; name: string; sort?: number; is_active?: number }[];
}

/* ---------------- واکشی مشترک محتوای پنل (کش درون‌ماژول — حداکثر یک درخواست در ۱۰ ثانیه) ---------------- */

type ContentState = {
  at: number;
  promise: Promise<{ ads: PanelAd[]; settings: Record<string, string>; cities: { id: number; name: string; is_active?: number }[] } | null> | null;
  data: { ads: PanelAd[]; settings: Record<string, string>; cities: { id: number; name: string; is_active?: number }[] } | null;
};

const shared: ContentState = { at: 0, promise: null, data: null };

function fetchPanelContent(fresh = false): Promise<{ ads: PanelAd[]; settings: Record<string, string>; cities: { id: number; name: string; is_active?: number }[] } | null> {
  /* fresh: دور زدن کش — برای polling دوره‌ای (تغییرات پنل بدون رفرش صفحه در اپ بیفتد) */
  if (!fresh && shared.data && Date.now() - shared.at < 10_000) return Promise.resolve(shared.data);
  if (!fresh && shared.promise) return shared.promise;
  shared.promise = (async () => {
    try {
      const res = await fetch("/api/content", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok || !json?.connected || !json?.content) return null;
      const content = json.content as PanelContentShape;
      const data = {
        ads: content.ads ?? [],
        settings: content.settings ?? {},
        cities: Array.isArray(content.cities) ? content.cities : [],
      };
      shared.data = data;
      shared.at = Date.now();
      return data;
    } catch {
      return null;
    } finally {
      shared.promise = null;
    }
  })();
  return shared.promise;
}

const POLL_MS = 15_000;

/* همگام‌سازی کش «پیش از رنگ‌آمیزی مرورگر» (pre-paint) — مقدار کش‌شده بدون فلش اعمال می‌شود
   (روی سرور useEffect تا هشدار useLayoutEffect در SSR نگیریم؛ هر دو فقط سمت کلاینت اجرای واقعی دارند) */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** واکشی اولیه + polling دوره‌ای + واکشی مجدد هنگام بازگشت به تب/فوکوس —
    تغییرات پنل بدون رفرش اپ اعمال می‌شود */
function useLivePolling(load: () => void, enabled = true) {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    if (!enabled) return;
    loadRef.current();
    const timer = setInterval(() => loadRef.current(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") loadRef.current();
    };
    const onFocus = () => loadRef.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled]);
}

/** بنرهای فعال یک جایگاه + کلید اصلی تبلیغات — در خاموشی یا نبود بنر، خالی برمی‌گردد */
function usePanelAds(placement: string, limit = 3): { ads: PanelAd[]; enabled: boolean; rotationSec: number } {
  const [ads, setAds] = useState<PanelAd[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [rotationSec, setRotationSec] = useState(6);

  const load = useCallback(async () => {
    const content = await fetchPanelContent(true);
    if (!content) {
      setAds([]);
      return;
    }
    const masterOff = (content.settings.ads_enabled ?? "on") === "off";
    setEnabled(!masterOff);
    if (masterOff) {
      setAds([]);
      return;
    }
    const list = content.ads
      .filter((a) => (a.placement ?? "home") === placement)
      .slice(0, limit);
    setAds(list);
    const sec = Number(content.settings?.ads_rotation_seconds);
    if (Number.isFinite(sec) && sec >= 3 && sec <= 60) setRotationSec(sec);
  }, [placement, limit]);

  useLivePolling(load);

  return { ads, enabled, rotationSec };
}

/* ---------------- مدهای سفر شهری — کارت‌های «مقایسه مدهای سفر» از پنل مدیریت ---------------- */

export interface TravelModeCard {
  id: string;
  label: string;
  icon: string;
  status: "active" | "soon";
  enabled: boolean;
  link?: string;
  kind?: "real" | "extra";
}

/* آیکون‌های مجاز مدهای سفر (انتخاب در پنل) — این لیست در سورس می‌ماند تا
   scripts/build-icon-subset.py آن‌ها را در زیرمجموعه فونت آیکون بگنجاند */
export const TRAVEL_MODE_ICONS = [
  { icon: "directions_bus" },
  { icon: "directions_bus_filled" },
  { icon: "local_taxi" },
  { icon: "directions_car" },
  { icon: "two_wheeler" },
  { icon: "electric_rickshaw" },
  { icon: "subway" },
  { icon: "tram" },
  { icon: "train" },
  { icon: "directions_boat" },
  { icon: "pedal_bike" },
  { icon: "scooter" },
  { icon: "commute" },
  { icon: "alt_route" },
  { icon: "route" },
  { icon: "hourglass_empty" },
] as const;

const TRAVEL_ICON_SET = new Set(TRAVEL_MODE_ICONS.map((i) => i.icon));

/* پیش‌فرض: سه کارت (طبق دستور مدیر) — مترو و ترکیبی با داده واقعی موتور
   مسیریابی + اتوبوس «بزودی». بقیهٔ مدها (BRT/تاکسی/خودرو و…) فقط از پنل
   مدیریت اضافه می‌شوند؛ تا وقتی مدیر اضافه نکرده هرگز نمایش داده نمی‌شوند. */
export const DEFAULT_TRAVEL_MODES: TravelModeCard[] = [
  { id: "metro", label: "مترو", icon: "directions_subway", status: "active", enabled: true, link: "", kind: "real" },
  { id: "combo", label: "ترکیبی", icon: "alt_route", status: "active", enabled: true, link: "", kind: "real" },
  { id: "bus", label: "اتوبوس", icon: "directions_bus", status: "soon", enabled: true, link: "", kind: "extra" },
];

const REAL_MODE_IDS = new Set(["metro", "combo"]);

/** پاک‌سازی لیست مدهای سفر — مشترک بین کش و واکشی زنده */
function sanitizeTravelModes(arr: unknown): TravelModeCard[] | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const clean: TravelModeCard[] = arr
    .filter((m: unknown) => !!m && typeof (m as TravelModeCard).label === "string" && !!(m as TravelModeCard).label.trim())
    .map((m: TravelModeCard, i: number) => ({
      id: typeof m.id === "string" && m.id ? m.id : `mode-${i}`,
      label: m.label.trim().slice(0, 30),
      icon: typeof m.icon === "string" && TRAVEL_ICON_SET.has(m.icon) ? m.icon : "commute",
      status: m.status === "active" ? "active" : "soon",
      enabled: m.enabled !== false,
      link: typeof m.link === "string" ? m.link.trim().slice(0, 300) : "",
      kind: REAL_MODE_IDS.has(m.id) ? ("real" as const) : ("extra" as const),
    }));
  /* مترو و ترکیبی هرگز حذف نمی‌شوند — اگر در داده پنل نبودند به اول لیست برمی‌گردند */
  for (const real of [...DEFAULT_TRAVEL_MODES.filter((d) => d.kind === "real")].reverse()) {
    if (!clean.some((c) => c.id === real.id)) clean.unshift({ ...real });
  }
  return clean.length ? clean : null;
}

/* کش مدهای سفر — ماژولی + LocalStorage با «کاشی زمان» (نسخه ۲):
   کارت‌هایی که مدیر حذف/خاموش کرده هرگز فلش نمی‌زنند؛ و کش کهنه‌تر از TTL
   حتی آفلاین هم رندر نمی‌شود (پیش‌فرض امن: فقط مدهای دارای داده واقعی). */
const TRAVEL_MODES_LS = "darmasir-travel-modes-v2";
const TRAVEL_MODES_LS_LEGACY = "darmasir-travel-modes";
/* TTL کش: ۳۰ دقیقه — پس از آن کش معتبر نیست تا محتوای مخفی‌شدهٔ مدیر
   (مثلاً ۶ مد به‌جای ۳ مد) هرگز نمایش داده نشود */
const TRAVEL_MODES_TTL_MS = 30 * 60 * 1000;
let travelModesCache: TravelModeCard[] | null = null;
let travelModesCacheAt = 0;

function readCachedTravelModes(): TravelModeCard[] | null {
  if (travelModesCache && Date.now() - travelModesCacheAt < TRAVEL_MODES_TTL_MS) return travelModesCache;
  travelModesCache = null;
  if (typeof window !== "undefined") {
    try {
      /* کلید قدیمی بدون کاشی زمان — یک‌بار پاک می‌شود تا لیست کهنه (۶ مد) هرگز رندر نشود */
      window.localStorage.removeItem(TRAVEL_MODES_LS_LEGACY);
      const raw = window.localStorage.getItem(TRAVEL_MODES_LS);
      if (raw) {
        const box = JSON.parse(raw) as { at?: number; modes?: unknown };
        const at = Number(box?.at ?? 0);
        const modes = sanitizeTravelModes(box?.modes);
        if (modes && at > 0 && Date.now() - at < TRAVEL_MODES_TTL_MS) {
          travelModesCache = modes;
          travelModesCacheAt = at;
        }
      }
    } catch {
      /* JSON خراب — بی‌صدا */
    }
  }
  return travelModesCache;
}

function writeCachedTravelModes(modes: TravelModeCard[]) {
  travelModesCache = modes;
  travelModesCacheAt = Date.now();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        TRAVEL_MODES_LS,
        JSON.stringify({ at: travelModesCacheAt, modes })
      );
    } catch {
      /* دسترسی محدود — بی‌صدا */
    }
  }
}

/** کارت‌های مدیریت‌شده توسط مدیر در پنل (مدهای سفر) — در نبود پنل، پیش‌فرض برگردانده می‌شود */
export function useTravelModes(): TravelModeCard[] {
  /* مقدار اولیه: کش — در بازشدن دوباره اپ، لیست واقعی پنل از همان رندر اول هست */
  const [modes, setModes] = useState<TravelModeCard[]>(() => readCachedTravelModes() ?? DEFAULT_TRAVEL_MODES);
  const [panelLoaded, setPanelLoaded] = useState<boolean>(() => readCachedTravelModes() != null);

  /* کش پیش از اولین رنگ‌آمیزی اعمال می‌شود — بدون فلش */
  useIsoLayoutEffect(() => {
    const cached = readCachedTravelModes();
    if (cached) setModes(cached);
    setPanelLoaded(cached != null);
  }, []);

  const load = useCallback(async () => {
    const content = await fetchPanelContent(true);
    if (!content) return;
    const raw = content.settings?.travel_modes;
    if (!raw) return;
    try {
      const clean = sanitizeTravelModes(JSON.parse(raw));
      if (clean) {
        writeCachedTravelModes(clean);
        setModes(clean);
        setPanelLoaded(true);
      }
    } catch {
      /* JSON خراب — پیش‌فرض می‌ماند */
    }
  }, []);

  useLivePolling(load);

  /* تا اولین دریافت موفق از پنل، فقط کارت‌های دارای داده واقعی (مترو/ترکیبی) رندر می‌شوند —
     کارت‌هایی که مدیر غیرفعال کرده است هرگز برای لحظه‌ای نشان داده نمی‌شوند */
  if (!panelLoaded) return modes.filter((m) => m.kind === "real");
  return modes;
}

/** تعداد ستون‌های گرید مدهای سفر (تنظیم پنل: ۲/۳/۴ — پیش‌فرض ۳) — با کش بدون فلش */
const TRAVEL_COLS_LS = "darmasir-travel-cols";
let travelColsCache: number | null = null;

function readCachedTravelCols(): number {
  if (travelColsCache) return travelColsCache;
  if (typeof window !== "undefined") {
    try {
      const n = Number(window.localStorage.getItem(TRAVEL_COLS_LS));
      if (n === 2 || n === 3 || n === 4) travelColsCache = n;
    } catch {
      /* بی‌صدا */
    }
  }
  return travelColsCache ?? 3;
}

function writeCachedTravelCols(n: number) {
  travelColsCache = n;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(TRAVEL_COLS_LS, String(n));
    } catch {
      /* بی‌صدا */
    }
  }
}

export function useTravelModesColumns(): number {
  const [cols, setCols] = useState<number>(() => readCachedTravelCols());

  useIsoLayoutEffect(() => {
    setCols(readCachedTravelCols());
  }, []);

  const load = useCallback(async () => {
    const content = await fetchPanelContent(true);
    if (!content) return;
    const n = Number(content.settings?.travel_modes_columns);
    if (n === 2 || n === 3 || n === 4) {
      writeCachedTravelCols(n);
      setCols(n);
    }
  }, []);

  useLivePolling(load);

  return cols;
}

/** شهرهای پنل (همه، با پرچم فعال بودن) — برای انتخابگر شهر اپ؛ null یعنی پنل در دسترس نیست */
const CITIES_LS = "darmasir-panel-cities";
let citiesCache: { id: number; name: string; isActive: boolean }[] | null = null;

export function usePanelCities(): { id: number; name: string; isActive: boolean }[] | null {
  /* کش شهرها — ماژولی + LocalStorage: شهرهای غیرفعال‌شده از پنل فلش نمی‌زنند */
  const [cities, setCities] = useState<{ id: number; name: string; isActive: boolean }[] | null>(() => {
    if (citiesCache) return citiesCache;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(CITIES_LS);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length > 0) citiesCache = arr;
        }
      } catch {
        /* بی‌صدا */
      }
    }
    return citiesCache ?? null;
  });

  useIsoLayoutEffect(() => {
    if (citiesCache) setCities(citiesCache);
  }, []);

  const load = useCallback(async () => {
    const content = await fetchPanelContent(true);
    if (!content) return;
    const list = (content.cities ?? [])
      .filter((c) => c && typeof c.name === "string" && !!(c.name as string).trim())
      .map((c) => ({
        id: c.id,
        name: (c.name as string).trim(),
        isActive: (c as { is_active?: number }).is_active !== 0,
      }));
    if (list.length > 0) {
      citiesCache = list;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(CITIES_LS, JSON.stringify(list));
        } catch {
          /* بی‌صدا */
        }
      }
      setCities(list);
    }
  }, []);

  useLivePolling(load);

  return cities;
}

/* ---------------- نسخه اپ — تک منبع حقیقت: تنظیمات پنل (app_version) ---------------- */

/** نسخه محلی — فقط وقتی پنل در دسترس نیست یا مقدار نامعتبر است */
export const FALLBACK_APP_VERSION = "4.8.21";

/** پاک‌سازی نسخه: فقط رقم و نقطه، حداکثر ۱۲ کاراکتر */
function sanitizeVersion(raw: unknown): string {
  if (typeof raw !== "string") return FALLBACK_APP_VERSION;
  const v = raw
    .trim()
    .replace(/[^\d.]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 12);
  return v || FALLBACK_APP_VERSION;
}

/* کش نسخه — ماژولی (نمایش فوری در جابجایی بین صفحات، بدون فلش) +
   LocalStorage (بعد از رفرش کامل هم نسخه واقعی قبلی بلافاصله هست، نه مقدار پیش‌فرض) */
const VERSION_LS_KEY = "darmasir-app-version";
let versionCache: string | null = null;

function readCachedVersion(): string {
  if (versionCache) return versionCache;
  if (typeof window !== "undefined") {
    try {
      const v = window.localStorage.getItem(VERSION_LS_KEY);
      if (v) versionCache = sanitizeVersion(v);
    } catch {
      /* دسترسی محدود — بی‌صدا */
    }
  }
  return versionCache ?? FALLBACK_APP_VERSION;
}

function writeCachedVersion(v: string) {
  if (versionCache === v) return;
  versionCache = v;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(VERSION_LS_KEY, v);
    } catch {
      /* دسترسی محدود — بی‌صدا */
    }
  }
}

/** نسخه اپ از پنل مدیریت (تنظیمات ← app_version) — تغییر نسخه در پنل بلافاصله
    در همه بخش‌های اپ (ورود، منو، حساب من، تنظیمات، درباره ما) اعمال می‌شود */
export function useAppVersion(): string {
  /* مقدار اولیه: کش ماژولی — در جابجایی بین صفحات نسخه واقعی از همان رندر اول هست
     (روی سرور و بارگذاری اول کش خالی است → fallback؛ با SSR سازگار، بدون خطای هیدریشن) */
  const [version, setVersion] = useState<string>(() => versionCache ?? FALLBACK_APP_VERSION);

  /* کش (ماژولی/LocalStorage) پیش از اولین رنگ‌آمیزی اعمال می‌شود —
     کاربر هرگز نسخه پیش‌فرض یا قدیمی را برای لحظه‌ای نمی‌بیند */
  useIsoLayoutEffect(() => {
    setVersion(readCachedVersion());
  }, []);

  const load = useCallback(async () => {
    const content = await fetchPanelContent(true);
    if (!content) return;
    const v = sanitizeVersion(content.settings?.app_version);
    writeCachedVersion(v);
    setVersion(v);
  }, []);

  useLivePolling(load);

  return version;
}

/* ---------------- زیرنویس لوگو — تک منبع حقیقت: تنظیمات پنل (app_subtitle) ---------------- */

/** زیرنویس پیش‌فرض — وقتی پنل در دسترس نیست یا مقدار خالی است */
export const FALLBACK_APP_SUBTITLE = "دستیار هوشمند سفر شهری";

/** پاک‌سازی زیرنویس: یک‌خطی، حداکثر ۶۰ کاراکتر */
function sanitizeSubtitle(raw: unknown): string {
  if (typeof raw !== "string") return FALLBACK_APP_SUBTITLE;
  const v = raw.replace(/\s+/g, " ").trim().slice(0, 60);
  return v || FALLBACK_APP_SUBTITLE;
}

/* کش زیرنویس — ماژولی + LocalStorage (الگوی همان کش نسخه): نمایش فوری و بدون فلش */
const SUBTITLE_LS_KEY = "darmasir-app-subtitle";
let subtitleCache: string | null = null;

function readCachedSubtitle(): string {
  if (subtitleCache) return subtitleCache;
  if (typeof window !== "undefined") {
    try {
      const v = window.localStorage.getItem(SUBTITLE_LS_KEY);
      if (v) subtitleCache = sanitizeSubtitle(v);
    } catch {
      /* دسترسی محدود — بی‌صدا */
    }
  }
  return subtitleCache ?? FALLBACK_APP_SUBTITLE;
}

function writeCachedSubtitle(v: string) {
  if (subtitleCache === v) return;
  subtitleCache = v;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SUBTITLE_LS_KEY, v);
    } catch {
      /* دسترسی محدود — بی‌صدا */
    }
  }
}

/** زیرنویس زیر لوگو از پنل مدیریت (تنظیمات ← زیرنویس لوگو) — تغییر در پنل بلافاصله
    در همه بخش‌های اپ (هدر، صفحه ورود) اعمال می‌شود */
export function useAppSubtitle(): string {
  const [subtitle, setSubtitle] = useState<string>(() => subtitleCache ?? FALLBACK_APP_SUBTITLE);

  useIsoLayoutEffect(() => {
    setSubtitle(readCachedSubtitle());
  }, []);

  const load = useCallback(async () => {
    const content = await fetchPanelContent(true);
    if (!content) return;
    const v = sanitizeSubtitle(content.settings?.app_subtitle);
    writeCachedSubtitle(v);
    setSubtitle(v);
  }, []);

  useLivePolling(load);

  return subtitle;
}

/* ---------------- صفحه «درباره ما» — همه متن‌ها از پنل مدیریت ---------------- */

export interface AboutPageRow {
  id: string;
  label: string;
  value: string;
  link: string;
  live: boolean;
  enabled: boolean;
}

export interface AboutPageContent {
  title: string;
  subtitle: string;
  appName: string;
  versionBadge: string;
  description: string;
  rows: AboutPageRow[];
  footerNote: string;
  footerCopy: string;
}

export const DEFAULT_ABOUT_PAGE: AboutPageContent = {
  title: "درباره ما",
  subtitle: "معرفی سامانه هوشمند حمل‌ونقل",
  appName: "درمسیر / درمسیر",
  versionBadge: "نسخه ۴.۸.۲۰ (پایدار)",
  description:
    "درمسیر سامانه هوشمند حمل‌ونقل ریلی است؛ ناوبری کامل مترو، نقشه تعاملی شبکه، وضعیت لحظه‌ای خطوط، مسیریابی و دستیار صوتی کامل فارسی — بدون نیاز به هیچ کلید یا سرویس خارجی.",
  rows: [
    { id: "status", label: "وضعیت سرویس", value: "آنلاین", link: "", live: true, enabled: true },
    { id: "site", label: "وب‌سایت", value: "metrojo.ir", link: "https://metrojo.ir", live: false, enabled: true },
  ],
  footerNote: "طراحی شده برای ناوبری سریع مسافران کلان‌شهرها",
  footerCopy: "تمامی حقوق برای سامانه درمسیر محفوظ است © ۱۴۰۳",
};

/* کش صفحه «درباره ما» — ماژولی + LocalStorage؛ محتوای واقعی (از جمله برچسب نسخه)
   قبل از اولین رندر اعمال می‌شود تا هیچ متن پیش‌فرضی فلش نشود */
const ABOUT_LS_KEY = "darmasir-about-page";
let aboutCache: AboutPageContent | null = null;

function readCachedAbout(): AboutPageContent | null {
  if (aboutCache) return aboutCache;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(ABOUT_LS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === "object" && !Array.isArray(p) && typeof p.versionBadge === "string") {
          aboutCache = p as AboutPageContent;
        }
      }
    } catch {
      /* JSON خراب یا دسترسی محدود — بی‌صدا */
    }
  }
  return aboutCache;
}

function writeCachedAbout(c: AboutPageContent) {
  if (aboutCache === c) return;
  aboutCache = c;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(ABOUT_LS_KEY, JSON.stringify(c));
    } catch {
      /* دسترسی محدود — بی‌صدا */
    }
  }
}

/** محتوای صفحه «درباره ما» — همه متن‌ها و ردیف‌ها از پنل مدیریت (در نبود پنل: پیش‌فرض) */
export function useAboutPage(): AboutPageContent {
  /* مقدار اولیه: کش ماژولی — در جابجایی بین صفحات محتوای واقعی از رندر اول هست */
  const [content, setContent] = useState<AboutPageContent>(() => aboutCache ?? DEFAULT_ABOUT_PAGE);

  /* کش پیش از اولین رنگ‌آمیزی — بدون فلش متن‌های پیش‌فرض/قدیمی */
  useIsoLayoutEffect(() => {
    const cached = readCachedAbout();
    if (cached) setContent(cached);
  }, []);

  const load = useCallback(async () => {
    const c = await fetchPanelContent(true);
    if (!c) return;
    const raw = c.settings?.about_page;
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object" || Array.isArray(p)) return;
      const rowsIn = Array.isArray(p.rows) ? p.rows : DEFAULT_ABOUT_PAGE.rows;
      const rows: AboutPageRow[] = rowsIn
        .filter((r: any) => r && typeof r.label === "string" && typeof r.value === "string" && r.label.trim() && r.value.trim())
        .map((r: any, i: number) => ({
          id: typeof r.id === "string" && r.id ? r.id : `row-${i}`,
          label: r.label.trim().slice(0, 40),
          value: r.value.trim().slice(0, 60),
          link: typeof r.link === "string" ? r.link.trim().slice(0, 300) : "",
          live: r.live === true,
          enabled: r.enabled !== false,
        }));
      const next: AboutPageContent = {
        title: typeof p.title === "string" && p.title.trim() ? p.title.trim().slice(0, 40) : DEFAULT_ABOUT_PAGE.title,
        subtitle: typeof p.subtitle === "string" && p.subtitle.trim() ? p.subtitle.trim().slice(0, 60) : DEFAULT_ABOUT_PAGE.subtitle,
        appName: typeof p.app_name === "string" && p.app_name.trim() ? p.app_name.trim().slice(0, 60) : DEFAULT_ABOUT_PAGE.appName,
        versionBadge: `نسخه ${toFa(sanitizeVersion(c.settings?.app_version))} (پایدار)`,
        description: typeof p.description === "string" && p.description.trim() ? p.description.trim().slice(0, 600) : DEFAULT_ABOUT_PAGE.description,
        rows,
        footerNote: typeof p.footer_note === "string" && p.footer_note.trim() ? p.footer_note.trim().slice(0, 120) : DEFAULT_ABOUT_PAGE.footerNote,
        footerCopy: typeof p.footer_copy === "string" && p.footer_copy.trim() ? p.footer_copy.trim().slice(0, 120) : DEFAULT_ABOUT_PAGE.footerCopy,
      };
      writeCachedAbout(next);
      setContent(next);
    } catch {
      /* JSON خراب — پیش‌فرض می‌ماند */
    }
  }, []);

  useLivePolling(load);

  return content;
}

/* ---------------- صفحه «تماس با ما» — بخش‌ها از پنل مدیریت ---------------- */

export interface ContactMethod {
  id: string;
  icon: string;
  title: string;
  value: string;
  type: "tel" | "url" | "mailto" | "toast";
  link: string;
  enabled: boolean;
}

export interface ContactPageContent {
  title: string;
  subtitle: string;
  methodsTitle: string;
  methods: ContactMethod[];
  ticketEnabled: boolean;
  ticketTitle: string;
  successMessage: string;
}

/* آیکون‌های مجاز راه‌های ارتباطی (انتخاب در پنل) — این لیست در سورس می‌ماند تا
   scripts/build-icon-subset.py آن‌ها را در زیرمجموعه فونت آیکون بگنجاند */
export const CONTACT_METHOD_ICONS = [
  { icon: "support_agent" },
  { icon: "call" },
  { icon: "sms" },
  { icon: "email" },
  { icon: "alternate_email" },
  { icon: "chat" },
  { icon: "forum" },
  { icon: "send" },
  { icon: "language" },
  { icon: "campaign" },
  { icon: "apps" },
  { icon: "public" },
  { icon: "location_on" },
  { icon: "schedule" },
  { icon: "help_outline" },
] as const;

const CONTACT_ICON_SET = new Set(CONTACT_METHOD_ICONS.map((i) => i.icon));

export const DEFAULT_CONTACT_PAGE: ContactPageContent = {
  title: "تماس با ما",
  subtitle: "ارتباط با تیم پشتیبانی درمسیر",
  methodsTitle: "راه‌های ارتباطی",
  methods: [
    { id: "phone", icon: "support_agent", title: "تماس با پشتیبانی ۲۴ ساعته", value: "۰۲۱-۹۱۰۰۰۰۰۰", type: "tel", link: "02191000000", enabled: true },
    { id: "site", icon: "language", title: "وب‌سایت و ایمیل پشتیبانی", value: "info@metrojo.ir | metrojo.ir", type: "url", link: "https://metrojo.ir", enabled: true },
    { id: "ads", icon: "campaign", title: "درخواست تبلیغات در برنامه", value: "", type: "mailto", link: "info@metrojo.ir", enabled: true },
    { id: "apps", icon: "apps", title: "سایر محصولات شهری ما", value: "", type: "toast", link: "", enabled: true },
  ],
  ticketEnabled: true,
  ticketTitle: "ثبت تیکت پشتیبانی",
  successMessage: "تیکت شما با موفقیت ثبت شد — پاسخ در بخش «تیکت‌های من» همین صفحه اعلام می‌شود.",
};

/** بخش‌های صفحه «تماس با ما» — راه‌های ارتباطی و فرم تیکت از پنل مدیریت (در نبود پنل: پیش‌فرض) */
export function useContactPage(): ContactPageContent {
  const [content, setContent] = useState<ContactPageContent>(DEFAULT_CONTACT_PAGE);

  const load = useCallback(async () => {
    const c = await fetchPanelContent(true);
    if (!c) return;
    const raw = c.settings?.contact_page;
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object" || Array.isArray(p)) return;
      const methodsIn = Array.isArray(p.methods) ? p.methods : DEFAULT_CONTACT_PAGE.methods;
      const methods: ContactMethod[] = methodsIn
        .filter((m: any) => m && typeof m.title === "string" && !!m.title.trim())
        .map((m: any, i: number) => ({
          id: typeof m.id === "string" && m.id ? m.id : `method-${i}`,
          icon: typeof m.icon === "string" && CONTACT_ICON_SET.has(m.icon) ? m.icon : "support_agent",
          title: m.title.trim().slice(0, 60),
          value: typeof m.value === "string" ? m.value.trim().slice(0, 100) : "",
          type: ["tel", "url", "mailto", "toast"].includes(m.type) ? m.type : "url",
          link: typeof m.link === "string" ? m.link.trim().slice(0, 300) : "",
          enabled: m.enabled !== false,
        }));
      setContent({
        title: typeof p.title === "string" && p.title.trim() ? p.title.trim().slice(0, 40) : DEFAULT_CONTACT_PAGE.title,
        subtitle: typeof p.subtitle === "string" && p.subtitle.trim() ? p.subtitle.trim().slice(0, 60) : DEFAULT_CONTACT_PAGE.subtitle,
        methodsTitle: typeof p.methods_title === "string" && p.methods_title.trim() ? p.methods_title.trim().slice(0, 40) : DEFAULT_CONTACT_PAGE.methodsTitle,
        methods,
        ticketEnabled: p.ticket_enabled !== false,
        ticketTitle: typeof p.ticket_title === "string" && p.ticket_title.trim() ? p.ticket_title.trim().slice(0, 40) : DEFAULT_CONTACT_PAGE.ticketTitle,
        successMessage: typeof p.success_message === "string" && p.success_message.trim() ? p.success_message.trim().slice(0, 200) : DEFAULT_CONTACT_PAGE.successMessage,
      });
    } catch {
      /* JSON خراب — پیش‌فرض می‌ماند */
    }
  }, []);

  useLivePolling(load);

  return content;
}

/* ---------------- ردگیری نمایش/کلیک (یک‌بار برای هر بنر در هر نشست) ---------------- */

const tracked = new Set<number>();

function trackAd(id: number, type: "impression" | "click") {
  if (type === "impression") {
    if (tracked.has(id)) return;
    tracked.add(id);
  }
  fetch("/api/content/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, type }),
  }).catch(() => {});
}

/* ---------------- بنر چرخشی بالای خانه (placement = home) ---------------- */

export default function PanelBanners() {
  const { ads, enabled, rotationSec } = usePanelAds("home");
  const [maintenance, setMaintenance] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const content = await fetchPanelContent();
      if (!alive) return;
      setSettingsLoaded(true);
      if (!content) return;
      if (content.settings?.maintenance_mode === "on") {
        setMaintenance(content.settings.welcome_message || "سامانه در حال به‌روزرسانی است");
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  /* چرخش بنر بر اساس تنظیم واقعی پنل (ads_rotation_seconds) */
  useEffect(() => {
    if (ads.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % ads.length), rotationSec * 1000);
    return () => clearInterval(timer);
  }, [ads.length, rotationSec]);

  const track = useCallback((id: number, type: "impression" | "click") => trackAd(id, type), []);

  const current = ads[index % Math.max(ads.length, 1)];

  useEffect(() => {
    if (current) track(current.id, "impression");
  }, [current, track]);

  if (!maintenance && ads.length === 0) return null;

  return (
    <>
      {maintenance && (
        <section
          role="status"
          className="rounded-2xl px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center gap-2.5 shadow-sm"
        >
          <MI name="info" size={18} className="text-amber-600 shrink-0" />
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{maintenance}</p>
        </section>
      )}

      {enabled && current && (
        <section
          aria-label="بنر اطلاع‌رسانی"
          className="relative rounded-2xl p-4 border border-outline-variant/40 shadow-sm overflow-hidden bg-gradient-to-l from-primary/10 via-surface-container-lowest to-surface-container-low"
        >
          <button
            onClick={() => {
              track(current.id, "click");
              if (current.link_url) window.open(current.link_url, "_blank", "noopener");
            }}
            className="w-full text-right cursor-pointer group"
            aria-label={current.title}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {current.badge && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {current.badge}
                  </span>
                )}
                <h3 className="font-bold text-sm text-on-surface truncate group-hover:text-primary transition-colors">
                  {current.title}
                </h3>
              </div>
              {ads.length > 1 && (
                <span className="flex gap-1 shrink-0" aria-hidden>
                  {ads.map((a, i) => (
                    <span
                      key={a.id}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === index % ads.length ? "w-4 bg-primary" : "w-1.5 bg-outline/40"
                      }`}
                    />
                  ))}
                </span>
              )}
            </div>
            {current.subtitle && (
              <p className="text-xs text-on-surface-variant mt-1.5 leading-5 line-clamp-2">{current.subtitle}</p>
            )}
            <div className="flex items-center justify-between mt-2.5">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
                {current.cta_text || "مشاهده"}
                <MI name="chevron_left" size={15} />
              </span>
              {current.advertiser && (
                <span className="text-[10px] text-on-surface-variant">{current.advertiser}</span>
              )}
            </div>
          </button>
        </section>
      )}
    </>
  );
}

/* ---------------- جایگاه آگهی عمومی — سایر صفحات (خطوط، وضعیت، تنظیمات، ذخیره‌ها، پایین خانه) ---------------- */

export function PanelAdSlot({
  placement,
  variant = "compact",
}: {
  placement: string;
  variant?: "compact" | "card";
}) {
  const { ads, enabled } = usePanelAds(placement, 1);
  const ad = ads[0];

  useEffect(() => {
    if (ad) trackAd(ad.id, "impression");
  }, [ad]);

  if (!enabled || !ad) return null;

  const open = () => {
    trackAd(ad.id, "click");
    if (ad.link_url) window.open(ad.link_url, "_blank", "noopener");
  };

  if (variant === "card") {
    return (
      <section
        aria-label="آگهی"
        className="rounded-2xl p-4 border border-outline-variant/40 shadow-sm bg-gradient-to-l from-primary/10 via-surface-container-lowest to-surface-container-low"
      >
        <button onClick={open} className="w-full text-right cursor-pointer group" aria-label={ad.title}>
          <div className="flex items-center gap-2">
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {ad.badge || "آگهی"}
            </span>
            <h3 className="font-bold text-sm text-on-surface truncate group-hover:text-primary transition-colors">
              {ad.title}
            </h3>
          </div>
          {ad.subtitle && (
            <p className="text-xs text-on-surface-variant mt-1.5 leading-5 line-clamp-2">{ad.subtitle}</p>
          )}
          <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-primary">
            {ad.cta_text || "مشاهده"}
            <MI name="chevron_left" size={15} />
          </span>
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="آگهی"
      className="w-full bg-surface-container-low rounded-xl border border-outline-variant/40 p-2.5 flex items-center justify-between shadow-[0_1px_3px_rgba(15,23,42,0.04)]"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="bg-primary-container text-on-primary-container font-bold px-2 py-0.5 rounded-md text-[10px] shrink-0">
          آگهی
        </span>
        <p className="text-body-sm text-on-surface-variant line-clamp-1">{ad.title}</p>
      </div>
      <button
        onClick={open}
        className="text-label-sm text-primary font-bold flex items-center gap-0.5 hover:underline whitespace-nowrap pl-1 shrink-0 cursor-pointer"
        aria-label={`${ad.cta_text || "مشاهده"} — ${ad.title}`}
      >
        {ad.cta_text || "مشاهده"}
        <MI name="chevron_left" size={14} />
      </button>
    </section>
  );
}
