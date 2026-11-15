"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LINES, toFa, getStation, headwayAt, searchStations, type StationDef } from "@/lib/metro-data";
import { remainingMinutesOf, remainingStationsOf, useJourney } from "@/lib/journey";
import { PageHeader, MI } from "@/components/metro/shell";
import MetroMap, { type MetroMapHandle } from "@/components/metro/metro-map";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   نقشه تعاملی جامع حمل‌ونقل — طبق طراحی ZIP (stitch _3) و دستور کاربر:
   - حفظ نقشه 3D + دکمه تعویض نمای 2D/3D + قطب‌نما
   - نوار فیلتر لایه‌ها (مستقل از 2D/3D، چندانتخابی)
   - دکمه «فیلتر نقشه» + Bottom Sheet با کلید هر لایه
   - فیلترها واقعاً به لایه‌های نقشه وصل‌اند (نه فقط ظاهری)
   - جستجوی ایستگاه، موقعیت‌یاب، «مسیریابی از اینجا»
   - لایه‌های بدون داده واقعی = «قابلیت آماده‌نشده» — بدون داده ساختگی
   ============================================================ */

const GESTURE_TIPS: { icon: string; text: string }[] = [
  { icon: "pan_tool", text: "یک انگشت: جابجایی روی نقشه" },
  { icon: "pinch", text: "دو انگشت: بزرگ‌نمایی و کوچک‌نمایی" },
  { icon: "my_location", text: "دکمه موقعیت: نزدیک‌ترین ایستگاه به شما" },
];

/* خطوط خاموش‌شده نقشه (کلید چشم هر خط) — ذخیره دائمی در حافظه دستگاه */
const HIDDEN_LINES_KEY = "mj-map-hidden-lines";

/* ---------- فروشگاه خارجی خطوط خاموش ---------- */
const EMPTY_HIDDEN: string[] = [];
let hiddenSnapshot: string[] | null = null;
const hiddenListeners = new Set<() => void>();

function readHiddenLines(): string[] {
  if (hiddenSnapshot !== null) return hiddenSnapshot;
  try {
    const raw = localStorage.getItem(HIDDEN_LINES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    hiddenSnapshot = Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    hiddenSnapshot = [];
  }
  return hiddenSnapshot;
}

function writeHiddenLines(next: string[]) {
  hiddenSnapshot = next;
  try {
    localStorage.setItem(HIDDEN_LINES_KEY, JSON.stringify(next));
  } catch {
    /* حافظه در دسترس نیست */
  }
  hiddenListeners.forEach((cb) => cb());
}

function subscribeHiddenLines(cb: () => void) {
  hiddenListeners.add(cb);
  return () => {
    hiddenListeners.delete(cb);
  };
}

/* ---------- فروشگاه خارجی لایه‌های حمل‌ونقل ----------
   فقط «مترو» داده واقعی دارد؛ بقیه لایه‌ها به‌صورت دائمی
   «قابلیت آماده‌نشده» هستند و روشن نمی‌شوند تا داده ساختگی
   روی نقشه ظاهر شود. ساختار ذخیره برای لایه‌های آینده باز است. */
const LAYERS_KEY = "mq-map-layers";

interface MapLayers {
  metro: boolean;
  bus: boolean;
  brt: boolean;
  taxi: boolean;
  traffic: boolean;
}

const DEFAULT_LAYERS: MapLayers = { metro: true, bus: false, brt: false, taxi: false, traffic: false };

let layersSnapshot: MapLayers | null = null;
const layersListeners = new Set<() => void>();

function readLayers(): MapLayers {
  if (layersSnapshot !== null) return layersSnapshot;
  try {
    const raw = localStorage.getItem(LAYERS_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    layersSnapshot = { ...DEFAULT_LAYERS, ...(obj && typeof obj === "object" ? obj : {}) };
    /* لایه‌های بدون داده واقعی همیشه خاموش می‌مانند */
    layersSnapshot.bus = false;
    layersSnapshot.brt = false;
    layersSnapshot.taxi = false;
    layersSnapshot.traffic = false;
  } catch {
    layersSnapshot = { ...DEFAULT_LAYERS };
  }
  return layersSnapshot;
}

function writeLayers(next: MapLayers) {
  layersSnapshot = next;
  try {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(next));
  } catch {
    /* حافظه در دسترس نیست */
  }
  layersListeners.forEach((cb) => cb());
}

function subscribeLayers(cb: () => void) {
  layersListeners.add(cb);
  return () => {
    layersListeners.delete(cb);
  };
}

/* لایه‌های حمل‌ونقل بدون داده مکانی واقعی — برچسب صادقانه «قابلیت آماده‌نشده» */
const NOT_READY_LAYERS: { id: keyof MapLayers; label: string; icon: string }[] = [
  { id: "bus", label: "اتوبوس", icon: "directions_bus" },
  { id: "brt", label: "تندرو BRT", icon: "directions_bus" },
  { id: "taxi", label: "تاکسی", icon: "local_taxi" },
  { id: "traffic", label: "ترافیک زنده", icon: "traffic" },
];

export default function MapPage() {
  const router = useRouter();
  const { toast } = useToast();
  const mapRef = useRef<MetroMapHandle>(null);
  const [selected, setSelected] = useState<StationDef | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const journey = useJourney((s) => s.journey);
  const hydrate = useJourney((s) => s.hydrate);
  const endJourney = useJourney((s) => s.end);

  /* ---- خطوط خاموش‌شده (کلید چشم) — ذخیره دائمی در حافظه دستگاه ---- */
  const hiddenLines = useSyncExternalStore(subscribeHiddenLines, readHiddenLines, () => EMPTY_HIDDEN);

  /* ---- لایه‌های حمل‌ونقل (فقط مترو داده واقعی دارد) ---- */
  const layers = useSyncExternalStore(subscribeLayers, readLayers, () => DEFAULT_LAYERS);

  /* ---- جستجوی ایستگاه روی نقشه ---- */
  const stationsAll = useMemo(
    () => searchStations({ cityId: "tehran" }),
    []
  );
  const searchResults = useMemo(() => {
    const q = searchQ.trim();
    if (!q) return [];
    return stationsAll.filter((s) => s.name.includes(q)).slice(0, 8);
  }, [searchQ, stationsAll]);

  const pickStation = useCallback((stationId: string) => {
    const st = getStation(stationId);
    if (!st) return;
    mapRef.current?.flyToStation(stationId);
    setSelected(st);
    setSearchQ("");
    setSearchFocus(false);
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  /* ---------- اتصال واقعی فیلتر لایه‌ها به نقشه ----------
     خاموش‌کردن لایه مترو = حذف همه خطوط و ایستگاه‌های مترو از نقشه.
     کلید چشم هر خط هم زیرمجموعه همین لایه است. */
  const allLineIds = useMemo(() => LINES.map((l) => l.id), []);
  const effectiveHidden = useMemo(
    () => (layers.metro ? hiddenLines : allLineIds),
    [layers.metro, hiddenLines, allLineIds]
  );

  const toggleLine = useCallback(
    (lineId: string) => {
      const prev = readHiddenLines();
      const next = prev.includes(lineId) ? prev.filter((id) => id !== lineId) : [...prev, lineId];
      writeHiddenLines(next);
      const line = LINES.find((l) => l.id === lineId);
      if (line) {
        toast({
          title: prev.includes(lineId) ? `${line.name} نمایش داده شد` : `${line.name} پنهان شد`,
        });
      }
    },
    [toast]
  );

  const setMetroLayer = useCallback(
    (on: boolean) => {
      writeLayers({ ...readLayers(), metro: on });
      toast({ title: on ? "لایه مترو نمایش داده شد" : "لایه مترو از نقشه حذف شد" });
    },
    [toast]
  );

  const showAll = useCallback(() => {
    writeLayers({ ...readLayers(), metro: true });
    if (readHiddenLines().length) writeHiddenLines([]);
    toast({ title: "همه لایه‌های موجود نمایش داده شد" });
  }, [toast]);

  const jNext = useMemo(() => {
    if (!journey || journey.currentIndex < 0) return null;
    const last = journey.path.length - 1;
    if (journey.currentIndex >= last) return null;
    return getStation(journey.path[journey.currentIndex + 1])?.name ?? null;
  }, [journey]);

  const tehranLines = LINES.filter((l) => l.cityId === "tehran");
  const allShown = layers.metro && hiddenLines.length === 0;

  const selHeadway = useMemo(() => {
    if (!selected) return null;
    const d = new Date();
    const line = LINES.find((l) => l.id === selected.lines[0].lineId);
    if (!line) return null;
    return headwayAt(line, d.getHours() * 60 + d.getMinutes());
  }, [selected]);

  const selLineLabel = useMemo(() => {
    if (!selected) return "";
    if (selected.lines.length > 1) {
      return `ایستگاه تقاطع — ${selected.lines
        .map((l) => `خط ${toFa(LINES.find((x) => x.id === l.lineId)?.number ?? 0)}`)
        .join(" و ")}`;
    }
    return `خط ${toFa(LINES.find((x) => x.id === selected.lines[0].lineId)?.number ?? 0)}`;
  }, [selected]);

  return (
    <>
      <PageHeader title="نقشه تعاملی حمل‌ونقل" subtitle="لایه‌ها، جستجو، موقعیت‌یاب و نمای 2D/3D" />

      <main className="flex-1 w-full pb-28 pt-3">
        {/* ================= نوار سفر فعال ================= */}
        {journey && (
          <div className="mx-4 mb-3 bg-surface-container-lowest rounded-2xl border border-primary/25 shadow-sm px-3.5 py-2.5 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
              <MI name="near_me" size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-primary flex items-center gap-1">
                سفر فعال
                {journey.source === "gps" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </p>
              <p className="text-[11px] font-bold text-on-surface truncate">
                {journey.currentStationName
                  ? `ایستگاه فعلی: ${journey.currentStationName}${jNext ? ` • بعدی: ${jNext}` : " • رسیدید"}`
                  : `${journey.fromName} ← ${journey.toName}`}
              </p>
              <p className="text-[9px] text-outline">
                {journey.currentIndex < 0
                  ? "در انتظار موقعیت GPS — یا از صفحه اصلی دستی تنظیم کنید"
                  : `${toFa(remainingStationsOf(journey))} ایستگاه مانده • حدود ${toFa(remainingMinutesOf(journey))} دقیقه`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                endJourney();
                toast({ title: "سفر پایان یافت" });
              }}
              aria-label="پایان سفر"
              className="h-8 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-[10px] font-bold text-error flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
            >
              <MI name="stop_circle" size={14} />
              پایان
            </button>
          </div>
        )}

        {/* ================= نوار فیلتر لایه‌ها — مستقل از نمای 2D/3D ================= */}
        <div className="mx-4 mb-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="toolbar" aria-label="فیلتر لایه‌های نقشه">
          <button
            type="button"
            onClick={showAll}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-sm active:scale-95 transition-all shrink-0 ${
              allShown ? "bg-primary text-on-primary" : "bg-surface-container-lowest border border-outline-variant/40 text-on-surface"
            }`}
          >
            <MI name="layers" size={15} className={allShown ? "text-on-primary" : "text-primary"} />
            همه لایه‌ها
          </button>
          <button
            type="button"
            onClick={() => setMetroLayer(!layers.metro)}
            aria-pressed={layers.metro}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-sm active:scale-95 transition-all shrink-0 ${
              layers.metro
                ? "bg-primary text-on-primary"
                : "bg-surface-container-lowest border border-outline-variant/40 text-on-surface opacity-70"
            }`}
          >
            <MI name="directions_subway" size={15} className={layers.metro ? "text-on-primary" : "text-primary"} />
            مترو
          </button>
          {NOT_READY_LAYERS.map((ly) => (
            <button
              key={ly.id}
              type="button"
              onClick={() =>
                toast({
                  title: `${ly.label}: قابلیت آماده‌نشده`,
                  description: "داده مکانی واقعی این لایه هنوز در دسترس نیست و روی نقشه داده ساختگی نمایش داده نمی‌شود",
                })
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-sm active:scale-95 transition-all shrink-0 bg-surface-container-lowest border border-outline-variant/40 text-outline"
            >
              <MI name={ly.icon} size={15} className="text-outline-variant" />
              {ly.label}
              <span className="text-[8px] font-bold bg-surface-container px-1 py-0.5 rounded-full flex items-center gap-0.5 text-outline-variant">
                <MI name="hourglass_empty" size={9} />
                آماده‌نشده
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label="فیلتر نقشه"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap shadow-sm active:scale-95 transition-all shrink-0 bg-primary-container text-white"
          >
            <MI name="tune" size={15} />
            فیلتر نقشه
          </button>
        </div>

        {/* ================= بوم نقشه + جستجوی شناور ================= */}
        <div className="relative mx-4">
          {/* جستجوی ایستگاه — شناور بالای نقشه */}
          <div className="absolute top-2.5 inset-x-2.5 z-20">
            <div className="bg-surface-container-lowest/95 backdrop-blur rounded-xl shadow-md border border-outline-variant/40 flex items-center px-2.5 h-10 gap-2">
              <MI name="search" size={17} className="text-outline shrink-0" />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onFocus={() => setSearchFocus(true)}
                onBlur={() => setTimeout(() => setSearchFocus(false), 150)}
                placeholder="جستجوی ایستگاه..."
                aria-label="جستجوی ایستگاه روی نقشه"
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-xs font-medium text-on-surface placeholder:text-outline"
              />
              {searchQ && (
                <button
                  type="button"
                  onClick={() => setSearchQ("")}
                  aria-label="پاک‌کردن جستجو"
                  className="text-outline shrink-0 active:scale-90 transition-transform"
                >
                  <MI name="close" size={15} />
                </button>
              )}
            </div>
            {/* نتایج جستجو — فقط ایستگاه‌های واقعی */}
            {searchFocus && searchQ.trim() && (
              <div className="fade-in mt-1.5 bg-surface-container-lowest/98 backdrop-blur rounded-xl shadow-lg border border-outline-variant/40 overflow-hidden max-h-56 overflow-y-auto pretty-scroll">
                {searchResults.length > 0 ? (
                  searchResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickStation(s.id)}
                      className="w-full px-3 py-2.5 flex items-center gap-2.5 text-right hover:bg-surface-container-low active:bg-surface-container transition-colors border-b border-outline-variant/20 last:border-0"
                    >
                      <MI name="location_on" size={16} className="text-primary shrink-0" />
                      <span className="flex-1 min-w-0 text-xs font-bold text-on-surface truncate">{s.name}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {s.lines.slice(0, 3).map((ls) => {
                          const line = LINES.find((x) => x.id === ls.lineId);
                          if (!line) return null;
                          return (
                            <span
                              key={ls.lineId}
                              className="w-4.5 h-4.5 min-w-[18px] h-[18px] rounded text-[9px] font-bold flex items-center justify-center"
                              style={{ backgroundColor: line.color, color: line.textOnColor }}
                            >
                              {toFa(line.number)}
                            </span>
                          );
                        })}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-[11px] text-outline text-center">ایستگاهی با این نام یافت نشد</p>
                )}
              </div>
            )}
          </div>

          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-sm overflow-hidden">
            <MetroMap
              ref={mapRef}
              className="h-[620px] w-full"
              highlightStations={journey?.path}
              hiddenLineIds={effectiveHidden}
              onToggleLine={toggleLine}
              onStationSelect={(stationId) => {
                const st = getStation(stationId);
                if (st) setSelected(st);
              }}
            />
          </div>
        </div>

        <div className="mx-4 mt-3 space-y-3">
          {/* ================= راهنمای خطوط لایه مترو (با کلید چشم) ================= */}
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MI name="layers" size={20} className="text-primary" />
                <h3 className="font-bold text-xs text-on-surface">راهنمای خطوط لایه مترو</h3>
              </div>
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {layers.metro ? `${toFa(tehranLines.length - hiddenLines.length)} از ${toFa(tehranLines.length)} خط` : "لایه خاموش"}
              </span>
            </div>

            {hiddenLines.length > 0 && layers.metro && (
              <button
                type="button"
                onClick={showAll}
                className="w-full h-9 rounded-xl bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
              >
                <MI name="visibility" size={15} />
                نمایش همه خطوط
              </button>
            )}

            <div className="grid grid-cols-1 gap-1">
              {tehranLines.map((line) => {
                const isHidden = hiddenLines.includes(line.id);
                return (
                  <div
                    key={line.id}
                    className={`flex items-center gap-1 rounded-xl transition-opacity ${isHidden || !layers.metro ? "opacity-55" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/lines/${line.id}`)}
                      className="flex items-center gap-2.5 flex-1 min-w-0 px-2 py-1.5 rounded-xl hover:bg-surface-container-low active:scale-[0.98] transition-all text-right"
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm ring-1 ring-black/5"
                        style={{ backgroundColor: line.color }}
                      />
                      <span
                        className={`text-[11px] font-bold text-on-surface shrink-0 ${isHidden ? "line-through text-outline" : ""}`}
                      >
                        {line.name}
                      </span>
                      <span className="text-[10px] text-outline truncate">
                        {line.terminals[0]} ↔ {line.terminals[1]}
                      </span>
                      <MI name="chevron_left" size={14} className="text-outline-variant shrink-0 mr-auto" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLine(line.id)}
                      disabled={!layers.metro}
                      aria-label={isHidden ? `نمایش ${line.name} روی نقشه` : `پنهان کردن ${line.name} روی نقشه`}
                      aria-pressed={!isHidden}
                      title={isHidden ? "نمایش روی نقشه" : "پنهان از نقشه"}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition-all ${
                        isHidden
                          ? "text-outline-variant bg-surface-container/60"
                          : "text-primary hover:bg-surface-container-low"
                      } ${!layers.metro ? "opacity-40" : ""}`}
                    >
                      <MI name={isHidden ? "visibility_off" : "visibility"} size={19} />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-outline-variant">
              با لمس چشم، هر خط را از لایه مترو پنهان یا نمایش دهید؛ انتخاب شما ذخیره می‌شود.
            </p>
          </section>

          {/* ================= وضعیت سایر لایه‌ها — صادقانه ================= */}
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <MI name="info" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">سایر لایه‌های حمل‌ونقل</h3>
            </div>
            <div className="space-y-1.5">
              {NOT_READY_LAYERS.map((ly) => (
                <div key={ly.id} className="flex items-center gap-2 text-xs text-outline">
                  <MI name={ly.icon} size={15} className="text-outline-variant shrink-0" />
                  <span className="flex-1">{ly.label}</span>
                  <span className="text-[9px] font-bold text-outline-variant bg-surface-container px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <MI name="hourglass_empty" size={10} />
                    قابلیت آماده‌نشده
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-outline-variant pt-1 leading-relaxed">
              این لایه‌ها پس از دریافت داده مکانی رسمی فعال می‌شوند؛ تا آن زمان هیچ داده ساختگی روی نقشه نمایش داده نمی‌شود.
            </p>
          </section>

          {/* ================= راهنمای حرکات ================= */}
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <MI name="touch_app" size={20} className="text-primary" />
              <h3 className="font-bold text-xs text-on-surface">راهنمای حرکات</h3>
            </div>
            <div className="space-y-1.5">
              {GESTURE_TIPS.map((tip) => (
                <div key={tip.icon} className="flex items-center gap-2 text-xs text-outline">
                  <MI name={tip.icon} size={15} className="text-on-surface-variant shrink-0" />
                  <span>{tip.text}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-outline-variant pt-1">
              با لمس هر ایستگاه روی نقشه، کارد جزئیات و «مسیریابی از اینجا» باز می‌شود.
            </p>
          </section>
        </div>
      </main>

      {/* ================= Bottom Sheet فیلتر نقشه — کلید واقعی هر لایه ================= */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="فیلتر نقشه"
        >
          <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={() => setFilterOpen(false)} />
          <div className="fade-in relative w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl sm:bottom-4 shadow-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] space-y-3 max-h-[80vh] overflow-y-auto pretty-scroll">
            <div className="w-10 h-1.5 bg-outline-variant/60 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MI name="tune" size={20} className="text-primary" />
                <h3 className="font-bold text-sm text-on-surface">فیلتر نقشه</h3>
              </div>
              <button
                type="button"
                aria-label="بستن"
                onClick={() => setFilterOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container text-outline shrink-0"
              >
                <MI name="close" size={18} />
              </button>
            </div>

            {/* لایه مترو — داده واقعی، کلید واقعی */}
            <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-low/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <MI name="directions_subway" size={19} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface">مترو</p>
                    <p className="text-[10px] text-outline">۷ خط تهران — داده واقعی</p>
                  </div>
                </div>
                {/* کلید روشن/خاموش لایه */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={layers.metro}
                  aria-label="لایه مترو"
                  onClick={() => setMetroLayer(!layers.metro)}
                  className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${layers.metro ? "bg-primary" : "bg-outline-variant/60"}`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${layers.metro ? "right-0.5" : "right-[22px]"}`}
                  />
                </button>
              </div>
              {layers.metro && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-outline-variant/30">
                  {tehranLines.map((line) => {
                    const isHidden = hiddenLines.includes(line.id);
                    return (
                      <button
                        key={line.id}
                        type="button"
                        onClick={() => toggleLine(line.id)}
                        aria-pressed={!isHidden}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all active:scale-95 ${
                          isHidden
                            ? "border-outline-variant/40 text-outline line-through"
                            : "border-transparent text-white shadow-sm"
                        }`}
                        style={isHidden ? undefined : { backgroundColor: line.color, color: line.textOnColor }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-white/90" style={isHidden ? { backgroundColor: line.color } : undefined} />
                        {line.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* لایه‌های بدون داده واقعی */}
            {NOT_READY_LAYERS.map((ly) => (
              <div key={ly.id} className="rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-surface-container text-outline-variant flex items-center justify-center shrink-0">
                    <MI name={ly.icon} size={19} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-on-surface-variant">{ly.label}</p>
                    <p className="text-[10px] text-outline truncate">داده مکانی واقعی هنوز موجود نیست</p>
                  </div>
                </div>
                <span className="text-[9px] font-bold text-outline-variant bg-surface-container px-2 py-1 rounded-full flex items-center gap-1 shrink-0">
                  <MI name="hourglass_empty" size={10} />
                  آماده‌نشده
                </span>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                showAll();
                setFilterOpen(false);
              }}
              className="w-full h-10 rounded-xl bg-primary text-on-primary text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
            >
              <MI name="layers" size={15} />
              نمایش همه لایه‌های موجود
            </button>
          </div>
        </div>
      )}

      {/* ================= کارد پایین‌صفحه ایستگاه انتخاب‌شده ================= */}
      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={`ایستگاه ${selected.name}`}
        >
          <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={() => setSelected(null)} />
          <div className="fade-in relative w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl sm:bottom-4 shadow-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <MI name="directions_subway" size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-on-surface truncate">{selected.name}</h3>
                  <p className="text-[10px] text-outline">
                    {selLineLabel}
                    {selHeadway ? ` • فاصله حرکت حدود ${toFa(selHeadway)} دقیقه` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="بستن"
                onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container text-outline shrink-0"
              >
                <MI name="close" size={18} />
              </button>
            </div>

            {/* نشان خطوط */}
            <div className="flex flex-wrap items-center gap-1.5">
              {selected.lines.map((ls) => {
                const line = LINES.find((x) => x.id === ls.lineId);
                if (!line) return null;
                return (
                  <span
                    key={ls.lineId}
                    className="rounded-lg px-2 py-1 text-[10px] font-bold shadow-sm"
                    style={{ backgroundColor: line.color, color: line.textOnColor }}
                  >
                    خط {toFa(line.number)} — {line.terminals[0]} ↔ {line.terminals[1]}
                  </span>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => router.push(`/plan?from=${selected.id}`)}
                className="flex-1 h-10 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-md shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
              >
                <MI name="directions" size={16} />
                مسیریابی از اینجا
              </button>
              <button
                type="button"
                onClick={() => router.push(`/stations/${selected.id}`)}
                className="h-10 px-4 rounded-xl border border-outline-variant text-xs font-bold text-on-surface active:scale-95 transition-all flex items-center gap-1"
              >
                <MI name="info" size={15} />
                جزئیات ایستگاه
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
