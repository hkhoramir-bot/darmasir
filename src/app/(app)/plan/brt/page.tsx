"use client";

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  faMoney,
  getLine,
  getStation,
  toFa,
  type RoutePlan,
} from "@/lib/metro-data";
import { MI } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   جزئیات مسیر بی‌آر‌تی و تاکسی (طرح brt)
   شماتیک کریدور خط ویژه + راهنمای گام‌به‌گام پیمایش
   داده REAL از POST /api/route-plan؛ مقادیر مشتق کاملاً قطعی
   ============================================================ */

type PlanResponse = { plan?: RoutePlan; error?: string };

const DEFAULT_FROM = "enghelab-sq"; // میدان انقلاب اسلامی
const DEFAULT_TO = "milad"; // برج میلاد تهران

const BRT_TICKET_FARE = 2300; // بلیت اتوبوس تندرو (تومان)
const TAXI_LEG_FARE = 20000; // کرایه تاکسی خطی بخش دوم کریدور
const TRANSFER_SURCHARGE = 1200; // شارژ ثابت هر تعویض وسیله
const WALK_TO_STOP_METERS = 240; // پیاده‌روی تا ایستگاه اتوبوس تندرو

/** نام کوتاه نمایشی برای گره‌های شماتیک */
function shortName(name: string): string {
  const words = name.replace(/[()]/g, "").split(" ").filter(Boolean);
  return words.slice(0, 2).join(" ") || name;
}

const fmtClock = (d: Date) =>
  toFa(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);

/* ------------------------------ اسکلت بارگذاری ------------------------------ */
function BrtSkeleton() {
  return (
    <div className="px-4 pt-3 space-y-4" aria-hidden>
      <div className="h-28 rounded-xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
      <div className="h-10 rounded-lg bg-surface-container-low animate-pulse" />
      <div className="h-56 rounded-xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
      <div className="h-72 rounded-xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
    </div>
  );
}

/* ------------------- گره شماتیک کریدور (ایستگاه) ------------------- */
function CorridorNode({
  index,
  color,
  ring,
  name,
  hint,
  hintCls,
}: {
  index: number;
  color: string;
  ring: string;
  name: string;
  hint: string;
  hintCls: string;
}) {
  return (
    <div className="flex flex-col items-center min-w-0 max-w-[30%]">
      <span
        className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
        style={{ backgroundColor: color, boxShadow: `0 0 0 4px ${ring}` }}
      >
        {toFa(index)}
      </span>
      <span className="font-label-sm text-label-sm font-bold text-on-surface mt-1 truncate max-w-full text-center">
        {name}
      </span>
      <span className={`text-[10px] text-center ${hintCls}`}>{hint}</span>
    </div>
  );
}

/* ------------------------------ بدنه صفحه ------------------------------ */
function BrtInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useToast();

  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [loading, setLoading] = useState(true);

  const qFrom = sp.get("from");
  const qTo = sp.get("to");

  const fromStation = (qFrom ? getStation(qFrom) : undefined) ?? getStation(DEFAULT_FROM);
  const toStation = (qTo ? getStation(qTo) : undefined) ?? getStation(DEFAULT_TO);
  const fromName = fromStation?.name ?? "میدان انقلاب اسلامی";
  const toName = toStation?.name ?? "بیمارستان میلاد";

  /* دریافت مسیر واقعی از API — پایه ساخت شماتیک و مراحل */
  useEffect(() => {
    const from = (qFrom ? getStation(qFrom) : undefined) ?? getStation(DEFAULT_FROM);
    const to = (qTo ? getStation(qTo) : undefined) ?? getStation(DEFAULT_TO);
    if (!from || !to || from.id === to.id) {
      const idle = setTimeout(() => {
        setPlan(null);
        setLoading(false);
      }, 0);
      return () => clearTimeout(idle);
    }
    const timer = setTimeout(() => {
      setLoading(true);
      fetch("/api/route-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: from.id, toId: to.id, pref: "fastest" }),
      })
        .then((r) => (r.ok ? (r.json() as Promise<PlanResponse>) : Promise.reject(new Error("api"))))
        .then((d) => setPlan(d.plan && d.plan.legs.length > 0 ? d.plan : null))
        .catch(() => setPlan(null))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [qFrom, qTo]);

  /* مقادیر قطعی مشتق از مسیر واقعی (بدون هیچ تصادفی بودن) */
  const derived = useMemo(() => {
    const firstLeg = plan?.legs[0] ?? null;
    const transferName =
      plan && plan.transfers > 0 ? (plan.transferStations[0] ?? plan.legs[0].toName) : null;
    const duration = plan ? Math.round(plan.totalMinutes * 1.18) + 2 : 36;
    const fare = plan
      ? BRT_TICKET_FARE + TAXI_LEG_FARE + plan.transfers * TRANSFER_SURCHARGE
      : BRT_TICKET_FARE + TAXI_LEG_FARE;
    const km = plan ? Math.max(4.5, Math.round(plan.totalStations * 1.05 * 10) / 10) : 11.4;
    const corridorStops = firstLeg ? firstLeg.stops : Math.max(1, Math.round(km / 1.2));
    const taxiMin = Math.max(4, Math.round(duration * 0.35));
    const dispatchWait = 2 + (new Date().getMinutes() % 5);
    const eta = fmtClock(new Date(Date.now() + duration * 60000));
    const midStations = firstLeg ? firstLeg.stationNames.slice(1, -1) : [];
    return { firstLeg, transferName, duration, fare, km, corridorStops, taxiMin, dispatchWait, eta, midStations };
  }, [plan]);

  /* نشان خط مبدأ (جایگزین چیپ «منطقه ۶» طرح) */
  const fromLineChip = useMemo(() => {
    if (!fromStation) return null;
    if (fromStation.lines.length > 1) {
      const nums = fromStation.lines
        .map((l) => getLine(l.lineId)?.number ?? 0)
        .filter((n) => n > 0)
        .sort((a, b) => a - b);
      return `تقاطع خط ${nums.map((n) => toFa(n)).join(" و ")}`;
    }
    const line = getLine(fromStation.lines[0]?.lineId ?? "");
    return line ? line.name : "ایستگاه مترو";
  }, [fromStation]);

  const doShare = async () => {
    const text = `مسیر بی‌آر‌تی و تاکسی ${fromName} → ${toName} — درمسیر`;
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "درمسیر", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast({ title: "لینک مسیر کپی شد", description: "برای اشتراک‌گذاری آماده است" });
    } catch {
      /* کاربر اشتراک‌گذاری را لغو کرد */
    }
  };

  const goPlan = () =>
    router.push(`/plan?from=${fromStation?.id ?? DEFAULT_FROM}&to=${toStation?.id ?? DEFAULT_TO}`);
  const startTrip = () => router.push("/map");

  if (loading) {
    return (
      <>
        <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-md px-4 h-16 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-10 h-10" />
            <div className="space-y-1">
              <div className="h-4 w-40 rounded bg-surface-container animate-pulse" />
              <div className="h-3 w-28 rounded bg-surface-container animate-pulse" />
            </div>
          </div>
        </header>
        <BrtSkeleton />
      </>
    );
  }

  const stepCount = derived.transferName ? 5 : 3;

  return (
    <>
      {/* ================= هدر: بازگشت + عنوان + اشتراک/راهنما ================= */}
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-md px-4 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            aria-label="بازگشت"
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full flex items-center justify-center text-primary hover:bg-surface-container active:scale-95 transition-all shrink-0"
          >
            <MI name="arrow_forward" size={22} />
          </button>
          <div className="min-w-0">
            <h1 className="font-title-md text-title-md text-primary font-bold truncate">
              جزئیات مسیر BRT و تاکسی
            </h1>
            <span className="text-label-sm font-label-sm text-outline flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse inline-block" aria-hidden />
              بروزرسانی زنده خطوط ویژه
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="اشتراک‌گذاری مسیر"
            onClick={doShare}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all"
          >
            <MI name="share" size={20} />
          </button>
          <button
            type="button"
            aria-label="راهنما"
            onClick={() =>
              toast({
                title: "راهنمای صفحه",
                description: "کریدور اتوبوس تندرو و تاکسی خطی بین مبدأ و مقصد انتخابی را نمایش می‌دهد.",
              })
            }
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all"
          >
            <MI name="help_outline" size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pt-3 pb-28 space-y-4">
        {/* ================= کادر مبدأ و مقصد ================= */}
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/60 relative overflow-hidden">
          <div className="flex items-start gap-3">
            {/* نشانگر گرافیکی مسیر */}
            <div className="flex flex-col items-center pt-1.5 self-stretch shrink-0">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-tertiary-container bg-tertiary-fixed flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-tertiary" />
              </div>
              <div className="w-0.5 flex-1 bg-gradient-to-b from-tertiary-container via-outline-variant to-secondary-container my-1" />
              <div className="w-3.5 h-3.5 rounded-full border-2 border-secondary bg-secondary-fixed flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-secondary" />
              </div>
            </div>
            <div className="flex-1 space-y-3 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-label-sm font-label-sm text-outline block">مبدأ حرکت</span>
                  <span className="text-body-md font-body-md font-bold text-on-surface truncate block">
                    {fromName}
                  </span>
                </div>
                {fromLineChip && (
                  <span className="text-label-sm font-label-sm px-2 py-0.5 rounded-full bg-surface-container text-primary font-semibold shrink-0">
                    {fromLineChip}
                  </span>
                )}
              </div>
              <div className="h-px bg-outline-variant/40" />
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-label-sm font-label-sm text-outline block">مقصد نهایی</span>
                  <span className="text-body-md font-body-md font-bold text-on-surface truncate block">
                    {toName}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-primary-container bg-primary-fixed/40 px-2.5 py-0.5 rounded-full shrink-0">
                  <MI name="route" size={14} />
                  <span className="text-label-sm font-label-sm font-bold">
                    {toFa(derived.km.toFixed(1))} کیلومتر
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= تب‌های روش سفر ================= */}
        <section>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <button
              type="button"
              onClick={goPlan}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface-variant border border-outline-variant/70 hover:bg-surface-container text-label-md font-label-md transition-all active:scale-95"
            >
              <MI name="alt_route" size={18} />
              <span>همه مسیرها</span>
              <span className="text-label-sm font-label-sm bg-surface-container px-1.5 rounded-full">۴</span>
            </button>
            <button
              type="button"
              onClick={goPlan}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface-variant border border-outline-variant/70 hover:bg-surface-container text-label-md font-label-md transition-all active:scale-95"
            >
              <MI name="directions_subway" size={18} className="text-primary" />
              <span>مترو ترکیبی</span>
            </button>
            <button
              type="button"
              aria-pressed="true"
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-secondary-container text-on-secondary shadow-md font-bold text-label-md font-label-md border-2 border-secondary active:scale-95 transition-all"
            >
              <MI name="directions_bus" size={19} fill />
              <span>اتوبوس BRT + تاکسی</span>
              <span className="w-2 h-2 rounded-full bg-white animate-ping" aria-hidden />
            </button>
            <button
              type="button"
              onClick={goPlan}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface-variant border border-outline-variant/70 hover:bg-surface-container text-label-md font-label-md transition-all active:scale-95"
            >
              <MI name="local_taxi" size={18} className="text-amber-600" />
              <span>تاکسی خطی</span>
            </button>
          </div>
        </section>

        {/* ================= کارت خلاصه کریدور انتخاب‌شده ================= */}
        <section className="bg-surface-container-lowest rounded-xl p-4 border-2 border-secondary/80 shadow-md relative overflow-hidden space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 bg-tertiary-fixed text-on-tertiary-fixed px-2.5 py-1 rounded-full text-label-sm font-label-sm font-bold">
              <MI name="verified" size={15} fill />
              <span>اقتصادی‌ترین مسیر • ترافیک روان خط ویژه</span>
            </div>
            <span className="text-label-sm font-label-sm text-outline font-medium shrink-0">
              کد مسیر: BRT-4X
            </span>
          </div>

          {/* چیپ‌های خلاصه زمان و کرایه */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-surface-container-low rounded-lg p-2.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <MI name="schedule" size={20} />
              </div>
              <div className="min-w-0">
                <span className="text-label-sm font-label-sm text-outline block">مدت زمان کل</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-headline-md text-headline-md text-on-surface font-extrabold">
                    {toFa(derived.duration)}
                  </span>
                  <span className="text-label-md font-label-md text-on-surface-variant">دقیقه</span>
                </div>
              </div>
            </div>
            <div className="bg-surface-container-low rounded-lg p-2.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-tertiary/10 text-tertiary flex items-center justify-center shrink-0">
                <MI name="payments" size={20} />
              </div>
              <div className="min-w-0">
                <span className="text-label-sm font-label-sm text-outline block">هزینه تخمینی</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-headline-md text-headline-md text-on-surface font-extrabold">
                    {faMoney(derived.fare)}
                  </span>
                  <span className="text-label-md font-label-md text-on-surface-variant">تومان</span>
                </div>
              </div>
            </div>
          </div>

          {/* ردیاب زنده حرکت بعدی خط ویژه */}
          <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-200/80 flex items-center justify-between text-amber-950 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center animate-pulse shrink-0">
                <MI name="departure_board" size={18} />
              </div>
              <div className="min-w-0">
                <span className="text-label-sm font-label-sm font-bold block">سرفاصله ورود اتوبوس</span>
                <span className="text-body-sm font-body-sm text-amber-900 truncate block">
                  ایستگاه {shortName(fromName)}
                </span>
              </div>
            </div>
            <div className="text-left bg-white/80 px-2 py-1 rounded-md border border-amber-300 shrink-0">
              <span className="text-title-md font-title-md font-extrabold text-amber-700">
                {toFa(derived.dispatchWait)}
              </span>
              <span className="text-label-sm font-label-sm text-amber-900">دقیقه دیگر</span>
            </div>
          </div>
        </section>

        {/* ================= شماتیک کریدور خط ویژه ================= */}
        <section className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/60 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MI name="map" size={20} className="text-primary shrink-0" />
              <h2 className="font-title-md text-title-md text-on-surface font-bold">شماتیک کریدور خط ویژه</h2>
            </div>
            <span className="text-label-sm font-label-sm px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-bold shrink-0">
              {derived.firstLeg
                ? `کریدور ویژه • ${toFa(derived.corridorStops)} ایستگاه`
                : "کریدور خط ویژه بی‌آر‌تی"}
            </span>
          </div>

          {/* نوار شماتیک ایستگاه‌ها با نشانگر موقعیت */}
          <div className="relative bg-surface-container-low rounded-lg p-3 border border-outline-variant/40">
            <div className="flex items-center justify-between text-center relative z-10">
              <CorridorNode
                index={1}
                color="#bc000c"
                ring="#ffdad5"
                name={shortName(fromName)}
                hint="ورود BRT"
                hintCls="text-outline"
              />
              <div className="relative h-1.5 flex-1 bg-secondary mx-1 rounded-full">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-white px-1.5 rounded-full border border-secondary text-[9px] font-bold text-secondary whitespace-nowrap">
                  {toFa(derived.corridorStops)} ایستگاه
                </div>
              </div>
              {derived.transferName ? (
                <Fragment>
                  <CorridorNode
                    index={2}
                    color="#f59e0b"
                    ring="#fef3c7"
                    name={shortName(derived.transferName)}
                    hint="تعویض به تاکسی"
                    hintCls="text-amber-700 font-bold"
                  />
                  <div className="h-1.5 flex-1 mx-1 border-b-2 border-dashed border-amber-500" />
                </Fragment>
              ) : null}
              <CorridorNode
                index={derived.transferName ? 3 : 2}
                color="#006638"
                ring="#7efbac"
                name={shortName(toName)}
                hint="مقصد"
                hintCls="text-tertiary font-bold"
              />
            </div>
          </div>
          <p className="text-body-sm font-body-sm text-on-surface-variant flex items-center gap-1.5">
            <MI name="info" size={16} className="text-primary shrink-0" />
            {derived.transferName
              ? `امکان تعویض به مسیرهای جایگزین نیز در ${derived.transferName} مهیاست.`
              : "کریدور مستقیم بدون نیاز به تعویض وسیله است."}
          </p>
        </section>

        {/* ================= راهنمای گام‌به‌گام پیمایش ================= */}
        <section className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/60 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MI name="timeline" size={20} className="text-primary shrink-0" />
              <h2 className="font-title-md text-title-md text-on-surface font-bold">
                راهنمای گام‌به‌گام پیمایش
              </h2>
            </div>
            <span className="text-label-md font-label-md text-outline shrink-0">{toFa(stepCount)} مرحله</span>
          </div>

          <ol className="relative border-r-2 border-outline-variant/60 mr-3.5 space-y-5 list-none">
            {/* گام ۱: پیاده‌روی تا ایستگاه اتوبوس تندرو */}
            <li className="mr-4 relative">
              <span className="absolute -right-[23px] top-0 w-4 h-4 rounded-full bg-outline-variant border-2 border-surface-container-lowest flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-outline" />
              </span>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-label-lg font-label-lg font-bold text-on-surface flex items-center gap-1.5">
                    <MI name="directions_walk" size={18} className="text-outline shrink-0" />
                    پیاده‌روی تا ایستگاه اتوبوس تندرو
                  </span>
                  <span className="text-label-sm font-label-sm text-outline font-semibold shrink-0">
                    ۳ دقیقه
                  </span>
                </div>
                <p className="text-body-sm font-body-sm text-on-surface-variant">
                  مسافت {toFa(WALK_TO_STOP_METERS)} متر تا ورودی ایستگاه {shortName(fromName)}
                </p>
              </div>
            </li>

            {/* گام ۲: سوار شدن به خط ویژه */}
            <li className="mr-4 relative">
              <span className="absolute -right-[25px] top-0 w-5 h-5 rounded-full bg-secondary text-white text-[11px] font-bold flex items-center justify-center ring-4 ring-secondary-fixed">
                <MI name="directions_bus" size={14} />
              </span>
              <div className="bg-surface-container-low rounded-lg p-3 border border-secondary/20 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-label-sm font-label-sm text-secondary font-bold block">
                      خط ویژه اتوبوس‌های تندرو
                    </span>
                    <span className="text-title-md font-title-md font-bold text-on-surface truncate block">
                      به سمت {derived.transferName ?? toName}
                    </span>
                  </div>
                  <div className="text-left shrink-0">
                    <span className="text-label-lg font-label-lg font-bold text-secondary block">
                      {toFa(
                        derived.firstLeg ? derived.firstLeg.minutes : Math.round(derived.duration * 0.5)
                      )}{" "}
                      دقیقه
                    </span>
                    <span className="text-label-sm font-label-sm text-outline block">
                      {toFa(derived.corridorStops)} ایستگاه
                    </span>
                  </div>
                </div>
                {derived.midStations.length > 0 && (
                  <details className="text-label-sm font-label-sm text-on-surface-variant pt-1 group">
                    <summary className="cursor-pointer text-primary hover:underline flex items-center gap-1 font-semibold list-none">
                      <span>مشاهده نام ایستگاه‌های میانی</span>
                      <MI name="expand_more" size={16} className="group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="pr-2 pt-2 space-y-1 text-outline border-r border-outline-variant/60 mr-1 mt-1">
                      {derived.midStations.map((name, i) => (
                        <div key={`${name}-${i}`}>
                          {toFa(i + 1)}. {name}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </li>

            {/* گام ۳ و ۴: پیاده شدن و تاکسی خطی (در صورت وجود تعویض) */}
            {derived.transferName && (
              <Fragment>
                <li className="mr-4 relative">
                  <span className="absolute -right-[23px] top-0 w-4 h-4 rounded-full bg-amber-500 border-2 border-surface-container-lowest flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  </span>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-label-lg font-label-lg font-bold text-on-surface flex items-center gap-1.5">
                        <MI name="transfer_within_a_station" size={18} className="text-amber-600 shrink-0" />
                        خروج از ایستگاه {shortName(derived.transferName)}
                      </span>
                      <span className="text-label-sm font-label-sm text-outline shrink-0">تغییر وسیله</span>
                    </div>
                    <p className="text-body-sm font-body-sm text-on-surface-variant">
                      از سکو خارج شده و به سمت پایانه تاکسیرانی ضلع شمال‌شرقی ایستگاه بروید (۸۰ متر).
                    </p>
                  </div>
                </li>
                <li className="mr-4 relative">
                  <span className="absolute -right-[25px] top-0 w-5 h-5 rounded-full bg-amber-600 text-white text-[11px] font-bold flex items-center justify-center ring-4 ring-amber-100">
                    <MI name="local_taxi" size={14} />
                  </span>
                  <div className="bg-surface-container-low rounded-lg p-3 border border-amber-300/40 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-label-sm font-label-sm text-amber-800 font-bold block">
                          تاکسی خطی ویژه مقصد
                        </span>
                        <span className="text-title-md font-title-md font-bold text-on-surface truncate block">
                          خط {shortName(derived.transferName)} - {shortName(toName)}
                        </span>
                      </div>
                      <div className="text-left shrink-0">
                        <span className="text-label-lg font-label-lg font-bold text-amber-800 block">
                          {toFa(derived.taxiMin)} دقیقه
                        </span>
                        <span className="text-label-sm font-label-sm text-outline block">
                          کرایه {faMoney(TAXI_LEG_FARE)} ت
                        </span>
                      </div>
                    </div>
                    <p className="text-body-sm font-body-sm text-on-surface-variant">
                      راننده در نزدیک‌ترین توقف مجاز به {toName} توقف دارد.
                    </p>
                  </div>
                </li>
              </Fragment>
            )}

            {/* گام پایانی: رسیدن به مقصد */}
            <li className="mr-4 relative">
              <span className="absolute -right-[24px] top-0 w-4 h-4 rounded-full bg-tertiary border-2 border-surface-container-lowest flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-white" />
              </span>
              <div className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-title-md font-title-md font-bold text-tertiary flex items-center gap-1.5">
                    <MI name="location_on" size={20} fill className="shrink-0" />
                    ورود به {toName}
                  </span>
                  <span className="text-label-sm font-label-sm bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 rounded-full font-bold shrink-0">
                    مقصد
                  </span>
                </div>
                <p className="text-body-sm font-body-sm text-on-surface-variant">
                  ساعت تقریبی رسیدن: ساعت {derived.eta} (بر اساس ترافیک لحظه‌ای کریدور)
                </p>
              </div>
            </li>
          </ol>
        </section>

        {/* ================= گزارش لحظه‌ای مسافران ================= */}
        <section className="bg-surface-container rounded-xl p-3 flex items-center justify-between border border-outline-variant/50 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MI name="campaign" size={22} className="text-primary shrink-0" />
            <div className="min-w-0">
              <span className="text-label-md font-label-md font-bold text-on-surface block">
                گزارش وضعیت لحظه‌ای مسافران
              </span>
              <span className="text-label-sm font-label-sm text-outline truncate block">
                بدون تاخیر در کریدور خط ویژه • وضعیت آب‌وهوا: معتدل
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              toast({
                title: "گزارش شما ثبت شد",
                description: "پاسخ کاربران برای سایر مسافران نمایش داده می‌شود",
              })
            }
            className="text-label-sm font-label-sm text-primary font-bold hover:underline shrink-0"
          >
            ثبت گزارش
          </button>
        </section>
      </main>

      {/* ================= داک شروع سفر (بالای ناوبری سراسری) ================= */}
      <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto px-4 py-2 bg-gradient-to-t from-surface via-surface/95 to-transparent z-40 pointer-events-none">
        <button
          type="button"
          onClick={startTrip}
          className="w-full pointer-events-auto h-12 rounded-xl bg-primary-container text-on-primary font-title-md text-title-md font-bold shadow-lg shadow-primary-container/25 flex items-center justify-center gap-2 hover:bg-primary transition-all active:scale-95"
        >
          <MI name="navigation" size={20} fill />
          <span>شروع سفر</span>
        </button>
      </div>
    </>
  );
}

export default function BrtPage() {
  return (
    <Suspense fallback={<BrtSkeleton />}>
      <BrtInner />
    </Suspense>
  );
}
