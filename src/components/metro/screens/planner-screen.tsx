"use client";

import { useEffect, useState, useCallback } from "react";
import { nav, useMetro } from "@/lib/store";
import { MI, useTicker } from "../ui";
import { StationPickerSheet } from "../station-picker";
import {
  toFa,
  faMoney,
  isWithinService,
  getLine,
  getStation,
  headwayAt,
} from "@/lib/metro-data";

interface RouteLeg {
  lineId: string;
  lineName: string;
  color: string;
  textOnColor: string;
  fromName: string;
  toName: string;
  stationNames: string[];
  stops: number;
  minutes: number;
}

interface Plan {
  legs: RouteLeg[];
  totalMinutes: number;
  totalStations: number;
  transfers: number;
  transferStations: string[];
  fare: number;
  pref: string;
  crowdNote: string;
}

const PREFS = [
  { key: "fastest", label: "سریع‌ترین (پیشنهادی)", icon: "bolt" },
  { key: "least_transfers", label: "کمترین تعویض خط", icon: "sync_alt" },
  { key: "quietest", label: "خلوت‌ترین مسیر", icon: "airline_seat_recline_normal" },
] as const;

export default function PlannerScreen({
  initialFrom,
  initialTo,
  initialPref,
}: {
  initialFrom?: string;
  initialTo?: string;
  initialPref?: "fastest" | "least_transfers" | "quietest";
}) {
  const [from, setFrom] = useState<{ id: string; name: string } | null>(
    initialFrom ? { id: initialFrom, name: "..." } : null
  );
  const [to, setTo] = useState<{ id: string; name: string } | null>(
    initialTo ? { id: initialTo, name: "..." } : null
  );
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [pref, setPref] = useState<"fastest" | "least_transfers" | "quietest">(initialPref ?? "fastest");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [shared, setShared] = useState(false);
  const now = useTicker(30000);

  // resolve initial names
  useEffect(() => {
    if (initialFrom && initialTo) {
      fetch(`/api/search?ids=${initialFrom},${initialTo}`)
        .then((r) => r.json())
        .then((d) => {
          const map = new Map<string, string>(
            ((d.stations ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])
          );
          setFrom((f) => (f ? { ...f, name: map.get(initialFrom) ?? f.name } : f));
          setTo((t) => (t ? { ...t, name: map.get(initialTo) ?? t.name } : t));
        })
        .catch(() => {});
    } else if (initialFrom) {
      fetch(`/api/search?ids=${initialFrom}`)
        .then((r) => r.json())
        .then((d) => {
          const s = (d.stations ?? [])[0];
          if (s) setFrom({ id: s.id, name: s.name });
        })
        .catch(() => {});
    } else if (initialTo) {
      fetch(`/api/search?ids=${initialTo}`)
        .then((r) => r.json())
        .then((d) => {
          const s = (d.stations ?? [])[0];
          if (s) setTo({ id: s.id, name: s.name });
        })
        .catch(() => {});
    }
  }, [initialFrom, initialTo]);

  const compute = useCallback(async () => {
    if (!from || !to || from.id === to.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/route-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: from.id, toId: to.id, pref }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "خطا در محاسبه مسیر");
        setPlan(null);
      } else {
        setPlan(data.plan);
      }
    } catch {
      setError("ارتباط با سرور برقرار نشد");
    } finally {
      setLoading(false);
    }
  }, [from, to, pref]);

  useEffect(() => {
    compute();
  }, [compute, now]);

  const swap = () => {
    setSwapped((s) => !s);
    const f = from;
    setFrom(to);
    setTo(f);
    setPlan(null);
  };

  const saveDaily = async (kind: "home" | "work") => {
    if (!from || !to) return;
    await fetch("/api/daily-routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, fromStationId: from.id, toStationId: to.id }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const startTrip = async () => {
    if (!from || !to) return;
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromStationId: from.id, toStationId: to.id, pref }),
    });
    nav.go("alert", { fromStationId: from.id, toStationId: to.id });
  };

  const shareRoute = async () => {
    if (!plan || !from || !to) return;
    const text = `مسیر من با درمسیر: ${from.name} ← ${to.name} • ${toFa(plan.totalMinutes)} دقیقه • ${
      plan.transfers > 0 ? `${toFa(plan.transfers)} تعویض خط` : "بدون تعویض خط"
    } • کرایه ${faMoney(plan.fare)} تومان`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "درمسیر", text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setShared(true);
        setTimeout(() => setShared(false), 2200);
      }
    } catch {
      /* کاربر لغو کرد */
    }
  };

  // سرفاصله قطار خط اول مسیر در لحظه — از جدول حرکت رسمی
  const firstLeg = plan?.legs[0] ?? null;
  const nowDate = new Date(now);
  const originHeadway =
    firstLeg && from ? headwayAt(getLine(firstLeg.lineId), nowDate.getHours() * 60 + nowDate.getMinutes()) : undefined;
  const lastLeg = plan && plan.legs.length > 0 ? plan.legs[plan.legs.length - 1] : null;

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-3">
      {/* انتخاب مبدأ و مقصد */}
      <section className="bg-metro-card border border-metro-outline-var/30 rounded-2xl p-3.5 shadow-sm space-y-3">
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex-1 space-y-2 min-w-0">
            <button
              onClick={() => setPicker("from")}
              aria-label="انتخاب ایستگاه مبدأ"
              className="w-full flex items-center gap-2.5 bg-metro-c-low px-3 py-2 rounded-xl border border-metro-outline-var/20 active:scale-[0.99] transition-all text-right"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" aria-hidden />
              <span className="flex-1 min-w-0 flex flex-col items-start text-right">
                <span className="text-[9px] leading-none text-metro-outline">ایستگاه مبدأ</span>
                <span
                  className={`mt-0.5 text-xs font-medium truncate max-w-full ${
                    from ? "text-metro-onsurface" : "text-metro-outline"
                  }`}
                >
                  {from ? from.name : "انتخاب مبدأ"}
                </span>
              </span>
              <StationLineChips id={from?.id} />
              <MI name="my_location" size={15} className="text-metro-outline shrink-0" />
            </button>
            <button
              onClick={() => setPicker("to")}
              aria-label="انتخاب ایستگاه مقصد"
              className="w-full flex items-center gap-2.5 bg-metro-c-low px-3 py-2 rounded-xl border border-metro-outline-var/20 active:scale-[0.99] transition-all text-right"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-metro-secondary shrink-0" aria-hidden />
              <span className="flex-1 min-w-0 flex flex-col items-start text-right">
                <span className="text-[9px] leading-none text-metro-outline">ایستگاه مقصد</span>
                <span
                  className={`mt-0.5 text-xs font-medium truncate max-w-full ${
                    to ? "text-metro-onsurface" : "text-metro-outline"
                  }`}
                >
                  {to ? to.name : "انتخاب مقصد"}
                </span>
              </span>
              <StationLineChips id={to?.id} />
              <MI name="place" size={15} className="text-metro-outline shrink-0" />
            </button>
          </div>
          <button
            onClick={swap}
            aria-label="جابجایی مبدأ و مقصد"
            className="w-10 h-10 rounded-full bg-metro-card text-metro-primary border border-metro-outline-var/40 flex items-center justify-center active:scale-95 transition-all shrink-0 shadow-sm"
          >
            <MI name="sync_alt" size={18} />
          </button>
        </div>

        {/* تب پیشفرض‌ها */}
        <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar" role="tablist">
          {PREFS.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={pref === p.key}
              onClick={() => setPref(p.key)}
              className={`flex-1 py-1.5 px-2 rounded-xl text-[10.5px] font-bold text-center whitespace-nowrap transition-all active:scale-95 flex items-center justify-center gap-1 ${
                pref === p.key
                  ? "bg-metro-primary-c text-white shadow-sm"
                  : "bg-metro-c-low text-metro-onvar border border-metro-outline-var/20"
              }`}
            >
              <MI name={p.icon} size={13} />
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* حالت‌ها */}
      {loading && !plan && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 shimmer rounded-2xl" />
            ))}
          </div>
          <div className="h-64 shimmer rounded-2xl" />
        </div>
      )}

      {error && (
        <div className="bg-metro-error-c border border-metro-error/20 rounded-2xl p-4 text-center">
          <MI name="error" size={26} className="text-metro-error mx-auto" />
          <p className="text-xs text-metro-error font-bold mt-1.5">{error}</p>
        </div>
      )}

      {plan && (
        <>
          {/* نتیجه مسیریابی با خلاصه سفر */}
          <section
            className="bg-metro-card border border-metro-outline-var/30 rounded-2xl p-3.5 shadow-sm space-y-3"
            aria-label="نتیجه مسیریابی با خلاصه سفر"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0">
                <MI name="route" size={17} className="text-metro-primary shrink-0" />
                <h2 className="text-[13px] font-bold text-metro-onsurface truncate">
                  نتیجه مسیریابی با خلاصه سفر
                </h2>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-full text-[9px] px-2 py-0.5 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden />
                  سرویس‌دهی عالی
                </span>
                <span className="bg-metro-fixed/60 dark:bg-metro-c text-metro-primary rounded-full text-[9px] px-2 py-0.5 font-bold flex items-center gap-0.5">
                  <MI name="schedule" size={11} />
                  {toFa(plan.totalMinutes)} دقیقه
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2" aria-label="خلاصه مسیر">
              <StatTile label="زمان تقریبی" value={`${toFa(plan.totalMinutes)}`} unit="دقیقه" tone="primary" />
              <StatTile label="تعداد ایستگاه" value={`${toFa(plan.totalStations)}`} unit="ایستگاه" />
              <StatTile
                label="تعویض خط"
                value={plan.transfers > 0 ? `${toFa(plan.transfers)} بار` : "بدون تعویض"}
                unit={plan.transfers > 0 ? `(${plan.transferStations.map((t) => t).join("، ")})` : "مستقیم"}
              />
            </div>

            {/* وضعیت و کرایه */}
            <div className="bg-metro-c-low rounded-xl px-3 py-2 flex items-center justify-between border border-metro-outline-var/20">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" aria-hidden />
                <span className="text-[11px] text-metro-onsurface truncate">{plan.crowdNote}</span>
              </div>
              <div className="flex items-center gap-1 text-metro-primary shrink-0">
                <MI name="payments" size={15} />
                <span className="text-[11px] font-bold">{faMoney(plan.fare)} تومان</span>
              </div>
            </div>
          </section>

          {/* هشدار ساعات سرویس */}
          {plan.legs.some((l) => !isWithinService(getLine(l.lineId))) && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
              <MI name="bedtime" size={17} className="text-amber-600 shrink-0" />
              <span className="text-[11px] text-amber-500 dark:text-amber-400">
                یکی از خطوط این مسیر خارج از ساعات سرویس‌دهی است؛ اولین قطار فردا صبح حرکت می‌کند.
              </span>
            </div>
          )}

          {/* گام‌به‌گام */}
          <section
            className="bg-metro-card rounded-2xl border border-metro-outline-var/30 p-4 shadow-sm"
            aria-label="جزئیات گام‌به‌گام مسیر"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-metro-outline-var/20 mb-3.5">
              <div className="flex items-center gap-2">
                <MI name="route" size={17} className="text-metro-primary" />
                <span className="text-[13px] font-bold text-metro-onsurface">جزئیات گام‌به‌گام مسیر</span>
              </div>
              <span className="text-[10px] bg-metro-fixed/40 dark:bg-metro-c px-2.5 py-0.5 rounded-full text-metro-primary font-medium">
                {PREFS.find((p) => p.key === plan.pref)?.label}
              </span>
            </div>

            <div className="relative">
              {plan.legs.map((leg, i) => (
                <div key={i}>
                  <LegBlock
                    leg={leg}
                    first={i === 0}
                    originName={i === 0 ? from?.name ?? leg.fromName : undefined}
                    originHeadway={i === 0 ? originHeadway : undefined}
                  />
                  {i < plan.legs.length - 1 && (
                    <TransferStep name={plan.transferStations[i]} nextLeg={plan.legs[i + 1]} />
                  )}
                </div>
              ))}
              <DestinationStep name={lastLeg?.toName ?? to?.name ?? "مقصد"} leg={lastLeg} />
            </div>
          </section>

          {/* اکشن‌ها */}
          <section className="space-y-2" aria-label="عملیات مسیر">
            <button
              onClick={startTrip}
              className="w-full bg-metro-primary-c text-white text-[13px] font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all"
            >
              <MI name="near_me" size={17} fill />
              شروع مسیریابی زنده
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => saveDaily(swapped ? "work" : "home")}
                className="py-2.5 bg-metro-card border border-metro-outline-var/40 text-metro-primary rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
              >
                <MI name={saved ? "check_circle" : "bookmark_add"} size={15} />
                {saved ? "ذخیره شد" : "ذخیره"}
              </button>
              <button
                onClick={() => nav.go("map", { fromStationId: from?.id, toStationId: to?.id })}
                className="py-2.5 bg-metro-card border border-metro-outline-var/40 text-metro-primary rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
              >
                <MI name="map" size={15} />
                نقشه شبکه
              </button>
              <button
                onClick={shareRoute}
                className="py-2.5 bg-metro-card border border-metro-outline-var/40 text-metro-primary rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
              >
                <MI name={shared ? "check" : "share"} size={15} />
                {shared ? "کپی شد" : "اشتراک"}
              </button>
            </div>
          </section>
        </>
      )}

      {!plan && !loading && !error && (
        <div className="bg-metro-card rounded-2xl border border-dashed border-metro-outline-var p-6 text-center">
          <MI name="route" size={34} className="text-metro-fixed-dim mx-auto" fill />
          <p className="text-xs text-metro-onvar mt-2">مبدأ و مقصد را انتخاب کنید تا بهترین مسیر محاسبه شود</p>
        </div>
      )}

      <StationPickerSheet
        open={picker === "from"}
        title="انتخاب مبدأ"
        excludeId={to?.id}
        onClose={() => setPicker(null)}
        onSelect={(id, name) => setFrom({ id, name })}
      />
      <StationPickerSheet
        open={picker === "to"}
        title="انتخاب مقصد"
        excludeId={from?.id}
        onClose={() => setPicker(null)}
        onSelect={(id, name) => setTo({ id, name })}
      />
    </main>
  );
}

/* ---------------- نشان‌های خط ایستگاه انتخاب‌شده ---------------- */
function StationLineChips({ id }: { id?: string | null }) {
  if (!id) return null;
  const st = getStation(id);
  if (!st) return null;
  return (
    <span className="flex items-center -space-x-1 space-x-reverse shrink-0" aria-hidden>
      {st.lines.slice(0, 3).map((l) => {
        const line = getLine(l.lineId);
        return (
          <span
            key={l.lineId}
            className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold border border-white/80 shadow-sm"
            style={{ backgroundColor: line.color, color: line.textOnColor }}
          >
            {toFa(line.number)}
          </span>
        );
      })}
    </span>
  );
}

function StatTile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "primary";
}) {
  return (
    <div className="bg-metro-card border border-metro-outline-var/30 rounded-xl p-3 text-center shadow-sm flex flex-col justify-between h-24">
      <span className="text-[10px] text-metro-outline">{label}</span>
      <div
        className={`text-base font-bold ${
          tone === "primary" ? "text-metro-primary" : "text-metro-onsurface"
        } flex items-center justify-center gap-1`}
      >
        {value}
        <span className="text-[10px] font-normal text-metro-outline">{unit}</span>
      </div>
    </div>
  );
}

/* ---------------- لگ مسیر: سوار شدن + ایستگاه‌های عبوری ---------------- */
function LegBlock({
  leg,
  first = false,
  originName,
  originHeadway,
}: {
  leg: RouteLeg;
  first?: boolean;
  originName?: string;
  originHeadway?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex gap-3 pb-4">
      {/* ستون خط زمانی با نشان رنگی خط */}
      <div className="flex flex-col items-center shrink-0 w-6" aria-hidden>
        <div
          className="w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[10px] font-bold z-10"
          style={{ backgroundColor: leg.color, color: leg.textOnColor }}
        >
          {toFa(getLine(leg.lineId).number)}
        </div>
        <div className="w-1 flex-1 rounded-full mt-1" style={{ backgroundColor: `${leg.color}66` }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-bold text-metro-onsurface truncate">
              {first ? (originName ?? leg.fromName) : `سوار شدن در ${leg.lineName}`}
            </span>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
              style={{ backgroundColor: `${leg.color}1F`, color: leg.color }}
            >
              {leg.lineName}
            </span>
          </div>
          {first ? (
            <span className="text-[9px] font-bold bg-metro-fixed/60 dark:bg-metro-c text-metro-primary px-2 py-0.5 rounded-full shrink-0">
              مبدأ
            </span>
          ) : (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
              style={{ backgroundColor: leg.color, color: leg.textOnColor }}
            >
              {toFa(leg.minutes)} دقیقه
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-[11px] text-metro-onvar truncate">
            {first ? "به سمت" : "جهت حرکت: به سمت"} {leg.toName}
          </span>
          {first && typeof originHeadway === "number" && (
            <span className="text-[9px] font-bold text-metro-primary bg-metro-c-low border border-metro-outline-var/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shrink-0">
              <MI name="schedule" size={11} />
              سرفاصله قطار: {toFa(originHeadway)} دقیقه
            </span>
          )}
        </div>

        {/* ایستگاه‌های عبوری */}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full mt-1.5 bg-metro-c-low hover:bg-metro-c rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[10.5px] text-metro-onvar transition-colors"
        >
          <span className="truncate">
            {toFa(leg.stops)} ایستگاه عبوری ({toFa(leg.minutes)} دقیقه)
          </span>
          <MI name={open ? "expand_less" : "expand_more"} size={14} className="text-metro-outline shrink-0" />
        </button>
        {open && (
          <ul className="mt-1.5 mr-3 pr-3 space-y-1 border-r-2" style={{ borderColor: `${leg.color}55` }}>
            {leg.stationNames.map((n, i) => (
              <li key={i} className="text-[10px] text-metro-onvar flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: leg.color }} aria-hidden />
                <span className="truncate">{n}</span>
                {i === 0 && <span className="text-[8.5px] text-metro-outline shrink-0">(سوار می‌شوید)</span>}
                {i === leg.stationNames.length - 1 && (
                  <span className="text-[8.5px] text-metro-outline shrink-0">(پیاده می‌شوید)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------- نود تعویض خط ---------------- */
function TransferStep({ name, nextLeg }: { name?: string; nextLeg?: RouteLeg }) {
  return (
    <div className="relative flex gap-3 pb-4">
      <div className="flex flex-col items-center shrink-0 w-6" aria-hidden>
        <div className="w-6 h-6 rounded-full bg-metro-card border border-metro-outline-var flex items-center justify-center text-metro-primary z-10 shadow-sm">
          <MI name="sync_alt" size={13} />
        </div>
        {nextLeg && (
          <div className="w-1 flex-1 rounded-full mt-1" style={{ backgroundColor: `${nextLeg.color}66` }} />
        )}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-bold text-metro-onsurface truncate">{name ?? "ایستگاه تقاطعی"}</span>
            <span className="text-[9px] font-bold bg-metro-c text-metro-onvar px-1.5 py-0.5 rounded shrink-0">
              تعویض خط
            </span>
          </div>
          {nextLeg && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
              style={{ backgroundColor: `${nextLeg.color}1F`, color: nextLeg.color }}
            >
              {nextLeg.lineName}
            </span>
          )}
        </div>
        <p className="text-[10px] text-metro-outline mt-0.5">
          ۴ دقیقه پیاده‌روی تا سکوی {nextLeg ? nextLeg.lineName : "خط بعدی"}
        </p>
      </div>
    </div>
  );
}

/* ---------------- نود مقصد ---------------- */
function DestinationStep({ name, leg }: { name?: string; leg?: RouteLeg | null }) {
  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center shrink-0 w-6" aria-hidden>
        {leg ? (
          <div
            className="w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[10px] font-bold z-10"
            style={{ backgroundColor: leg.color, color: leg.textOnColor }}
          >
            {toFa(getLine(leg.lineId).number)}
          </div>
        ) : (
          <div className="w-6 h-6 rounded-full bg-metro-secondary flex items-center justify-center text-white z-10">
            <MI name="place" size={13} fill />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold text-metro-onsurface truncate">{name ?? "مقصد"}</span>
          <span className="text-[9px] font-bold bg-metro-secondary text-white px-2 py-0.5 rounded-full shrink-0">
            مقصد نهایی
          </span>
        </div>
      </div>
    </div>
  );
}
