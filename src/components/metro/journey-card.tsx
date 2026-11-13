"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { getStation, toFa } from "@/lib/metro-data";
import {
  remainingMinutesOf,
  remainingStationsOf,
  useJourney,
} from "@/lib/journey";
import { MI } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ============================================================
   کارت فشرده «سفر فعال» در صفحه اصلی — نوار خطی افقی
   فقط نام ایستگاه‌ها کنار هم، از ایستگاه فعلی تا مقصد،
   روی یک ریل افقی به رنگ خط مترو + برچسب «ایستگاه بعدی».
   اصلاح موقعیت: دکمه واضح «اصلاح موقعیت» + دیالوگ انتخاب
   ایستگاه فعلی (برای داخل تونل که GPS اعلام نمی‌کند) —
   لمس مستقیم ایستگاه روی نوار هم همچنان کار می‌کند.
   بعد از شروع سفر از صفحه مسیریابی، صفحه اصلی خودکار
   روی همین کارت اسکرول می‌کند (فلگ sessionStorage).
   ============================================================ */

const SCROLL_FLAG_KEY = "metrojo-scroll-journey";

export default function JourneyCard() {
  const journey = useJourney((s) => s.journey);
  const setCurrentManual = useJourney((s) => s.setCurrentManual);
  const endJourney = useJourney((s) => s.end);
  const { toast } = useToast();

  const [pickerOpen, setPickerOpen] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);

  const remainingStations = journey ? remainingStationsOf(journey) : 0;
  const remainingMin = journey ? remainingMinutesOf(journey) : 0;
  const arrived = journey ? journey.currentIndex === journey.path.length - 1 : false;

  /* اسکرول خودکار روی کارت سفر — وقتی تازه از صفحه مسیریابی آمده‌ایم */
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SCROLL_FLAG_KEY) === "1") {
        sessionStorage.removeItem(SCROLL_FLAG_KEY);
        const t = window.setTimeout(() => {
          cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 450);
        return () => window.clearTimeout(t);
      }
    } catch {
      /* حافظه در دسترس نیست */
    }
  }, []);

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
    setPickerOpen(false);
  };

  return (
    <section
      ref={cardRef}
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
        {/* دکمه اصلاح موقعیت — واضح و قابل کشف */}
        {!arrived && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label="اصلاح موقعیت فعلی"
            className="h-7 px-2 rounded-lg bg-primary/10 border border-primary/30 text-[10px] font-bold text-primary flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
          >
            <MI name="my_location" size={13} />
            اصلاح موقعیت
          </button>
        )}
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

      {/* ---------- دیالوگ اصلاح موقعیت فعلی ---------- */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MI name="my_location" size={18} className="text-primary shrink-0" />
              اصلاح موقعیت فعلی
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              ایستگاهی که الان در آن هستید را انتخاب کنید — بعد از تونل یا وقتی GPS دقت ندارد، اینجا می‌توانید موقعیت را دستی درست کنید
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[46vh] overflow-y-auto pretty-scroll -mx-1 px-1 space-y-1">
            {journey.path.map((sid, i) => {
              const st = getStation(sid);
              const isCurrent = i === cur;
              const isDest = i === journey.path.length - 1;
              const nextLeg = journey.legs[(journey.legIndexOf[i] ?? 0) + 1];
              const isTransfer = journey.transferAt.includes(i) && !isDest;
              return (
                <button
                  key={`${sid}-${i}`}
                  type="button"
                  onClick={() => onPick(sid)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-right transition-colors ${
                    isCurrent
                      ? "bg-primary/10 border-primary/40"
                      : "bg-surface-container-lowest border-outline-variant/30 hover:bg-surface-container"
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-surface-container text-[10px] font-bold text-outline flex items-center justify-center shrink-0">
                    {toFa(i + 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm truncate ${
                        isCurrent
                          ? "font-extrabold text-primary"
                          : isDest
                            ? "font-bold text-error"
                            : "font-medium text-on-surface"
                      }`}
                    >
                      {st?.name ?? sid}
                    </span>
                    {isTransfer && nextLeg && (
                      <span className="text-[9px] font-bold text-primary flex items-center gap-0.5 mt-0.5">
                        <MI name="swap_horiz" size={10} className="shrink-0" />
                        تعویض به خط {toFa(nextLeg.number)}
                      </span>
                    )}
                  </span>
                  {isCurrent && (
                    <span className="flex items-center gap-1 text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">
                      <MI name="my_location" size={11} className="shrink-0" />
                      موقعیت فعلی
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
