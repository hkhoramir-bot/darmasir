"use client";

import { useEffect, useState, useCallback } from "react";
import { MI } from "./ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** ثبت سرویس‌ورکر PWA */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

/** بنر پیشنهاد نصب اپ روی گوشی */
export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setDeferred(null));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }, [deferred]);

  if (!deferred || dismissed) return null;

  return (
    <section className="bg-gradient-to-l from-metro-primary-c to-metro-primary text-white rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-md" aria-label="نصب برنامه">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <MI name="install_mobile" size={22} fill />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold">متروجو را نصب کنید</h3>
          <p className="text-[11px] text-white/80 mt-0.5">دسترسی سریع از صفحه اصلی گوشی، حتی بدون اینترنت</p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={install}
          className="bg-metro-card text-metro-primary px-3 py-1.5 rounded-xl text-xs font-bold active:scale-95 transition-all shadow-sm"
        >
          نصب
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="بستن"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 active:scale-95 transition-all"
        >
          <MI name="close" size={16} />
        </button>
      </div>
    </section>
  );
}
