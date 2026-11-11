"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  computeRoute,
  faMoney,
  getLine,
  getStation,
  searchStations,
  toFa,
  type RouteLeg,
  type StationDef,
} from "@/lib/metro-data";
import { MI, PageHeader, useShell } from "@/components/metro/shell";
import { useAnnouncer } from "@/components/metro/voice";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   جزئیات مسیر — مسیریاب کامل متروجو
   ============================================================ */

type Pref = "fastest" | "least_transfers" | "quietest";

const PREFS: { id: Pref; label: string; icon: string }[] = [
  { id: "fastest", label: "سریع‌ترین", icon: "speed" },
  { id: "least_transfers", label: "کم‌ترین جابجایی", icon: "sync_alt" },
  { id: "quietest", label: "کم‌ترین ازدحام", icon: "groups" },
];

const TRANSFER_WALK_MIN = 4.5;

/* رنگ روشن برای نشان خط داخل پیشنهادها (مطابق الگوی صفحه اصلی) */
const LINE_CHIP: Record<string, string> = {
  l1: "bg-red-50 text-red-800",
  l2: "bg-blue-50 text-blue-800",
  l3: "bg-cyan-50 text-cyan-800",
  l4: "bg-yellow-50 text-yellow-800",
  l5: "bg-green-50 text-green-800",
  l6: "bg-pink-50 text-pink-800",
  l7: "bg-purple-50 text-purple-800",
  k1: "bg-sky-50 text-sky-800",
  m1: "bg-orange-50 text-orange-800",
  m2: "bg-teal-50 text-teal-800",
  e1: "bg-lime-50 text-lime-800",
};

function chipClass(station: StationDef) {
  if (station.lines.length > 1) return "bg-cyan-50 text-cyan-800";
  return LINE_CHIP[station.lines[0]?.lineId] ?? "bg-surface-container text-on-surface-variant";
}

function chipLabel(station: StationDef) {
  if (station.lines.length > 1)
    return `تقاطع ${station.lines.map((l) => toFa(getLine(l.lineId)?.number ?? 0)).join(" و ")}`;
  return `خط ${toFa(getLine(station.lines[0]?.lineId)?.number ?? 0)}`;
}

/* ---------------------------- اسکلت بارگذاری ---------------------------- */
function PlanSkeleton() {
  return (
    <>
      <div className="sticky top-0 z-40 h-16 bg-surface border-b border-outline-variant/30" />
      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        <div className="h-16 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
        <div className="h-24 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
        <div className="h-56 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
        <div className="h-14 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
      </main>
    </>
  );
}

/* ------------------------- ردیف جدایی تعویض خط ------------------------- */
function TransferRow({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5" aria-label={`تعویض خط در ایستگاه ${name}`}>
      <div className="flex-1 border-t border-dashed border-outline-variant/50" />
      <div className="flex items-center gap-1.5 bg-primary/5 text-primary rounded-full px-3 py-1.5">
        <MI name="transfer_within_a_station" size={16} />
        <span className="text-[10px] font-bold">تعویض در {name}</span>
        <span className="text-[10px] text-on-surface-variant">• {toFa(TRANSFER_WALK_MIN)} دقیقه پیاده</span>
      </div>
      <div className="flex-1 border-t border-dashed border-outline-variant/50" />
    </div>
  );
}

/* --------------------------- تایم‌لاین ایستگاه‌ها --------------------------- */
function LegTimeline({ leg }: { leg: RouteLeg }) {
  return (
    <div className="mt-2.5">
      {leg.stationNames.map((name, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === leg.stationNames.length - 1;
        const endpoint = isFirst || isLast;
        return (
          <div key={`${leg.lineId}-${idx}`} className="relative flex items-stretch gap-2.5">
            {/* ریل عمودی */}
            <div className="relative w-3 shrink-0 flex justify-center">
              {!isFirst && (
                <span
                  className="line-dashed absolute top-0 bottom-1/2 w-[2px]"
                  style={{ "--tw-line-color": leg.color } as React.CSSProperties}
                />
              )}
              {!isLast && (
                <span
                  className="line-dashed absolute top-1/2 bottom-0 w-[2px]"
                  style={{ "--tw-line-color": leg.color } as React.CSSProperties}
                />
              )}
              <span
                className={`relative z-10 my-auto rounded-full shrink-0 ${
                  endpoint ? "w-2.5 h-2.5 ring-2 ring-white shadow-sm" : "w-1 h-1"
                }`}
                style={{ backgroundColor: leg.color }}
              />
            </div>
            <span
              className={`py-1 text-[11px] leading-4 truncate ${
                endpoint ? "font-bold text-primary" : "text-on-surface-variant"
              }`}
            >
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ کارت هر بخش مسیر ------------------------------ */
function LegCard({ leg }: { leg: RouteLeg }) {
  const lineNo = getLine(leg.lineId)?.number ?? 0;
  return (
    <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm">
      {/* هدر: نشان رنگی خط + چیپ‌های آمار */}
      <div className="flex items-center gap-2">
        <span
          className="rounded-lg px-2 py-1 text-[10px] font-bold shadow-sm shrink-0 flex items-center justify-center min-w-7"
          style={{ backgroundColor: leg.color, color: leg.textOnColor }}
        >
          {toFa(lineNo)}
        </span>
        <span className="text-xs font-bold text-on-surface truncate">{leg.lineName}</span>
        <span className="mr-auto flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-bold bg-surface-container text-on-surface-variant rounded-full px-2 py-0.5">
            {toFa(leg.stops)} ایستگاه
          </span>
          <span className="text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">
            {toFa(Math.round(leg.minutes))} دقیقه
          </span>
        </span>
      </div>
      <LegTimeline leg={leg} />
    </section>
  );
}

/* ------------------------------ برنامه‌ریز کوچک ------------------------------ */
function MiniPlanner({ initialPref, hint }: { initialPref: Pref; hint?: string }) {
  const router = useRouter();
  const city = useShell((s) => s.city);
  const { toast } = useToast();
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [fromSel, setFromSel] = useState<StationDef | null>(null);
  const [toSel, setToSel] = useState<StationDef | null>(null);
  const [openDrop, setOpenDrop] = useState<"from" | "to" | null>(null);
  const [pref, setPref] = useState<Pref>(initialPref);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* بستن دراپ با کلیک بیرون */
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenDrop(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const resolve = (text: string): StationDef | undefined => {
    const q = text.trim().replace(/[«»"]/g, "");
    if (!q) return undefined;
    const candidates = [...searchStations({ q, cityId: city }), ...searchStations({ q })];
    const exact = candidates.find((s) => s.name === q);
    if (exact) return exact;
    const incl = candidates.find((s) => s.name.includes(q) || q.includes(s.name));
    if (incl) return incl;
    const words = q.split(/[\s()]+/).filter((w) => w.length > 1);
    return candidates.find((s) => {
      const sn = s.name.replace(/[()]/g, " ");
      return words.length > 0 && words.every((w) => sn.includes(w));
    });
  };

  const suggestionsFor = (field: "from" | "to", q: string) => {
    const text = q.trim();
    if (!text) {
      const featured = searchStations({ cityId: city }).filter((s) => s.featured);
      return (featured.length ? featured : searchStations({ cityId: city })).slice(0, 4);
    }
    const res = searchStations({ q: text, cityId: city });
    return (res.length ? res : searchStations({ q: text })).slice(0, 5);
  };

  const pick = (field: "from" | "to", s: StationDef) => {
    if (field === "from") {
      setFromSel(s);
      setFromText(s.name);
    } else {
      setToSel(s);
      setToText(s.name);
    }
    setOpenDrop(null);
  };

  const swap = () => {
    setFromText(toText);
    setToText(fromText);
    setFromSel(toSel);
    setToSel(fromSel);
  };

  const submit = () => {
    const f = fromSel ?? resolve(fromText);
    const t = toSel ?? resolve(toText);
    if (!f || !t) {
      toast({
        title: "مبدأ و مقصد را انتخاب کنید",
        description: "نام ایستگاه را از فهرست پیشنهاد برگزینید",
        variant: "destructive",
      });
      return;
    }
    if (f.id === t.id) {
      toast({ title: "مبدأ و مقصد یکسان هستند", variant: "destructive" });
      return;
    }
    router.replace(`/plan?from=${f.id}&to=${t.id}&pref=${pref}`);
  };

  const inputRow = (field: "from" | "to") => {
    const isFrom = field === "from";
    const value = isFrom ? fromText : toText;
    const setValue = isFrom ? setFromText : setToText;
    const suggestions = suggestionsFor(field, value);
    return (
      <div className="relative flex items-center gap-2.5 bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant/30">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isFrom ? "bg-emerald-500" : "bg-red-600"}`} />
        <div className="flex-1 flex flex-col justify-center min-w-0">
          <span className="text-[10px] text-outline leading-tight font-bold">{isFrom ? "مبدأ" : "مقصد"}</span>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (isFrom) setFromSel(null);
              else setToSel(null);
              setOpenDrop(field);
            }}
            onFocus={() => setOpenDrop(field)}
            placeholder={isFrom ? "ایستگاه مبدأ..." : "ایستگاه مقصد..."}
            className="w-full bg-transparent text-sm font-bold text-on-surface focus:outline-none border-none p-0 mt-0.5"
            aria-label={isFrom ? "ایستگاه مبدأ" : "ایستگاه مقصد"}
          />
        </div>
        <button
          type="button"
          aria-label="پاک کردن"
          onClick={() => {
            setValue("");
            if (isFrom) setFromSel(null);
            else setToSel(null);
            setOpenDrop(field);
          }}
          className="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container-high transition-colors shrink-0 active:scale-95"
        >
          <MI name="close" size={14} />
        </button>

        {openDrop === field && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 py-1 z-[60] text-xs">
            {suggestions.length === 0 && <div className="px-3 py-2 text-outline">ایستگاهی یافت نشد</div>}
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(field, s)}
                className="w-full text-right px-3 py-2 hover:bg-surface-container text-on-surface flex items-center justify-between gap-2 active:bg-surface-container transition-colors"
              >
                <span className="truncate">{s.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${chipClass(s)}`}>
                  {chipLabel(s)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      ref={wrapRef}
      className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3"
    >
      <div className="flex items-center gap-2">
        <MI name="route" size={20} className="text-primary" />
        <h3 className="font-bold text-xs text-on-surface">محاسبه مسیر</h3>
      </div>

      {hint && (
        <div className="bg-error-container text-on-error-container text-[11px] font-medium rounded-xl px-3 py-2 flex items-center gap-2">
          <MI name="error" size={16} className="shrink-0" />
          {hint}
        </div>
      )}

      <div className="relative flex items-center gap-2">
        <div className="flex-1 space-y-2 min-w-0">
          {inputRow("from")}
          {inputRow("to")}
        </div>
        <button
          type="button"
          aria-label="جابجایی مبدأ و مقصد"
          onClick={swap}
          className="w-10 h-10 rounded-full bg-surface-container-lowest border border-outline-variant/40 shadow-sm flex items-center justify-center text-primary active:scale-90 transition-all shrink-0"
        >
          <MI name="swap_vert" size={18} />
        </button>
      </div>

      {/* اولویت مسیریابی */}
      <div className="grid grid-cols-3 gap-1.5">
        {PREFS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPref(p.id)}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-bold active:scale-95 transition-all ${
              pref === p.id
                ? "bg-primary text-white shadow-sm"
                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            <MI name={p.icon} size={18} />
            {p.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={submit}
        className="w-full flex items-center justify-center gap-1.5 bg-primary-container text-white rounded-xl font-bold text-xs py-2.5 shadow-sm active:scale-[0.98] transition-all"
      >
        <MI name="alt_route" size={16} />
        محاسبه مسیر
      </button>
    </section>
  );
}

/* ------------------------------ بدنه صفحه ------------------------------ */
function PlanInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const announcer = useAnnouncer();
  const [starting, setStarting] = useState(false);

  const qFrom = searchParams.get("from");
  const qTo = searchParams.get("to");
  const qPref = searchParams.get("pref");

  /* منبع واحد حقیقت اولویت: پارامتر URL (بدون نیاز به همگام‌سازی دستی) */
  const pref: Pref =
    qPref === "least_transfers" || qPref === "quietest" ? qPref : "fastest";

  const fromStation = qFrom ? getStation(qFrom) : undefined;
  const toStation = qTo ? getStation(qTo) : undefined;
  const hasValidParams = !!(fromStation && toStation && fromStation.id !== toStation.id);

  const plan = useMemo(() => {
    if (!fromStation || !toStation || fromStation.id === toStation.id) return null;
    return computeRoute(fromStation.id, toStation.id, pref);
  }, [fromStation, toStation, pref]);

  const changePref = (p: Pref) => {
    if (qFrom && qTo) router.replace(`/plan?from=${qFrom}&to=${qTo}&pref=${p}`, { scroll: false });
  };

  const startTrip = async () => {
    if (!plan || !fromStation || !toStation || starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromStationId: fromStation.id,
          toStationId: toStation.id,
          pref: plan.pref,
        }),
      });
      if (!res.ok) throw new Error("failed");
      toast({
        title: "سفر در تاریخچه ثبت شد",
        description: `${fromStation.name} → ${toStation.name}`,
      });
      announcer
        .announce(`سفر شما آماده است. مدت ${toFa(Math.round(plan.totalMinutes))} دقیقه`)
        .catch(() => {});
    } catch {
      toast({
        title: "ثبت سفر ناموفق بود",
        description: "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      });
    } finally {
      setStarting(false);
    }
  };

  const hint =
    qFrom && qTo && !hasValidParams
      ? fromStation && toStation && fromStation.id === toStation.id
        ? "مبدأ و مقصد یکسان هستند؛ دو ایستگاه متفاوت انتخاب کنید."
        : "ایستگاه واردشده یافت نشد؛ از برنامه‌ریز زیر استفاده کنید."
      : undefined;

  return (
    <>
      <PageHeader
        title="جزئیات مسیر"
        subtitle={plan && fromStation && toStation ? `${fromStation.name} → ${toStation.name}` : undefined}
      />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        {hasValidParams && plan ? (
          <>
            {/* ---------------- انتخاب اولویت مسیریابی ---------------- */}
            <section className="bg-surface-container-lowest rounded-2xl p-3 border border-outline-variant/40 shadow-sm">
              <div className="flex items-center gap-2 mb-2 px-1">
                <MI name="tune" size={18} className="text-primary" />
                <h3 className="font-bold text-xs text-on-surface">اولویت مسیریابی</h3>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {PREFS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => changePref(p.id)}
                    aria-pressed={pref === p.id}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold active:scale-95 transition-all ${
                      pref === p.id
                        ? "bg-primary text-white shadow-sm"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                    }`}
                  >
                    <MI name={p.icon} size={18} />
                    {p.label}
                  </button>
                ))}
              </div>
            </section>

            {/* ---------------- آمار کلی سفر ---------------- */}
            <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="flex flex-col items-center justify-center gap-0.5">
                  <span className="text-[11px] text-outline">مدت سفر</span>
                  <span className="text-lg font-bold text-primary leading-tight">
                    {toFa(Math.round(plan.totalMinutes))} دقیقه
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center gap-0.5 border-x border-outline-variant/20">
                  <span className="text-[11px] text-outline">ایستگاه‌ها</span>
                  <span className="text-lg font-bold text-on-surface leading-tight">
                    {toFa(plan.totalStations)}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center gap-0.5">
                  <span className="text-[11px] text-outline">جابجایی</span>
                  <span className="text-lg font-bold text-tertiary leading-tight">
                    {plan.transfers === 0 ? "بدون تعویض" : toFa(plan.transfers)}
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-outline-variant/20 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-on-surface-variant font-medium">
                  <MI name="confirmation_number" size={18} className="text-primary" />
                  کرایه مسیر
                </div>
                <span className="text-sm font-bold text-primary">{faMoney(plan.fare)} تومان</span>
              </div>
            </section>

            {/* ---------------- تایم‌لاین بخش‌های مسیر ---------------- */}
            <div className="space-y-2" aria-label="مسیر حرکت">
              {plan.legs.map((leg, i) => (
                <div key={`${leg.lineId}-${i}`}>
                  {i > 0 && <TransferRow name={plan.transferStations[i - 1] ?? ""} />}
                  <LegCard leg={leg} />
                </div>
              ))}
            </div>

            {/* یادداشت ازدحام مسیر */}
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 bg-tertiary-fixed/40 text-tertiary text-[10px] rounded-full px-2.5 py-1 font-bold max-w-full">
                <MI name="info" size={13} className="shrink-0" />
                <span className="truncate">{plan.crowdNote}</span>
              </span>
            </div>

            {/* ---------------- ردیف عملیات ---------------- */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startTrip}
                disabled={starting}
                className="flex-1 flex items-center justify-center gap-1.5 bg-primary-container text-white rounded-xl font-bold text-xs py-2.5 shadow-sm active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {starting ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <MI name="play_arrow" size={16} />
                )}
                شروع سفر
              </button>
              <button
                type="button"
                onClick={() => router.push("/map")}
                className="flex items-center justify-center gap-1.5 bg-surface-container-lowest text-primary rounded-xl font-bold text-xs px-4 py-2.5 border border-outline-variant/40 shadow-sm active:scale-[0.98] transition-all"
              >
                <MI name="directions" size={16} />
                نمایش روی نقشه
              </button>
            </div>

            {/* ---------------- هشدار بیدارباش مقصد ---------------- */}
            <button
              type="button"
              onClick={() => toStation && router.push(`/stations/${toStation.id}`)}
              className="w-full bg-surface-container-lowest rounded-2xl p-3.5 border border-outline-variant/40 shadow-sm flex items-center gap-3 text-right active:scale-[0.98] transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <MI name="notifications_active" size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-on-surface truncate">
                  {toStation ? `فعال‌سازی هشدار بیدارباش برای ${toStation.name}` : "هشدار بیدارباش"}
                </p>
                <p className="text-[10px] text-outline mt-0.5">
                  پیش از رسیدن به مقصد، با اعلان صوتی بیدار می‌شوید
                </p>
              </div>
              <MI name="chevron_left" size={18} className="text-outline shrink-0" />
            </button>
          </>
        ) : (
          <MiniPlanner initialPref={pref} hint={hint} />
        )}
      </main>
    </>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<PlanSkeleton />}>
      <PlanInner />
    </Suspense>
  );
}
