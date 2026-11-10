"use client";

import { create } from "zustand";

/* ============================================================
   تنظیمات دستیار صوتی متروجو — ذخیره روی دستگاه (localStorage)
   engine: auto (دستگاه → آنلاین) | device (فقط دستگاه) | cloud (فقط آنلاین)
   هیچ کلید یا API لازم نیست — صدای آنلاین فارسی رایگان است.
   ============================================================ */

export type VoiceEngine = "auto" | "device" | "cloud";

export interface VoicePrefs {
  engine: VoiceEngine;
  rate: number;
}

const STORAGE_KEY = "metrojo-voice";
const DEFAULTS: VoicePrefs = { engine: "auto", rate: 1 };

interface VoiceStore extends VoicePrefs {
  hydrated: boolean;
  hydrate: () => void;
  setEngine: (engine: VoiceEngine) => void;
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
        const parsed = JSON.parse(raw) as { engine?: string; rate?: number };
        // مهاجرت: نسخه‌های قدیمی engine: "gemini" داشتند → آنلاین
        const engine =
          parsed.engine === "device"
            ? "device"
            : parsed.engine === "cloud" || parsed.engine === "gemini"
              ? "cloud"
              : "auto";
        set({
          engine,
          rate:
            typeof parsed.rate === "number"
              ? Math.min(1.5, Math.max(0.6, parsed.rate))
              : 1,
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
    persist({ engine, rate: get().rate });
  },
  setRate: (rate) => {
    set({ rate });
    persist({ engine: get().engine, rate });
  },
}));

/** خواندن تنظیمات بدون هوک (داخل توابع غیر React) */
export function getVoicePrefs(): VoicePrefs {
  const s = useVoicePrefs.getState();
  if (!s.hydrated) s.hydrate();
  const { engine, rate } = useVoicePrefs.getState();
  return { engine, rate };
}
