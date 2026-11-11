"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getLine,
  stationsOfLine,
  timetableFor,
  nextArrivals,
  crowdingNow,
  CROWD_LABEL,
  toFa,
  isWithinService,
  type CrowdLevel,
} from "@/lib/metro-data";
import { PageHeader, MI } from "@/components/metro/shell";
import { useAnnouncer } from "@/components/metro/voice";

/* ============================================================
   جزئیات خط — اطلاعات زنده، تایم‌لاین ایستگاه‌ها و زمان‌بندی
   ============================================================ */

const CROWD_DOT: Record<CrowdLevel, string> = {
  quiet: "bg-emerald-500",
  moderate: "bg-amber-500",
  busy: "bg-red-500",
};

export default function LineDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const announcer = useAnnouncer();

  const line = getLine(params?.id ?? "");
  const stations = useMemo(() => stationsOfLine(line.id), [line.id]);
  const firstStation = stations[0];

  /* ---------- داده‌های زنده ---------- */
  const arrivals = useMemo(
    () =>
      firstStation
        ? nextArrivals(line.id, firstStation.id)
            .slice(0, 2)
            .map((sec) => Math.max(1, Math.ceil(sec / 60)))
        : [],
    [line.id, firstStation]
  );
  const crowd = useMemo(() => crowdingNow(line.id), [line.id]);
  const inService = useMemo(() => isWithinService(line), [line]);
  const timetable = useMemo(() => timetableFor(line.id), [line.id]);

  const crowdPill = (
    <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container-low border border-outline-variant/40 px-2 py-1 rounded-full flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${CROWD_DOT[crowd]}`} />
      {CROWD_LABEL[crowd]}
    </span>
  );

  const onAnnounce = () => {
    if (announcer.speaking) {
      announcer.stop();
      return;
    }
    const nextMin = arrivals[0] ?? line.headway;
    announcer
      .announce(
        `${line.name} از ${line.terminals[0]} تا ${line.terminals[1]}. قطار بعدی ${toFa(nextMin)} دقیقه`
      )
      .catch(() => {});
  };

  return (
    <>
      <PageHeader
        title={line.name}
        subtitle={`${line.terminals[0]} ↔ ${line.terminals[1]}`}
        actions={crowdPill}
      />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        {/* ================= کارت اطلاعات اصلی خط ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3 relative overflow-hidden">
          <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full blur-2xl pointer-events-none opacity-30" style={{ backgroundColor: line.color }} />

          <div className="flex items-start gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 shadow-md leading-none"
              style={{ backgroundColor: line.color, color: line.textOnColor }}
            >
              <span className="text-[9px] font-medium opacity-90">خط</span>
              <span className="text-xl font-bold mt-0.5">{toFa(line.number)}</span>
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="text-sm font-bold text-on-surface">{line.name}</h2>
              <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant font-medium">
                <span className="truncate">{line.terminals[0]}</span>
                <MI name="sync_alt" size={13} className="text-outline shrink-0" />
                <span className="truncate">{line.terminals[1]}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-outline">
                <MI name="swap_vert" size={12} />
                جهت خط: {line.direction}
              </div>
            </div>
          </div>

          {/* آمار سریع */}
          <div className="grid grid-cols-3 gap-2 text-center py-2 border-y border-outline-variant/20">
            <div className="flex flex-col items-center justify-center gap-0.5">
              <MI name="schedule" size={15} className="text-primary" />
              <span className="text-xs font-bold text-on-surface">هر {toFa(line.headway)} دقیقه</span>
              <span className="text-[9px] text-outline">فاصله قطارها</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-0.5 border-x border-outline-variant/20">
              <MI name="wb_twilight" size={15} className="text-primary" />
              <span className="text-xs font-bold text-on-surface" dir="ltr">
                {toFa(line.firstTrain)} - {toFa(line.lastTrain)}
              </span>
              <span className="text-[9px] text-outline">ساعت سرویس</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-0.5">
              {inService ? (
                <>
                  <MI name="check_circle" size={15} className="text-tertiary" />
                  <span className="text-xs font-bold text-tertiary">در حال سرویس</span>
                  <span className="text-[9px] text-outline">وضعیت شبکه</span>
                </>
              ) : (
                <>
                  <MI name="bedtime" size={15} className="text-outline" />
                  <span className="text-xs font-bold text-outline">خارج از سرویس</span>
                  <span className="text-[9px] text-outline">وضعیت شبکه</span>
                </>
              )}
            </div>
          </div>

          {/* ورود بعدی قطار — زنده */}
          <div className="bg-surface-container-low rounded-xl p-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="text-[10px] text-outline shrink-0">ورود بعدی از {firstStation ? firstStation.name : "مبدأ"}:</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {arrivals.map((m, i) => (
                <span
                  key={i}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    i === 0 ? "text-primary bg-primary/10" : "text-on-surface-variant bg-surface-container"
                  }`}
                >
                  {i === 0 ? "بعدی: " : "سپس: "}
                  {toFa(m)} دقیقه
                </span>
              ))}
            </div>
          </div>

          {/* هشدار وضعیت خط */}
          {line.status === "delay" && (
            <div className="bg-error-container text-on-error-container rounded-xl text-[10px] px-2 py-1.5 font-bold flex items-center gap-1.5">
              <MI name="warning" size={13} />
              تاخیر در سرویس{line.statusNote ? ` — ${line.statusNote}` : ""}
            </div>
          )}
          {line.status === "closed" && (
            <div className="bg-error-container text-on-error-container rounded-xl text-[10px] px-2 py-1.5 font-bold flex items-center gap-1.5">
              <MI name="block" size={13} />
              خط مسدود است{line.statusNote ? ` — ${line.statusNote}` : ""}
            </div>
          )}
        </section>

        {/* ================= تایم‌لاین ایستگاه‌ها ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-1">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <MI name="timeline" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">مسیر ایستگاه‌ها</h3>
            </div>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {toFa(stations.length)} ایستگاه
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto pretty-scroll pl-1">
            {stations.map((st, i) => {
              const others = st.lines.filter((l) => l.lineId !== line.id);
              const isInterchange = others.length > 0;
              const isLast = i === stations.length - 1;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => router.push(`/stations/${st.id}`)}
                  className="w-full flex items-stretch gap-3 text-right group active:scale-[0.99] transition-all"
                >
                  {/* ستون نشانگر خطی */}
                  <div className="flex flex-col items-center w-3.5 shrink-0 py-0.5">
                    {isInterchange ? (
                      <span
                        className="w-4 h-4 rounded-full bg-surface-container-lowest shrink-0"
                        style={{ border: `2px solid ${line.color}` }}
                      />
                    ) : (
                      <span
                        className="w-3.5 h-3.5 rounded-full ring-2 ring-surface-container-lowest shrink-0"
                        style={{ backgroundColor: line.color }}
                      />
                    )}
                    {!isLast && (
                      <span
                        className="line-dashed flex-1 w-0.5 my-0.5 rounded-full"
                        style={{ "--tw-line-color": line.color } as React.CSSProperties}
                      />
                    )}
                  </div>

                  {/* اطلاعات ایستگاه */}
                  <div
                    className={`flex-1 min-w-0 flex items-center justify-between gap-2 pb-4 ${
                      isLast ? "pb-1" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                          {st.name}
                        </span>
                        {st.featured && <MI name="star" size={13} className="text-amber-500 shrink-0" />}
                      </div>
                      {isInterchange && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className="text-[9px] font-bold text-cyan-800 bg-cyan-50 px-1.5 py-0.5 rounded-full">
                            تقاطعی
                          </span>
                          {others.map((ol) => {
                            const otherLine = getLine(ol.lineId);
                            return (
                              <span
                                key={ol.lineId}
                                className="w-3.5 h-3.5 rounded flex items-center justify-center text-[8px] font-bold shadow-sm"
                                style={{ backgroundColor: otherLine.color, color: otherLine.textOnColor }}
                              >
                                {toFa(otherLine.number)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <MI
                      name="chevron_left"
                      size={16}
                      className="text-outline-variant shrink-0 self-center group-hover:text-primary transition-colors"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ================= جدول زمان‌بندی ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-2.5">
          <div className="flex items-center gap-2">
            <MI name="table_chart" size={20} className="text-primary" />
            <h3 className="font-bold text-xs text-on-surface">جدول زمان‌بندی حرکت قطارها</h3>
          </div>

          <div className="space-y-2">
            {timetable.map((row) => (
              <div
                key={row.direction}
                className="bg-surface-container-low rounded-xl px-3 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-on-surface truncate">{row.direction}</p>
                  <p className="text-[10px] text-outline mt-0.5">
                    اولین قطار {row.first} • آخرین قطار {row.last}
                  </p>
                </div>
                <div className="flex flex-col items-stretch gap-1 shrink-0">
                  <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full text-center whitespace-nowrap">
                    ساعت پیک: {row.headwayPeak}
                  </span>
                  <span className="text-[9px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full text-center whitespace-nowrap">
                    غیرپیک: {row.headwayOff}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ================= اکشن پایانی ================= */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/stations?line=${line.id}`)}
            className="flex-1 bg-primary-container text-white rounded-xl font-bold text-xs py-2.5 shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 hover:shadow-md"
          >
            <MI name="near_me" size={16} />
            مسیریابی از این خط
            <MI name="chevron_left" size={16} />
          </button>
          <button
            type="button"
            onClick={onAnnounce}
            aria-label={announcer.speaking ? "توقف پخش صوتی" : "اعلام صوتی اطلاعات خط"}
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 active:scale-95 transition-all shadow-sm ${
              announcer.speaking
                ? "bg-error text-on-error"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            {announcer.speaking ? <MI name="stop" size={20} /> : <MI name="volume_up" size={20} />}
          </button>
        </div>

        {announcer.error && (
          <p className="text-center text-[10px] text-error">{announcer.error}</p>
        )}

        <p className="text-center text-[10px] text-outline-variant pt-1">
          فاصله قطارها و وضعیت ازدحام به‌صورت زنده محاسبه می‌شود
        </p>
      </main>
    </>
  );
}
