"use client";

import { create } from "zustand";

/* ============================================================
   تنظیمات دستیار صوتی متروجو — ذخیره روی دستگاه (localStorage)
   engine: auto (دستگاه → آنلاین) | device (فقط دستگاه) | cloud (فقط آنلاین)
   gender: female (صدای زن) | male (صدای مرد)
   هیچ کلید یا API لازم نیست — صدای آنلاین فارسی رایگان است.
   ============================================================ */

export type VoiceEngine = "auto" | "device" | "cloud";
export type VoiceGender = "female" | "male";

/* سرعت گفتار فقط دو حالت دارد: عادی و تند */
export type VoiceSpeed = "normal" | "fast";
export const SPEED_RATE: Record<VoiceSpeed, number> = { normal: 1, fast: 1.25 };

export interface VoicePrefs {
  engine: VoiceEngine;
  rate: number;
  gender: VoiceGender;
  /** آدرس ورکر کلودفلر اختصاصی (اختیاری) — برای صدای ابری روی گوشی */
  serverUrl?: string;
}

/** تبدیل نرخ عددی به نزدیک‌ترین حالت (عادی / تند) */
export function speedOf(rate: number): VoiceSpeed {
  return rate > 1.1 ? "fast" : "normal";
}

const STORAGE_KEY = "metrojo-voice";
const DEFAULTS: VoicePrefs = { engine: "auto", rate: 1, gender: "female", serverUrl: "" };

interface VoiceStore extends VoicePrefs {
  hydrated: boolean;
  hydrate: () => void;
  setEngine: (engine: VoiceEngine) => void;
  setSpeed: (speed: VoiceSpeed) => void;
  setGender: (gender: VoiceGender) => void;
  setServerUrl: (url: string) => void;
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
        const parsed = JSON.parse(raw) as {
          engine?: string;
          rate?: number;
          gender?: string;
          serverUrl?: string;
        };
        // مهاجرت: نسخه‌های قدیمی engine: "gemini" داشتند → آنلاین
        const engine =
          parsed.engine === "device"
            ? "device"
            : parsed.engine === "cloud" || parsed.engine === "gemini"
              ? "cloud"
              : "auto";
        // مهاجرت سرعت: نسخه‌های قدیمی اسلایدر داشتند → فقط عادی یا تند
        const rate =
          typeof parsed.rate === "number" ? SPEED_RATE[speedOf(parsed.rate)] : SPEED_RATE.normal;
        set({
          engine,
          rate,
          gender: parsed.gender === "male" ? "male" : "female",
          serverUrl: typeof parsed.serverUrl === "string" ? parsed.serverUrl : "",
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
    persist({ engine, rate: get().rate, gender: get().gender, serverUrl: get().serverUrl });
  },
  setSpeed: (speed) => {
    const rate = SPEED_RATE[speed];
    set({ rate });
    persist({ engine: get().engine, rate, gender: get().gender, serverUrl: get().serverUrl });
  },
  setGender: (gender) => {
    set({ gender });
    persist({ engine: get().engine, rate: get().rate, gender, serverUrl: get().serverUrl });
  },
  setServerUrl: (url) => {
    const serverUrl = url.trim();
    set({ serverUrl });
    persist({ engine: get().engine, rate: get().rate, gender: get().gender, serverUrl });
  },
}));

/** خواندن تنظیمات بدون هوک (داخل توابع غیر React) */
export function getVoicePrefs(): VoicePrefs {
  const s = useVoicePrefs.getState();
  if (!s.hydrated) s.hydrate();
  const { engine, rate, gender, serverUrl } = useVoicePrefs.getState();
  return { engine, rate, gender, serverUrl };
}
