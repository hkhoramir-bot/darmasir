"use client";

import { useEffect, useState, useCallback } from "react";
import { nav, useMetro } from "@/lib/store";
import { MI, useTicker } from "../ui";
import { StationPickerSheet } from "../station-picker";
import { toFa, faMoney } from "@/lib/metro-data";

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

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-3">
      {/* انتخاب مبدأ و مقصد */}
      <section className="bg-white border border-metro-outline-var/30 rounded-2xl p-3.5 shadow-sm space-y-3">
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex-1 space-y-2 min-w-0">
            <button
              onClick={() => setPicker("from")}
              className="w-full flex items-center gap-2.5 bg-metro-c-low px-3 py-2 rounded-xl border border-metro-outline-var/20 active:scale-[0.99] transition-all text-right"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className={`flex-1 text-xs font-medium truncate ${from ? "text-metro-onsurface" : "text-metro-outline"}`}>
                {from ? from.name : "انتخاب مبدأ"}
              </span>
              <MI name="my_location" size={16} className="text-metro-outline shrink-0" />
            </button>
            <button
              onClick={() => setPicker("to")}
              className="w-full flex items-center gap-2.5 bg-metro-c-low px-3 py-2 rounded-xl border border-metro-outline-var/20 active:scale-[0.99] transition-all text-right"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-metro-secondary flex-shrink-0" />
              <span className={`flex-1 text-xs font-medium truncate ${to ? "text-metro-onsurface" : "text-metro-outline"}`}>
                {to ? to.name : "انتخاب مقصد"}
              </span>
              <MI name="place" size={16} className="text-metro-outline shrink-0" />
            </button>
          </div>
          <button
            onClick={swap}
            aria-label="جابجایی مبدأ و مقصد"
            className="w-10 h-10 rounded-xl bg-metro-c hover:bg-metro-c-high text-metro-primary flex items-center justify-center border border-metro-outline-var/30 active:scale-95 transition-all flex-shrink-0 shadow-sm"
          >
            <MI name="swap_vert" size={18} />
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
                  ? "bg-metro-primary text-white shadow-sm"
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
          {/* خلاصه */}
          <section className="grid grid-cols-3 gap-2" aria-label="خلاصه مسیر">
            <StatTile label="زمان تقریبی" value={`${toFa(plan.totalMinutes)}`} unit="دقیقه" tone="primary" />
            <StatTile label="تعداد ایستگاه" value={`${toFa(plan.totalStations)}`} unit="ایستگاه" />
            <StatTile
              label="تعویض خط"
              value={plan.transfers > 0 ? `${toFa(plan.transfers)} بار` : "بدون تعویض"}
              unit={plan.transfers > 0 ? `(${plan.transferStations.map((t) => t).join("، ")})` : "مستقیم"}
            />
          </section>

          {/* وضعیت و کرایه */}
          <div className="bg-metro-c-low rounded-xl px-3.5 py-2.5 flex items-center justify-between border border-metro-outline-var/20">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
              <span className="text-[11px] text-metro-onsurface truncate">{plan.crowdNote}</span>
            </div>
            <div className="flex items-center gap-1 text-metro-primary shrink-0">
              <MI name="payments" size={15} />
              <span className="text-[11px] font-bold">{faMoney(plan.fare)} تومان</span>
            </div>
          </div>

          {/* گام‌به‌گام */}
          <section className="bg-white rounded-2xl border border-metro-outline-var/30 p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-metro-outline-var/20 mb-4">
              <div className="flex items-center gap-2">
                <MI name="route" size={19} className="text-metro-primary" />
                <span className="text-sm font-bold text-metro-onsurface">جزئیات گام‌به‌گام مسیر</span>
              </div>
              <span className="text-[10px] bg-metro-c px-2 py-0.5 rounded-full text-metro-primary font-medium">
                {PREFS.find((p) => p.key === plan.pref)?.label}
              </span>
            </div>

            <div className="relative">
              {/* مبدأ */}
              <Step origin first />
              {/* لگ‌ها */}
              {plan.legs.map((leg, i) => (
                <div key={i}>
                  <LegBlock leg={leg} now={now} />
                  {i < plan.legs.length - 1 && <Step transfer name={plan.transferStations[i]} />}
                </div>
              ))}
              {/* مقصد */}
              <Step destination />
            </div>
          </section>

          {/* اکشن‌ها */}
          <section className="grid grid-cols-2 gap-2">
            <button
              onClick={startTrip}
              className="py-2.5 bg-metro-primary-c text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-metro-primary active:scale-95 transition-all"
            >
              <MI name="near_me" size={17} fill />
              شروع سفر و هشدار مقصد
            </button>
            <button
              onClick={() => saveDaily(swapped ? "work" : "home")}
              className="py-2.5 bg-white border border-metro-outline-var/50 text-metro-primary rounded-2xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <MI name={saved ? "check_circle" : "bookmark_add"} size={17} />
              {saved ? "ذخیره شد" : "ذخیره در مسیرهای روزمره"}
            </button>
          </section>

          {/* نقشه مسیر */}
          <button
            onClick={() => nav.go("map", { fromStationId: from?.id, toStationId: to?.id })}
            className="w-full bg-white border border-metro-outline-var/40 rounded-2xl p-3 flex items-center justify-between active:scale-[0.99] transition-all shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-metro-fixed text-metro-primary flex items-center justify-center">
                <MI name="map" size={20} fill />
              </div>
              <p className="text-xs font-bold text-metro-onsurface">مشاهده مسیر روی نقشه شبکه</p>
            </div>
            <MI name="chevron_left" size={18} className="text-metro-outline-var" />
          </button>
        </>
      )}

      {!plan && !loading && !error && (
        <div className="bg-white rounded-2xl border border-dashed border-metro-outline-var p-6 text-center">
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
    <div className="bg-white border border-metro-outline-var/30 rounded-2xl p-3 text-center shadow-sm flex flex-col justify-between h-24">
      <span className="text-[10px] text-metro-outline">{label}</span>
      <div className={`text-base font-bold ${tone === "primary" ? "text-metro-primary" : "text-metro-onsurface"} flex items-center justify-center gap-1`}>
        {value}
        <span className="text-[10px] font-normal text-metro-outline">{unit}</span>
      </div>
    </div>
  );
}

/* ---------------- نودهای شروع/تعویض/پایان ---------------- */
function Step({
  origin,
  destination,
  transfer,
  first,
  name,
}: {
  origin?: boolean;
  destination?: boolean;
  transfer?: boolean;
  first?: boolean;
  name?: string;
}) {
  return (
    <div className="relative flex gap-3 pb-4">
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div
          className={`w-7 h-7 rounded-full border-2 border-white shadow-sm flex items-center justify-center z-10 ${
            origin ? "bg-emerald-600" : destination ? "bg-metro-secondary" : "bg-metro-primary"
          }`}
        >
          <MI name={origin ? "trip_origin" : destination ? "flag" : "sync_alt"} size={14} className="text-white" fill />
        </div>
        {!destination && <div className={`w-1.5 flex-1 rounded-full mt-1 ${transfer ? "line-dashed" : "bg-metro-outline-var/50"}`} />}
      </div>
      <div className="pt-1 min-w-0">
        {origin && <p className="text-xs font-bold text-metro-onsurface">شروع سفر</p>}
        {destination && <p className="text-xs font-bold text-metro-secondary">رسیدید به مقصد</p>}
        {transfer && (
          <p className="text-xs font-bold text-metro-onsurface flex items-center gap-1">
            تعویض خط در {name ?? "ایستگاه تقاطعی"}
            <span className="text-[9px] font-medium text-metro-outline">(۴ دقیقه پیاده‌روی)</span>
          </p>
        )}
        {first && origin && <p className="text-[10px] text-metro-outline mt-0.5">گیت ورودی را پیدا کنید</p>}
      </div>
    </div>
  );
}

function LegBlock({ leg }: { leg: RouteLeg; now: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex gap-3 pb-5">
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div className="w-7 h-7 rounded-full border-2 border-white shadow-sm flex items-center justify-center z-10" style={{ backgroundColor: leg.color }}>
          <MI name="directions_subway" size={14} className="text-white" fill />
        </div>
        <div className="w-1.5 flex-1 rounded-full mt-1" style={{ backgroundColor: leg.color }} />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-metro-onsurface truncate">
            سوار {leg.lineName} به سمت {leg.toName}
          </p>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{ backgroundColor: leg.color, color: leg.textOnColor }}
          >
            {toFa(leg.stops)} ایستگاه • {toFa(leg.minutes)} دقیقه
          </span>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-[10px] text-metro-primary-c font-bold mt-1 flex items-center gap-0.5 hover:underline"
        >
          {open ? "بستن فهرست ایستگاه‌ها" : "مشاهده ایستگاه‌های بین راه"}
          <MI name={open ? "expand_less" : "expand_more"} size={13} />
        </button>
        {open && (
          <ul className="mt-1.5 space-y-1 border-r-2 pr-3 ml-1" style={{ borderColor: `${leg.color}55` }}>
            {leg.stationNames.map((n, i) => (
              <li key={i} className="text-[10.5px] text-metro-onvar flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: leg.color }} />
                {n}
                {i === 0 && <span className="text-[8.5px] text-metro-outline">(سوار می‌شوید)</span>}
                {i === leg.stationNames.length - 1 && (
                  <span className="text-[8.5px] text-metro-outline">(پیاده می‌شوید)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
