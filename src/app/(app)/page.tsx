"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AppBar, MI, useInitCity, useShell } from "@/components/metro/shell";
import {
  computeRoute,
  getLine,
  getStation,
  nextArrivalsBoth,
  searchStations,
  stationsOfLine,
  toFa,
} from "@/lib/metro-data";
import type { StationDef } from "@/lib/metro-data";
import { nearestStationTo } from "@/lib/station-geo";
import { useVoiceSearch } from "@/components/metro/voice";
import { getCurrentGeo } from "@/lib/geo";
import JourneyCard from "@/components/metro/journey-card";

/* ============================================================
   خانه متروجو — بازسازی دقیق طبق طرح Stitch (_16/code.html)
   بخش‌ها: بنر تبلیغ، دستیار صوتی، دسترسی سریع، مسیریاب زنده
   ============================================================ */

interface DailyRouteRow {
  id: string;
  kind: string;
  label: string;
  fromStationId: string;
  fromName: string;
  toStationId: string;
  toName: string;
}

const SUGGESTED_PILLS: { label: string; id: string }[] = [
  { label: "تجریش", id: "tajrish" },
  { label: "بهشتی", id: "beheshti" },
  { label: "دروازه دولت", id: "dowlat" },
  { label: "صادقیه", id: "sadeghieh" },
];

/** تشخیص mount شدن — برای جلوگیری از hydration mismatch در محتوای زمان‌دار */
const subscribeNoop = () => () => {};

function stationsOf(id: string): StationDef | undefined {
  return getStation(id);
}

/** چیپ نام خط — با رنگ رسمی خط */
function LineChips({ stationId }: { stationId: string }) {
  const st = getStation(stationId);
  if (!st) return null;
  return (
    <span className="flex gap-1 shrink-0">
      {st.lines.slice(0, 2).map((l) => {
        const line = getLine(l.lineId);
        if (!line) return null;
        return (
          <span
            key={l.lineId}
            className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ backgroundColor: line.color, color: line.textOnColor }}
          >
            {line.name}
          </span>
        );
      })}
    </span>
  );
}

export default function Page() {
  useInitCity();
  const router = useRouter();
  const city = useShell((s) => s.city);

  /** محتوای وابسته به زمان (قطار بعدی) فقط بعد از mount رندر می‌شود */
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  /* ---- مسیریاب ---- */
  const [originText, setOriginText] = useState("میدان انقلاب اسلامی");
  const [destText, setDestText] = useState("تجریش");
  const [originId, setOriginId] = useState<string | null>("enghelab-sq");
  const [destId, setDestId] = useState<string | null>("tajrish");
  const [dropFor, setDropFor] = useState<"origin" | "destination" | null>(null);
  const [swapped, setSwapped] = useState(false);

  /* ---- ایستگاه جاری (GPS) ---- */
  const [near, setNear] = useState<{ id: string; name: string } | null>(null);

  /* ---- مسیرهای روزمره ---- */
  const [daily, setDaily] = useState<DailyRouteRow[]>([]);

  /* ---- وضعیت صوت ---- */
  const [voiceResult, setVoiceResult] = useState<string | null>(null);
  const originRef = useRef<HTMLInputElement>(null);
  const destRef = useRef<HTMLInputElement>(null);

  const stations = useMemo(
    () => searchStations({ cityId: city === "isfahan" ? "isfahan" : city === "mashhad" ? "mashhad" : "tehran" }),
    [city]
  );

  const suggestions = useMemo(() => {
    const q = dropFor === "origin" ? originText : destText;
    if (!dropFor) return [];
    const base = q.trim() ? stations.filter((s) => s.name.includes(q.trim())) : stations;
    const featured = base.filter((s) => s.featured);
    return (featured.length >= 3 ? featured : base).slice(0, 6);
  }, [dropFor, originText, destText, stations]);

  const plan = useMemo(
    () => (originId && destId && originId !== destId ? computeRoute(originId, destId, "fastest") : null),
    [originId, destId]
  );

  /* ---- ایستگاه بعدی برای نوار وضعیت زنده ---- */
  const liveInfo = useMemo(() => {
    const sid = near?.id ?? "dowlat";
    const st = getStation(sid);
    if (!st || st.lines.length === 0) return null;
    const lineId = st.lines[0].lineId;
    const idx = st.lines[0].order;
    const list = stationsOfLine(lineId);
    const dirs = nextArrivalsBoth(lineId, sid);
    const withMin = dirs.map((d, k) => ({ ...d, k })).filter((d) => d.minutes.length > 0);
    if (!withMin.length) return { stationName: st.name, text: null, out: dirs.length > 0 && dirs[0].outOfService };
    const best = withMin.reduce((a, b) => (a.minutes[0] <= b.minutes[0] ? a : b));
    const adj = best.k === 0 ? list[idx + 1] : list[idx - 1];
    return {
      stationName: st.name,
      text: `ایستگاه بعدی: ${adj?.name ?? best.to} (${toFa(best.minutes[0])} دقیقه)`,
      out: false,
    };
  }, [near]);

  /* ---- دریافت مسیرهای روزمره ---- */
  useEffect(() => {
    fetch("/api/daily-routes")
      .then((r) => (r.ok ? r.json() : { routes: [] }))
      .then((d) => setDaily(d.routes ?? []))
      .catch(() => {});
  }, []);

  /* ---- موقعیت مکانی برای «ایستگاه جاری» ---- */
  useEffect(() => {
    let alive = true;
    void (async () => {
      // موقعیت‌های ناعدد (دقت پایین) باعث «ایستگاه اشتباه» می‌شدند
      const fix = await getCurrentGeo(10000);
      if (!alive || !fix) return;
      if ((fix.accuracy ?? Infinity) > 900) return;
      const n = nearestStationTo(fix.lat, fix.lng);
      if (n) setNear({ id: n.id, name: n.name });
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---- انتخاب ایستگاه از دراپ‌داون ---- */
  const selectStation = useCallback((which: "origin" | "destination", st: StationDef) => {
    if (which === "origin") {
      setOriginText(st.name);
      setOriginId(st.id);
    } else {
      setDestText(st.name);
      setDestId(st.id);
    }
    setDropFor(null);
  }, []);

  const clearStation = useCallback((which: "origin" | "destination") => {
    if (which === "origin") {
      setOriginText("");
      setOriginId(null);
      originRef.current?.focus();
    } else {
      setDestText("");
      setDestId(null);
      destRef.current?.focus();
    }
  }, []);

  const swap = useCallback(() => {
    setOriginText(destText);
    setDestText(originText);
    setOriginId(destId);
    setDestId(originId);
    setSwapped((v) => !v);
  }, [originText, destText, originId, destId]);

  const handleVoiceResult = useCallback(
    (text: string) => {
      setVoiceResult(text);
      // الگوی «از X تا/به Y»
      const m = text.match(/از\s+([^،,تابه]+?)\s+(?:تا|به)\s+(.+)$/);
      if (m) {
        const from = stations.find((s) => m[1].trim() && s.name.includes(m[1].trim()));
        const to = stations.find((s) => m[2].trim() && s.name.includes(m[2].trim()));
        if (from) {
          setOriginText(from.name);
          setOriginId(from.id);
        }
        if (to) {
          setDestText(to.name);
          setDestId(to.id);
        }
        if (from && to) return;
      }
      const single = stations.find((s) => text.includes(s.name));
      if (single) {
        setDestText(single.name);
        setDestId(single.id);
      }
    },
    [stations]
  );

  const voice = useVoiceSearch(handleVoiceResult);

  const applyDailyRoute = useCallback(
    (kind: "home" | "work") => {
      const r = daily.find((d) => d.kind === kind);
      if (r) {
        setOriginText(r.fromName);
        setOriginId(r.fromStationId);
        setDestText(r.toName);
        setDestId(r.toStationId);
      } else {
        router.push("/saved");
      }
    },
    [daily, router]
  );

  const openPlan = useCallback(() => {
    if (originId && destId) router.push(`/plan?from=${originId}&to=${destId}`);
    else if (originId) router.push(`/plan?from=${originId}`);
    else router.push("/plan");
  }, [originId, destId, router]);

  const voiceStatusText = voice.listening
    ? "در حال گوش دادن..."
    : voice.busy
      ? "در حال پردازش..."
      : voiceResult
        ? voiceResult
        : "لمس کنید و صحبت کنید";

  return (
    <>
      <AppBar />
      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-3 pb-28">
        <div className="space-y-4">
          {/* 0. کارت سفر فعال — نمایش ایستگاه‌به‌ایستگاه مسیر جاری */}
          <JourneyCard />

          {/* 1. بنر تبلیغات */}
          <section className="bg-gradient-to-l from-primary/5 via-surface-container-low to-surface-container-lowest rounded-2xl p-4 border border-primary/20 shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-center py-2 text-center text-xs font-medium text-outline">
              <MI name="campaign" size={16} className="ml-1.5" />
              بخش تبلیغ
            </div>
          </section>

          {/* 2. دستیار صوتی */}
          <section className="bg-gradient-to-b from-surface-container-lowest to-surface-container-low rounded-2xl p-5 border border-outline-variant/40 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
            {/* هاله محیطی */}
            <div className="absolute -top-12 -left-12 w-44 h-44 bg-primary-fixed/40 rounded-full blur-2xl pointer-events-none"></div>
            <div className="absolute -bottom-10 -right-10 w-44 h-44 bg-tertiary-fixed/30 rounded-full blur-2xl pointer-events-none"></div>

            <div className="relative w-28 h-28 flex items-center justify-center my-1.5">
              <div className="pulse-wave-1 absolute inset-0 rounded-full bg-primary-fixed/60"></div>
              <div className="pulse-wave-2 absolute inset-2 rounded-full bg-primary-fixed/40"></div>
              <button
                onClick={() => {
                  setVoiceResult(null);
                  if (voice.listening) voice.stop();
                  else voice.start();
                }}
                aria-label="جستجوی صوتی"
                className={`relative z-10 w-20 h-20 rounded-full bg-primary-container text-white flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 ${
                  voice.listening ? "ring-4 ring-primary/30" : ""
                }`}
              >
                <MI name={voice.listening ? "graphic_eq" : "mic"} size={36} />
              </button>
            </div>
            <div className="space-y-1.5 mt-1">
              <h2
                className={`text-base font-bold transition-colors ${
                  voice.error ? "text-error" : "text-on-surface"
                }`}
              >
                {voice.error ? "صدای شما شنیده نشد" : voiceStatusText}
              </h2>
              <p className="text-xs text-outline">
                {voice.error ? voice.errorKind === "blocked" ? "اجازه میکروفن را بدهید یا در تب جدید باز کنید" : "دستگاه شما از جستجوی صوتی پشتیبانی نمی‌کند" : "نام ایستگاه مبدأ و مقصد را بگویید"}
              </p>
              <div className="pt-1">
                <button
                  onClick={() => {
                    setOriginText("میدان انقلاب اسلامی");
                    setOriginId("enghelab-sq");
                    setDestText("تجریش");
                    setDestId("tajrish");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium cursor-pointer hover:bg-primary/20 transition-colors"
                >
                  <MI name="chat_bubble" size={15} />
                  «از اینجا تا تجریش چقدر راهه؟»
                </button>
              </div>
            </div>
          </section>

          {/* 3. دسترسی سریع مسافر */}
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MI name="electric_bolt" size={20} className="text-primary" />
                <h3 className="font-bold text-xs text-on-surface">دسترسی سریع مسافر</h3>
              </div>
              <span className="text-[10px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                بروزرسانی زنده
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center pt-1">
              <button
                onClick={() => applyDailyRoute("home")}
                className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
                type="button"
              >
                <div className="w-12 h-12 rounded-2xl bg-primary/10 group-hover:bg-primary/20 text-primary flex items-center justify-center transition-colors shadow-sm">
                  <MI name="home" size={24} />
                </div>
                <span className="text-[11px] font-medium text-on-surface group-hover:text-primary truncate w-full">به خانه</span>
              </button>
              <button
                onClick={() => applyDailyRoute("work")}
                className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
                type="button"
              >
                <div className="w-12 h-12 rounded-2xl bg-tertiary-fixed/50 group-hover:bg-tertiary-fixed text-tertiary flex items-center justify-center transition-colors shadow-sm">
                  <MI name="work" size={24} />
                </div>
                <span className="text-[11px] font-medium text-on-surface group-hover:text-tertiary truncate w-full">محل کار</span>
              </button>
              <button
                onClick={() => router.push("/map")}
                className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
                type="button"
              >
                <div className="w-12 h-12 rounded-2xl bg-primary-fixed/50 group-hover:bg-primary-fixed text-primary flex items-center justify-center transition-colors shadow-sm">
                  <MI name="download_for_offline" size={24} />
                </div>
                <span className="text-[11px] font-medium text-on-surface group-hover:text-primary truncate w-full">نقشه آفلاین</span>
              </button>
              <button
                onClick={() => router.push("/lines")}
                className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
                type="button"
              >
                <div className="w-12 h-12 rounded-2xl bg-surface-container hover:bg-surface-container-high text-primary flex items-center justify-center transition-colors shadow-sm">
                  <MI name="schedule" size={24} />
                </div>
                <span className="text-[11px] font-medium text-on-surface group-hover:text-primary truncate w-full">زمان‌بندی</span>
              </button>
              <button
                onClick={() => router.push("/status")}
                className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
                type="button"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-50 group-hover:bg-blue-100 dark:bg-primary/10 dark:group-hover:bg-primary/20 text-primary flex items-center justify-center transition-colors shadow-sm relative">
                  <MI name="groups" size={24} />
                  <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <span className="text-[11px] font-medium text-on-surface group-hover:text-primary truncate w-full">شلوغی سکو</span>
              </button>
            </div>
          </section>

          {/* 4. مسیریاب سریع روزانه */}
          <section className="bg-surface-container-lowest rounded-2xl p-3.5 border border-outline-variant/40 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <MI name="route" size={18} className="text-primary" />
                <h3 className="font-bold text-xs text-on-surface">محاسبه دقیق زمان سفر و ایستگاه جاری</h3>
              </div>
              <span
                id="routeLineBadge"
                className="text-[10px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                {plan ? `${plan.legs[0].lineName} به ${plan.legs[plan.legs.length - 1].lineName}` : "خطوط مترو"}
              </span>
            </div>

            {/* ورودی مبدأ و مقصد + دکمه جابجایی */}
            <div className="relative bg-surface-container-low rounded-xl p-2.5 border border-outline-variant/30 flex items-center gap-2">
              <div className="flex-1 space-y-2 min-w-0">
                {/* ردیف مبدأ */}
                <div className="relative flex items-center gap-2.5 bg-surface-container-lowest rounded-lg px-3 py-2 border border-outline-variant/30 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <div className="flex-1 flex flex-col justify-center min-w-0">
                    <span className="text-xs text-outline leading-tight font-bold">مبدأ</span>
                    <input
                      ref={originRef}
                      value={originText}
                      onChange={(e) => {
                        setOriginText(e.target.value);
                        setOriginId(null);
                        setDropFor("origin");
                      }}
                      onFocus={() => setDropFor("origin")}
                      placeholder="انتخاب ایستگاه مبدأ..."
                      type="text"
                      className="w-full bg-transparent text-sm font-bold text-on-surface focus:outline-none border-none p-0 mt-0.5"
                      aria-label="ایستگاه مبدأ"
                    />
                  </div>
                  <button
                    onClick={() => clearStation("origin")}
                    aria-label="پاک کردن مبدأ"
                    className="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors shrink-0"
                    type="button"
                  >
                    <MI name="close" size={15} />
                  </button>
                  {dropFor === "origin" && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 py-1 z-50 text-xs max-h-56 overflow-y-auto pretty-scroll">
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => selectStation("origin", s)}
                          className="w-full text-right px-3 py-2 hover:bg-surface-container text-on-surface flex items-center justify-between gap-2"
                          type="button"
                        >
                          <span className="truncate">{s.name}</span>
                          <LineChips stationId={s.id} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ردیف مقصد */}
                <div className="relative flex items-center gap-2.5 bg-surface-container-lowest rounded-lg px-3 py-2 border border-outline-variant/30 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0"></span>
                  <div className="flex-1 flex flex-col justify-center min-w-0">
                    <span className="text-xs text-outline leading-tight font-bold">مقصد</span>
                    <input
                      ref={destRef}
                      value={destText}
                      onChange={(e) => {
                        setDestText(e.target.value);
                        setDestId(null);
                        setDropFor("destination");
                      }}
                      onFocus={() => setDropFor("destination")}
                      placeholder="انتخاب ایستگاه مقصد..."
                      type="text"
                      className="w-full bg-transparent text-sm font-bold text-on-surface focus:outline-none border-none p-0 mt-0.5"
                      aria-label="ایستگاه مقصد"
                    />
                  </div>
                  <button
                    onClick={() => clearStation("destination")}
                    aria-label="پاک کردن مقصد"
                    className="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors shrink-0"
                    type="button"
                  >
                    <MI name="close" size={15} />
                  </button>
                  {dropFor === "destination" && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 py-1 z-50 text-xs max-h-56 overflow-y-auto pretty-scroll">
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => selectStation("destination", s)}
                          className="w-full text-right px-3 py-2 hover:bg-surface-container text-on-surface flex items-center justify-between gap-2"
                          type="button"
                        >
                          <span className="truncate">{s.name}</span>
                          <LineChips stationId={s.id} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* دکمه جابجایی مبدأ و مقصد */}
              <div className="flex items-center justify-center shrink-0">
                <button
                  aria-label="جابجایی مبدأ و مقصد"
                  onClick={swap}
                  className="w-10 h-10 rounded-full bg-surface-container-lowest hover:bg-surface-container-high border border-outline-variant/40 shadow-sm flex items-center justify-center text-primary active:scale-90 transition-all duration-300 ease-in-out focus:outline-none"
                  type="button"
                >
                  <MI name="swap_vert" size={20} className={swapped ? "rotate-180 transition-transform duration-300" : "transition-transform duration-300"} />
                </button>
              </div>
            </div>

            {/* پیشنهادهای سریع */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-xs text-outline font-medium shrink-0">پیشنهادی:</span>
              {SUGGESTED_PILLS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    const st = stationsOf(p.id);
                    if (st) selectStation("destination", st);
                  }}
                  className="px-2.5 py-0.5 rounded-full bg-surface-container-low hover:bg-surface-container text-xs font-medium text-on-surface-variant border border-outline-variant/30 transition-colors shrink-0"
                  type="button"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* آمار ریز سفر */}
            <button
              onClick={openPlan}
              className="grid grid-cols-3 gap-2 text-center py-1 border-y border-outline-variant/20 w-full cursor-pointer"
              type="button"
              aria-label="مشاهده جزئیات مسیر"
            >
              <div className="flex flex-col items-center justify-center">
                <span className="text-xs text-outline">مدت تقریبی</span>
                <span className="text-base font-bold text-primary">{plan ? `${toFa(plan.totalMinutes)} دقیقه` : "—"}</span>
              </div>
              <div className="flex flex-col items-center justify-center">
                <span className="text-xs text-outline">تعداد ایستگاه</span>
                <span className="text-base font-bold text-primary">{plan ? toFa(plan.totalStations) : "—"}</span>
              </div>
              <div className="flex flex-col items-center justify-center">
                <span className="text-xs text-outline">تبادل خط</span>
                <span className="text-base font-bold text-primary">
                  {plan ? (plan.transfers > 0 ? `${toFa(plan.transfers)} تعویض` : "بدون تعویض") : "—"}
                </span>
              </div>
            </button>

            {/* وضعیت زنده ایستگاه */}
            <div className="bg-surface-container-low rounded-xl px-2.5 py-1.5 flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-1.5 font-medium text-on-surface min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="text-[11px] text-outline shrink-0">ایستگاه جاری:</span>
                <span className="text-[11px] font-bold text-primary truncate">{liveInfo?.stationName ?? "—"}</span>
              </div>
              {mounted && liveInfo?.text && (
                <span className="text-[10px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full shrink-0">
                  {liveInfo.text}
                </span>
              )}
              {mounted && liveInfo?.out && (
                <span className="text-[10px] font-bold text-error bg-error-container/60 px-2 py-0.5 rounded-full shrink-0">
                  خارج از ساعات سرویس
                </span>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
