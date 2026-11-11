"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  LINES,
  STATIONS,
  getLine,
  toFa,
  crowdingNow,
  CROWD_LABEL,
  type CrowdLevel,
  type LineDef,
  type StationDef,
} from "@/lib/metro-data";
import { AppBar, MI, useInitCity, useShell } from "@/components/metro/shell";

/* ============================================================
   خطوط و نقشه — فهرست خطوط شهر انتخابی + ایستگاه‌های تقاطعی
   ============================================================ */

const CROWD_DOT: Record<CrowdLevel, string> = {
  quiet: "bg-emerald-500",
  moderate: "bg-amber-500",
  busy: "bg-red-500",
};

/** نشان رنگی خط (کوچک، مربع با گوشه گرد) */
function LineChip({ number, color, textOn }: { number: number; color: string; textOn: string }) {
  return (
    <span
      className="w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 shadow-sm"
      style={{ backgroundColor: color, color: textOn }}
    >
      {toFa(number)}
    </span>
  );
}

/** کارت خط — نشان رنگی + ترمینال‌ها + فاصله قطار + ازدحام زنده */
function LineCard({ line, onOpen }: { line: LineDef; onOpen: () => void }) {
  const crowd = crowdingNow(line.id);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-right bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm hover:border-primary/30 hover:shadow-md active:scale-[0.98] transition-all group"
    >
      <div className="flex items-start gap-3">
        {/* نشان خط */}
        <div
          className="w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-sm leading-none"
          style={{ backgroundColor: line.color, color: line.textOnColor }}
        >
          <span className="text-[8px] font-medium opacity-90">خط</span>
          <span className="text-base font-bold mt-0.5">{toFa(line.number)}</span>
        </div>

        {/* اطلاعات خط */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-on-surface truncate">{line.name}</h4>
            <MI
              name="chevron_left"
              size={18}
              className="text-outline shrink-0 group-hover:text-primary group-hover:-translate-x-0.5 transition-all"
            />
          </div>

          {/* ترمینال‌ها */}
          <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant font-medium">
            <span className="truncate">{line.terminals[0]}</span>
            <MI name="sync_alt" size={13} className="text-outline shrink-0" />
            <span className="truncate">{line.terminals[1]}</span>
          </div>

          {/* فاصله قطار + ساعت سرویس */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[10px] text-outline">
            <span className="flex items-center gap-1">
              <MI name="schedule" size={12} />
              قطار هر {toFa(line.headway)} دقیقه
            </span>
            <span className="flex items-center gap-1" dir="ltr">
              <MI name="timelapse" size={12} />
              {toFa(line.firstTrain)} - {toFa(line.lastTrain)}
            </span>
          </div>

          {/* ازدحام زنده + هشدار وضعیت */}
          <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
            <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-full flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${CROWD_DOT[crowd]}`} />
              {CROWD_LABEL[crowd]}
            </span>
            {line.status === "delay" && (
              <span className="bg-error-container text-on-error-container rounded-xl text-[10px] px-2 py-1 font-bold flex items-center gap-1">
                <MI name="warning" size={11} />
                تاخیر در سرویس
              </span>
            )}
            {line.status === "closed" && (
              <span className="bg-error-container text-on-error-container rounded-xl text-[10px] px-2 py-1 font-bold flex items-center gap-1">
                <MI name="block" size={11} />
                خط مسدود است
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/** ردیف ایستگاه تقاطعی */
function InterchangeRow({ station, onOpen }: { station: StationDef; onOpen: () => void }) {
  const label = `تقاطع ${station.lines.map((l) => toFa(getLine(l.lineId)?.number ?? 0)).join(" و ")}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-surface-container-low active:scale-[0.98] transition-all text-right"
    >
      <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center shrink-0">
        <MI name="swap_calls" size={16} className="text-cyan-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-on-surface truncate">{station.name}</p>
        <div className="flex items-center gap-1 mt-1">
          {station.lines.map((l) => {
            const ol = getLine(l.lineId);
            return <LineChip key={l.lineId} number={ol.number} color={ol.color} textOn={ol.textOnColor} />;
          })}
        </div>
      </div>
      <span className="text-[10px] font-bold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-full shrink-0">
        {label}
      </span>
      <MI name="chevron_left" size={16} className="text-outline-variant shrink-0" />
    </button>
  );
}

export default function LinesPage() {
  const router = useRouter();
  useInitCity();
  const city = useShell((s) => s.city);

  const cityLines = useMemo(() => LINES.filter((l) => l.cityId === city), [city]);
  const interchanges = useMemo(
    () => STATIONS.filter((s) => s.lines.length > 1 && s.cityId === city),
    [city]
  );

  return (
    <>
      <AppBar />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        {/* ================= خطوط شبکه مترو ================= */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MI name="route" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">خطوط شبکه مترو</h3>
            </div>
            <span className="text-[10px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              بروزرسانی زنده
            </span>
          </div>

          <div className="space-y-2.5">
            {cityLines.map((line) => (
              <LineCard key={line.id} line={line} onOpen={() => router.push(`/lines/${line.id}`)} />
            ))}
          </div>
        </section>

        {/* ================= ایستگاه‌های تقاطعی ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-2">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-2">
              <MI name="swap_calls" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">همه ایستگاه‌های تقاطعی</h3>
            </div>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {toFa(interchanges.length)} ایستگاه
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto pretty-scroll space-y-0.5">
            {interchanges.map((s) => (
              <InterchangeRow key={s.id} station={s} onOpen={() => router.push(`/stations/${s.id}`)} />
            ))}
          </div>
        </section>

        {/* ================= لینک نقشه تعاملی ================= */}
        <button
          type="button"
          onClick={() => router.push("/map")}
          className="w-full flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl p-4 text-right hover:bg-primary/10 active:scale-[0.98] transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center text-primary shrink-0 transition-colors">
            <MI name="map" size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-primary">مشاهده نقشه تعاملی شبکه</p>
            <p className="text-[10px] text-outline mt-0.5">بزرگ‌نمایی، جابجایی و انتخاب ایستگاه‌ها</p>
          </div>
          <MI
            name="chevron_left"
            size={18}
            className="text-primary shrink-0 group-hover:-translate-x-0.5 transition-all"
          />
        </button>

        <p className="text-center text-[10px] text-outline-variant pt-1">
          اطلاعات خطوط به‌صورت زنده به‌روزرسانی می‌شود
        </p>
      </main>
    </>
  );
}
