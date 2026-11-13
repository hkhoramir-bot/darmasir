"use client";

import { create } from "zustand";
import { getLine, getStation, type RoutePlan } from "@/lib/metro-data";

/* ============================================================
   سفر فعال متروجو — هسته واقعی «هشدار مقصد»
   وقتی مسیری در صفحه مسیریابی «شروع» می‌شود، همین استور
   سفر را نگه می‌دارد؛ صفحه اصلی مسیر را ایستگاه‌به‌ایستگاه
   نشان می‌دهد و پایشگر GPS با رسیدن قطار به هر ایستگاه
   (مثلاً همت) بلافاصله اعلام صوتی می‌کند.
   داده‌ها روی دستگاه (localStorage) ذخیره می‌شود تا بعد از
   بستن اپ هم سفر فعال بماند.
   ============================================================ */

export interface JourneyLegInfo {
  lineId: string;
  lineName: string;
  number: number;
  color: string;
  textOnColor: string;
  stationIds: string[]; // شامل مبدأ و مقصد قطعه
}

export interface ActiveJourney {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  legs: JourneyLegInfo[];
  path: string[]; // ترتیب ایستگاه‌ها از مبدأ تا مقصد (بدون تکرار تبادل)
  transferAt: number[]; // اندیس ایستگاه‌هایی که در آن‌ها خط عوض می‌شود
  legIndexOf: number[]; // برای هر ایستگاه مسیر: خطی که بعد از آن ایستگاه سوار هستیم
  totalMinutes: number;
  totalStations: number;
  fare: number;
  pref: string;
  startedAt: number;
  currentStationId: string | null;
  currentStationName: string | null;
  currentIndex: number; // -1 یعنی نامشخص
  source: "gps" | "manual" | "estimate" | null;
  lastGpsAt: number | null;
  gpsAccuracyM: number | null;
  alarmOn: boolean;
  alarmMinutes: number;
  voiceOn: boolean;
  alarmFired: boolean;
  /* ---------- لنگر پیش‌بینی زمانی ----------
     وقتی GPS در تونل در دسترس نیست، سفر بر اساس زمان پیش می‌رود:
     از «آخرین ایستگاه تأییدشده» (لنگر) به‌ازای MINUTES_PER_STATION
     یک ایستگاه جلو می‌رویم و به‌محض تأیید GPS اصلاح می‌شود */
  anchorIndex: number; // آخرین اندیس تأییدشده (GPS/دستی) — -1 یعنی هنوز هیچ
  anchorAt: number; // زمان تأیید لنگر (ms)
}

const STORAGE_KEY = "metrojo-active-journey";

/** میانگین دقیقه سفر بین دو ایستگاه متوالی — برای آستانه بیدارباش */
export const MINUTES_PER_STATION = 2.2;
/** توقف اولیه در مبدأ (سوار شدن و حرکت قطار) قبل از اولین پیش‌بینی */
export const BOARDING_GRACE_MS = 45_000;
/** اگر GPS این مدت خبر ندهد، پیش‌بینی زمانی جای آن را می‌گیرد */
export const GPS_STALE_MS = 120_000;

/** برآورد دقیقه باقی‌مانده تا مقصد */
export function remainingMinutesOf(j: ActiveJourney): number {
  if (j.currentIndex < 0) return j.totalMinutes;
  const remaining = Math.max(0, j.path.length - 1 - j.currentIndex);
  const share = j.path.length > 1 ? remaining / (j.path.length - 1) : 0;
  return Math.max(0, Math.round(j.totalMinutes * share));
}

/** تعداد ایستگاه باقی‌مانده تا مقصد */
export function remainingStationsOf(j: ActiveJourney): number {
  if (j.currentIndex < 0) return Math.max(0, j.totalStations);
  return Math.max(0, j.path.length - 1 - j.currentIndex);
}

export interface StartJourneyArgs {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  legs: JourneyLegInfo[];
  path: string[];
  transferAt: number[];
  legIndexOf: number[];
  totalMinutes: number;
  totalStations: number;
  fare: number;
  pref: string;
  alarmOn: boolean;
  alarmMinutes: number;
  voiceOn: boolean;
}

interface JourneyState {
  journey: ActiveJourney | null;
  hydrated: boolean;
  hydrate: () => void;
  start: (args: StartJourneyArgs) => void;
  end: () => void;
  /** تعیین دستی ایستگاه فعلی (لمس ایستگاه در کارت سفر) */
  setCurrentManual: (stationId: string) => void;
  /** تشخیص GPS ایستگاه فعلی — خروجی برای تصمیم اعلام صوتی */
  applyGpsStation: (
    stationId: string,
    accuracyM: number | null
  ) => { prevIndex: number; newIndex: number; stationName: string } | null;
  setGpsInfo: (accuracyM: number | null) => void;
  setAlarm: (on: boolean, minutes: number) => void;
  setVoice: (on: boolean) => void;
  markAlarmFired: () => void;
  /** تیک پیش‌بینی زمانی — هر چند ثانیه از پایشگر صدا زده می‌شود */
  tick: () => ActiveJourney | null;
}

function persist(j: ActiveJourney | null) {
  try {
    if (j) localStorage.setItem(STORAGE_KEY, JSON.stringify(j));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* حافظه در دسترس نیست */
  }
}

export const useJourney = create<JourneyState>((set, get) => ({
  journey: null,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const j = JSON.parse(raw) as ActiveJourney;
        if (j && Array.isArray(j.path) && j.path.length > 1) {
          // سفرهای ذخیره‌شده با نسخه‌های قبلی — لنگر پیش‌بینی ساخته می‌شود
          const cur = typeof j.currentIndex === "number" ? j.currentIndex : -1;
          const fixed: ActiveJourney = {
            ...j,
            currentIndex: cur,
            anchorIndex: typeof j.anchorIndex === "number" ? j.anchorIndex : cur,
            anchorAt: typeof j.anchorAt === "number" ? j.anchorAt : Date.now(),
          };
          set({ journey: fixed });
        }
      }
    } catch {
      /* داده خراب — نادیده گرفته می‌شود */
    }
  },

  start: (args) => {
    const j: ActiveJourney = {
      ...args,
      startedAt: Date.now(),
      currentStationId: null,
      currentStationName: null,
      currentIndex: -1,
      source: null,
      lastGpsAt: null,
      gpsAccuracyM: null,
      alarmFired: false,
      anchorIndex: -1,
      anchorAt: Date.now(),
    };
    set({ journey: j });
    persist(j);
  },

  end: () => {
    set({ journey: null });
    persist(null);
  },

  setCurrentManual: (stationId) => {
    const j = get().journey;
    if (!j) return;
    const idx = j.path.indexOf(stationId);
    if (idx < 0) return;
    const next: ActiveJourney = {
      ...j,
      currentStationId: stationId,
      currentStationName: getStation(stationId)?.name ?? null,
      currentIndex: idx,
      source: "manual",
      anchorIndex: idx,
      anchorAt: Date.now(),
    };
    set({ journey: next });
    persist(next);
  },

  applyGpsStation: (stationId, accuracyM) => {
    const j = get().journey;
    if (!j) return null;
    const idx = j.path.indexOf(stationId);
    if (idx < 0) return null;
    const prevIndex = j.currentIndex;
    const stationName = getStation(stationId)?.name ?? stationId;
    const next: ActiveJourney = {
      ...j,
      currentStationId: stationId,
      currentStationName: stationName,
      currentIndex: idx,
      source: "gps",
      lastGpsAt: Date.now(),
      gpsAccuracyM: accuracyM,
      // لنگر پیش‌بینی روی آخرین تأیید GPS می‌نشیند؛ حتی اگر قطار
      // داخل ایستگاه متوقف باشد، پیش‌بینی از جلوتر نمی‌پرد
      anchorIndex: idx,
      anchorAt: Date.now(),
    };
    set({ journey: next });
    persist(next);
    return { prevIndex, newIndex: idx, stationName };
  },

  setGpsInfo: (accuracyM) => {
    const j = get().journey;
    if (!j) return;
    const next: ActiveJourney = { ...j, lastGpsAt: Date.now(), gpsAccuracyM: accuracyM };
    set({ journey: next });
    persist(next);
  },

  setAlarm: (on, minutes) => {
    const j = get().journey;
    if (!j) return;
    const next: ActiveJourney = { ...j, alarmOn: on, alarmMinutes: minutes, alarmFired: false };
    set({ journey: next });
    persist(next);
  },

  setVoice: (on) => {
    const j = get().journey;
    if (!j) return;
    const next: ActiveJourney = { ...j, voiceOn: on };
    set({ journey: next });
    persist(next);
  },

  markAlarmFired: () => {
    const j = get().journey;
    if (!j) return;
    const next: ActiveJourney = { ...j, alarmFired: true };
    set({ journey: next });
    persist(next);
  },

  /** تیک پیش‌بینی زمانی حرکت قطار — در نبود GPS تازه:
      از آخرین لنگر (تأییدشده با GPS/دستی یا مبدأ سفر) به‌ازای هر
      MINUTES_PER_STATION دقیقه یک ایستگاه جلو می‌رود؛ هرگز از
      اندیس تأییدشده عقب‌تر نمی‌شود و از مقصد عبور نمی‌کند */
  tick: () => {
    const j = get().journey;
    if (!j) return null;
    const last = j.path.length - 1;
    if (j.currentIndex >= last) return null;

    // GPS تازه؟ جای پیش‌بینی را نمی‌گیرد — قطار زیر چشم GPS است
    const gpsFresh = j.source === "gps" && j.lastGpsAt !== null && Date.now() - j.lastGpsAt < GPS_STALE_MS;
    if (gpsFresh) return null;

    const anchorIdx = j.anchorIndex >= 0 ? j.anchorIndex : 0;
    const anchorAt = j.anchorIndex >= 0 ? j.anchorAt : j.startedAt + BOARDING_GRACE_MS;
    const perStationMs = MINUTES_PER_STATION * 60_000;
    const elapsed = Date.now() - anchorAt;
    if (elapsed < perStationMs) return null;
    const predicted = Math.min(last, anchorIdx + Math.floor(elapsed / perStationMs));
    if (predicted <= j.currentIndex) return null;

    const sid = j.path[predicted];
    const next: ActiveJourney = {
      ...j,
      currentIndex: predicted,
      currentStationId: sid,
      currentStationName: getStation(sid)?.name ?? null,
      source: "estimate",
    };
    set({ journey: next });
    persist(next);
    return next;
  },
}));

/** ساخت آرگومان شروع سفر از نتیجه مسیریابی — ترتیب ایستگاه‌ها،
    ایستگاه‌های تعویض خط و خطِ هر قطعه یک‌بار برای همیشه محاسبه می‌شود */
export function buildJourneyFromPlan(
  plan: RoutePlan,
  fromId: string,
  toId: string,
  alarmOn: boolean,
  alarmMinutes: number,
  voiceOn: boolean
): StartJourneyArgs | null {
  const from = getStation(fromId);
  const to = getStation(toId);
  if (!from || !to || plan.legs.length === 0) return null;

  const legs: JourneyLegInfo[] = plan.legs.map((leg) => {
    const line = getLine(leg.lineId);
    return {
      lineId: leg.lineId,
      lineName: leg.lineName,
      number: line?.number ?? 0,
      color: leg.color,
      textOnColor: leg.textOnColor,
      stationIds: [...leg.stationIds],
    };
  });

  // مسیر پیوسته: قطعه اول کامل؛ قطعه‌های بعدی بدون ایستگاه اول (تبادل مشترک)
  const path: string[] = [];
  const transferAt: number[] = [];
  const legIndexOf: number[] = [];
  legs.forEach((leg, k) => {
    const seg = k === 0 ? leg.stationIds : leg.stationIds.slice(1);
    if (k > 0) transferAt.push(path.length - 1); // اندیس ایستگاه تعویض (مشترک با قطعه قبل)
    for (const id of seg) {
      path.push(id);
      legIndexOf.push(k);
    }
  });

  return {
    fromId,
    fromName: from.name,
    toId,
    toName: to.name,
    legs,
    path,
    transferAt,
    legIndexOf,
    totalMinutes: Math.round(plan.totalMinutes),
    totalStations: plan.totalStations,
    fare: plan.fare,
    pref: plan.pref,
    alarmOn,
    alarmMinutes,
    voiceOn,
  };
}
