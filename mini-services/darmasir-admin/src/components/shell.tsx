"use client";

// پوسته پنل — سایدبار راست‌چین + هدر + محتوا
// نقش‌ها را می‌شناسد: «مدیران» فقط برای مدیر کل نمایش داده می‌شود.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Route,
  MapPin,
  Users,
  Megaphone,
  LifeBuoy,
  ShieldCheck,
  Settings,
  LogOut,
  Menu,
  X,
  TrainFront,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { gw, gwNav } from "@/lib/path";
import { apiFetch, clearToken } from "@/lib/client";
import type { Role } from "@/lib/roles";

export type AdminInfo = {
  id: string;
  username: string;
  name: string;
  role: Role;
};

const NAV: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}[] = [
  { href: "/", label: "داشبورد", icon: LayoutDashboard },
  { href: "/lines", label: "خطوط", icon: Route },
  { href: "/stations", label: "ایستگاه‌ها", icon: MapPin },
  { href: "/users", label: "کاربران", icon: Users },
  { href: "/ads", label: "تبلیغات", icon: Megaphone },
  { href: "/tickets", label: "پشتیبانی", icon: LifeBuoy },
  { href: "/admins", label: "مدیران", icon: ShieldCheck, adminOnly: true },
  { href: "/settings", label: "تنظیمات", icon: Settings },
];

const ROLE_LABEL: Record<Role, string> = {
  SUPERADMIN: "مدیر کل",
  OPERATOR: "اپراتور",
  VIEWER: "ناظر",
};

export function Shell({
  admin,
  children,
}: {
  admin: AdminInfo;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // بستن منوی موبایل با تغییر مسیر — الگوی مقایسه در رندر (بدون افکت)
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  const items = NAV.filter((n) => !n.adminOnly || admin.role === "SUPERADMIN");

  async function logout() {
    setLoggingOut(true);
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
    } catch {}
    // کوکی را در کلاینت هم پاک می‌کنیم — برخی محیط‌ها Set-Cookie را می‌اندازند
    clearToken();
    document.cookie = "darmasir_admin_session=; path=/; max-age=0; samesite=lax";
    window.location.href = gw("/login");
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="mb-4 flex items-center gap-3 px-2 pt-2">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <TrainFront className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">پنل مدیریت درمسیر</div>
          <div className="truncate text-xs text-muted-foreground">
            {admin.name} · {ROLE_LABEL[admin.role]}
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1" aria-label="ناوبری پنل">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={gwNav(item.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="size-4.5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4">
        <button
          onClick={logout}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          <LogOut className="size-4.5 shrink-0" />
          {loggingOut ? "در حال خروج..." : "خروج از حساب"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* سایدبار دسکتاپ — در RTL سمت راست */}
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 border-l bg-card lg:block">
        {sidebar}
      </aside>

      {/* منوی موبایل */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 right-0 w-72 border-l bg-card shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute left-3 top-3 rounded-md p-2 text-muted-foreground hover:bg-muted"
              aria-label="بستن منو"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:mr-64">
        {/* هدر موبایل */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            aria-label="بازکردن منو"
          >
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-bold">پنل مدیریت درمسیر</span>
        </header>

        <main className="mx-auto w-full max-w-6xl p-4 pb-24 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
