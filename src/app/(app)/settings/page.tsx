"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MI, PageHeader } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";
import { toFa } from "@/lib/metro-data";
import { useVoicePrefs } from "@/lib/voice-settings";

/* ============================================================
   تنظیمات و اطلاعات برنامه — متروجو
   بازطراحی دقیقاً بر اساس طرح _1/code.html
   ============================================================ */

const APP_VERSION = "4.8.16";
const APK_HREF = "/metrojo-4.8.16.apk";

/* ------------------- کلیدهای ذخیره‌سازی روی دستگاه ------------------- */
const NOTIFY_LINES_KEY = "metrojo-notify-lines";
const NOTIFY_ROUTE_KEY = "metrojo-notify-route";
const MIC_GAIN_KEY = "metrojo-mic-gain";
const GPS_KEY = "mj-gps-enabled"; // کلیدی که نقشه می‌خواند («false» یعنی خاموش)
const GPS_KEY_ALT = "metrojo-gps";
const VOICE_BG_KEY = "metrojo-voice-bg";

/* ------------------------------ تم برنامه ------------------------------ */
type ThemeChoice = "light" | "dark" | "system";

/* تشخیص hydrate شدن بدون setState داخل اثر (الگوی استاندارد React) */
const subscribeNoop = () => () => {};

const THEME_OPTIONS: { id: ThemeChoice; label: string; icon: string }[] = [
  { id: "light", label: "روشن (روز)", icon: "light_mode" },
  { id: "dark", label: "تاریک (شب)", icon: "dark_mode" },
  { id: "system", label: "خودکار", icon: "brightness_auto" },
];

/* ------------------- کلید تعویض (الگوی طراحی _1) ------------------- */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container" />
    </label>
  );
}

/* برچسب حساسیت میکروفن — مقدار ۷۰ پیش‌فرض یعنی «متوسط» */
function gainLabel(v: number): string {
  return v < 40 ? "کم" : v < 80 ? "متوسط" : "زیاد";
}

export default function SettingsPage() {
  const { toast } = useToast();

  /* ---------- تم برنامه (روشن/تاریک/دستگاه) ---------- */
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
  const activeTheme: ThemeChoice = mounted && theme ? (theme as ThemeChoice) : "system";

  /* ---------- ترجیحات صوتی (گوینده زن/مرد) ---------- */
  const prefs = useVoicePrefs();

  /* ---------- وضعیت‌های قابل ذخیره ---------- */
  const [flags, setFlags] = useState({
    notifyLines: true, // نزدیک‌شدن وضعیت خطوط و تاخیرها
    notifyRoute: false, // هشدارهای اختصاصی مسیر من
    gps: true, // دسترسی مکانی و GPS
    voiceBg: true, // اعلام صوتی ایستگاه در پس‌زمینه
  });
  const [micGain, setMicGain] = useState(70);

  /* ---------- بررسی به‌روزرسانی ---------- */
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "done">("idle");

  /* ---------- مودال درباره متروجو ---------- */
  const [aboutOpen, setAboutOpen] = useState(false);

  /* ---------- نسخه اندروید (در خود اپ نیتیو مخفی می‌شود) ---------- */
  const [isNative, setIsNative] = useState(false);

  /* بازیابی تنظیمات ذخیره‌شده (یک‌بار، خارج از چرخه رندر) */
  useEffect(() => {
    const id = window.setTimeout(() => {
      useVoicePrefs.getState().hydrate();
      try {
        const w = window as unknown as { Capacitor?: unknown };
        setIsNative(!!w.Capacitor);
        const lines = localStorage.getItem(NOTIFY_LINES_KEY);
        const route = localStorage.getItem(NOTIFY_ROUTE_KEY);
        const gps = localStorage.getItem(GPS_KEY) ?? localStorage.getItem(GPS_KEY_ALT);
        const vbg = localStorage.getItem(VOICE_BG_KEY);
        const gain = localStorage.getItem(MIC_GAIN_KEY);
        setFlags((f) => ({
          notifyLines: lines === null ? f.notifyLines : lines === "true",
          notifyRoute: route === null ? f.notifyRoute : route === "true",
          gps: gps === null ? f.gps : gps !== "false",
          voiceBg: vbg === null ? f.voiceBg : vbg === "true",
        }));
        if (gain !== null) {
          const n = Number(gain);
          if (Number.isFinite(n)) setMicGain(Math.min(100, Math.max(0, Math.round(n))));
        }
      } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const setFlag = (key: keyof typeof flags, value: boolean) => {
    setFlags((f) => ({ ...f, [key]: value }));
    try {
      if (key === "notifyLines") localStorage.setItem(NOTIFY_LINES_KEY, String(value));
      else if (key === "notifyRoute") localStorage.setItem(NOTIFY_ROUTE_KEY, String(value));
      else if (key === "gps") {
        // نقشه «mj-gps-enabled» را می‌خواند؛ هم‌زمان کلید نامی هم ذخیره می‌شود
        localStorage.setItem(GPS_KEY, value ? "true" : "false");
        localStorage.setItem(GPS_KEY_ALT, String(value));
      } else if (key === "voiceBg") localStorage.setItem(VOICE_BG_KEY, String(value));
    } catch {}
  };

  const onGainChange = (v: number) => {
    setMicGain(v);
    try {
      localStorage.setItem(MIC_GAIN_KEY, String(v));
    } catch {}
  };

  const checkUpdate = () => {
    if (updateState !== "idle") return;
    setUpdateState("checking");
    window.setTimeout(() => setUpdateState("done"), 900);
  };

  /* بستن مودال با Escape */
  useEffect(() => {
    if (!aboutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAboutOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aboutOpen]);

  return (
    <>
      <PageHeader
        title="تنظیمات و اطلاعات برنامه"
        subtitle="سامانه هوشمند حمل‌ونقل متروجو"
        actions={
          <img
            src="/metrojo-symbol.png"
            alt="لوگوی متروجو"
            className="w-9 h-9 rounded-full object-contain shrink-0 shadow-sm"
          />
        }
      />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        {/* ------------------- بنر آگهی ------------------- */}
        <section
          aria-label="آگهی"
          className="w-full bg-surface-container-low rounded-2xl border border-outline-variant/40 p-3 flex items-center justify-between shadow-sm relative overflow-hidden"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
              <MI name="campaign" size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-label-sm bg-outline-variant/50 text-on-surface-variant px-1.5 py-0.5 rounded shrink-0">
                  آگهی
                </span>
                <p className="text-sm font-bold text-on-surface truncate">
                  تهیه بلیت آنلاین مترو و اتوبوس
                </p>
              </div>
            </div>
          </div>
          <a
            href="#"
            className="text-body-sm font-bold bg-primary text-white px-3 py-1.5 rounded-lg active:scale-95 transition-all flex items-center gap-1 shrink-0"
          >
            <span>مشاهده</span>
            <MI name="chevron_left" size={14} />
          </a>
        </section>

        {/* ------------------- بخش هشدارها و اعلانات ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
            <div className="flex items-center gap-2 text-primary">
              <MI name="notifications_active" size={20} />
              <h2 className="text-sm font-bold text-on-surface">بخش هشدارها و اعلانات</h2>
            </div>
            <span className="text-label-sm text-tertiary bg-tertiary-fixed/30 px-2 py-0.5 rounded-full">
              سیستم فعال
            </span>
          </div>

          {/* اعلان وضعیت خطوط */}
          <div className="flex items-center justify-between py-1 gap-3">
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium text-on-surface">نزدیک‌شدن وضعیت خطوط و تاخیرها</p>
            </div>
            <Toggle
              checked={flags.notifyLines}
              onChange={(v) => setFlag("notifyLines", v)}
              label="نزدیک‌شدن وضعیت خطوط و تاخیرها"
            />
          </div>
          <div className="h-px bg-surface-container" />

          {/* هشدار مسیر من */}
          <div className="flex items-center justify-between py-1 gap-3">
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium text-on-surface">هشدارهای اختصاصی مسیر من</p>
            </div>
            <Toggle
              checked={flags.notifyRoute}
              onChange={(v) => setFlag("notifyRoute", v)}
              label="هشدارهای اختصاصی مسیر من"
            />
          </div>
          <div className="h-px bg-surface-container" />

          {/* بررسی آپدیت نرم‌افزار */}
          <div className="flex items-center justify-between py-1 gap-3">
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium text-on-surface">بررسی آپدیت نرم‌افزار</p>
              <p className="text-body-sm text-outline">نسخه نصب‌شده: {toFa(APP_VERSION)}</p>
            </div>
            <button
              type="button"
              onClick={checkUpdate}
              disabled={updateState !== "idle"}
              className="px-3 py-1 bg-surface-container-low hover:bg-surface-container text-primary dark:text-primary-fixed-dim rounded-lg text-label-md font-bold border border-outline-variant/40 flex items-center gap-1 active:scale-95 transition-all disabled:opacity-80 shrink-0"
            >
              {updateState === "checking" ? (
                <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              ) : updateState === "done" ? (
                <MI name="check_circle" size={15} />
              ) : (
                <MI name="restart_alt" size={15} />
              )}
              <span>
                {updateState === "checking"
                  ? "در حال بررسی..."
                  : updateState === "done"
                    ? "به‌روز است"
                    : "بررسی به‌روزرسانی"}
              </span>
            </button>
          </div>
          {updateState === "done" && (
            <p className="text-[11px] font-bold text-tertiary flex items-center gap-1">
              <MI name="check_circle" size={14} />
              به‌روزترین نسخه را دارید
            </p>
          )}
        </section>

        {/* ------------------- دستیار صوتی و صدا ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
            <div className="flex items-center gap-2 text-primary">
              <MI name="record_voice_over" size={20} />
              <h2 className="text-sm font-bold text-on-surface">دستیار صوتی و صدا</h2>
            </div>
            <span className="text-label-sm text-primary bg-primary-fixed/50 dark:bg-primary/20 dark:text-primary-fixed-dim px-2 py-0.5 rounded-full">
              هوشمند
            </span>
          </div>

          {/* اعلام صوتی ایستگاه در پس‌زمینه */}
          <div className="flex items-center justify-between py-1 gap-3">
            <div className="space-y-0.5 pr-1 max-w-[70%] min-w-0">
              <p className="text-sm font-medium text-on-surface">اعلام صوتی ایستگاه در پس‌زمینه</p>
            </div>
            <Toggle
              checked={flags.voiceBg}
              onChange={(v) => setFlag("voiceBg", v)}
              label="اعلام صوتی ایستگاه در پس‌زمینه"
            />
          </div>
          <div className="h-px bg-surface-container" />

          {/* حساسیت ورودی صدا و میکروفون */}
          <div className="py-1 space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium text-on-surface">حساسیت ورودی صدا و میکروفون</p>
              <span className="text-label-sm text-primary font-bold dark:text-primary-fixed-dim">
                {gainLabel(micGain)} ({toFa(micGain)}٪)
              </span>
            </div>
            <div className="relative flex items-center">
              <MI name="mic_off" size={16} className="text-outline-variant ml-2 shrink-0" />
              <input
                type="range"
                min={0}
                max={100}
                value={micGain}
                onChange={(e) => onGainChange(Number(e.target.value))}
                aria-label="حساسیت ورودی صدا و میکروفون"
                className="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary-container"
              />
              <MI name="mic" size={16} className="text-primary mr-2 shrink-0" />
            </div>
          </div>
          <div className="h-px bg-surface-container" />

          {/* گوینده صوتی دستیار — زن / مرد */}
          <div className="flex items-center justify-between py-1 gap-3">
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium text-on-surface">گوینده صوتی دستیار</p>
            </div>
            <div className="flex items-center p-0.5 bg-surface-container rounded-lg border border-outline-variant/30 text-label-md shrink-0">
              <button
                type="button"
                onClick={() => prefs.setGender("female")}
                aria-pressed={prefs.gender === "female"}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  prefs.gender === "female"
                    ? "bg-surface-container-lowest text-primary shadow-xs font-bold dark:text-primary-fixed-dim"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                خانم
              </button>
              <button
                type="button"
                onClick={() => prefs.setGender("male")}
                aria-pressed={prefs.gender === "male"}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  prefs.gender === "male"
                    ? "bg-surface-container-lowest text-primary shadow-xs font-bold dark:text-primary-fixed-dim"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                آقا
              </button>
            </div>
          </div>
        </section>

        {/* ------------------- تنظیمات ظاهری و موقعیت ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20 text-primary">
            <MI name="palette" size={20} />
            <h2 className="text-sm font-bold text-on-surface">تنظیمات ظاهری و موقعیت</h2>
          </div>

          {/* انتخابگر تم */}
          <div className="py-1 space-y-2">
            <p className="text-sm font-medium text-on-surface">حالت تم نمایش</p>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setTheme(o.id)}
                  aria-pressed={activeTheme === o.id}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all active:scale-95 ${
                    activeTheme === o.id
                      ? "border-2 border-primary bg-primary text-white"
                      : "border border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                >
                  <MI name={o.icon} size={20} />
                  <span className="text-label-md mt-1">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="h-px bg-surface-container" />

          {/* دسترسی مکانی و GPS */}
          <div className="flex items-center justify-between py-1 gap-3">
            <div className="space-y-0.5 max-w-[75%] min-w-0">
              <p className="text-sm font-medium text-on-surface flex items-center gap-1.5">
                <MI name="location_on" size={16} className="text-primary shrink-0" />
                دسترسی مکانی و GPS
              </p>
            </div>
            <Toggle
              checked={flags.gps}
              onChange={(v) => setFlag("gps", v)}
              label="دسترسی مکانی و GPS"
            />
          </div>
        </section>

        {/* ------------------- درباره ما و خدمات پشتیبانی ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-2 pb-2 mb-1 border-b border-outline-variant/20 text-primary">
            <MI name="info" size={20} />
            <h2 className="text-sm font-bold text-on-surface">درباره ما و خدمات پشتیبانی</h2>
          </div>

          {/* سایر محصولات شهری */}
          <button
            type="button"
            onClick={() =>
              toast({
                title: "به‌زودی",
                description: "سایر محصولات شهری ما به‌زودی به متروجو اضافه می‌شوند",
              })
            }
            className="w-full flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-surface-container-low active:scale-[0.99] transition-all text-right"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                <MI name="apps" size={18} />
              </div>
              <p className="text-sm font-medium text-on-surface">سایر محصولات شهری ما</p>
            </div>
            <MI name="chevron_left" size={20} className="text-outline-variant shrink-0" />
          </button>

          {/* درباره متروجو */}
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="w-full flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-surface-container-low active:scale-[0.99] transition-all text-right"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center p-0.5 shrink-0">
                <img
                  src="/metrojo-symbol.png"
                  alt="لوگوی متروجو"
                  className="w-7 h-7 object-contain rounded-full"
                />
              </div>
              <p className="text-sm font-medium text-on-surface">درباره متروجو و سامانه هوشمند</p>
            </div>
            <MI name="chevron_left" size={20} className="text-outline-variant shrink-0" />
          </button>

          {/* تماس با پشتیبانی */}
          <div className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-surface-container-low transition-all gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                <MI name="support_agent" size={18} />
              </div>
              <p className="text-sm font-medium text-on-surface">تماس با پشتیبانی ۲۴ ساعته</p>
            </div>
            <a
              dir="ltr"
              href="tel:02191000000"
              className="text-label-md text-primary font-bold dark:text-primary-fixed-dim bg-primary-fixed/40 dark:bg-primary/20 px-2 py-1 rounded-md shrink-0 active:scale-95 transition-all"
            >
              ۰۲۱-۹۱۰۰۰۰۰۰
            </a>
          </div>

          {/* وب‌سایت و ایمیل */}
          <a
            href="https://metrojo.ir"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-surface-container-low active:scale-[0.99] transition-all gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                <MI name="language" size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface">وب‌سایت و ایمیل پشتیبانی</p>
                <p dir="ltr" className="text-body-sm text-outline text-right truncate">
                  info@metrojo.ir | metrojo.ir
                </p>
              </div>
            </div>
            <MI name="open_in_new" size={20} className="text-outline-variant shrink-0" />
          </a>

          {/* درخواست تبلیغات */}
          <a
            href={`mailto:info@metrojo.ir?subject=${encodeURIComponent("تبلیغات")}`}
            className="flex items-center justify-between py-2.5 px-1 rounded-lg bg-surface-container-low/60 hover:bg-surface-container active:scale-[0.99] transition-all mt-1 gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                <MI name="campaign" size={18} />
              </div>
              <p className="text-sm font-medium text-on-surface">درخواست تبلیغات در برنامه</p>
            </div>
            <MI name="chevron_left" size={18} className="text-primary shrink-0" />
          </a>
        </section>

        {/* ------------------- دریافت نسخه اندروید ------------------- */}
        {!isNative && (
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <MI name="download_for_offline" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-bold text-on-surface">دریافت نسخه اندروید متروجو</p>
                  <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 shrink-0">
                    نسخه {toFa(APP_VERSION)}
                  </span>
                </div>
                <p className="text-body-sm text-outline mt-0.5">نصب مستقیم بسته نصبی روی گوشی</p>
              </div>
              <a
                href={APK_HREF}
                download="metrojo-4.8.16.apk"
                className="bg-primary text-white px-3 py-2 rounded-lg text-label-md font-bold flex items-center gap-1 active:scale-95 transition-all shrink-0"
              >
                <MI name="download_for_offline" size={15} />
                نصب بسته نصبی
              </a>
            </div>
          </section>
        )}

        {/* ------------------- پانوشت ------------------- */}
        <div className="text-center pt-2 pb-6 space-y-1">
          <p className="text-body-sm text-outline">طراحی شده برای ناوبری سریع مسافران کلان‌شهرها</p>
          <p className="text-label-sm text-outline-variant font-medium">
            تمامی حقوق برای سامانه متروجو محفوظ است © ۱۴۰۳
          </p>
        </div>
      </main>

      {/* ------------------- مودال درباره متروجو ------------------- */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label="درباره متروجو و سامانه هوشمند"
        >
          <div
            className="absolute inset-0 bg-black/35 backdrop-blur-md"
            onClick={() => setAboutOpen(false)}
          />
          <div className="relative bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-2xl p-5 w-full max-w-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2.5">
                <img
                  src="/metrojo-symbol.png"
                  alt="لوگوی متروجو"
                  className="w-9 h-9 rounded-full object-contain shadow-sm"
                />
                <div>
                  <h3 className="text-sm font-bold text-on-surface">درباره متروجو</h3>
                  <span className="text-[10px] font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">
                    نسخه {toFa(APP_VERSION)} (پایدار)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAboutOpen(false)}
                aria-label="بستن"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container text-outline active:scale-95 transition-all"
              >
                <MI name="close" size={18} />
              </button>
            </div>
            <p className="text-body-md text-on-surface-variant leading-relaxed">
              متروجو سامانه هوشمند حمل‌ونقل ریلی است؛ ناوبری کامل مترو، نقشه تعاملی شبکه، وضعیت
              لحظه‌ای خطوط، مسیریابی و دستیار صوتی کامل فارسی — بدون نیاز به هیچ کلید یا سرویس
              خارجی.
            </p>
            <div className="divide-y divide-outline-variant/30 text-xs">
              <div className="flex items-center justify-between py-2">
                <span className="text-on-surface-variant">وضعیت سرویس</span>
                <span className="font-bold text-tertiary flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  آنلاین
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-on-surface-variant">پشتیبانی</span>
                <span className="font-bold text-on-surface">۲۴ ساعته — ۰۲۱-۹۱۰۰۰۰۰۰</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-on-surface-variant">طراحی</span>
                <span className="font-bold text-on-surface">Material Design 3</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAboutOpen(false)}
              className="w-full bg-primary text-white rounded-xl py-2.5 text-xs font-bold active:scale-[0.98] transition-all"
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </>
  );
}
