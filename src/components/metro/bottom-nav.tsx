"use client";

import { useMetro, type ScreenName } from "@/lib/store";
import { MI } from "./ui";

/* قرص ناوبری شناور — بر اساس طراحی _۷:
   فقط ۳ مقصد، بدون دکمه شاخص مرکزی مسیریاب */
const TABS: { name: ScreenName; label: string; icon: string }[] = [
  { name: "home", label: "خانه", icon: "home" },
  { name: "lines", label: "خطوط و نقشه", icon: "map" },
  { name: "search", label: "ایستگاه‌ها", icon: "tram" },
];

export function BottomNav() {
  const stack = useMetro((s) => s.stack);
  const goTab = useMetro((s) => s.goTab);
  const active = stack[stack.length - 1]?.name;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <nav
        dir="rtl"
        aria-label="ناوبری اصلی"
        className="pointer-events-auto w-[90%] max-w-[360px] bg-white/90 backdrop-blur-md rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.12)] border border-slate-100 p-1.5 flex items-center justify-between"
      >
        {TABS.map((t) => (
          <TabButton key={t.name} tab={t} active={active === t.name} onClick={() => goTab(t.name)} />
        ))}
      </nav>
    </div>
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
      className={`flex items-center gap-1.5 rounded-full transition-all active:scale-95 ${
        active
          ? "bg-primary text-white px-4 py-2 font-bold text-sm shadow-sm"
          : "text-slate-600 px-3 py-2 font-medium text-sm transition-all hover:text-slate-900"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <MI name={tab.icon} size={20} fill={active} />
      <span className="hidden min-[360px]:inline whitespace-nowrap leading-none">{tab.label}</span>
    </button>
  );
}
