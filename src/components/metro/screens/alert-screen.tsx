"use client";

import { useEffect, useMemo, useState } from "react";
import { useMetro, nav } from "@/lib/store";
import { MI } from "../ui";
import { StationPickerSheet } from "../station-picker";
import { toFa } from "@/lib/metro-data";
import { useAnnouncer } from "../voice";

/** هشدار و بیدارباش مقصد — مسافر مقصد را انتخاب می‌کند و N ایستگاه مانده مطلع می‌شود */
export default function AlertScreen({
  initialTo,
}: {
  initialTo?: string;
}) {
  const alertDest = useMetro((s) => s.alertDestination);
  const setAlertDestination = useMetro((s) => s.setAlertDestination);
  const [destination, setDestination] = useState<{ id: string; name: string } | null>(
    alertDest ? { id: alertDest.stationId, name: alertDest.stationName } : initialTo ? { id: initialTo, name: "..." } : null
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [before, setBefore] = useState(alertDest?.beforeStations ?? 2);
  const [sound, setSound] = useState<"chime" | "voice">("voice");
  const [armed, setArmed] = useState(!!alertDest);
  const [progress, setProgress] = useState(78); // شبیه‌سازی پیشرفت سفر
  const { announce, speaking, stop } = useAnnouncer();

  // resolve نام ایستگاه اولیه
  useEffect(() => {
    if (initialTo && destination?.name === "...") {
      fetch(`/api/search?ids=${initialTo}`)
        .then((r) => r.json())
        .then((d) => {
          const s = (d.stations ?? [])[0];
          if (s) setDestination({ id: s.id, name: s.name });
        })
        .catch(() => {});
    }
     
  }, [initialTo]);

  // شبیه‌سازی نزدیک شدن به مقصد در حالت فعال
  useEffect(() => {
    if (!armed) return;
    const t = setInterval(() => {
      setProgress((p) => {
        const next = p + 4;
        if (next >= 100) {
          trigger();
          setArmed(false);
          return 100;
        }
        return next;
      });
    }, 2500);
    return () => clearInterval(t);
     
  }, [armed]);

  const trigger = () => {
    if (sound === "voice" && destination) {
      announce(`توجه! ${toFa(before)} ایستگاه مانده به ${destination.name}، آماده پیاده شدن شوید.`);
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([300, 150, 300]);
    setArmed(false);
    setProgress(100);
  };

  const stationsLeft = useMemo(() => {
    const remainPct = 100 - progress;
    return Math.max(1, Math.ceil((remainPct / 100) * 12));
  }, [progress]);

  const arm = () => {
    if (!destination) {
      setPickerOpen(true);
      return;
    }
    setProgress(15);
    setArmed(true);
    setAlertDestination({ stationId: destination.id, stationName: destination.name, beforeStations: before });
  };

  const disarm = () => {
    setArmed(false);
    setAlertDestination(null);
  };

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-3">
      {/* هدر */}
      <section className="bg-gradient-to-l from-metro-tertiary-c to-metro-tertiary text-white rounded-2xl p-4 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <MI name="alarm" size={24} fill />
          </div>
          <div>
            <h2 className="text-sm font-bold">هشدار و بیدارباش مقصد</h2>
            <p className="text-[11px] text-white/80 mt-0.5">در خواب یا گوشی‌بازی، N ایستگاه مانده به مقصد بیدار شوید</p>
          </div>
        </div>
      </section>

      {/* انتخاب مقصد */}
      <section className="bg-metro-card rounded-2xl border border-metro-outline-var/30 p-3.5 space-y-3 shadow-sm">
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center gap-2.5 bg-metro-c-low px-3 py-2.5 rounded-xl border border-metro-outline-var/20 active:scale-[0.99] transition-all text-right"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-metro-secondary flex-shrink-0" />
          <span className={`flex-1 text-xs font-bold truncate ${destination ? "text-metro-onsurface" : "text-metro-outline"}`}>
            {destination ? `مقصد: ${destination.name}` : "ایستگاه مقصد را انتخاب کنید"}
          </span>
          <MI name="place" size={16} className="text-metro-outline" />
        </button>

        <div>
          <p className="text-[11px] font-bold text-metro-onvar mb-1.5">اعلان چند ایستگاه مانده؟</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 5].map((n) => (
              <button
                key={n}
                onClick={() => setBefore(n)}
                className={`py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  before === n ? "bg-metro-primary-c text-white shadow-sm" : "bg-metro-c-low text-metro-onvar"
                }`}
              >
                {toFa(n)} ایستگاه
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold text-metro-onvar mb-1.5">نوع هشدار</p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setSound("voice")}
              className={`py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 ${
                sound === "voice" ? "bg-metro-primary-c text-white" : "bg-metro-c-low text-metro-onvar"
              }`}
            >
              <MI name="record_voice_over" size={15} />
              اعلام صوتی هوشمند
            </button>
            <button
              onClick={() => setSound("chime")}
              className={`py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 ${
                sound === "chime" ? "bg-metro-primary-c text-white" : "bg-metro-c-low text-metro-onvar"
              }`}
            >
              <MI name="notifications_active" size={15} />
              زنگ + لرزش
            </button>
          </div>
        </div>

        {armed ? (
          <button
            onClick={disarm}
            className="w-full py-3 bg-metro-error text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
          >
            <MI name="stop_circle" size={18} />
            لغو هشدار فعال
          </button>
        ) : (
          <button
            onClick={arm}
            className="w-full py-3 bg-metro-primary-c text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
          >
            <MI name="alarm_add" size={18} fill />
            فعال‌سازی هشدار مقصد
          </button>
        )}
      </section>

      {/* وضعیت فعال */}
      {armed && destination && (
        <section className="bg-metro-card rounded-2xl border-2 border-metro-tertiary/40 p-4 shadow-md fade-in space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-metro-tertiary opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-metro-tertiary" />
              </span>
              <p className="text-xs font-bold text-metro-tertiary">هشدار فعال است</p>
            </div>
            <button
              onClick={() => announce(`توجه! ${toFa(stationsLeft)} ایستگاه مانده به ${destination.name}.`)}
              className="text-[10px] font-bold text-metro-primary-c flex items-center gap-1 bg-metro-fixed/60 px-2 py-1 rounded-lg"
            >
              <MI name={speaking ? "volume_up" : "record_voice_over"} size={13} />
              {speaking ? "در حال پخش..." : "تست اعلام"}
            </button>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] text-metro-onvar mb-1">
              <span>{destination.name}</span>
              <span className="font-bold text-metro-primary">{toFa(stationsLeft)} ایستگاه مانده</span>
            </div>
            <div className="h-2.5 bg-metro-c rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-l from-metro-tertiary to-metro-tertiary-c rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <p className="text-[10px] text-metro-outline leading-5">
            گوشی را در جیب نگه دارید؛ در {toFa(before)} ایستگاه مانده به {destination.name}، اعلام صوتی و لرزش فعال می‌شود.
            <button onClick={() => nav.go("map")} className="text-metro-primary-c font-bold hover:underline">
              {" "}مشاهده روی نقشه
            </button>
          </p>
        </section>
      )}

      <StationPickerSheet
        open={pickerOpen}
        title="انتخاب ایستگاه مقصد"
        onClose={() => setPickerOpen(false)}
        onSelect={(id, name) => setDestination({ id, name })}
      />
    </main>
  );
}
