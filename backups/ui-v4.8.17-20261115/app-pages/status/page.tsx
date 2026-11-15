"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { MI, PageHeader, useInitCity, useShell } from "@/components/metro/shell";
import {
  CROWD_COLOR,
  CROWD_LABEL,
  LINES,
  crowdingNow,
  headwayAt,
  toFa,
  type CrowdLevel,
  type LineDef,
} from "@/lib/metro-data";

/* ============================================================
   اطلاعیه‌ها و وضعیت خطوط — متروجو
   طرح‌های مرجع: _18 (اصلی) + _26 و _3 (بخش تراکم لحظه‌ای)
   ============================================================ */

const subscribeNoop = () => () => {};

/** زمان ثابت برای رندر اول (سرور و کلاینت یکسان) — جلوگیری از hydration mismatch */
const FIXED_NOW = new Date(2024, 0, 15, 10, 30, 0);

const pad = (n: number) => String(n).padStart(2, "0");
const clockFa = (d: Date) => toFa(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
const minsOf = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
const hmOf = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

const CITY_NAME: Record<string, string> = {
  tehran: "تهران",
  mashhad: "مشهد",
  isfahan: "اصفهان",
};

/* ---------------- پالت وضعیت واگن‌ها (۵ حالت) ---------------- */
type WagonState = "full" | "crowded" | "medium" | "ok" | "empty";

const WAGON_STYLE: Record<
  WagonState,
  { box: string; icon: string; iconCls: string; label: string; labelCls: string }
> = {
  full: {
    box: "bg-secondary-fixed/50 border border-secondary/40",
    icon: "group",
    iconCls: "text-secondary",
    label: "تکمیل",
    labelCls: "text-secondary",
  },
  crowded: {
    box: "bg-amber-500/10 border border-amber-500/40",
    icon: "groups",
    iconCls: "text-amber-600 dark:text-amber-400",
    label: "شلوغ",
    labelCls: "text-amber-700 dark:text-amber-300",
  },
  medium: {
    box: "bg-yellow-500/10 border border-yellow-500/40",
    icon: "group",
    iconCls: "text-yellow-600 dark:text-yellow-400",
    label: "متوسط",
    labelCls: "text-yellow-700 dark:text-yellow-300",
  },
  ok: {
    box: "bg-tertiary-fixed/20 border border-tertiary/40",
    icon: "person",
    iconCls: "text-tertiary",
    label: "عادی",
    labelCls: "text-tertiary",
  },
  empty: {
    box: "bg-emerald-500/10 border border-emerald-500/40",
    icon: "person",
    iconCls: "text-emerald-600 dark:text-emerald-400",
    label: "خالی",
    labelCls: "text-emerald-700 dark:text-emerald-300",
  },
};

/** توزیع وضعیت پنج واگن بر اساس سطح ازدحام لحظه‌ای خط */
const WAGONS_BY_CROWD: Record<CrowdLevel, WagonState[]> = {
  busy: ["full", "full", "crowded", "crowded", "medium"],
  moderate: ["crowded", "medium", "medium", "ok", "empty"],
  quiet: ["medium", "ok", "ok", "empty", "empty"],
};
const WAGON_RANK: Record<WagonState, number> = { full: 4, crowded: 3, medium: 2, ok: 1, empty: 0 };

/* ---------------- متادیتای وضعیت خط برای کارت هشدار ---------------- */
const STATUS_META: Record<
  string,
  { accent: string; badgeCls: string; label: string; eta: string; note: string }
> = {
  delay: {
    accent: "border-r-secondary",
    badgeCls: "bg-error-container text-on-error-container",
    label: "افزایش سرفاصله",
    eta: "۳۰ دقیقه دیگر",
    note: "در صورت امکان از خطوط موازی استفاده کنید.",
  },
  closed: {
    accent: "border-r-secondary",
    badgeCls: "bg-error-container text-on-error-container",
    label: "قطع سرویس",
    eta: "در حال پیگیری",
    note: "اتوبوس جایگزین از سرخط فعال است.",
  },
  crowded: {
    accent: "border-r-[#e65100]",
    badgeCls: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    label: "ازدحام مسافر",
    eta: "پس از ساعات اوج",
    note: "ترجیحاً از واگن‌های میانی استفاده کنید.",
  },
};

/* ---------------- کلید تعویض (تطبیق طراحی) ---------------- */
function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`w-11 h-6 rounded-full relative shrink-0 transition-all active:scale-95 ${
        on ? "bg-primary-container" : "bg-outline-variant/60 border border-outline-variant/40"
      }`}
    >
      <span
        className={`absolute top-[2px] w-5 h-5 rounded-full bg-white shadow-sm transition-all ${
          on ? "left-[2px]" : "right-[2px]"
        }`}
      />
    </button>
  );
}

/* ---------------- نشان عدد خط ---------------- */
function LineBubble({ line, small = false }: { line: LineDef; small?: boolean }) {
  return (
    <span
      className={`${small ? "w-5 h-5" : "w-6 h-6"} rounded-full text-label-sm font-bold flex items-center justify-center shrink-0`}
      style={{ backgroundColor: line.color, color: line.textOnColor }}
    >
      {toFa(line.number)}
    </span>
  );
}

/* ============================================================ */

export default function StatusPage() {
  const router = useRouter();
  const city = useShell((s) => s.city);
  useInitCity();

  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  /* ---------- ساعت زنده (بروزرسانی هر دقیقه) ---------- */
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => setClock(clockFa(new Date()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  /* ---------- فیلتر اطلاعیه‌ها ---------- */
  const [filter, setFilter] = useState<"all" | "delay" | "hours">("all");

  /* ---------- خط انتخابی بخش تراکم ---------- */
  const [selectedLineId, setSelectedLineId] = useState("l1");

  /* ---------- گزارش شلوغی (فقط سمت کاربر) ---------- */
  const [wagon, setWagon] = useState(3);
  const [reportToast, setReportToast] = useState<string | null>(null);
  const reportTimer = useRef<number | null>(null);
  const showReport = (msg: string) => {
    setReportToast(msg);
    if (reportTimer.current) window.clearTimeout(reportTimer.current);
    reportTimer.current = window.setTimeout(() => setReportToast(null), 3000);
  };
  useEffect(
    () => () => {
      if (reportTimer.current) window.clearTimeout(reportTimer.current);
    },
    []
  );

  /* ---------- اعلان خطوط انتخابی (localStorage) ---------- */
  const [notifOn, setNotifOn] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem("metrojo-line-alerts");
        if (raw !== null) setNotifOn(raw === "1");
      } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  const toggleNotif = () => {
    setNotifOn((v) => {
      const next = !v;
      try {
        localStorage.setItem("metrojo-line-alerts", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  /* ---------- فلش اعلان کوتاه صفحه ---------- */
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const showFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 2500);
  };

  /* ---------- مودال راهنما (دکمه «؟» طرح) ---------- */
  const [help, setHelp] = useState<{ title: string; text: string } | null>(null);

  /* ---------- محاسبات زنده شبکه تهران ---------- */
  const data = useMemo(() => {
    const tehranLines = LINES.filter((l) => l.cityId === "tehran");
    // تا پیش از mount زمان ثابت — رندر سرور و اولین رندر کلاینت یکسان می‌ماند
    const d = mounted ? new Date() : FIXED_NOW;
    const nowMin = d.getHours() * 60 + d.getMinutes();

    const crowdById: Record<string, CrowdLevel> = {};
    for (const l of tehranLines) crowdById[l.id] = crowdingNow(l.id, d);

    // درصد روانی شبکه: خطوط عادی یا با ازدحام غیر «شلوغ»
    const smooth = tehranLines.filter(
      (l) => l.status === "normal" || crowdById[l.id] !== "busy"
    ).length;
    const smoothPct = Math.round((smooth / tehranLines.length) * 100);

    // خطوط دارای هشدار فعال (وضعیت غیرعادی یا یادداشت مرکز فرمان)
    const alertLines = tehranLines.filter(
      (l) => (l.status && l.status !== "normal") || !!l.statusNote
    );
    const isDelayType = (l: LineDef) =>
      l.status === "delay" ||
      l.status === "closed" ||
      /تاخیر|تأخیر/.test(l.statusNote ?? "");
    const isHoursType = (l: LineDef) => /ساعت|سرویس/.test(l.statusNote ?? "");
    const delayedLines = tehranLines.filter((l) => l.status === "delay" || l.status === "closed");

    // بازه کاری واقعی شبکه (کمینه آغاز / بیشینه پایان)
    const minStart = tehranLines.map((l) => l.firstTrain).reduce((a, b) => (a < b ? a : b));
    const maxEnd = tehranLines.map((l) => l.lastTrain).reduce((a, b) => (a > b ? a : b));
    const startMins = minsOf(minStart);

    // آرشیو ۲۴ ساعت گذشته — برگرفته از وضعیت واقعی خطوط
    const alertIds = new Set(alertLines.map((l) => l.id));
    const busyLines = tehranLines.filter((l) => crowdById[l.id] === "busy" && !alertIds.has(l.id));
    const normalLines = tehranLines.filter(
      (l) => !alertIds.has(l.id) && crowdById[l.id] !== "busy"
    );
    const events: { line: LineDef; title: string; hoursAgo: number }[] = [];
    alertLines.forEach((l, i) =>
      events.push({
        line: l,
        title: `${l.statusNote ?? "هشدار فعال مرکز فرمان"} — ${l.name}`,
        hoursAgo: 2 + i * 3,
      })
    );
    busyLines.slice(0, Math.max(0, 3 - events.length)).forEach((l, i) =>
      events.push({ line: l, title: `افزایش ازدحام در ${l.name}`, hoursAgo: 8 + i * 4 })
    );
    if (events.length > 0 && events.length < 3) {
      normalLines
        .slice(0, 3 - events.length)
        .forEach((l, i) =>
          events.push({ line: l, title: `سرویس‌دهی عادی در ${l.name}`, hoursAgo: 14 + i * 5 })
        );
    }
    events.sort((a, b) => a.hoursAgo - b.hoursAgo);

    return {
      tehranLines,
      crowdById,
      nowMin,
      smoothPct,
      alertLines,
      isDelayType,
      isHoursType,
      delayedLines,
      minStart,
      maxEnd,
      startMins,
      events,
    };
  }, [mounted, clock]);

  const {
    tehranLines,
    crowdById,
    nowMin,
    smoothPct,
    alertLines,
    isDelayType,
    isHoursType,
    delayedLines,
    minStart,
    maxEnd,
    startMins,
    events,
  } = data;

  const selectedLine = tehranLines.find((l) => l.id === selectedLineId) ?? tehranLines[0];
  const selectedCrowd = crowdById[selectedLine.id] ?? "moderate";
  const selectedHeadway = headwayAt(selectedLine, nowMin);
  const wagons = WAGONS_BY_CROWD[selectedCrowd];

  // دو واگن کم‌ازدحام‌تر برای پیشنهاد هوشمند
  const bestTwo = useMemo(() => {
    const idx = [0, 1, 2, 3, 4].sort((a, b) => WAGON_RANK[wagons[a]] - WAGON_RANK[wagons[b]]);
    const [a, b] = [idx[0] + 1, idx[1] + 1].sort((x, y) => x - y);
    return { a, b, bestIdx: idx[0] };
  }, [wagons]);

  const cityName = CITY_NAME[city] ?? "تهران";
  const delayCount = alertLines.filter(isDelayType).length;
  const hoursCount = alertLines.filter(isHoursType).length;
  const visibleAlerts =
    filter === "all" ? alertLines : alertLines.filter(filter === "delay" ? isDelayType : isHoursType);

  return (
    <>
      <PageHeader
        title="اطلاعیه‌ها و وضعیت خطوط"
        subtitle={`بروزرسانی لحظه‌ای${clock ? ` • ساعت ${clock}` : ""}`}
        actions={
          <button
            type="button"
            aria-label="تنظیمات اعلان خطوط"
            onClick={() =>
              document
                .getElementById("notif-toggle")
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all"
          >
            <MI name="tune" size={22} />
          </button>
        }
      />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        {/* ---------------- ۲. خلاصه وضعیت شبکه ---------------- */}
        <section className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/40 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-surface-container">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-tertiary">
                <MI name="check_circle" fill size={20} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-label-sm text-on-surface-variant">وضعیت شبکه</span>
                  <button
                    type="button"
                    aria-label="راهنمای وضعیت شبکه"
                    onClick={() =>
                      setHelp({
                        title: "وضعیت ترافیکی ناوگان",
                        text: "شاخص روانی حرکت بر اساس وضعیت اعلامی خطوط، تراکم لحظه‌ای سکوها و سرفاصله قطارها محاسبه و هر چند دقیقه بازبینی می‌شود.",
                      })
                    }
                    className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[11px] font-bold text-on-surface-variant/70 border border-outline-variant/60 hover:text-primary hover:border-primary transition-colors"
                  >
                    ؟
                  </button>
                </div>
                <div className="text-title-md text-on-surface font-bold">
                  {toFa(smoothPct)}٪ شبکه روان
                </div>
              </div>
            </div>
            <span className="text-label-sm bg-surface-container text-primary font-bold px-2 py-1 rounded-full">
              {cityName}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 text-center">
            <div className="bg-surface-container-low rounded-lg p-2.5 border border-outline-variant/20">
              <span className="text-label-sm text-on-surface-variant block">خطوط فعال</span>
              <span className="text-headline-md text-primary font-bold">
                {toFa(tehranLines.length)}{" "}
                <span className="text-body-sm text-on-surface-variant font-normal">خط</span>
              </span>
            </div>
            <div className="bg-surface-container-low rounded-lg p-2.5 border border-outline-variant/20">
              <span className="text-label-sm text-on-surface-variant block">هشدارها</span>
              <span className="text-headline-md text-secondary font-bold">
                {toFa(alertLines.length)}{" "}
                <span className="text-body-sm text-secondary font-normal">مورد</span>
              </span>
            </div>
            <div className="bg-surface-container-low rounded-lg p-2.5 border border-outline-variant/20">
              <span className="text-label-sm text-on-surface-variant block">ساعات کاری</span>
              <span className="text-title-md text-on-surface font-bold mt-1 block leading-tight">
                {toFa(minStart)}
              </span>
              <span className="text-label-sm text-on-surface-variant font-medium block">
                تا {toFa(maxEnd)}
              </span>
            </div>
          </div>
        </section>

        {/* ---------------- ۳. چیپ‌های فیلتر ---------------- */}
        <section className="overflow-x-auto no-scrollbar -mx-4 px-4 flex gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
            className={`shrink-0 text-label-md px-4 py-2 rounded-full shadow-sm active:scale-95 transition-all ${
              filter === "all"
                ? "bg-primary text-on-primary font-semibold"
                : "bg-surface-container-lowest text-on-surface border border-outline-variant/60 font-medium hover:bg-surface-container"
            }`}
          >
            همه اطلاعیه‌ها ({toFa(alertLines.length)})
          </button>
          <button
            type="button"
            onClick={() => setFilter("delay")}
            aria-pressed={filter === "delay"}
            className={`shrink-0 text-label-md px-3.5 py-2 rounded-full active:scale-95 transition-all ${
              filter === "delay"
                ? "bg-primary text-on-primary font-semibold"
                : "bg-surface-container-lowest text-on-surface border border-outline-variant/60 font-medium hover:bg-surface-container"
            }`}
          >
            تاخیرها ({toFa(delayCount)})
          </button>
          <button
            type="button"
            onClick={() => setFilter("hours")}
            aria-pressed={filter === "hours"}
            className={`shrink-0 text-label-md px-3.5 py-2 rounded-full active:scale-95 transition-all ${
              filter === "hours"
                ? "bg-primary text-on-primary font-semibold"
                : "bg-surface-container-lowest text-on-surface border border-outline-variant/60 font-medium hover:bg-surface-container"
            }`}
          >
            تغییرات ساعات کاری
          </button>
        </section>

        {/* ---------------- ۴. هشدارهای مهم خطوط ---------------- */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-secondary font-bold">
              <MI name="warning" fill size={20} />
              <h2 className="text-title-md">هشدارهای مهم خطوط</h2>
              <button
                type="button"
                aria-label="راهنمای هشدارها"
                onClick={() =>
                  setHelp({
                    title: "هشدارهای اختلال و سرفاصله",
                    text: "هشدارهای ثبت‌شده مستقیماً از مرکز فرمان مترو دریافت و هر ۲ دقیقه بازبینی می‌شوند تا در صورت رفع نقص خودکار حذف شوند.",
                  })
                }
                className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[11px] font-bold text-secondary/80 border border-secondary/40 hover:bg-secondary/10 transition-colors"
              >
                ؟
              </button>
            </div>
            <span className="text-label-sm text-error bg-error-container/60 px-2 py-0.5 rounded-full font-bold">
              {toFa(alertLines.length)} مورد
            </span>
          </div>

          {alertLines.length === 0 && (
            <article className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-4 shadow-sm flex items-center gap-2">
              <MI name="check_circle" fill size={20} className="text-tertiary shrink-0" />
              <p className="text-body-md text-on-surface font-bold">همه خطوط روان است</p>
            </article>
          )}

          {alertLines.length > 0 && visibleAlerts.length === 0 && (
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-4 flex items-center gap-2 text-on-surface-variant shadow-sm">
              <MI name="info" size={18} className="text-outline shrink-0" />
              <span className="text-body-sm">موردی در این دسته در ۲۴ ساعت گذشته ثبت نشده است.</span>
            </div>
          )}

          {visibleAlerts.map((line) => {
            const meta = STATUS_META[line.status ?? "crowded"] ?? STATUS_META.crowded;
            return (
              <article
                key={line.id}
                className={`bg-surface-container-lowest border-r-4 ${meta.accent} border border-outline-variant/40 rounded-xl p-3.5 shadow-sm space-y-3`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <LineBubble line={line} />
                    <div>
                      <h3 className="text-title-md text-on-surface font-bold">
                        {line.statusNote ?? "اختلال در سرویس‌دهی"}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-label-sm text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">
                          {line.name} • {line.terminals[0]} - {line.terminals[1]}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-label-sm px-2 py-0.5 rounded font-bold shrink-0 ${meta.badgeCls}`}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="text-body-sm text-on-surface-variant flex items-center gap-1 pt-0.5">
                  <MI name="directions_walk" size={16} className="text-tertiary shrink-0" />
                  {meta.note}
                </p>
                <div className="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg text-body-sm">
                  <div className="flex items-center gap-1.5 text-on-surface font-medium">
                    <MI name="schedule" size={18} className="text-primary shrink-0" />
                    <span>رفع تخمینی:</span>
                    <span className="font-bold text-secondary">{meta.eta}</span>
                  </div>
                  <span className="text-label-sm text-on-surface-variant font-medium">
                    {clock ? `اعلام ${clock}` : "اعلام لحظه‌ای"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => router.push("/plan")}
                    className="h-9 px-3 rounded-lg bg-primary text-on-primary text-label-md font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm"
                  >
                    <MI name="alt_route" size={16} />
                    <span>خط جانشین</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!notifOn) toggleNotif();
                      showFlash(`هشدار رفع نقص ${line.name} فعال شد`);
                    }}
                    className="h-9 px-3 rounded-lg bg-surface-container-low text-primary border border-primary/20 text-label-md font-semibold flex items-center justify-center gap-1.5 hover:bg-surface-container active:scale-95 transition-all"
                  >
                    <MI name="notifications_active" size={16} />
                    <span>هشدار رفع نقص</span>
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        {/* ---------------- ۵. تراکم لحظه‌ای واگن‌ها (_26 / _3) ---------------- */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-primary font-bold">
              <MI name="directions_subway" size={22} />
              <h2 className="text-title-md">تراکم لحظه‌ای واگن‌ها</h2>
            </div>
            <span
              className="text-label-sm font-bold px-2 py-0.5 rounded-full"
              style={{
                color: CROWD_COLOR[selectedCrowd],
                backgroundColor: `${CROWD_COLOR[selectedCrowd]}1A`,
              }}
            >
              {CROWD_LABEL[selectedCrowd]}
            </span>
          </div>

          {/* انتخاب خط — چیپ‌های رنگی */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {tehranLines.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedLineId(l.id)}
                aria-pressed={selectedLineId === l.id}
                className={`shrink-0 px-3 py-1.5 rounded-full text-label-md font-bold transition-all active:scale-95 border ${
                  selectedLineId === l.id
                    ? "border-transparent shadow-sm"
                    : "bg-surface-container-lowest border-outline-variant/60 text-on-surface hover:bg-surface-container"
                }`}
                style={
                  selectedLineId === l.id
                    ? { backgroundColor: l.color, color: l.textOnColor }
                    : undefined
                }
              >
                {selectedLineId === l.id ? (
                  toFa(l.number)
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: l.color }}
                    />
                    خط {toFa(l.number)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* کارت تراکم واگن‌ها */}
          <div className="bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-on-surface">
                <MI name="directions_subway" size={20} className="text-primary" />
                <span className="text-title-md font-bold">تراکم مسافران واگن‌ها</span>
              </div>
              <span className="text-label-sm text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded-md font-medium">
                {selectedLine.name}
              </span>
            </div>

            <div className="bg-surface-container-lowest p-2.5 rounded-xl border border-outline-variant/30">
              <div className="flex items-center justify-between text-label-sm text-outline mb-1.5">
                <span className="flex items-center gap-1 font-medium">
                  <MI name="arrow_forward" size={14} /> لوکوموتیو
                </span>
                <span className="font-medium">انتهای قطار</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 items-stretch">
                {wagons.map((w, i) => {
                  const s = WAGON_STYLE[w];
                  const isBest = i === bestTwo.bestIdx && selectedCrowd !== "busy";
                  return (
                    <div
                      key={i}
                      className={`flex flex-col items-center py-2 px-1 rounded-xl text-center relative ${s.box}`}
                    >
                      {isBest && (
                        <span className="absolute -top-1.5 right-1/2 translate-x-1/2 bg-tertiary text-on-tertiary text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                          بهترین
                        </span>
                      )}
                      <span className="text-label-sm text-on-surface font-bold">{toFa(i + 1)}</span>
                      <span
                        className={`material-symbols-outlined text-[20px] my-1 ${s.iconCls}`}
                        aria-hidden
                      >
                        {s.icon}
                      </span>
                      <span className={`text-label-sm font-bold ${s.labelCls}`}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-surface-container flex items-center justify-between gap-2 text-label-sm">
                <div className="flex items-center gap-1.5 shrink-0">
                  <MI name="tips_and_updates" size={16} className="text-primary" />
                  <span className="text-on-surface font-medium">پیشنهاد هوشمند:</span>
                </div>
                <span className="font-bold text-tertiary bg-tertiary-fixed/20 px-2 py-0.5 rounded-md">
                  واگن {toFa(bestTwo.a)} و {toFa(bestTwo.b)} خلوت‌ترند
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between px-1 pt-0.5 text-label-md text-on-surface-variant gap-2">
              <span className="flex items-center gap-1 font-medium shrink-0">
                <MI name="timelapse" size={15} className="text-primary shrink-0" />
                سرفاصله فعلی: <strong className="text-on-surface">{toFa(selectedHeadway)} دقیقه</strong>
              </span>
              <span className="truncate text-outline">
                {selectedLine.terminals[0]} ↔ {selectedLine.terminals[1]}
              </span>
            </div>
          </div>

          {/* تاخیر خطوط لحظه‌ای */}
          <div className="bg-error-container/40 p-3 rounded-2xl border border-secondary/20">
            <div className="flex justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-secondary-container text-on-secondary flex items-center justify-center shrink-0">
                  <MI name="warning" size={14} />
                </div>
                <h4 className="text-title-md text-error font-bold">تاخیر خطوط لحظه‌ای</h4>
              </div>
              {delayedLines.length > 0 ? (
                <div className="flex items-center gap-1">
                  {delayedLines.map((l) => (
                    <span
                      key={l.id}
                      className="text-label-sm bg-error/10 text-error font-bold px-2 py-0.5 rounded-full"
                    >
                      {l.name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-label-sm bg-tertiary-fixed/30 text-tertiary font-bold px-2 py-0.5 rounded-full">
                  بدون تاخیر
                </span>
              )}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-secondary/10 text-label-sm gap-2">
              <span className="text-on-surface-variant font-medium truncate">
                {delayedLines.length > 0 ? (
                  <>
                    {delayedLines[0].name}:{" "}
                    <strong>{delayedLines[0].statusNote ?? "اختلال در سرویس"}</strong>
                  </>
                ) : (
                  "سرفاصله‌ها مطابق جدول رسمی حرکت است"
                )}
              </span>
              <span className="text-tertiary font-bold flex items-center gap-1 shrink-0">
                <MI name="check_circle" size={14} />
                {toFa(tehranLines.length - delayedLines.length)} خط پایدار
              </span>
            </div>
          </div>

          {/* ثبت گزارش شلوغی مسافر */}
          <div className="p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full bg-primary-fixed flex items-center justify-center text-primary dark:text-on-primary-fixed-variant">
                  <MI name="how_to_vote" size={15} />
                </div>
                <h3 className="text-title-md font-bold text-on-surface">ثبت گزارش شلوغی مسافر</h3>
              </div>
              <span className="text-label-sm font-bold text-primary bg-primary-fixed/40 dark:bg-primary/20 dark:text-primary-fixed-dim px-2 py-0.5 rounded-md">
                واگن {toFa(wagon)}
              </span>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setWagon(n)}
                  aria-pressed={wagon === n}
                  className={`flex-1 min-w-8 py-1 px-1.5 rounded-lg text-label-sm text-center transition-all active:scale-95 border-2 ${
                    wagon === n
                      ? "border-primary bg-primary text-on-primary font-bold shadow-sm"
                      : "border-outline-variant/60 bg-surface-container-low text-on-surface font-medium"
                  }`}
                >
                  {toFa(n)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => showReport("گزارش شما ثبت شد.")}
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-surface-container-low hover:bg-tertiary-fixed/20 border border-tertiary/30 text-tertiary font-bold text-label-md transition-all active:scale-95"
              >
                <MI name="sentiment_satisfied" size={18} />
                خلوت
              </button>
              <button
                type="button"
                onClick={() => showReport("گزارش شما ثبت شد.")}
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-surface-container-low hover:bg-yellow-500/10 border border-yellow-500/40 text-yellow-700 dark:text-yellow-300 font-bold text-label-md transition-all active:scale-95"
              >
                <MI name="sentiment_neutral" size={18} />
                متوسط
              </button>
              <button
                type="button"
                onClick={() => showReport("گزارش شما ثبت شد.")}
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-surface-container-low hover:bg-secondary-fixed/50 border border-secondary/30 text-secondary font-bold text-label-md transition-all active:scale-95"
              >
                <MI name="sentiment_very_dissatisfied" size={18} />
                شلوغ
              </button>
            </div>

            <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-outline-variant/30">
              <button
                type="button"
                onClick={() => showReport("گزارش تهویه (خنک) ثبت شد.")}
                className="flex-1 py-1.5 px-2 rounded-lg bg-surface-container-low hover:bg-primary-fixed/40 dark:hover:bg-primary/20 border border-primary/30 text-primary font-bold dark:text-primary-fixed-dim text-label-sm transition-all active:scale-95 flex items-center justify-center gap-1"
              >
                <MI name="ac_unit" size={15} />
                خنک
              </button>
              <button
                type="button"
                onClick={() => showReport("گزارش تهویه (معتدل) ثبت شد.")}
                className="flex-1 py-1.5 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/60 text-on-surface-variant font-bold text-label-sm transition-all active:scale-95 flex items-center justify-center gap-1"
              >
                <MI name="air" size={15} />
                معتدل
              </button>
              <button
                type="button"
                onClick={() => showReport("گزارش تهویه (گرم) ثبت شد.")}
                className="flex-1 py-1.5 px-2 rounded-lg bg-surface-container-low hover:bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-label-sm transition-all active:scale-95 flex items-center justify-center gap-1"
              >
                <MI name="thermostat" size={15} />
                گرم
              </button>
            </div>

            {reportToast && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-tertiary-fixed/30 border border-tertiary/40 text-tertiary text-label-sm font-medium">
                <div className="flex items-center gap-1.5">
                  <MI name="check_circle" size={16} />
                  <span>{reportToast}</span>
                </div>
                <button
                  type="button"
                  aria-label="بستن پیام"
                  onClick={() => setReportToast(null)}
                  className="cursor-pointer shrink-0"
                >
                  <MI name="close" size={14} />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ---------------- ۶. برنامه حرکت و ساعات کار ---------------- */}
        <section className="space-y-3 pt-1">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-primary font-bold">
              <MI name="calendar_clock" size={22} />
              <h2 className="text-title-md">برنامه حرکت و ساعات کار</h2>
              <button
                type="button"
                aria-label="راهنمای برنامه حرکت"
                onClick={() =>
                  setHelp({
                    title: "برنامه زمانی و اعزام‌ها",
                    text: "ساعات حرکت بر اساس جدول رسمی ۱۴۰۴ است؛ در پنج‌شنبه‌ها با ۳۰ دقیقه و در جمعه‌ها با ۶۰ دقیقه تاخیر آغاز می‌شود.",
                  })
                }
                className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[11px] font-bold text-primary/80 border border-primary/40 hover:bg-primary/10 transition-colors"
              >
                ؟
              </button>
            </div>
            <a className="text-label-md text-primary hover:underline flex items-center gap-0.5" href="/lines">
              <span>کل برنامه</span>
              <MI name="chevron_left" size={16} />
            </a>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-3.5 border border-outline-variant/40 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-surface-container text-primary flex items-center justify-center shrink-0">
                <MI name="more_time" size={20} />
              </div>
              <div>
                <span className="text-label-sm bg-surface-container-high text-primary px-2 py-0.5 rounded-full font-bold inline-block mb-0.5">
                  شنبه تا چهارشنبه
                </span>
                <h3 className="text-title-md text-on-surface font-bold">
                  ساعت فعالیت: {toFa(minStart)} الی {toFa(maxEnd)}
                </h3>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-outline-variant/20 space-y-2">
              <div className="flex items-center justify-between text-body-sm">
                <span className="flex items-center gap-1.5 text-on-surface-variant font-medium">
                  <MI name="wb_twilight" size={15} className="text-primary shrink-0" />
                  پنج‌شنبه‌ها
                </span>
                <span className="font-bold text-on-surface" dir="ltr">
                  {toFa(hmOf(startMins + 30))} - {toFa(maxEnd)}
                </span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="flex items-center gap-1.5 text-on-surface-variant font-medium">
                  <MI name="wb_sunny" size={15} className="text-tertiary shrink-0" />
                  جمعه‌ها
                </span>
                <span className="font-bold text-on-surface" dir="ltr">
                  {toFa(hmOf(startMins + 60))} - {toFa(maxEnd)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- ۷. اعلان خطوط انتخابی ---------------- */}
        <section
          id="notif-toggle"
          className="bg-surface-container-low border border-primary/20 rounded-xl p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary flex items-center justify-center shrink-0">
                <MI name="tune" size={20} />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-title-md font-bold text-on-surface">اعلان خطوط انتخابی</h3>
                <span className="text-label-sm bg-surface-container-high text-primary font-bold px-1.5 py-0.5 rounded">
                  خط ۱ و ۴
                </span>
              </div>
            </div>
            <Switch on={notifOn} onToggle={toggleNotif} label="اعلان خطوط انتخابی" />
          </div>
        </section>

        {/* ---------------- ۸. آرشیو ۲۴ ساعت گذشته ---------------- */}
        <section className="space-y-2 pt-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-title-md font-bold text-on-surface">آرشیو ۲۴ ساعت گذشته</h2>
            <span className="text-label-sm text-on-surface-variant">{toFa(events.length)} مورد</span>
          </div>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 divide-y divide-outline-variant/20 shadow-sm">
            {events.length === 0 && (
              <div className="p-3 flex items-center gap-2 text-on-surface-variant">
                <MI name="info" size={16} className="text-outline shrink-0" />
                <span className="text-body-sm">در ۲۴ ساعت گذشته خبر مهمی نبوده است</span>
              </div>
            )}
            {events.map((ev, i) => (
              <div
                key={`${ev.line.id}-${i}`}
                className="p-3 flex items-center justify-between gap-2 hover:bg-surface-container-low transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <LineBubble line={ev.line} small />
                  <span className="text-body-md font-bold text-on-surface truncate">{ev.title}</span>
                </div>
                <span className="text-label-sm text-on-surface-variant shrink-0">
                  {ev.hoursAgo < 24 ? `${toFa(ev.hoursAgo)} ساعت پیش` : "دیروز"}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- ۹. بنر آگهی ---------------- */}
        <section className="bg-surface-container rounded-xl p-3 border border-dashed border-outline-variant/60 flex items-center justify-between gap-2 text-on-surface-variant my-1">
          <div className="flex items-center gap-2 min-w-0">
            <MI name="campaign" size={20} className="text-primary shrink-0" />
            <span className="text-body-sm font-medium">
              نصب اپلیکیشن «شهرزاد» برای شارژ فوری بلیت اعتباری بدون صف
            </span>
          </div>
          <span className="text-label-sm px-2 py-0.5 bg-surface-container-lowest rounded border border-outline-variant/40 shrink-0">
            آگهی
          </span>
        </section>
      </main>

      {/* فلش اعلان کوتاه صفحه */}
      {flash && (
        <div className="fixed bottom-24 inset-x-0 z-50 flex justify-center pointer-events-none px-4">
          <div className="bg-primary text-on-primary text-label-lg font-semibold rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2">
            <MI name="notifications_active" size={16} />
            {flash}
          </div>
        </div>
      )}

      {/* مودال راهنما */}
      {help && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setHelp(null);
          }}
        >
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-5 w-full max-w-xs shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <MI name="info" size={20} />
                <h4 className="text-title-md font-bold text-on-surface">{help.title}</h4>
              </div>
              <button
                type="button"
                aria-label="بستن"
                onClick={() => setHelp(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container active:scale-95"
              >
                <MI name="close" size={18} />
              </button>
            </div>
            <p className="text-body-sm text-on-surface-variant leading-relaxed">{help.text}</p>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setHelp(null)}
                className="px-4 py-1.5 rounded-lg bg-primary-container text-on-primary text-label-md font-semibold hover:brightness-110 transition-all"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
