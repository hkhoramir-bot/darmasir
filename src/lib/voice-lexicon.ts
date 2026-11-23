"use client";

import { CLOUD_CONTENT_BASES, CLOUD_CONTENT_TIMEOUT_MS } from "@/lib/cloud-config";

/* ============================================================
   فرهنگ تلفظ درمسیر — لینک پنل مدیریت به دستیار صوتی اپ
   مدیر در پنل برای هر واژه «نوشتار» و «تلفظ درست» ثبت می‌کند
   (مثلاً نوشتار: شوش ← تلفظ: شوُش)؛ همین نگاشت قبل از هر
   اعلام صوتی به متن اعمال می‌شود تا TTS کلمه را درست بخواند.
   منبع: /api/content (سرور ابری → پنل) + کش محلی برای آفلاین.
   در اپ اندروید: پل محلی /api/content را از سرور ابری می‌گیرد؛
   اگر پاسخ نیامد، مستقیم از سرور ابری واکشی می‌شود.
   ============================================================ */

export interface LexEntry {
  spoken: string;
  written: string;
  priority: number;
}

const LS_KEY = "darmasir-lexicon-v2"; // v2: واکشی چندمنبعی + همگام با پنل
const LS_AT = "darmasir-lexicon-at-v2";
const TTL_MS = 10 * 60 * 1000; // بروزرسانی پس‌زمینه هر ۱۰ دقیقه

let memory: LexEntry[] | null = null;
let refreshStarted = false;
let refreshPromise: Promise<LexEntry[]> | null = null;

function parseLexicon(json: unknown): LexEntry[] {
  const lex = ((json as { content?: { lexicon?: LexEntry[] } })?.content?.lexicon ?? []) as LexEntry[];
  return lex
    .filter((l) => l && typeof l.written === "string" && typeof l.spoken === "string" && l.written && l.spoken)
    .map((l) => ({ spoken: l.spoken, written: l.written, priority: Number(l.priority) || 0 }));
}

function saveCache(clean: LexEntry[]): void {
  memory = clean;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(clean));
    window.localStorage.setItem(LS_AT, String(Date.now()));
  } catch {
    /* حافظه پر است — بی‌خطر */
  }
}

function readCache(): LexEntry[] {
  if (memory) return memory;
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(LS_KEY);
    const at = Number(window.localStorage.getItem(LS_AT) || 0);
    if (!raw) return [];
    const arr = JSON.parse(raw) as LexEntry[];
    if (!Array.isArray(arr)) return [];
    memory = arr;
    // بروزرسانی پس‌زمینه اگر کش قدیمی است
    if (Date.now() - at > TTL_MS) void refreshLexicon();
    return memory;
  } catch {
    return [];
  }
}

/** واکشی فرهنگ از سرور — مسیر ۱: /api/content اپ؛ مسیر ۲: مستقیم سرور ابری (اندروید) */
export async function refreshLexicon(): Promise<LexEntry[]> {
  /* مسیر ۱ — سرور اپ (نسخه وب) یا پل محلی اندروید */
  try {
    const res = await fetch("/api/content", { cache: "no-store" });
    const json = await res.json();
    const clean = parseLexicon(json);
    if (clean.length) {
      saveCache(clean);
      return clean;
    }
  } catch {
    /* ادامه به مسیر ابری */
  }

  /* مسیر ۲ — مستقیم سرور ابری (وقتی /api/content در دسترس نیست) */
  const bases = CLOUD_CONTENT_BASES.map((b) => b.trim().replace(/\/+$/, "")).filter(Boolean);
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/v1/public/content`, {
        cache: "no-store",
        signal: AbortSignal.timeout(CLOUD_CONTENT_TIMEOUT_MS),
      });
      const json = await res.json();
      const clean = parseLexicon(json);
      if (clean.length) {
        saveCache(clean);
        return clean;
      }
    } catch {
      /* سرور بعدی */
    }
  }

  return readCache();
}

/**
 * اطمینان از آماده‌بودن فرهنگ — قبل از هر اعلام صوتی صدا زده می‌شود.
 * کش موجود → فوری (بدون تأخیر در اعلام)؛ کش خالی → منتظر واکشی از
 * پنل/ابر می‌ماند تا اولین اعلام هم با تلفظ درست پنل خوانده شود
 * (مثل شوش → شوُش).
 */
export function ensureLexiconLoaded(): Promise<LexEntry[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  if (refreshStarted) return refreshPromise ?? Promise.resolve(readCache());
  refreshStarted = true;
  const cached = readCache(); // اگر کش کهنه باشد، داخلش رفرش پس‌زمینه شروع شده
  if (cached.length) return Promise.resolve(cached);
  if (!refreshPromise) refreshPromise = refreshLexicon();
  return refreshPromise;
}

/**
 * اعمال فرهنگ تلفظ روی متن اعلام:
 * هر «نوشتار» ثبت‌شده در پنل با «تلفظ درست» جایگزین می‌شود
 * (اولواژه‌های بلندتر و اولویت بالاتر — تا تداخل نکنند)
 */
export function applyLexicon(text: string): string {
  if (!text) return text;
  const lex = readCache();
  if (!lex.length) return text;
  let out = text;
  const sorted = [...lex].sort(
    (a, b) => b.priority - a.priority || b.written.length - a.written.length
  );
  for (const e of sorted) {
    const w = e.written;
    if (w.length < 2) continue; // واژه‌های تک‌حرفی نادیده — ریسک جایگزینی اشتباه
    if (!out.includes(w)) continue;
    out = out.split(w).join(e.spoken);
  }
  return out;
}
