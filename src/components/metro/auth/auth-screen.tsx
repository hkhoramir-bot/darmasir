"use client";

/* ============================================================
   صفحه ورود و ثبت‌نام — اولین صفحه‌ای که پس از نصب دیده می‌شود
   سه روش ورود:
   • ایمیل یا شماره موبایل + رمز عبور
   • شماره موبایل + کد پیامکی (OTP)
   • ثبت‌نام حساب جدید
   + بازیابی رمز عبور با کد پیامکی
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { MI } from "@/components/metro/shell";
import { useAppVersion, useAppSubtitle } from "@/components/metro/panel-banners";
import { useToast } from "@/hooks/use-toast";
import { toFa } from "@/lib/metro-data";
import { authApi, useAuth, LS_AUTH_ENTRY } from "@/lib/auth-client";

type View = "login" | "register" | "otp" | "forgot";

/* ------------------- ورودی متن سبک اپ ------------------- */
function Field({
  label,
  icon,
  ...props
}: {
  label: string;
  icon: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const isLtr = props.type === "email" || props.type === "password" || props.type === "tel";
  return (
    <label className="block space-y-1.5">
      <span className="text-label-md font-bold text-on-surface-variant flex items-center gap-1.5">
        <MI name={icon} size={16} className="text-primary" />
        {label}
      </span>
      <input
        {...props}
        dir={isLtr ? "ltr" : undefined}
        style={isLtr ? { textAlign: "left" } : undefined}
        className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
      />
    </label>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />;
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <p className="text-label-md text-error bg-error/10 rounded-lg px-3 py-2 flex items-center gap-1.5" role="alert">
      <MI name="error" size={15} className="shrink-0" />
      {msg}
    </p>
  );
}

function SubmitButton({
  busy,
  icon,
  label,
  busyLabel,
  onClick,
  type = "submit",
}: {
  busy: boolean;
  icon: string;
  label: string;
  busyLabel: string;
  onClick?: () => void;
  type?: "submit" | "button";
}) {
  return (
    <button
      type={type}
      onClick={type === "button" ? onClick : undefined}
      disabled={busy}
      className="w-full bg-primary hover:bg-primary-container text-white rounded-xl py-3 text-sm font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-80"
    >
      {busy ? <Spinner /> : <MI name={icon} size={18} />}
      {busy ? busyLabel : label}
    </button>
  );
}

/* ============================ صفحه اصلی ============================ */
/* خوانش فلگ ورود مستقیم از «حساب من» (تغییر رمز عبور) — خوانش خالص بدون حذف،
   حذف فلگ پس از مونت در effect انجام می‌شود تا مقداردهی اولیه state یک‌دست بماند */
function readAuthEntry(): { view: View; phone: string } {
  try {
    const raw = localStorage.getItem(LS_AUTH_ENTRY);
    if (raw) {
      const e = JSON.parse(raw) as { view?: string; phone?: string };
      if (e?.view === "forgot") return { view: "forgot", phone: (e.phone ?? "").trim() };
    }
  } catch {}
  return { view: "login", phone: "" };
}

export function AuthScreen() {
  const { toast } = useToast();
  const setSession = useAuth((s) => s.setSession);
  const appVersion = useAppVersion();
  const appSubtitle = useAppSubtitle();

  /* فلگ ورود مستقیم — نمای اولیه و شماره پیش‌پرشده بازیابی */
  const [entry] = useState(readAuthEntry);
  const [view, setView] = useState<View>(entry.view);

  /* ---------- ورود با رمز ---------- */
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginErr, setLoginErr] = useState("");

  /* ---------- ثبت‌نام ---------- */
  const [rPhone, setRPhone] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPass, setRPass] = useState("");
  const [rPass2, setRPass2] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regErr, setRegErr] = useState("");

  /* ---------- ورود با کد پیامکی ---------- */
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<"phone" | "code">("phone");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpErr, setOtpErr] = useState("");
  const [otpDevCode, setOtpDevCode] = useState<string | null>(null);
  const [otpExpire, setOtpExpire] = useState(0); // ثانیه باقی‌مانده
  const [resendIn, setResendIn] = useState(0);
  const otpTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---------- بازیابی رمز عبور ---------- */
  const [fpPhone, setFpPhone] = useState(entry.phone);
  const [fpCode, setFpCode] = useState("");
  const [fpPass, setFpPass] = useState("");
  const [fpPass2, setFpPass2] = useState("");
  const [fpStep, setFpStep] = useState<"phone" | "reset">("phone");
  const [fpBusy, setFpBusy] = useState(false);
  const [fpErr, setFpErr] = useState("");
  const [fpDevCode, setFpDevCode] = useState<string | null>(null);
  const [fpExpire, setFpExpire] = useState(0);
  const [fpResendIn, setFpResendIn] = useState(0);
  const [fpNoRecord, setFpNoRecord] = useState(false); // پرونده‌ای با این شماره در دیتابیس نیست
  const [fpEmailNote, setFpEmailNote] = useState<string | null>(null); // وضعیت ارسال ایمیل کد

  useEffect(() => {
    otpTimer.current = setInterval(() => {
      setOtpExpire((e) => (e > 0 ? e - 1 : 0));
      setResendIn((r) => (r > 0 ? r - 1 : 0));
      setFpExpire((e) => (e > 0 ? e - 1 : 0));
      setFpResendIn((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => {
      if (otpTimer.current) clearInterval(otpTimer.current);
    };
  }, []);

  /* حذف فلگ یک‌بار مصرف پس از مونت — بدون تغییر state */
  useEffect(() => {
    try {
      localStorage.removeItem(LS_AUTH_ENTRY);
    } catch {}
  }, []);

  const resetErrors = () => {
    setLoginErr("");
    setRegErr("");
    setOtpErr("");
    setFpErr("");
  };

  /* ---------------- پرش سریع بین روش‌های ورود بر اساس پیام خطا ----------------
     پیام‌هایی که به «کد پیامکی» ارجاع می‌دهند → رفتن مستقیم به فرم کد پیامکی با همان شماره؛
     پیام‌هایی که به «وارد شوید» ارجاع می‌دهند → برگشت به فرم ورود با همان مشخصات */
  const quickSwitchOtp = (ident: string) => {
    const raw = ident.trim();
    if (raw && !raw.includes("@")) setOtpPhone(raw);
    setOtpCode("");
    setOtpStep("phone");
    setOtpDevCode(null);
    setView("otp");
    resetErrors();
  };
  const quickSwitchLogin = (ident: string) => {
    if (ident.trim()) setIdentifier(ident.trim());
    setView("login");
    resetErrors();
  };
  const errorSuggestsOtp = (msg: string) => msg.includes("پیامکی");
  const errorSuggestsLogin = (msg: string) => msg.includes("وارد شوید");

  /* ---------------- عملیات‌ها ---------------- */
  const doLogin = async () => {
    if (loginBusy) return;
    if (!identifier.trim() || !password) {
      setLoginErr("ایمیل/شماره موبایل و رمز عبور را وارد کنید");
      return;
    }
    setLoginBusy(true);
    resetErrors();
    const r = await authApi.login({ identifier: identifier.trim(), password });
    setLoginBusy(false);
    if (!r.ok) {
      setLoginErr(r.error);
      return;
    }
    toast({ title: "خوش آمدید", description: "به درمسیر خوش آمدید" });
    setSession(r.data.token, r.data.user);
  };

  const doRegister = async () => {
    if (regBusy) return;
    if (!rPhone.trim() && !rEmail.trim()) {
      setRegErr("شماره موبایل یا ایمیل را وارد کنید (حداقل یکی)");
      return;
    }
    if (rPass.length < 6) {
      setRegErr("رمز عبور باید حداقل ۶ کاراکتر باشد");
      return;
    }
    if (rPass !== rPass2) {
      setRegErr("تکرار رمز عبور با رمز اصلی یکسان نیست");
      return;
    }
    setRegBusy(true);
    resetErrors();
    const r = await authApi.register({
      phone: rPhone.trim() || undefined,
      email: rEmail.trim() || undefined,
      password: rPass,
    });
    setRegBusy(false);
    if (!r.ok) {
      setRegErr(r.error);
      return;
    }
    toast({ title: "حساب ساخته شد", description: "به خانواده درمسیر خوش آمدید" });
    setSession(r.data.token, r.data.user);
  };

  const requestOtp = async (resend = false) => {
    if (otpBusy || (resend && resendIn > 0)) return;
    if (!otpPhone.trim()) {
      setOtpErr("شماره موبایل را وارد کنید");
      return;
    }
    setOtpBusy(true);
    resetErrors();
    setOtpDevCode(null);
    const r = await authApi.otpRequest({ phone: otpPhone.trim() });
    setOtpBusy(false);
    if (!r.ok) {
      setOtpErr(r.error);
      return;
    }
    setOtpStep("code");
    setOtpExpire(r.data.expiresInSeconds ?? 180);
    setResendIn(60);
    if (r.data.devCode) {
      setOtpDevCode(r.data.devCode);
      toast({
        title: "حالت توسعه",
        description: `سرویس پیامک تنظیم نشده — کد آزمایشی: ${toFa(r.data.devCode)}`,
      });
    } else {
      toast({ title: "کد ارسال شد", description: `کد ورود به ${toFa(otpPhone.trim())} پیامک شد` });
    }
  };

  const verifyOtp = async () => {
    if (otpBusy) return;
    if (otpCode.replace(/\D/g, "").length !== 6) {
      setOtpErr("کد ۶ رقمی را کامل وارد کنید");
      return;
    }
    setOtpBusy(true);
    resetErrors();
    const r = await authApi.otpVerify({ phone: otpPhone.trim(), code: otpCode.replace(/\D/g, "") });
    setOtpBusy(false);
    if (!r.ok) {
      setOtpErr(r.error);
      return;
    }
    /* نام ساختگی خودکار («کاربر ۰۰۰۱») در پیام خوش‌آمد نمایش داده نمی‌شود */
    const auto = /^کاربر/.test(r.data.user.name.trim());
    toast({
      title: r.data.isNew ? "حساب شما ساخته شد" : "خوش آمدید",
      description: auto
        ? "به درمسیر خوش آمدید — از «حساب من» می‌توانید نام خود را ثبت کنید"
        : `${r.data.user.name} عزیز، به درمسیر خوش آمدید`,
    });
    setSession(r.data.token, r.data.user);
  };

  /* ---------------- بازیابی رمز عبور ---------------- */
  const openForgot = () => {
    const raw = identifier.trim();
    if (raw && !raw.includes("@")) setFpPhone(raw);
    setFpStep("phone");
    setFpCode("");
    setFpPass("");
    setFpPass2("");
    setFpErr("");
    setFpDevCode(null);
    setFpNoRecord(false);
    setFpEmailNote(null);
    setView("forgot");
  };

  const requestFpCode = async (resend = false) => {
    if (fpBusy || (resend && fpResendIn > 0)) return;
    if (!fpPhone.trim()) {
      setFpErr("شماره موبایل را وارد کنید");
      return;
    }
    setFpBusy(true);
    setFpErr("");
    setFpDevCode(null);
    setFpNoRecord(false);
    setFpEmailNote(null);
    /* بررسی پرونده در دیتابیس + ارسال کد (پیامک و ایمیل) */
    const r = await authApi.forgotRequest({ phone: fpPhone.trim() });
    setFpBusy(false);
    if (!r.ok) {
      setFpErr(r.error);
      if (r.error.includes("پرونده")) setFpNoRecord(true);
      return;
    }
    setFpStep("reset");
    setFpExpire(r.data.expiresInSeconds ?? 180);
    setFpResendIn(60);
    if (r.data.hasEmail) {
      if (r.data.emailSent) {
        setFpEmailNote("کد بازیابی به ایمیل حساب شما هم ارسال شد");
      } else if (r.data.emailStatus === "no_smtp") {
        setFpEmailNote("ارسال ایمیل کد فعلاً فعال نیست (SMTP تنظیم نشده) — کد پیامک شد");
      } else {
        setFpEmailNote("ارسال ایمیل کد ناموفق بود — کد پیامک شد");
      }
    }
    if (r.data.devCode) {
      setFpDevCode(r.data.devCode);
      toast({
        title: "حالت توسعه",
        description: `سرویس پیامک تنظیم نشده — کد آزمایشی: ${toFa(r.data.devCode)}`,
      });
    } else {
      toast({
        title: "کد ارسال شد",
        description: r.data.hasEmail
          ? `کد بازیابی به ${toFa(fpPhone.trim())} پیامک و به ایمیل حساب شما ارسال شد`
          : `کد بازیابی به ${toFa(fpPhone.trim())} پیامک شد`,
      });
    }
  };

  /* پرونده‌ای نیست — رفتن به ثبت‌نام با همان شماره */
  const goRegisterFromForgot = () => {
    if (fpPhone.trim()) setRPhone(fpPhone.trim());
    setFpNoRecord(false);
    setFpErr("");
    setView("register");
  };

  const doPasswordReset = async () => {
    if (fpBusy) return;
    if (fpCode.replace(/\D/g, "").length !== 6) {
      setFpErr("کد ۶ رقمی را کامل وارد کنید");
      return;
    }
    if (fpPass.length < 6) {
      setFpErr("رمز عبور جدید باید حداقل ۶ کاراکتر باشد");
      return;
    }
    if (fpPass !== fpPass2) {
      setFpErr("تکرار رمز با رمز جدید یکسان نیست");
      return;
    }
    setFpBusy(true);
    setFpErr("");
    const r = await authApi.passwordReset({
      phone: fpPhone.trim(),
      code: fpCode.replace(/\D/g, ""),
      newPassword: fpPass,
    });
    setFpBusy(false);
    if (!r.ok) {
      setFpErr(r.error);
      return;
    }
    toast({ title: "رمز عبور تغییر کرد", description: "اکنون با رمز جدید وارد حساب خود شوید" });
    setIdentifier(fpPhone.trim());
    setPassword("");
    setFpStep("phone");
    setFpCode("");
    setFpPass("");
    setFpPass2("");
    setFpDevCode(null);
    setView("login");
  };

  /* ---------------- نمای بخش‌ها ---------------- */
  const tabs: { id: View; label: string; icon: string }[] = [
    { id: "login", label: "ورود", icon: "login" },
    { id: "register", label: "ثبت‌نام", icon: "person_add" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface" role="main" aria-label="ورود و ثبت‌نام">
      {/* ---------- سرصفحه برند ---------- */}
      <div className="pt-10 pb-6 flex flex-col items-center gap-3 px-6 text-center shrink-0">
        <div className="w-20 h-20 rounded-3xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm flex items-center justify-center p-2.5">
          <img src="/metrojo-logo.svg" alt="لوگوی درمسیر" className="w-full h-full object-contain" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-primary tracking-tight">درمسیر</h1>
          <p className="text-body-sm text-on-surface-variant">{appSubtitle}</p>
        </div>
        <p className="text-label-md text-on-surface-variant max-w-[30ch]">
          برای استفاده از امکانات برنامه، وارد حساب کاربری خود شوید
        </p>
      </div>

      {/* ---------- کارت ورود/ثبت‌نام ---------- */}
      <main className="flex-1 min-h-0 w-full px-4 pb-8 overflow-y-auto">
        {view === "forgot" ? (
          /* ================= فرم بازیابی رمز عبور ================= */
          <section
            className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-sm p-4 space-y-4"
            aria-label="بازیابی رمز عبور"
          >
            <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/30">
              <button
                type="button"
                onClick={() => {
                  setFpStep("phone");
                  setFpErr("");
                  setView("login");
                }}
                aria-label="بازگشت به ورود"
                className="w-9 h-9 rounded-full flex items-center justify-center text-primary hover:bg-surface-container active:scale-95 transition-all"
              >
                <MI name="arrow_forward" size={20} />
              </button>
              <div className="flex items-center gap-2">
                <MI name="lock_reset" size={18} className="text-primary" />
                <h2 className="text-sm font-bold text-on-surface">بازیابی رمز عبور</h2>
              </div>
            </div>

            {fpStep === "phone" ? (
              <>
                <p className="text-body-sm text-on-surface-variant leading-relaxed">
                  شماره موبایل حساب خود را وارد کنید تا کد بازیابی برایتان پیامک و ایمیل شود.
                </p>
                <Field
                  label="شماره موبایل"
                  icon="smartphone"
                  type="tel"
                  inputMode="tel"
                  value={fpPhone}
                  onChange={(e) => setFpPhone(e.target.value)}
                  placeholder="09123456789"
                  autoComplete="tel"
                />
                {fpErr && <ErrorBox msg={fpErr} />}

                {/* پرونده‌ای در دیتابیس نیست — دعوت به ثبت‌نام */}
                {fpNoRecord && (
                  <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl px-3 py-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[12px] text-on-surface-variant min-w-0">
                      <MI name="person_off" size={18} className="text-primary shrink-0" />
                      <span>برای این شماره حسابی ثبت نشده است</span>
                    </div>
                    <button
                      type="button"
                      onClick={goRegisterFromForgot}
                      className="text-label-md font-bold text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-lg active:scale-95 transition-all shrink-0 flex items-center gap-1"
                    >
                      <MI name="person_add" size={15} />
                      ثبت‌نام کنید
                    </button>
                  </div>
                )}

                <SubmitButton
                  busy={fpBusy}
                  icon="send_to_mobile"
                  label="دریافت کد بازیابی"
                  busyLabel="در حال ارسال..."
                  type="button"
                  onClick={() => void requestFpCode()}
                />
              </>
            ) : (
              <>
                <p className="text-body-sm text-on-surface-variant leading-relaxed">
                  کد ۶ رقمی به شماره{" "}
                  <span className="font-bold text-on-surface" dir="ltr">
                    {toFa(fpPhone)}
                  </span>{" "}
                  ارسال شد — رمز عبور جدید را تعیین کنید.
                </p>

                {/* وضعیت ارسال ایمیل کد */}
                {fpEmailNote && (
                  <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl px-3 py-2.5 flex items-center gap-2">
                    <MI name="mark_email_read" size={16} className="text-primary shrink-0" />
                    <span className="text-[12px] text-on-surface-variant">{fpEmailNote}</span>
                  </div>
                )}

                {/* کد آزمایشی در حالت توسعه */}
                {fpDevCode && (
                  <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[12px] text-on-surface-variant min-w-0">
                      <MI name="science" size={16} className="text-primary shrink-0" />
                      <span className="truncate">
                        کد آزمایشی:{" "}
                        <span className="font-bold text-on-surface tracking-widest" dir="ltr">
                          {toFa(fpDevCode)}
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFpCode(fpDevCode)}
                      className="text-label-md font-bold text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg active:scale-95 transition-all shrink-0"
                    >
                      درج خودکار
                    </button>
                  </div>
                )}

                <label className="block space-y-1.5">
                  <span className="text-label-md font-bold text-on-surface-variant flex items-center gap-1.5">
                    <MI name="password" size={16} className="text-primary" />
                    کد بازیابی
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={fpCode}
                    onChange={(e) => setFpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="------"
                    dir="ltr"
                    style={{ textAlign: "center", letterSpacing: "0.4em", fontWeight: 700 }}
                    className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-3 py-3 text-lg text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    aria-label="کد بازیابی ۶ رقمی"
                  />
                </label>

                <Field
                  label="رمز عبور جدید"
                  icon="lock"
                  type="password"
                  value={fpPass}
                  onChange={(e) => setFpPass(e.target.value)}
                  placeholder="حداقل ۶ کاراکتر"
                  autoComplete="new-password"
                />
                <Field
                  label="تکرار رمز جدید"
                  icon="lock"
                  type="password"
                  value={fpPass2}
                  onChange={(e) => setFpPass2(e.target.value)}
                  placeholder="تکرار رمز"
                  autoComplete="new-password"
                />

                {fpErr && <ErrorBox msg={fpErr} />}

                <SubmitButton
                  busy={fpBusy}
                  icon="lock_reset"
                  label="تغییر رمز عبور"
                  busyLabel="در حال تغییر..."
                  type="button"
                  onClick={() => void doPasswordReset()}
                />

                <div className="flex items-center justify-between text-label-md">
                  <span className="text-on-surface-variant flex items-center gap-1">
                    <MI name="timer" size={14} />
                    {fpExpire > 0
                      ? `${toFa(Math.floor(fpExpire / 60))}:${toFa(String(fpExpire % 60).padStart(2, "0"))} تا انقضای کد`
                      : "کد منقضی شد"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void requestFpCode(true)}
                    disabled={fpResendIn > 0 || fpBusy}
                    className="font-bold text-primary disabled:text-on-surface-variant disabled:cursor-not-allowed"
                  >
                    {fpResendIn > 0 ? `ارسال مجدد (${toFa(fpResendIn)})` : "ارسال مجدد کد"}
                  </button>
                </div>
              </>
            )}
          </section>
        ) : view !== "otp" ? (
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-sm overflow-hidden">
            {/* تب‌ها */}
            <div className="grid grid-cols-2 p-1.5 gap-1.5 bg-surface-container border-b border-outline-variant/30" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={view === t.id}
                  onClick={() => {
                    setView(t.id);
                    resetErrors();
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm transition-all active:scale-[0.98] ${
                    view === t.id
                      ? "bg-primary text-white font-bold shadow-sm"
                      : "text-on-surface-variant font-medium hover:bg-surface-container-low"
                  }`}
                >
                  <MI name={t.icon} size={17} />
                  {t.label}
                </button>
              ))}
            </div>

            {/* ------- فرم ورود ------- */}
            {view === "login" && (
              <form
                className="p-4 space-y-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doLogin();
                }}
              >
                <Field
                  label="ایمیل یا شماره موبایل"
                  icon="account_circle"
                  type="text"
                  inputMode="email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com یا 09123456789"
                  autoComplete="username"
                />
                <label className="block space-y-1.5">
                  <span className="text-label-md font-bold text-on-surface-variant flex items-center gap-1.5">
                    <MI name="lock" size={16} className="text-primary" />
                    رمز عبور
                  </span>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      dir="ltr"
                      style={{ textAlign: "left" }}
                      className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-3 py-2.5 pl-11 text-sm text-on-surface placeholder:text-on-surface-variant/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? "پنهان کردن رمز" : "نمایش رمز"}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
                    >
                      <MI name={showPass ? "visibility_off" : "visibility"} size={18} />
                    </button>
                  </div>
                </label>

                {/* بازیابی رمز عبور */}
                <div className="flex justify-start -mt-1">
                  <button
                    type="button"
                    onClick={openForgot}
                    className="text-label-md font-bold text-primary hover:underline flex items-center gap-1 active:scale-95 transition-all"
                  >
                    <MI name="lock_reset" size={15} />
                    فراموشی رمز عبور؟
                  </button>
                </div>

                {loginErr && <ErrorBox msg={loginErr} />}

                {loginErr && errorSuggestsOtp(loginErr) && (
                  <button
                    type="button"
                    onClick={() => quickSwitchOtp(identifier)}
                    className="w-full bg-secondary/10 hover:bg-secondary/20 text-secondary rounded-xl py-2.5 text-sm font-bold border border-secondary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <MI name="sms" size={17} />
                    ورود با کد پیامکی
                  </button>
                )}

                <SubmitButton
                  busy={loginBusy}
                  icon="login"
                  label="ورود به درمسیر"
                  busyLabel="در حال ورود..."
                />

                <div className="flex items-center gap-3 py-1" aria-hidden>
                  <span className="h-px flex-1 bg-outline-variant/40" />
                  <span className="text-label-sm text-on-surface-variant font-bold">یا</span>
                  <span className="h-px flex-1 bg-outline-variant/40" />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setView("otp");
                    setOtpStep("phone");
                    resetErrors();
                  }}
                  className="w-full bg-surface-container-low hover:bg-surface-container text-primary rounded-xl py-3 text-sm font-bold border border-outline-variant/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <MI name="sms" size={18} />
                  ورود با کد پیامکی
                </button>
              </form>
            )}

            {/* ------- فرم ثبت‌نام ------- */}
            {view === "register" && (
              <form
                className="p-4 space-y-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doRegister();
                }}
              >
                <Field
                  label="شماره موبایل"
                  icon="smartphone"
                  type="tel"
                  inputMode="tel"
                  value={rPhone}
                  onChange={(e) => setRPhone(e.target.value)}
                  placeholder="09123456789"
                />
                <Field
                  label="ایمیل (اختیاری)"
                  icon="mail"
                  type="email"
                  inputMode="email"
                  value={rEmail}
                  onChange={(e) => setREmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <Field
                    label="رمز عبور"
                    icon="lock"
                    type="password"
                    value={rPass}
                    onChange={(e) => setRPass(e.target.value)}
                    placeholder="حداقل ۶ کاراکتر"
                    autoComplete="new-password"
                  />
                  <Field
                    label="تکرار رمز"
                    icon="lock"
                    type="password"
                    value={rPass2}
                    onChange={(e) => setRPass2(e.target.value)}
                    placeholder="تکرار رمز"
                    autoComplete="new-password"
                  />
                </div>

                {regErr && <ErrorBox msg={regErr} />}

                {regErr && (errorSuggestsOtp(regErr) || errorSuggestsLogin(regErr)) && (
                  <div className="grid grid-cols-2 gap-2">
                    {errorSuggestsOtp(regErr) && (
                      <button
                        type="button"
                        onClick={() => quickSwitchOtp(rPhone || rEmail)}
                        className="bg-secondary/10 hover:bg-secondary/20 text-secondary rounded-xl py-2.5 text-[12px] font-bold border border-secondary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                      >
                        <MI name="sms" size={15} />
                        کد پیامکی
                      </button>
                    )}
                    {errorSuggestsLogin(regErr) && (
                      <button
                        type="button"
                        onClick={() => quickSwitchLogin(rPhone || rEmail)}
                        className="bg-primary/10 hover:bg-primary/20 text-primary rounded-xl py-2.5 text-[12px] font-bold border border-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                      >
                        <MI name="login" size={15} />
                        ورود به حساب
                      </button>
                    )}
                  </div>
                )}

                <SubmitButton
                  busy={regBusy}
                  icon="person_add"
                  label="ایجاد حساب کاربری"
                  busyLabel="در حال ایجاد حساب..."
                />
                <p className="text-[11px] text-on-surface-variant text-center leading-relaxed">
                  با ایجاد حساب، <span className="text-on-surface-variant font-bold">قوانین و حریم خصوصی</span> درمسیر را می‌پذیرید
                </p>
              </form>
            )}
          </section>
        ) : (
          /* ================= فرم کد پیامکی ================= */
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-sm p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/30">
              <button
                type="button"
                onClick={() => {
                  setOtpStep("phone");
                  setOtpErr("");
                }}
                aria-label="بازگشت"
                className="w-9 h-9 rounded-full flex items-center justify-center text-primary hover:bg-surface-container active:scale-95 transition-all"
              >
                <MI name="arrow_forward" size={20} />
              </button>
              <div className="flex items-center gap-2">
                <MI name="sms" size={18} className="text-primary" />
                <h2 className="text-sm font-bold text-on-surface">ورود با کد پیامکی</h2>
              </div>
            </div>

            {otpStep === "phone" ? (
              <>
                <p className="text-body-sm text-on-surface-variant leading-relaxed">
                  شماره موبایل خود را وارد کنید تا کد ورود برایتان پیامک شود.
                </p>
                <Field
                  label="شماره موبایل"
                  icon="smartphone"
                  type="tel"
                  inputMode="tel"
                  value={otpPhone}
                  onChange={(e) => setOtpPhone(e.target.value)}
                  placeholder="09123456789"
                />
                {otpErr && <ErrorBox msg={otpErr} />}
                <SubmitButton
                  busy={otpBusy}
                  icon="send_to_mobile"
                  label="دریافت کد ورود"
                  busyLabel="در حال ارسال..."
                  type="button"
                  onClick={() => void requestOtp()}
                />
              </>
            ) : (
              <>
                <p className="text-body-sm text-on-surface-variant leading-relaxed">
                  کد ۶ رقمی به شماره{" "}
                  <span className="font-bold text-on-surface" dir="ltr">
                    {toFa(otpPhone)}
                  </span>{" "}
                  ارسال شد.
                </p>

                {/* کد آزمایشی در حالت توسعه */}
                {otpDevCode && (
                  <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[12px] text-on-surface-variant min-w-0">
                      <MI name="science" size={16} className="text-primary shrink-0" />
                      <span className="truncate">
                        کد آزمایشی:{" "}
                        <span className="font-bold text-on-surface tracking-widest" dir="ltr">
                          {toFa(otpDevCode)}
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOtpCode(otpDevCode)}
                      className="text-label-md font-bold text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg active:scale-95 transition-all shrink-0"
                    >
                      درج خودکار
                    </button>
                  </div>
                )}

                <label className="block space-y-1.5">
                  <span className="text-label-md font-bold text-on-surface-variant flex items-center gap-1.5">
                    <MI name="password" size={16} className="text-primary" />
                    کد ورود
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="------"
                    dir="ltr"
                    style={{ textAlign: "center", letterSpacing: "0.4em", fontWeight: 700 }}
                    className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-3 py-3 text-lg text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    aria-label="کد ورود ۶ رقمی"
                  />
                </label>

                {otpErr && <ErrorBox msg={otpErr} />}

                <SubmitButton
                  busy={otpBusy}
                  icon="verified"
                  label="تأیید و ورود"
                  busyLabel="در حال بررسی..."
                  type="button"
                  onClick={() => void verifyOtp()}
                />

                <div className="flex items-center justify-between text-label-md">
                  <span className="text-on-surface-variant flex items-center gap-1">
                    <MI name="timer" size={14} />
                    {otpExpire > 0
                      ? `${toFa(Math.floor(otpExpire / 60))}:${toFa(String(otpExpire % 60).padStart(2, "0"))} تا انقضای کد`
                      : "کد منقضی شد"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void requestOtp(true)}
                    disabled={resendIn > 0 || otpBusy}
                    className="font-bold text-primary disabled:text-on-surface-variant disabled:cursor-not-allowed"
                  >
                    {resendIn > 0 ? `ارسال مجدد (${toFa(resendIn)})` : "ارسال مجدد کد"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* ---------- پانوشت ---------- */}
        <div className="text-center pt-4 space-y-1 px-2">
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            ورود شما به معنای پذیرش شرایط استفاده و حفظ امنیت حساب خود است
          </p>
          <p className="text-[11px] text-on-surface-variant font-medium">درمسیر — نسخه {toFa(appVersion)}</p>
        </div>
      </main>
    </div>
  );
}
