/* ============================================================
   اتصال اپ درمسیر به پنل مدیریت + سرور ابری (تک منبع حقیقت)
   — فقط سمت سرور (Next.js API Routes)
   — سرور ابری: Cloudflare Workers + دیتابیس رایگان D1 (CLOUD_API_BASE)
   — پنل محلی: SQLite رایگان (PANEL_API_BASE، پیش‌فرض ۳۰۳۵)
   ترتیب: سرور ابری → پنل محلی → کش آخرین نسخه سالم
   ============================================================ */

const PANEL_BASE = (process.env.PANEL_API_BASE || "http://localhost:3035").replace(/\/+$/, "");
const CLOUD_BASE = (process.env.CLOUD_API_BASE || "").replace(/\/+$/, "");
const SYNC_KEY = process.env.DARMASIR_SYNC_KEY || "darmasir-sync-1404";

export interface PanelAd {
  id: number;
  title: string;
  subtitle: string | null;
  badge: string | null;
  cta_text: string | null;
  advertiser: string | null;
  image_url: string | null;
  link_url: string | null;
  placement: string;
  priority: number;
}

export interface PanelContent {
  cities: { id: number; name: string; sort?: number; is_active?: number }[];
  lines: {
    id: number;
    city_id: number;
    mode: string;
    number: number | null;
    name: string;
    color: string;
    terminals: string | null;
    direction: string | null;
    sort: number;
  }[];
  stations: {
    id: number;
    line_id: number;
    name: string;
    lat: number | null;
    lng: number | null;
    order_index: number;
    city_id: number | null;
  }[];
  ads: PanelAd[];
  settings: Record<string, string>;
  lexicon: { spoken: string; written: string; priority: number }[];
  generated_at: string;
}

export type ContentSource = "cloud" | "panel" | "cache";

/* ---------------- کش درون‌حافظه (Local memory caching) ---------------- */

const TTL_MS = 10_000; // محتوا حداکثر ۱۰ ثانیه پس از تغییر، در اپ دیده می‌شود
let cache: { at: number; data: PanelContent | null; source: ContentSource } = { at: 0, data: null, source: "cache" };

async function fetchContentFrom(base: string): Promise<PanelContent> {
  const res = await fetch(`${base}/api/v1/public/content`, {
    signal: AbortSignal.timeout(4000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`content ${res.status}`);
  const json = (await res.json()) as { ok: boolean; data?: PanelContent };
  if (!json?.ok || !json.data) throw new Error("bad payload");
  return json.data;
}

/* محتوای زنده پنل محلی — برای کلیدهایی که در نسخه استقرار‌یافته ورکر ابری به‌صورت عمومی
   سرو نمی‌شوند یا باید بدون انتظار برای «همگام‌سازی ابر» بلافاصله در اپ دیده شوند:
   — cities: فعال/غیرفعال و افزودن شهر از پنل باید فوری در انتخابگر شهر اپ بیفتد
   — travel_modes + travel_modes_columns: کارت‌های مدهای سفر مدیریت‌شده در پنل
   — about_page + contact_page: متن‌ها و بخش‌های صفحات «درباره ما» و «تماس با ما» در پنل
   — app_version: نسخه اپ — تک منبع حقیقت در تنظیمات پنل؛ همه نمایش‌های نسخه اپ از این کلید می‌خوانند
   — app_subtitle: زیرنویس لوگو («دستیار هوشمند سفر شهری» پیش‌فرض) — ویرایش از تنظیمات پنل */
async function fetchPanelLiveExtras(): Promise<{
  cities?: PanelContent["cities"];
  travelModes?: string;
  travelModesColumns?: string;
  aboutPage?: string;
  contactPage?: string;
  appVersion?: string;
  appSubtitle?: string;
} | null> {
  try {
    const res = await fetch(`${PANEL_BASE}/api/v1/public/content`, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ok?: boolean;
      data?: { cities?: PanelContent["cities"]; settings?: Record<string, string> };
    };
    const data = json?.data;
    if (!data) return null;
    const tm = data.settings?.travel_modes;
    const tmc = data.settings?.travel_modes_columns;
    const ap = data.settings?.about_page;
    const cp = data.settings?.contact_page;
    const av = data.settings?.app_version;
    const as = data.settings?.app_subtitle;
    return {
      cities: Array.isArray(data.cities) && data.cities.length > 0 ? data.cities : undefined,
      travelModes: typeof tm === "string" && tm.startsWith("[") ? tm : undefined,
      travelModesColumns: typeof tmc === "string" && ["2", "3", "4"].includes(tmc) ? tmc : undefined,
      aboutPage: typeof ap === "string" && ap.startsWith("{") ? ap : undefined,
      contactPage: typeof cp === "string" && cp.startsWith("{") ? cp : undefined,
      appVersion: typeof av === "string" && /^\d+(\.\d+)*$/.test(av.trim()) ? av.trim() : undefined,
      appSubtitle: typeof as === "string" && as.trim() ? as.replace(/\s+/g, " ").trim().slice(0, 60) : undefined,
    };
  } catch {
    return null;
  }
}

/** واکشی محتوا — اولویت: سرور ابری → پنل محلی → کش آخرین نسخه سالم؛ هیچ‌کدام نبود: null */
export async function getPanelContent(): Promise<PanelContent | null> {
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;

  /* 1) سرور ابری (Cloudflare Workers + D1) */
  if (CLOUD_BASE) {
    try {
      const data = await fetchContentFrom(CLOUD_BASE);
      cache = { at: Date.now(), data, source: "cloud" };
    } catch {
      /* ابر در دسترس نیست — پنل محلی */
    }
  }

  /* 2) پنل محلی (اگر ابر نبود یا نداد) */
  if (!cache.data || Date.now() - cache.at >= TTL_MS) {
    try {
      const data = await fetchContentFrom(PANEL_BASE);
      cache = { at: Date.now(), data, source: "panel" };
    } catch {
      /* پنل هم قطع است — کش کهنه ولی سالم */
    }
  }

  const data = cache.data;
  if (data) {
    /* ادغام محتوای زنده پنل (شهرها + مدهای سفر + صفحات) — مستقل از فیلتر/تأخیر ورکر ابری */
    const extras = await fetchPanelLiveExtras();
    const merged: PanelContent = { ...data };
    /* کلیدهای «تک‌منبع پنل زنده»: نسخهٔ کپی‌شده در ورکر ابری ممکن است کهنه باشد
       (مدیر بعداً کارت‌هایی را غیرفعال کرده است) — همیشه حذف می‌شوند و فقط
       مقدار زندهٔ پنل اجازهٔ ورود دارد؛ اگر پنل در دسترس نبود کلید ارسال
       نمی‌شود تا کلاینت فهرست کش‌شدهٔ خودش را نگه دارد (بدون فلش کارت‌های
       غیرفعال‌شده و بدون برگشت به کپی کهنه ابری). */
    const panelOnlyKeys = [
      "travel_modes",
      "travel_modes_columns",
      "about_page",
      "contact_page",
      "app_version",
      "app_subtitle",
    ] as const;
    merged.settings = { ...merged.settings };
    for (const k of panelOnlyKeys) delete merged.settings[k];
    if (extras?.cities) merged.cities = extras.cities;
    if (extras?.travelModes) merged.settings.travel_modes = extras.travelModes;
    if (extras?.travelModesColumns) merged.settings.travel_modes_columns = extras.travelModesColumns;
    if (extras?.aboutPage) merged.settings.about_page = extras.aboutPage;
    if (extras?.contactPage) merged.settings.contact_page = extras.contactPage;
    if (extras?.appVersion) merged.settings.app_version = extras.appVersion;
    if (extras?.appSubtitle) merged.settings.app_subtitle = extras.appSubtitle;
    cache.data = merged;
    return merged;
  }
  return null;
}

/** منبع آخرین محتوای موفق — برای نمایش وضعیت در پاسخ API */
export function panelCacheInfo(): { ageMs: number | null; source: ContentSource } {
  return { ageMs: cache.data ? Date.now() - cache.at : null, source: cache.data ? cache.source : "cache" };
}

/* ---------------- همگام‌سازی کاربر واقعی اپ → ابر + پنل ---------------- */

/** ارسال کاربر واقعی هنگام ثبت‌نام/ورود — fire-and-forget، هرگز جریان ورود را نمی‌شکند */
export function syncAppUser(user: { phone?: string | null; email?: string | null; name?: string | null; trips?: number }) {
  const phone = user.phone || user.email || "";
  if (!phone) return;
  const payload = JSON.stringify({
    user: { phone, name: user.name || "کاربر درمسیر", trips: user.trips ?? 0 },
  });
  const targets = CLOUD_BASE ? [CLOUD_BASE, PANEL_BASE] : [PANEL_BASE];
  for (const base of targets) {
    fetch(`${base}/api/v1/public/users/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sync-Key": SYNC_KEY },
      body: payload,
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      /* یکی از مقصدها در دسترس نیست — ورود کاربر نباید وابسته باشد */
    });
  }
}

/* ---------------- ردگیری نمایش/کلیک بنر ---------------- */

export async function trackAdEvent(id: number, type: "impression" | "click"): Promise<boolean> {
  const base = CLOUD_BASE || PANEL_BASE;
  try {
    const res = await fetch(`${base}/api/v1/public/ads/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, type }),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
