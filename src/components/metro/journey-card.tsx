"use client";

import { useEffect, useRef } from "react";
import { getStation, toFa } from "@/lib/metro-data";
import {
  remainingMinutesOf,
  remainingStationsOf,
  useJourney,
} from "@/lib/journey";
import { MI } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   کارت «سفر فعال» در صفحه اصلی — نمایش ایستگاه‌به‌ایستگاه
   وقتی مسیری از صفحه مسیریابی شروع شود، این کارت بالای صفحه
   اصلی ظاهر می‌شود: مسیر کامل با ایستگاه‌ها، جایگاه فعلی شما
   (GPS یا دستی)، ایستگاه تعویض خط و شمارش تا مقصد.
   لمس هر ایستگاه = اصلاح دستی ایستگاه فعلی (برای داخل تونل
   که GPS اعلام نمی‌کند).
   ============================================================ */

export default function JourneyCard() {
  const journey = useJourney((s) => s.journey);
  const setCurrentManual = useJourney((s) => s.setCurrentManual);
  const endJourney = useJourney((s) => s.end);
  const { toast } = useToast();

  const remainingStations = journey ? remainingStationsOf(journey) : 0;
  const remainingMin = journey ? remainingMinutesOf(journey) : 0;
  const arrived = journey ? journey.currentIndex === journey.path.length - 1 : false;

  /* همیشه ایستگاه فعلی در دید باشد — بدون دست‌کاری دستی اسکرول کاربر */
  const currentRowRef = useRef<HTMLButtonElement | null>(null);
  const curIdx = journey?.currentIndex ?? -1;
  const curStationId = journey?.currentStationId ?? null;
  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [curStationId, curIdx]);

  if (!journey) return null;

  const cur = journey.currentIndex;

  const onPick = (stationId: string) => {
    if (!journey) return;
    setCurrentManual(stationId);
    const name = getStation(stationId)?.name ?? "";
    toast({ title: "ایستگاه فعلی بروزرسانی شد", description: name });
  };

  return (
    <section
      className="bg-surface-container-lowest rounded-2xl border border-primary/25 shadow-sm overflow-hidden"
      aria-label="سفر فعال"
    >
      {/* ---------- سربرگ سفر ---------- */}
      <div className="bg-primary/8 dark:bg-primary/15 px-4 py-3 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
          <MI name="near_me" size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
              سفر فعال
            </span>
            {journey.source === "gps" && (
              <span className="text-[9px] font-bold text-tertiary bg-tertiary-fixed/40 dark:bg-tertiary-fixed/25 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                GPS زنده
              </span>
            )}
            {journey.source === "estimate" && (
              <span className="text-[9px] font-bold text-outline bg-surface-container dark:bg-surface-container-high px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <MI name="schedule" size={11} className="shrink-0" />
                پیش‌بینی زمانی
              </span>
            )}
            {arrived && (
              <span className="text-[9px] font-bold text-tertiary bg-tertiary-fixed/40 dark:bg-tertiary-fixed/25 px-1.5 py-0.5 rounded-full">
                رسیدید
              </span>
            )}
          </div>
          <p className="text-xs font-bold text-on-surface truncate mt-0.5">
            {journey.fromName} ← {journey.toName}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            endJourney();
            toast({ title: "سفر پایان یافت" });
          }}
          aria-label="پایان سفر"
          className="h-8 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-[10px] font-bold text-error flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
        >
          <MI name="stop_circle" size={14} />
          پایان سفر
        </button>
      </div>

      {/* ---------- نشان خطوط ---------- */}
      <div className="px-4 pt-2.5 flex flex-wrap items-center gap-1.5">
        {journey.legs.map((leg, i) => (
          <span
            key={`${leg.lineId}-${i}`}
            className="text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: leg.color, color: leg.textOnColor }}
          >
            خط {toFa(leg.number)}
          </span>
        ))}
        <span className="text-[10px] text-outline mr-auto">
          حدود {toFa(journey.totalMinutes)} دقیقه • {toFa(journey.totalStations)} ایستگاه
        </span>
      </div>

      {/* ---------- پیام رسیدن ---------- */}
      {arrived && (
        <div className="mx-4 mt-2.5 rounded-xl bg-tertiary-fixed/25 dark:bg-tertiary-fixed/15 border border-tertiary/30 px-3 py-2 flex items-center gap-2">
          <MI name="celebration" size={17} className="text-tertiary shrink-0" />
          <span className="text-[11px] font-bold text-tertiary">
            به {journey.toName} رسیدید — سفر با موفقیت پایان یافت
          </span>
        </div>
      )}

      {/* ---------- فهرست ایستگاه‌به‌ایستگاه ---------- */}
      <div className="px-2.5 pt-2 pb-1">
        <div className="max-h-72 overflow-y-auto pretty-scroll py-1">
          {journey.path.map((sid, i) => {
            const st = getStation(sid);
            const isCurrent = i === cur;
            const isPast = cur >= 0 && i < cur;
            const isDest = i === journey.path.length - 1;
            const isTransfer = journey.transferAt.includes(i);
            const leg = journey.legs[journey.legIndexOf[i] ?? 0] ?? journey.legs[0];
            const nextLeg = journey.legs[(journey.legIndexOf[i] ?? 0) + 1];
            return (
              <button
                key={`${sid}-${i}`}
                type="button"
                ref={i === cur ? currentRowRef : undefined}
                onClick={() => onPick(sid)}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-right transition-colors ${
                  isCurrent ? "bg-primary/10" : "hover:bg-surface-container"
                }`}
                aria-current={isCurrent ? "true" : undefined}
              >
                {/* ستون نشانگر */}
                <span className="flex flex-col items-center shrink-0 self-stretch">
                  <span
                    className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                      isCurrent
                        ? "border-primary bg-primary shadow-[0_0_0_3px] shadow-primary/25 animate-pulse"
                        : isPast
                          ? "border-transparent"
                          : "border-outline-variant bg-surface-container-lowest"
                    }`}
                    style={isPast ? { backgroundColor: leg.color } : isDest ? { borderColor: leg.color } : undefined}
                  />
                  {i < journey.path.length - 1 && (
                    <span
                      className="w-[2px] flex-1 min-h-4 my-0.5 rounded-full"
                      style={{ backgroundColor: isPast ? leg.color : "var(--color-outline-variant)" }}
                    />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-xs truncate ${
                        isCurrent
                          ? "font-extrabold text-primary"
                          : isPast
                            ? "text-outline line-through decoration-1"
                            : "font-bold text-on-surface"
                      }`}
                    >
                      {st?.name ?? sid}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] font-bold text-on-primary bg-primary px-1.5 py-0.5 rounded-full shrink-0">
                        ایستگاه فعلی
                      </span>
                    )}
                    {isDest && !arrived && (
                      <span className="text-[9px] font-bold text-error bg-error-container/60 px-1.5 py-0.5 rounded-full shrink-0">
                        مقصد
                      </span>
                    )}
                  </span>
                  {(isTransfer || i === 0) && (
                    <span className="flex items-center gap-1 mt-0.5">
                      <MI name="swap_horiz" size={11} className="text-outline shrink-0" />
                      <span className="text-[9px] text-outline">
                        {i === 0
                          ? `سوار خط ${toFa(leg.number)} شوید`
                          : `تعویض به خط ${toFa(nextLeg?.number ?? leg.number)}`}
                      </span>
                    </span>
                  )}
                </span>

                {!isCurrent && !isPast && (
                  <MI name="radio_button_unchecked" size={13} className="text-outline-variant/60 shrink-0" />
                )}
                {isCurrent && <MI name="my_location" size={14} className="text-primary shrink-0" />}
                {isPast && <MI name="check" size={13} className="text-tertiary shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- پایین کارت: شمارش تا مقصد ---------- */}
      <div className="border-t border-outline-variant/30 px-4 py-2 flex items-center justify-between text-[10px]">
        <span className="flex items-center gap-1.5 text-outline font-medium">
          <MI name="route" size={13} className="text-primary" />
          {arrived
            ? "مقصد"
            : `${toFa(remainingStations)} ایستگاه تا ${journey.toName}`}
        </span>
        {!arrived && cur >= 0 && (
          <span className="font-bold text-primary">حدود {toFa(remainingMin)} دقیقه</span>
        )}
        {cur < 0 && (
          <span className="font-bold text-outline">در انتظار موقعیت…</span>
        )}
      </div>

      <p className="px-4 pb-2.5 text-[9px] text-outline-variant leading-relaxed">
        با GPS یا بر پایه زمان‌بندی سفر، رسیدن قطار به هر ایستگاه اعلام می‌شود؛ اگر جای شما اشتباه بود، ایستگاه فعلی را لمس کنید.
      </p>
    </section>
  );
}
