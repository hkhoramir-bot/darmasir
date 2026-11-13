"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStation, toFa } from "@/lib/metro-data";
import { nearestStationTo } from "@/lib/station-geo";
import { clearGeoWatch, getCurrentGeo, watchGeo, type GeoWatchId } from "@/lib/geo";
import {
  MINUTES_PER_STATION,
  remainingMinutesOf,
  remainingStationsOf,
  useJourney,
  type ActiveJourney,
} from "@/lib/journey";
import { useAnnouncer } from "@/components/metro/voice";

/* ============================================================
   پایشگر سفر فعال — قلب «هشدار مقصد» واقعی
   این کامپوننت سراسری در ریشه اپ نصب می‌شود و وقتی سفری فعال است:
   ۱. GPS دستگاه را با دقت بالا به‌صورت زنده رصد می‌کند
      (watchPosition + موقعیت اینترنتی/شبکه‌ای — بدون تنظیمات)
   ۲. با رسیدن قطار به هر ایستگاه (مثلاً همت) بلافاصله تشخیص
      می‌دهد و «سریع» اعلام صوتی فارسی پخش می‌کند
   ۳. ایستگاه تعویض خط، ایستگاه قبل از مقصد و خود مقصد را با
      پیام اختصاصی اعلام می‌کند
   ۴. «بیدارباش مقصد» را در آستانه تنظیم‌شده اجرا می‌کند
   تشخیص فقط با دقت مناسب انجام می‌شود تا مکان اشتباه اعلام نشود؛
   کاربر همیشه می‌تواند ایستگاه فعلی را دستی اصلاح کند.
   ============================================================ */

const SNAP_RADIUS_M = 450; // شعاع نسبت‌دادن موقعیت به ایستگاه
const MAX_ACCURACY_FOR_DETECT = 300; // بالاتر از این = GPS ناعدد، تشخیص نمی‌کنیم

/** عدد فارسی برای جمله‌های صوتی */
function faWord(n: number): string {
  const words = ["صفر", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده"];
  return n <= 10 ? words[n] : toFa(n);
}

/** متن اعلام برای رسیدن به ایستگاه با اندیس idx */
function arrivalText(j: ActiveJourney, idx: number): string {
  const last = j.path.length - 1;
  const name = getStation(j.path[idx])?.name ?? "";
  if (idx === 0) {
    const leg = j.legs[0];
    const terminal = getStation(leg?.stationIds[leg.stationIds.length - 1] ?? "")?.name ?? j.toName;
    return `به ${j.fromName} رسیدید. سفر با خط ${toFa(leg?.number ?? 0)} به سمت ${terminal} آغاز شد.`;
  }
  if (idx === last) {
    return `به ${j.toName} رسیدید. لطفاً از قطار پیاده شوید. سفر شما پایان یافت.`;
  }
  if (idx === last - 1) {
    return `ایستگاه ${name}. ایستگاه بعدی مقصد شماست: ${j.toName}.`;
  }
  if (j.transferAt.includes(idx)) {
    const nextLeg = j.legs[(j.legIndexOf[idx] ?? 0) + 1] ?? j.legs[j.legIndexOf[idx] ?? 0];
    return `ایستگاه ${name}. برای ادامه با خط ${toFa(nextLeg?.number ?? 0)} پیاده شوید.`;
  }
  const nextName = getStation(j.path[idx + 1])?.name ?? "";
  return `ایستگاه ${name}. ایستگاه بعدی: ${nextName}.`;
}

export default function JourneyMonitor() {
  const journey = useJourney((s) => s.journey);
  const hydrate = useJourney((s) => s.hydrate);
  const applyGpsStation = useJourney((s) => s.applyGpsStation);
  const setGpsInfo = useJourney((s) => s.setGpsInfo);
  const markAlarmFired = useJourney((s) => s.markAlarmFired);
  const announcer = useAnnouncer();

  const [gpsDenied, setGpsDenied] = useState(false);
  const [gpsLive, setGpsLive] = useState(false);
  const watchIdRef = useRef<GeoWatchId | null>(null);
  const journeyRef = useRef<ActiveJourney | null>(null);
  const announcedRef = useRef(false);
  const announcerRef = useRef(announcer);

  useEffect(() => {
    journeyRef.current = journey;
    announcerRef.current = announcer;
  }, [journey, announcer]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const speak = useCallback((text: string) => {
    if (!journeyRef.current?.voiceOn) return;
    void announcerRef.current.announce(text).catch(() => {});
  }, []);

  /** پردازش هر اصلاحیه GPS */
  const handleFix = useCallback(
    (lat: number, lng: number, accuracy: number | null) => {
      const j = journeyRef.current;
      if (!j) return;
      setGpsLive(true);
      if (accuracy !== null && accuracy > MAX_ACCURACY_FOR_DETECT) {
        // GPS ناعدد (داخل تونل/داخل ساختمان) — فقط اطلاعات دقت به‌روز می‌شود
        setGpsInfo(accuracy);
        return;
      }
      const near = nearestStationTo(lat, lng, SNAP_RADIUS_M);
      if (!near) {
        setGpsInfo(accuracy);
        return;
      }
      // فقط ایستگاه‌های روی مسیر سفر موقعیت را تعیین می‌کنند
      if (!j.path.includes(near.id)) {
        setGpsInfo(accuracy);
        return;
      }
      const res = applyGpsStation(near.id, accuracy);
      if (!res) return;
      if (res.prevIndex === -1) {
        // اولین تثبیت موقعیت سفر — اعلام موقعیت فعلی
        if (!announcedRef.current) {
          announcedRef.current = true;
          speak(`شما در ایستگاه ${res.stationName} هستید.`);
        }
        return;
      }
      if (res.newIndex !== res.prevIndex) {
        speak(arrivalText(j, res.newIndex));
      }
    },
    [applyGpsStation, setGpsInfo, speak]
  );

  /* ---------- رصد زنده GPS در طول سفر فعال ----------
     روی اندروید با پلاگین نیتیو (اجازه لحظه‌ای درست کار می‌کند)
     و در مرورگر با API استاندارد — همان منطق تشخیص و اعلام
     وابستگی فقط «وجود سفر» است؛ هر بروزرسانی ایستگاه، پایش را
     از نو شروع نمی‌کند */
  const hasJourney = !!journey;
  useEffect(() => {
    if (!hasJourney) {
      return;
    }
    announcedRef.current = false;
    let alive = true;

    // تثبیت سریع اولین موقعیت — اعلام سریع از همان ابتدا
    void getCurrentGeo(12000).then((fix) => {
      if (!alive) return;
      if (!fix) return;
      handleFix(fix.lat, fix.lng, fix.accuracy);
    });

    void watchGeo(
      (fix) => {
        if (!alive) return;
        setGpsDenied(false);
        handleFix(fix.lat, fix.lng, fix.accuracy);
      },
      (kind) => {
        if (!alive) return;
        if (kind === "denied") setGpsDenied(true);
      }
    ).then((id) => {
      watchIdRef.current = id;
      if (id) setGpsLive(true);
    });

    return () => {
      alive = false;
      clearGeoWatch(watchIdRef.current);
      watchIdRef.current = null;
      setGpsLive(false);
    };
  }, [hasJourney, handleFix]);

  /* ---------- بیدارباش مقصد — در آستانه تنظیم‌شده ---------- */
  useEffect(() => {
    const j = journey;
    if (!j || !j.alarmOn || j.alarmFired) return;
    if (j.currentIndex < 0) return;
    const last = j.path.length - 1;
    if (j.currentIndex >= last) return;
    const remainingMin = Math.max(remainingMinutesOf(j), remainingStationsOf(j) * MINUTES_PER_STATION);
    if (remainingMin <= j.alarmMinutes) {
      markAlarmFired();
      speak(
        `توجه: حدود ${faWord(Math.max(1, remainingStationsOf(j)))} ایستگاه تا رسیدن به ${j.toName} باقی مانده است.`
      );
    }
  }, [journey, markAlarmFired, speak]);

  /* این کامپوننت چیزی رندر نمی‌کند — فقط پایش می‌کند */
  if (!journey) return null;

  /* حلقه کوچک وضعیت GPS — داخل کارت سفر صفحه اصلی استفاده می‌شود */
  return (
    <span className="hidden" data-journey-gps={gpsDenied ? "denied" : gpsLive ? "live" : "off"} />
  );
}
