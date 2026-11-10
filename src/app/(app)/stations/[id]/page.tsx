"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  amenitiesLabels,
  CROWD_COLOR,
  equipmentFor,
  exitsFor,
  getLine,
  getStation,
  landmarksFor,
  toFa,
  type CrowdLevel,
  type StationDef,
} from "@/lib/metro-data";
import { MI, PageHeader } from "@/components/metro/shell";
import { useAnnouncer } from "@/components/metro/voice";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   جزئیات ایستگاه — امکانات، خروجی‌ها، هشدار مقصد و گزارش تجهیزات
   ============================================================ */

interface ArrivalRow {
  lineId: string;
  lineName: string;
  lineNumber: number;
  color: string;
  textOnColor: string;
  headwayLabel: string;
  to: string;
  toBack: string;
  nextMin: number;
  next2Min: number;
  crowd: CrowdLevel;
  crowdLabel: string;
  firstTrain: string;
  lastTrain: string;
}

interface ReportRow {
  id: string;
  stationId: string;
  equipmentType: string;
  exitLabel: string;
  status: string;
  note: string | null;
  createdAt: string;
}

type TabKey = "amenities" | "exits" | "alert" | "report";
type EquipmentType = "escalator" | "elevator" | "ramp";
type ReportStatus = "working" | "malfunction" | "under_maintenance";
type BeforeStations = 2 | 3 | 4;

const TABS: { key: TabKey; label: string }[] = [
  { key: "amenities", label: "امکانات" },
  { key: "exits", label: "خروجی‌ها" },
  { key: "alert", label: "هشدار مقصد" },
  { key: "report", label: "گزارش" },
];

const EQ_OPTIONS: { key: EquipmentType; label: string; icon: string }[] = [
  { key: "escalator", label: "پله‌برقی", icon: "escalator" },
  { key: "elevator", label: "آسانسور", icon: "elevator" },
  { key: "ramp", label: "رمپ متحرک", icon: "accessible_forward" },
];

const STATUS_OPTIONS: {
  key: ReportStatus;
  label: string;
  dot: string;
  active: string;
}[] = [
  { key: "working", label: "سالم", dot: "bg-emerald-500", active: "bg-emerald-50 text-emerald-800 border-emerald-300" },
  { key: "malfunction", label: "خراب", dot: "bg-red-500", active: "bg-red-50 text-red-800 border-red-300" },
  {
    key: "under_maintenance",
    label: "در حال تعمیر",
    dot: "bg-amber-500",
    active: "bg-amber-50 text-amber-800 border-amber-300",
  },
];

/* برچسب گزارش‌های ذخیره‌شده */
const SAVED_TYPE_LABEL: Record<string, string> = {
  escalator: "پله‌برقی",
  elevator: "آسانسور",
  ramp: "رمپ متحرک",
};
const SAVED_STATUS_LABEL: Record<string, string> = {
  working: "سالم",
  malfunction: "خراب",
  under_maintenance: "در حال تعمیر",
};
const SAVED_STATUS_DOT: Record<string, string> = {
  working: "bg-emerald-500",
  malfunction: "bg-red-500",
  under_maintenance: "bg-amber-500",
};

/* ------------------------- ایستگاه یافت نشد ------------------------- */
function NotFound() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="ایستگاه یافت نشد" />
      <main className="flex-1 w-full px-4 pt-3 pb-28">
        <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 shadow-sm flex flex-col items-center text-center gap-3 mt-10">
          <div className="w-14 h-14 rounded-full bg-error-container flex items-center justify-center text-error shrink-0">
            <MI name="search_off" size={28} />
          </div>
          <h2 className="font-bold text-sm text-on-surface">ایستگاه یافت نشد</h2>
          <p className="text-xs text-outline leading-6">
            ایستگاه مورد نظر در شبکه مترو وجود ندارد یا آدرس وارد شده اشتباه است.
          </p>
          <button
            type="button"
            onClick={() => router.push("/stations")}
            className="bg-primary-container text-white rounded-xl font-bold text-xs py-2.5 px-6 shadow-sm active:scale-[0.98] transition-all"
          >
            مشاهده همه ایستگاه‌ها
          </button>
        </div>
      </main>
    </>
  );
}

/* ------------------------- صفحه اصلی ------------------------- */
export default function StationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const station = useMemo(() => getStation(id), [id]);

  if (!station) return <NotFound />;
  return <StationDetail key={id} station={station} />;
}

function StationDetail({ station }: { station: StationDef }) {
  const router = useRouter();
  const { toast } = useToast();
  const announcer = useAnnouncer();
  const id = station.id;

  const [tab, setTab] = useState<TabKey>("amenities");
  const [isFav, setIsFav] = useState(false);
  const [favPending, setFavPending] = useState(false);
  const [arrivals, setArrivals] = useState<ArrivalRow[] | null>(null);
  const [arrError, setArrError] = useState(false);
  const [beforeStations, setBeforeStations] = useState<BeforeStations>(2);
  const [alertOn, setAlertOn] = useState(false);

  /* فرم گزارش */
  const [eqType, setEqType] = useState<EquipmentType | null>(null);
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState<ReportRow[]>([]);

  const subtitle =
    station.lines.length > 1
      ? `تقاطع ${station.lines.map((l) => toFa(getLine(l.lineId).number)).join(" و ")}`
      : `خط ${toFa(getLine(station.lines[0].lineId).number)}`;

  const amenities = useMemo(() => amenitiesLabels(station.amenities), [station.amenities]);
  const exits = useMemo(() => exitsFor(station.id), [station.id]);
  const landmarks = useMemo(() => landmarksFor(station.id), [station.id]);
  const equipment = useMemo(() => equipmentFor(station.id), [station.id]);

  /* ---------- تابلو زنده قطارها (با بروزرسانی دوره‌ای) ---------- */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/arrivals?station=${id}`);
        if (!res.ok) throw new Error();
        const d = (await res.json()) as { arrivals?: ArrivalRow[] };
        if (alive && d.arrivals) {
          setArrivals(d.arrivals);
          setArrError(false);
        }
      } catch {
        if (alive) setArrError(true);
      }
    };
    load();
    const t = setInterval(load, 45000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  /* ---------- وضعیت نشان ---------- */
  useEffect(() => {
    let alive = true;
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((d: { ids?: string[] }) => {
        if (alive) setIsFav(!!d.ids?.includes(id));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  const toggleFav = async () => {
    if (favPending) return;
    setFavPending(true);
    const next = !isFav;
    setIsFav(next);
    try {
      if (next) {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stationId: id }),
        });
        if (!res.ok) throw new Error();
        toast({ title: "به نشان‌ها اضافه شد", description: `${station.name} به فهرست نشان‌شده‌ها اضافه شد` });
      } else {
        const res = await fetch(`/api/favorites?stationId=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        toast({ title: "از نشان‌ها حذف شد", description: `${station.name} از فهرست نشان‌شده‌ها حذف شد` });
      }
    } catch {
      setIsFav(!next);
      toast({ title: "خطا در ارتباط با سرور", description: "لطفاً دوباره تلاش کنید" });
    } finally {
      setFavPending(false);
    }
  };

  /* ---------- اعلام صوتی ---------- */
  const speak = useCallback(() => {
    const first = arrivals?.[0];
    const mins = first ? toFa(first.nextMin) : null;
    if (mins === null) {
      announcer.announce(`ایستگاه ${station.name}`).catch(() => {});
      return;
    }
    announcer.announce(`ایستگاه ${station.name}. قطار بعدی ${mins} دقیقه`).catch(() => {});
  }, [arrivals, announcer, station.name]);

  /* ---------- هشدار مقصد (بیدارباش هوشمند) ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("metrojo-alert");
      if (!raw) return;
      const a = JSON.parse(raw) as { stationId?: string; beforeStations?: number };
      if (a.stationId === id) {
        setAlertOn(true);
        if (a.beforeStations === 2 || a.beforeStations === 3 || a.beforeStations === 4) {
          setBeforeStations(a.beforeStations);
        }
      }
    } catch {}
  }, [id]);

  const saveAlert = (on: boolean, before: BeforeStations) => {
    try {
      if (on) {
        localStorage.setItem(
          "metrojo-alert",
          JSON.stringify({ stationId: id, stationName: station.name, beforeStations: before })
        );
      } else {
        localStorage.removeItem("metrojo-alert");
      }
    } catch {}
  };

  const pickBefore = (n: BeforeStations) => {
    setBeforeStations(n);
    if (alertOn) {
      saveAlert(true, n);
      toast({ title: "تنظیم هشدار بروزرسانی شد", description: `${toFa(n)} ایستگاه مانده به مقصد بیدار می‌شوید` });
    }
  };

  const toggleAlert = () => {
    const next = !alertOn;
    setAlertOn(next);
    saveAlert(next, beforeStations);
    if (next) {
      toast({ title: "هشدار مقصد فعال شد", description: `${toFa(beforeStations)} ایستگاه مانده به ${station.name} بیدار می‌شوید` });
      announcer
        .announce(`هشدار مقصد فعال شد. ${toFa(beforeStations)} ایستگاه مانده به مقصد بیدار می‌شوید.`)
        .catch(() => {});
    } else {
      toast({ title: "هشدار مقصد غیرفعال شد", description: "می‌توانید هر زمان دوباره فعال کنید" });
    }
  };

  /* ---------- گزارش تجهیزات ---------- */
  useEffect(() => {
    let alive = true;
    fetch(`/api/reports?station=${id}`)
      .then((r) => r.json())
      .then((d: { reports?: ReportRow[] }) => {
        if (alive) setReports(d.reports ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  const submitReport = async () => {
    if (!eqType || !status || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationId: id,
          equipmentType: eqType,
          status,
          note: note.trim() ? note.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "گزارش شما ثبت شد. سپاس از همکاری" });
      setEqType(null);
      setStatus(null);
      setNote("");
      const r = await fetch(`/api/reports?station=${id}`);
      const d = (await r.json()) as { reports?: ReportRow[] };
      setReports(d.reports ?? []);
    } catch {
      toast({ title: "ثبت گزارش ناموفق بود", description: "اتصال اینترنت را بررسی و دوباره تلاش کنید" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={station.name}
        subtitle={subtitle}
        actions={
          <button
            type="button"
            aria-label={isFav ? "حذف از نشان‌ها" : "افزودن به نشان‌ها"}
            aria-pressed={isFav}
            onClick={toggleFav}
            className={`w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-all ${
              isFav ? "text-amber-500" : "text-outline"
            }`}
          >
            <MI name="star" size={22} fill={isFav} />
          </button>
        }
      />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        {/* ================= کارت اطلاعات و تابلوی زنده ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {station.lines.map((ls) => {
                const line = getLine(ls.lineId);
                return (
                  <span
                    key={ls.lineId}
                    className="rounded-lg px-1.5 py-1 text-[10px] font-bold shadow-sm"
                    style={{ backgroundColor: line.color, color: line.textOnColor }}
                  >
                    خط {toFa(line.number)}
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              onClick={speak}
              aria-label="اعلام صوتی اطلاعات ایستگاه"
              className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center active:scale-95 transition-all shrink-0"
            >
              <MI name="volume_up" size={18} />
            </button>
          </div>

          {/* تابلوی لحظه‌ای */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MI name="departure_board" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">قطارهای بعدی</h3>
            </div>
            <span className="text-[10px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              بروزرسانی زنده
            </span>
          </div>

          {arrivals === null ? (
            arrError ? (
              <p className="text-[11px] text-outline py-2 text-center">دریافت اطلاعات لحظه‌ای ناموفق بود</p>
            ) : (
              <div className="space-y-2" aria-hidden>
                <div className="bg-surface-container-low rounded-xl h-12 animate-pulse" />
                <div className="bg-surface-container-low rounded-xl h-12 animate-pulse" />
              </div>
            )
          ) : (
            <div className="divide-y divide-outline-variant/30">
              {arrivals.map((a) => {
                const c = CROWD_COLOR[a.crowd];
                return (
                  <div key={a.lineId} className="py-2.5 space-y-1.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="rounded px-1 py-0.5 text-[9px] font-bold shrink-0"
                          style={{ backgroundColor: a.color, color: a.textOnColor }}
                        >
                          {toFa(a.lineNumber)}
                        </span>
                        <span className="text-[11px] font-bold text-on-surface truncate">به سمت {a.to}</span>
                      </div>
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0"
                        style={{ color: c, backgroundColor: `${c}14` }}
                      >
                        <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: c }} />
                        {a.crowdLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="bg-surface-container-low rounded-lg px-2 py-1 text-[10px] font-bold text-primary">
                        {toFa(a.nextMin)} دقیقه
                      </span>
                      <span className="bg-surface-container-low rounded-lg px-2 py-1 text-[10px] font-bold text-on-surface-variant">
                        {toFa(a.next2Min)} دقیقه
                      </span>
                      <span className="text-[9px] text-outline ms-auto">هر {toFa(a.headwayLabel)} دقیقه یک قطار</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ================= تب‌ها ================= */}
        <div className="bg-surface-container-low p-1 rounded-full flex items-center" role="tablist" aria-label="بخش‌های ایستگاه">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-center py-1.5 rounded-full text-[11px] active:scale-95 transition-all ${
                tab === t.key
                  ? "bg-surface-container-lowest shadow-sm text-primary font-bold"
                  : "text-on-surface-variant"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ================= محتوای تب امکانات ================= */}
        {tab === "amenities" && (
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <MI name="widgets" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">امکانات ایستگاه</h3>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {amenities.map((a) => (
                <div
                  key={a.key}
                  className="bg-surface-container-low rounded-xl p-2 flex flex-col items-center gap-1 text-center"
                >
                  <MI name={a.icon} size={20} className="text-primary" />
                  <span className="text-[9px] font-medium text-on-surface-variant leading-tight">{a.label}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <MI name="place" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">نقاط شاخص اطراف</h3>
            </div>

            {landmarks.length > 0 ? (
              <ul className="space-y-1.5">
                {landmarks.map((lm) => (
                  <li key={lm} className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <MI name="place" size={14} className="text-primary shrink-0" />
                    {lm}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-outline">نقطه شاخصی برای این ایستگاه ثبت نشده است</p>
            )}
          </section>
        )}

        {/* ================= محتوای تب خروجی‌ها ================= */}
        {tab === "exits" && (
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-2.5">
            <div className="flex items-center gap-2 pb-1">
              <MI name="door_open" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">خروجی‌های ایستگاه</h3>
            </div>

            {exits.map((ex) => (
              <div key={ex.label} className="bg-surface-container-low rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-on-surface">{ex.label}</span>
                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                    {ex.direction}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-outline">
                  <MI name="accessible" size={13} className="shrink-0" />
                  {ex.accessibility}
                </div>
                {ex.landmarks.length > 0 && (
                  <div className="flex items-start gap-1 text-[10px] text-on-surface-variant">
                    <MI name="place" size={13} className="text-primary mt-0.5 shrink-0" />
                    <span>{ex.landmarks.join(" • ")}</span>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ================= محتوای تب هشدار مقصد ================= */}
        {tab === "alert" && (
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <MI name="alarm" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">بیدارباش هوشمند</h3>
              {alertOn && (
                <span className="text-[9px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full ms-auto">
                  فعال
                </span>
              )}
            </div>

            <p className="text-[11px] text-on-surface-variant leading-6">
              با فعال‌سازی این قابلیت، چند ایستگاه مانده به رسیدن به {station.name} با اعلان صوتی بیدار می‌شوید تا با
              خیال راحت آماده پیاده شدن باشید.
            </p>

            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-outline">چند ایستگاه مانده به مقصد؟</p>
              <div className="flex items-center gap-1.5">
                {([2, 3, 4] as BeforeStations[]).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => pickBefore(n)}
                    aria-pressed={beforeStations === n}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border active:scale-95 transition-all ${
                      beforeStations === n
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"
                    }`}
                  >
                    {toFa(n)} ایستگاه
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between bg-surface-container-low rounded-xl p-3">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-on-surface">فعال‌سازی هشدار</span>
                <span className="text-[10px] text-outline mt-0.5">
                  {alertOn ? "هشدار برای این ایستگاه فعال است" : "هشدار در حالت خاموش است"}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={alertOn}
                aria-label="فعال‌سازی هشدار مقصد"
                onClick={toggleAlert}
                className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
                  alertOn ? "bg-primary-container" : "bg-surface-container-high border border-outline-variant/40"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    alertOn ? "right-[22px]" : "right-0.5"
                  }`}
                />
              </button>
            </div>
          </section>
        )}

        {/* ================= محتوای تب گزارش ================= */}
        {tab === "report" && (
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <MI name="flag" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">گزارش وضعیت تجهیزات</h3>
            </div>

            {/* نوع تجهیزات */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-outline">نوع تجهیزات</p>
              <div className="grid grid-cols-3 gap-1.5">
                {EQ_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setEqType(o.key)}
                    aria-pressed={eqType === o.key}
                    className={`py-2 rounded-xl border flex flex-col items-center gap-1 text-[10px] font-bold active:scale-95 transition-all ${
                      eqType === o.key
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"
                    }`}
                  >
                    <MI name={o.icon} size={18} />
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* وضعیت */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-outline">وضعیت فعلی</p>
              <div className="grid grid-cols-3 gap-1.5">
                {STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setStatus(o.key)}
                    aria-pressed={status === o.key}
                    className={`py-2 rounded-xl border flex items-center justify-center gap-1 text-[10px] font-bold active:scale-95 transition-all ${
                      status === o.key ? o.active : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${o.dot}`} />
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* توضیح */}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              aria-label="توضیح دلخواه گزارش"
              placeholder="توضیح دلخواه (اختیاری) — مثلاً پله‌برقی خروجی ۲ خاموش است"
              className="w-full bg-surface-container-low rounded-xl p-2.5 text-xs text-on-surface placeholder:text-outline border border-outline-variant/30 focus:outline-none focus:border-primary resize-none"
            />

            <button
              type="button"
              onClick={submitReport}
              disabled={!eqType || !status || submitting}
              className="w-full flex items-center justify-center gap-1.5 bg-primary-container text-white rounded-xl font-bold text-xs py-2.5 shadow-sm active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <MI name="send" size={15} />
              )}
              ثبت گزارش
            </button>

            {/* وضعیت تجهیزات خط */}
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-bold text-outline">وضعیت رسمی تجهیزات</p>
              {equipment.map((eq) => {
                const dot = eq.active >= eq.total ? "bg-emerald-500" : eq.active === 0 ? "bg-red-500" : "bg-amber-500";
                return (
                  <div key={eq.type} className="flex items-center gap-2 bg-surface-container-low rounded-xl p-2.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-on-surface">{eq.typeLabel}</span>
                        <span className="text-[10px] font-bold text-primary whitespace-nowrap">
                          {toFa(eq.active)} از {toFa(eq.total)} فعال
                        </span>
                      </div>
                      {eq.note && <p className="text-[10px] text-outline mt-0.5">{eq.note}</p>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* گزارش‌های اخیر مسافران */}
            {reports.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-outline-variant/30">
                <div className="flex items-center gap-1.5">
                  <MI name="history" size={14} className="text-outline" />
                  <span className="text-[10px] font-bold text-outline">گزارش‌های اخیر مسافران</span>
                </div>
                {reports.map((r) => (
                  <div key={r.id} className="text-[10px] text-on-surface-variant flex items-center gap-1.5 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${SAVED_STATUS_DOT[r.status] ?? "bg-outline"}`}
                    />
                    <span className="font-bold shrink-0">{SAVED_TYPE_LABEL[r.equipmentType] ?? r.equipmentType}</span>
                    <span className="shrink-0">{SAVED_STATUS_LABEL[r.status] ?? r.status}</span>
                    {r.note && <span className="text-outline truncate">— {r.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* دکمه بازگشت به فهرست */}
        <button
          type="button"
          onClick={() => router.push("/stations")}
          className="w-full flex items-center justify-center gap-1.5 bg-primary-container text-white rounded-xl font-bold text-xs py-2.5 shadow-sm active:scale-[0.98] transition-all"
        >
          <MI name="arrow_forward" size={15} />
          بازگشت به فهرست ایستگاه‌ها
        </button>
      </main>
    </>
  );
}
