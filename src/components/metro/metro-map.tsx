"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAP_LINES,
  MAP_STATIONS,
  MAP_STATION_BY_ID,
  MAP_CANVAS,
} from "@/lib/map-geometry";
import { nearestStationTo } from "@/lib/station-geo";
import { LINES, toFa } from "@/lib/metro-data";
import { MI } from "./ui";

/* ============================================================
   نقشه تعاملی مترو — موتور ژست چندلمسی (پینچ/جابجایی بدون خطا)
   + برچسب خوانا با هاله + راهنمای خطوط + موقعیت‌یاب GPS
   ============================================================ */

interface MetroMapProps {
  onStationSelect?: (stationId: string) => void;
  highlightStations?: string[];
  className?: string;
}

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 0.75;
const MAX_SCALE = 3.6;
const TAP_SLOP_PX = 7; // حرکت بیشتر از این = جابجایی، نه لمس ایستگاه

const TEHRAN_LINES = LINES.filter((l) => l.cityId === "tehran");

type LocateState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok"; stationId: string; stationName: string; distanceM: number }
  | { kind: "far" }
  | { kind: "error"; message: string };

export default function MetroMap({
  onStationSelect,
  highlightStations,
  className = "",
}: MetroMapProps) {
  const [t, setT] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const [legendOpen, setLegendOpen] = useState(false);
  const [locate, setLocate] = useState<LocateState>({ kind: "idle" });

  /* ---------- آینه همزمان ترنسفورم — جلوگیری از رقابت با React ---------- */
  const tRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  /* اشاره‌گرهای فعال — پایه ژست چندلمسی */
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const pinchRef = useRef<{
    dist0: number;
    vx0: number;
    vy0: number;
    s0: number;
    tx0: number;
    ty0: number;
  } | null>(null);
  const movedRef = useRef(false); // بعد از جابجایی، تپ ایستگاه نادیده گرفته می‌شود

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  /** ثبت ترنسفورم جدید — همیشه از طریق این تابع */
  const commit = useCallback((next: Transform) => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const half = MAP_CANVAS.w / 2;
    const halfH = MAP_CANVAS.h / 2;
    const tx = clamp(next.tx, half - scale * half - 60, -(half - scale * half) + 60);
    const ty = clamp(next.ty, halfH - scale * halfH - 60, -(halfH - scale * halfH) + 60);
    const fixed = { scale, tx, ty };
    tRef.current = fixed;
    setT(fixed);
  }, []);

  /** تبدیل مختصات صفحه به مختصات viewBox (با احتساب letterbox وضعیت meet) */
  const viewPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { vx: 0, vy: 0 };
    const rect = svg.getBoundingClientRect();
    const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
    const ox = (rect.width - MAP_CANVAS.w * fit) / 2;
    const oy = (rect.height - MAP_CANVAS.h * fit) / 2;
    return {
      vx: (clientX - rect.left - ox) / (fit * tRef.current.scale) - tRef.current.tx / tRef.current.scale,
      vy: (clientY - rect.top - oy) / (fit * tRef.current.scale) - tRef.current.ty / tRef.current.scale,
    };
  }, []);

  /** بزرگ‌نمایی حول یک نقطه صفحه (پیش‌فرض: مرکز) — لنگر ثابت می‌ماند */
  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const t0 = tRef.current;
      const svg = svgRef.current;
      if (!svg) {
        commit({ ...t0, scale: t0.scale * factor });
        return;
      }
      const rect = svg.getBoundingClientRect();
      const cx = clientX ?? rect.left + rect.width / 2;
      const cy = clientY ?? rect.top + rect.height / 2;
      const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
      const ox = (rect.width - MAP_CANVAS.w * fit) / 2;
      const oy = (rect.height - MAP_CANVAS.h * fit) / 2;
      // نقطه لنگر در مختصات viewBox فعلی
      const ax = (cx - rect.left - ox) / fit;
      const ay = (cy - rect.top - oy) / fit;
      const scale = clamp(t0.scale * factor, MIN_SCALE, MAX_SCALE);
      commit({
        scale,
        tx: ax - ((ax - t0.tx) * scale) / t0.scale,
        ty: ay - ((ay - t0.ty) * scale) / t0.scale,
      });
    },
    [commit]
  );

  /* ---------- چرخ ماوس (غیر-Passive تا preventDefault کار کند) ---------- */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.15 : 0.87, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ---------- اشاره‌گرها ---------- */
  const onPointerDown = (e: React.PointerEvent) => {
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* برخی محیط‌ها (رویدادهای ساختگی/WebView) خطای InvalidPointerId می‌دهند */
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      // شروع جابجایی تک‌انگشتی
      movedRef.current = false;
      panRef.current = { startX: e.clientX, startY: e.clientY, tx: tRef.current.tx, ty: tRef.current.ty };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      // شروع پینچ — فاصله و نقطه میانی دو انگشت
      const [p1, p2] = [...pointersRef.current.values()];
      const t0 = tRef.current;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
      const ox = (rect.width - MAP_CANVAS.w * fit) / 2;
      const oy = (rect.height - MAP_CANVAS.h * fit) / 2;
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      pinchRef.current = {
        dist0: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1,
        vx0: (mx - rect.left - ox) / fit,
        vy0: (my - rect.top - oy) / fit,
        s0: t0.scale,
        tx0: t0.tx,
        ty0: t0.ty,
      };
      panRef.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchRef.current && pointersRef.current.size >= 2) {
      // پینچ: مقیاس + حفظ لنگر زیر انگشتان
      const [p1, p2] = [...pointersRef.current.values()];
      const p0 = pinchRef.current;
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
      const ox = (rect.width - MAP_CANVAS.w * fit) / 2;
      const oy = (rect.height - MAP_CANVAS.h * fit) / 2;
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const vxm = (mx - rect.left - ox) / fit;
      const vym = (my - rect.top - oy) / fit;
      const scale = clamp((p0.s0 * dist) / p0.dist0, MIN_SCALE, MAX_SCALE);
      // نقطه میانی اولیه باید زیر انگشتان بماند
      const cx = (p0.vx0 - p0.tx0) / p0.s0;
      const cy = (p0.vy0 - p0.ty0) / p0.s0;
      commit({
        scale,
        tx: vxm - scale * cx,
        ty: vym - scale * cy,
      });
      movedRef.current = true;
      return;
    }

    if (panRef.current && pointersRef.current.size === 1) {
      const p0 = panRef.current;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
      const dx = (e.clientX - p0.startX) / fit;
      const dy = (e.clientY - p0.startY) / fit;
      if (Math.abs(e.clientX - p0.startX) > TAP_SLOP_PX || Math.abs(e.clientY - p0.startY) > TAP_SLOP_PX) {
        movedRef.current = true;
      }
      commit({ scale: tRef.current.scale, tx: p0.tx + dx, ty: p0.ty + dy });
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* قبلاً آزاد شده */
    }
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 1) {
      // یک انگشت باقی مانده — پینچ تمام شده، ادامه با جابجایی
      pinchRef.current = null;
      const [p] = [...pointersRef.current.values()];
      panRef.current = { startX: p.x, startY: p.y, tx: tRef.current.tx, ty: tRef.current.ty };
    } else if (pointersRef.current.size === 0) {
      panRef.current = null;
      pinchRef.current = null;
    }
  };

  /* ---------- مرکز کردن دید روی یک ایستگاه ---------- */
  const zoomToStation = useCallback(
    (sx: number, sy: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
      const scale = 2.2;
      commit({
        scale,
        tx: rect.width / (2 * fit) - scale * sx,
        ty: rect.height / (2 * fit) - scale * sy,
      });
    },
    [commit]
  );

  /* ---------- موقعیت‌یاب GPS ---------- */
  const locateMe = useCallback(() => {
    if (locate.kind === "busy") return;
    if (!("geolocation" in navigator)) {
      setLocate({ kind: "error", message: "مرورگر از موقعیت‌یابی پشتیبانی نمی‌کند" });
      return;
    }
    setLocate({ kind: "busy" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const near = nearestStationTo(latitude, longitude);
        if (!near) {
          setLocate({ kind: "far" });
          return;
        }
        const st = MAP_STATION_BY_ID.get(near.id);
        if (!st) {
          setLocate({ kind: "far" });
          return;
        }
        setLocate({ kind: "ok", stationId: near.id, stationName: near.name, distanceM: near.distanceM });
        // بزرگ‌نمایی روی ایستگاه
        zoomToStation(st.x, st.y);
      },
      (err) => {
        setLocate({
          kind: "error",
          message:
            err.code === err.PERMISSION_DENIED
              ? "دسترسی موقعیت مکانی داده نشد"
              : "موقعیت مکانی در دسترس نیست",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [locate.kind, zoomToStation]);

  const resetView = useCallback(() => {
    commit({ scale: 1, tx: 0, ty: 0 });
    setLocate({ kind: "idle" });
  }, [commit]);

  const highlighted = new Set(highlightStations ?? []);
  if (locate.kind === "ok") highlighted.add(locate.stationId);

  const interchangeIds = new Set(
    MAP_LINES.flatMap((ml) => ml.stations).filter(
      (id) => MAP_LINES.filter((ml) => ml.stations.includes(id)).length > 1
    )
  );

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      {/* لایه SVG نقشه */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_CANVAS.w} ${MAP_CANVAS.h}`}
        className="w-full h-full map-viewport select-none"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        role="img"
        aria-label="نقشه شماتیک شبکه متروی تهران — با دو انگشت بزرگ‌نمایی کنید"
      >
        <defs>
          <pattern id="map-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="var(--mq-map-grid)" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect width={MAP_CANVAS.w} height={MAP_CANVAS.h} fill="var(--mq-map-bg)" />
        <rect width={MAP_CANVAS.w} height={MAP_CANVAS.h} fill="url(#map-grid)" />

        <g transform={`translate(${t.tx} ${t.ty}) scale(${t.scale})`}>
          {/* خطوط */}
          {MAP_LINES.map((ml) => (
            <polyline
              key={ml.lineId}
              points={ml.stations
                .map((id) => {
                  const s = MAP_STATION_BY_ID.get(id);
                  return s ? `${s.x},${s.y}` : "";
                })
                .filter(Boolean)
                .join(" ")}
              fill="none"
              stroke={ml.color}
              strokeWidth={8.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />
          ))}

          {/* ایستگاه‌ها */}
          {MAP_STATIONS.map((s) => {
            const isInter = interchangeIds.has(s.id);
            const isHi = highlighted.has(s.id);
            const r = isInter ? 7.4 : 5.2;
            return (
              <g
                key={s.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (movedRef.current) return; // بعد از جابجایی نقشه، تپ نیست
                  onStationSelect?.(s.id);
                }}
                className="cursor-pointer"
              >
                <circle cx={s.x} cy={s.y} r={16} fill="transparent" />
                {isInter && <circle cx={s.x} cy={s.y} r={r + 3.6} fill="var(--mq-card)" opacity={0.95} />}
                {isHi && <circle cx={s.x} cy={s.y} r={15} fill="#0d58a6" opacity={0.18} className="map-pulse" />}
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={isHi ? 7.5 : r}
                  fill={isHi ? "#0d58a6" : "var(--mq-card)"}
                  stroke={isHi ? "#0d58a6" : "var(--mq-ink)"}
                  strokeWidth={isHi ? 2.4 : 1.8}
                />
                {/* برچسب همیشه نمایان با هاله روشن برای خوانایی */}
                <text
                  x={s.x >= 300 ? s.x - 13 : s.x + 11}
                  y={s.y + 4.3}
                  textAnchor={s.x >= 300 ? "end" : "start"}
                  fontSize={s.label ? 13.2 : 11.2}
                  fontWeight={s.label ? 800 : 600}
                  fill="var(--mq-ink)"
                  stroke="var(--mq-card)"
                  strokeWidth={3.4}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                  style={{ fontFamily: "Vazirmatn, sans-serif" }}
                >
                  {s.name}
                </text>
              </g>
            );
          })}

          {/* شماره خطوط روی سرخط‌ها */}
          {MAP_LINES.map((ml) => {
            const first = MAP_STATION_BY_ID.get(ml.stations[0]);
            const last = MAP_STATION_BY_ID.get(ml.stations[ml.stations.length - 1]);
            if (!first || !last) return null;
            const num = toFa(TEHRAN_LINES.find((l) => l.id === ml.lineId)?.number ?? 0);
            return (
              <g key={`t-${ml.lineId}`}>
                {[first, last].map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x + (p.x > 200 ? -1 : 1) * 15}
                    cy={p.y - 15}
                    r={8}
                    fill={ml.color}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                ))}
                {[first, last].map((p, i) => (
                  <text
                    key={`x-${i}`}
                    x={p.x + (p.x > 200 ? -1 : 1) * 15}
                    y={p.y - 11.6}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight={800}
                    fill={ml.lineId === "l4" ? "#1a1a1a" : "var(--mq-card)"}
                    style={{ fontFamily: "Vazirmatn, sans-serif" }}
                  >
                    {num}
                  </text>
                ))}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ================= کارت راهنمای خطوط (جای دکمه در هر دو حالت ثابت است) ================= */}
      <div className="absolute top-2.5 left-2.5 w-[9.5rem] rounded-xl bg-metro-card/95 backdrop-blur border border-metro-outline-var shadow-md overflow-hidden">
        <button
          onClick={() => setLegendOpen((o) => !o)}
          aria-expanded={legendOpen}
          aria-label={legendOpen ? "بستن راهنمای خطوط" : "نمایش راهنمای خطوط"}
          className="w-full h-9 px-2.5 flex items-center gap-1.5 text-[10px] font-bold text-metro-ink active:bg-surface-container transition-colors"
        >
          <MI name="layers" size={15} className="text-metro-primary-c shrink-0" />
          راهنمای خطوط
          <MI
            name="expand_more"
            size={14}
            className={`text-outline mr-auto transition-transform ${legendOpen ? "rotate-180" : ""}`}
          />
        </button>
        {legendOpen && (
          <div className="fade-in px-2.5 pb-2 grid grid-cols-1 gap-1 border-t border-metro-outline-var/50 pt-1.5">
            {TEHRAN_LINES.map((l) => (
              <div key={l.id} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-[9px] font-semibold text-metro-ink truncate">
                  {l.name} — {l.terminals[0]} / {l.terminals[1]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ================= نتیجه موقعیت‌یاب ================= */}
      {locate.kind === "busy" && (
        <div className="absolute top-2.5 right-2.5 bg-metro-card/95 backdrop-blur rounded-full shadow-md border border-metro-outline-var px-3 py-1.5 flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 border-2 border-metro-primary-c/30 border-t-metro-primary-c rounded-full animate-spin" />
          <span className="text-[10px] font-bold text-metro-ink">در حال یافتن موقعیت...</span>
        </div>
      )}
      {locate.kind === "ok" && (
        <div className="fade-in absolute top-2.5 right-2.5 max-w-[70%] bg-metro-card/95 backdrop-blur rounded-xl shadow-md border border-metro-outline-var px-3 py-1.5 flex items-center gap-2">
          <MI name="near_me" size={15} className="text-metro-primary-c shrink-0" />
          <span className="text-[10px] font-bold text-metro-ink truncate">
            نزدیک‌ترین ایستگاه: {locate.stationName} (حدود {toFa(Math.round(locate.distanceM / 50) * 50)} متر)
          </span>
          <button
            onClick={() => setLocate({ kind: "idle" })}
            aria-label="بستن"
            className="text-outline shrink-0 active:scale-90 transition-transform"
          >
            <MI name="close" size={13} />
          </button>
        </div>
      )}
      {(locate.kind === "far" || locate.kind === "error") && (
        <div className="fade-in absolute top-2.5 right-2.5 max-w-[70%] bg-metro-card/95 backdrop-blur rounded-xl shadow-md border border-error/40 px-3 py-1.5 flex items-center gap-2">
          <MI name="location_off" size={15} className="text-error shrink-0" />
          <span className="text-[10px] font-bold text-metro-ink">
            {locate.kind === "far" ? "در محدوده ایستگاه‌های مترو نیستید" : locate.message}
          </span>
          <button
            onClick={() => setLocate({ kind: "idle" })}
            aria-label="بستن"
            className="text-outline shrink-0 active:scale-90 transition-transform"
          >
            <MI name="close" size={13} />
          </button>
        </div>
      )}

      {/* ================= کنترل‌های شناور (بزرگ‌نمایی + موقعیت) ================= */}
      <div className="absolute bottom-2.5 left-2.5 flex flex-col gap-1.5">
        <button
          onClick={locateMe}
          aria-label="نزدیک‌ترین ایستگاه به من"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="my_location" size={18} />
        </button>
        <button
          onClick={() => zoomAt(1.25)}
          aria-label="بزرگ‌نمایی"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="add" size={18} />
        </button>
        <button
          onClick={() => zoomAt(0.8)}
          aria-label="کوچک‌نمایی"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="remove" size={18} />
        </button>
        <button
          onClick={resetView}
          aria-label="بازگشت به نمای کامل"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="center_focus_strong" size={18} />
        </button>
      </div>
    </div>
  );
}
