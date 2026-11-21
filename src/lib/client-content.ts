"use client";

/* ============================================================
   دریافت محتوای پنل از سمت کلاینت — وب و اندروید (APK)
   ۱) مسیر هم‌مبدأ /api/content (وب — سرور خودمان)
   ۲) مستقیم سرور ابری Cloudflare (APK/Capacitor — /api ندارد)
   هر دو منبع «پنل مدیریت» را بازمی‌گردانند؛ پنل تنها منبع
   کنترل تبلیغ‌ها، فرهنگ تلفظ و تنظیمات است.
   ============================================================ */

export const CLOUD_CONTENT_URL =
  "https://darmasir-api.hkhoramir.workers.dev/api/v1/public/content";

export interface ClientAd {
  id: number;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  cta_text?: string | null;
  advertiser?: string | null;
  image_url?: string | null;
  link_url?: string | null;
  placement?: string;
  priority?: number;
}

export interface ClientLexiconRow {
  id?: number;
  spoken: string;
  written: string;
  priority?: number;
}

export interface ClientContent {
  ads: ClientAd[];
  lexicon: ClientLexiconRow[];
  settings: Record<string, string>;
  source: "cloud" | "panel" | "none";
}

interface RawPayload {
  ads?: ClientAd[];
  lexicon?: ClientLexiconRow[];
  settings?: Record<string, string>;
}

function normalize(raw: RawPayload | undefined | null, source: ClientContent["source"]): ClientContent {
  return {
    ads: Array.isArray(raw?.ads) ? raw!.ads : [],
    lexicon: Array.isArray(raw?.lexicon) ? raw!.lexicon : [],
    settings: raw?.settings ?? {},
    source,
  };
}

// کلید نسخه‌دار — با هر تغییر ساختار محتوا ارتقا می‌یابد تا کش قدیمی نادیده گرفته شود
const CACHE_KEY = "darmasir-content-cache-v2";
const TTL_MS = 3 * 60 * 1000;

function readCache(): ClientContent | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { at: number; data: ClientContent };
    if (!j?.data || Date.now() - j.at > 30 * 60 * 1000) return null; // کش حداکثر ۳۰ دقیقه
    return j.data;
  } catch {
    return null;
  }
}

function writeCache(data: ClientContent) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* حافظه پر است */
  }
}

/** محتوای پنل برای کلاینت — کش محلی + سرور ابری/وب، همیشه تازه */
export async function fetchPanelContent(): Promise<ClientContent | null> {
  // ۱) مسیر وب خودمان (تازه — بدون کش مرورگر)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch("/api/content", { signal: ctrl.signal, cache: "no-store" });
      if (res.ok) {
        const j = (await res.json()) as { ok?: boolean; data?: RawPayload; source?: string };
        if (j?.ok) {
          const data = normalize(j.data, (j.source as ClientContent["source"]) ?? "cloud");
          writeCache(data);
          return data;
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* ادامه با مسیر ابر */
  }

  // ۲) مستقیم سرور ابری (اندروید/APK یا وقتی سرور وب در دسترس نیست)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(CLOUD_CONTENT_URL, { signal: ctrl.signal, cache: "no-store" });
      if (res.ok) {
        const j = (await res.json()) as { ok?: boolean; data?: RawPayload };
        if (j?.ok) {
          const data = normalize(j.data, "cloud");
          writeCache(data);
          return data;
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* ادامه با کش */
  }

  return readCache();
}
