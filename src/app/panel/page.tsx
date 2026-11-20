"use client";

import { useEffect, useState } from "react";

// ============================================================
// دروازه ورود به پنل مدیریت درمسیر (پنل وب مستقل)
// پنل واقعی یک سرویس جداگانه روی پورت 3030 است و این صفحه فقط
// آن را از طریق gateway (XTransformPort) نمایش می‌دهد.
// کد پنل هیچ‌وقت وارد APK نمی‌شود — اینجا فقط یک قاب است.
// ============================================================
export default function PanelGatewayPage() {
  const [isNative, setIsNative] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    // بررسی پلتفرم در یک تیک بعد از mount تا رندر اولیه با SSR یکسان بماند
    const t = setTimeout(() => {
      if (!alive) return;
      const w = window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
      };
      setIsNative(w.Capacitor?.isNativePlatform?.() === true);
      setReady(true);
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  return (
    <main className="fixed inset-0 bg-background">
      {ready && !isNative && (
        <iframe
          src="/api/panel"
          title="پنل مدیریت درمسیر"
          className="h-full w-full border-0"
          allow="clipboard-write"
        />
      )}
      {ready && isNative && (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-lg font-bold text-foreground">پنل مدیریت درمسیر</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              پنل مدیریت فقط نسخه وب است و داخل برنامه اندروید باز نمی‌شود.
              آن را در مرورگر با نشانی پنل مدیریتی سرور باز کنید.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
