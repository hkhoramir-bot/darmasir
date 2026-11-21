"use client";

import { useEffect, useState, useCallback } from "react";
import { useMetro, nav } from "@/lib/store";
import { AdBanner, MI, LineBadgeBig, CrowdPill, SearchInput } from "../ui";
import { CITIES, CityId, toFa, CROWD_LABEL, type CrowdLevel } from "@/lib/metro-data";

interface LineCard {
  id: string;
  number: number;
  name: string;
  color: string;
  textOnColor: string;
  terminals: [string, string];
  direction: string;
  headway: number;
  stationCount: number;
  interchangeCount: number;
  badges: string[];
  status: string;
  crowd: CrowdLevel;
  crowdLabel: string;
}

const CITY_NAMES: Record<CityId, string> = {
  tehran: "تهران",
  karaj: "کرج",
  mashhad: "مشهد",
  isfahan: "اصفهان",
};

export default function LinesScreen() {
  const city = useMetro((s) => s.city);
  const setCity = useMetro((s) => s.setCity);
  const [cityOpen, setCityOpen] = useState(false);
  const [lines, setLines] = useState<LineCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async (c: CityId) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/network?city=${c}`);
      const data = await res.json();
      setLines(data.lines ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(city);
  }, [city, load]);

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-4">
      <AdBanner />

      {/* تب شهرها */}
      <section aria-label="انتخاب شهر">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          {CITIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCity(c.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all active:scale-95 ${
                city === c.id
                  ? "bg-metro-primary-c text-white shadow-sm"
                  : "bg-metro-card text-metro-onvar border border-metro-outline-var/50 hover:bg-metro-c"
              }`}
            >
              {city === c.id && <span className="w-2 h-2 rounded-full bg-metro-tertiary-fixed" />}
              {c.name}
            </button>
          ))}
        </div>
      </section>

      {/* ابزارهای شبکه */}
      <section className="grid grid-cols-3 gap-2" aria-label="ابزارهای شبکه">
        <button
          onClick={() => nav.go("map")}
          className="bg-metro-card border border-metro-outline-var/50 hover:border-metro-primary-c p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] active:scale-95 transition-all text-center"
        >
          <div className="w-9 h-9 rounded-xl bg-metro-fixed flex items-center justify-center text-metro-primary">
            <MI name="picture_as_pdf" size={20} fill />
          </div>
          <span className="text-[10px] text-metro-onsurface font-medium leading-tight">نقشه شبکه مترو</span>
        </button>
        <button
          onClick={() => nav.go("search", {})}
          className="bg-metro-card border border-metro-outline-var/50 hover:border-metro-primary-c p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] active:scale-95 transition-all text-center"
        >
          <div className="w-9 h-9 rounded-xl bg-metro-c-highest flex items-center justify-center text-metro-primary-c">
            <MI name="alt_route" size={20} fill />
          </div>
          <span className="text-[10px] text-metro-onsurface font-medium leading-tight">راهنمای تقاطع‌ها</span>
        </button>
        <button
          onClick={() => nav.go("status")}
          className="bg-metro-card border border-metro-outline-var/50 hover:border-metro-primary-c p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] active:scale-95 transition-all text-center"
        >
          <div className="w-9 h-9 rounded-xl bg-metro-c flex items-center justify-center text-metro-tertiary">
            <MI name="schedule" size={20} fill />
          </div>
          <span className="text-[10px] text-metro-onsurface font-medium leading-tight">سرفاصله و وضعیت</span>
        </button>
      </section>

      {/* جستجو */}
      <SearchInput value={q} onChange={setQ} placeholder="جستجوی ایستگاه، تقاطع یا خط..." />

      {/* تیتر خطوط */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 bg-metro-primary-c rounded-full" />
          <h2 className="text-sm font-bold text-metro-onsurface">خطوط فعال شبکه {CITY_NAMES[city]}</h2>
        </div>
        <span className="text-xs text-metro-onvar">
          {loading ? "..." : `${toFa(lines.length)} خط درون‌شهری`}
        </span>
      </div>

      {/* لیست خطوط */}
      <section className="flex flex-col gap-3" aria-label="لیست خطوط">
        {loading &&
          [0, 1, 2].map((i) => <div key={i} className="h-28 shimmer rounded-2xl" />)}
        {!loading &&
          lines
            .filter((l) => !q.trim() || l.name.includes(q.trim()) || l.terminals.some((t) => t.includes(q.trim())))
            .map((l) => (
              <article
                key={l.id}
                onClick={() => nav.go("line-detail", { lineId: l.id })}
                className="bg-metro-card border border-metro-outline-var/40 rounded-2xl p-3.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.99]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <LineBadgeBig number={l.number} color={l.color} textOn={l.textOnColor} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-metro-onsurface truncate">
                          {l.terminals[0]} ↔ {l.terminals[1]}
                        </h3>
                        {l.badges.map((b) => (
                          <span key={b} className="bg-amber-500/20 text-amber-500 text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0">
                            {b}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-metro-onvar mt-0.5">
                        {toFa(l.stationCount)} ایستگاه • {l.direction}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-metro-c text-xs font-medium text-metro-tertiary">
                      <span className="w-1.5 h-1.5 rounded-full bg-metro-tertiary" />
                      {toFa(l.headway)} دقیقه
                    </div>
                    <CrowdPill level={l.crowd} label={CROWD_LABEL[l.crowd]} />
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-metro-outline-var/30 flex items-center justify-between text-xs">
                  <span className="text-metro-onvar text-[11px]">
                    تقاطع‌ها: {toFa(l.interchangeCount)} ایستگاه
                  </span>
                  <span className="flex items-center gap-0.5 text-metro-primary-c font-bold text-[11px]">
                    مشاهده ایستگاه‌ها
                    <MI name="chevron_left" size={14} />
                  </span>
                </div>
              </article>
            ))}
      </section>

      {/* CTA مسیریابی سریع */}
      <section className="bg-gradient-to-l from-metro-primary-c to-metro-primary text-white rounded-2xl p-4 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0">
            <MI name="route" size={24} className="text-metro-tertiary-fixed" fill />
          </div>
          <div className="text-right">
            <h4 className="text-sm font-bold">سریع‌ترین مسیر بین دو خط</h4>
            <p className="text-[11px] text-metro-onprimary-c mt-0.5">محاسبه کم‌ترین تعویض خط و خلوت‌ترین ساعات</p>
          </div>
        </div>
        <button
          onClick={() => nav.go("planner")}
          className="bg-metro-card text-metro-primary px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 active:scale-95 transition-all shadow-sm"
        >
          مسیریابی
        </button>
      </section>
    </main>
  );
}

/** شهر — شیت انتخاب شهر */
export function CityDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const city = useMetro((s) => s.city);
  const setCity = useMetro((s) => s.setCity);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 fade-in" onClick={onClose} />
      <div className="sheet-in relative w-full max-w-md bg-metro-card rounded-t-3xl p-4 shadow-2xl">
        <div className="w-10 h-1.5 rounded-full bg-metro-c-highest mx-auto mb-3" />
        <h3 className="text-sm font-bold text-metro-onsurface mb-3 flex items-center gap-1.5">
          <MI name="location_on" size={18} className="text-metro-primary-c" />
          انتخاب شهر
        </h3>
        <div className="grid grid-cols-2 gap-2 pb-2">
          {CITIES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCity(c.id);
                onClose();
              }}
              className={`p-3 rounded-2xl border-2 text-right transition-all active:scale-95 ${
                city === c.id ? "border-metro-primary-c bg-metro-fixed/40" : "border-metro-outline-var/40 bg-metro-card"
              }`}
            >
              <p className="text-sm font-bold text-metro-onsurface flex items-center gap-1">
                {c.name}
                {city === c.id && <MI name="check_circle" size={16} className="text-metro-tertiary" fill />}
              </p>
              <p className="text-[10px] text-metro-onvar mt-0.5">{c.subtitle}</p>
              <p className="text-[10px] text-metro-primary font-bold mt-1">{toFa(c.lineIds.length)} خط فعال</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
