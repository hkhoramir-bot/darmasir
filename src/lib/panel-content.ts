/* ============================================================
   منبع محتوای درمسیر — زنجیره اطمینان
   ۱) سرور ابری Cloudflare Workers (منبع اصلی و همیشه به‌روز —
      پنل مدیریت با هر تغییر، بلافاصله آن را پوش می‌کند)
   ۲) دیتابیس محلی پنل مدیریت (پشتیبان آفلاین)
   پنل مدیریت «تنها منبع حقیقت» است؛ هر تبلیغ/واژه/تنظیم
   فقط از همین مسیر به اپ می‌رسد.
   ============================================================ */

import "server-only";

import { DatabaseSync } from "node:sqlite";

export const CLOUD_API_BASE =
  process.env.CLOUD_API_BASE?.trim() || "https://darmasir-api.hkhoramir.workers.dev/api/v1";

const PANEL_DB_PATH =
  process.env.PANEL_DB?.trim() || "/home/z/my-project/mini-services/darmasir-admin/data/admin.db";

export interface CloudAd {
  id: number;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  cta_text?: string | null;
  advertiser?: string | null;
  image_url?: string | null;
  link_url?: string | null;
  placement: string;
  priority?: number;
}

export interface LexiconRow {
  id?: number;
  spoken: string;
  written: string;
  priority?: number;
}

export interface PanelContent {
  cities: Record<string, unknown>[];
  lines: Record<string, unknown>[];
  stations: Record<string, unknown>[];
  ads: CloudAd[];
  settings: Record<string, string>;
  lexicon: LexiconRow[];
  generated_at: string | null;
  last_content_sync?: string | null;
  source: "cloud" | "panel" | "none";
}

const EMPTY: PanelContent = {
  cities: [],
  lines: [],
  stations: [],
  ads: [],
  settings: {},
  lexicon: [],
  generated_at: null,
  source: "none",
};

/** خواندن مستقیم دیتابیس پنل (Node 24 — node:sqlite) به‌عنوان پشتیبان */
function readPanelDb(): PanelContent {
  try {
    const db = new DatabaseSync(PANEL_DB_PATH, { readOnly: true });
    const nowIso = new Date().toISOString();
    const all = (sql: string) => db.prepare(sql).all() as Record<string, unknown>[];
    const active = (r: Record<string, unknown>) => r == null || Number(r.is_active ?? 1) === 1;
    const inWindow = (a: Record<string, unknown>) =>
      (!a.starts_at || a.starts_at === "" || String(a.starts_at) <= nowIso) &&
      (!a.ends_at || a.ends_at === "" || String(a.ends_at) >= nowIso);
    const cities = all("SELECT * FROM cities ORDER BY sort, id").filter(active);
    const lines = all("SELECT * FROM lines ORDER BY city_id, sort, id").filter(active);
    const stations = all("SELECT * FROM stations ORDER BY line_id, order_index, id")
      .filter(active)
      .map((s) => ({ ...s, order: (s.order_index as number) ?? 0 }));
    const adsRaw = all("SELECT * FROM ads ORDER BY priority DESC, id").filter(
      (a) => active(a) && inWindow(a)
    );
    const ads: CloudAd[] = adsRaw.map(({ is_active, starts_at, ends_at, ...rest }) => rest as CloudAd);
    const lexicon = all("SELECT * FROM voice_lexicon ORDER BY priority DESC, id") as LexiconRow[];
    const settings: Record<string, string> = {};
    for (const r of all("SELECT key, value FROM settings")) {
      settings[String(r.key)] = String(r.value ?? "");
    }
    db.close();
    return { cities, lines, stations, ads, settings, lexicon, generated_at: nowIso, source: "panel" };
  } catch {
    return EMPTY;
  }
}

/** کش کوتاه درون‌پردازشی — ۳۰ ثانیه؛ تعادل بین تازگی و مصرف */
let cache: { at: number; data: PanelContent } | null = null;
const CACHE_MS = 30_000;

export async function getContent(): Promise<PanelContent> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  // ۱) سرور ابری
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${CLOUD_API_BASE}/public/content`, {
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (res.ok) {
        const j = (await res.json()) as { ok?: boolean; data?: Partial<PanelContent> };
        if (j?.ok && j.data) {
          const data: PanelContent = {
            cities: j.data.cities ?? [],
            lines: j.data.lines ?? [],
            stations: j.data.stations ?? [],
            ads: j.data.ads ?? [],
            settings: j.data.settings ?? {},
            lexicon: j.data.lexicon ?? [],
            generated_at: j.data.generated_at ?? null,
            last_content_sync: j.data.last_content_sync ?? null,
            source: "cloud",
          };
          cache = { at: Date.now(), data };
          return data;
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* شبکه نبود — پشتیبان محلی */
  }

  // ۲) پشتیبان: دیتابیس پنل
  const panel = readPanelDb();
  cache = { at: Date.now(), data: panel };
  return panel;
}
