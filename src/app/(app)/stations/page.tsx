"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MI, PageHeader, useInitCity, useShell } from "@/components/metro/shell";
import { useVoiceSearch, openStandaloneTab } from "@/components/metro/voice";
import { useToast } from "@/hooks/use-toast";
import {
  AMENITIES,
  CROWD_COLOR,
  LINES,
  getLine,
  headwayAt,
  nextArrivalsBoth,
  searchStations,
  stationsOfLine,
  toFa,
  type AmenityKey,
  type StationDef,
} from "@/lib/metro-data";

/* ============================================================
   ایستگاه‌ها — جستجو، فیلتر خط/امکانات و کارت‌های ایستگاه
   طرح مرجع: _13 (اصلی) — بدون بخش نشان‌ها در طرح → چیپ‌های نشان‌شده
   ============================================================ */

const CITY_NAME: Record<string, string> = {
  tehran: "تهران",
  mashhad: "مشهد",
  isfahan: "اصفهان",
};

/* امکانات فیلتر (طبق طراحی): سرویس بهداشتی، مادر و کودک، آسانسور، پارکینگ */
const FACILITY_CHIPS: AmenityKey[] = ["wc", "baby", "elevator", "parking"];

interface FavRow {
  id: string;
  name: string;
  lines: { id: string; color: string }[];
}

/* ---------------------- کارت ایستگاه (طرح _13) ---------------------- */
function StationCard({
  st,
  fav,
  now,
  onToggleFav,
}: {
  st: StationDef;
  fav: boolean;
  now: number | null;
  onToggleFav: (st: StationDef) => void;
}) {
  const router = useRouter();
  const lines = st.lines.map((l) => getLine(l.lineId));
  const interchange = lines.length > 1;
  const first = lines[0];
  const order = st.lines[0]?.order ?? 0;
  const total = stationsOfLine(first.id).length;
  const isTerminal = order === 0 || order === total - 1;

  /* فاصله حرکت زنده بر اساس ساعت روز */
  const headway =
    now !== null
      ? headwayAt(first, new Date(now).getHours() * 60 + new Date(now).getMinutes())
      : first.headway;

  /* ورودهای بعدی هر خط (به اولین مقصد) */
  const arrivals =
    now !== null
      ? st.lines.map((ls) => ({
          line: getLine(ls.lineId),
          arr: nextArrivalsBoth(ls.lineId, st.id, now)[0],
        }))
      : null;
  const liveArr = arrivals?.find((a) => a.arr && !a.arr.outOfService && a.arr.minutes.length > 0);
  const crowd = liveArr?.arr ?? arrivals?.find((a) => a.arr)?.arr ?? null;

  return (
    <article className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
      {/* نوار رنگی خط(ها) در بالای کارت */}
      <div className="absolute top-0 right-0 left-0 h-1.5 flex" aria-hidden>
        {lines.map((l) => (
          <div key={l.id} className="flex-1" style={{ backgroundColor: l.color }} />
        ))}
      </div>

      {/* سر کارت: حباب آیکون + نام + شمار ایستگاه/فاصله حرکت */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border shadow-xs relative ${
              interchange
                ? "bg-surface-container border-outline-variant/40 text-primary"
                : "border"
            }`}
            style={
              interchange
                ? undefined
                : { backgroundColor: `${first.color}1A`, borderColor: `${first.color}33`, color: first.color }
            }
          >
            <MI name={interchange ? "alt_route" : "directions_subway"} size={24} fill={interchange} />
            {lines.slice(0, 2).map((l, i) => (
              <span
                key={l.id}
                className={`absolute -bottom-1 ${
                  i === 0 ? "-right-1" : "-left-1"
                } w-4 h-4 rounded-full text-[9px] text-white font-bold flex items-center justify-center border-2 border-white`}
                style={{ backgroundColor: l.color }}
              >
                {toFa(l.number)}
              </span>
            ))}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-title-md text-on-surface font-bold truncate">{st.name}</h2>
              {interchange ? (
                <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-label-sm font-bold shrink-0 whitespace-nowrap">
                  خط {lines.map((l) => toFa(l.number)).join(" و ")}
                </span>
              ) : (
                <span
                  className="px-2 py-0.5 rounded-full text-label-sm font-bold shrink-0 whitespace-nowrap"
                  style={{ backgroundColor: `${first.color}1A`, color: first.color }}
                >
                  {isTerminal ? `پایانه ${first.name}` : first.name}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-label-md font-bold text-primary">
            {toFa(total)} ایستگاه
          </span>
          <span className="text-label-sm text-outline">{toFa(headway)} دقیقه</span>
        </div>
      </div>

      {/* امکانات (۳ مورد اول) */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {st.amenities.slice(0, 3).map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-low text-on-surface-variant text-label-sm"
          >
            <MI name={AMENITIES[k].icon} size={15} className="text-primary" />
            {AMENITIES[k].label}
          </span>
        ))}
      </div>

      {/* ورود قطار بعدی هر خط + برچسب ازدحام */}
      <div className="mt-3 p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {liveArr && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" aria-hidden />
          )}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {arrivals === null ? (
              <span className="px-2 py-0.5 rounded-md bg-surface-container text-outline text-label-sm font-bold whitespace-nowrap">
                در حال دریافت...
              </span>
            ) : liveArr ? (
              arrivals.map((a) =>
                a.arr && !a.arr.outOfService && a.arr.minutes.length > 0 ? (
                  <span
                    key={a.line.id}
                    className="px-2 py-0.5 rounded-md text-label-sm font-bold whitespace-nowrap"
                    style={{ backgroundColor: `${a.line.color}1A`, color: a.line.color }}
                  >
                    {a.line.name}: {toFa(a.arr.minutes[0])} دقیقه
                  </span>
                ) : null
              )
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-surface-container text-outline text-label-sm font-bold whitespace-nowrap">
                خارج از ساعات سرویس
              </span>
            )}
          </div>
        </div>
        {crowd && liveArr && (
          <span
            className="px-2 py-0.5 rounded-full text-label-sm font-bold shrink-0 whitespace-nowrap"
            style={{ color: CROWD_COLOR[crowd.crowd], backgroundColor: `${CROWD_COLOR[crowd.crowd]}14` }}
          >
            {crowd.crowdLabel}
          </span>
        )}
      </div>

      {/* اقدامات: مسیریابی + جزئیات + نشان */}
      <div className="mt-3 pt-3 border-t border-outline-variant/30 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push(`/plan?to=${st.id}`)}
          className="flex-1 h-10 rounded-lg bg-primary text-white text-label-lg font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
        >
          <MI name="directions" size={18} />
          مسیریابی
        </button>
        <button
          type="button"
          onClick={() => router.push(`/stations/${st.id}`)}
          className="px-4 h-10 rounded-lg bg-surface-container text-primary text-label-lg font-semibold flex items-center justify-center gap-1 hover:bg-surface-container-high active:scale-[0.98] transition-all"
        >
          جزئیات
          <MI name="chevron_left" size={16} />
        </button>
        <button
          type="button"
          aria-label={fav ? "حذف از نشان‌شده‌ها" : "افزودن به نشان‌شده‌ها"}
          aria-pressed={fav}
          onClick={() => onToggleFav(st)}
          className={`w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center active:scale-95 transition-all ${
            fav ? "text-amber-400" : "text-outline-variant hover:text-primary"
          }`}
        >
          <MI name="star" size={20} fill={fav} />
        </button>
      </div>
    </article>
  );
}

/* ------------------------------ صفحه ------------------------------ */
export default function StationsPage() {
  const router = useRouter();
  useInitCity();
  const city = useShell((s) => s.city);
  const { toast } = useToast();

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [activeFacility, setActiveFacility] = useState<AmenityKey | null>(null);
  const [showFacility, setShowFacility] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [favRows, setFavRows] = useState<FavRow[]>([]);
  const [favIds, setFavIds] = useState<string[]>([]);
  const [now, setNow] = useState<number | null>(null);

  /* ورودی جستجو با تاخیر ۳۰۰ میلی‌ثانیه اعمال می‌شود */
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  /* اعمال فیلتر خط از آدرس (?line=l1) — ورودی از صفحه جزئیات خط */
  useEffect(() => {
    const t = setTimeout(() => {
      const l = new URLSearchParams(window.location.search).get("line");
      if (l && LINES.some((x) => x.id === l)) setActiveLine(l);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  /* ---------- جستجوی صوتی ---------- */
  const voice = useVoiceSearch((text) => setQ(text));
  const onMicClick = () => {
    if (voice.listening) {
      voice.stop();
      return;
    }
    if (voice.busy) return;
    voice.start();
  };
  useEffect(() => {
    if (voice.error && voice.errorKind !== "blocked") {
      toast({ title: "جستجوی صوتی", description: voice.error });
    }
  }, [voice.error, voice.errorKind, toast]);

  /* ---------- نشان‌ها ---------- */
  const loadFavs = () => {
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((d: { favorites?: FavRow[]; ids?: string[] }) => {
        setFavRows(d.favorites ?? []);
        setFavIds(d.ids ?? (d.favorites ?? []).map((f) => f.id));
      })
      .catch(() => {});
  };
  useEffect(loadFavs, []);

  const toggleFav = (st: StationDef) => {
    const isFav = favIds.includes(st.id);
    setFavIds((prev) => (isFav ? prev.filter((i) => i !== st.id) : [...prev, st.id]));
    setFavRows((prev) =>
      isFav
        ? prev.filter((f) => f.id !== st.id)
        : [
            {
              id: st.id,
              name: st.name,
              lines: st.lines.map((l) => ({ id: l.lineId, color: getLine(l.lineId).color })),
            },
            ...prev,
          ]
    );
    const req = isFav
      ? fetch(`/api/favorites?stationId=${st.id}`, { method: "DELETE" })
      : fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stationId: st.id }),
        });
    req.catch(() => loadFavs());
  };

  /* ---------- تیک زمان برای مقادیر زنده (جلوگیری از ناهماهنگی هیدریشن) ---------- */
  useEffect(() => {
    const update = () => setNow(Date.now());
    const t0 = setTimeout(update, 0);
    const t = setInterval(update, 30000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);

  /* ---------- داده‌های مشتق ---------- */
  const cityLines = useMemo(() => LINES.filter((l) => l.cityId === city), [city]);

  const results = useMemo(
    () =>
      searchStations({
        q: qDebounced.trim() || undefined,
        lineId: activeLine ?? undefined,
        facility: activeFacility ?? undefined,
        cityId: city,
      }),
    [qDebounced, activeLine, activeFacility, city]
  );

  const hasFilter = activeLine !== null || activeFacility !== null || qDebounced.trim() !== "";
  const clearAll = () => {
    setQ("");
    setQDebounced("");
    setActiveLine(null);
    setActiveFacility(null);
  };

  return (
    <>
      <PageHeader
        title="جستجوی ایستگاه‌ها"
        subtitle={`شبکه متروی ${CITY_NAME[city] ?? "تهران"} و حومه`}
        actions={
          <button
            type="button"
            aria-label="فیلترها و تنظیم مجدد"
            onClick={() => setShowFacility((v) => !v)}
            className="relative w-10 h-10 flex items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all"
          >
            <MI name="tune" size={22} />
            {hasFilter && (
              <span className="absolute top-2 left-2 w-2 h-2 bg-secondary rounded-full ring-2 ring-surface" />
            )}
          </button>
        }
      />

      <main className="flex-1 w-full pb-28">
        {/* ================= نوار جستجو ================= */}
        <section className="px-4 pt-3" aria-label="جستجوی ایستگاه">
          <div className="relative flex items-center">
            <div className="absolute right-3.5 flex items-center pointer-events-none text-primary">
              <MI name="search" size={22} />
            </div>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی نام ایستگاه یا خط (مثلاً تجریش، تئاتر شهر...)"
              aria-label="جستجوی ایستگاه"
              className="w-full bg-surface-container-lowest border border-outline-variant/60 rounded-xl pr-11 pl-12 py-3 text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm"
            />
            <div className="absolute left-2 flex items-center gap-1">
              {q.trim() !== "" && (
                <button
                  type="button"
                  aria-label="پاک کردن متن"
                  onClick={() => {
                    setQ("");
                    setQDebounced("");
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-outline-variant hover:text-on-surface-variant active:scale-90 transition-all"
                >
                  <MI name="close" size={18} />
                </button>
              )}
              <button
                type="button"
                aria-label="جستجوی صوتی"
                onClick={onMicClick}
                className={`w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all ${
                  voice.listening ? "bg-error/10 text-error" : "bg-primary/10 text-primary hover:bg-primary/20"
                }`}
              >
                {voice.busy ? (
                  <span className="w-3.5 h-3.5 border-2 border-outline-variant/40 border-t-primary rounded-full animate-spin" />
                ) : (
                  <MI name="mic" size={20} fill className={voice.listening ? "animate-pulse" : ""} />
                )}
              </button>
            </div>
          </div>

          {(voice.listening || voice.busy) && (
            <p className="text-[10px] font-medium text-primary flex items-center gap-1.5 px-1 mt-2">
              <MI name="graphic_eq" size={13} />
              {voice.listening ? "در حال شنیدن... نام ایستگاه را بگویید" : "در حال پردازش گفتار شما..."}
            </p>
          )}

          {/* میکروفن در این پنجره مسدود است → جعبه راهنما با دکمه تب جدید */}
          {voice.errorKind === "blocked" && (
            <div className="flex items-center justify-between gap-2 bg-error/10 rounded-lg px-3 py-2 border border-error/20 mt-2">
              <span className="text-[10px] font-medium text-error leading-snug">
                میکروفن در این پنجره (پیش‌نمایش) مسدود است — برای گفتار صوتی، متروجو را در تب جدید باز کنید.
              </span>
              <button
                type="button"
                onClick={openStandaloneTab}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-primary-container text-white text-[10px] font-bold active:scale-95 transition-all"
              >
                <MI name="open_in_new" size={12} />
                تب جدید
              </button>
            </div>
          )}
        </section>

        {/* ================= چیپ‌های ایستگاه‌های نشان‌شده ================= */}
        {favRows.length > 0 && (
          <section className="mt-3 px-4" aria-label="ایستگاه‌های نشان‌شده">
            <div className="flex items-center gap-1.5 mb-1.5">
              <MI name="star" size={15} fill className="text-amber-400" />
              <span className="text-label-md text-on-surface-variant font-medium">
                ایستگاه‌های نشان‌شده
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {favRows.map((f) => (
                <div
                  key={f.id}
                  className="shrink-0 inline-flex items-center gap-1 pl-1.5 pr-2.5 h-9 rounded-full bg-surface-container-lowest border border-outline-variant/50 shadow-xs"
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/stations/${f.id}`)}
                    className="flex items-center gap-1.5 text-label-md font-semibold text-on-surface"
                  >
                    <MI name="star" size={14} fill className="text-amber-400" />
                    {f.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`حذف نشان ${f.name}`}
                    onClick={() => {
                      setFavRows((prev) => prev.filter((x) => x.id !== f.id));
                      setFavIds((prev) => prev.filter((x) => x !== f.id));
                      fetch(`/api/favorites?stationId=${f.id}`, { method: "DELETE" }).catch(() => loadFavs());
                    }}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-outline-variant hover:text-error active:scale-90 transition-all"
                  >
                    <MI name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ================= فیلتر خط ================= */}
        <section className="mt-3 px-4" aria-label="انتخاب بر اساس خط مترو">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label-md text-on-surface-variant font-medium">
              فیلتر بر اساس شماره خط:
            </span>
            <button
              type="button"
              onClick={() => setActiveLine(null)}
              className="text-label-sm text-primary font-bold hover:underline"
            >
              نمایش همه {toFa(cityLines.length)} خط
            </button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1" role="group" aria-label="فیلتر خط">
            <button
              type="button"
              onClick={() => setActiveLine(null)}
              aria-pressed={activeLine === null}
              className={`shrink-0 px-3.5 h-9 rounded-xl text-label-md font-bold flex items-center gap-1.5 active:scale-95 transition-all ${
                activeLine === null
                  ? "bg-primary text-white shadow-sm"
                  : "bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant shadow-xs"
              }`}
            >
              همه
            </button>
            {cityLines.map((line) => {
              const active = activeLine === line.id;
              return (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => setActiveLine(active ? null : line.id)}
                  aria-pressed={active}
                  className={`shrink-0 px-3 h-9 rounded-xl text-label-md font-semibold flex items-center gap-1.5 active:scale-95 transition-all ${
                    active ? "shadow-sm ring-2" : "bg-surface-container-lowest border shadow-xs"
                  }`}
                  style={
                    active
                      ? { backgroundColor: line.color, color: line.textOnColor, boxShadow: `0 0 0 3px ${line.color}4D` }
                      : { borderColor: `${line.color}66`, color: line.color }
                  }
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: active ? line.textOnColor : line.color }}
                  />
                  {line.name}
                </button>
              );
            })}
          </div>
        </section>

        {/* ================= فیلتر امکانات (قابل جمع‌شدن با دکمه هدر) ================= */}
        {showFacility && (
          <section className="mt-3 px-4" aria-label="فیلتر امکانات مسافری">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1" role="group" aria-label="فیلتر امکانات">
              <button
                type="button"
                onClick={() => setActiveFacility(null)}
                aria-pressed={activeFacility === null}
                className={`shrink-0 px-3.5 h-9 rounded-full text-label-md flex items-center gap-1.5 active:scale-95 transition-all ${
                  activeFacility === null
                    ? "bg-primary-container text-on-primary font-semibold shadow-sm"
                    : "bg-surface-container-lowest border border-outline-variant text-on-surface-variant font-medium"
                }`}
              >
                <MI name="verified" size={18} />
                همه امکانات
              </button>
              {FACILITY_CHIPS.map((k) => {
                const active = activeFacility === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setActiveFacility(active ? null : k)}
                    aria-pressed={active}
                    className={`shrink-0 px-3 h-9 rounded-full text-label-md flex items-center gap-1.5 active:scale-95 transition-all ${
                      active
                        ? "bg-primary-container text-on-primary font-semibold shadow-sm"
                        : "bg-surface-container-lowest border border-outline-variant text-on-surface-variant font-medium hover:border-primary hover:text-primary"
                    }`}
                  >
                    <MI name={AMENITIES[k].icon} size={18} />
                    {AMENITIES[k].label}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ================= شمارنده و مرتب‌سازی نتایج ================= */}
        <div className="px-4 mt-4 flex items-center justify-between text-on-surface-variant">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary-container" aria-hidden />
            <span className="text-title-md text-on-surface font-bold">{toFa(results.length)} ایستگاه</span>
            <span className="px-2 py-0.5 rounded-full bg-surface-container text-outline text-[12px] font-medium">
              نزدیک‌ترین
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="راهنمای جستجو و فیلترها"
              onClick={() => setShowHelp(true)}
              className="w-7 h-7 rounded-full bg-surface-container-high text-primary flex items-center justify-center hover:bg-primary/20 transition-all"
            >
              <MI name="help" size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowFacility((v) => !v)}
              className="flex items-center gap-0.5 text-primary text-label-md hover:underline"
            >
              فیلترها
              <MI name="tune" size={16} />
            </button>
          </div>
        </div>

        {/* ================= کارت‌های ایستگاه ================= */}
        {results.length === 0 ? (
          <div className="px-4 mt-3">
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 p-6 flex flex-col items-center gap-2.5 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center">
                <MI name="search_off" size={26} className="text-outline" />
              </div>
              <p className="text-title-md text-on-surface font-bold">ایستگاهی یافت نشد</p>
              <p className="text-body-sm text-on-surface-variant">عبارت جستجو یا فیلترها را تغییر دهید</p>
              <button
                type="button"
                onClick={clearAll}
                className="mt-1 px-4 h-10 rounded-lg bg-primary text-white text-label-lg font-bold shadow-sm active:scale-95 transition-all"
              >
                پاک کردن فیلترها
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 mt-3 flex flex-col gap-3.5">
            {results.map((st) => (
              <StationCard
                key={st.id}
                st={st}
                fav={favIds.includes(st.id)}
                now={now}
                onToggleFav={toggleFav}
              />
            ))}
          </div>
        )}

        {/* ================= مودال راهنما ================= */}
        {showHelp && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowHelp(false);
            }}
          >
            <div className="bg-surface-container-lowest rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-outline-variant/40 space-y-4">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
                <div className="flex items-center gap-2">
                  <MI name="help" size={24} className="text-primary" />
                  <h3 className="text-title-lg text-on-surface font-bold">راهنمای جستجو و فیلترها</h3>
                </div>
                <button
                  type="button"
                  aria-label="بستن راهنما"
                  onClick={() => setShowHelp(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:bg-surface-container transition-all"
                >
                  <MI name="close" size={20} />
                </button>
              </div>
              <div className="space-y-3 text-body-sm text-on-surface-variant">
                <div className="flex items-start gap-2.5">
                  <MI name="filter_list" size={18} className="text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-on-surface">فیلتر خطوط و امکانات:</p>
                    <p>
                      با انتخاب هر خط یا امکانات مسافری (مانند آسانسور یا سرویس بهداشتی)، نتایج بلافاصله
                      فیلتر می‌شوند.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <MI name="alt_route" size={18} className="text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-on-surface">ایستگاه‌های تبادلی:</p>
                    <p>
                      ایستگاه‌هایی که دارای دو نشانگر خط هستند امکان تغییر مسیر و جابه‌جایی مستقیم را
                      دارند.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <MI name="schedule" size={18} className="text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-on-surface">زمان حرکت قطار:</p>
                    <p>
                      زمان تقریبی ورود قطار بعدی بر پایه پایش آنلاین و حرکت‌های لحظه‌ای نمایش داده
                      می‌شود.
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-label-lg font-bold shadow-sm active:scale-[0.98] transition-all"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
