"use client";

import { useEffect, useState } from "react";
import { useMetro, nav } from "@/lib/store";
import { AdBanner, MI, useTicker } from "../ui";
import { InstallBanner } from "../pwa";
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
  /* nextMin واقعی داخل directions است نه سطح بالا */
  directions?: { to: string; nextMin: number | null; crowdLabel: string }[];
}

export default function HomeScreen() {
  const favorites = useMetro((s) => s.favorites);
  const alertDest = useMetro((s) => s.alertDestination);
  const toggleFavoriteLocal = useMetro((s) => s.toggleFavoriteLocal);
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

  /* حذف ایستگاه نشان‌شده — همان الگوی صفحه جزئیات ایستگاه */
  const deleteFavorite = async (stationId: string) => {
    await fetch(`/api/favorites?stationId=${stationId}`, { method: "DELETE" });
    toggleFavoriteLocal(stationId);
  };

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-4">
      {/* تیتر صفحه — مسیریابی های برگزیده */}
      <section className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MI name="star" size={24} fill className="text-metro-primary shrink-0" />
            <h2 className="text-[16px] font-extrabold text-metro-onsurface truncate">مسیریابی های برگزیده</h2>
            <button
              aria-label="راهنما"
              title="راهنمای مسیرهای برگزیده"
              className="w-7 h-7 rounded-full bg-metro-c flex items-center justify-center text-metro-outline hover:text-metro-primary hover:bg-metro-c-high active:scale-95 transition-all shrink-0"
            >
              <MI name="info" size={16} />
            </button>
          </div>
          <p className="text-[10px] text-metro-outline mt-0.5">دسترسی سریع و آگاهی زنده</p>
        </div>
        <button
          onClick={() => nav.go("planner")}
          className="flex items-center gap-1 px-3 py-2 bg-primary text-white rounded-full text-xs font-bold shadow-sm active:scale-95 transition-all shrink-0"
        >
          <MI name="bookmark_add" size={16} />
          مقصد جدید
        </button>
      </section>

      {/* هشدار هوشمند حرکت */}
      <section className="bg-metro-card rounded-2xl p-3.5 border border-metro-outline-var/40 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-metro-fixed text-metro-primary flex items-center justify-center shrink-0">
            <MI name="notifications_active" size={20} fill />
          </div>
          <div>
            <h3 className="text-sm font-bold text-metro-onsurface">هشدار هوشمند حرکت</h3>
            <p className="text-[11px] text-metro-onvar">اعلان خودکار زمان قطار نزدیک</p>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={smartAlert}
          aria-label="هشدار هوشمند حرکت"
          onClick={() => setSmartAlert((v) => !v)}
          className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${smartAlert ? "bg-metro-primary-c" : "bg-metro-outline-var"}`}
        >
          <span
            className={`absolute top-[2px] w-5 h-5 bg-metro-card rounded-full shadow transition-all ${smartAlert ? "right-[2px]" : "right-[22px]"}`}
          />
        </button>
      </section>

      {/* پیشنهاد نصب اپ */}
      <InstallBanner />

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
      <section className="space-y-3" aria-label="مسیرهای اصلی">
        <div className="flex items-center justify-between px-1 pt-1">
          <h3 className="text-sm font-bold text-metro-onsurface flex items-center gap-1.5">
            <MI name="travel_explore" size={18} className="text-metro-primary" />
            مسیرهای اصلی
          </h3>
          {routes.length > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              {toFa(routes.length)} مسیر فعال
            </span>
          )}
        </div>
        {routes.length === 0 && (
          <button
            onClick={() => nav.go("planner")}
            className="w-full bg-metro-card border border-dashed border-metro-outline-var rounded-2xl p-4 text-center active:scale-[0.99] transition-all"
          >
            <MI name="add_circle" size={28} className="text-metro-outline-var mx-auto" />
            <p className="text-xs text-metro-onvar mt-1">مسیر خانه و محل کار را بسازید تا اینجا ببینید</p>
          </button>
        )}
        {routes.map((r) => (
          <RouteCard key={r.id} route={r} now={now} />
        ))}
      </section>

      {/* ایستگاه‌های نشان‌شده از من */}
      <section className="space-y-2.5" aria-label="ایستگاه‌های نشان‌شده من">
        <div className="flex items-center justify-between px-1 pt-1">
          <h3 className="text-sm font-bold text-metro-onsurface flex items-center gap-1.5">
            <MI name="push_pin" size={18} className="text-metro-primary" />
            ایستگاه‌های نشان‌شده من
          </h3>
          <button
            onClick={() => nav.go("search")}
            className="text-[11px] text-metro-primary-c font-bold flex items-center gap-0.5 hover:underline"
          >
            مدیریت همه
            <MI name="chevron_left" size={14} />
          </button>
        </div>
        {favs.length === 0 && (
          <div className="bg-metro-card border border-dashed border-metro-outline-var rounded-2xl p-4 text-center">
            <MI name="push_pin" size={26} className="text-metro-outline-var mx-auto" />
            <p className="text-xs text-metro-onvar mt-1">
              هنوز ایستگاهی نشان نکرده‌اید؛ از صفحه ایستگاه‌ها نشان کنید
            </p>
          </div>
        )}
        {favs.slice(0, 4).map((f) => (
          <div
            key={f.id}
            className="bg-metro-card rounded-2xl p-3.5 border border-metro-outline-var/40 shadow-sm flex items-center justify-between gap-3 hover:border-metro-primary transition-all"
          >
            <button
              onClick={() => nav.go("station-detail", { stationId: f.id })}
              aria-label={`نمایش جزئیات ${f.name}`}
              className="flex-1 min-w-0 text-right active:scale-[0.99] transition-all"
            >
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-metro-onsurface truncate">{f.name}</h4>
                <div className="flex items-center gap-1 mt-1">
                  {f.lines.map((l) => (
                    <span
                      key={l.id}
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ backgroundColor: l.color, color: l.textOnColor }}
                    >
                      خط {toFa(l.number)}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {(arrivals[f.id] ?? []).slice(0, 2).map((a, i) => (
                    <span key={a.lineId} className="flex items-center gap-2 text-[10px] text-metro-onvar">
                      {i > 0 && <span className="text-metro-outline">•</span>}
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: a.color }} />
                        {`خط ${toFa(a.lineNumber)}: ${
                          a.directions?.[0]?.nextMin != null ? `${toFa(a.directions[0].nextMin)} دقیقه` : "—"
                        }`}
                      </span>
                    </span>
                  ))}
                  {!(arrivals[f.id] ?? []).length && (
                    <span className="text-[10px] text-metro-outline">در حال دریافت...</span>
                  )}
                </div>
              </div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              {/* دایره تزئینی فاصله پیاده با حلقه رنگ خط */}
              <div
                aria-hidden
                className="w-10 h-10 rounded-full border-2 bg-metro-c flex items-center justify-center relative"
                style={{ borderColor: f.lines[0]?.color }}
              >
                <MI name={f.isInterchange ? "transfer_within_a_station" : "directions_subway"} size={20} className="text-metro-primary" />
                {f.lines[0] && (
                  <span
                    className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full border border-white text-[9px] font-bold flex items-center justify-center"
                    style={{ backgroundColor: f.lines[0].color, color: f.lines[0].textOnColor }}
                  >
                    {toFa(f.lines[0].number)}
                  </span>
                )}
              </div>
              <button
                aria-label={`حذف ${f.name} از نشان‌شده‌ها`}
                onClick={async () => {
                  await deleteFavorite(f.id);
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-metro-outline hover:text-metro-error hover:bg-metro-error-c/20 active:scale-95 transition-all"
              >
                <MI name="delete" size={20} />
              </button>
              <MI name="chevron_left" size={20} className="text-metro-outline" />
            </div>
          </div>
        ))}
      </section>

      {/* وضعیت سرویس */}
      <button
        onClick={() => nav.go("status")}
        className="w-full bg-metro-card rounded-2xl px-3.5 py-2.5 flex items-center justify-between border border-metro-outline-var/40 shadow-sm active:scale-[0.99] transition-all"
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full pulse-dot ${serviceOk ? "bg-emerald-600" : "bg-amber-500/100"}`} />
          <span className="text-[11px] text-metro-onsurface">
            {serviceOk ? "وضعیت خطوط: سرویس‌دهی عادی و روان" : "اخباری از تاخیر و ازدحام ثبت شده"}
          </span>
        </div>
        <span className="text-[10px] text-metro-primary font-bold flex items-center gap-0.5">
          جزئیات
          <MI name="chevron_left" size={13} />
        </span>
      </button>

      {/* CTA مسیریابی — چیدمان کارت تبلیغ دیزاین */}
      <section className="bg-metro-card rounded-xl border border-metro-outline-var/40 p-3 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-metro-c-highest text-metro-primary flex items-center justify-center shrink-0">
            <MI name="route" size={20} />
          </div>
          <div className="min-w-0">
            <h4 className="text-[13px] font-bold text-metro-primary truncate">سریع‌ترین مسیر بین دو خط</h4>
            <p className="text-[11px] text-metro-onvar mt-0.5 truncate">کم‌ترین تعویض خط و خلوت‌ترین ساعات</p>
          </div>
        </div>
        <button
          onClick={() => nav.go("planner")}
          className="px-3 py-1.5 bg-metro-primary-c text-white rounded-lg text-xs font-bold shrink-0 active:scale-95 transition-all shadow-sm"
        >
          مسیریابی
        </button>
      </section>

      {/* بنر تبلیغ — اسلات انتهایی مطابق دیزاین */}
      <AdBanner />

      <footer className="text-center space-y-0.5 pt-1">
        <p className="text-[10px] text-metro-outline">طراحی شده برای مسیریابی سریع در بافت ریلی کلان‌شهرها</p>
        <p className="text-[10px] text-metro-outline-var">تمامی حقوق برای سامانه مترویار محفوظ است © {toFa(1404)}</p>
      </footer>
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

  /* اولین جهتِ اولین خط — nextMin داخل directions است نه سطح بالا */
  const firstArr = arr && arr.length > 0 ? arr[0] : undefined;
  const firstDir = firstArr?.directions?.[0];

  const icon = route.kind === "home" ? "home" : route.kind === "work" ? "work" : "star";
  const kindLabel = route.kind === "home" ? "خانه" : route.kind === "work" ? "محل کار" : "شخصی";
  const tint =
    route.kind === "home"
      ? "from-metro-primary-c via-[#1a5eac] to-metro-secondary"
      : "from-[#7d2382] via-metro-primary-c to-metro-c-highest";

  return (
    <div className="bg-metro-card rounded-2xl p-3.5 border border-metro-outline-var/40 shadow-sm relative overflow-hidden transition-all hover:shadow-md">
      {/* نوار گرادیان رنگ خطوط بالای کارت */}
      <div className={`absolute top-0 right-0 left-0 h-1 bg-gradient-to-l ${tint}`} />

      <div className="flex items-center justify-between gap-2 mb-2.5 pt-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-metro-c text-metro-primary flex items-center justify-center shrink-0">
            <MI name={icon} size={22} fill />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-metro-onsurface truncate">{route.label}</h4>
              <span className="text-[10px] font-semibold bg-metro-c-high text-metro-primary px-1.5 py-0.5 rounded shrink-0">
                {kindLabel}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[11px] text-metro-onvar">
              <span className="truncate max-w-[10rem]">{route.fromName}</span>
              {(arr ?? []).slice(0, 2).map((a) => (
                <span
                  key={a.lineId}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                  style={{ backgroundColor: a.color, color: a.textOnColor }}
                >
                  خط {toFa(a.lineNumber)}
                </span>
              ))}
              <span className="text-metro-outline">←</span>
              <span className="truncate max-w-[10rem]">{route.toName}</span>
              {firstDir?.nextMin != null && (
                <>
                  <span className="text-metro-outline">•</span>
                  <span className="text-metro-primary font-bold">{toFa(firstDir.nextMin)} دقیقه</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button
          aria-label="حذف مسیر"
          onClick={async () => {
            await fetch(`/api/daily-routes?id=${route.id}`, { method: "DELETE" });
          }}
          className="p-1.5 rounded-lg text-metro-outline hover:bg-metro-c hover:text-metro-error active:scale-95 transition-all shrink-0"
        >
          <MI name="delete" size={20} />
        </button>
      </div>

      {/* نوار وضعیت ورود قطار */}
      <div className="flex items-center justify-between gap-2 border-t border-metro-outline-var/20 pt-2.5 mb-3">
        {firstArr ? (
          <span className="text-[11px] text-metro-onsurface flex items-center gap-1.5 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary-container" />
            </span>
            <span className="truncate">
              ورود قطار خط {toFa(firstArr.lineNumber)}:{" "}
              <strong className="text-error font-bold">
                {firstDir?.nextMin != null ? `${toFa(firstDir.nextMin)} دقیقه` : "—"}
              </strong>
            </span>
          </span>
        ) : (
          <span className="text-[11px] text-metro-outline">در حال دریافت زمان‌بندی...</span>
        )}
        {firstDir?.crowdLabel && (
          <span className="text-[9px] text-metro-onvar bg-metro-c rounded-full px-2 py-0.5 shrink-0">
            {firstDir.crowdLabel}
          </span>
        )}
      </div>

      {/* شروع ناوبری */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => nav.go("planner", { fromStationId: route.fromStationId, toStationId: route.toStationId })}
          className="flex-1 py-2.5 px-4 bg-primary text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
        >
          <MI name="near_me" size={16} fill />
          شروع ناوبری
        </button>
      </div>
    </div>
  );
}
