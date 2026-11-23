"use client";

import { useEffect, useState } from "react";
import { nav, useMetro } from "@/lib/store";
import { MI, useTicker } from "../ui";
import { toFa, isWithinService } from "@/lib/metro-data";
import { useAnnouncer } from "../voice";

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

/** تعداد ایستگاه‌های نمایان پیش از باز کردن فهرست کامل */
const STATION_PREVIEW_COUNT = 12;

export default function LineDetailScreen({ lineId }: { lineId: string }) {
  const [data, setData] = useState<LineData | null>(null);
  const [dir, setDir] = useState(0); // جهت حرکت: فهرست مرتب‌شده به سمت line.terminals[dir]
  const [ttOpen, setTtOpen] = useState(true);
  const [allStations, setAllStations] = useState(false);
  const [favPendingId, setFavPendingId] = useState<string | null>(null);
  const now = useTicker(20000);
  const favorites = useMetro((s) => s.favorites);
  const toggleFavoriteLocal = useMetro((s) => s.toggleFavoriteLocal);
  const setFavorites = useMetro((s) => s.setFavorites);
  const { announce, stop, speaking, error: announcerError } = useAnnouncer();

  useEffect(() => {
    let alive = true;
    fetch(`/api/lines/${lineId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: LineData | null) => {
        if (alive && d) setData(d);
      })
      .catch(() => { /* ignore */ });
    return () => {
      alive = false;
    };
  }, [lineId, now]);

  // با تغییر جهت، فهرست کامل ایستگاه‌ها دوباره جمع می‌شود
  useEffect(() => {
    setAllStations(false);
  }, [dir]);

  const toggleStationFav = async (stationId: string) => {
    const isFav = favorites.includes(stationId);
    setFavPendingId(stationId);
    try {
      if (isFav) {
        await fetch(`/api/favorites?stationId=${stationId}`, { method: "DELETE" });
        toggleFavoriteLocal(stationId);
      } else {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stationId }),
        });
        toggleFavoriteLocal(stationId);
      }
      const r: { ids?: string[] } = await fetch("/api/favorites").then((x) => x.json());
      setFavorites(r.ids ?? []);
    } catch {
      /* خطای شبکه نادیده گرفته می‌شود */
    } finally {
      setFavPendingId(null);
    }
  };

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
  const inService = isWithinService(line);
  const dirOffset = dir === 0 ? 0 : 2;
  const visibleStations = allStations ? stations : stations.slice(0, STATION_PREVIEW_COUNT);
  const hasHiddenStations = stations.length > STATION_PREVIEW_COUNT;
  const nextStop = stations.length > 0 ? stations.reduce((a, b) => (b.arrival < a.arrival ? b : a)) : null;

  const statusText = !inService
    ? "خارج از ساعات سرویس‌دهی — قطاری در حرکت نیست"
    : line.status === "normal"
      ? `وضعیت سرویس‌دهی: عادی (فاصله حرکت: ${stats.headwayLabel} دقیقه)`
      : `${stats.crowdLabel} — ${line.status === "delay" ? "تاخیر ۸ دقیقه‌ای" : "ازدحام بالا"}`;
  const statusDot = !inService ? "bg-metro-error" : line.status === "normal" ? "bg-emerald-600" : "bg-amber-500";
  const lineStatusLabel = !inService
    ? "خارج از سرویس"
    : line.status === "normal"
      ? "در حال سرویس"
      : stats.crowdLabel;
  const lineStatusActive = inService && line.status === "normal";

  const handleAnnounce = () => {
    if (speaking) {
      stop();
      return;
    }
    const parts = [
      `${line.name}، سرویس‌دهی از ساعت ${toFa(line.firstTrain)} تا ${toFa(line.lastTrain)}، فاصله قطارها ${stats.headwayLabel} دقیقه.`,
    ];
    if (nextStop) {
      parts.push(`ورود بعدی قطار ${toFa(Math.max(1, nextStop.arrival + dirOffset))} دقیقه دیگر، ایستگاه ${nextStop.name}.`);
    }
    void announce(parts.join(" "));
  };

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-3">
      {/* هدر خط */}
      <section
        aria-label={`جزئیات ${line.name}`}
        className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-4 shadow-sm relative overflow-hidden"
      >
        {/* هاله رنگی خط در بالای کارت */}
        <div
          className="absolute inset-x-0 top-0 h-16 pointer-events-none"
          style={{ background: `linear-gradient(180deg, ${line.color}26 0%, ${line.color}00 100%)` }}
          aria-hidden
        />
        <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: line.color }} aria-hidden />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 shadow-sm"
              style={{ backgroundColor: line.color, color: line.textOnColor || "#fff" }}
            >
              <span className="text-[10px] leading-none opacity-90">خط</span>
              <span className="text-2xl font-extrabold leading-none mt-1">{toFa(line.number)}</span>
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold text-on-surface tracking-tight">خط {toFa(line.number)} مترو</h1>
              <p className="text-xs text-on-surface-variant mt-1 flex items-center gap-1 flex-wrap">
                <span>{line.terminals[0]}</span>
                <MI name="swap_horiz" size={13} className="text-outline" />
                <span>{line.terminals[1]}</span>
              </p>
              <p className="text-[10px] text-outline mt-1 flex items-center gap-1.5 flex-wrap">
                <span>{toFa(stats.stationCount)} ایستگاه</span>
                <span aria-hidden>•</span>
                <span>{toFa(stats.totalMinutes)} دقیقه</span>
                <span aria-hidden>•</span>
                <span>{line.direction}</span>
                {line.badges?.map((b) => (
                  <span key={b} className="bg-primary-fixed/60 text-primary text-[9px] font-bold px-1.5 py-0.5 rounded">
                    {b}
                  </span>
                ))}
              </p>
            </div>
          </div>
          <button
            onClick={() => setTtOpen((o) => !o)}
            aria-label="جدول زمان‌بندی حرکت قطارها"
            className="w-10 h-10 rounded-xl bg-surface-container-low text-primary flex items-center justify-center shrink-0 active:scale-95 transition-all"
          >
            <MI name={ttOpen ? "expand_less" : "schedule"} size={20} />
          </button>
        </div>

        {/* آمار سریع خط */}
        <div className="grid grid-cols-3 mt-3 pt-3 border-t border-outline-variant/20 overflow-hidden rounded-lg">
          <div className="bg-surface-container-low px-1 py-2 flex flex-col items-center justify-center gap-1 border-l border-outline-variant/20">
            <span className="text-[10px] text-outline flex items-center gap-1">
              <MI name="timelapse" size={13} className="text-primary" />
              فاصله قطارها
            </span>
            <span className="text-xs font-bold text-primary leading-none whitespace-nowrap">
              هر {stats.headwayLabel} دقیقه
            </span>
          </div>
          <div className="bg-surface-container-low px-1 py-2 flex flex-col items-center justify-center gap-1 border-l border-outline-variant/20">
            <span className="text-[10px] text-outline flex items-center gap-1">
              <MI name="schedule" size={13} className="text-primary" />
              ساعت سرویس
            </span>
            <span className="text-xs font-bold text-on-surface leading-none dir-ltr whitespace-nowrap">
              {toFa(line.firstTrain)} - {toFa(line.lastTrain)}
            </span>
          </div>
          <div className="bg-surface-container-low px-1 py-2 flex flex-col items-center justify-center gap-1">
            <span className="text-[10px] text-outline flex items-center gap-1">
              <MI name="check_circle" size={13} className={lineStatusActive ? "text-emerald-600" : "text-amber-500"} />
              وضعیت خط
            </span>
            <span
              className={`text-xs font-bold leading-none whitespace-nowrap ${
                lineStatusActive ? "text-emerald-600" : "text-amber-600"
              }`}
            >
              {lineStatusLabel}
            </span>
          </div>
        </div>
      </section>

      {/* ورود بعدی قطار */}
      {nextStop && (
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex w-2.5 h-2.5 shrink-0" aria-hidden>
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40"
                style={{ backgroundColor: line.color }}
              />
              <span className="relative inline-flex w-2.5 h-2.5 rounded-full" style={{ backgroundColor: line.color }} />
            </span>
            <p className="text-[11px] text-on-surface-variant truncate">
              ورود بعدی از ایستگاه: <span className="font-bold text-on-surface">{nextStop.name}</span>،{" "}
              {toFa(Math.max(1, nextStop.arrival + dirOffset))} دقیقه
            </p>
          </div>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
            زنده
          </span>
        </div>
      )}

      {/* تب جهت */}
      <div className="flex items-center gap-1 bg-surface-container-high/60 p-1 rounded-xl" role="tablist" aria-label="جهت حرکت قطارها">
        {[1, 0].map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={dir === d}
            onClick={() => setDir(d)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
              dir === d ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container text-on-surface-variant"
            }`}
          >
            <MI name={d === 1 ? "north" : "south"} size={15} />
            به سمت {line.terminals[d]}
          </button>
        ))}
      </div>

      {/* وضعیت سرویس */}
      <div className="bg-surface-container-low border border-outline-variant/40 rounded-xl px-3.5 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full pulse-dot shrink-0 ${statusDot}`} />
          <span className="text-[11px] text-on-surface truncate">{statusText}</span>
        </div>
        <span className="text-[10px] font-bold text-tertiary dir-ltr shrink-0">
          {toFa(line.firstTrain)} تا {toFa(line.lastTrain)}
        </span>
      </div>

      {/* مسیر ایستگاه‌ها */}
      <section
        aria-label="مسیر ایستگاه‌ها"
        className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4 shadow-sm"
      >
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
          <span className="text-sm font-bold text-on-surface flex items-center gap-1.5">
            <MI name="table_chart" size={18} className="text-primary" />
            مسیر ایستگاه‌ها
          </span>
          <span className="text-[11px] font-bold text-primary bg-primary-fixed/50 px-2.5 py-0.5 rounded-full">
            {toFa(stats.stationCount)} ایستگاه
          </span>
        </div>
        <p className="text-[10px] text-outline mt-2 mb-1">ترتیب حرکت از {stations[0]?.name}</p>

        <div className="relative mt-1">
          {/* ریل عمودی نقطه‌چین خط */}
          <div
            className="absolute right-[11px] top-3 bottom-4 w-0 border-r-2 border-dashed"
            style={{ borderColor: `${line.color}66` }}
            aria-hidden
          />
          {visibleStations.map((s) => {
            const isFav = favorites.includes(s.id);
            return (
              <div key={s.id} className="relative flex items-center">
                {/* نود تایم‌لاین */}
                {s.isInterchange ? (
                  <span
                    title="ایستگاه تقاطعی"
                    className="absolute right-[4px] top-2.5 z-10 w-4 h-4 rounded-full bg-surface-container-lowest flex items-center justify-center"
                    style={{ border: `3px solid ${line.color}`, boxShadow: `0 0 0 3px ${line.color}1a` }}
                  >
                    <span className="w-1 h-1 rounded-full" style={{ backgroundColor: line.color }} />
                  </span>
                ) : (
                  <span
                    className="absolute right-[7px] top-3.5 z-10 w-2.5 h-2.5 rounded-full bg-surface-container-lowest border-2"
                    style={{ borderColor: line.color }}
                  />
                )}

                <button
                  onClick={() => nav.go("station-detail", { stationId: s.id })}
                  className="flex-1 min-w-0 flex items-center justify-between gap-2 pr-8 pl-1 py-2 text-right group active:scale-[0.99] transition-all"
                >
                  <span className="min-w-0 flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-sm truncate ${s.isInterchange ? "font-extrabold text-primary" : "font-bold text-on-surface"}`}
                    >
                      {s.name}
                    </span>
                    {s.isInterchange && (
                      <span className="flex items-center gap-1">
                        {s.otherLines.map((ol) => (
                          <span
                            key={ol.id}
                            title={`ایستگاه تقاطعی با خط ${toFa(ol.number)}`}
                            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border"
                            style={{ backgroundColor: `${ol.color}1a`, color: ol.color, borderColor: `${ol.color}33` }}
                          >
                            خط {toFa(ol.number)}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-bold text-tertiary bg-emerald-500/10 px-2 py-0.5 rounded-lg whitespace-nowrap">
                      {toFa(Math.max(1, s.arrival + dirOffset))} دقیقه
                    </span>
                    <MI
                      name="chevron_left"
                      size={16}
                      className="text-outline-variant group-hover:text-primary transition-colors"
                    />
                  </span>
                </button>

                <button
                  onClick={() => toggleStationFav(s.id)}
                  disabled={favPendingId === s.id}
                  aria-label={isFav ? `حذف ${s.name} از نشان‌شده‌ها` : `افزودن ${s.name} به نشان‌شده‌ها`}
                  aria-pressed={isFav}
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-all ${
                    isFav ? "text-amber-500" : "text-outline hover:text-amber-500"
                  }`}
                >
                  <MI name="star" size={16} fill={isFav} />
                </button>
              </div>
            );
          })}
        </div>

        {hasHiddenStations && (
          <button
            onClick={() => setAllStations((o) => !o)}
            aria-expanded={allStations}
            className="w-full mt-3 py-2 rounded-xl bg-surface-container text-primary text-xs font-bold flex items-center justify-center gap-1 active:scale-[0.99] transition-all"
          >
            {allStations
              ? "نمایش کمتر"
              : `نمایش ${toFa(stations.length - STATION_PREVIEW_COUNT)} ایستگاه باقیمانده تا ${line.terminals[dir]}`}
            <MI name={allStations ? "expand_less" : "expand_more"} size={16} />
          </button>
        )}
      </section>

      {/* جدول زمان‌بندی حرکت قطارها */}
      {ttOpen && (
        <section
          aria-label="جدول زمان‌بندی حرکت قطارها"
          className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-3.5 space-y-2.5 shadow-sm fade-in"
        >
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
            <h3 className="text-xs font-bold text-on-surface flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-primary-fixed/50 text-primary flex items-center justify-center shrink-0">
                <MI name="calendar_month" size={17} />
              </span>
              جدول زمان‌بندی حرکت قطارها
            </h3>
            <span className="text-[10px] text-on-surface-variant dir-ltr shrink-0">
              {toFa(line.firstTrain)} - {toFa(line.lastTrain)}
            </span>
          </div>

          <div className="overflow-hidden border border-outline-variant/30 rounded-xl">
            <table className="w-full text-right text-[10.5px]">
              <thead className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/30">
                <tr>
                  <th className="py-2 pr-2.5 font-medium">جهت</th>
                  <th className="py-2 px-1 text-center font-medium">ساعت کار</th>
                  <th className="py-2 px-1 text-center font-medium">سرفاصله پیک</th>
                  <th className="py-2 pl-2.5 text-left font-medium">سرفاصله عادی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {data.timetable.map((t) => (
                  <tr key={t.direction}>
                    <td className="py-2 pr-2.5 font-bold text-on-surface whitespace-nowrap">{t.direction}</td>
                    <td className="py-2 px-1 text-center text-on-surface-variant dir-ltr whitespace-nowrap">
                      {t.first} - {t.last}
                    </td>
                    <td className="py-2 px-1 text-center text-primary font-bold whitespace-nowrap">{t.headwayPeak}</td>
                    <td className="py-2 pl-2.5 text-left text-on-surface-variant whitespace-nowrap">{t.headwayOff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] text-outline">سرویس‌های پیک و عادی به‌تفکیک جهت حرکت</span>
            <button
              type="button"
              aria-label="نسخه PDF جدول زمان‌بندی (نمایشی)"
              className="text-primary text-[11px] font-medium hover:underline flex items-center gap-1"
            >
              <MI name="picture_as_pdf" size={14} />
              نسخه PDF
            </button>
          </div>
        </section>
      )}

      {/* هشدار مقصد سریع روی این خط */}
      <button
        onClick={() => nav.go("alert", { lineId: line.id })}
        className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3 flex items-center justify-between active:scale-[0.99] transition-all shadow-sm"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary-fixed/50 text-primary flex items-center justify-center">
            <MI name="alarm" size={20} fill />
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-on-surface">هشدار و بیدارباش مقصد</p>
            <p className="text-[10px] text-on-surface-variant mt-0.5">هنگام رسیدن به ایستگاه موردنظر مطلع شوید</p>
          </div>
        </div>
        <MI name="chevron_left" size={18} className="text-outline-variant" />
      </button>

      {/* اکشن پایانی */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => nav.go("planner", { fromStationId: stations[0]?.id })}
          className="flex-1 bg-primary text-on-primary rounded-xl py-3 flex items-center justify-center gap-1.5 text-xs font-bold shadow-sm active:scale-[0.98] transition-all"
        >
          <MI name="near_me" size={16} />
          مسیریابی از این خط
        </button>
        <button
          onClick={handleAnnounce}
          aria-label={speaking ? "توقف پخش صوتی" : "اعلام صوتی اطلاعات خط"}
          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-all shadow-sm ${
            speaking ? "bg-error text-on-error" : "bg-primary/10 text-primary"
          }`}
        >
          <MI name={speaking ? "stop" : "volume_up"} size={20} />
        </button>
      </div>

      {announcerError && <p className="text-center text-[10px] text-error">{announcerError}</p>}

      <p className="text-center text-[10px] text-outline-variant pt-1">
        فاصله قطارها و وضعیت خط به‌صورت زنده بروزرسانی می‌شود
      </p>
    </main>
  );
}
