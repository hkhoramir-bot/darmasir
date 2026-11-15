"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LINES, toFa, getStation, headwayAt, type StationDef } from "@/lib/metro-data";
import { remainingMinutesOf, remainingStationsOf, useJourney } from "@/lib/journey";
import { PageHeader, MI } from "@/components/metro/shell";
import MetroMap from "@/components/metro/metro-map";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   نقشه تعاملی شبکه — پینچ/جابجایی روان، انتخاب ایستگاه با
   کارد پایین‌صفحه (مثل اپ‌های نقشه) و موقعیت‌یاب GPS
   ============================================================ */

const GESTURE_TIPS: { icon: string; text: string }[] = [
  { icon: "pan_tool", text: "یک انگشت: جابجایی روی نقشه" },
  { icon: "pinch", text: "دو انگشت: بزرگ‌نمایی و کوچک‌نمایی" },
  { icon: "my_location", text: "دکمه موقعیت: نزدیک‌ترین ایستگاه به شما" },
];

/* خطوط خاموش‌شده نقشه — به‌صورت پیش‌فرض در تنظیمات ذخیره می‌شود */
const HIDDEN_LINES_KEY = "mj-map-hidden-lines";

/* ---------- فروشگاه خارجی خطوط خاموش ----------
   خواندن از حافظه دستگاه با useSyncExternalStore تا هم بدون
   اختلاف SSR باشد و هم بلافاصله بعد از mount تنظیم ذخیره‌شده
   اعمال شود؛ نوشتن همیشه با ذخیره دائمی همراه است. */
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

export default function MapPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<StationDef | null>(null);
  const journey = useJourney((s) => s.journey);
  const hydrate = useJourney((s) => s.hydrate);
  const endJourney = useJourney((s) => s.end);

  /* ---- خطوط خاموش‌شده (کلید چشم) — ذخیره دائمی در حافظه دستگاه ---- */
  const hiddenLines = useSyncExternalStore(subscribeHiddenLines, readHiddenLines, () => EMPTY_HIDDEN);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

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

  const showAllLines = useCallback(() => {
    if (!readHiddenLines().length) return;
    writeHiddenLines([]);
    toast({ title: "همه خطوط نمایش داده شد" });
  }, [toast]);

  const jNext = useMemo(() => {
    if (!journey || journey.currentIndex < 0) return null;
    const last = journey.path.length - 1;
    if (journey.currentIndex >= last) return null;
    return getStation(journey.path[journey.currentIndex + 1])?.name ?? null;
  }, [journey]);

  const tehranLines = LINES.filter((l) => l.cityId === "tehran");

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
      <PageHeader title="نقشه تعاملی مترو" subtitle="بزرگ‌نمایی، جابجایی و انتخاب ایستگاه" />

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

        {/* ================= بوم نقشه ================= */}
        <div className="mx-4 bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-sm overflow-hidden">
          <MetroMap
            className="h-[620px] w-full"
            highlightStations={journey?.path}
            hiddenLineIds={hiddenLines}
            onToggleLine={toggleLine}
            onStationSelect={(stationId) => {
              const st = getStation(stationId);
              if (st) setSelected(st);
            }}
          />
        </div>

        <div className="mx-4 mt-3 space-y-3">
          {/* ================= راهنمای خطوط (با کلید چشم) ================= */}
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MI name="layers" size={20} className="text-primary" />
                <h3 className="font-bold text-xs text-on-surface">راهنمای خطوط شبکه تهران</h3>
              </div>
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {toFa(tehranLines.length - hiddenLines.length)} از {toFa(tehranLines.length)} خط
              </span>
            </div>

            {hiddenLines.length > 0 && (
              <button
                type="button"
                onClick={showAllLines}
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
                    className={`flex items-center gap-1 rounded-xl transition-opacity ${isHidden ? "opacity-55" : ""}`}
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
                      aria-label={isHidden ? `نمایش ${line.name} روی نقشه` : `پنهان کردن ${line.name} روی نقشه`}
                      aria-pressed={!isHidden}
                      title={isHidden ? "نمایش روی نقشه" : "پنهان از نقشه"}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition-all ${
                        isHidden
                          ? "text-outline-variant bg-surface-container/60"
                          : "text-primary hover:bg-surface-container-low"
                      }`}
                    >
                      <MI name={isHidden ? "visibility_off" : "visibility"} size={19} />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-outline-variant">
              با لمس چشم، هر خط را از نقشه پنهان یا نمایش دهید؛ انتخاب شما ذخیره می‌شود.
            </p>
          </section>

          {/* ================= راهنمای حرکات ================= */}
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <MI name="info" size={20} className="text-primary" />
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
              با لمس هر ایستگاه روی نقشه، کارد جزئیات باز می‌شود.
            </p>
          </section>
        </div>
      </main>

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
                onClick={() => router.push(`/stations/${selected.id}`)}
                className="flex-1 h-10 rounded-xl bg-primary-container text-white text-xs font-bold shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
              >
                <MI name="info" size={15} />
                مشاهده جزئیات ایستگاه
              </button>
              <button
                type="button"
                onClick={() => router.push(`/plan?to=${selected.id}`)}
                className="h-10 px-4 rounded-xl border border-outline-variant text-xs font-bold text-on-surface active:scale-95 transition-all flex items-center gap-1"
              >
                <MI name="route" size={15} />
                مسیریابی
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
