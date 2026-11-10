"use client";

import { create } from "zustand";

/* ============================================================
   تنظیمات دستیار صوتی متروجو — ذخیره روی دستگاه (localStorage)
   engine: auto (دستگاه → ابر) | device (فقط دستگاه) | gemini (فقط ابر)
   ============================================================ */

export type VoiceEngine = "auto" | "device" | "gemini";

export interface VoicePrefs {
  engine: VoiceEngine;
  geminiKey: string;
  rate: number;
}

const STORAGE_KEY = "metrojo-voice";
const DEFAULTS: VoicePrefs = { engine: "auto", geminiKey: "", rate: 1 };

interface VoiceStore extends VoicePrefs {
  hydrated: boolean;
  hydrate: () => void;
  setEngine: (engine: VoiceEngine) => void;
  setGeminiKey: (key: string) => void;
  setRate: (rate: number) => void;
}

function persist(p: VoicePrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* حافظه در دسترس نیست */
  }
}

export const useVoicePrefs = create<VoiceStore>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<VoicePrefs>;
        set({
          engine: parsed.engine === "device" || parsed.engine === "gemini" ? parsed.engine : "auto",
          geminiKey: typeof parsed.geminiKey === "string" ? parsed.geminiKey : "",
          rate: typeof parsed.rate === "number" ? Math.min(1.5, Math.max(0.6, parsed.rate)) : 1,
          hydrated: true,
        });
        return;
      }
    } catch {
      /* داده خراب است */
    }
    set({ hydrated: true });
  },
  setEngine: (engine) => {
    set({ engine });
    persist({ engine, geminiKey: get().geminiKey, rate: get().rate });
  },
  setGeminiKey: (geminiKey) => {
    set({ geminiKey });
    persist({ engine: get().engine, geminiKey, rate: get().rate });
  },
  setRate: (rate) => {
    set({ rate });
    persist({ engine: get().engine, geminiKey: get().geminiKey, rate });
  },
}));

/** خواندن تنظیمات بدون هوک (داخل توابع غیر React) */
export function getVoicePrefs(): VoicePrefs {
  const s = useVoicePrefs.getState();
  if (!s.hydrated) s.hydrate();
  const { engine, geminiKey, rate } = useVoicePrefs.getState();
  return { engine, geminiKey, rate };
}
