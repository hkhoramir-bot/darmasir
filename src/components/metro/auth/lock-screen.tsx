"use client";

/* ============================================================
   قفل اثر انگشت — وقتی کاربر «ورود سریع با اثر انگشت» را فعال
   کرده باشد، با هر شروع برنامه این صفحه نمایش داده می‌شود:
   • سنسور بیومتریک دستگاه (اندروید: NativeBiometric، وب: WebAuthn)
   • روش جایگزین: ورود با رمز عبور
   ============================================================ */

import { useState } from "react";
import { MI } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";
import { authApi, useAuth } from "@/lib/auth-client";
import { authenticateBiometric, detectBiometricSupport } from "@/lib/biometric";

type ScanState = "idle" | "scanning" | "success" | "fail";

export function LockScreen() {
  const { toast } = useToast();
  const user = useAuth((s) => s.user);
  const unlock = useAuth((s) => s.unlock);

  const [scan, setScan] = useState<ScanState>("idle");
  const [bioErr, setBioErr] = useState("");
  const [bioSupport, setBioSupport] = useState<"native" | "webauthn" | "demo" | "checking">("checking");
  const [passMode, setPassMode] = useState(false);
  const [password, setPassword] = useState("");
  const [passBusy, setPassBusy] = useState(false);
  const [passErr, setPassErr] = useState("");

  const identifier = user?.phone ?? user?.email ?? "";

  const runBiometric = async () => {
    if (scan === "scanning") return;
    setScan("scanning");
    setBioErr("");
    const support = await detectBiometricSupport();
    setBioSupport(support);
    const r = await authenticateBiometric("برای باز کردن درمسیر، هویت خود را تأیید کنید");
    if (r.ok) {
      setScan("success");
      toast({ title: "هویت تأیید شد", description: "خوش برگشتید" });
      setTimeout(() => unlock(), 450);
    } else {
      setScan("fail");
      setBioErr(r.error ?? "اثر انگشت تأیید نشد — دوباره تلاش کنید یا از رمز عبور استفاده کنید");
    }
  };

  const unlockWithPassword = async () => {
    if (passBusy) return;
    if (!password) {
      setPassErr("رمز عبور را وارد کنید");
      return;
    }
    if (!identifier) {
      setPassErr("این حساب رمز/شناسه ورود ندارد — از حساب خارج و مجدد وارد شوید");
      return;
    }
    setPassBusy(true);
    setPassErr("");
    const r = await authApi.login({ identifier, password });
    setPassBusy(false);
    if (!r.ok) {
      setPassErr(r.error);
      return;
    }
    toast({ title: "قفل باز شد", description: "خوش برگشتید" });
    unlock();
  };

  const scanIcon = scan === "success" ? "check_circle" : scan === "fail" ? "error" : "fingerprint";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface" role="main" aria-label="قفل اثر انگشت">
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
        {/* برند */}
        <div className="flex flex-col items-center gap-2.5">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm flex items-center justify-center p-2">
            <img src="/metrojo-logo.svg" alt="لوگوی درمسیر" className="w-full h-full object-contain" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-bold text-on-surface">قفل برنامه فعال است</p>
            {user && <p className="text-label-md text-on-surface-variant">حساب {user.name}</p>}
          </div>
        </div>

        {/* دکمه اثر انگشت */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => void runBiometric()}
            aria-label="باز کردن قفل با اثر انگشت"
            className={`w-28 h-28 rounded-full flex items-center justify-center transition-all active:scale-95 ${
              scan === "success"
                ? "bg-primary text-white shadow-lg"
                : scan === "fail"
                  ? "bg-error/10 text-error"
                  : "bg-primary/10 text-primary hover:bg-primary/15 shadow-sm"
            } ${scan === "scanning" ? "animate-pulse" : ""}`}
          >
            <MI name={scanIcon} size={62} fill={scan === "idle"} />
          </button>
          <p className="text-label-md text-on-surface-variant max-w-[30ch] leading-relaxed">
            {scan === "scanning"
              ? "در حال بررسی اثر انگشت..."
              : scan === "fail"
                ? bioErr
                : scan === "success"
                  ? "تأیید شد"
                  : "برای ورود، دکمه را بزنید و اثر انگشت خود را تأیید کنید"}
          </p>
          {bioSupport === "demo" && (
            <p className="text-[11px] text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <MI name="info" size={13} />
              حالت نمایشی وب — در اپ اندروید از سنسور واقعی اثر انگشت استفاده می‌شود
            </p>
          )}
        </div>

        {/* روش جایگزین: رمز عبور */}
        <div className="w-full max-w-xs space-y-2.5">
          {passMode ? (
            <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-2xl p-3.5 space-y-3 shadow-sm">
              <div className="flex items-center gap-2 pb-1 border-b border-outline-variant/30">
                <MI name="lock" size={16} className="text-primary" />
                <span className="text-label-md font-bold text-on-surface">ورود با رمز عبور</span>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void unlockWithPassword();
                }}
                placeholder="رمز عبور حساب"
                autoComplete="current-password"
                dir="ltr"
                style={{ textAlign: "left" }}
                aria-label="رمز عبور"
                className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {passErr && (
                <p className="text-[11px] text-error bg-error/10 rounded-lg px-2.5 py-1.5" role="alert">
                  {passErr}
                </p>
              )}
              <button
                type="button"
                onClick={() => void unlockWithPassword()}
                disabled={passBusy}
                className="w-full bg-primary text-white rounded-xl py-2.5 text-sm font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-80"
              >
                {passBusy ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <MI name="lock_open" size={17} />
                )}
                {passBusy ? "در حال بررسی..." : "باز کردن قفل"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPassMode(false);
                  setPassErr("");
                }}
                className="w-full text-label-md text-on-surface-variant hover:text-on-surface-variant py-1 transition-colors"
              >
                بازگشت به اثر انگشت
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPassMode(true)}
              className="text-label-md font-bold text-primary bg-primary/10 hover:bg-primary/15 rounded-xl px-4 py-2.5 active:scale-95 transition-all flex items-center gap-2 mx-auto"
            >
              <MI name="key" size={16} />
              ورود با رمز عبور
            </button>
          )}
        </div>
      </div>

      <div className="pb-6 text-center shrink-0">
        <p className="text-[11px] text-on-surface-variant font-medium">درمسیر — امنیت حساب شما</p>
      </div>
    </div>
  );
}
