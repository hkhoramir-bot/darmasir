"use client";

import { useMetro, type ScreenName } from "@/lib/store";
import { MI } from "./ui";

const TABS: { name: ScreenName; label: string; icon: string }[] = [
  { name: "home", label: "خانه", icon: "home" },
  { name: "lines", label: "خطوط و نقشه", icon: "map" },
  { name: "search", label: "ایستگاه‌ها", icon: "directions_transit" },
  { name: "settings", label: "تنظیمات", icon: "settings" },
];

export function BottomNav() {
  const stack = useMetro((s) => s.stack);
  const goTab = useMetro((s) => s.goTab);
  const active = stack[stack.length - 1]?.name;

  return (
    <nav
      dir="rtl"
      aria-label="ناوبری اصلی"
      className="fixed bottom-4 inset-x-0 mx-auto w-[94%] max-w-[400px] bg-white/95 backdrop-blur-md rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.14)] border border-metro-outline-var/40 p-1.5 flex items-center justify-between z-50"
    >
      {TABS.slice(0, 2).map((t) => (
        <TabButton key={t.name} tab={t} active={active === t.name} onClick={() => goTab(t.name)} />
      ))}

      {/* دکمه شاخص مسیریاب */}
      <button
        onClick={() => goTab("planner")}
        aria-label="مسیریاب"
        className={`-mt-9 w-14 h-14 rounded-full flex flex-col items-center justify-center shrink-0 shadow-lg transition-all active:scale-95 ${
          active === "planner"
            ? "bg-metro-primary-c text-white"
            : "bg-metro-primary-c text-white hover:bg-metro-primary-c"
        }`}
      >
        <MI name="route" size={24} fill />
        <span className="text-[8px] font-bold mt-0.5">مسیریاب</span>
      </button>

      {TABS.slice(2).map((t) => (
        <TabButton key={t.name} tab={t} active={active === t.name} onClick={() => goTab(t.name)} />
      ))}
    </nav>
  );
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: { name: ScreenName; label: string; icon: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-2 rounded-full text-xs font-medium transition-all active:scale-95 ${
        active ? "bg-metro-fixed text-metro-primary font-bold" : "text-metro-onvar hover:text-metro-primary"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <MI name={tab.icon} size={19} fill={active} />
      <span className="hidden min-[380px]:inline whitespace-nowrap">{tab.label}</span>
    </button>
  );
}
