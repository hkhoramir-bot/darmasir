"use client";

import { useEffect, useMemo, useState } from "react";
import { nav, useMetro } from "@/lib/store";
import { MI, SearchInput, LineBadge, useTicker } from "../ui";
import { AMENITIES, LINES, type AmenityKey, toFa, CITIES } from "@/lib/metro-data";
import { useVoiceSearch } from "../voice";

interface StationResult {
  id: string;
  name: string;
  isInterchange: boolean;
  lines: { id: string; number: number; name: string; color: string; textOnColor: string }[];
  amenities: AmenityKey[];
}

const FACILITY_FILTERS: AmenityKey[] = ["elevator", "escalator", "wc", "atm", "baby", "parking", "bus", "taxi"];

export default function SearchScreen() {
  const city = useMetro((s) => s.city);
  const now = useTicker(30000);
  const [q, setQ] = useState("");
  const [lineFilter, setLineFilter] = useState<string | null>(null);
  const [facility, setFacility] = useState<AmenityKey | null>(null);
  const [results, setResults] = useState<StationResult[]>([]);
  const [loading, setLoading] = useState(true);
  // الگوی مجاز React: به‌روزرسانی state هنگام رندر برای کلید درخواست
  const [lastKey, setLastKey] = useState<string | null>(null);

  const voice = useVoiceSearch((text) => {
    setQ(text);
  });

  const cityLines = useMemo(() => LINES.filter((l) => l.cityId === city), [city]);
  const cityName = CITIES.find((c) => c.id === city)?.name ?? "تهران";
  const reqKey = `${q}|${lineFilter}|${facility}|${city}`;
  if (reqKey !== lastKey) {
    setLastKey(reqKey);
    setLoading(true);
  }

  useEffect(() => {
    let alive = true;
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (lineFilter) sp.set("line", lineFilter);
    if (facility) sp.set("facility", facility);
    sp.set("city", city);
    fetch(`/api/search?${sp}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) {
          setResults(d.stations ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reqKey, q, lineFilter, facility, city, now]);

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-3">
      <SearchInput
        value={q}
        onChange={setQ}
        placeholder="جستجوی ایستگاه، تقاطع یا امکانات..."
        onMic={() => {
          if (voice.listening) voice.stop();
          else voice.start();
        }}
      />

      {/* وضعیت میکروفون */}
      {voice.listening && (
        <div className="bg-metro-fixed/50 border border-metro-fixed rounded-2xl p-3 flex items-center justify-between fade-in">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-metro-error flex items-center justify-center animate-pulse">
              <MI name="mic" size={18} className="text-white" fill />
            </span>
            <p className="text-xs text-metro-primary font-bold">در حال شنیدن... (حداکثر ۶ ثانیه)</p>
          </div>
          <button onClick={voice.stop} className="text-[11px] font-bold text-metro-error">
            پایان
          </button>
        </div>
      )}
      {(voice.error || voice.busy) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-800 fade-in">
          {voice.busy ? "در حال پردازش صدای شما..." : voice.error}
        </div>
      )}

      {/* فیلتر خطوط */}
      <section aria-label="فیلتر بر اساس خط">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[10px] font-bold text-metro-outline shrink-0">فیلتر خط:</span>
          <button
            onClick={() => setLineFilter(null)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all active:scale-95 ${
              !lineFilter ? "bg-metro-primary text-white" : "bg-white text-metro-onvar border border-metro-outline-var/50"
            }`}
          >
            {toFa(cityLines.length)} خط همه
          </button>
          {cityLines.map((l) => (
            <button
              key={l.id}
              onClick={() => setLineFilter(lineFilter === l.id ? null : l.id)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all active:scale-95 border ${
                lineFilter === l.id ? "text-white shadow-sm" : "bg-white"
              }`}
              style={
                lineFilter === l.id
                  ? { backgroundColor: l.color, borderColor: l.color }
                  : { color: l.color, borderColor: `${l.color}66` }
              }
            >
              {l.name}
            </button>
          ))}
        </div>
      </section>

      {/* فیلتر امکانات */}
      <section aria-label="فیلتر بر اساس امکانات">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[10px] font-bold text-metro-outline shrink-0">امکانات:</span>
          {FACILITY_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFacility(facility === f ? null : f)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap transition-all active:scale-95 ${
                facility === f
                  ? "bg-metro-primary-c text-white shadow-sm"
                  : "bg-white text-metro-onvar border border-metro-outline-var/50"
              }`}
            >
              <MI name={AMENITIES[f].icon} size={14} />
              {AMENITIES[f].label}
            </button>
          ))}
        </div>
      </section>

      {/* نتیجه‌ها */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-metro-onvar">
          {loading ? "در حال جستجو..." : `${toFa(results.length)} ایستگاه در ${cityName} یافت شد`}
        </span>
        {(q || lineFilter || facility) && (
          <button
            onClick={() => {
              setQ("");
              setLineFilter(null);
              setFacility(null);
            }}
            className="text-[11px] text-metro-error font-bold flex items-center gap-0.5"
          >
            <MI name="close" size={13} />
            حذف فیلترها
          </button>
        )}
      </div>

      <section className="space-y-2" aria-label="نتایج جستجو">
        {loading &&
          [0, 1, 2, 3].map((i) => <div key={i} className="h-16 shimmer rounded-2xl" />)}
        {!loading && results.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-metro-outline-var p-6 text-center">
            <MI name="search_off" size={30} className="text-metro-outline-var mx-auto" />
            <p className="text-xs text-metro-onvar mt-2">ایستگاهی با این مشخصات پیدا نشد</p>
          </div>
        )}
        {!loading &&
          results.map((s) => (
            <button
              key={s.id}
              onClick={() => nav.go("station-detail", { stationId: s.id })}
              className="w-full bg-white rounded-2xl p-3 border border-metro-outline-var/40 shadow-sm flex items-center justify-between gap-3 hover:border-metro-primary transition-all active:scale-[0.99] text-right"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex items-center -space-x-1.5 space-x-reverse shrink-0">
                  {s.lines.map((l) => (
                    <LineBadge key={l.id} number={l.number} color={l.color} textOn={l.textOnColor} size="sm" />
                  ))}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-metro-onsurface truncate">{s.name}</p>
                  <p className="text-[10px] text-metro-onvar mt-0.5 flex items-center gap-1">
                    {s.isInterchange && (
                      <span className="text-metro-primary-c font-bold">تقاطعی •</span>
                    )}
                    {s.amenities.slice(0, 3).map((a) => (
                      <MI key={a} name={AMENITIES[a].icon} size={13} className="text-metro-outline" />
                    ))}
                  </p>
                </div>
              </div>
              <MI name="chevron_left" size={18} className="text-metro-outline-var shrink-0" />
            </button>
          ))}
      </section>
    </main>
  );
}
