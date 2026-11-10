"use client";

import { useEffect, useState, useCallback } from "react";
import { nav } from "@/lib/store";
import { MI, LineBadge, useTicker } from "../ui";
import { toFa, isWithinService } from "@/lib/metro-data";

interface StationRow {
  id: string;
  name: string;
  isInterchange: boolean;
  otherLines: { id: string; number: number; name: string; color: string }[];
  arrival: number;
  isFirst: boolean;
  isLast: boolean;
  amenities: string[];
}

interface LineData {
  line: {
    id: string;
    number: number;
    name: string;
    color: string;
    textOnColor: string;
    terminals: [string, string];
    direction: string;
    headway: number;
    firstTrain: string;
    lastTrain: string;
    badges: string[];
    status: string;
  };
  stats: {
    stationCount: number;
    interchangeCount: number;
    totalMinutes: number;
    headwayLabel: string;
    crowdLabel: string;
  };
  timetable: { direction: string; first: string; last: string; headwayPeak: string; headwayOff: string }[];
  stations: StationRow[];
}

export default function LineDetailScreen({ lineId }: { lineId: string }) {
  const [data, setData] = useState<LineData | null>(null);
  const [dir, setDir] = useState(0); // 0 = به سمت terminals[1], 1 = به سمت terminals[0]
  const [ttOpen, setTtOpen] = useState(false);
  const now = useTicker(20000);

  useEffect(() => {
    let alive = true;
    fetch(`/api/lines/${lineId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (alive && d) setData(d);
      })
      .catch(() => { /* ignore */ });
    return () => {
      alive = false;
    };
  }, [lineId, now]);

  if (!data) {
    return (
      <main className="max-w-md mx-auto p-4 space-y-3">
        <div className="h-24 shimmer rounded-2xl" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 shimmer rounded-2xl" />
        ))}
      </main>
    );
  }

  const { line, stats } = data;
  const stations = dir === 0 ? [...data.stations].reverse() : data.stations;

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-3">
      {/* هدر خط */}
      <section
        className="rounded-2xl p-4 text-white shadow-md relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${line.color} 0%, ${line.color}dd 100%)` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-2xl font-extrabold">
              {toFa(line.number)}
            </span>
            <div>
              <h2 className="text-base font-bold flex items-center gap-1.5">
                {line.terminals[0]} ↔ {line.terminals[1]}
                {line.badges?.map((b) => (
                  <span key={b} className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                    {b}
                  </span>
                ))}
              </h2>
              <p className="text-[11px] opacity-85 mt-0.5">{toFa(stats.stationCount)} ایستگاه • {line.direction}</p>
            </div>
          </div>
          <button
            onClick={() => setTtOpen((o) => !o)}
            aria-label="زمان‌بندی حرکت"
            className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center active:scale-95 transition-all"
          >
            <MI name={ttOpen ? "expand_less" : "schedule"} size={22} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-white/12 rounded-xl p-2 text-center">
            <p className="text-[9px] opacity-80">زمان کل سفر</p>
            <p className="text-sm font-bold">{toFa(stats.totalMinutes)} دقیقه</p>
          </div>
          <div className="bg-white/12 rounded-xl p-2 text-center">
            <p className="text-[9px] opacity-80">تعداد ایستگاه</p>
            <p className="text-sm font-bold">{toFa(stats.stationCount)}</p>
          </div>
          <div className="bg-white/12 rounded-xl p-2 text-center">
            <p className="text-[9px] opacity-80">سرفاصله حرکت</p>
            <p className="text-sm font-bold">{stats.headwayLabel} دقیقه</p>
          </div>
        </div>
      </section>

      {/* زمان‌بندی */}
      {ttOpen && (
        <section className="bg-metro-card rounded-2xl border border-metro-outline-var/40 p-3.5 space-y-2 fade-in" aria-label="زمان‌بندی حرکت قطارها">
          <h3 className="text-sm font-bold text-metro-onsurface flex items-center gap-1.5">
            <MI name="schedule" size={18} className="text-metro-primary-c" />
            زمان‌بندی حرکت قطارها
          </h3>
          {data.timetable.map((t) => (
            <div key={t.direction} className="flex items-center justify-between bg-metro-c-low rounded-xl px-3 py-2">
              <div>
                <p className="text-xs font-bold text-metro-onsurface">{t.direction}</p>
                <p className="text-[10px] text-metro-onvar mt-0.5">
                  سرفاصله اوج {t.headwayPeak} • غیر اوج {t.headwayOff}
                </p>
              </div>
              <div className="text-left text-[11px] text-metro-primary font-bold">
                <p>اولین: {t.first}</p>
                <p>آخرین: {t.last}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* وضعیت سرویس */}
      <div className="bg-metro-c-low rounded-xl px-3.5 py-2 flex items-center justify-between border border-metro-outline-var/20">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full pulse-dot shrink-0 ${!isWithinService(line) ? "bg-metro-error" : line.status === "normal" ? "bg-emerald-600" : "bg-amber-500/100"}`} />
          <span className="text-[11px] text-metro-onsurface truncate">
            {!isWithinService(line)
              ? "خارج از ساعات سرویس‌دهی — قطاری در حرکت نیست"
              : line.status === "normal"
                ? "وضعیت سرویس‌دهی: عادی و روان"
                : stats.crowdLabel + " — " + (line.status === "delay" ? "تاخیر ۸ دقیقه‌ای" : "ازدحام بالا")}
          </span>
        </div>
        <span className="text-[11px] text-metro-onvar dir-ltr shrink-0">
          {toFa(line.firstTrain)} تا {toFa(line.lastTrain)}
        </span>
      </div>

      {/* تب جهت */}
      <div className="flex items-center gap-2 bg-metro-card rounded-2xl p-1.5 border border-metro-outline-var/40" role="tablist" aria-label="جهت حرکت">
        {[1, 0].map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={dir === d}
            onClick={() => setDir(d)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all active:scale-95 ${
              dir === d ? "bg-metro-primary-c text-white shadow-sm" : "text-metro-onvar"
            }`}
          >
            <MI name={dir === d ? "north" : "south"} size={15} />
            به سمت {line.terminals[d]}
          </button>
        ))}
      </div>

      {/* لیست ایستگاه‌ها */}
      <section className="bg-metro-card rounded-2xl border border-metro-outline-var/40 p-4" aria-label="لیست ایستگاه‌ها">
        <div className="flex items-center justify-between pb-3 border-b border-metro-outline-var/20 mb-1">
          <span className="text-xs font-bold text-metro-onsurface flex items-center gap-1.5">
            <MI name="format_list_numbered" size={17} className="text-metro-primary-c" />
            لیست ایستگاه‌ها
          </span>
          <span className="text-[10px] text-metro-onvar">ترتیب حرکت از {stations[0]?.name}</span>
        </div>

        {stations.map((s, idx) => (
          <button
            key={s.id}
            onClick={() => nav.go("station-detail", { stationId: s.id })}
            className="w-full flex items-center gap-3 py-2.5 group active:scale-[0.99] transition-all text-right"
          >
            {/* نود خطی */}
            <div className="flex flex-col items-center w-6 shrink-0">
              {idx > 0 && <div className="w-1 flex-1 rounded-full mb-1" style={{ backgroundColor: line.color, opacity: 0.5, minHeight: 10 }} />}
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all group-hover:scale-110 ${s.isInterchange ? "ring-2 ring-white" : ""}`}
                style={{
                  backgroundColor: s.isInterchange ? "#fff" : line.color,
                  borderColor: line.color,
                }}
              >
                {s.isInterchange && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: line.color }} />}
              </div>
              {idx < stations.length - 1 && (
                <div className="w-1 flex-1 rounded-full mt-1" style={{ backgroundColor: line.color, opacity: 0.5, minHeight: 10 }} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-bold text-metro-onsurface truncate">{s.name}</p>
                {s.isInterchange && (
                  <span className="flex items-center gap-0.5">
                    {s.otherLines.map((ol) => (
                      <LineBadge key={ol.id} number={ol.number} color={ol.color} textOn="#fff" size="sm" />
                    ))}
                  </span>
                )}
              </div>
            </div>

            <div className="text-left shrink-0 flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-metro-tertiary bg-emerald-500/10 px-2 py-0.5 rounded-lg">
                {toFa(Math.max(1, s.arrival + (dir === 0 ? 0 : 2)))} دقیقه
              </span>
              <MI name="chevron_left" size={16} className="text-metro-outline-var group-hover:text-metro-primary-c transition-colors" />
            </div>
          </button>
        ))}
      </section>

      {/* هشدار مقصد سریع روی این خط */}
      <button
        onClick={() => nav.go("alert", { lineId: line.id })}
        className="w-full bg-metro-card border border-metro-outline-var/50 rounded-2xl p-3 flex items-center justify-between active:scale-[0.99] transition-all shadow-sm"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-metro-c-high text-metro-primary-c flex items-center justify-center">
            <MI name="alarm" size={20} fill />
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-metro-onsurface">هشدار و بیدارباش مقصد</p>
            <p className="text-[10px] text-metro-onvar mt-0.5">هنگام رسیدن به ایستگاه موردنظر مطلع شوید</p>
          </div>
        </div>
        <MI name="chevron_left" size={18} className="text-metro-outline-var" />
      </button>
    </main>
  );
}
