"use client";

/* ============================================================
   موقعیت‌یاب یکپارچه درمسیر
   روی اندروید (WebView/Capacitor):
     ۱) موتور دقیق گوگل — FusedLocationProviderClient (پلاگین نیتیو
        FusedLocation — همان موتور Google Maps: ترکیب GPS + وای‌فای +
        آنتن‌دهی + سنسورها با سرویس‌های گوگل پلی) — رفع «GPS روشن
        می‌شود ولی مکان اشتباه/ناعدد نمایش داده می‌شود»
     ۲) فالبک: پلاگین Geolocation کاپاسیترور
   در مرورگر: navigator.geolocation استاندارد.
   ============================================================ */

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface GeoWatchId {
  native?: string;
  web?: number;
  fusedTimer?: ReturnType<typeof setInterval>; // رصد با موتور گوگل (پینگ دوره‌ای)
}

/** آیا اپ داخل WebView اندروید (Capacitor) اجرا می‌شود؟ */
function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return w.Capacitor?.isNativePlatform?.() === true;
}

export type GeoPerm = "granted" | "denied" | "unavailable";

/** درخواست مجوز موقعیت — روی اندروید دیالوگ سیستم نمایش داده می‌شود */
export async function requestGeoPermission(): Promise<GeoPerm> {
  if (!isNative()) return "granted"; // مرورگر خودش اجازه می‌گیرد
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const st = await Geolocation.checkPermissions();
    if (st.location === "granted" || st.coarseLocation === "granted") return "granted";
    const req = await Geolocation.requestPermissions();
    return req.location === "granted" || req.coarseLocation === "granted" ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}

/* ---------------- موتور موقعیت دقیق گوگل (پلاگین نیتیو FusedLocation) ---------------- */

type FusedPlugin = { getCurrentPosition: (opts: { enableHighAccuracy: boolean; timeout: number }) => Promise<{ lat: number; lng: number; accuracy: number }> };
let fusedPlugin: FusedPlugin | null | undefined; // undefined = هنوز امتحان نشده، null = موجود نیست

async function getFusedPlugin(): Promise<FusedPlugin | null> {
  if (fusedPlugin !== undefined) return fusedPlugin;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    fusedPlugin = registerPlugin<FusedPlugin>("FusedLocation");
  } catch {
    fusedPlugin = null;
  }
  return fusedPlugin;
}

/** یک‌بار گرفتن موقعیت با موتور Fused گوگل — اگر پلاگین نبود/خطا داد null */
async function fusedGetCurrent(timeoutMs = 12000, highAccuracy = true): Promise<GeoFix | null> {
  if (!isNative()) return null;
  const plugin = await getFusedPlugin();
  if (!plugin) return null;
  try {
    const res = await plugin.getCurrentPosition({ enableHighAccuracy: highAccuracy, timeout: timeoutMs });
    const lat = Number(res?.lat);
    const lng = Number(res?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
    const acc = Number(res?.accuracy);
    return { lat, lng, accuracy: Number.isFinite(acc) && acc >= 0 ? acc : null };
  } catch {
    return null;
  }
}

/** یک‌بار گرفتن موقعیت — اول موتور دقیق گوگل، بعد مسیرهای قبلی؛
    maxAgeMs>0 اجازه استفاده از آخرین موقعیت کش‌شده دستگاه را می‌دهد */
export async function getCurrentGeo(timeoutMs = 15000, maxAgeMs = 0): Promise<GeoFix | null> {
  if (isNative()) {
    /* مسیر اصلی: موتور موقعیت دقیق گوگل (FusedLocationProviderClient — همان Google Maps) */
    const fused = await fusedGetCurrent(timeoutMs, true);
    if (fused) return fused;

    /* فالبک: پلاگین Geolocation کاپاسیترور */
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      try {
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: maxAgeMs,
        });
        return {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        };
      } catch {
        /* GPS نتوانست fix بدهد (داخل ساختمان/دستگاه بدون GPS) — موقعیت شبکه
           (وای‌فای/آنتن‌دهی با سرویس موقعیت گوگل) به‌عنوان فالبک امتحان می‌شود */
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: Math.min(timeoutMs, 8000),
          maximumAge: Math.max(maxAgeMs, 10000),
        });
        return {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        };
      }
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: maxAgeMs }
    );
  });
}

const sleepMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** بهترین موقعیت از چند تلاش — موقعیت‌های ناعدد (شبکه/IP) باعث
    «نمایش ایستگاه اشتباه» می‌شدند (مثلاً پایانه جنوب به‌جای علی‌آباد:
    fixهای اولیه GPS قبل از همگرایی، خطای واقعی ۱ تا ۲ کیلومتری دارند
    حتی وقتی «دقت» ادعایی متوسط است).
    راه‌حل: watch پیوسته — fixهای اولیه به‌مرور با fixهای دقیق‌تر
    جایگزین می‌شوند و به‌محض رسیدن به دقت خوب برمی‌گردیم.
    اگر موتور گوگل همگرا نشد، بهترین fix (شبکه) برگردانده می‌شود تا اپ
    هیچ‌وقت «بدون موقعیت» نماند؛ caller با accuracy تصمیم می‌گیرد. */
export async function getCurrentGeoBest(
  attempts = 3,
  timeoutMs = 8000,
  goodAccuracyM = 450,
  maxWaitMs = 25000
): Promise<GeoFix | null> {
  const deadline = Date.now() + maxWaitMs;
  let best: GeoFix | null = null;
  const isGood = () => (best?.accuracy ?? Infinity) <= goodAccuracyM;

  /* ---------- مسیر اصلی: watch پیوسته تا همگرایی ---------- */
  const id = await watchGeo(
    (fix) => {
      if (!best || (fix.accuracy ?? Infinity) < (best.accuracy ?? Infinity)) best = fix;
    },
    () => {
      /* خطای رصد — مسیر پشتیبان پایین جبران می‌کند */
    }
  );
  if (id) {
    while (Date.now() < deadline && !isGood()) await sleepMs(500);
    clearGeoWatch(id);
    if (best && isGood()) return best;
  }

  /* ---------- مسیر پشتیبان: چند تلاش مجزا ----------
     maximumAge همیشه صفر است — موقعیت‌های کش‌شده قدیمی دستگاه
     («مکان اشتباه») هرگز استفاده نمی‌شوند */
  for (let i = 0; i < attempts && Date.now() < deadline; i++) {
    const fix = await getCurrentGeo(timeoutMs, 0);
    if (fix && (!best || (fix.accuracy ?? Infinity) < (best.accuracy ?? Infinity))) best = fix;
    if (isGood()) break;
  }
  if (isGood()) return best;

  /* ---------- فالبک نهایی: موقعیت شبکه (سرویس موقعیت گوگل — بدون GPS) ----------
     حتی وقتی GPS همگرا نشده، موقعیت تقریبی بهتر از هیچ است؛
     accuracy بزرگ‌تر به‌صورت شفاف در UI اعلام می‌شود */
  if (!best) {
    best = await getCurrentGeo(8000, 0);
  }
  return best;
}

/** رصد زنده موقعیت — برای اعلام سریع رسیدن قطار به ایستگاه.
    روی اندروید با موتور دقیق گوگل (پینگ دوره‌ای FusedLocation)؛
    اگر پلاگین نیتیو نبود، پلاگین Geolocation کاپاسیترور. */
export async function watchGeo(
  onFix: (fix: GeoFix) => void,
  onError: (kind: "denied" | "error") => void
): Promise<GeoWatchId | null> {
  if (isNative()) {
    const perm = await requestGeoPermission();
    if (perm === "denied" || perm === "unavailable") {
      onError("denied");
      return null;
    }

    /* مسیر اصلی: موتور موقعیت دقیق گوگل — پینگ هر ۲.۵ ثانیه */
    const fusedAvailable = (await getFusedPlugin()) != null;
    if (fusedAvailable) {
      let firstOk = false;
      const tick = async () => {
        const fix = await fusedGetCurrent(6000, true);
        if (fix) {
          firstOk = true;
          onFix(fix);
        }
      };
      void tick();
      const fusedTimer = setInterval(() => void tick(), 2500);
      return { fusedTimer, native: "fused" };
    }

    /* فالبک: پلاگین Geolocation کاپاسیترور */
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
        (pos, err) => {
          if (pos?.coords) {
            onFix({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? null,
            });
          } else if (err) {
            onError("error");
          }
        }
      );
      return { native: id };
    } catch {
      onError("error");
      return null;
    }
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError("error");
    return null;
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null }),
    (err) => onError(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
  return { web: id };
}

/** توقف رصد */
export function clearGeoWatch(id: GeoWatchId | null): void {
  if (!id) return;
  if (id.fusedTimer !== undefined) {
    clearInterval(id.fusedTimer);
    id.fusedTimer = undefined;
  }
  if (id.native && id.native !== "fused") {
    void (async () => {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        await Geolocation.clearWatch({ id: id.native! });
      } catch {
        /* از پیش متوقف شده */
      }
    })();
    return;
  }
  if (id.web !== undefined && typeof navigator !== "undefined" && navigator.geolocation) {
    navigator.geolocation.clearWatch(id.web);
  }
}
