"use client";

import { Fragment } from "react";
import { getStation, toFa } from "@/lib/metro-data";
import {
  remainingMinutesOf,
  remainingStationsOf,
  useJourney,
} from "@/lib/journey";
import { MI } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   کارت فشرده «سفر فعال» در صفحه اصلی — نوار خطی افقی
   فقط نام ایستگاه‌ها کنار هم، از ایستگاه فعلی تا مقصد،
   روی یک ریل افقی به رنگ خط مترو + برچسب «ایستگاه بعدی».
   لمس هر ایستگاه = اصلاح دستی ایستگاه فعلی (برای داخل تونل).
   ============================================================ */

export default function JourneyCard() {
  const journey = useJourney((s) => s.journey);
  const setCurrentManual = useJourney((s) => s.setCurrentManual);
  const endJourney = useJourney((s) => s.end);
  const { toast } = useToast();

  const remainingStations = journey ? remainingStationsOf(journey) : 0;
  const remainingMin = journey ? remainingMinutesOf(journey) : 0;
  const arrived = journey ? journey.currentIndex === journey.path.length - 1 : false;

  if (!journey) return null;

  const cur = journey.currentIndex;

  /* ایستگاه‌های باقی‌مانده: از ایستگاه فعلی (یا مبدأ تا مشخص شدن موقعیت) تا مقصد */
  const startIdx = cur >= 0 ? cur : 0;
  const remainingPath = journey.path.slice(startIdx);

  const nextSid = cur >= 0 ? journey.path[cur + 1] : journey.path[0];
  const nextName = nextSid ? (getStation(nextSid)?.name ?? null) : null;

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
      <div className="bg-primary/8 dark:bg-primary/15 px-3.5 py-2.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
          <MI name="near_me" size={17} />
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
            {journey.source === "estimate" && !arrived && (
              <span className="text-[9px] font-bold text-outline bg-surface-container dark:bg-surface-container-high px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <MI name="schedule" size={11} className="shrink-0" />
                پیش‌بینی زمانی
              </span>
            )}
          </div>
          <p className="text-[11px] font-bold text-on-surface truncate mt-0.5">
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
          className="h-7 px-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-[10px] font-bold text-error flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
        >
          <MI name="stop_circle" size={13} />
          پایان سفر
        </button>
      </div>

      {/* ---------- پیام رسیدن ---------- */}
      {arrived && (
        <div className="mx-3.5 mt-2 rounded-xl bg-tertiary-fixed/25 dark:bg-tertiary-fixed/15 border border-tertiary/30 px-3 py-1.5 flex items-center gap-2">
          <MI name="celebration" size={15} className="text-tertiary shrink-0" />
          <span className="text-[11px] font-bold text-tertiary">
            به {journey.toName} رسیدید
          </span>
        </div>
      )}

      {/* ---------- نوار خطی افقی ایستگاه‌ها — از ایستگاه فعلی تا مقصد ---------- */}
      {!arrived && (
        <div className="px-2.5 pt-2.5">
          <div className="overflow-x-auto no-scrollbar">
            <div className="flex items-start min-w-max pb-1 pt-0.5 px-1.5">
              {remainingPath.map((sid, k) => {
                const i = startIdx + k;
                const st = getStation(sid);
                const isCurrent = i === cur;
                const isDest = i === journey.path.length - 1;
                const leg = journey.legs[journey.legIndexOf[i] ?? 0] ?? journey.legs[0];
                const nextLeg = journey.legs[(journey.legIndexOf[i] ?? 0) + 1];
                const isTransfer = journey.transferAt.includes(i) && !isDest;
                return (
                  <Fragment key={`${sid}-${i}`}>
                    {/* قطعه ریل بین ایستگاه‌ها — به رنگ خط */}
                    {k > 0 && (
                      <span
                        className="h-[3px] w-4 rounded-full mt-[5px] shrink-0"
                        style={{ backgroundColor: leg.color }}
                        aria-hidden="true"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onPick(sid)}
                      className="flex flex-col items-center gap-1 w-[58px] shrink-0 group"
                      aria-current={isCurrent ? "true" : undefined}
                      title={`تنظیم «${st?.name ?? sid}» به‌عنوان ایستگاه فعلی`}
                    >
                      {/* نقطه روی ریل */}
                      <span
                        className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                          isCurrent
                            ? "border-primary bg-primary shadow-[0_0_0_3px] shadow-primary/25 animate-pulse"
                            : "bg-surface-container-lowest"
                        }`}
                        style={
                          isCurrent
                            ? undefined
                            : isDest
                              ? { borderColor: leg.color, backgroundColor: leg.color }
                              : { borderColor: leg.color }
                        }
                      />
                      {/* نام ایستگاه */}
                      <span
                        className={`text-[9px] leading-[1.25] text-center line-clamp-2 break-words ${
                          isCurrent
                            ? "font-extrabold text-primary"
                            : isDest
                              ? "font-bold text-error"
                              : "font-medium text-on-surface-variant group-hover:text-on-surface"
                        }`}
                      >
                        {st?.name ?? sid}
                      </span>
                      {/* برچسب تعویض خط */}
                      {isTransfer && nextLeg ? (
                        <span className="flex items-center gap-0.5 text-[8px] font-bold text-primary bg-primary/10 px-1 py-px rounded-full">
                          <MI name="swap_horiz" size={9} className="shrink-0" />
                          خط {toFa(nextLeg.number)}
                        </span>
                      ) : (
                        <span className="h-[13px]" aria-hidden="true" />
                      )}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---------- نوار پایین: ایستگاه بعدی + شمارش تا مقصد ---------- */}
      <div className="border-t border-outline-variant/30 px-3 py-1.5 flex items-center justify-between gap-2 text-[10px]">
        <span className="flex items-center gap-1 font-bold text-primary min-w-0">
          <MI name="my_location" size={12} className="shrink-0" />
          <span className="truncate">
            {arrived
              ? "مقصد"
              : cur < 0
                ? "در انتظار موقعیت…"
                : nextName
                  ? `ایستگاه بعدی: ${nextName}`
                  : "مقصد"}
          </span>
        </span>
        <span className="shrink-0 font-medium text-outline flex items-center gap-1">
          <MI name="route" size={12} className="text-primary shrink-0" />
          {arrived
            ? journey.toName
            : `${toFa(remainingStations)} ایستگاه • حدود ${toFa(remainingMin)} دقیقه`}
        </span>
      </div>

      <p className="px-3 pb-1.5 text-[8.5px] text-outline-variant">
        لمس هر ایستگاه = اصلاح ایستگاه فعلی شما
      </p>
    </section>
  );
}
