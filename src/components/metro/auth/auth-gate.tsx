"use client";

/* ============================================================
   دروازه حساب — طبق درخواست کاربر:
   اولین صفحه پس از نصب، صفحه ورود است؛ تا کاربر وارد نشود
   محتوای برنامه نمایش داده نمی‌شود.
   loading → اسپلش | guest → صفحه ورود | locked → قفل اثر انگشت
   ============================================================ */

import { useEffect } from "react";
import { MI } from "@/components/metro/shell";
import { useAuth } from "@/lib/auth-client";
import { AuthScreen } from "@/components/metro/auth/auth-screen";
import { LockScreen } from "@/components/metro/auth/lock-screen";

/* اسپلش شروع برنامه — در حال اعتبارسنجی نشست */
function AuthSplash() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-surface" aria-label="در حال شروع">
      <div className="w-20 h-20 rounded-3xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm flex items-center justify-center p-2.5">
        <img src="/metrojo-logo.svg" alt="لوگوی درمسیر" className="w-full h-full object-contain" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <span className="text-base font-extrabold text-primary">درمسیر</span>
        <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" aria-hidden />
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  const hydrate = useAuth((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === "loading") return <AuthSplash />;
  if (status === "guest") return <AuthScreen />;
  if (status === "locked") return <LockScreen />;

  return <>{children}</>;
}
