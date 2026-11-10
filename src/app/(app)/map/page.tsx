"use client";

import { useRouter } from "next/navigation";
import { LINES, toFa } from "@/lib/metro-data";
import { PageHeader, MI } from "@/components/metro/shell";
import MetroMap from "@/components/metro/metro-map";

/* ============================================================
   نقشه تعاملی شبکه — بزرگ‌نمایی، جابجایی و انتخاب ایستگاه
   ============================================================ */

const GESTURE_TIPS: { icon: string; text: string }[] = [
  { icon: "pan_tool", text: "یک انگشت: جابجایی روی نقشه" },
  { icon: "pinch", text: "دو انگشت: بزرگ‌نمایی و کوچک‌نمایی" },
  { icon: "touch_app", text: "لمس ایستگاه: مشاهده جزئیات" },
];

export default function MapPage() {
  const router = useRouter();
  const tehranLines = LINES.filter((l) => l.cityId === "tehran");

  return (
    <>
      <PageHeader title="نقشه تعاملی مترو" subtitle="بزرگ‌نمایی، جابجایی و انتخاب ایستگاه" />

      <main className="flex-1 w-full pb-28 pt-3">
        {/* ================= بوم نقشه ================= */}
        <div className="mx-4 bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-sm overflow-hidden">
          <MetroMap
            className="h-[560px] w-full"
            onStationSelect={(stationId) => router.push(`/stations/${stationId}`)}
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
              با لمس هر ایستگاه روی نقشه، جزئیات کامل آن باز می‌شود.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
