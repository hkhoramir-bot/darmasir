/* ============================================================
   واژه‌نامه صوتی اپ درمسیر — از پنل مدیریت (تک منبع حقیقت)
   دو جهت:
   ۱) تشخیص گفتار (ASR): «میلاد» → «بیمارستان میلاد»
      گفتاری (چیزهایی که کاربر می‌گوید) → نوشتاری (نام رسمی)
   ۲) خواندن صدا (TTS): «شوش» → «شوُش»
      وقتی مدیر «گفتاری» را با اعراب بنویسد (شوُش، تَجریش…)،
      همان تلفظ هنگام خواندن متن در اپ اعمال می‌شود تا نام‌های
      خاص درست خوانده شوند — همین نگاشت در پنل هم برای تست صدا استفاده می‌شود.
   کش: حافظه + localStorage با TTL — هرگز جریان صدا را نمی‌شکند.
   ============================================================ */

import { normalizeFa } from "@/lib/voice-intent";

export interface LexEntry {
  spoken: string;
  written: string;
  priority: number;
}

const CACHE_KEY = "darmasir-lexicon-v1";
const TTL_MS = 60 * 1000; // یک دقیقه — اصلاح تلفظ در پنل (مثل شوُش) حداکثر تا یک دقیقه بعد در اپ اعمال می‌شود

interface LexCache {
  at: number;
  rows: LexEntry[];
  voiceEnabled: boolean;
}

let mem: LexCache | null = null;
let pending: Promise<LexEntry[]> | null = null;

function readLocal(): LexCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LexCache>;
    if (!parsed?.rows?.length) return null;
    if (parsed.at && Date.now() - parsed.at > 24 * 3600 * 1000) return null; // بیش از یک روز — منسوخ
    return { at: parsed.at ?? 0, rows: parsed.rows, voiceEnabled: parsed.voiceEnabled !== false };
  } catch {
    return null;
  }
}

function writeLocal(cache: LexCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* حافظه پر است — مهم نیست */
  }
}

/** نسخه فعلی واژه‌نامه — بدون شبکه؛ برای استفاده همگام در هندلر صوتی */
export function cachedLexicon(): LexEntry[] {
  return mem?.rows ?? readLocal()?.rows ?? [];
}

/**
 * آیا دستیار صوتی در پنل مدیریت فعال است؟
 * پیش‌فرض فعال — اگر پنل در دسترس نباشد جریان صدا نمی‌شکند (fail-open).
 */
export function isVoiceEnabled(): boolean {
  return mem?.voiceEnabled ?? readLocal()?.voiceEnabled ?? true;
}

/** واکشی/به‌روزرسانی واژه‌نامه از پنل — fire-and-forget مناسب */
export async function loadLexicon(): Promise<LexEntry[]> {
  if (mem && Date.now() - mem.at < TTL_MS) return mem.rows;
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch("/api/content", { cache: "no-store" });
      const json = await res.json();
      const rows = (json?.content?.lexicon ?? []) as LexEntry[];
      if (Array.isArray(rows)) {
        const enabled =
          String(json?.content?.settings?.voice_enabled ?? "on").toLowerCase() !== "off";
        mem = { at: Date.now(), rows, voiceEnabled: enabled };
        writeLocal(mem);
        return rows;
      }
    } catch {
      /* پنل/کلود در دسترس نیست — کش محلی */
    }
    if (!mem) {
      const local = readLocal();
      mem = { at: Date.now(), rows: local?.rows ?? [], voiceEnabled: local?.voiceEnabled ?? true };
    }
    return mem.rows;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

/**
 * اعمال واژه‌نامه روی متن گفتار کاربر — «میلاد» → «بیمارستان میلاد»
 * ترتیب: اولویت بالاتر و عبارت طولانی‌تر زودتر اعمال می‌شود
 * تا نگاشت‌های خاص (چندکلمه‌ای) جای نگاشت‌های عمومی را نگیرند.
 */
export function applyVoiceLexicon(text: string, rows?: LexEntry[]): string {
  const list = rows ?? cachedLexicon();
  if (!text || !list?.length) return text;
  let out = normalizeFa(text);
  const sorted = [...list]
    .filter((e) => e?.spoken && e?.written)
    .sort(
      (a, b) =>
        (b.priority || 0) - (a.priority || 0) ||
        (b.spoken || "").length - (a.spoken || "").length
    );
  for (const e of sorted) {
    const spoken = normalizeFa(e.spoken);
    if (!spoken || !out.includes(spoken)) continue;
    out = out.split(spoken).join(e.written);
  }
  return out;
}

/** آیا رشته اعراب دارد؟ (کسره/فتحه/ضمه/تشدید/مد) — نشانه «مدخل تلفظ» */
function hasDiacritics(s: string): boolean {
  return /[\u064B-\u0652\u0670]/.test(s);
}

/**
 * اعمال تلفظ فرهنگ روی متنی که قرار است خوانده شود — «شوش» → «شوُش»
 * فقط مدخل‌هایی که «گفتاری» آنها با اعراب نوشته شده (تلفظ صریح) در خواندن
 * اعمال می‌شوند؛ نگاشت‌های تشخیص گفتار (مثل میلاد → بیمارستان میلاد) در صدای
 * نهایی تغییری نمی‌دهند.
 * خروجی: متن قابل خواندن + فهرست تلفظ‌های اعمال‌شده (برای نمایش/اشکال‌زدایی)
 */
export function applyTtsPronunciation(
  text: string,
  rows?: LexEntry[]
): { spoken: string; hits: { written: string; spoken: string }[] } {
  const list = rows ?? cachedLexicon();
  if (!text) return { spoken: text, hits: [] };
  const sorted = [...(list ?? [])]
    .filter((e) => e?.spoken && e?.written && hasDiacritics(e.spoken))
    .sort(
      (a, b) =>
        (b.priority || 0) - (a.priority || 0) ||
        normalizeFa(b.written || "").length - normalizeFa(a.written || "").length
    );
  if (!sorted.length) return { spoken: text, hits: [] };
  let out = normalizeFa(text);
  const hits: { written: string; spoken: string }[] = [];
  for (const e of sorted) {
    const written = normalizeFa(e.written);
    if (!written || !out.includes(written)) continue;
    out = out.split(written).join(e.spoken);
    hits.push({ written: e.written, spoken: e.spoken });
  }
  /* هیچ تلفظی اعمال نشد — متن اصلی دست‌نخورده (رفتار یکسان با پنل) */
  if (!hits.length) return { spoken: text, hits: [] };
  return { spoken: out, hits };
}

/* پیش‌بارگذاری واژه‌نامه در کلاینت — تا اولین اعلام صوتی آماده باشد */
if (typeof window !== "undefined") {
  void loadLexicon().catch(() => {});
}
