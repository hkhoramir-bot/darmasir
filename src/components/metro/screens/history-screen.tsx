"use client";

import { useEffect, useState, useCallback } from "react";
import { nav } from "@/lib/store";
import { MI, useTicker } from "../ui";
import { toFa, faMoney } from "@/lib/metro-data";

interface Trip {
  id: string;
  fromName: string;
  toName: string;
  minutes: number;
  transfers: number;
  fare: number;
  pref: string;
  createdAt: string;
}

const PREF_LABEL: Record<string, string> = {
  fastest: "سریع‌ترین",
  least_transfers: "کمترین تعویض",
  quietest: "خلوت‌ترین",
};

export default function HistoryScreen() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [stats, setStats] = useState<{ count: number; minutes: number; fare: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const now = useTicker(60000);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => {
        setTrips(d.trips ?? []);
        setStats(d.stats ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setTrips(d.trips ?? []);
        setStats(d.stats ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, [load, now]);

  const clearAll = async () => {
    await fetch("/api/history?all=1", { method: "DELETE" });
    load();
  };

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-3">
      {/* آمار */}
      <section className="bg-gradient-to-l from-metro-primary-c to-metro-primary text-white rounded-2xl p-4 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <MI name="history" size={24} fill />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold">تاریخچه سفرهای شما</h2>
            <p className="text-[11px] text-metro-onprimary-c mt-0.5">
              {stats ? `${toFa(stats.count)} سفر ثبت‌شده • ${toFa(stats.minutes)} دقیقه • ${faMoney(stats.fare)} تومان` : "..."}
            </p>
          </div>
        </div>
      </section>

      {trips.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-metro-onvar">آخرین سفرها</span>
          <button onClick={clearAll} className="text-[11px] font-bold text-metro-error flex items-center gap-0.5">
            <MI name="delete_sweep" size={14} />
            پاک‌سازی همه
          </button>
        </div>
      )}

      <section className="space-y-2" aria-label="لیست سفرها">
        {loading && [0, 1, 2].map((i) => <div key={i} className="h-20 shimmer rounded-2xl" />)}
        {!loading && trips.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-metro-outline-var p-6 text-center">
            <MI name="travel_explore" size={32} className="text-metro-fixed-dim mx-auto" />
            <p className="text-xs text-metro-onvar mt-2">هنوز سفری ثبت نشده؛ از مسیریاب شروع کنید</p>
            <button
              onClick={() => nav.go("planner")}
              className="mt-3 px-4 py-2 bg-metro-primary-c text-white rounded-xl text-xs font-bold active:scale-95 transition-all"
            >
              شروع اولین سفر
            </button>
          </div>
        )}
        {trips.map((t) => (
          <button
            key={t.id}
            onClick={() => nav.go("station-detail", { stationId: undefined })}
            className="w-full bg-white rounded-2xl p-3.5 border border-metro-outline-var/40 shadow-sm flex items-center justify-between gap-3 active:scale-[0.99] transition-all text-right"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-metro-c-low text-metro-primary flex items-center justify-center shrink-0">
                <MI name="tram" size={20} fill />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-metro-onsurface truncate">
                  {t.fromName} ← {t.toName}
                </p>
                <p className="text-[10px] text-metro-onvar mt-0.5 flex items-center gap-1.5">
                  <span>{toFa(t.minutes)} دقیقه</span>
                  <span>•</span>
                  <span>{t.transfers > 0 ? `${toFa(t.transfers)} تعویض خط` : "مستقیم"}</span>
                  <span>•</span>
                  <span>{PREF_LABEL[t.pref] ?? ""}</span>
                </p>
              </div>
            </div>
            <div className="text-left shrink-0">
              <p className="text-[11px] font-bold text-metro-primary">{faMoney(t.fare)} تومان</p>
              <p className="text-[9px] text-metro-outline mt-0.5">
                {new Date(t.createdAt).toLocaleDateString("fa-IR", { month: "short", day: "numeric" })}
                {" "}
                {new Date(t.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </button>
        ))}
      </section>
    </main>
  );
}
