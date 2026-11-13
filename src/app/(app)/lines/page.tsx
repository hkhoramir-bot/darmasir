"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CITIES,
  LINES,
  crowdingNow,
  getLine,
  headwayAt,
  interchangeLinesOf,
  lineInterchanges,
  searchStations,
  stationsOfLine,
  toFa,
  type CityId,
  type LineDef,
} from "@/lib/metro-data";
import { AppBar, MI, useInitCity, useShell } from "@/components/metro/shell";

/* ============================================================
   خطوط و نقشه — بازسازی دقیق ui/_23/code.html
   (بنر آگهی + چیپ شهرها + ابزارها + جستجو + کارت‌های خط + CTA مسیریابی)
   ============================================================ */

/** وضعیت خط → رنگ و برچسب چیپ (فعال سبز / ازدحام کهربایی / تاخیر و مسدود قرمز) */
function statusChip(line: LineDef): { label: string; dot: string; text: string } {
  if (line.status === "closed") return { label: "مسدود", dot: "bg-error", text: "text-error" };
  if (line.status === "delay") return { label: "تاخیر", dot: "bg-error", text: "text-error" };
  if (line.status === "crowded" || crowdingNow(line.id) === "busy")
    return { label: "ازدحام", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { label: "فعال", dot: "bg-tertiary", text: "text-tertiary" };
}

/** خط‌های تقاطعی یک خط (بدون خودش) برای نشان‌های رنگی ردیف «تقاطع‌ها» */
function interchangeLineChips(lineId: string): LineDef[] {
  const ids = new Set<string>();
  for (const sid of lineInterchanges(lineId)) {
    for (const lid of interchangeLinesOf(sid)) {
      if (lid !== lineId) ids.add(lid);
    }
  }
  return Array.from(ids).map((lid) => getLine(lid));
}

/* ------------------------- کارت خط (دقیقاً _23) ------------------------- */
function LineCard({
  line,
  nowMin,
  onOpen,
}: {
  line: LineDef;
  nowMin: number;
  onOpen: () => void;
}) {
  const st = statusChip(line);
  const stationCount = stationsOfLine(line.id).length;
  const headway = headwayAt(line, nowMin);
  const interchanges = interchangeLineChips(line.id);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-right bg-surface-container-lowest border border-outline-variant/40 rounded-2xl p-3.5 shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {/* حباب شماره خط */}
          <div
            className="w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-sm"
            style={{ backgroundColor: line.color, color: line.textOnColor }}
          >
            <span className="text-[9px] leading-none opacity-90">خط</span>
            <span className="text-sm font-bold leading-none mt-0.5">{toFa(line.number)}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-bold text-on-surface truncate">
                {line.terminals[1]} ↔ {line.terminals[0]}
              </h3>
              {line.badges?.map((b) => (
                <span
                  key={b}
                  className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 text-[11px] px-1.5 py-0.5 rounded font-medium"
                >
                  {b}
                </span>
              ))}
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {toFa(stationCount)} ایستگاه • هر {toFa(headway)} دقیقه
            </p>
          </div>
        </div>
        {/* چیپ وضعیت زنده */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container text-xs font-medium shrink-0 ${st.text}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
          <span>{st.label}</span>
        </div>
      </div>
      {/* ردیف تقاطع‌ها */}
      <div className="mt-3 pt-2.5 border-t border-outline-variant/30 flex items-center justify-between text-xs">
        <span className="text-on-surface-variant text-[11px]">تقاطع‌ها:</span>
        {interchanges.length > 0 ? (
          <div className="flex items-center gap-1">
            {interchanges.map((ol) => (
              <span
                key={ol.id}
                className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm"
                style={{ backgroundColor: ol.color, color: ol.textOnColor }}
              >
                {toFa(ol.number)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-outline">بدون تقاطع</span>
        )}
      </div>
    </button>
  );
}

/* ------------------------------- صفحه ------------------------------- */
export default function LinesPage() {
  const router = useRouter();
  useInitCity();

  const shellCity = useShell((s) => s.city);
  const setShellCity = useShell((s) => s.setCity);

  // شهر محلی: برای پشتیبانی از کرج (که در ShellCity نیست) — با پوسته همگام می‌ماند
  const [city, setCityState] = useState<CityId>(shellCity);
  const [lastShellCity, setLastShellCity] = useState(shellCity);
  if (shellCity !== lastShellCity) {
    // همگام‌سازی با تغییر شهر از هدر پوسته (الگوی رسمی React — setState حین رندر)
    setLastShellCity(shellCity);
    setCityState(shellCity);
  }

  const selectCity = (id: CityId) => {
    setCityState(id);
    if (id !== "karaj") setShellCity(id); // همگام‌سازی با پوسته هرجا ممکن باشد
  };

  const cityLines = useMemo(() => LINES.filter((l) => l.cityId === city), [city]);
  const cityName = CITIES.find((c) => c.id === city)?.name ?? "تهران";

  // جستجوی زنده ایستگاه‌ها (حداکثر ۵ نتیجه)
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return searchStations({ q, cityId: city }).slice(0, 5);
  }, [query, city]);

  const listRef = useRef<HTMLElement>(null);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <>
      <AppBar />

      <main className="w-full max-w-md mx-auto px-4 flex-1 flex flex-col gap-4 mt-3 pb-28">
        {/* ------------------- بنر آگهی ------------------- */}
        <section className="w-full bg-surface-container-low rounded-xl border border-outline-variant/40 p-2.5 flex items-center justify-between shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="bg-error text-white text-label-sm font-bold px-2 py-0.5 rounded-md shrink-0">
              آگهی
            </span>
            <p className="text-body-sm text-on-surface-variant line-clamp-1">
              شارژ سریع بلیت اعتباری و متروکارت بدون صف
            </p>
          </div>
          <a
            href="#"
            className="text-label-sm text-primary-container font-bold flex items-center gap-0.5 hover:underline whitespace-nowrap pl-1 shrink-0"
          >
            مشاهده
            <MI name="chevron_left" size={14} />
          </a>
        </section>

        {/* ------------------- چیپ‌های انتخاب شهر ------------------- */}
        <section className="w-full">
          <div className="flex items-center gap-2 overflow-x-auto pretty-scroll py-0.5">
            {CITIES.map((c) =>
              city === c.id ? (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCity(c.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-medium shadow-sm whitespace-nowrap transition-all duration-150"
                >
                  <span className="w-2 h-2 rounded-full bg-tertiary-fixed" />
                  <span>{c.name}</span>
                </button>
              ) : (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCity(c.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-container-lowest text-on-surface-variant border border-outline-variant/50 text-xs font-medium whitespace-nowrap hover:bg-surface-container transition-all duration-150"
                >
                  <span>{c.name}</span>
                </button>
              )
            )}
          </div>
        </section>

        {/* ------------------- ابزارهای سریع شبکه ------------------- */}
        <section className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => router.push("/map")}
            className="bg-surface-container-lowest border border-outline-variant/50 hover:border-primary-container p-2.5 rounded-xl flex flex-col items-center justify-center gap-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] active:scale-95 transition-all text-center"
          >
            <div className="w-9 h-9 rounded-xl bg-primary-fixed flex items-center justify-center text-primary dark:text-on-primary-fixed-variant">
              <MI name="picture_as_pdf" size={20} />
            </div>
            <span className="text-xs text-on-surface font-medium leading-tight">نقشه PDF و راهنما</span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/stations")}
            className="bg-surface-container-lowest border border-outline-variant/50 hover:border-primary-container p-2.5 rounded-xl flex flex-col items-center justify-center gap-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] active:scale-95 transition-all text-center"
          >
            <div className="w-9 h-9 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary-container">
              <MI name="alt_route" size={20} />
            </div>
            <span className="text-xs text-on-surface font-medium leading-tight">راهنمای تقاطع‌ها</span>
          </button>
          <button
            type="button"
            onClick={() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="bg-surface-container-lowest border border-outline-variant/50 hover:border-primary-container p-2.5 rounded-xl flex flex-col items-center justify-center gap-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] active:scale-95 transition-all text-center"
          >
            <div className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center text-tertiary">
              <MI name="schedule" size={20} />
            </div>
            <span className="text-xs text-on-surface font-medium leading-tight">سرفاصله اعزام</span>
          </button>
        </section>

        {/* ------------------- جستجوی ایستگاه ------------------- */}
        <section className="relative">
          <div className="relative flex items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/60 rounded-2xl py-2.5 pr-10 pl-10 text-xs font-normal text-on-surface focus:outline-none focus:border-primary-container shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              placeholder="جستجوی ایستگاه، تقاطع یا خط..."
              type="text"
            />
            <MI
              name="search"
              size={20}
              className="text-outline absolute right-3 pointer-events-none"
            />
            <button
              type="button"
              aria-label="جستجوی صوتی"
              className="absolute left-3 text-outline hover:text-on-surface flex items-center justify-center"
            >
              <MI name="mic" size={18} />
            </button>
          </div>
          {query.trim() !== "" && (
            <div className="absolute top-full inset-x-0 mt-1.5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-lg overflow-hidden z-30">
              {results.length > 0 ? (
                results.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => router.push(`/stations/${s.id}`)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-surface-container-low active:bg-surface-container-low text-right transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <MI name="location_on" size={14} className="text-outline shrink-0" />
                      <span className="text-xs font-bold text-on-surface truncate">{s.name}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {s.lines.map(({ lineId }) => {
                        const ol = getLine(lineId);
                        return (
                          <span
                            key={lineId}
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                            style={{ backgroundColor: ol.color, color: ol.textOnColor }}
                          >
                            {toFa(ol.number)}
                          </span>
                        );
                      })}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2.5 text-xs text-on-surface-variant text-center">
                  نتیجه‌ای برای «{query.trim()}» یافت نشد
                </div>
              )}
            </div>
          )}
        </section>

        {/* ------------------- عنوان بخش خطوط ------------------- */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 bg-primary-container rounded-full" />
            <h2 className="text-sm font-bold text-on-surface">خطوط فعال شبکه {cityName}</h2>
          </div>
          <span className="text-xs text-on-surface-variant font-normal">
            {toFa(cityLines.length)} خط درون‌شهری
          </span>
        </div>

        {/* ------------------- فهرست خطوط ------------------- */}
        <section ref={listRef} className="flex flex-col gap-3">
          {cityLines.map((line) => (
            <LineCard
              key={line.id}
              line={line}
              nowMin={nowMin}
              onOpen={() => router.push(`/lines/${line.id}`)}
            />
          ))}
          {cityLines.length === 0 && (
            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/40 p-6 text-center text-xs text-on-surface-variant">
              خطی برای این شهر ثبت نشده است
            </div>
          )}
        </section>

        {/* ------------------- CTA مسیریابی ------------------- */}
        <section className="bg-primary text-white rounded-2xl p-4 shadow-md flex items-center justify-between mt-1 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0">
              <MI name="route" size={24} className="text-tertiary-fixed" />
            </div>
            <div>
              <h4 className="text-sm font-bold">مسیریابی بین دو خط</h4>
              <p className="text-xs text-on-primary-container mt-0.5">
                مبدأ و مقصد خود را در نقشه خطوط جستجو کنید
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/plan")}
            className="bg-surface-container-lowest text-primary px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 hover:bg-surface active:scale-95 transition-all shadow-sm"
          >
            مسیریابی
          </button>
        </section>
      </main>
    </>
  );
}
