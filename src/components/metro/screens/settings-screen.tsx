"use client";

import { useState, useEffect } from "react";
import { useMetro, nav } from "@/lib/store";
import { MI } from "../ui";
import { useAnnouncer } from "../voice";
import { ApkDownloadCard } from "../apk-download";
import { useVoicePrefs } from "@/lib/voice-settings";
import { toFa } from "@/lib/metro-data";

/* ============================================================
   صفحه تنظیمات و اطلاعات برنامه — بازچینش بر اساس طرح stitch_/_1
   بخش‌ها: آگهی، هشدارها و اعلانات (و آپدیت/APK)، دستیار صوتی و صدا،
   تنظیمات ظاهری و موقعیت (تم/GPS/شهر)، درباره ما و خدمات پشتیبانی
   ============================================================ */

export default function SettingsScreen() {
  const city = useMetro((s) => s.city);
  const setCity = useMetro((s) => s.setCity);
  const [notifLines, setNotifLines] = useState(true);
  const [notifRoute, setNotifRoute] = useState(false);
  const [voiceHf, setVoiceHf] = useState(true);
  const [sensitivity, setSensitivity] = useState(70);
  const [gps, setGps] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const v = localStorage.getItem("mj-gps-enabled");
      if (v !== null) return v === "true";
      const saved = localStorage.getItem("metrojo-settings");
      return saved ? JSON.parse(saved)?.gps !== false : true;
    } catch {
      return true;
    }
  });
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

  /* گوینده صوتی — ذخیره‌شده روی دستگاه و مشترک با کل دستیار */
  const voiceGender = useVoicePrefs((s) => s.gender);
  const setVoiceGender = useVoicePrefs((s) => s.setGender);

  /* hydrate ترجیحات صوتی از حافظه دستگاه */
  useEffect(() => {
    useVoicePrefs.getState().hydrate();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("metrojo-settings", JSON.stringify({ theme, notifLines, gps }));
      localStorage.setItem("mj-gps-enabled", String(gps));
    } catch {
      /* حافظه در دسترس نیست */
    }
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
    announce("سلام! دستیار صوتی درمسیر فعال است. ایستگاه بعدی: تئاتر شهر.");
  };

  const sensitivityLabel = sensitivity <= 33 ? "کم" : sensitivity <= 66 ? "متوسط" : "زیاد";

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-4">
      {/* کادر آگهی — طرح بخش ۱ */}
      <section
        aria-label="آگهی"
        className="w-full bg-metro-c-low rounded-2xl border border-metro-outline-var/40 p-3 flex items-center justify-between shadow-sm relative overflow-hidden"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-lg bg-metro-c-highest flex items-center justify-center text-metro-primary shrink-0">
            <MI name="campaign" size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold bg-metro-outline-var/50 text-metro-onvar px-1.5 py-0.5 rounded shrink-0">
                آگهی
              </span>
              <p className="text-xs font-bold text-metro-onsurface truncate">
                تهیه بلیت آنلاین مترو و اتوبوس
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label="مشاهده آگهی"
          className="bg-metro-primary-c text-metro-onprimary px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all shrink-0"
        >
          مشاهده
          <MI name="chevron_left" size={14} />
        </button>
      </section>

      {/* بخش هشدارها و اعلانات */}
      <section className="bg-metro-card rounded-2xl border border-metro-outline-var/30 p-3.5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-metro-outline-var/20">
          <div className="flex items-center gap-2 text-metro-primary">
            <MI name="notifications_active" size={20} />
            <h2 className="text-sm font-bold text-metro-onsurface">بخش هشدارها و اعلانات</h2>
          </div>
          <span className="text-[10px] font-bold text-metro-tertiary bg-metro-tertiary-fixed/30 px-2 py-0.5 rounded-full">
            سیستم فعال
          </span>
        </div>
        <SettingToggle
          label="اعلان وضعیت خطوط و تاخیرها"
          subtitle="گزارش لحظه‌ای از تاخیرها و توقف حرکت قطارها"
          value={notifLines}
          onChange={setNotifLines}
        />
        <div className="h-px bg-metro-c" />
        <SettingToggle
          label="هشدارهای اختصاصی مسیر من"
          subtitle="آگاه‌سازی نزدیک شدن به ایستگاه مقصد و تعویض خط"
          value={notifRoute}
          onChange={setNotifRoute}
        />
        <div className="h-px bg-metro-c" />
        <div className="flex items-center justify-between py-1 gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-metro-onsurface">بررسی آپدیت نرم‌افزار</p>
            <p className="text-[10px] text-metro-outline mt-0.5">
              نسخه نصب‌شده: {toFa("4.8.23")} (آخرین تغییرات خطوط)
            </p>
          </div>
          <button
            onClick={() => {
              setUpdateState("checking");
              setTimeout(() => setUpdateState("ok"), 1200);
            }}
            className="px-3 py-1.5 bg-metro-c-low text-metro-primary rounded-lg text-[11px] font-bold border border-metro-outline-var/40 flex items-center gap-1 active:scale-95 transition-all shrink-0"
          >
            <MI
              name="sync"
              size={15}
              className={updateState === "checking" ? "animate-spin" : ""}
            />
            {updateState === "checking" ? "بررسی..." : updateState === "ok" ? "به‌روز است" : "بررسی آپدیت"}
          </button>
        </div>
      </section>

      {/* دانلود مستقیم APK — سازوکار به‌روزرسانی برنامه */}
      <ApkDownloadCard />

      {/* دستیار صوتی و صدا */}
      <section className="bg-metro-card rounded-2xl border border-metro-outline-var/30 p-3.5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-metro-outline-var/20">
          <div className="flex items-center gap-2 text-metro-primary">
            <MI name="record_voice_over" size={20} />
            <h2 className="text-sm font-bold text-metro-onsurface">دستیار صوتی و صدا</h2>
          </div>
          <span className="text-[10px] font-bold text-metro-primary bg-metro-fixed/50 px-2 py-0.5 rounded-full">
            هوشمند
          </span>
        </div>
        <SettingToggle
          label="اعلام صوتی ایستگاه در هندزفری"
          subtitle="پخش نام ایستگاه ۱۵ دقیقه قبل از ورود قطار"
          value={voiceHf}
          onChange={setVoiceHf}
        />
        <div className="h-px bg-metro-c" />
        <div className="py-1 space-y-2">
          <div className="flex justify-between items-center gap-2">
            <p className="text-xs font-medium text-metro-onsurface">حساسیت ورودی صدا و میکروفون</p>
            <span className="text-[10px] font-bold text-metro-primary bg-metro-fixed/50 px-2 py-0.5 rounded-full shrink-0">
              {sensitivityLabel} ({toFa(sensitivity)}٪)
            </span>
          </div>
          <div className="relative flex items-center">
            <MI name="mic_off" size={16} className="text-metro-outline-var ml-2" />
            <input
              type="range"
              min={0}
              max={100}
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              className="w-full h-1.5 bg-metro-c rounded-lg appearance-none cursor-pointer accent-metro-primary-c"
              aria-label="حساسیت ورودی صدا و میکروفون"
            />
            <MI name="mic" size={16} className="text-metro-primary mr-2" />
          </div>
        </div>
        <div className="h-px bg-metro-c" />
        <div className="flex items-center justify-between py-1 gap-3">
          <p className="text-xs font-medium text-metro-onsurface">گوینده صوتی دستیار</p>
          <div className="flex items-center p-0.5 bg-metro-c rounded-lg border border-metro-outline-var/30 text-[11px] font-bold shrink-0">
            <button
              onClick={() => setVoiceGender("female")}
              aria-pressed={voiceGender === "female"}
              aria-label="انتخاب گوینده خانم"
              className={`px-2.5 py-1 rounded-md transition-all ${
                voiceGender === "female" ? "bg-metro-card text-metro-primary shadow-sm" : "text-metro-onvar"
              }`}
            >
              خانم
            </button>
            <button
              onClick={() => setVoiceGender("male")}
              aria-pressed={voiceGender === "male"}
              aria-label="انتخاب گوینده آقا"
              className={`px-2.5 py-1 rounded-md transition-all ${
                voiceGender === "male" ? "bg-metro-card text-metro-primary shadow-sm" : "text-metro-onvar"
              }`}
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

      {/* تنظیمات ظاهری و موقعیت */}
      <section className="bg-metro-card rounded-2xl border border-metro-outline-var/30 p-3.5 shadow-sm space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-metro-outline-var/20 text-metro-primary">
          <MI name="palette" size={20} />
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
                aria-pressed={theme === o.k}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all active:scale-95 ${
                  theme === o.k
                    ? "border-transparent ring-2 ring-metro-primary bg-metro-c-low text-metro-primary"
                    : "border-metro-outline-var/30 bg-metro-card text-metro-onvar"
                }`}
              >
                <MI name={o.icon} size={20} />
                <span className="text-[10px] font-bold mt-1">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="h-px bg-metro-c" />
        <SettingToggle
          label="دسترسی مکان و GPS"
          subtitle="تشخیص خودکار نزدیک‌ترین ایستگاه به شما"
          value={gps}
          onChange={(v) => setGps(v)}
        />
        <div className="h-px bg-metro-c" />
        <div className="flex items-center justify-between py-1 gap-3">
          <p className="text-xs font-medium text-metro-onsurface">شهر پیش‌فرض</p>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value as typeof city)}
            aria-label="شهر پیش‌فرض"
            className="bg-metro-c-low border border-metro-outline-var/40 rounded-xl px-3 py-1.5 text-xs text-metro-onsurface focus:outline-none shrink-0"
          >
            <option value="tehran">تهران</option>
            <option value="karaj">کرج</option>
            <option value="mashhad">مشهد</option>
            <option value="isfahan">اصفهان</option>
          </select>
        </div>
      </section>

      {/* درباره ما و خدمات پشتیبانی */}
      <section className="bg-metro-card rounded-2xl border border-metro-outline-var/30 p-3.5 shadow-sm space-y-1">
        <div className="flex items-center gap-2 pb-2 mb-1 border-b border-metro-outline-var/20">
          <MI name="info" size={20} className="text-metro-primary" />
          <h2 className="text-sm font-bold text-metro-onsurface">درباره ما و خدمات پشتیبانی</h2>
        </div>
        {/* سایر خدمات محصولات شهری — ردیف نمایشی */}
        <div className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-metro-c-low transition-all">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-metro-c flex items-center justify-center text-metro-primary shrink-0">
              <MI name="apps" size={17} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-metro-onsurface">خدمات محصولات شهری ما</p>
              <p className="text-[10px] text-metro-outline mt-0.5 truncate">
                آپدیت‌بار، تاکسی‌بار و نقشه جامع تهران
              </p>
            </div>
          </div>
          <MI name="chevron_left" size={18} className="text-metro-outline-var shrink-0" />
        </div>
        <a
          className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-metro-c-low active:scale-[0.99] transition-all"
          href="https://metrojo.ir"
          target="_blank"
          rel="noreferrer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-metro-c flex items-center justify-center p-0.5 overflow-hidden shrink-0">
              <img src="/darmasir-symbol.png" alt="لوگوی درمسیر" className="w-7 h-7 object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-metro-onsurface">درباره درمسیر و سامانه هوشمند</p>
              <p className="text-[10px] text-metro-outline mt-0.5 truncate">
                سامانه ناوبری سریع ناوگان ریلی کلان‌شهرها
              </p>
            </div>
          </div>
          <MI name="chevron_left" size={18} className="text-metro-outline-var shrink-0" />
        </a>
        <div className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-metro-c-low transition-all gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-metro-c flex items-center justify-center text-metro-primary shrink-0">
              <MI name="support_agent" size={17} />
            </div>
            <p className="text-xs font-medium text-metro-onsurface">تماس با پشتیبانی ۲۴ ساعته</p>
          </div>
          <a
            className="text-[11px] text-metro-primary font-bold dir-ltr bg-metro-fixed/40 px-2 py-1 rounded-md shrink-0"
            href="tel:02191000000"
          >
            ۰۲۱-۹۱۰۰۰۰۰۰
          </a>
        </div>
        <a
          className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-metro-c-low active:scale-[0.99] transition-all gap-3"
          href="mailto:info@metrojo.ir"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-metro-c flex items-center justify-center text-metro-primary shrink-0">
              <MI name="language" size={17} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-metro-onsurface">وب‌سایت و ایمیل پشتیبانی</p>
              <p className="text-[10px] text-metro-outline mt-0.5 dir-ltr">info@metrojo.ir | metrojo.ir</p>
            </div>
          </div>
          <MI name="open_in_new" size={18} className="text-metro-outline-var shrink-0" />
        </a>
        <button
          onClick={() => nav.go("history")}
          className="w-full flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-metro-c-low active:scale-[0.99] transition-all gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-metro-c flex items-center justify-center text-metro-primary shrink-0">
              <MI name="history" size={17} />
            </div>
            <p className="text-xs font-medium text-metro-onsurface">تاریخچه فعالیت مسافر</p>
          </div>
          <MI name="chevron_left" size={18} className="text-metro-outline-var shrink-0" />
        </button>
        {/* درخواست تبلیغات — ردیف نمایشی برجسته */}
        <div className="w-full flex items-center justify-between py-2.5 px-1 rounded-lg bg-metro-c-low/60 hover:bg-metro-c transition-all mt-1 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-metro-c-highest flex items-center justify-center text-metro-primary shrink-0">
              <MI name="add_business" size={17} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-metro-onsurface">درخواست تبلیغات در برنامه</p>
              <p className="text-[10px] text-metro-outline mt-0.5 truncate">
                فرصت‌های تبلیغاتی در ایستگاه‌ها و مسیرهای خطوط
              </p>
            </div>
          </div>
          <MI name="chevron_left" size={18} className="text-metro-primary shrink-0" />
        </div>
      </section>

      <div className="text-center pt-2 pb-4 space-y-1">
        <p className="text-[11px] text-metro-outline">
          طراحی شده برای مسیریابی سریع در بافت ریلی کلان‌شهرها
        </p>
        <p className="text-[10px] text-metro-outline-var font-medium">
          تمامی حقوق برای سامانه مترویار محفوظ است © ۱۴۰۴
        </p>
      </div>
    </main>
  );
}

function SettingToggle({
  label,
  subtitle,
  value,
  onChange,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1 gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-metro-onsurface">{label}</p>
        {subtitle && <p className="text-[10px] text-metro-outline mt-0.5">{subtitle}</p>}
      </div>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
          value ? "bg-metro-primary-c" : "bg-metro-outline-var"
        }`}
      >
        <span
          className={`absolute top-[2px] w-5 h-5 bg-metro-card rounded-full shadow transition-all ${
            value ? "right-[2px]" : "right-[22px]"
          }`}
        />
      </button>
    </div>
  );
}
