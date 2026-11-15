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
import { getCurrentGeoBest } from "@/lib/geo";
import { parseVoiceRoute } from "@/lib/voice-intent";
import { useJourney } from "@/lib/journey";
import { useToast } from "@/hooks/use-toast";
import JourneyCard from "@/components/metro/journey-card";

/* ============================================================
   خانه درمسیر — دستیار هوشمند جامع حمل‌ونقل شهری
   طبق طراحی ZIP (stitch _1) و دستور کاربر:
   - میانبرهای ۴گانه: خانه / محل کار / مقصدهای اخیر / ذخیره‌شده
   - مقایسه ۶ روش سفر (مترو/اتوبوس/BRT/تاکسی/خودرو/ترکیبی)
   - زمان و هزینه فقط با داده واقعی — بدون هیچ عدد ساختگی
   ============================================================ */

/* روش‌های حمل‌ونقل بدون داده واقعی — طبق دستور، هیچ عدد ساختگی نمایش داده نمی‌شود */
const NOT_READY_MODES = [
  { id: "bus", label: "اتوبوس", icon: "directions_bus" },
  { id: "brt", label: "تندرو BRT", icon: "directions_bus" },
  { id: "taxi", label: "تاکسی", icon: "local_taxi" },
  { id: "car", label: "خودرو", icon: "directions_car" },
] as const;

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
  const { toast } = useToast();

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

  /* ---- ایستگاه جاری (GPS) ----
     موقعیت ناعدد (شبکه/IP) باعث «نمایش ایستگاه اشتباه» می‌شد؛
     بهترین دقت از چند تلاش گرفته می‌شود و تا رسیدن موقعیت قابل‌اعتماد،
     به‌جای ایستگاهِ پیش‌فرضِ احتمالاً اشتباه، «در حال یافتن موقعیت» دیده می‌شود */
  const [near, setNear] = useState<{ id: string; name: string } | null>(null);
  const [nearAlt, setNearAlt] = useState<{ name: string; distanceM: number } | null>(null);
  const [fixAcc, setFixAcc] = useState<number | null>(null);
  const [geoNote, setGeoNote] = useState<string | null>(null);

  /* ---- مسیرهای روزمره ---- */
  const [daily, setDaily] = useState<DailyRouteRow[]>([]);

  /* ---- مقصدهای اخیر — فقط از تاریخچه واقعی سفر (وب: دیتابیس، اندروید: پل محلی) ---- */
  const [recentDests, setRecentDests] = useState<{ id: string; name: string }[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);

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

  /* ---- ایستگاه بعدی برای نوار وضعیت زنده — فقط با موقعیت واقعی ---- */
  const liveInfo = useMemo(() => {
    if (!near) return null;
    const sid = near.id;
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

  /* ---- دریافت مسیرهای روزمره + مقصدهای اخیر از تاریخچه واقعی ---- */
  useEffect(() => {
    fetch("/api/daily-routes")
      .then((r) => (r.ok ? r.json() : { routes: [] }))
      .then((d) => setDaily(d.routes ?? []))
      .catch(() => {});
    fetch("/api/history")
      .then((r) => (r.ok ? r.json() : { trips: [] }))
      .then((d) => {
        const trips: { toStationId?: string; toName?: string }[] = d?.trips ?? [];
        const seen = new Set<string>();
        const list: { id: string; name: string }[] = [];
        for (const t of trips) {
          if (!t?.toStationId || seen.has(t.toStationId)) continue;
          seen.add(t.toStationId);
          list.push({ id: t.toStationId, name: t.toName ?? t.toStationId });
          if (list.length >= 6) break;
        }
        setRecentDests(list);
      })
      .catch(() => {});
  }, []);

  /* ---- موقعیت مکانی برای «ایستگاه جاری» ---- */
  useEffect(() => {
    let alive = true;
    void (async () => {
      // همگرایی GPS تا دقت خوب — fixهای اولیه ناعدد باعث
      // «ایستگاه اشتباه» می‌شدند (پایانه جنوب به‌جای علی‌آباد)
      const fix = await getCurrentGeoBest(3, 8000, 450, 25000);
      if (!alive) return;
      if (!fix) {
        setGeoNote("دسترسی موقعیت مکانی در دسترس نیست");
        return;
      }
      setFixAcc(fix.accuracy);
      const n = nearestStationTo(fix.lat, fix.lng);
      if (!n) {
        setGeoNote("در محدوده ایستگاه‌های مترو نیستید");
        return;
      }
      setNear({ id: n.id, name: n.name });
      // دقت متوسط (۴۵۰ تا ۸۰۰ متر) — گزینه دوم هم صادقانه اعلام می‌شود
      if (n.alternative && (fix.accuracy ?? Infinity) > 450 && n.alternative.distanceM < 2500) {
        setNearAlt({ name: n.alternative.name, distanceM: n.alternative.distanceM });
      } else {
        setNearAlt(null);
      }
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
      const intent = parseVoiceRoute(text, stations);
      if (!intent.matched) {
        toast({
          title: "ایستگاهی شناسایی نشد",
          description: "مثلاً بگویید: «از علی‌آباد تا تجریش» یا «میخوام برم میدان آزادی»",
        });
        return;
      }

      /* قفل مسیریابی تکراری — وقتی سفر فعالی در جریان است */
      const active = useJourney.getState().journey;
      const journeyRunning =
        active && active.currentIndex < active.path.length - 1;
      if (journeyRunning && (intent.fromId || intent.toId) && (intent.fromId || intent.originFromHere)) {
        toast({
          title: "سفر فعالی در جریان است",
          description: "برای مسیریابی جدید، ابتدا سفر فعلی را از پایین همین صفحه پایان دهید",
        });
        return;
      }

      /* مبدأ هوشمند: «از اینجا» یا نبود مبدأ در جمله → ایستگاه فعلی GPS */
      const fromId = intent.fromId ?? (intent.originFromHere ? (near?.id ?? null) : null);
      const fromName =
        intent.fromId
          ? (stations.find((s) => s.id === intent.fromId)?.name ?? null)
          : intent.originFromHere
            ? (near?.name ?? null)
            : null;
      const toId = intent.toId;
      const toName = intent.toId ? (stations.find((s) => s.id === intent.toId)?.name ?? null) : null;

      if (toId) {
        setDestText(toName ?? "");
        setDestId(toId);
      }
      if (fromId) {
        setOriginText(fromName ?? "");
        setOriginId(fromId);
      }

      if (fromId && toId) {
        toast({
          title: "مبدأ و مقصد صوتی شناسایی شد",
          description: `${fromName} → ${toName} — مسیریابی باز می‌شود`,
        });
        router.push(`/plan?from=${fromId}&to=${toId}`);
      } else if (toId) {
        toast({
          title: "مقصد صوتی ثبت شد",
          description: intent.originFromHere && !near
            ? "برای تعیین مبدأ باید موقعیت مکانی در دسترس باشد"
            : `مقصد: ${toName}${fromId ? ` — مبدأ: ${fromName}` : " — مبدأ را انتخاب کنید"}`,
        });
      } else if (fromId) {
        toast({
          title: "مبدأ صوتی ثبت شد",
          description: `مبدأ: ${fromName} — حالا مقصد را بگویید یا انتخاب کنید`,
        });
      }
    },
    [stations, near, router, toast]
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
    /* وقتی سفر فعالی در جریان است، مسیریابی جدید قفل است */
    const active = useJourney.getState().journey;
    if (active && active.currentIndex < active.path.length - 1) {
      toast({
        title: "سفر فعالی در جریان است",
        description: "برای مسیریابی جدید، ابتدا سفر فعلی را از پایین صفحه پایان دهید",
      });
      return;
    }
    if (originId && destId) router.push(`/plan?from=${originId}&to=${destId}`);
    else if (originId) router.push(`/plan?from=${originId}`);
    else router.push("/plan");
  }, [originId, destId, router, toast]);

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
          {/* 1. دستیار صوتی */}
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
                {voice.error ? voice.errorKind === "blocked" ? "اجازه میکروفن را بدهید یا در تب جدید باز کنید" : "دستگاه شما از جستجوی صوتی پشتیبانی نمی‌کند" : "مثلاً: «از علی‌آباد تا تجریش میخوام برم»"}
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

          {/* 2. میانبرهای روزمره مسافر — طبق دستور: خانه/محل کار/اخیر/ذخیره‌شده (بدون ایستگاه و وضعیت شبکه) */}
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MI name="electric_bolt" size={20} className="text-primary" />
                <h3 className="font-bold text-xs text-on-surface">میانبرهای روزمره مسافر</h3>
              </div>
              <span className="text-[9px] font-bold text-outline bg-surface-container px-2 py-0.5 rounded-full">مستقل از روش سفر</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center pt-1">
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
              {/* مقصدهای اخیر — فقط از تاریخچه واقعی سفر */}
              <button
                onClick={() => setRecentOpen((v) => !v)}
                aria-expanded={recentOpen}
                className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
                type="button"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-50 group-hover:bg-amber-100 dark:bg-primary/10 dark:group-hover:bg-primary/20 text-primary flex items-center justify-center transition-colors shadow-sm">
                  <MI name="history" size={24} />
                </div>
                <span className="text-[11px] font-medium text-on-surface group-hover:text-primary truncate w-full">مقصدهای اخیر</span>
              </button>
              {/* مقصدهای ذخیره‌شده — صفحه ذخیره‌ها */}
              <button
                onClick={() => router.push("/saved")}
                className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
                type="button"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 group-hover:bg-emerald-100 dark:bg-primary/10 dark:group-hover:bg-primary/20 text-tertiary flex items-center justify-center transition-colors shadow-sm">
                  <MI name="bookmark" size={24} />
                </div>
                <span className="text-[11px] font-medium text-on-surface group-hover:text-tertiary truncate w-full">ذخیره‌شده‌ها</span>
              </button>
            </div>

            {/* لیست مقصدهای اخیر — فقط با داده واقعی تاریخچه؛ خالی = پیام صادقانه */}
            {recentOpen && (
              <div className="fade-in border-t border-outline-variant/30 pt-2.5 space-y-1.5">
                {recentDests.length > 0 ? (
                  <>
                    <p className="text-[10px] font-bold text-on-surface-variant">از تاریخچه سفرهای شما:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {recentDests.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => router.push(`/plan?to=${d.id}`)}
                          className="flex items-center gap-1.5 bg-surface-container px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-on-surface hover:bg-surface-container-high active:scale-95 transition-all"
                        >
                          <MI name="location_on" size={14} className="text-secondary shrink-0" />
                          <span className="truncate max-w-[160px]">{d.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-outline leading-relaxed py-1">
                    هنوز مقصدی در تاریخچه سفر ثبت نشده است. پس از اولین مسیریابی، مقصدهای اخیر اینجا نمایش داده می‌شود.
                  </p>
                )}
              </div>
            )}
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

            {/* دکمه مسیریابی — نمایش مسیر انتخاب‌شده */}
            <button
              onClick={openPlan}
              className={`w-full h-12 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md ${
                originId && destId
                  ? "bg-primary text-on-primary shadow-primary/30"
                  : "bg-surface-container-lowest text-primary border border-primary/40 shadow-none hover:bg-surface-container"
              }`}
              type="button"
              aria-label="مسیریابی و نمایش مسیر"
            >
              <MI name="directions" size={20} />
              {originId && destId
                ? `مسیریابی ${originText !== "" && destText !== "" ? `از ${originText} به ${destText}` : ""}`
                : "انتخاب مبدأ و مقصد برای مسیریابی"}
              <MI name="chevron_left" size={18} className="opacity-80" />
            </button>

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
                <span className="text-[11px] font-bold text-primary truncate">
                  {liveInfo?.stationName ?? geoNote ?? "در حال یافتن موقعیت…"}
                </span>
                {nearAlt && fixAcc !== null && fixAcc > 450 && (
                  <span className="text-[9px] text-outline shrink-0" title="دقت GPS متوسط است — ایستگاه دوم احتمالی">
                    یا {nearAlt.name}؟
                  </span>
                )}
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

          {/* 4. مقایسه مدهای سفر شهری — ۶ روش؛ زمان/هزینه فقط با داده واقعی */}
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MI name="alt_route" size={20} className="text-primary" />
                <h3 className="font-bold text-xs text-on-surface">مقایسه مدهای سفر شهری</h3>
              </div>
              <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">فقط داده واقعی</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {/* مترو — داده واقعی موتور مسیریابی */}
              <button
                type="button"
                onClick={() => plan && openPlan()}
                className={`relative bg-surface-container-low border rounded-xl p-2.5 flex flex-col items-center text-center transition-all ${
                  plan ? "border-2 border-primary shadow-sm active:scale-[0.97]" : "border-outline-variant/30"
                }`}
              >
                {plan && (
                  <span className="absolute -top-2 bg-primary text-on-primary text-[9px] px-1.5 py-0.5 rounded-full font-bold">پیشنهادی</span>
                )}
                <div className="w-8 h-8 rounded-lg bg-primary-fixed text-primary flex items-center justify-center">
                  <MI name="directions_subway" size={20} />
                </div>
                <span className="text-[11px] font-bold text-on-surface mt-1.5">مترو</span>
                {plan ? (
                  <>
                    <span className="text-sm font-bold text-primary mt-0.5">
                      {toFa(plan.totalMinutes)} <span className="text-[10px] font-normal text-on-surface-variant">دقیقه</span>
                    </span>
                  </>
                ) : (
                  <span className="text-[9px] font-bold text-outline mt-1 bg-surface-container px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <MI name="hourglass_empty" size={11} />آماده‌نشده
                  </span>
                )}
              </button>
              {/* سفر ترکیبی — پیاده + مترو؛ فقط اگر داده واقعی وجود داشته باشد */}
              <button
                type="button"
                onClick={() => plan && openPlan()}
                className={`bg-surface-container-low border rounded-xl p-2.5 flex flex-col items-center text-center transition-all ${
                  plan ? "border-outline-variant/30 hover:bg-surface-container active:scale-[0.97]" : "border-outline-variant/30"
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-tertiary-fixed/60 text-tertiary flex items-center justify-center">
                  <MI name="alt_route" size={20} />
                </div>
                <span className="text-[11px] font-bold text-on-surface mt-1.5">ترکیبی</span>
                {plan ? (
                  <>
                    <span className="text-sm font-bold text-tertiary mt-0.5">
                      {toFa(plan.totalMinutes)} <span className="text-[10px] font-normal text-on-surface-variant">دقیقه</span>
                    </span>
                    <span className="text-[10px] text-on-surface-variant mt-0.5">
                      پیاده + مترو{plan.transfers > 0 ? ` • ${toFa(plan.transfers)} تبادل` : " • بدون تعویض خط"}
                    </span>
                  </>
                ) : (
                  <span className="text-[9px] font-bold text-outline mt-1 bg-surface-container px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <MI name="hourglass_empty" size={11} />آماده‌نشده
                  </span>
                )}
              </button>
              {/* روش‌های بدون داده واقعی — برچسب صادقانه «قابلیت آماده‌نشده» */}
              {NOT_READY_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toast({ title: `${m.label}: قابلیت آماده‌نشده`, description: "داده واقعی این روش هنوز در دسترس نیست و عدد ساختگی نمایش داده نمی‌شود" })}
                  className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-2.5 flex flex-col items-center text-center hover:bg-surface-container active:scale-[0.97] transition-all"
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-container text-on-surface-variant flex items-center justify-center">
                    <MI name={m.icon} size={20} />
                  </div>
                  <span className="text-[11px] font-bold text-on-surface mt-1.5">{m.label}</span>
                  <span className="text-[9px] font-bold text-outline mt-1 bg-surface-container px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <MI name="hourglass_empty" size={11} />آماده‌نشده
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-outline-variant leading-relaxed">
              زمان و هزینه فقط برای روش‌هایی نمایش داده می‌شود که داده واقعی دارند. اتوبوس، BRT، تاکسی و خودرو پس از اتصال به داده رسمی فعال می‌شوند.
            </p>
          </section>

          {/* 5. بنر تبلیغات */}
          <section className="bg-gradient-to-l from-primary/5 via-surface-container-low to-surface-container-lowest rounded-2xl p-4 border border-primary/20 shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-center py-2 text-center text-xs font-medium text-outline">
              <MI name="campaign" size={16} className="ml-1.5" />
              بخش تبلیغ
            </div>
          </section>

          {/* کارت فشرده سفر فعال — پایین صفحه، از ایستگاه فعلی تا مقصد */}
          <JourneyCard />
        </div>
      </main>
    </>
  );
}
