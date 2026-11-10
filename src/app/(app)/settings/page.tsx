"use client";

import { useEffect, useState } from "react";
import { MI, PageHeader, useInitCity, useShell, type ShellCity } from "@/components/metro/shell";
import { useAnnouncer } from "@/components/metro/voice";
import { useToast } from "@/hooks/use-toast";
import { toFa } from "@/lib/metro-data";

/* ============================================================
   تنظیمات و اطلاعات برنامه — متروجو
   ============================================================ */

interface MetrojoSettings {
  trainAlerts: boolean;
  wakeAlarm: boolean;
  lowPowerMap: boolean;
}

const SETTINGS_KEY = "metrojo-settings";
const DEFAULT_SETTINGS: MetrojoSettings = {
  trainAlerts: true,
  wakeAlarm: true,
  lowPowerMap: false,
};

const AVAILABLE_CITIES: { id: ShellCity; name: string }[] = [
  { id: "tehran", name: "تهران" },
  { id: "mashhad", name: "مشهد" },
  { id: "isfahan", name: "اصفهان" },
];

const SOON_CITIES = ["شیراز", "تبریز"];

/* ------------------------------ کلید تعویض ------------------------------ */
function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`w-10 h-6 rounded-full relative shrink-0 transition-all active:scale-95 ${
        on ? "bg-primary" : "bg-surface-container-high border border-outline-variant/40"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${
          on ? "left-0.5" : "right-0.5"
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const city = useShell((s) => s.city);
  const setCity = useShell((s) => s.setCity);
  useInitCity();
  const announcer = useAnnouncer();

  const [settings, setSettings] = useState<MetrojoSettings>(DEFAULT_SETTINGS);

  /* بازیابی تنظیمات ذخیره‌شده (یک‌بار، خارج از چرخه رندر) */
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as Partial<MetrojoSettings>;
          setSettings((s) => ({ ...s, ...parsed }));
        }
      } catch {}
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);

  const updateSetting = (key: keyof MetrojoSettings) => {
    setSettings((s) => {
      const next = { ...s, [key]: !s[key] };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const pickCity = (c: ShellCity, name: string) => {
    if (c === city) return;
    setCity(c);
    toast({ title: "شهر پیش‌فرض ذخیره شد", description: `شبکه مترو ${name} بارگذاری می‌شود` });
  };

  const testVoice = () => {
    if (announcer.speaking) {
      announcer.stop();
      return;
    }
    announcer.announce("دستیار صوتی متروجو آماده است").catch(() => {});
  };

  const cityName = city === "tehran" ? "تهران" : city === "mashhad" ? "مشهد" : "اصفهان";

  return (
    <>
      <PageHeader title="تنظیمات و اطلاعات برنامه" />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        {/* ---------------- شهر پیش‌فرض ---------------- */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <MI name="location_on" size={20} className="text-primary" />
            <h3 className="font-bold text-xs text-on-surface">شهر پیش‌فرض</h3>
            <span className="mr-auto text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">
              {cityName}
            </span>
          </div>
          <div className="flex items-center flex-wrap gap-1.5">
            {AVAILABLE_CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCity(c.id, c.name)}
                aria-pressed={city === c.id}
                className={`px-4 py-2 rounded-full text-xs font-bold border active:scale-95 transition-all ${
                  city === c.id
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:bg-surface-container"
                }`}
              >
                {c.name}
              </button>
            ))}
            {SOON_CITIES.map((name) => (
              <span
                key={name}
                className="px-4 py-2 rounded-full text-xs font-medium text-outline/60 border border-outline-variant/30 cursor-not-allowed select-none"
                title="به‌زودی"
              >
                {name}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-outline">شهر انتخابی پس از بازگشایی برنامه حفظ می‌شود</p>
        </section>

        {/* ---------------- ترجیحات ---------------- */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <MI name="tune" size={20} className="text-primary" />
            <h3 className="font-bold text-xs text-on-surface">ترجیحات</h3>
          </div>
          <div className="divide-y divide-outline-variant/30">
            <div className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <MI name="train" size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-on-surface">اعلان‌های حرکت قطار</p>
                  <p className="text-[10px] text-outline mt-0.5">اطلاع‌رسانی نزدیک‌شدن قطار به سکو</p>
                </div>
              </div>
              <Toggle
                on={settings.trainAlerts}
                onToggle={() => updateSetting("trainAlerts")}
                label="اعلان‌های حرکت قطار"
              />
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-tertiary-fixed/50 text-tertiary flex items-center justify-center shrink-0">
                  <MI name="alarm" size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-on-surface">هشدار بیدارباش</p>
                  <p className="text-[10px] text-outline mt-0.5">بیدارشدن پیش از رسیدن به ایستگاه مقصد</p>
                </div>
              </div>
              <Toggle
                on={settings.wakeAlarm}
                onToggle={() => updateSetting("wakeAlarm")}
                label="هشدار بیدارباش"
              />
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-surface-container text-on-surface-variant flex items-center justify-center shrink-0">
                  <MI name="battery_saver" size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-on-surface">حالت کم‌مصرف نقشه</p>
                  <p className="text-[10px] text-outline mt-0.5">کاهش انیمیشن برای صرفه‌جویی در باتری</p>
                </div>
              </div>
              <Toggle
                on={settings.lowPowerMap}
                onToggle={() => updateSetting("lowPowerMap")}
                label="حالت کم‌مصرف نقشه"
              />
            </div>
          </div>
        </section>

        {/* ---------------- دستیار صوتی ---------------- */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <MI name="graphic_eq" size={20} className="text-primary" />
            <h3 className="font-bold text-xs text-on-surface">دستیار صوتی</h3>
          </div>
          <button
            type="button"
            onClick={testVoice}
            className="w-full flex items-center justify-center gap-1.5 bg-primary-container text-white rounded-xl font-bold text-xs py-2.5 shadow-sm active:scale-[0.98] transition-all"
          >
            {announcer.speaking ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                در حال پخش... (لمس برای توقف)
              </>
            ) : (
              <>
                <MI name="volume_up" size={16} />
                آزمایش دستیار صوتی
              </>
            )}
          </button>
          <div className="bg-surface-container-low p-2.5 rounded-xl text-xs flex items-center gap-2">
            <MI name="graphic_eq" size={18} className="text-secondary shrink-0" />
            <span className="text-on-surface-variant">
              دستیار هوشمند صوتی آماده دریافت فرامین است.
            </span>
          </div>
          {announcer.error && (
            <p className="text-[10px] text-error font-medium flex items-center gap-1">
              <MI name="error" size={12} />
              {announcer.error}
            </p>
          )}
        </section>

        {/* ---------------- درباره برنامه ---------------- */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <MI name="info" size={20} className="text-primary" />
            <h3 className="font-bold text-xs text-on-surface">درباره برنامه</h3>
          </div>
          <div className="divide-y divide-outline-variant/30">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-on-surface-variant">نسخه نرم‌افزار</span>
              <span className="text-xs font-bold text-on-surface">{toFa("4.8.2")} (پایدار)</span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-on-surface-variant">وضعیت سرویس</span>
              <span className="text-xs font-bold text-tertiary flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                آنلاین
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-on-surface-variant">طراحی</span>
              <span className="text-xs font-bold text-on-surface">Material Design 3 — Metro Yar</span>
            </div>
          </div>
        </section>

        <p className="text-center text-[10px] text-outline-variant pt-1">
          متروجو — دستیار صوتی و ناوبری مترو
        </p>
      </main>
    </>
  );
}
