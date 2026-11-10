"use client";

import { useState, useEffect } from "react";
import { useMetro, nav } from "@/lib/store";
import { MI, AdBanner } from "../ui";
import { useAnnouncer } from "../voice";
import { toFa } from "@/lib/metro-data";

export default function SettingsScreen() {
  const city = useMetro((s) => s.city);
  const setCity = useMetro((s) => s.setCity);
  const [notifLines, setNotifLines] = useState(true);
  const [notifRoute, setNotifRoute] = useState(false);
  const [voiceHf, setVoiceHf] = useState(true);
  const [sensitivity, setSensitivity] = useState(70);
  const [voiceGender, setVoiceGender] = useState<"female" | "male">("female");
  const [gps, setGps] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark" | "auto">(() => {
    if (typeof window === "undefined") return "light";
    try {
      const saved = localStorage.getItem("metrojo-settings");
      const t = saved ? (JSON.parse(saved)?.theme as string) : null;
      return t === "dark" || t === "auto" ? t : "light";
    } catch {
      return "light";
    }
  });
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "ok">("idle");
  const { announce, speaking, stop } = useAnnouncer();

  useEffect(() => {
    localStorage.setItem("metrojo-settings", JSON.stringify({ theme, notifLines, gps }));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "auto" && mq.matches);
      document.documentElement.classList.toggle("dark", isDark);
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [theme, notifLines, gps]);

  const testVoice = () => {
    if (speaking) {
      stop();
      return;
    }
    announce(
      voiceGender === "female"
        ? "سلام! دستیار صوتی متروجو فعال است. ایستگاه بعدی: تئاتر شهر."
        : "سلام! دستیار صوتی متروجو فعال است. ایستگاه بعدی: تئاتر شهر.",
      voiceGender === "female" ? "tongtong" : "xiaochen"
    );
  };

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-4">
      <AdBanner text="تهیه بلیت آنلاین مترو و اتوبوس" />

      {/* هشدارها */}
      <section className="bg-metro-card rounded-2xl border border-metro-outline-var/30 p-3.5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-metro-outline-var/20">
          <div className="flex items-center gap-2 text-metro-primary">
            <MI name="notifications_active" size={20} />
            <h2 className="text-sm font-bold text-metro-onsurface">هشدارها و اعلانات</h2>
          </div>
          <span className="text-[10px] font-bold text-metro-tertiary bg-emerald-500/10 px-2 py-0.5 rounded-full">سیستم فعال</span>
        </div>
        <SettingToggle label="نوتیفیکیشن وضعیت خطوط و تاخیرها" value={notifLines} onChange={setNotifLines} />
        <div className="h-px bg-metro-c" />
        <SettingToggle label="هشدارهای اختصاصی مسیر من" value={notifRoute} onChange={setNotifRoute} />
        <div className="h-px bg-metro-c" />
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-xs font-medium text-metro-onsurface">بررسی آپدیت نرم‌افزار</p>
            <p className="text-[11px] text-metro-outline mt-0.5">نسخه نصب‌شده: {toFa("2.4.0")}</p>
          </div>
          <button
            onClick={() => {
              setUpdateState("checking");
              setTimeout(() => setUpdateState("ok"), 1200);
            }}
            className="px-3 py-1.5 bg-metro-c-low text-metro-primary rounded-lg text-[11px] font-bold border border-metro-outline-var/40 flex items-center gap-1 active:scale-95 transition-all"
          >
            <MI name={updateState === "checking" ? "sync" : updateState === "ok" ? "check_circle" : "sync"} size={15} className={updateState === "checking" ? "animate-spin" : ""} />
            {updateState === "checking" ? "بررسی..." : updateState === "ok" ? "به‌روز است" : "بررسی آپدیت"}
          </button>
        </div>
      </section>

      {/* دستیار صوتی */}
      <section className="bg-metro-card rounded-2xl border border-metro-outline-var/30 p-3.5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-metro-outline-var/20">
          <div className="flex items-center gap-2">
            <MI name="record_voice_over" size={20} className="text-metro-primary" />
            <h2 className="text-sm font-bold text-metro-onsurface">دستیار صوتی و صدا</h2>
          </div>
          <span className="text-[10px] font-bold text-metro-primary bg-metro-fixed/50 px-2 py-0.5 rounded-full">هوشمند</span>
        </div>
        <SettingToggle label="اعلام صوتی ایستگاه در هندزفری" value={voiceHf} onChange={setVoiceHf} />
        <div className="h-px bg-metro-c" />
        <div className="py-1 space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-xs font-medium text-metro-onsurface">حساسیت ورودی صدا و میکروفون</p>
            <span className="text-[11px] text-metro-primary font-bold">{toFa(sensitivity)}٪</span>
          </div>
          <div className="relative flex items-center">
            <MI name="mic_off" size={16} className="text-metro-outline-var ml-2" />
            <input
              type="range"
              min={0}
              max={100}
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              className="w-full h-1.5 bg-metro-c rounded-lg appearance-none cursor-pointer accent-[#0d58a6]"
              aria-label="حساسیت میکروفون"
            />
            <MI name="mic" size={16} className="text-metro-primary mr-2" />
          </div>
        </div>
        <div className="h-px bg-metro-c" />
        <div className="flex items-center justify-between py-1">
          <p className="text-xs font-medium text-metro-onsurface">گوینده صوتی دستیار</p>
          <div className="flex items-center p-0.5 bg-metro-c rounded-lg border border-metro-outline-var/30 text-[11px] font-bold">
            <button
              onClick={() => setVoiceGender("female")}
              className={`px-2.5 py-1 rounded-md transition-all ${voiceGender === "female" ? "bg-metro-card text-metro-primary shadow-sm" : "text-metro-onvar"}`}
            >
              خانم
            </button>
            <button
              onClick={() => setVoiceGender("male")}
              className={`px-2.5 py-1 rounded-md transition-all ${voiceGender === "male" ? "bg-metro-card text-metro-primary shadow-sm" : "text-metro-onvar"}`}
            >
              آقا
            </button>
          </div>
        </div>
        <button
          onClick={testVoice}
          className="w-full py-2 bg-metro-fixed/60 text-metro-primary rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <MI name={speaking ? "stop_circle" : "play_circle"} size={16} />
          {speaking ? "توقف پخش" : "تست اعلام صوتی دستیار"}
        </button>
      </section>

      {/* ظاهری */}
      <section className="bg-metro-card rounded-2xl border border-metro-outline-var/30 p-3.5 shadow-sm space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-metro-outline-var/20">
          <MI name="palette" size={20} className="text-metro-primary" />
          <h2 className="text-sm font-bold text-metro-onsurface">تنظیمات ظاهری و موقعیت</h2>
        </div>
        <div className="py-1 space-y-2">
          <p className="text-xs font-medium text-metro-onsurface">حالت تم نمایش</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "light", icon: "light_mode", label: "روشن (روز)" },
              { k: "dark", icon: "dark_mode", label: "تاریک (شب)" },
              { k: "auto", icon: "brightness_auto", label: "خودکار" },
            ].map((o) => (
              <button
                key={o.k}
                onClick={() => setTheme(o.k as typeof theme)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all active:scale-95 ${
                  theme === o.k ? "border-metro-primary-c bg-metro-fixed/40 text-metro-primary" : "border-metro-outline-var/30 bg-metro-card text-metro-onvar"
                }`}
              >
                <MI name={o.icon} size={20} />
                <span className="text-[10px] font-bold mt-1">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="h-px bg-metro-c" />
        <div className="flex items-center justify-between py-1">
          <p className="text-xs font-medium text-metro-onsurface">دسترسی مکانی و GPS (یافتن نزدیک‌ترین ایستگاه)</p>
          <button
            role="switch"
            aria-checked={gps}
            onClick={() => setGps((v) => !v)}
            className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${gps ? "bg-metro-primary-c" : "bg-metro-outline-var"}`}
          >
            <span className={`absolute top-[2px] w-5 h-5 bg-metro-card rounded-full shadow transition-all ${gps ? "right-[2px]" : "right-[22px]"}`} />
          </button>
        </div>
        <div className="h-px bg-metro-c" />
        <div className="flex items-center justify-between py-1">
          <p className="text-xs font-medium text-metro-onsurface">شبکه فعال</p>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value as typeof city)}
            className="bg-metro-c-low border border-metro-outline-var/40 rounded-xl px-3 py-1.5 text-xs text-metro-onsurface focus:outline-none"
          >
            <option value="tehran">تهران</option>
            <option value="karaj">کرج</option>
            <option value="mashhad">مشهد</option>
            <option value="isfahan">اصفهان</option>
          </select>
        </div>
      </section>

      {/* درباره */}
      <section className="bg-metro-card rounded-2xl border border-metro-outline-var/30 p-3.5 shadow-sm space-y-1">
        <div className="flex items-center gap-2 pb-2 mb-1 border-b border-metro-outline-var/20">
          <MI name="info" size={20} className="text-metro-primary" />
          <h2 className="text-sm font-bold text-metro-onsurface">درباره ما و خدمات پشتیبانی</h2>
        </div>
        <a
          className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-metro-c-low active:scale-[0.99] transition-all"
          href="https://metrojo.ir"
          target="_blank"
          rel="noreferrer"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-metro-c flex items-center justify-center p-0.5 overflow-hidden">
              { }
              <img src="/metrojo-symbol.png" alt="لوگوی متروجو" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <p className="text-xs font-medium text-metro-onsurface">درباره متروجو و سامانه هوشمند</p>
              <p className="text-[10px] text-metro-outline mt-0.5">سامانه ناوبری سریع ناوگان ریلی کلان‌شهرها</p>
            </div>
          </div>
          <MI name="chevron_left" size={18} className="text-metro-outline-var" />
        </a>
        <div className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-metro-c-low transition-all">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-metro-c flex items-center justify-center text-metro-primary">
              <MI name="support_agent" size={17} />
            </div>
            <p className="text-xs font-medium text-metro-onsurface">تماس با پشتیبانی ۲۴ ساعته</p>
          </div>
          <a
            className="text-[11px] text-metro-primary font-bold dir-ltr bg-metro-fixed/40 px-2 py-1 rounded-md"
            href="tel:02191000000"
          >
            ۰۲۱-۹۱۰۰۰۰۰۰
          </a>
        </div>
        <a
          className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-metro-c-low active:scale-[0.99] transition-all"
          href="mailto:info@metrojo.ir"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-metro-c flex items-center justify-center text-metro-primary">
              <MI name="language" size={17} />
            </div>
            <div>
              <p className="text-xs font-medium text-metro-onsurface">وب‌سایت و ایمیل پشتیبانی</p>
              <p className="text-[10px] text-metro-outline mt-0.5 dir-ltr">info@metrojo.ir | metrojo.ir</p>
            </div>
          </div>
          <MI name="open_in_new" size={18} className="text-metro-outline-var" />
        </a>
        <button
          onClick={() => nav.go("history")}
          className="w-full flex items-center justify-between py-2.5 px-1 rounded-lg bg-metro-c-low/60 hover:bg-metro-c active:scale-[0.99] transition-all mt-1"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-metro-c-highest flex items-center justify-center text-metro-primary">
              <MI name="history" size={17} />
            </div>
            <p className="text-xs font-medium text-metro-onsurface">تاریخچه فعالیت مسافر</p>
          </div>
          <MI name="chevron_left" size={18} className="text-metro-primary" />
        </button>
      </section>

      <div className="text-center pt-2 pb-4 space-y-1">
        <p className="text-[11px] text-metro-outline">طراحی شده برای ناوبری سریع در ناوگان ریلی کلان‌شهرها</p>
        <p className="text-[10px] text-metro-outline-var font-medium">تمامی حقوق برای سامانه متروجو محفوظ است © ۱۴۰۳</p>
      </div>
    </main>
  );
}

function SettingToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <p className="text-xs font-medium text-metro-onsurface">{label}</p>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${value ? "bg-metro-primary-c" : "bg-metro-outline-var"}`}
      >
        <span className={`absolute top-[2px] w-5 h-5 bg-metro-card rounded-full shadow transition-all ${value ? "right-[2px]" : "right-[22px]"}`} />
      </button>
    </div>
  );
}
