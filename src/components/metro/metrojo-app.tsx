"use client";

import { useEffect, useState } from "react";
import { useMetro } from "@/lib/store";
import { BottomNav } from "./bottom-nav";
import { MI, SubHeader } from "./ui";
import { CityDrawer } from "./screens/lines-screen";
import HomeScreen from "./screens/home-screen";
import LinesScreen from "./screens/lines-screen";
import LineDetailScreen from "./screens/line-detail-screen";
import SearchScreen from "./screens/search-screen";
import StationDetailScreen from "./screens/station-detail-screen";
import PlannerScreen from "./screens/planner-screen";
import MapScreen from "./screens/map-screen";
import StatusScreen from "./screens/status-screen";
import AlertScreen from "./screens/alert-screen";
import HistoryScreen from "./screens/history-screen";
import SettingsScreen from "./screens/settings-screen";
import { CITIES, toFa } from "@/lib/metro-data";

/* ============================ اسپلش ============================ */
function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-metro-primary to-metro-primary-c flex flex-col items-center justify-center">
      <div className="splash-logo flex flex-col items-center">
        <div className="w-28 h-28 rounded-[28px] bg-white shadow-2xl flex items-center justify-center overflow-hidden">
          { }
          <img src="/metrojo-symbol.png" alt="متروجو" className="w-24 h-24 object-contain" />
        </div>
        <h1 className="text-3xl font-extrabold text-white mt-5 tracking-tight">متروجو</h1>
        <p className="text-sm text-metro-onprimary-c mt-1">سامانه هوشمند ناوبری مترو</p>
      </div>
      <div className="w-40 h-1.5 bg-white/20 rounded-full mt-10 overflow-hidden">
        <div className="h-full bg-metro-tertiary-fixed rounded-full splash-bar" />
      </div>
      <p className="text-[10px] text-white/60 absolute bottom-8">سفر امن و سریع با شبکه مترو کلان‌شهرها</p>
    </div>
  );
}

/* ============================ هدر خانه/خطوط ============================ */
function AppHeader({ onCityClick }: { onCityClick: () => void }) {
  const city = useMetro((s) => s.city);
  const cityName = CITIES.find((c) => c.id === city)?.name ?? "تهران";
  return (
    <header className="bg-metro-surface/95 backdrop-blur border-b border-metro-outline-var/30 shadow-sm flex justify-between items-center w-full px-4 h-16 sticky top-0 z-40 transition-all">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-white border border-metro-outline-var/30 flex items-center justify-center overflow-hidden shadow-sm shrink-0">
          { }
          <img src="/metrojo-symbol.png" alt="لوگوی متروجو" className="w-8 h-8 object-contain" />
        </div>
        <span className="font-extrabold text-metro-primary text-lg tracking-tight">متروجو</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onCityClick}
          aria-label="انتخاب شهر"
          className="flex items-center gap-1 bg-metro-c hover:bg-metro-c-high text-metro-primary px-3 py-1.5 rounded-full border border-metro-outline-var/40 active:scale-95 transition-all"
        >
          <MI name="location_on" size={16} className="text-metro-primary-c" />
          <span className="text-xs font-bold">{cityName}</span>
          <MI name="arrow_drop_down" size={16} />
        </button>
        <button
          aria-label="وضعیت خطوط"
          onClick={() => useMetro.getState().push({ name: "status" })}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-metro-primary hover:bg-metro-c active:scale-95 transition-all"
        >
          <MI name="notifications" size={22} />
        </button>
      </div>
    </header>
  );
}

/* ============================ اپ اصلی ============================ */
export default function MetrojoApp() {
  const booted = useMetro((s) => s.booted);
  const setBooted = useMetro((s) => s.setBooted);
  const stack = useMetro((s) => s.stack);
  const [cityOpen, setCityOpen] = useState(false);
  const current = stack[stack.length - 1];

  // اسکرول به بالا هنگام تغییر صفحه
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [stack.length, current?.name]);

  if (!booted) {
    return <SplashScreen onDone={setBooted} />;
  }

  const screen = current?.name ?? "home";
  const params = current?.params ?? {};

  const subtitles: Record<string, string> = {
    planner: "شبکه مترو فعال",
    map: "نقشه شماتیک خطوط",
    status: "وضعیت شلوغی و اعلام تاخیر",
    history: "سفرها و آمار شما",
    alert: "بیدارباش هوشمند سفر",
    search: "جستجوی ایستگاه‌ها و امکانات",
    settings: "شخصی‌سازی متروجو",
    "line-detail": "جزئیات خط و ایستگاه‌ها",
    "station-detail": "جزئیات و امکانات ایستگاه",
  };

  const titles: Record<string, string> = {
    planner: "مسیریابی هوشمند سفر",
    map: "نقشه شبکه مترو",
    status: "وضعیت خطوط و تاخیرها",
    history: "تاریخچه فعالیت مسافر",
    alert: "هشدار و بیدارباش مقصد",
    search: "جستجوی ایستگاه‌ها",
    settings: "تنظیمات و اطلاعات برنامه",
  };

  return (
    <div className="min-h-screen flex flex-col bg-metro-bg">
      {/* هدرها */}
      {screen === "home" && <AppHeader onCityClick={() => setCityOpen(true)} />}
      {screen === "lines" && <AppHeader onCityClick={() => setCityOpen(true)} />}
      {screen !== "home" && screen !== "lines" && (
        <SubHeader
          title={
            screen === "line-detail"
              ? "جزئیات خط"
              : screen === "station-detail"
                ? "جزئیات ایستگاه"
                : titles[screen] ?? "متروجو"
          }
          subtitle={
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot inline-block" />
              {subtitles[screen] ?? ""}
            </>
          }
        />
      )}

      {/* محتوا */}
      <div key={`${screen}-${stack.length}`} className="flex-1 screen-in">
        {screen === "home" && <HomeScreen />}
        {screen === "lines" && <LinesScreen />}
        {screen === "search" && <SearchScreen />}
        {screen === "settings" && <SettingsScreen />}
        {screen === "planner" && (
          <PlannerScreen initialFrom={params.fromStationId} initialTo={params.toStationId} initialPref={params.pref} />
        )}
        {screen === "map" && (
          <MapScreen
            highlight={[params.fromStationId, params.toStationId].filter(Boolean) as string[]}
            onStationSelect={(id) => useMetro.getState().push({ name: "station-detail", params: { stationId: id } })}
          />
        )}
        {screen === "status" && <StatusScreen />}
        {screen === "history" && <HistoryScreen />}
        {screen === "alert" && <AlertScreen initialTo={params.toStationId} />}
        {screen === "line-detail" && params.lineId && <LineDetailScreen lineId={params.lineId} />}
        {screen === "station-detail" && params.stationId && <StationDetailScreen stationId={params.stationId} />}
      </div>

      {/* ناوبری پایین */}
      <BottomNav />
      <CityDrawer open={cityOpen} onClose={() => setCityOpen(false)} />

      {/* فوتر چسبان — برای صفحات کوتاه */}
      <footer className="mt-auto pb-24 pt-2 text-center">
        <p className="text-[9px] text-metro-outline-var">
          متروجو نسخه {toFa("2.4.0")} • ساخته شده برای مسافران مترو
        </p>
      </footer>
    </div>
  );
}
