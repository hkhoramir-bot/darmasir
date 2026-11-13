"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  computeRoute,
  crowdingNow,
  exitsFor,
  faMoney,
  getLine,
  getStation,
  headwayAt,
  interchangeLinesOf,
  nextArrivalsBoth,
  searchStations,
  stationsOfLine,
  toFa,
  type CrowdLevel,
  type RouteLeg,
  type RoutePlan,
  type StationDef,
} from "@/lib/metro-data";
import { MI, PageHeader, useShell } from "@/components/metro/shell";
import { useAnnouncer } from "@/components/metro/voice";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   مسیریابی هوشمند سفر — بازسازی دقیق طبق طرح‌های Stitch
   _5 (حالت ورودی فشرده) + _10 (حالت نتیجه — طرح مرجع) + _21 (جزئیات)
   ============================================================ */

type Pref = "fastest" | "least_transfers" | "quietest";
type Field = "from" | "to";

const PREFS: { id: Pref; label: string }[] = [
  { id: "fastest", label: "سریع‌ترین (پیشنهادی)" },
  { id: "least_transfers", label: "کمترین تعویض خط" },
  { id: "quietest", label: "کمترین ازدحام" },
];

const TRANSFER_WALK_MIN = 2;

/* رنگ روشن برای نشان خط (مطابق الگوی صفحات دیگر متروجو) */
const LINE_CHIP: Record<string, string> = {
  l1: "bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  l2: "bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  l3: "bg-cyan-50 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300",
  l4: "bg-yellow-50 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  l5: "bg-green-50 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  l6: "bg-pink-50 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300",
  l7: "bg-purple-50 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
  k1: "bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  m1: "bg-orange-50 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  m2: "bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300",
  e1: "bg-lime-50 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300",
};

function lineChipCls(lineId: string) {
  return LINE_CHIP[lineId] ?? "bg-surface-container text-on-surface-variant";
}

function chipFor(station: StationDef): { cls: string; label: string } {
  if (station.lines.length > 1) {
    const nums = station.lines
      .map((l) => getLine(l.lineId)?.number ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    return { cls: "bg-cyan-50 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300", label: `تقاطع خط ${nums.map((n) => toFa(n)).join(" و ")}` };
  }
  const lineId = station.lines[0]?.lineId ?? "";
  return { cls: lineChipCls(lineId), label: `خط ${toFa(getLine(lineId)?.number ?? 0)}` };
}

/* رنگ برچسب شلوغی سکو */
const CROWD_CHIP: Record<CrowdLevel, string> = {
  quiet: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  moderate: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  busy: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

/* ---------------------------- اسکلت بارگذاری ---------------------------- */
function PlanSkeleton() {
  return (
    <>
      <div className="sticky top-0 z-40 h-16 bg-surface border-b border-outline-variant/30" />
      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        <div className="h-40 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
        <div className="h-24 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
        <div className="h-56 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
        <div className="h-14 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
      </main>
    </>
  );
}

/* ------------------------------ کلید سوییچ ------------------------------ */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={onChange} aria-label={label} />
      <div className="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

/* ------------------- فیلد انتخاب ایستگاه (مبدأ/مقصد) ------------------- */
function StationField({
  field,
  sel,
  text,
  open,
  onOpen,
  onText,
  onPick,
  onClear,
}: {
  field: Field;
  sel: StationDef | null;
  text: string;
  open: boolean;
  onOpen: (f: Field) => void;
  onText: (f: Field, v: string) => void;
  onPick: (f: Field, s: StationDef) => void;
  onClear: (f: Field) => void;
}) {
  const city = useShell((s) => s.city);
  const isFrom = field === "from";

  const suggestions = useMemo(() => {
    const q = text.trim();
    if (!q) {
      const featured = searchStations({ cityId: city }).filter((s) => s.featured);
      return (featured.length ? featured : searchStations({ cityId: city })).slice(0, 5);
    }
    const res = searchStations({ q, cityId: city });
    return (res.length ? res : searchStations({ q })).slice(0, 5);
  }, [text, city]);

  const dotStyle = sel ? { backgroundColor: getLine(sel.lines[0]?.lineId ?? "")?.color } : undefined;
  const chip = sel ? chipFor(sel) : null;

  /* حالت نمایش (ایستگاه انتخاب‌شده) — دقیقاً مطابق کارت خلاصه طرح _10 */
  if (!open && sel && chip) {
    return (
      <button
        type="button"
        onClick={() => onOpen(field)}
        className="w-full flex items-center gap-2.5 bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/20 text-right active:scale-[0.99] transition-all"
        aria-label={isFrom ? `تغییر مبدأ: ${sel.name}` : `تغییر مقصد: ${sel.name}`}
      >
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={dotStyle} />
        <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
          <span className="text-body-md font-body-md font-medium text-on-surface truncate">{sel.name}</span>
          <span className={`text-label-sm font-label-sm px-2 py-0.5 rounded font-bold flex-shrink-0 ${chip.cls}`}>
            {chip.label}
          </span>
        </div>
      </button>
    );
  }

  /* حالت ورودی + فهرست پیشنهاد جستجو */
  return (
    <div className="relative flex items-center gap-2.5 bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/20">
      <span className="w-2.5 h-2.5 rounded-full bg-outline-variant flex-shrink-0" />
      <input
        type="text"
        value={text}
        onChange={(e) => onText(field, e.target.value)}
        onFocus={() => onOpen(field)}
        autoFocus={open}
        placeholder={isFrom ? "ایستگاه مبدأ..." : "ایستگاه مقصد..."}
        aria-label={isFrom ? "ایستگاه مبدأ" : "ایستگاه مقصد"}
        className="flex-1 min-w-0 bg-transparent text-body-md font-body-md font-medium text-on-surface placeholder:text-outline focus:outline-none border-none p-0"
      />
      {text && (
        <button
          type="button"
          aria-label="پاک کردن"
          onClick={() => onClear(field)}
          className="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container-high transition-colors shrink-0 active:scale-95"
        >
          <MI name="close" size={16} />
        </button>
      )}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 py-1 z-[60] text-xs">
          {suggestions.length === 0 && <div className="px-3 py-2 text-outline">ایستگاهی یافت نشد</div>}
          {suggestions.map((s) => {
            const c = chipFor(s);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(field, s)}
                className="w-full text-right px-3 py-2 hover:bg-surface-container text-on-surface flex items-center justify-between gap-2 active:bg-surface-container transition-colors"
              >
                <span className="truncate">{s.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${c.cls}`}>{c.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------- کارت برنامه‌ریز (ورودی / خلاصه) ------------------- */
function PlannerCard({
  fromSel,
  toSel,
  fromText,
  toText,
  openDrop,
  setOpenDrop,
  onText,
  onPick,
  onClear,
  onSwap,
  pref,
  onPref,
  hint,
  showCta,
  onCta,
}: {
  fromSel: StationDef | null;
  toSel: StationDef | null;
  fromText: string;
  toText: string;
  openDrop: Field | null;
  setOpenDrop: (f: Field | null) => void;
  onText: (f: Field, v: string) => void;
  onPick: (f: Field, s: StationDef) => void;
  onClear: (f: Field) => void;
  onSwap: () => void;
  pref: Pref;
  onPref: (p: Pref) => void;
  hint?: string;
  showCta?: boolean;
  onCta?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  /* بستن دراپ با کلیک بیرون */
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenDrop(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [setOpenDrop]);

  const fieldProps = (field: Field) => ({
    field,
    sel: field === "from" ? fromSel : toSel,
    text: field === "from" ? fromText : toText,
    open: openDrop === field,
    onOpen: setOpenDrop,
    onText,
    onPick,
    onClear,
  });

  return (
    <section
      id="plan-prefs"
      ref={wrapRef}
      className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3.5 shadow-sm space-y-3"
    >
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex-1 space-y-2 min-w-0">
          <StationField {...fieldProps("from")} />
          <StationField {...fieldProps("to")} />
        </div>
        <button
          type="button"
          aria-label="معکوس‌سازی مسیر"
          onClick={onSwap}
          className="w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary flex items-center justify-center border border-outline-variant/30 active:scale-95 transition-all flex-shrink-0 shadow-sm"
        >
          <MI name="swap_vert" size={18} />
        </button>
      </div>

      {/* اولویت مسیریابی */}
      <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
        {PREFS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPref(p.id)}
            aria-pressed={pref === p.id}
            className={`flex-1 py-1.5 px-2 rounded-xl text-label-sm font-label-sm text-center whitespace-nowrap transition-all ${
              pref === p.id
                ? "bg-primary text-on-primary font-bold shadow-sm"
                : "bg-surface-container-low text-on-surface-variant hover:text-primary font-medium border border-outline-variant/20"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {hint && (
        <div className="bg-error-container text-on-error-container text-body-sm font-body-sm rounded-xl px-3 py-2 flex items-center gap-2">
          <MI name="info" size={16} className="shrink-0" />
          <span>{hint}</span>
        </div>
      )}

      {showCta && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="w-full bg-primary hover:bg-primary-container text-on-primary font-title-md text-title-md py-3 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all"
        >
          <MI name="alt_route" size={20} />
          <span>محاسبه مسیر</span>
        </button>
      )}
    </section>
  );
}

/* --------------- نشان زنده قطار بعدی + شلوغی سکو هر بخش --------------- */
function LegArrivalPill({ leg }: { leg: RouteLeg }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const info = useMemo(() => {
    const line = getLine(leg.lineId);
    const list = stationsOfLine(leg.lineId);
    const iFrom = list.findIndex((s) => s.id === leg.fromId);
    const iTo = list.findIndex((s) => s.id === leg.toId);
    if (!line || iFrom < 0 || iTo < 0) return null;
    const terminal = line.terminals[iTo >= iFrom ? 1 : 0];
    const dirs = nextArrivalsBoth(leg.lineId, leg.fromId);
    const arr = dirs.find((d) => d.to === terminal) ?? dirs[0];
    if (!arr) return null;
    if (arr.outOfService || arr.minutes.length === 0) {
      const d = new Date();
      const fallback = arr.outOfService ? null : headwayAt(line, d.getHours() * 60 + d.getMinutes());
      return { out: arr.outOfService, minutes: fallback, crowd: arr.crowd, crowdLabel: arr.crowdLabel };
    }
    return { out: false, minutes: arr.minutes[0], crowd: arr.crowd, crowdLabel: arr.crowdLabel };
  }, [leg, tick]);

  if (!info) return null;

  return (
    <div className="mt-2.5 bg-surface-container-low rounded-xl p-2.5 px-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-on-surface-variant min-w-0">
        <span className="inline-flex shrink-0" style={{ color: leg.color }}>
          <MI name="schedule" size={16} />
        </span>
        <span className="text-body-sm font-body-sm shrink-0">قطار بعدی:</span>
        <span className="text-body-sm font-body-sm font-bold text-on-surface truncate">
          {info.out || info.minutes === null ? "خارج از ساعات سرویس" : `${toFa(info.minutes)} دقیقه دیگر`}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-label-sm font-label-sm text-outline">شلوغی سکو:</span>
        <span className={`text-label-sm font-label-sm font-bold px-1.5 py-0.5 rounded ${CROWD_CHIP[info.crowd]}`}>
          {info.crowdLabel}
        </span>
      </div>
    </div>
  );
}

/* --------------------- گام ۱: سوار شدن در مبدأ --------------------- */
function LegStartRow({ leg }: { leg: RouteLeg }) {
  const line = getLine(leg.lineId);
  return (
    <div className="relative flex gap-3 pb-6">
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div
          className="w-7 h-7 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-white z-10"
          style={{ backgroundColor: leg.color }}
        >
          <MI name="directions_subway" size={14} fill />
        </div>
        <div className="w-1.5 flex-1 rounded-full mt-1" style={{ backgroundColor: leg.color }} />
      </div>
      <div className="flex-1 pt-0.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-title-md font-title-md font-bold text-on-surface truncate">{leg.fromName}</span>
            <span
              className={`text-label-sm font-label-sm px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${lineChipCls(leg.lineId)}`}
            >
              خط {toFa(line?.number ?? 0)}
            </span>
          </div>
          <span className="text-label-sm font-label-sm text-primary font-bold bg-primary-fixed/40 dark:bg-primary/20 dark:text-primary-fixed-dim px-2 py-0.5 rounded-full flex-shrink-0">
            مبدأ
          </span>
        </div>
        <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
          جهت حرکت قطار: <strong className="text-on-surface">به سمت {leg.toName}</strong>
        </p>
        <LegArrivalPill leg={leg} />
      </div>
    </div>
  );
}

/* --------------- گام‌های میانی: آکاردئون ایستگاه‌های عبوری --------------- */
function LegAccordionRow({ leg }: { leg: RouteLeg }) {
  const [open, setOpen] = useState(false);
  const mid = leg.stationIds.slice(1, -1);
  if (mid.length === 0) return null;
  const perStop = leg.stops > 0 ? leg.minutes / leg.stops : 0;
  const midMinutes = Math.round(perStop * (mid.length + 1));

  const hintFor = (sid: string) => {
    const others = interchangeLinesOf(sid)
      .filter((id) => id !== leg.lineId)
      .map((id) => getLine(id)?.number ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    return others.length ? `تقاطع خط ${others.map((n) => toFa(n)).join(" و ")}` : null;
  };

  return (
    <div className="relative flex gap-3 pb-6">
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div className="w-1.5 h-full rounded-full" style={{ backgroundColor: leg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full bg-surface-container/60 hover:bg-surface-container rounded-xl px-3 py-2 flex items-center justify-between gap-2 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: leg.color }} />
            <span className="text-body-sm font-body-sm text-on-surface-variant font-medium truncate">
              {toFa(mid.length)} ایستگاه عبوری ({toFa(midMinutes)} دقیقه)
            </span>
          </div>
          <MI
            name="expand_more"
            size={20}
            className={`text-outline transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="mt-2 mr-2 pr-3 border-r-2 space-y-2" style={{ borderColor: `${leg.color}80` }}>
            {mid.map((sid, idx) => {
              const name = leg.stationNames[idx + 1] ?? "";
              const hint = hintFor(sid);
              return (
                <div
                  key={`${sid}-${idx}`}
                  className="flex items-center justify-between text-body-sm font-body-sm text-on-surface-variant py-1 gap-2"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-outline-variant shrink-0" />
                    <span className="truncate">{name}</span>
                  </div>
                  {hint && <span className="text-label-sm font-label-sm text-outline shrink-0">{hint}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------- گام تعویض خط: گره تبادلی + راهنما --------------- */
function TransferNodeRow({ name, prevLeg, nextLeg }: { name: string; prevLeg: RouteLeg; nextLeg: RouteLeg }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const tName = name || prevLeg.toName;
  const interLines = interchangeLinesOf(prevLeg.toId)
    .map((id) => getLine(id)?.number ?? 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const prevNo = getLine(prevLeg.lineId)?.number ?? 0;
  const nextNo = getLine(nextLeg.lineId)?.number ?? 0;

  return (
    <div className="relative flex gap-3 pb-6">
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        {/* گره دوحلقه‌ای تبادلی — حلقه بیرونی خط قبلی، حاشیه خط بعدی */}
        <div
          className="w-8 h-8 rounded-full bg-surface-container-lowest border-4 flex items-center justify-center text-primary z-10 shadow-md ring-2"
          style={{ borderColor: nextLeg.color, "--tw-ring-color": prevLeg.color } as React.CSSProperties}
        >
          <MI name="sync_alt" size={14} />
        </div>
        <div className="w-1.5 flex-1 rounded-full mt-1" style={{ backgroundColor: nextLeg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-title-md font-title-md font-bold text-on-surface truncate">{tName}</h3>
            {interLines.length > 1 && (
              <span className="text-label-sm font-label-sm text-outline">
                ایستگاه تبادلی تقاطع {interLines.map((n) => `خط ${toFa(n)}`).join(" و ")}
              </span>
            )}
          </div>
          <span className="bg-secondary-fixed text-on-secondary-fixed text-label-sm font-label-sm font-bold px-2 py-0.5 rounded-full flex-shrink-0">
            تعویض خط
          </span>
        </div>
        {/* جعبه راهنمای تعویض خط */}
        <div className="mt-2.5 bg-surface-container border border-outline-variant/40 rounded-xl p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body-sm font-body-sm font-bold text-primary flex items-center gap-1.5">
              <MI name="directions_walk" size={16} />
              راهنمای تعویض خط ({toFa(TRANSFER_WALK_MIN)} دقیقه)
            </span>
            <button
              type="button"
              onClick={() => setHelpOpen((v) => !v)}
              aria-expanded={helpOpen}
              aria-label="راهنمای تصویری مسیر"
              className="w-6 h-6 flex items-center justify-center rounded-full bg-surface-container-highest text-primary hover:bg-primary hover:text-white transition-colors shrink-0"
            >
              <MI name="help" size={12} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-body-sm font-body-sm text-on-surface-variant mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: nextLeg.color }} />
            <span>
              خط {toFa(nextNo)} به سمت {nextLeg.toName} (پله‌برقی)
            </span>
          </div>
          {helpOpen && (
            <p className="text-body-sm font-body-sm text-outline mt-2 pt-2 border-t border-outline-variant/20">
              پس از پیاده شدن از خط {toFa(prevNo)}، تابلوهای راهنمای خط {toFa(nextNo)} به سمت {nextLeg.toName} را
              دنبال کنید.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------- گام سوار شدن در خط بعدی --------------- */
function LegBoardRow({ leg }: { leg: RouteLeg }) {
  const line = getLine(leg.lineId);
  return (
    <div className="relative flex gap-3 pb-6">
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div className="w-1.5 h-full rounded-full" style={{ backgroundColor: leg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-body-md font-body-md font-bold text-on-surface truncate">
            سوار شدن در خط {toFa(line?.number ?? 0)}
          </span>
          <span
            className={`text-label-sm font-label-sm px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${lineChipCls(leg.lineId)}`}
          >
            خط {toFa(line?.number ?? 0)}
          </span>
        </div>
        <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
          جهت حرکت: <strong className="text-on-surface">به سمت {leg.toName}</strong>
        </p>
        <LegArrivalPill leg={leg} />
      </div>
    </div>
  );
}

/* --------------- گام پایانی: مقصد --------------- */
function DestinationRow({ name, color, exits }: { name: string; color: string; exits: string }) {
  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div
          className="w-7 h-7 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-white z-10"
          style={{ backgroundColor: color }}
        >
          <MI name="location_on" size={14} fill />
        </div>
      </div>
      <div className="flex-1 pt-0.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-title-md font-title-md font-bold text-on-surface truncate">{name}</span>
          <span className="text-label-sm font-label-sm bg-primary text-white px-2 py-0.5 rounded-full font-bold flex-shrink-0">
            مقصد
          </span>
        </div>
        {exits && <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">{exits}</p>}
      </div>
    </div>
  );
}

/* --------------- کارت جزئیات گام‌به‌گام مسیر --------------- */
function JourneySection({
  plan,
  toName,
  exits,
}: {
  plan: RoutePlan;
  toName: string;
  exits: string;
}) {
  const headerChip =
    plan.pref === "least_transfers" ? "کم‌ترین تعویض خط" : plan.pref === "quietest" ? "کم‌ترین ازدحام" : "بهینه‌ترین مسیر";
  const lastColor = plan.legs[plan.legs.length - 1]?.color ?? "#00417f";

  return (
    <section
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4 shadow-sm relative overflow-hidden"
      aria-label="جزئیات گام‌به‌گام مسیر"
    >
      <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MI name="route" size={20} className="text-primary shrink-0" />
          <span className="text-title-md font-title-md font-bold text-on-surface truncate">
            جزئیات گام‌به‌گام مسیر
          </span>
        </div>
        <span className="text-label-sm font-label-sm bg-surface-container px-2 py-0.5 rounded-full text-primary font-medium flex-shrink-0">
          {headerChip}
        </span>
      </div>
      <div className="relative">
        {plan.legs.map((leg, i) => (
          <Fragment key={`${leg.lineId}-${i}`}>
            {i === 0 ? (
              <LegStartRow leg={leg} />
            ) : (
              <>
                <TransferNodeRow name={plan.transferStations[i - 1] ?? ""} prevLeg={plan.legs[i - 1]} nextLeg={leg} />
                <LegBoardRow leg={leg} />
              </>
            )}
            <LegAccordionRow leg={leg} />
          </Fragment>
        ))}
        <DestinationRow name={toName} color={lastColor} exits={exits} />
      </div>
    </section>
  );
}

/* ------------------------------ بدنه صفحه ------------------------------ */
function PlanInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const announcer = useAnnouncer();
  const city = useShell((s) => s.city);

  const [starting, setStarting] = useState(false);
  const [openDrop, setOpenDrop] = useState<Field | null>(null);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [fromSel, setFromSel] = useState<StationDef | null>(null);
  const [toSel, setToSel] = useState<StationDef | null>(null);
  const [pref, setPref] = useState<Pref>("fastest");

  /* اعلام صوتی ایستگاه‌ها — ذخیره در حافظه محلی */
  const [voiceOn, setVoiceOn] = useState(true);
  useEffect(() => {
    try {
      setVoiceOn(localStorage.getItem("metrojo-plan-voice") !== "0");
    } catch {}
  }, []);
  const toggleVoice = () => {
    setVoiceOn((v) => {
      const nv = !v;
      try {
        localStorage.setItem("metrojo-plan-voice", nv ? "1" : "0");
      } catch {}
      return nv;
    });
  };

  /* بیدارباش مقصد — فقط حالت کلاینت + حافظه محلی */
  const [alarm, setAlarm] = useState<{ on: boolean; minutes: number }>({ on: false, minutes: 2 });
  useEffect(() => {
    try {
      const raw = localStorage.getItem("metrojo-plan-alarm");
      if (raw) {
        const p = JSON.parse(raw) as { on?: boolean; minutes?: number };
        if (typeof p.on === "boolean") setAlarm({ on: p.on, minutes: p.minutes ?? 2 });
      }
    } catch {}
  }, []);
  const setAlarmState = (next: { on: boolean; minutes: number }) => {
    setAlarm(next);
    try {
      localStorage.setItem("metrojo-plan-alarm", JSON.stringify(next));
    } catch {}
  };

  const qFrom = searchParams.get("from");
  const qTo = searchParams.get("to");
  const qPref = searchParams.get("pref");

  const fromStation = qFrom ? getStation(qFrom) : undefined;
  const toStation = qTo ? getStation(qTo) : undefined;
  const hasParams = !!(fromStation && toStation && fromStation.id !== toStation.id);

  /* همگام‌سازی انتخاب‌ها و اولویت از پارامترهای آدرس */
  useEffect(() => {
    if (fromStation) {
      setFromSel(fromStation);
      setFromText(fromStation.name);
    }
    if (toStation) {
      setToSel(toStation);
      setToText(toStation.name);
    }
    setPref(qPref === "least_transfers" || qPref === "quietest" ? qPref : "fastest");
  }, [qFrom, qTo, qPref, fromStation, toStation]);

  const plan = useMemo(
    () =>
      fromStation && toStation && fromStation.id !== toStation.id
        ? computeRoute(fromStation.id, toStation.id, pref)
        : null,
    [fromStation, toStation, pref]
  );

  /* یادداشت خروجی‌های مقصد */
  const exitsText = useMemo(() => {
    if (!toStation) return "";
    return exitsFor(toStation.id)
      .slice(0, 2)
      .map((e) => `${e.label}: ${e.landmarks[0] ?? e.direction}`)
      .join(" • ");
  }, [toStation]);

  /* متن وضعیت خط اول مسیر */
  const firstLine = plan ? getLine(plan.legs[0]?.lineId ?? "") : undefined;
  const lineOk = !firstLine?.status || firstLine.status === "normal";
  const statusText = (() => {
    if (!firstLine) return "وضعیت خطوط";
    if (firstLine.status === "closed") return `وضعیت خطوط: خط ${toFa(firstLine.number)} مسدود است`;
    if (firstLine.status === "delay") return `وضعیت خطوط: ${firstLine.statusNote ?? "تأخیر در سرویس‌دهی"}`;
    if (firstLine.status === "crowded" || crowdingNow(firstLine.id) === "busy")
      return `وضعیت خطوط: ازدحام در خط ${toFa(firstLine.number)}`;
    return `وضعیت خطوط: خط ${toFa(firstLine.number)} فعال و روان`;
  })();

  /* رفع نام آزاد به ایستگاه (مطابق منطق قبلی صفحه) */
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

  const onText = (field: Field, v: string) => {
    if (field === "from") {
      setFromText(v);
      setFromSel(null);
    } else {
      setToText(v);
      setToSel(null);
    }
  };

  const onClearField = (field: Field) => {
    if (field === "from") {
      setFromText("");
      setFromSel(null);
    } else {
      setToText("");
      setToSel(null);
    }
    setOpenDrop(field);
    /* در حالت نتیجه، حذف پارامتر → بازگشت به حالت ورودی با حفظ ایستگاه دیگر */
    if (qFrom && qTo) {
      const params = new URLSearchParams();
      if (field === "from" && qTo) params.set("to", qTo);
      if (field === "to" && qFrom) params.set("from", qFrom);
      params.set("pref", pref);
      router.replace(`/plan?${params.toString()}`, { scroll: false });
    }
  };

  const onPick = (field: Field, s: StationDef) => {
    if (field === "from") {
      setFromSel(s);
      setFromText(s.name);
    } else {
      setToSel(s);
      setToText(s.name);
    }
    setOpenDrop(null);
    /* در حالت نتیجه، انتخاب بلافاصله مسیر را دوباره محاسبه می‌کند */
    if (qFrom && qTo) {
      const f = field === "from" ? s : fromStation;
      const t = field === "to" ? s : toStation;
      if (f && t && f.id !== t.id) {
        router.replace(`/plan?from=${f.id}&to=${t.id}&pref=${pref}`, { scroll: false });
      }
    }
  };

  const onSwap = () => {
    if (qFrom && qTo && fromStation && toStation) {
      router.replace(`/plan?from=${toStation.id}&to=${fromStation.id}&pref=${pref}`, { scroll: false });
      return;
    }
    const f = fromSel ?? resolve(fromText);
    const t = toSel ?? resolve(toText);
    setFromSel(t ?? null);
    setFromText(t?.name ?? "");
    setToSel(f ?? null);
    setToText(f?.name ?? "");
  };

  const onPref = (p: Pref) => {
    setPref(p);
    if (qFrom && qTo) {
      router.replace(`/plan?from=${qFrom}&to=${qTo}&pref=${p}`, { scroll: false });
    }
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
      if (res.ok) {
        toast({
          title: "سفر در تاریخچه ثبت شد",
          description: `${fromStation.name} → ${toStation.name}`,
        });
        announcer
          .announce(`ناوبری آغاز شد. مدت سفر حدود ${toFa(Math.round(plan.totalMinutes))} دقیقه`)
          .catch(() => {});
      }
    } catch {
      toast({
        title: "ثبت سفر ناموفق بود",
        description: "به ناوبری روی نقشه ادامه می‌دهیم",
        variant: "destructive",
      });
    } finally {
      setStarting(false);
      router.push(`/map?from=${fromStation.id}&to=${toStation.id}`);
    }
  };

  const doShare = async () => {
    const text =
      fromStation && toStation
        ? `مسیر ${fromStation.name} → ${toStation.name} — متروجو`
        : "متروجو — مسیریابی هوشمند سفر";
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "متروجو", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast({ title: "لینک مسیر کپی شد", description: "برای اشتراک‌گذاری آماده است" });
    } catch {
      /* کاربر اشتراک‌گذاری را لغو کرد */
    }
  };

  const focusPrefs = () => {
    document.getElementById("plan-prefs")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const sameStation =
    (fromStation && toStation && fromStation.id === toStation.id) ||
    (fromSel && toSel && fromSel.id === toSel.id);
  const hint = sameStation ? "مبدأ و مقصد یکسان هستند؛ دو ایستگاه متفاوت انتخاب کنید." : undefined;

  return (
    <>
      <PageHeader
        title="مسیریابی هوشمند سفر"
        subtitle="شبکه مترو تهران"
        actions={
          <>
            <button
              type="button"
              aria-label="اشتراک‌گذاری"
              onClick={doShare}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-on-surface hover:bg-surface-container active:scale-95 transition-all duration-150"
            >
              <MI name="share" size={20} />
            </button>
            <button
              type="button"
              aria-label="تنظیمات مسیر"
              onClick={focusPrefs}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-on-surface hover:bg-surface-container active:scale-95 transition-all duration-150"
            >
              <MI name="tune" size={20} />
            </button>
          </>
        }
      />

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-3 pb-28 space-y-4">
        {hasParams && plan ? (
          <>
            {/* ---------- کارت خلاصه مبدأ/مقصد + اولویت ---------- */}
            <PlannerCard
              fromSel={fromSel}
              toSel={toSel}
              fromText={fromText}
              toText={toText}
              openDrop={openDrop}
              setOpenDrop={setOpenDrop}
              onText={onText}
              onPick={onPick}
              onClear={onClearField}
              onSwap={onSwap}
              pref={pref}
              onPref={onPref}
              hint={hint}
            />

            {/* ---------- آمار کلی سفر ---------- */}
            <section className="grid grid-cols-3 gap-2" aria-label="آمار کلی سفر">
              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3 text-center shadow-sm flex flex-col justify-between h-24">
                <span className="text-body-sm font-body-sm text-outline">زمان تقریبی</span>
                <div className="text-title-md font-title-md font-bold text-primary flex items-center justify-center gap-1">
                  <span>{toFa(Math.round(plan.totalMinutes))}</span>
                  <span className="text-label-md font-label-md font-normal">دقیقه</span>
                </div>
              </div>
              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3 text-center shadow-sm flex flex-col justify-between h-24">
                <span className="text-body-sm font-body-sm text-outline">تعداد ایستگاه</span>
                <div className="text-title-md font-title-md font-bold text-on-surface flex items-center justify-center gap-1">
                  <span>{toFa(plan.totalStations)}</span>
                  <span className="text-label-md font-label-md font-normal">ایستگاه</span>
                </div>
              </div>
              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-3 text-center shadow-sm flex flex-col justify-between h-24">
                <span className="text-body-sm font-body-sm text-outline">تعویض خط</span>
                <div className="flex flex-col items-center">
                  <span className="text-title-md font-title-md font-bold text-on-surface">
                    {plan.transfers === 0 ? "بدون تعویض" : `${toFa(plan.transfers)} بار`}
                  </span>
                  {plan.transfers > 0 && (
                    <span className="text-label-sm font-label-sm text-outline truncate max-w-[85px]">
                      ({plan.transferStations[0] ?? ""})
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* ---------- نوار وضعیت خطوط و کرایه ---------- */}
            <div className="bg-surface-container-low rounded-xl px-3.5 py-2.5 flex items-center justify-between border border-outline-variant/20 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${lineOk ? "bg-emerald-600" : "bg-secondary"}`} />
                <span className="text-label-md font-label-md text-on-surface truncate">{statusText}</span>
              </div>
              <div className="flex items-center gap-1 text-primary flex-shrink-0">
                <MI name="payments" size={14} />
                <span className="text-label-md font-label-md font-bold">{faMoney(plan.fare)} تومان</span>
              </div>
            </div>

            {/* ---------- تایم‌لاین گام‌به‌گام ---------- */}
            <JourneySection plan={plan} toName={toStation?.name ?? ""} exits={exitsText} />

            {/* ---------- اعلام صوتی ایستگاه‌ها ---------- */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-3.5 flex items-center justify-between shadow-sm gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary flex-shrink-0">
                  <MI name="headphones" size={20} />
                </div>
                <div className="min-w-0">
                  <span className="text-label-lg font-label-lg text-on-surface font-bold">اعلام صوتی ایستگاه‌ها</span>
                  <p className="text-body-sm font-body-sm text-outline">پخش هشدار قبل از ایستگاه تعویض خط و مقصد</p>
                </div>
              </div>
              <Switch checked={voiceOn} onChange={toggleVoice} label="اعلام صوتی ایستگاه‌ها" />
            </div>

            {/* ---------- شروع ناوبری + عملیات دوم ---------- */}
            <div className="pt-1 space-y-2">
              <button
                type="button"
                onClick={startTrip}
                disabled={starting}
                className="w-full bg-primary hover:bg-primary-container text-on-primary font-title-md text-title-md py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all disabled:opacity-70"
              >
                {starting ? (
                  <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <MI name="send" size={20} fill />
                )}
                <span>شروع ناوبری و اعلام صوتی</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    fromStation && toStation && router.push(`/map?from=${fromStation.id}&to=${toStation.id}`)
                  }
                  className="w-full bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/30 text-primary font-label-lg text-label-lg py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
                >
                  <MI name="map" size={16} />
                  <span>مشاهده روی نقشه شبکه</span>
                </button>
                <button
                  type="button"
                  onClick={doShare}
                  className="w-full bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:text-primary font-label-lg text-label-lg py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
                >
                  <MI name="share" size={16} />
                  <span>اشتراک‌گذاری مسیر</span>
                </button>
              </div>
            </div>

            {/* ---------- بیدارباش مقصد ---------- */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-3.5 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary flex-shrink-0">
                    <MI name="alarm" size={20} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-label-lg font-label-lg text-on-surface font-bold">بیدارباش مقصد</span>
                    <p className="text-body-sm font-body-sm text-outline truncate">
                      هشدار {toFa(alarm.minutes)} دقیقه پیش از رسیدن به {toStation?.name ?? "مقصد"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={alarm.on}
                  onChange={() => setAlarmState({ ...alarm, on: !alarm.on })}
                  label="بیدارباش مقصد"
                />
              </div>
              {alarm.on && (
                <div className="flex items-center gap-1.5">
                  <span className="text-label-sm font-label-sm text-outline shrink-0">زمان هشدار:</span>
                  {[1, 2, 3].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAlarmState({ ...alarm, minutes: m })}
                      aria-pressed={alarm.minutes === m}
                      className={`flex-1 py-1.5 rounded-xl text-label-sm font-label-sm text-center transition-all ${
                        alarm.minutes === m
                          ? "bg-primary text-on-primary font-bold"
                          : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                      }`}
                    >
                      {toFa(m)} دقیقه
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : hasParams ? (
          <>
            {/* ---------- مسیر یافت نشد ---------- */}
            <PlannerCard
              fromSel={fromSel}
              toSel={toSel}
              fromText={fromText}
              toText={toText}
              openDrop={openDrop}
              setOpenDrop={setOpenDrop}
              onText={onText}
              onPick={onPick}
              onClear={onClearField}
              onSwap={onSwap}
              pref={pref}
              onPref={onPref}
              hint={hint}
              showCta
              onCta={submit}
            />
            <div className="bg-error-container rounded-2xl p-4 flex items-start gap-3">
              <MI name="error" size={20} className="text-on-error-container shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-body-md font-body-md font-bold text-on-error-container">مسیری یافت نشد</p>
                <p className="text-body-sm font-body-sm text-on-error-container/80 mt-1">
                  در حال حاضر مسیری بین این دو ایستگاه پیدا نشد؛ مبدأ یا مقصد را تغییر دهید.
                </p>
              </div>
            </div>
          </>
        ) : (
          /* ---------- حالت ورودی (بدون پارامتر) ---------- */
          <div className="space-y-4">
            <PlannerCard
              fromSel={fromSel}
              toSel={toSel}
              fromText={fromText}
              toText={toText}
              openDrop={openDrop}
              setOpenDrop={setOpenDrop}
              onText={onText}
              onPick={onPick}
              onClear={onClearField}
              onSwap={onSwap}
              pref={pref}
              onPref={onPref}
              hint={hint}
              showCta
              onCta={submit}
            />
            <p className="text-body-sm font-body-sm text-outline text-center px-4">
              ایستگاه مبدأ و مقصد را انتخاب کنید تا سریع‌ترین مسیر با اعلام صوتی برایتان محاسبه شود.
            </p>
          </div>
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
