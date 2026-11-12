"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LINES, toFa, getStation, headwayAt, type StationDef } from "@/lib/metro-data";
import { PageHeader, MI } from "@/components/metro/shell";
import MetroMap from "@/components/metro/metro-map";

/* ============================================================
   نقشه تعاملی شبکه — پینچ/جابجایی روان، انتخاب ایستگاه با
   کارد پایین‌صفحه (مثل اپ‌های نقشه) و موقعیت‌یاب GPS
   ============================================================ */

const GESTURE_TIPS: { icon: string; text: string }[] = [
  { icon: "pan_tool", text: "یک انگشت: جابجایی روی نقشه" },
  { icon: "pinch", text: "دو انگشت: بزرگ‌نمایی و کوچک‌نمایی" },
  { icon: "my_location", text: "دکمه موقعیت: نزدیک‌ترین ایستگاه به شما" },
];

export default function MapPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<StationDef | null>(null);
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
        {/* ================= بوم نقشه ================= */}
        <div className="mx-4 bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-sm overflow-hidden">
          <MetroMap
            className="h-[560px] w-full"
            onStationSelect={(stationId) => {
              const st = getStation(stationId);
              if (st) setSelected(st);
            }}
          />
        </div>

        <div className="mx-4 mt-3 space-y-3">
          {/* ================= راهنمای خطوط ================= */}
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MI name="layers" size={20} className="text-primary" />
                <h3 className="font-bold text-xs text-on-surface">راهنمای خطوط شبکه تهران</h3>
              </div>
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {toFa(tehranLines.length)} خط فعال
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {tehranLines.map((line) => (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => router.push(`/lines/${line.id}`)}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-surface-container-low active:scale-[0.98] transition-all text-right"
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm ring-1 ring-black/5"
                    style={{ backgroundColor: line.color }}
                  />
                  <span className="text-[11px] font-bold text-on-surface shrink-0">{line.name}</span>
                  <span className="text-[10px] text-outline truncate">
                    {line.terminals[0]} ↔ {line.terminals[1]}
                  </span>
                  <MI name="chevron_left" size={14} className="text-outline-variant shrink-0 mr-auto" />
                </button>
              ))}
            </div>
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
