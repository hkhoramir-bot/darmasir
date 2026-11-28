"use client";

/* ============================================================
   نقشه شهری تهران بر پایه Leaflet + کاشی OpenStreetMap (داده واقعی)
   دو حالت:
   - city: نقشه شهری تهران + خطوط و ایستگاه‌های مترو با مختصات جغرافیایی واقعی
   - brt:  نقشه سامانه اتوبوس تندرو (BRT) تهران — ۱۰ خط فعال + پایانه‌ها
   Leaflet فقط سمت کلاینت به‌صورت داینامیک بارگذاری می‌شود (سازگار با SSR).
   فقط برای شهر تهران — طبق دستور مدیر، این نقشه‌ها فقط در تهران فعال‌اند.
   + دکمه GPS: نمایش موقعیت کاربر روی نقشه شهری با دایره دقت و
     نزدیک‌ترین ایستگاه مترو (طبق درخواست مدیر).
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { BRT_LINES, BRT_TERMINALS } from "@/lib/brt-data";
import { MAP_LINES, MAP_STATION_BY_ID } from "@/lib/map-geometry";
import { STATION_GEO, nearestStationTo } from "@/lib/station-geo";
import { LINES, toFa } from "@/lib/metro-data";
import { getCurrentGeoBest, requestGeoPermission } from "@/lib/geo";
import { MI } from "@/components/metro/shell";

export type TehranMapMode = "city" | "brt";

interface TehranTileMapProps {
  mode: TehranMapMode;
  className?: string;
}

/* محدوده تهران برای قاب اولیه (فال‌بک در نبود داده) */
const TEHRAN_BOUNDS: [[number, number], [number, number]] = [
  [35.55, 51.25],
  [35.84, 51.65],
];

type LocateState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok"; accuracyM: number | null; nearName: string | null; distanceM: number | null }
  | { kind: "error"; message: string };

export default function TehranTileMap({ mode, className }: TehranTileMapProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const meLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [locate, setLocate] = useState<LocateState>({ kind: "idle" });
  const [mapReady, setMapReady] = useState(false);

  /* ساختن/به‌روزرسانی محتوای نقشه با تغییر حالت */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !holderRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(holderRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView([35.7, 51.4], 11);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(mapRef.current);
        setMapReady(true);
      }
      const map = mapRef.current;
      setTimeout(() => map.invalidateSize(), 60);

      if (layerRef.current) layerRef.current.remove();
      const group = L.layerGroup();
      const pts: [number, number][] = [];

      if (mode === "city") {
        /* ---------- نقشه شهری: خطوط و ایستگاه‌های مترو با مختصات واقعی ---------- */
        for (const line of MAP_LINES) {
          const coords: [number, number][] = [];
          for (const sid of line.stations) {
            const g = STATION_GEO[sid];
            if (g) coords.push([g[0], g[1]]);
          }
          if (coords.length >= 2) {
            L.polyline(coords, {
              color: line.color,
              weight: 4,
              opacity: 0.85,
              lineJoin: "round",
            })
              .bindTooltip(
                `مترو ${LINES.find((l) => l.id === line.lineId)?.name ?? ""}`,
                { direction: "top" }
              )
              .addTo(group);
          }
        }
        for (const line of MAP_LINES) {
          const meta = LINES.find((l) => l.id === line.lineId);
          for (const sid of line.stations) {
            const g = STATION_GEO[sid];
            const st = MAP_STATION_BY_ID[sid];
            if (!g || !st) continue;
            pts.push([g[0], g[1]]);
            L.circleMarker([g[0], g[1]], {
              radius: 4.5,
              color: "#ffffff",
              weight: 1.5,
              fillColor: line.color,
              fillOpacity: 1,
            })
              .bindPopup(
                `<div style="font-family:inherit;direction:rtl;text-align:right">
                   <b>${st.name}</b><br/>
                   <span style="font-size:11px;color:#555">${meta?.name ?? ""} — مترو تهران</span>
                 </div>`
              )
              .addTo(group);
          }
        }
      } else {
        /* ---------- نقشه BRT: خطوط تندرو + پایانه‌ها ---------- */
        for (const line of BRT_LINES) {
          L.polyline(line.path, {
            color: line.color,
            weight: 5,
            opacity: 0.85,
            lineJoin: "round",
          })
            .bindTooltip(
              `${line.name} — ${line.from} ↔ ${line.to}`,
              { direction: "top" }
            )
            .addTo(group);
          for (const p of line.path) pts.push([p[0], p[1]]);
        }
        for (const t of Object.values(BRT_TERMINALS)) {
          L.circleMarker([t.lat, t.lng], {
            radius: 7,
            color: "#ffffff",
            weight: 2.5,
            fillColor: "#1f2937",
            fillOpacity: 1,
          })
            .bindPopup(
              `<div style="font-family:inherit;direction:rtl;text-align:right">
                 <b>${t.name}</b><br/>
                 <span style="font-size:11px;color:#555">پایانه سامانه اتوبوس تندرو تهران</span>
               </div>`
            )
            .addTo(group);
        }
      }

      group.addTo(map);
      layerRef.current = group;

      if (pts.length >= 2) {
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        for (const [a, b] of pts) {
          minLat = Math.min(minLat, a);
          maxLat = Math.max(maxLat, a);
          minLng = Math.min(minLng, b);
          maxLng = Math.max(maxLng, b);
        }
        map.fitBounds(
          [
            [minLat, minLng],
            [maxLat, maxLng],
          ],
          { padding: [14, 14] }
        );
      } else {
        map.fitBounds(TEHRAN_BOUNDS, { padding: [14, 14] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  /* پاک‌سازی کامل هنگام حذف صفحه */
  useEffect(() => {
    return () => {
      layerRef.current = null;
      meLayerRef.current = null;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, []);

  /* ---------- دکمه GPS — موقعیت کاربر روی نقشه شهری ---------- */
  const locateMe = useCallback(() => {
    if (locate.kind === "busy") return;
    /* احترام به کلید GPS در تنظیمات اپ */
    try {
      if (localStorage.getItem("mj-gps-enabled") === "false") {
        setLocate({ kind: "error", message: "دسترسی موقعیت مکانی در تنظیمات غیرفعال است" });
        return;
      }
    } catch {
      /* حافظه در دسترس نیست — ادامه */
    }
    setLocate({ kind: "busy" });
    void (async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (!map) {
        setLocate({ kind: "error", message: "نقشه هنوز آماده نشده است — چند لحظه بعد تلاش کنید" });
        return;
      }
      const perm = await requestGeoPermission();
      if (perm === "denied") {
        setLocate({ kind: "error", message: "دسترسی موقعیت مکانی داده نشد" });
        return;
      }
      if (perm === "unavailable") {
        setLocate({ kind: "error", message: "موقعیت‌یابی روی این دستگاه در دسترس نیست" });
        return;
      }
      /* همگرایی GPS تا دقت خوب — fixهای اولیه ناعدد باعث «نمایش مکان اشتباه» می‌شد */
      const fix = await getCurrentGeoBest(3, 8000, 450, 25000);
      if (!fix) {
        setLocate({ kind: "error", message: "موقعیت مکانی در دسترس نیست — کنار پنجره امتحان کنید" });
        return;
      }
      if ((fix.accuracy ?? Infinity) > 1500) {
        setLocate({
          kind: "error",
          message: `دقت موقعیت بسیار کم است (±${toFa(Math.round((fix.accuracy ?? 0) / 50) * 50)} متر) — زیر آسمان باز دوباره تلاش کنید`,
        });
        return;
      }

      /* نمایش موقعیت روی نقشه: دایره دقت + نقطه موقعیت */
      if (meLayerRef.current) meLayerRef.current.remove();
      const me = L.layerGroup();
      L.circle([fix.lat, fix.lng], {
        radius: Math.max(30, Math.min(fix.accuracy ?? 100, 500)),
        color: "#1666a0",
        weight: 1,
        fillColor: "#1666a0",
        fillOpacity: 0.14,
      }).addTo(me);
      L.circleMarker([fix.lat, fix.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 2.5,
        fillColor: "#1666a0",
        fillOpacity: 1,
      })
        .bindPopup("<b>موقعیت شما</b>")
        .addTo(me);
      me.addTo(map);
      meLayerRef.current = me;

      /* نزدیک‌ترین ایستگاه مترو */
      const near = nearestStationTo(fix.lat, fix.lng);
      const nearName = near?.name ?? null;
      const distanceM = near?.distanceM ?? null;
      if (near) {
        const g = STATION_GEO[near.id];
        if (g) {
          L.popup({ offset: [0, -8] })
            .setLatLng([g[0], g[1]])
            .setContent(
              `<div style="font-family:inherit;direction:rtl;text-align:right">
                 <b>نزدیک‌ترین ایستگاه به شما</b><br/>
                 ${near.name} — ${toFa(Math.round(near.distanceM))} متر
               </div>`
            )
            .openOn(map);
        }
      }

      map.flyTo([fix.lat, fix.lng], 15, { duration: 0.8 });
      setLocate({ kind: "ok", accuracyM: fix.accuracy, nearName, distanceM });
    })();
  }, [locate.kind]);

  const busy = locate.kind === "busy";
  const icon = busy ? "autorenew" : locate.kind === "error" ? "location_off" : "my_location";
  const iconColor =
    locate.kind === "error"
      ? "text-error"
      : locate.kind === "ok"
        ? "text-on-primary"
        : "text-primary";

  return (
    <div className={`relative ${className ?? ""}`} dir="ltr">
      <div ref={holderRef} className="h-full w-full" role="application" aria-label={mode === "brt" ? "نقشه سامانه اتوبوس تندرو تهران" : "نقشه شهری تهران"} />
      {/* دکمه GPS — شناور گوشه نقشه */}
      <button
        type="button"
        onClick={locateMe}
        disabled={busy || !mapReady}
        aria-label="نمایش موقعیت من روی نقشه"
        className={`absolute bottom-4 left-3 z-[500] w-11 h-11 rounded-full bg-surface-container-lowest border border-outline-variant/40 shadow-md flex items-center justify-center active:scale-95 transition-transform ${
          busy || !mapReady ? "opacity-60" : "hover:bg-surface-container"
        }`}
      >
        {busy ? (
          <span
            className="w-4 h-4 border-2 border-primary/25 border-t-primary rounded-full animate-spin"
            aria-hidden
          />
        ) : (
          <MI name={icon} size={22} className={iconColor} fill={locate.kind === "ok"} />
        )}
      </button>
      {/* پیام وضعیت موقعیت — کوتاه، خودکار محو نمی‌شود تا کاربر بخواند */}
      {locate.kind === "error" && (
        <div
          dir="rtl"
          role="status"
          className="absolute top-2 left-2 right-2 z-[500] bg-error/95 text-on-error text-[11px] font-bold rounded-lg px-3 py-2 shadow-md"
        >
          {locate.message}
          <button
            type="button"
            aria-label="بستن"
            className="absolute top-1/2 -translate-y-1/2 left-2 opacity-80 hover:opacity-100"
            onClick={() => setLocate({ kind: "idle" })}
          >
            <MI name="close" size={14} />
          </button>
        </div>
      )}
      {locate.kind === "ok" && (
        <div
          dir="rtl"
          role="status"
          className="absolute top-2 left-2 right-2 z-[500] bg-primary/95 text-on-primary text-[11px] font-bold rounded-lg px-3 py-2 shadow-md"
        >
          {locate.nearName
            ? `نزدیک‌ترین ایستگاه: ${locate.nearName} (${toFa(Math.round(locate.distanceM ?? 0))} متر)`
            : `موقعیت شما نمایش داده شد${locate.accuracyM ? ` — دقت ±${toFa(Math.round(locate.accuracyM))} متر` : ""}`}
          <button
            type="button"
            aria-label="بستن"
            className="absolute top-1/2 -translate-y-1/2 left-2 opacity-80 hover:opacity-100"
            onClick={() => setLocate({ kind: "idle" })}
          >
            <MI name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
