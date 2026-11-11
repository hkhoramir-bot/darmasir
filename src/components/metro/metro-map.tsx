"use client";

import { useRef, useState, useCallback } from "react";
import {
  MAP_LINES,
  MAP_STATIONS,
  MAP_STATION_BY_ID,
  MAP_CANVAS,
} from "@/lib/map-geometry";
import { LINES, toFa } from "@/lib/metro-data";
import { MI } from "./ui";

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

const TEHRAN_LINES = LINES.filter((l) => l.cityId === "tehran");

export default function MetroMap({ onStationSelect, highlightStations, className = "" }: MetroMapProps) {
  const [t, setT] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const [legendOpen, setLegendOpen] = useState(true);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const applyZoom = useCallback((factor: number) => {
    setT((prev) => {
      const scale = clamp(prev.scale * factor, 0.75, 3.2);
      const k = scale / prev.scale;
      return { scale, tx: prev.tx * k, ty: prev.ty * k };
    });
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      applyZoom(e.deltaY < 0 ? 1.15 : 0.87);
    },
    [applyZoom]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, tx: t.tx, ty: t.ty };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.x) / t.scale;
    const dy = (e.clientY - dragRef.current.y) / t.scale;
    setT((prev) => ({ ...prev, tx: dragRef.current!.tx + dx, ty: dragRef.current!.ty + dy }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const highlighted = new Set(highlightStations ?? []);
  const interchangeIds = new Set(
    MAP_LINES.flatMap((ml) => ml.stations).filter((id) => MAP_LINES.filter((ml) => ml.stations.includes(id)).length > 1)
  );

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      {/* لایه SVG نقشه */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_CANVAS.w} ${MAP_CANVAS.h}`}
        className="w-full h-full map-viewport select-none"
        style={{ touchAction: "none" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        role="img"
        aria-label="نقشه شماتیک شبکه متروی تهران"
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
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />
          ))}

          {/* ایستگاه‌ها */}
          {MAP_STATIONS.map((s) => {
            const isInter = interchangeIds.has(s.id);
            const isHi = highlighted.has(s.id);
            const r = isInter ? 6.2 : 4.2;
            return (
              <g
                key={s.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onStationSelect?.(s.id);
                }}
                className="cursor-pointer"
              >
                <circle cx={s.x} cy={s.y} r={13} fill="transparent" />
                {isInter && <circle cx={s.x} cy={s.y} r={r + 3} fill="var(--mq-card)" opacity={0.9} />}
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={isHi ? 6 : r}
                  fill={isHi ? "#0d58a6" : "var(--mq-card)"}
                  stroke={isHi ? "var(--mq-card)" : "var(--mq-ink)"}
                  strokeWidth={isHi ? 2 : 1.6}
                />
                {isHi && <circle cx={s.x} cy={s.y} r={11} fill="#0d58a6" opacity={0.22} />}
                {(s.label || t.scale > 1.7) && (
                  <text
                    x={s.x >= 300 ? s.x - 10 : s.x + 9}
                    y={s.y + 3.5}
                    textAnchor={s.x >= 300 ? "end" : "start"}
                    fontSize={s.label ? 10 : 8.5}
                    fontWeight={s.label ? 700 : 500}
                    fill="var(--mq-ink)"
                    style={{ fontFamily: "Vazirmatn, sans-serif" }}
                  >
                    {s.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* شماره خطوط روی ترمینال‌ها */}
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
                    cx={p.x + (p.x > 200 ? -1 : 1) * 13}
                    cy={p.y - 13}
                    r={7}
                    fill={ml.color}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                ))}
                {[first, last].map((p, i) => (
                  <text
                    key={`x-${i}`}
                    x={p.x + (p.x > 200 ? -1 : 1) * 13}
                    y={p.y - 10.2}
                    textAnchor="middle"
                    fontSize={8.5}
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

      {/* راهنمای خطوط */}
      <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
        <button
          onClick={() => setLegendOpen((o) => !o)}
          aria-label="راهنمای خطوط"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="layers" size={18} />
        </button>
        {legendOpen && (
          <div className="fade-in bg-metro-card/95 backdrop-blur rounded-xl border border-metro-outline-var shadow-md p-2 grid grid-cols-1 gap-1">
            {TEHRAN_LINES.map((l) => (
              <div key={l.id} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-[9px] font-semibold text-metro-onvar">
                  {l.name} — {l.terminals[0]} / {l.terminals[1]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* کنترل‌های زوم */}
      <div className="absolute bottom-2 left-2 flex flex-col gap-1.5">
        <button
          onClick={() => applyZoom(1.25)}
          aria-label="بزرگ‌نمایی"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="add" size={18} />
        </button>
        <button
          onClick={() => applyZoom(0.8)}
          aria-label="کوچک‌نمایی"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="remove" size={18} />
        </button>
        <button
          onClick={() => setT({ scale: 1, tx: 0, ty: 0 })}
          aria-label="بازگشت به مرکز"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="my_location" size={18} />
        </button>
      </div>
    </div>
  );
}
