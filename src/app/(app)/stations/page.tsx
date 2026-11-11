"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AMENITIES,
  CROWD_COLOR,
  CROWD_LABEL,
  LINES,
  STATIONS,
  crowdingNow,
  getLine,
  nextArrivals,
  searchStations,
  toFa,
  type AmenityKey,
  type StationDef,
} from "@/lib/metro-data";
import { AppBar, MI, useInitCity, useShell } from "@/components/metro/shell";
import { useVoiceSearch } from "@/components/metro/voice";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   ایستگاه‌ها — جستجو، فیلتر و فهرست ایستگاه‌های شبکه
   ============================================================ */

interface FavoriteLine {
  id: string;
  number: number;
  name: string;
  color: string;
  textOnColor: string;
}
interface FavoriteRow {
  id: string;
  name: string;
  isInterchange: boolean;
  lines: FavoriteLine[];
  amenities: AmenityKey[];
  favoritedAt: string;
}

/* امکانات اصلی برای چیپ‌های فیلتر */
const FACILITY_CHIPS: AmenityKey[] = ["escalator", "elevator", "wc", "parking", "bus"];

/* هش ساده و قطعی برای برچسب فاصله (شبیه‌سازی) */
function idHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function distanceTag(id: string): string {
  return toFa((idHash(id) % 9 + 2) * 100);
}

/* قرص ازدحام سکو */
function CrowdPill({ lineId }: { lineId: string }) {
  const crowd = crowdingNow(lineId);
  const c = CROWD_COLOR[crowd];
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap"
      style={{ color: c, backgroundColor: `${c}14` }}
    >
      <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: c }} />
      {CROWD_LABEL[crowd]}
    </span>
  );
}

/* نقطه‌های رنگی خطوط ایستگاه */
function LineDots({ station }: { station: StationDef }) {
  return (
    <span className="flex items-center gap-1 shrink-0" aria-hidden>
      {station.lines.map((ls) => (
        <span
          key={ls.lineId}
          className="w-2.5 h-2.5 rounded-full border border-white shadow-sm"
          style={{ backgroundColor: getLine(ls.lineId).color }}
        />
      ))}
    </span>
  );
}

export default function StationsPage() {
  const router = useRouter();
  useInitCity();
  const city = useShell((s) => s.city);
  const { toast } = useToast();

  const [q, setQ] = useState("");
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const [activeFacility, setActiveFacility] = useState<AmenityKey | null>(null);
  const [favRows, setFavRows] = useState<FavoriteRow[]>([]);
  const [now, setNow] = useState<number | null>(null);

  /* اعمال فیلتر خط از آدرس (?line=l1) — ورودی از صفحه جزئیات خط */
  useEffect(() => {
    const t = setTimeout(() => {
      const l = new URLSearchParams(window.location.search).get("line");
      if (l) setActiveLine(l);
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
    if (voice.error) toast({ title: "جستجوی صوتی", description: voice.error });
  }, [voice.error, toast]);

  /* ---------- نشان‌ها ---------- */
  useEffect(() => {
    let alive = true;
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((d: { favorites?: FavoriteRow[] }) => {
        if (alive) setFavRows(d.favorites ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- تیک زمان برای مقادیر زنده (جلوگیری از ناهماهنگی هیدریشن) ---------- */
  useEffect(() => {
    const update = () => setNow(Date.now());
    // بروزرسانی اولیه بعد از هیدریشن و سپس هر ۳۰ ثانیه
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
        q: q.trim() || undefined,
        lineId: activeLine ?? undefined,
        facility: activeFacility ?? undefined,
        cityId: city,
      }),
    [q, activeLine, activeFacility, city]
  );

  const featured = useMemo(() => {
    const inCity = STATIONS.filter((s) => s.featured && s.cityId === city);
    const rest = STATIONS.filter((s) => s.featured && s.cityId !== city);
    return [...inCity, ...rest].slice(0, 3);
  }, [city]);

  const allClear = activeLine === null && activeFacility === null;

  const chipBase =
    "px-2.5 py-1 rounded-full border text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 transition-all";

  return (
    <>
      <AppBar />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        {/* ================= کارت جستجو ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-3 border border-outline-variant/40 shadow-sm space-y-2">
          <div className="relative">
            <MI
              name="search"
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none"
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی نام ایستگاه..."
              aria-label="جستجوی ایستگاه"
              className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-2xl py-2.5 pr-10 pl-10 text-xs font-medium text-on-surface focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              aria-label="جستجوی صوتی"
              onClick={onMicClick}
              className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-all ${
                voice.listening ? "bg-error/10 text-error" : "text-outline hover:text-primary"
              }`}
            >
              {voice.busy ? (
                <span className="w-3.5 h-3.5 border-2 border-outline-variant/40 border-t-primary rounded-full animate-spin" />
              ) : (
                <MI name="mic" size={17} className={voice.listening ? "animate-pulse" : ""} />
              )}
            </button>
          </div>

          {(voice.listening || voice.busy) && (
            <p className="text-[10px] font-medium text-primary flex items-center gap-1.5 px-1">
              <MI name="graphic_eq" size={13} />
              {voice.listening ? "در حال شنیدن... نام ایستگاه را بگویید" : "در حال پردازش گفتار شما..."}
            </p>
          )}
        </section>

        {/* ================= چیپ‌های فیلتر ================= */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4"
          role="group"
          aria-label="فیلتر ایستگاه‌ها"
        >
          <button
            type="button"
            onClick={() => {
              setActiveLine(null);
              setActiveFacility(null);
            }}
            aria-pressed={allClear}
            className={`${chipBase} ${allClear ? "bg-primary text-white border-primary" : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"}`}
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
                className={`${chipBase} ${active ? "bg-primary text-white border-primary" : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: line.color }} />
                {line.name}
              </button>
            );
          })}

          {FACILITY_CHIPS.map((k) => {
            const active = activeFacility === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setActiveFacility(active ? null : k)}
                aria-pressed={active}
                className={`${chipBase} ${active ? "bg-primary text-white border-primary" : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"}`}
              >
                <MI name={AMENITIES[k].icon} size={13} />
                {AMENITIES[k].label}
              </button>
            );
          })}
        </div>

        {/* ================= فهرست نتایج ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-1">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <MI name="directions_subway" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">همه ایستگاه‌ها</h3>
            </div>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {toFa(results.length)} ایستگاه
            </span>
          </div>

          {results.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <MI name="search_off" size={28} className="text-outline-variant" />
              <p className="text-xs text-outline">ایستگاهی یافت نشد</p>
              <p className="text-[10px] text-outline-variant">عبارت جستجو یا فیلترها را تغییر دهید</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto no-scrollbar divide-y divide-outline-variant/30">
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => router.push(`/stations/${s.id}`)}
                  className="w-full flex items-center gap-2.5 py-2.5 text-right active:scale-[0.99] transition-all"
                >
                  <LineDots station={s} />
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="text-xs font-bold text-on-surface truncate">{s.name}</span>
                    {s.featured && <MI name="star" size={13} fill className="text-amber-400 shrink-0" />}
                  </span>
                  <span className="flex items-center gap-1 shrink-0 ms-auto">
                    {s.lines.length > 1 && (
                      <span className="text-[9px] font-bold bg-cyan-50 text-cyan-800 px-1.5 py-0.5 rounded-full">
                        تقاطعی
                      </span>
                    )}
                    {s.lines[0] && <CrowdPill lineId={s.lines[0].lineId} />}
                    <span className="text-[9px] font-medium text-outline bg-surface-container-low px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      {distanceTag(s.id)} متر
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ================= ایستگاه‌های نشان‌شده ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-1">
          <div className="flex items-center gap-2 pb-2">
            <MI name="star" size={20} className="text-primary" />
            <h3 className="font-bold text-xs text-on-surface">ایستگاه‌های نشان‌شده</h3>
          </div>

          {favRows.length === 0 ? (
            <p className="text-outline text-xs py-3 text-center">هنوز ایستگاهی نشان نکرده‌اید</p>
          ) : (
            <div className="divide-y divide-outline-variant/30">
              {favRows.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => router.push(`/stations/${f.id}`)}
                  className="w-full flex items-center gap-2.5 py-2.5 text-right active:scale-[0.99] transition-all"
                >
                  <MI name="star" size={16} fill className="text-amber-400 shrink-0" />
                  <span className="text-xs font-bold text-on-surface truncate">{f.name}</span>
                  <span className="flex items-center gap-1 shrink-0 ms-auto" aria-hidden>
                    {f.lines.map((l) => (
                      <span
                        key={l.id}
                        className="w-2.5 h-2.5 rounded-full border border-white shadow-sm"
                        style={{ backgroundColor: l.color }}
                      />
                    ))}
                  </span>
                  <MI name="chevron_left" size={15} className="text-outline-variant shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ================= پرترددترین ایستگاه‌ها (زنده) ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-1">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <MI name="trending_up" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">پرترددترین ایستگاه‌ها</h3>
            </div>
            <span className="text-[10px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              بروزرسانی زنده
            </span>
          </div>

          <div className="divide-y divide-outline-variant/30">
            {featured.map((s) => {
              const firstLine = s.lines[0] ? getLine(s.lines[0].lineId) : undefined;
              const [a1] =
                now !== null && s.lines[0] ? nextArrivals(s.lines[0].lineId, s.id, now) : [];
              const nextMin = a1 !== undefined ? Math.max(1, Math.ceil(a1 / 60)) : null;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => router.push(`/stations/${s.id}`)}
                  className="w-full flex items-center gap-2.5 py-2.5 text-right active:scale-[0.99] transition-all"
                >
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm"
                    style={{
                      backgroundColor: firstLine?.color ?? "#0d58a6",
                      color: firstLine?.textOnColor ?? "#ffffff",
                    }}
                  >
                    {firstLine ? toFa(firstLine.number) : "—"}
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-on-surface truncate">{s.name}</span>
                    <span className="text-[10px] text-outline truncate">{firstLine?.name ?? ""}</span>
                  </span>
                  <span className="ms-auto shrink-0 text-[10px] font-bold text-primary bg-surface-container-low rounded-full px-2 py-1 whitespace-nowrap">
                    {nextMin !== null ? `قطار بعدی: ${toFa(nextMin)} دقیقه` : "در حال دریافت..."}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <p className="text-center text-[10px] text-outline-variant pt-1">
          متروجو نسخه {toFa("4.8.2")} • ایستگاه‌ها و امکانات شبکه ریلی
        </p>
      </main>
    </>
  );
}
