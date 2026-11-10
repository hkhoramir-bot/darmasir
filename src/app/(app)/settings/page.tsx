"use client";

import { useEffect, useState } from "react";
import { MI, PageHeader, useInitCity, useShell, type ShellCity } from "@/components/metro/shell";
import { useAnnouncer, findFaVoice, resetFaVoiceCache } from "@/components/metro/voice";
import { useToast } from "@/hooks/use-toast";
import { toFa } from "@/lib/metro-data";
import { useVoicePrefs, type VoiceEngine } from "@/lib/voice-settings";

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

const ENGINE_OPTIONS: { id: VoiceEngine; label: string; hint: string }[] = [
  { id: "auto", label: "خودکار", hint: "ابتدا صدای فارسی دستگاه، در نبود آن صدای ابری Gemini" },
  { id: "device", label: "صدای دستگاه", hint: "گوگل TTS فارسی — رایگان، سریع و بدون نیاز به کلید" },
  { id: "gemini", label: "صدای Gemini", hint: "کیفیت بالاتر — نیازمند کلید رایگان Gemini و اینترنت" },
];

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

  /* ---------- تنظیمات صوتی ---------- */
  const prefs = useVoicePrefs();
  const [deviceVoice, setDeviceVoice] = useState<"checking" | "found" | "missing">("checking");
  const [showKey, setShowKey] = useState(false);

  /* hydrate ترجیحات صوتی از حافظه دستگاه */
  useEffect(() => {
    useVoicePrefs.getState().hydrate();
  }, []);

  /* بررسی وجود صدای فارسی روی دستگاه (لیست صداها به‌صورت ناهمزمان می‌آید) */
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      const t0 = setTimeout(() => setDeviceVoice("missing"), 0);
      return () => clearTimeout(t0);
    }
    const check = () => {
      resetFaVoiceCache();
      setDeviceVoice(findFaVoice() ? "found" : "missing");
    };
    check();
    window.speechSynthesis.onvoiceschanged = check;
    const t = window.setTimeout(check, 900);
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.clearTimeout(t);
    };
  }, []);

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

        {/* ---------------- دستیار صوتی فارسی ---------------- */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <MI name="graphic_eq" size={20} className="text-primary" />
            <h3 className="font-bold text-xs text-on-surface">دستیار صوتی فارسی</h3>
            <span
              className={`mr-auto text-[10px] font-bold rounded-full px-2 py-0.5 ${
                deviceVoice === "found"
                  ? "text-tertiary bg-tertiary-fixed/40"
                  : deviceVoice === "missing"
                    ? "text-secondary bg-secondary-fixed/40"
                    : "text-outline bg-surface-container"
              }`}
            >
              {deviceVoice === "found"
                ? "صدای فارسی دستگاه فعال"
                : deviceVoice === "missing"
                  ? "صدای فارسی دستگاه یافت نشد"
                  : "در بررسی صدا..."}
            </span>
          </div>
          <p className="text-[10px] text-outline leading-relaxed">
            اعلام «ایستگاه بعدی» و جستجوی صوتی کاملاً به زبان فارسی است. موتور گفتار را انتخاب کنید؛
            تنظیمات فقط روی همین دستگاه ذخیره می‌شود.
          </p>

          {/* انتخاب موتور گفتار */}
          <div className="grid grid-cols-3 gap-1 bg-surface-container-low rounded-xl p-1">
            {ENGINE_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => prefs.setEngine(o.id)}
                aria-pressed={prefs.engine === o.id}
                className={`rounded-lg py-2 text-[11px] font-bold transition-all active:scale-95 ${
                  prefs.engine === o.id
                    ? "bg-primary text-white shadow-sm"
                    : "text-on-surface-variant"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-on-surface-variant">
            {ENGINE_OPTIONS.find((o) => o.id === prefs.engine)?.hint}
          </p>

          {/* کلید Gemini */}
          <div className="space-y-1.5">
            <label
              htmlFor="gemini-key"
              className="text-[11px] font-bold text-on-surface-variant flex items-center gap-1"
            >
              <MI name="key" size={14} />
              کلید API جمینای (اختیاری)
            </label>
            <div className="flex items-center gap-1.5 bg-surface-container-low rounded-xl px-3 border border-outline-variant/30 focus-within:border-primary/60 transition-colors">
              <input
                id="gemini-key"
                type={showKey ? "text" : "password"}
                dir="ltr"
                inputMode="text"
                autoComplete="off"
                value={prefs.geminiKey}
                onChange={(e) => prefs.setGeminiKey(e.target.value.trim())}
                placeholder="AIza..."
                className="flex-1 min-w-0 bg-transparent py-2.5 text-xs text-on-surface outline-none placeholder:text-outline/50"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? "پنهان‌کردن کلید" : "نمایش کلید"}
                className="shrink-0 p-1"
              >
                <MI name={showKey ? "visibility_off" : "visibility"} size={16} className="text-outline" />
              </button>
            </div>
            <p className="text-[10px] text-outline leading-relaxed">
              کلید رایگان از <span dir="ltr" className="font-bold text-primary">aistudio.google.com/apikey</span> —
              با کلید جمینای، اعلام صوتی و جستجوی صوتی فارسی دقیق‌تر می‌شود.
            </p>
          </div>

          {/* سرعت گفتار */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="voice-rate" className="text-[11px] font-bold text-on-surface-variant">
                سرعت گفتار
              </label>
              <span className="text-[11px] font-bold text-primary">{toFa(prefs.rate.toFixed(1))}×</span>
            </div>
            <input
              id="voice-rate"
              type="range"
              min={0.6}
              max={1.5}
              step={0.1}
              value={prefs.rate}
              onChange={(e) => prefs.setRate(Number(e.target.value))}
              className="w-full accent-primary"
              aria-label="سرعت گفتار"
            />
            <div className="flex justify-between text-[9px] text-outline">
              <span>آهسته {toFa("0.6")}×</span>
              <span>عادی {toFa("1")}×</span>
              <span>{toFa("1.5")}× تند</span>
            </div>
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
                آزمایش صدای فارسی
              </>
            )}
          </button>
          {announcer.error && (
            <p className="text-[10px] text-error font-medium flex items-start gap-1">
              <MI name="error" size={12} className="shrink-0 mt-0.5" />
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
