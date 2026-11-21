import { computeRoute, getStation, toFa, type StationDef } from "@/lib/metro-data";
import { STATION_GEO } from "@/lib/station-geo";
import { haversineKm, formatKmFa, getCityPoi, nearestStationToPoi, nearestBrtToPoi } from "@/lib/city-pois";
import type { TravelMode, VoiceRouteIntent } from "@/lib/voice-intent";

/* ============================================================
   راهنمای صوتی نشانه‌های شهری — قانون‌محور، بدون هوش مصنوعی
   ورودی: intent صوتی + مبدأ (جمله یا GPS) → خروجی:
   متن اعلام TTS + مقصد ناوبری (مسیریابی مترو یا نقشه شهر)
   • مترو/پیش‌فرض → دایکسترا تا نزدیک‌ترین ایستگاه نشانه
   • بی‌آرتی → نزدیک‌ترین خط تندرو به نشانه
   • پیاده/خودرو → Haversine از موقعیت کاربر + نقشه شهری
   ============================================================ */

export type VoiceNav =
  | { kind: "plan"; fromId: string; toId: string }
  | { kind: "map"; mode: TravelMode }
  | null;

export interface VoiceGuidance {
  /** متن اعلام صوتی (TTS فارسی — دلاورا/فرید) */
  speech: string;
  nav: VoiceNav;
  toastTitle: string;
  toastDesc: string;
  /** نام نشانه برای پر کردن فیلد مقصد فرم */
  destName: string;
}

/** مختصات مبدأ — موقعیت GPS یا مختصات ایستگاه مبدأ */
function originPos(
  fromStationId: string | null,
  userPos: { lat: number; lng: number } | null
): { lat: number; lng: number } | null {
  if (userPos) return userPos;
  if (fromStationId) {
    const g = STATION_GEO[fromStationId];
    if (g) return { lat: g[0], lng: g[1] };
  }
  return null;
}

function stationById(id: string | null): StationDef | null {
  if (!id) return null;
  return getStation(id) ?? null;
}

/** پاسخ برای نشانه شهری تشخیص داده‌شده در جمله صوتی */
export function resolvePoiVoice(args: {
  intent: VoiceRouteIntent;
  /** مبدأ ایستگاهی — از جمله صوتی یا نزدیک‌ترین ایستگاه GPS */
  fromStationId: string | null;
  fromStationName: string | null;
  userPos: { lat: number; lng: number } | null;
}): VoiceGuidance | null {
  const { intent, fromStationId, fromStationName, userPos } = args;
  const poi = intent.poiId ? getCityPoi(intent.poiId) : null;
  if (!poi) return null;

  /* وسیله نگفته → بهترین حالت پیش‌فرض: مترو (اگر ایستگاهی نزدیک نشانه باشد) */
  const mode: TravelMode = intent.mode ?? "metro";
  const near = nearestStationToPoi(poi);
  const destName = poi.name;

  /* ---------- پیاده‌روی ---------- */
  if (mode === "walking") {
    const pos = originPos(fromStationId, userPos);
    if (!pos) {
      return {
        speech: `برای محاسبه فاصله پیاده تا ${destName} موقعیت مکانی لازم است. نزدیک‌ترین ایستگاه مترو به ${destName}، ایستگاه ${near.station?.name ?? "نامشخص"} است.`,
        nav: null,
        toastTitle: "فاصله پیاده نیاز به موقعیت دارد",
        toastDesc: `موقعیت مکانی را فعال کنید — نزدیک‌ترین ایستگاه به ${destName}: ${near.station?.name ?? "نامشخص"}`,
        destName,
      };
    }
    const km = haversineKm(pos.lat, pos.lng, poi.lat, poi.lng);
    const minutes = Math.max(1, Math.round((km / 4.5) * 60)); // سرعت پیاده ~۴.۵ km/h
    return {
      speech: `${destName} در حدود ${formatKmFa(km)} فاصله شماست — پیاده‌روی تقریبی ${toFa(minutes)} دقیقه. نزدیک‌ترین ایستگاه مترو هم ${near.station?.name ?? "نامشخص"} است. نقشه شهری باز می‌شود.`,
      nav: { kind: "map", mode },
      toastTitle: `پیاده تا ${destName}`,
      toastDesc: `حدود ${formatKmFa(km)} — پیاده‌روی ~${toFa(minutes)} دقیقه — نزدیک‌ترین ایستگاه: ${near.station?.name ?? "—"}`,
      destName,
    };
  }

  /* ---------- خودرو ---------- */
  if (mode === "driving") {
    const pos = originPos(fromStationId, userPos);
    if (!pos) {
      return {
        speech: `برای تخمین زمان رانندگی تا ${destName} موقعیت مکانی لازم است. نزدیک‌ترین ایستگاه مترو به ${destName}، ایستگاه ${near.station?.name ?? "نامشخص"} است.`,
        nav: null,
        toastTitle: "زمان رانندگی نیاز به موقعیت دارد",
        toastDesc: `موقعیت مکانی را فعال کنید — نزدیک‌ترین ایستگاه به ${destName}: ${near.station?.name ?? "نامشخص"}`,
        destName,
      };
    }
    const km = haversineKm(pos.lat, pos.lng, poi.lat, poi.lng);
    const minutes = Math.max(2, Math.round((km / 22) * 60)); // میانگین شهری ~۲۲ km/h بدون ترافیک
    return {
      speech: `مسیر با ماشین تا ${destName} حدود ${formatKmFa(km)} است — تقریباً ${toFa(minutes)} دقیقه بدون احتساب ترافیک. نزدیک‌ترین ایستگاه مترو ${near.station?.name ?? "نامشخص"} است. نقشه شهری باز می‌شود.`,
      nav: { kind: "map", mode },
      toastTitle: `رانندگی تا ${destName}`,
      toastDesc: `حدود ${formatKmFa(km)} — ~${toFa(minutes)} دقیقه (بدون ترافیک) — ایستگاه مترو: ${near.station?.name ?? "—"}`,
      destName,
    };
  }

  /* ---------- بی‌آرتی ---------- */
  if (mode === "bus") {
    const brt = nearestBrtToPoi(poi);
    if (brt.line) {
      return {
        speech: `نزدیک‌ترین خط بی‌آرتی به ${destName}، ${brt.line.name} است — مسیر ${brt.line.from} تا ${brt.line.to} — در حدود ${formatKmFa(brt.km)} فاصله. نزدیک‌ترین ایستگاه مترو هم ${near.station?.name ?? "نامشخص"} است. نقشه بی‌آرتی باز می‌شود.`,
        nav: { kind: "map", mode },
        toastTitle: `بی‌آرتی تا ${destName}`,
        toastDesc: `${brt.line.name} (${brt.line.from} ↔ ${brt.line.to}) — ${formatKmFa(brt.km)} — ایستگاه مترو: ${near.station?.name ?? "—"}`,
        destName,
      };
    }
    /* خط تندرو نزدیکی ندارد — رسانه‌ای به مترو برمی‌گردیم */
    return {
      speech: `خط بی‌آرتی نزدیکی به ${destName} ندارد. نزدیک‌ترین ایستگاه مترو، ایستگاه ${near.station?.name ?? "نامشخص"} است.`,
      nav: null,
      toastTitle: "خط تندرو نزدیک نیست",
      toastDesc: `نزدیک‌ترین گزینه به ${destName}: مترو — ${near.station?.name ?? "نامشخص"}`,
      destName,
    };
  }

  /* ---------- مترو (پیش‌فرض) ---------- */
  const from = stationById(fromStationId);
  const to = near.station;
  if (!to) {
    return {
      speech: `ایستگاهی نزدیک ${destName} پیدا نشد.`,
      nav: null,
      toastTitle: "ایستگاه نزدیک یافت نشد",
      toastDesc: `${destName} — ایستگاه متروی نزدیکی ثبت نشده است`,
      destName,
    };
  }
  if (from && from.id !== to.id) {
    const plan = computeRoute(from.id, to.id, "fastest");
    const lineName = plan?.legs[0]?.lineName ?? near.lineNames[0] ?? "";
    if (plan) {
      const transfers =
        plan.transfers > 0
          ? `${toFa(plan.transfers)} تعویض خط`
          : "بدون تعویض خط";
      return {
        speech: `نزدیک‌ترین ایستگاه به ${destName}، ایستگاه ${to.name} است${lineName ? ` — ${lineName}` : ""}. مسیر از ${fromStationName ?? from.name} حدود ${toFa(plan.totalMinutes)} دقیقه و ${transfers} دارد. مسیر باز می‌شود.`,
        nav: { kind: "plan", fromId: from.id, toId: to.id },
        toastTitle: `مسیر صوتی به ${destName}`,
        toastDesc: `${fromStationName ?? from.name} → ${to.name} (${lineName || "مترو"}) — ~${toFa(plan.totalMinutes)} دقیقه، ${transfers}`,
        destName,
      };
    }
    /* مسیر درون‌شهری یافت نشد (مثلاً خط متفاوت) — فقط اطلاعات ایستگاه */
    return {
      speech: `نزدیک‌ترین ایستگاه مترو به ${destName}، ایستگاه ${to.name} است${lineName ? ` — ${lineName}` : ""}. اما مسیری از ${fromStationName ?? from.name} پیدا نشد.`,
      nav: null,
      toastTitle: `نزدیک‌ترین ایستگاه به ${destName}`,
      toastDesc: `${to.name}${lineName ? ` — ${lineName}` : ""} — مسیر مستقیم یافت نشد`,
      destName,
    };
  }
  /* مبدأ نداریم (GPS هم نیست) — فقط مقصد معرفی می‌شود */
  const lineName = near.lineNames[0] ?? "";
  return {
    speech: `نزدیک‌ترین ایستگاه مترو به ${destName}، ایستگاه ${to.name} است${lineName ? ` — ${lineName}` : ""} — حدود ${formatKmFa(near.km)} فاصله. برای مسیریابی، مبدأ را انتخاب کنید.`,
    nav: null,
    toastTitle: `مقصد صوتی: ${destName}`,
    toastDesc: `نزدیک‌ترین ایستگاه: ${to.name}${lineName ? ` (${lineName})` : ""} — مبدأ را انتخاب کنید`,
    destName,
  };
}
