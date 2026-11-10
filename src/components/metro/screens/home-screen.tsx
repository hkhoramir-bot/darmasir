"use client";

import { useEffect, useState, useCallback } from "react";
import { useMetro, nav } from "@/lib/store";
import { AdBanner, MI, SectionTitle, CrowdPill, useTicker } from "../ui";
import { toFa } from "@/lib/metro-data";

interface DailyRoute {
  id: string;
  kind: string;
  label: string;
  fromName: string;
  toName: string;
  fromStationId: string;
  toStationId: string;
}

interface FavStation {
  id: string;
  name: string;
  isInterchange: boolean;
  lines: { id: string; number: number; name: string; color: string; textOnColor: string }[];
}

interface Arrival {
  lineId: string;
  lineNumber: number;
  color: string;
  textOnColor: string;
  nextMin: number;
  crowdLabel: string;
}

const QUICK_ACTIONS = [
  { icon: "route", label: "مسیریاب سفر", screen: "planner" as const, bg: "bg-metro-fixed", fg: "text-metro-primary" },
  { icon: "alarm", label: "هشدار مقصد", screen: "alert" as const, bg: "bg-metro-c-high", fg: "text-metro-primary-c" },
  { icon: "speed", label: "وضعیت خطوط", screen: "status" as const, bg: "bg-metro-c", fg: "text-metro-tertiary" },
  { icon: "history", label: "تاریخچه سفر", screen: "history" as const, bg: "bg-metro-c-highest", fg: "text-metro-onsurface" },
];

export default function HomeScreen() {
  const city = useMetro((s) => s.city);
  const favorites = useMetro((s) => s.favorites);
  const alertDest = useMetro((s) => s.alertDestination);
  const now = useTicker(20000);
  const [routes, setRoutes] = useState<DailyRoute[]>([]);
  const [favs, setFavs] = useState<FavStation[]>([]);
  const [arrivals, setArrivals] = useState<Record<string, Arrival[]>>({});
  const [smartAlert, setSmartAlert] = useState(true);
  const [serviceOk, setServiceOk] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/daily-routes").then((r) => r.json()),
      fetch("/api/favorites").then((r) => r.json()),
      fetch("/api/status").then((r) => r.json()),
    ]).then(([r1, r2, r3]) => {
      if (!alive) return;
      setRoutes(r1.routes ?? []);
      setFavs(r2.favorites ?? []);
      setServiceOk((r3.alerts ?? []).length === 0);
    }).catch(() => { /* ignore */ });
    return () => {
      alive = false;
    };
  }, [favorites]);

  // arrivals برای ایستگاه‌های نشان‌شده
  useEffect(() => {
    let alive = true;
    const ids = favs.slice(0, 4).map((f) => f.id);
    Promise.all(
      ids.map((id) => fetch(`/api/arrivals?station=${id}`).then((r) => r.json()).catch(() => null))
    ).then((res) => {
      if (!alive) return;
      const map: Record<string, Arrival[]> = {};
      res.forEach((d) => {
        if (d?.station) map[d.station.id] = d.arrivals;
      });
      setArrivals(map);
    });
    return () => {
      alive = false;
    };
  }, [favs, now]);

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-4">
      {/* بنر تبلیغ */}
      <AdBanner />

      {/* هشدار هوشمند حرکت */}
      <section className="bg-metro-c-low rounded-2xl p-3.5 border border-metro-outline-var/40 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-metro-primary text-white flex items-center justify-center shrink-0">
            <MI name="notifications_active" size={20} fill />
          </div>
          <div>
            <h3 className="text-sm font-bold text-metro-onsurface">هشدار هوشمند حرکت</h3>
            <p className="text-[11px] text-metro-onvar">اعلام خودکار زمان رسیدن قطار</p>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={smartAlert}
          onClick={() => setSmartAlert((v) => !v)}
          className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${smartAlert ? "bg-metro-primary-c" : "bg-metro-outline-var"}`}
        >
          <span
            className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow transition-all ${smartAlert ? "right-[2px]" : "right-[22px]"}`}
          />
        </button>
      </section>

      {/* دسترسی سریع */}
      <section className="grid grid-cols-4 gap-2" aria-label="دسترسی سریع">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => nav.go(a.screen)}
            className="bg-white border border-metro-outline-var/50 p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] active:scale-95 transition-all text-center"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${a.bg} ${a.fg}`}>
              <MI name={a.icon} size={20} fill />
            </div>
            <span className="text-[10px] text-metro-onsurface font-medium leading-tight">{a.label}</span>
          </button>
        ))}
      </section>

      {/* هشدار مقصد فعال */}
      {alertDest && (
        <button
          onClick={() => nav.go("alert")}
          className="w-full bg-gradient-to-l from-metro-tertiary-c to-metro-tertiary text-white rounded-2xl p-3.5 flex items-center justify-between shadow-md active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <MI name="alarm_on" size={22} fill />
            </div>
            <div className="text-right">
              <h4 className="text-sm font-bold">هشدار مقصد فعال است</h4>
              <p className="text-[11px] text-white/80 mt-0.5">
                بیدارباش {toFa(alertDest.beforeStations)} ایستگاه مانده به {alertDest.stationName}
              </p>
            </div>
          </div>
          <MI name="chevron_left" size={20} className="text-white/80" />
        </button>
      )}

      {/* مسیرهای اصلی */}
      <section className="space-y-3">
        <SectionTitle
          title="مسیرهای روزمره من"
          extra={
            <button
              onClick={() => nav.go("planner")}
              className="flex items-center gap-1 px-3 py-1.5 bg-metro-primary-c text-white rounded-xl text-[11px] font-bold shadow-sm active:scale-95 transition-all"
            >
              <MI name="bookmark_add" size={15} />
              مقصد جدید
            </button>
          }
        />
        {routes.length === 0 && (
          <button
            onClick={() => nav.go("planner")}
            className="w-full bg-white border border-dashed border-metro-outline-var rounded-2xl p-4 text-center active:scale-[0.99] transition-all"
          >
            <MI name="add_circle" size={28} className="text-metro-fixed-dim mx-auto" />
            <p className="text-xs text-metro-onvar mt-1">مسیر خانه و محل کار را بسازید تا اینجا ببینید</p>
          </button>
        )}
        {routes.map((r) => (
          <RouteCard key={r.id} route={r} now={now} />
        ))}
      </section>

      {/* ایستگاه‌های نشان‌شده */}
      <section className="space-y-2.5">
        <SectionTitle
          title="ایستگاه‌های نشان‌شده من"
          extra={
            <button
              onClick={() => nav.go("search")}
              className="text-[11px] text-metro-primary-c font-bold flex items-center gap-0.5 hover:underline"
            >
              مدیریت همه
              <MI name="chevron_left" size={14} />
            </button>
          }
        />
        {favs.length === 0 && (
          <div className="bg-white border border-dashed border-metro-outline-var rounded-2xl p-4 text-center">
            <MI name="push_pin" size={26} className="text-metro-fixed-dim mx-auto" />
            <p className="text-xs text-metro-onvar mt-1">
              هنوز ایستگاهی نشان نکرده‌اید؛ از صفحه ایستگاه‌ها نشان کنید
            </p>
          </div>
        )}
        {favs.slice(0, 4).map((f) => (
          <button
            key={f.id}
            onClick={() => nav.go("station-detail", { stationId: f.id })}
            className="w-full bg-white rounded-2xl p-3 border border-metro-outline-var/40 shadow-sm flex items-center justify-between gap-3 hover:border-metro-primary transition-all active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center -space-x-1.5 space-x-reverse shrink-0">
                {f.lines.map((l) => (
                  <span
                    key={l.id}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border-2 border-white"
                    style={{ backgroundColor: l.color, color: l.textOnColor }}
                  >
                    {toFa(l.number)}
                  </span>
                ))}
              </div>
              <div className="text-right min-w-0">
                <h4 className="text-sm font-bold text-metro-onsurface truncate">{f.name}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  {(arrivals[f.id] ?? []).slice(0, 2).map((a) => (
                    <span key={a.lineId} className="text-[10px] text-metro-onvar flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: a.color }} />
                      {toFa(a.nextMin)} دقیقه
                    </span>
                  ))}
                  {!(arrivals[f.id] ?? []).length && (
                    <span className="text-[10px] text-metro-outline">در حال دریافت...</span>
                  )}
                </div>
              </div>
            </div>
            <MI name="chevron_left" size={18} className="text-metro-outline-var shrink-0" />
          </button>
        ))}
      </section>

      {/* وضعیت سرویس */}
      <button
        onClick={() => nav.go("status")}
        className="w-full bg-metro-c-low rounded-2xl px-3.5 py-2.5 flex items-center justify-between border border-metro-outline-var/20 active:scale-[0.99] transition-all"
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full pulse-dot ${serviceOk ? "bg-emerald-600" : "bg-amber-500"}`} />
          <span className="text-[11px] text-metro-onsurface">
            {serviceOk ? "وضعیت خطوط: سرویس‌دهی عادی و روان" : "اخباری از تاخیر و ازدحام ثبت شده"}
          </span>
        </div>
        <span className="text-[10px] text-metro-primary font-bold flex items-center gap-0.5">
          جزئیات
          <MI name="chevron_left" size={13} />
        </span>
      </button>

      {/* CTA مسیریابی */}
      <section className="bg-gradient-to-l from-metro-primary-c to-metro-primary text-white rounded-2xl p-4 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0">
            <MI name="route" size={24} className="text-metro-tertiary-fixed" fill />
          </div>
          <div className="text-right">
            <h4 className="text-sm font-bold">سریع‌ترین مسیر بین دو خط</h4>
            <p className="text-[11px] text-metro-onprimary-c mt-0.5">کم‌ترین تعویض خط و خلوت‌ترین ساعات</p>
          </div>
        </div>
        <button
          onClick={() => nav.go("planner")}
          className="bg-white text-metro-primary px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 active:scale-95 transition-all shadow-sm"
        >
          مسیریابی
        </button>
      </section>

      <p className="text-center text-[10px] text-metro-outline-var pt-1">
        شهر فعال: {city === "tehran" ? "تهران" : "—"} • تمامی خطوط فعال
      </p>
    </main>
  );
}

/* ---------------- کارت مسیر روزمره با arrival زنده ---------------- */
function RouteCard({ route, now }: { route: DailyRoute; now: number }) {
  const [arr, setArr] = useState<Arrival[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/arrivals?station=${route.fromStationId}`)
      .then((r) => r.json())
      .then((d) => alive && setArr(d.arrivals ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [route.fromStationId, now]);

  const icon = route.kind === "home" ? "home" : route.kind === "work" ? "work" : "star";
  const tint = route.kind === "home" ? "from-metro-primary-c via-[#1a5eac] to-metro-secondary" : "from-[#7d2382] via-metro-primary-c to-metro-c-highest";

  return (
    <div className="bg-white rounded-2xl p-3.5 border border-metro-outline-var/40 shadow-sm relative overflow-hidden">
      <div className={`absolute top-0 right-0 left-0 h-1 bg-gradient-to-l ${tint}`} />
      <div className="flex items-center justify-between mb-2.5 pt-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-metro-c text-metro-primary flex items-center justify-center shrink-0">
            <MI name={icon} size={22} fill />
          </div>
          <div className="min-w-0 text-right">
            <h4 className="text-sm font-bold text-metro-onsurface truncate">{route.label}</h4>
            <p className="text-[11px] text-metro-onvar truncate">
              {route.fromName} ← {route.toName}
            </p>
          </div>
        </div>
        <button
          aria-label="حذف مسیر"
          onClick={async () => {
            await fetch(`/api/daily-routes?id=${route.id}`, { method: "DELETE" });
          }}
          className="p-1.5 rounded-lg text-metro-outline hover:bg-metro-c hover:text-metro-error active:scale-95 transition-all shrink-0"
        >
          <MI name="delete" size={18} />
        </button>
      </div>
      <div className="flex items-center justify-between bg-metro-c/60 rounded-xl px-3 py-2">
        {arr && arr.length > 0 ? (
          <span className="text-[11px] text-metro-onsurface flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-metro-secondary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-metro-secondary-c" />
            </span>
            نزدیک‌ترین قطار: <strong className="text-metro-secondary font-bold">{toFa(arr[0].nextMin)} دقیقه</strong>
            <CrowdPill level={arr[0].nextMin > 6 ? "quiet" : "moderate"} label={arr[0].crowdLabel} />
          </span>
        ) : (
          <span className="text-[11px] text-metro-outline">در حال دریافت زمان‌بندی...</span>
        )}
        <button
          onClick={() => nav.go("planner", { fromStationId: route.fromStationId, toStationId: route.toStationId })}
          className="text-[10px] font-bold text-metro-primary-c bg-white px-2 py-0.5 rounded-full border border-metro-outline-var/40"
        >
          مسیریابی
        </button>
      </div>
    </div>
  );
}
