"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MI, PageHeader } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";
import { toFa } from "@/lib/metro-data";
import { useVoicePrefs } from "@/lib/voice-settings";
import { useAuth } from "@/lib/auth-client";
import { useAppVersion } from "@/components/metro/panel-banners";
import {
  authenticateBiometric,
  detectBiometricSupport,
  BioSupport,
} from "@/lib/biometric";

/* ============================================================
   تنظیمات برنامه — جدا از «حساب من»
   هشدارها و اعلانات + دستیار صوتی و صدا + تنظیمات ظاهری و موقعیت
   ============================================================ */

/* ------------------- کلیدهای ذخیره‌سازی روی دستگاه ------------------- */
const NOTIFY_LINES_KEY = "metrojo-notify-lines";
const NOTIFY_ROUTE_KEY = "metrojo-notify-route";
const MIC_GAIN_KEY = "metrojo-mic-gain";
const GPS_KEY = "mj-gps-enabled"; // کلیدی که نقشه می‌خواند («false» یعنی خاموش)
const GPS_KEY_ALT = "metrojo-gps";
const VOICE_BG_KEY = "metrojo-voice-bg";
const BIO_KEY = "metrojo-biometric"; // کلید مشترک با auth-client («true» = ورود با اثر انگشت)

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

export default function AppSettingsPage() {
  const { toast } = useToast();
  const appVersion = useAppVersion();
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

  /* ---------- اثر انگشت (ورود سریع) ---------- */
  const user = useAuth((s) => s.user);
  const [bioOn, setBioOn] = useState(false);
  const [bioSupport, setBioSupport] = useState<BioSupport>("demo");
  const [bioBusy, setBioBusy] = useState(false);

  /* ---------- بررسی به‌روزرسانی ---------- */
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "done">("idle");

  /* بازیابی تنظیمات ذخیره‌شده (یک‌بار، خارج از چرخه رندر) */
  useEffect(() => {
    const id = window.setTimeout(() => {
      useVoicePrefs.getState().hydrate();
      try {
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
        // وضعیت اثر انگشت
        setBioOn(localStorage.getItem(BIO_KEY) === "true");
      } catch {}
      void detectBiometricSupport().then(setBioSupport);
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

  /* ---------- فعال/غیرفعال کردن ورود با اثر انگشت ---------- */
  const onBioToggle = async (v: boolean) => {
    if (bioBusy) return;
    if (v) {
      setBioBusy(true);
      const r = await authenticateBiometric("برای فعال‌سازی ورود سریع، اثر انگشت خود را تأیید کنید");
      setBioBusy(false);
      if (!r.ok) {
        toast({
          title: "فعال‌سازی ناموفق",
          description: "اثر انگشت تأیید نشد — دوباره تلاش کنید",
        });
        return;
      }
      try {
        localStorage.setItem(BIO_KEY, "true");
      } catch {}
      setBioOn(true);
      toast({
        title: "ورود با اثر انگشت فعال شد",
        description: "از این به بعد با هر شروع برنامه، اثر انگشت شما درخواست می‌شود",
      });
    } else {
      try {
        localStorage.setItem(BIO_KEY, "false");
      } catch {}
      setBioOn(false);
      toast({ title: "ورود با اثر انگشت غیرفعال شد" });
    }
  };

  const bioSupportLabel =
    bioSupport === "native"
      ? "سنسور اثر انگشت دستگاه آماده است"
      : bioSupport === "webauthn"
        ? "تأیید بیومتریک مرورگر در دسترس است"
        : "حالت نمایشی — در اپ اندروید سنسور واقعی استفاده می‌شود";

  const checkUpdate = () => {
    if (updateState !== "idle") return;
    setUpdateState("checking");
    window.setTimeout(() => setUpdateState("done"), 900);
  };

  return (
    <>
      <PageHeader
        title="تنظیمات"
        subtitle="شخصی‌سازی برنامه درمسیر"
        actions={
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <MI name="settings" size={20} />
          </div>
        }
      />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
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
              <p className="text-body-sm text-on-surface-variant">نسخه نصب‌شده: {toFa(appVersion)}</p>
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

        {/* ------------------- امنیت و ورود ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
            <div className="flex items-center gap-2 text-primary">
              <MI name="fingerprint" size={20} />
              <h2 className="text-sm font-bold text-on-surface">امنیت و ورود</h2>
            </div>
            <span className="text-label-sm text-primary bg-primary-fixed/50 dark:bg-primary/20 dark:text-primary-fixed-dim px-2 py-0.5 rounded-full">
              {bioOn ? "فعال" : "غیرفعال"}
            </span>
          </div>

          {/* ورود سریع با اثر انگشت */}
          <div className="py-1 space-y-1.5">
            <div className="flex items-center justify-between py-1 gap-3">
              <div className="space-y-0.5 max-w-[70%] min-w-0">
                <p className="text-sm font-medium text-on-surface">ورود سریع با اثر انگشت</p>
                <p className="text-body-sm text-on-surface-variant leading-relaxed">
                  {user
                    ? "با هر بار باز شدن برنامه، ابتدا اثر انگشت شما درخواست می‌شود"
                    : "برای فعال‌سازی ابتدا وارد حساب کاربری شوید"}
                </p>
              </div>
              <Toggle
                checked={bioBusy ? !bioOn : bioOn}
                onChange={(v) => void onBioToggle(v)}
                label="ورود سریع با اثر انگشت"
              />
            </div>
            <p className="text-[11px] text-on-surface-variant flex items-center gap-1 pt-0.5">
              <MI name="info" size={12} className="shrink-0" />
              {bioSupportLabel}
            </p>
          </div>
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
              <MI name="mic_off" size={16} className="text-on-surface-variant ml-2 shrink-0" />
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
      </main>
    </>
  );
}
