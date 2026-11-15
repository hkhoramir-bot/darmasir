"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AMENITIES, faMoney, getLine, getStation, nextArrivalsBoth, toFa } from "@/lib/metro-data";
import { MI, PageHeader } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   تاریخچه فعالیت مسافر — بازطراحی دقیق بر اساس ui/_11/code.html
   سوابق، آمار، ایستگاه‌های بازدیدشده، آخرین مسیرها، بیدارباش سفر
   ============================================================ */

interface Trip {
  id: string;
  fromStationId: string;
  fromName: string;
  toStationId: string;
  toName: string;
  minutes: number;
  transfers: number;
  fare: number;
  pref: string;
  createdAt: string;
}

interface HistoryStats {
  count: number;
  minutes: number;
  fare: number;
  topFrom: string | null;
}

interface FavLine {
  id: string;
  number: number;
  name: string;
  color: string;
  textOnColor: string;
}

interface FavStation {
  id: string;
  name: string;
  isInterchange: boolean;
  lines: FavLine[];
  amenities: string[];
  favoritedAt: string;
}

interface RecentStation {
  stationId: string;
  name: string;
  lineIds: string[];
  date: string;
}

/* ------------------------------ کمکی‌ها ------------------------------ */

function clockFa(d: Date): string {
  return toFa(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
}

function dayDiff(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 99;
  const now = new Date();
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((n0 - d0) / 86400000);
}

/** «امروز ساعت ۱۲:۳۰» / «دیروز ساعت ۱۸:۱۵» / «۳ روز پیش» */
function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = dayDiff(iso);
  if (diff <= 0) return `امروز ساعت ${clockFa(d)}`;
  if (diff === 1) return `دیروز ساعت ${clockFa(d)}`;
  return `${toFa(diff)} روز پیش`;
}

/** «امروز» / «دیروز» / «۲ روز پیش» */
function relShort(iso: string): string {
  const diff = dayDiff(iso);
  if (diff <= 0) return "امروز";
  if (diff === 1) return "دیروز";
  return `${toFa(diff)} روز پیش`;
}

/** تیره‌کردن رنگ خط برای متن چیپ روی زمینه همان رنگ با شفافیت کم */
function blendDark(hex: string, t: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const f = (v: number) => Math.round(v * (1 - t));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

export default function HistoryPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [favs, setFavs] = useState<FavStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hiddenRecents, setHiddenRecents] = useState<Set<string>>(new Set());
  const [help, setHelp] = useState<{ title: string; desc: string } | null>(null);
  const [wakeOn, setWakeOn] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const recentsRef = useRef<HTMLElement>(null);

  /* ---------- داده ---------- */
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [hRes, fRes] = await Promise.all([fetch("/api/history"), fetch("/api/favorites")]);
      if (!hRes.ok) throw new Error("history failed");
      const hData = (await hRes.json()) as { trips: Trip[]; stats: HistoryStats };
      setTrips(Array.isArray(hData.trips) ? hData.trips : []);
      setStats(hData.stats ?? null);
      if (fRes.ok) {
        const fData = (await fRes.json()) as { favorites?: FavStation[] };
        setFavs(Array.isArray(fData.favorites) ? fData.favorites : []);
      }
      setHiddenRecents(new Set());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ---------- تنظیمات محلی (حافظه دستگاه) ---------- */
  useEffect(() => {
    try {
      setAutoSave(localStorage.getItem("metrojo-history-autosave") !== "0");
      setWakeOn(localStorage.getItem("metrojo-wake") !== "0");
    } catch {}
  }, []);

  const toggleAutoSave = () => {
    setAutoSave((v) => {
      const nv = !v;
      try {
        localStorage.setItem("metrojo-history-autosave", nv ? "1" : "0");
      } catch {}
      return nv;
    });
  };

  const toggleWake = () => {
    setWakeOn((v) => {
      const nv = !v;
      try {
        localStorage.setItem("metrojo-wake", nv ? "1" : "0");
      } catch {}
      return nv;
    });
  };

  const openHelp = (title: string, desc: string) => setHelp({ title, desc });

  /* ---------- مشتق‌ها ---------- */
  const lastTrip = trips[0];

  const favIds = useMemo(() => new Set(favs.map((f) => f.id)), [favs]);
  const topFav = favs[0];

  const uniqueStations = useMemo(() => {
    const s = new Set<string>();
    trips.forEach((t) => {
      s.add(t.fromStationId);
      s.add(t.toStationId);
    });
    return s.size;
  }, [trips]);

  const totalRefs = useMemo(() => trips.length * 2, [trips]);

  const thisYearTrips = useMemo(() => {
    const y = new Date().getFullYear();
    return trips.filter((t) => new Date(t.createdAt).getFullYear() === y).length;
  }, [trips]);

  /** اتحاد ایستگاه‌های مبدأ/مقصد آخرین سفرها — حداکثر ۴ مورد */
  const recents = useMemo(() => {
    const seen = new Set<string>(hiddenRecents);
    const out: RecentStation[] = [];
    outer: for (const t of trips) {
      for (const sid of [t.fromStationId, t.toStationId]) {
        if (seen.has(sid)) continue;
        const st = getStation(sid);
        if (!st) continue;
        seen.add(sid);
        out.push({ stationId: sid, name: st.name, lineIds: st.lines.map((l) => l.lineId), date: t.createdAt });
        if (out.length >= 4) break outer;
      }
    }
    return out;
  }, [trips, hiddenRecents]);

  /** وضعیت زنده قطار از ایستگاه آخرین سفر — برای چیپ سبز هیرو */
  const heroStatus = useMemo(() => {
    if (!lastTrip) return { live: false, text: "هنوز سفری ثبت نشده است" };
    const st = getStation(lastTrip.fromStationId);
    const lineId = st?.lines[0]?.lineId;
    if (!lineId) return { live: false, text: "آماده ثبت سفر بعدی" };
    const arrs = nextArrivalsBoth(lineId, lastTrip.fromStationId);
    const live = arrs.find((a) => !a.outOfService && a.minutes.length > 0);
    if (live) return { live: true, text: `قطار بعدی ${toFa(live.minutes[0])} دقیقه — به سمت ${live.to}` };
    return { live: false, text: "خارج از ساعات سرویس" };
  }, [lastTrip]);

  /** ساعت تخمینی رسیدن به مقصد آخرین سفر — برای بیدارباش */
  const wakeClock = useMemo(() => {
    if (!lastTrip) return "";
    const st = getStation(lastTrip.toStationId);
    const lineId = st?.lines[0]?.lineId;
    let mins: number | null = null;
    if (lineId) {
      const arrs = nextArrivalsBoth(lineId, lastTrip.toStationId);
      const live = arrs.find((a) => !a.outOfService && a.minutes.length > 0);
      if (live) mins = live.minutes[0];
    }
    const base = mins != null ? Date.now() + mins * 60000 : new Date(lastTrip.createdAt).getTime() + lastTrip.minutes * 60000;
    return clockFa(new Date(base));
  }, [lastTrip]);

  /* ---------- اکشن‌ها ---------- */
  const deleteAll = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/history?all=1", { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setTrips([]);
      setStats(null);
      setHiddenRecents(new Set());
      setConfirmAll(false);
      toast({ title: "تاریخچه پاک شد", description: "همه سفرهای ثبت‌شده حذف شدند" });
    } catch {
      toast({ title: "حذف تاریخچه ناموفق بود", description: "لطفاً دوباره تلاش کنید", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const deleteTrip = async (id: string) => {
    try {
      const res = await fetch(`/api/history?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setTrips((prev) => prev.filter((t) => t.id !== id));
      setStats((prev) => (prev ? { ...prev, count: Math.max(0, prev.count - 1) } : prev));
      toast({ title: "سفر حذف شد", description: "این مسیر از تاریخچه پاک شد" });
    } catch {
      toast({ title: "حذف سفر ناموفق بود", description: "لطفاً دوباره تلاش کنید", variant: "destructive" });
    }
  };

  /** حذف ایستگاه اخیر — اگر نشان‌شده باشد از علاقه‌مندی‌ها حذف می‌شود، وگرنه فقط ردیف پنهان می‌شود */
  const removeRecent = async (sid: string) => {
    setHiddenRecents((prev) => new Set(prev).add(sid));
    if (favIds.has(sid)) {
      try {
        const res = await fetch(`/api/favorites?stationId=${sid}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete failed");
        setFavs((prev) => prev.filter((f) => f.id !== sid));
        toast({ title: "از نشان‌شده‌ها حذف شد", description: getStation(sid)?.name ?? "" });
      } catch {
        toast({ title: "حذف نشان‌شده ناموفق بود", description: "لطفاً دوباره تلاش کنید", variant: "destructive" });
      }
    }
  };

  const scrollToRecents = () => {
    recentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const replayTrip = (t: Trip) => {
    router.push(`/plan?from=${t.fromStationId}&to=${t.toStationId}`);
  };

  /* ============================================================
     رندر
     ============================================================ */
  return (
    <>
      <PageHeader
        title="تاریخچه فعالیت"
        subtitle="سابقه هوشمند حمل‌ونقل ریلی"
        actions={
          <>
            <button
              type="button"
              aria-label="بارگذاری دوباره"
              onClick={loadData}
              className="w-10 h-10 flex items-center justify-center rounded-full text-primary hover:bg-surface-container active:scale-95 transition-all"
            >
              <MI name="refresh" size={22} />
            </button>
            <button
              type="button"
              aria-label="پاکسازی سوابق"
              title="پاکسازی تاریخچه"
              disabled={trips.length === 0}
              onClick={() => setConfirmAll(true)}
              className="w-10 h-10 flex items-center justify-center rounded-full text-secondary hover:bg-error-container/40 active:scale-95 transition-all disabled:opacity-40"
            >
              <MI name="delete_sweep" size={22} />
            </button>
          </>
        }
      />

      <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-4 pb-32 flex flex-col gap-5">
        {/* ---------------- ۱. هیرو سوابق من ---------------- */}
        {loading ? (
          <div className="h-[148px] rounded-3xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
        ) : (
          <section
            aria-label="خلاصه فعالیت"
            className="relative overflow-hidden rounded-3xl p-4 shadow-lg bg-gradient-to-tl from-primary via-primary-container to-primary text-white"
          >
            <div className="absolute -left-8 -bottom-10 w-28 h-28 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -right-10 -top-12 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />

            <div className="relative z-10 flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shadow-md shrink-0">
                <MI name="work_history" size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-white">سوابق من در متروجو</h2>
                <p
                  className={`text-[11px] mt-1 inline-flex items-center gap-1.5 max-w-full ${
                    heroStatus.live ? "text-emerald-200" : "text-white/80"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      heroStatus.live ? "bg-emerald-300 animate-pulse" : "bg-white/60"
                    }`}
                  />
                  <span className="truncate">{heroStatus.text}</span>
                </p>
              </div>
              <button
                type="button"
                aria-label="راهنما"
                onClick={() =>
                  openHelp(
                    "راهنمای تاریخچه مسافر",
                    "در این بخش تمامی ایستگاه‌های مشاهده‌شده، آخرین جستجوهای مسیر و هشدارهای بیدارباش سفرهای شما به صورت امن روی دستگاه ذخیره و نمایش داده می‌شوند."
                  )
                }
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-all active:scale-90 shrink-0 shadow-sm"
              >
                <MI name="help" size={20} />
              </button>
            </div>

            {/* آمار فشرده داخل هیرو */}
            <div className="relative z-10 mt-3.5 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm px-2 py-2.5 text-center">
                <div className="text-title-lg font-extrabold tracking-tight">{toFa(trips.length)}</div>
                <div className="text-[10px] text-white/80 mt-0.5">سفر ثبت‌شده</div>
              </div>
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm px-2 py-2.5 text-center">
                <div className="text-title-lg font-extrabold tracking-tight">
                  {toFa(stats?.minutes ?? 0)}
                </div>
                <div className="text-[10px] text-white/80 mt-0.5">دقیقه سفر</div>
              </div>
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm px-2 py-2.5 text-center">
                <div className="text-title-lg font-extrabold tracking-tight">{toFa(uniqueStations)}</div>
                <div className="text-[10px] text-white/80 mt-0.5">ایستگاه بازدیدشده</div>
              </div>
            </div>
          </section>
        )}

        {/* ---------------- ۳. قرص‌های دسترسی سریع ---------------- */}
        {!loading && (
          <nav aria-label="دسترسی سریع تاریخچه" className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={scrollToRecents}
              className="px-3.5 py-2 rounded-full text-label-md bg-primary-container text-on-primary shadow-sm flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform font-semibold"
            >
              <MI name="directions_subway" size={16} />
              <span>ایستگاه‌های بازدیدشده</span>
              <span className="bg-on-primary/20 text-on-primary text-[10px] px-1.5 py-0.5 rounded-full">
                {toFa(recents.length)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => router.push("/saved")}
              className="px-3.5 py-2 rounded-full text-label-md bg-surface-container-lowest text-on-surface-variant border border-outline-variant/40 hover:bg-surface-container flex items-center gap-1.5 shrink-0 active:scale-95 transition-all font-semibold"
            >
              <MI name="done_all" size={16} className="text-primary" />
              <span>نشان‌شده‌ها</span>
              <span className="bg-surface-container text-primary text-[10px] px-1.5 py-0.5 rounded-full">
                {toFa(favIds.size)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => router.push("/plan")}
              className="px-3.5 py-2 rounded-full text-label-md bg-surface-container-lowest text-primary border border-primary/30 hover:bg-surface-container flex items-center gap-1.5 shrink-0 active:scale-95 transition-all font-semibold"
            >
              <MI name="north_east" size={16} />
              <span>سفر جدید</span>
            </button>
          </nav>
        )}

        {/* ---------------- خطای بارگذاری ---------------- */}
        {!loading && loadError && (
          <section className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 shadow-sm flex flex-col items-center gap-3 text-center">
            <MI name="wifi_off" size={32} className="text-error" />
            <p className="text-xs font-bold text-on-surface">بارگذاری تاریخچه ناموفق بود</p>
            <button
              type="button"
              onClick={loadData}
              className="bg-primary-container text-white rounded-xl font-bold text-xs px-5 py-2 shadow-sm active:scale-95 transition-all"
            >
              تلاش دوباره
            </button>
          </section>
        )}

        {!loading && !loadError && trips.length === 0 && (
          /* ---------------- حالت خالی ---------------- */
          <section className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/30 shadow-sm flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <MI name="route" size={30} />
            </div>
            <p className="text-title-md text-on-surface font-bold">هنوز سفری ثبت نشده است</p>
            <p className="text-body-sm text-outline">
              اولین سفر خود را از مسیریاب متروجو ثبت کنید تا سوابق اینجا نمایش داده شود
            </p>
            <button
              type="button"
              onClick={() => router.push("/plan")}
              className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-label-lg font-bold shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
            >
              <MI name="north_east" size={16} />
              <span>شروع مسیریابی</span>
            </button>
          </section>
        )}

        {/* ---------------- ۴. ایستگاه‌های اخیراً مشاهده‌شده ---------------- */}
        {!loading && !loadError && trips.length > 0 && (
          <section
            ref={recentsRef}
            aria-labelledby="heading-recent-stations"
            className="flex flex-col gap-2.5 scroll-mt-24"
          >
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <h3 id="heading-recent-stations" className="text-title-md text-on-surface font-bold">
                  ایستگاه‌های اخیراً مشاهده‌شده
                </h3>
                <button
                  type="button"
                  aria-label="راهنمای ایستگاه‌ها"
                  onClick={() =>
                    openHelp(
                      "ایستگاه‌های بازدیدشده",
                      "ایستگاه‌هایی که برای مشاهده جزئیات، زمان‌بندی یا امکانات رفاهی باز کرده‌اید برای دسترسی سریع‌تر در اینجا نگهداری می‌شوند."
                    )
                  }
                  className="w-7 h-7 rounded-full bg-surface-container hover:bg-surface-container-highest text-primary flex items-center justify-center transition-all active:scale-90"
                >
                  <MI name="help" size={15} />
                </button>
              </div>
              <button
                type="button"
                aria-label="بازنشانی فهرست"
                title="بازنشانی فهرست"
                onClick={() => setHiddenRecents(new Set())}
                className="w-7 h-7 rounded-full bg-surface-container hover:bg-surface-container-highest text-primary flex items-center justify-center transition-all active:scale-90"
              >
                <MI name="restart_alt" size={15} />
              </button>
            </div>

            {recents.length === 0 ? (
              <p className="text-label-md text-outline text-center py-3">موردی برای نمایش نیست</p>
            ) : (
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                {recents.map((r) => {
                  const lines = r.lineIds;
                  const single = lines.length === 1 ? getLine(lines[0]) : null;
                  return (
                    <article
                      key={r.stationId}
                      className="shrink-0 w-[172px] rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm p-3 relative overflow-hidden hover:border-primary/30 transition-all"
                    >
                      <button
                        type="button"
                        aria-label="حذف این مورد از تاریخچه"
                        onClick={() => removeRecent(r.stationId)}
                        className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-outline-variant hover:text-secondary hover:bg-surface-container active:scale-90 transition-all z-10"
                      >
                        <MI name="close" size={14} />
                      </button>

                      {single ? (
                        <div
                          className="w-9 h-9 rounded-xl border-2 flex items-center justify-center font-bold text-label-lg shadow-sm"
                          style={{
                            backgroundColor: `${single.color}1f`,
                            borderColor: single.color,
                            color: blendDark(single.color, 0.45),
                          }}
                        >
                          {toFa(single.number)}
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-surface-container-high border-2 border-primary flex items-center justify-center relative shadow-sm overflow-hidden">
                          <span
                            className="absolute top-0 right-0 w-1/2 h-full"
                            style={{ backgroundColor: getLine(lines[0]).color }}
                          />
                          <span
                            className="absolute top-0 left-0 w-1/2 h-full"
                            style={{ backgroundColor: getLine(lines[1] ?? lines[0]).color }}
                          />
                          <span
                            className="relative z-10 text-white text-[10px] font-bold"
                            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
                          >
                            {toFa(getLine(lines[0]).number)}×{toFa(getLine(lines[1] ?? lines[0]).number)}
                          </span>
                        </div>
                      )}

                      <h4 className="mt-2 text-[13px] font-bold text-on-surface truncate">{r.name}</h4>
                      <p className="text-[10px] text-outline mt-0.5 flex items-center gap-1">
                        <MI name="schedule" size={11} />
                        {relShort(r.date)}
                      </p>
                      <button
                        type="button"
                        onClick={() => router.push(`/stations/${r.stationId}`)}
                        className="mt-2 w-full h-8 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                      >
                        مشاهده
                        <MI name="chevron_left" size={13} />
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ---------------- ۵. آخرین مسیرها و جستجوهای ثبت‌شده ---------------- */}
        {!loading && !loadError && trips.length > 0 && (
          <section aria-labelledby="heading-recent-routes" className="flex flex-col gap-2.5 mt-1">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary-container" />
                <h3 id="heading-recent-routes" className="text-title-md text-on-surface font-bold">
                  آخرین مسیرها و جستجوهای ثبت‌شده
                </h3>
                <button
                  type="button"
                  aria-label="راهنمای مسیرها"
                  onClick={() =>
                    openHelp(
                      "مسیرها و هشدارهای سفر",
                      "تاریخچه مسیرهای طی‌شده و هشدارهای بیدارباش نزدیک به ایستگاه مقصد را می‌توانید مستقیماً از اینجا مجدداً فعال نمایید."
                    )
                  }
                  className="w-7 h-7 rounded-full bg-surface-container hover:bg-surface-container-highest text-primary flex items-center justify-center transition-all active:scale-90"
                >
                  <MI name="help" size={15} />
                </button>
              </div>
              <span className="text-[11px] text-outline">{toFa(Math.min(10, trips.length))} مورد اخیر</span>
            </div>

            <div className="flex flex-col gap-2">
              {trips.slice(0, 10).map((t) => {
                const cFrom = getLine(getStation(t.fromStationId)?.lines[0]?.lineId ?? "").color;
                const cTo = getLine(getStation(t.toStationId)?.lines[0]?.lineId ?? "").color;
                return (
                  <article
                    key={t.id}
                    className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm p-3 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      {/* ریل مبدأ به مقصد */}
                      <div className="flex flex-col items-center shrink-0" aria-hidden>
                        <span
                          className="w-2.5 h-2.5 rounded-full border-2 border-surface-container-lowest"
                          style={{ backgroundColor: cFrom }}
                        />
                        <span className="w-[2px] h-6 bg-outline-variant/50 rounded-full my-0.5" />
                        <span
                          className="w-2.5 h-2.5 rounded-full border-2 border-surface-container-lowest"
                          style={{ backgroundColor: cTo }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-on-surface truncate leading-5">{t.fromName}</p>
                        <p className="text-[13px] font-bold text-on-surface truncate leading-5 mt-1.5">{t.toName}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-outline flex items-center gap-1">
                          <MI name="schedule" size={12} />
                          {relShort(t.createdAt)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => replayTrip(t)}
                            aria-label={`مسیریابی مجدد از ${t.fromName} به ${t.toName}`}
                            className="px-2.5 h-8 rounded-lg bg-primary text-on-primary text-[11px] font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                          >
                            <MI name="north_east" size={14} />
                            مسیر
                          </button>
                          <button
                            type="button"
                            aria-label="حذف این سفر از تاریخچه"
                            onClick={() => deleteTrip(t.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-outline-variant hover:text-secondary hover:bg-surface-container active:scale-90 transition-all"
                          >
                            <MI name="close" size={16} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2.5 border-t border-outline-variant/20 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container text-[11px] font-bold text-primary">
                        <MI name="timer" size={13} />
                        {toFa(t.minutes)} دقیقه
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container text-[11px] font-medium text-on-surface-variant">
                        {t.transfers === 0 ? (
                          <>
                            <MI name="straight" size={13} className="text-tertiary" />
                            مستقیم
                          </>
                        ) : (
                          <>
                            <MI name="transfer_within_a_station" size={13} className="text-tertiary" />
                            {toFa(t.transfers)} تعویض
                          </>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container text-[11px] font-medium text-on-surface-variant mr-auto">
                        <MI name="payments" size={13} className="text-primary" />
                        {faMoney(t.fare)} تومان
                      </span>
                    </div>
                  </article>
                );
              })}

              {/* بیدارباش سفر */}
              {lastTrip && (
                <article className="bg-surface-container-low rounded-2xl p-3 border border-primary/20 shadow-sm flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-primary-fixed flex items-center justify-center text-primary dark:text-on-primary-fixed-variant shrink-0">
                      <MI name="alarm" size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-[13px] text-on-surface font-bold truncate">
                          بیدارباش سفر: {lastTrip.toName}
                        </h4>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            wakeOn
                              ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                              : "bg-surface-container-high text-outline"
                          }`}
                        >
                          {wakeOn ? "فعال" : "غیرفعال"}
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant mt-0.5 truncate">
                        هشدار {toFa(lastTrip.minutes)} دقیقه قبل از رسیدن • ساعت {wakeClock}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="لغو یا مدیریت هشدار"
                    onClick={toggleWake}
                    className={`p-1.5 rounded-full hover:bg-surface-container active:scale-90 transition-all shrink-0 ${
                      wakeOn ? "text-outline hover:text-secondary" : "text-primary"
                    }`}
                  >
                    <MI name={wakeOn ? "notifications_off" : "notifications_active"} size={20} />
                  </button>
                </article>
              )}
            </div>
          </section>
        )}

        {/* ---------------- ۶. بنر خدمت شهری (کارت بلیت) ---------------- */}
        <section
          aria-label="پیام سامانه"
          className="w-full rounded-xl bg-surface-container-low border border-outline-variant/30 p-3 flex items-center justify-between text-on-surface-variant"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <MI name="verified_user" size={20} className="text-primary shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-label-md font-bold text-on-surface">کارت بلیت متروی خود را متصل کنید</span>
              <span className="text-body-sm text-outline">ثبت خودکار تراکنش‌ها و تردد ایستگاهی با NFC</span>
            </div>
          </div>
          <span className="text-label-sm bg-surface-container-highest px-2 py-1 rounded text-primary font-medium shrink-0">
            خدمت شهری
          </span>
        </section>

        {/* ---------------- ۷. تنظیمات حریم خصوصی و تاریخچه ---------------- */}
        <section
          aria-labelledby="privacy-heading"
          className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/30 shadow-sm flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MI name="shield" size={22} className="text-primary" />
              <h3 id="privacy-heading" className="text-title-md text-on-surface font-bold">
                تنظیمات حریم خصوصی و تاریخچه
              </h3>
            </div>
            <button
              type="button"
              aria-label="راهنمای حریم خصوصی"
              onClick={() =>
                openHelp(
                  "حریم خصوصی و ذخیره‌سازی",
                  "اطلاعات سوابق تنها در حافظه محلی مرورگر دستگاه شما ذخیره شده و هیچ داده شخصی به سرورهای خارجی ارسال نمی‌شود."
                )
              }
              className="w-7 h-7 rounded-full bg-surface-container hover:bg-surface-container-highest text-primary flex items-center justify-center transition-all active:scale-90"
            >
              <MI name="help" size={16} />
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex flex-col gap-0.5">
              <span className="text-label-lg text-on-surface font-semibold">ذخیره خودکار تاریخچه بازدیدها</span>
              <span className="text-body-sm text-outline">ذخیره‌سازی سریع ایستگاه‌ها و مسیرها در حافظه دستگاه</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input type="checkbox" className="sr-only peer" checked={autoSave} onChange={toggleAutoSave} />
              <div className="w-11 h-6 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container" />
            </label>
          </div>

          <div className="border-t border-outline-variant/20 pt-3 flex items-center justify-between">
            <span className="text-body-sm text-on-surface-variant">مدیریت و پاکسازی سوابق</span>
            <button
              type="button"
              disabled={trips.length === 0}
              onClick={() => setConfirmAll(true)}
              className="text-label-md font-bold text-error hover:opacity-80 flex items-center gap-1 active:scale-95 transition-all disabled:opacity-40"
            >
              <MI name="clear_all" size={18} />
              <span>پاک‌کردن کل تاریخچه</span>
            </button>
          </div>
        </section>
      </main>

      {/* ---------------- مودال راهنما ---------------- */}
      <div
        className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-200 px-4 ${
          help ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setHelp(null);
        }}
      >
        <div
          className={`bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30 shadow-xl max-w-sm w-full transform transition-all duration-200 flex flex-col gap-3 ${
            help ? "scale-100" : "scale-95"
          }`}
        >
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-fixed flex items-center justify-center text-primary dark:text-on-primary-fixed-variant">
                <MI name="info" size={20} />
              </div>
              <h4 className="text-title-md text-on-surface font-bold">{help?.title ?? "راهنمای تاریخچه"}</h4>
            </div>
            <button
              type="button"
              aria-label="بستن"
              onClick={() => setHelp(null)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container active:scale-90 transition-all"
            >
              <MI name="close" size={20} />
            </button>
          </div>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            {help?.desc ?? "توضیحات تکمیلی این بخش..."}
          </p>
          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              onClick={() => setHelp(null)}
              className="px-4 py-2 rounded-xl bg-primary text-on-primary text-label-md font-bold active:scale-95 transition-all shadow-sm"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- مودال تأیید پاک‌کردن کل تاریخچه ---------------- */}
      <div
        className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-200 px-4 ${
          confirmAll ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setConfirmAll(false);
        }}
      >
        <div
          className={`bg-error-container rounded-2xl p-5 shadow-xl max-w-sm w-full transform transition-all duration-200 flex flex-col gap-3 ${
            confirmAll ? "scale-100" : "scale-95"
          }`}
        >
          <div className="flex items-center gap-2 border-b border-on-error-container/20 pb-3">
            <div className="w-9 h-9 rounded-full bg-error/15 flex items-center justify-center text-on-error-container">
              <MI name="delete_sweep" size={20} />
            </div>
            <h4 className="text-title-md text-on-error-container font-bold">پاک‌کردن کل تاریخچه</h4>
          </div>
          <p className="text-body-md text-on-error-container leading-relaxed">
            همه سفرها و سوابق ثبت‌شده حذف می‌شوند. این عمل بازگشت‌پذیر نیست.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConfirmAll(false)}
              className="px-4 py-2 rounded-xl bg-surface-container-lowest text-on-surface text-label-md font-bold active:scale-95 transition-all shadow-sm"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={deleteAll}
              disabled={deleting}
              className="px-4 py-2 rounded-xl bg-error text-on-error text-label-md font-bold active:scale-95 transition-all shadow-sm disabled:opacity-60"
            >
              {deleting ? "..." : "پاک‌کردن"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
