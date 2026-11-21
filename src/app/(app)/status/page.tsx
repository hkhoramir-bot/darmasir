"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { MI, PageHeader, useInitCity } from "@/components/metro/shell";
import { PanelAdSlot } from "@/components/metro/panel-banners";
import {
  LINES,
  crowdingNow,
  toFa,
  type CrowdLevel,
  type LineDef,
} from "@/lib/metro-data";

/* ============================================================
   اطلاعیه‌ها — درمسیر (فقط نوتیف‌ها؛ بدون وضعیت خط)
   بخش‌ها: هشدارهای مهم خطوط، فیلتر، اعلان خطوط انتخابی، آرشیو ۲۴ ساعت
   ============================================================ */

const subscribeNoop = () => () => {};

/** زمان ثابت برای رندر اول (سرور و کلاینت یکسان) — جلوگیری از hydration mismatch */
const FIXED_NOW = new Date(2024, 0, 15, 10, 30, 0);

const pad = (n: number) => String(n).padStart(2, "0");
const clockFa = (d: Date) => toFa(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
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

  /* ---------- محاسبات اطلاعیه‌های شبکه تهران ---------- */
  const data = useMemo(() => {
    const tehranLines = LINES.filter((l) => l.cityId === "tehran");
    // تا پیش از mount زمان ثابت — رندر سرور و اولین رندر کلاینت یکسان می‌ماند
    const d = mounted ? new Date() : FIXED_NOW;

    const crowdById: Record<string, CrowdLevel> = {};
    for (const l of tehranLines) crowdById[l.id] = crowdingNow(l.id, d);

    // خطوط دارای هشدار فعال (وضعیت غیرعادی یا یادداشت مرکز فرمان)
    const alertLines = tehranLines.filter(
      (l) => (l.status && l.status !== "normal") || !!l.statusNote
    );
    const isDelayType = (l: LineDef) =>
      l.status === "delay" ||
      l.status === "closed" ||
      /تاخیر|تأخیر/.test(l.statusNote ?? "");
    const isHoursType = (l: LineDef) => /ساعت|سرویس/.test(l.statusNote ?? "");

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
      alertLines,
      isDelayType,
      isHoursType,
      events,
    };
  }, [mounted, clock]);

  const { alertLines, isDelayType, isHoursType, events } = data;

  const delayCount = alertLines.filter(isDelayType).length;
  const hoursCount = alertLines.filter(isHoursType).length;
  const visibleAlerts =
    filter === "all" ? alertLines : alertLines.filter(filter === "delay" ? isDelayType : isHoursType);

  return (
    <>
      <PageHeader
        title="اطلاعیه‌ها"
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
        {/* ---------------- ۲. چیپ‌های فیلتر ---------------- */}
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

        {/* ---------------- ۳. هشدارهای مهم خطوط ---------------- */}
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
              <MI name="info" size={18} className="text-on-surface-variant shrink-0" />
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

        {/* ---------------- ۴. اعلان خطوط انتخابی ---------------- */}
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

        {/* ---------------- ۵. آرشیو ۲۴ ساعت گذشته ---------------- */}
        <section className="space-y-2 pt-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-title-md font-bold text-on-surface">آرشیو ۲۴ ساعت گذشته</h2>
            <span className="text-label-sm text-on-surface-variant">{toFa(events.length)} مورد</span>
          </div>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 divide-y divide-outline-variant/20 shadow-sm">
            {events.length === 0 && (
              <div className="p-3 flex items-center gap-2 text-on-surface-variant">
                <MI name="info" size={16} className="text-on-surface-variant shrink-0" />
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

        {/* ---------------- ۶. جایگاه آگهی — محتوای واقعی از پنل مدیریت (placement = status) ---------------- */}
        <PanelAdSlot placement="status" />
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
