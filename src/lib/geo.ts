"use client";

/* ============================================================
   موقعیت‌یاب یکپارچه متروجو
   روی اندروید (WebView/Capacitor): پلاگین نیتیو Geolocation —
   درخواست مجوز لحظه‌ای به‌درستی نمایش داده می‌شود و GPS دقیق
   دستگاه برگردانده می‌شود (رفع «GPS روشن می‌شود ولی مکان
   اشتباه نمایش داده می‌شود» در نسخه اندروید).
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

/** یک‌بار گرفتن موقعیت — با GPS دقیق و بدون کش */
export async function getCurrentGeo(timeoutMs = 15000): Promise<GeoFix | null> {
  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      };
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
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/** رصد زنده موقعیت — برای اعلام سریع رسیدن قطار به ایستگاه */
export async function watchGeo(
  onFix: (fix: GeoFix) => void,
  onError: (kind: "denied" | "error") => void
): Promise<GeoWatchId | null> {
  if (isNative()) {
    const perm = await requestGeoPermission();
    if (perm !== "granted") {
      onError("denied");
      return null;
    }
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
  if (id.native) {
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
