"use client";

// ============================================================
// کاربران و مسافران — بازتولید وفادار طراحی Stitch (_6/code.html)
// هدر آماری + فیلتر/جستجو + جدول + کارت مسافر انتخابی + دیالوگ جزئیات
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { gw } from "@/lib/gw";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------- انواع ----------

type AppUserRow = {
  id: string;
  displayName: string;
  phone: string | null;
  deviceModel: string | null;
  city: string;
  status: string; // ACTIVE | BLOCKED
  tripsCount: number;
  voiceCount: number;
  createdAt: string;
  lastSeenAt: string | null;
};

type Stats = {
  total: number;
  active: number;
  blocked: number;
  todayTrips: number;
  newThisMonth: number;
  growthPct: number | null;
};

type UsersData = {
  users: AppUserRow[];
  total: number;
  page: number;
  pages: number;
  stats: Stats;
  cities: string[];
};

type StatusFilter = "ALL" | "ACTIVE" | "BLOCKED";
type StatusValue = "ACTIVE" | "BLOCKED";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "فعال",
  BLOCKED: "مسدود",
};

// ---------- کمک‌متدها ----------

/** اعداد فارسی */
const fa = (v: number | string) =>
  String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

/** حرف اول نام و نام خانوادگی برای آواتار — «ع.ص» */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}.${parts[1][0]}`;
}

/** شناسه نمایشی کاربر — USR-XXXXXXXX */
const uid = (id: string) => `USR-${id.slice(-8).toUpperCase()}`;

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("fa-IR") : "—";

const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("fa-IR") : "—";

/** زمان نسبی فارسی — «۱۲ دقیقه پیش» */
function relTime(v?: string | null): string {
  if (!v) return "بدون بازدید";
  const diff = Date.now() - new Date(v).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "لحظاتی پیش";
  if (minutes < 60) return `${fa(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${fa(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${fa(days)} روز پیش`;
  return fmtDate(v);
}

/** ساخت URL فراخوانی API با رعایت قواعد gateway */
function apiUrl(
  path: string,
  params?: Record<string, string | number>
): string {
  const base = gw(path);
  if (!params) return base;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${qs.toString()}`;
}

/** فهرست شماره صفحه با سه‌نقطه — مطابق طراحی */
function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const wanted = new Set<number>([1, 2, page - 1, page, page + 1, pages - 1, pages]);
  const sorted = [...wanted]
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

// ---------- کامپوننت اصلی ----------

export default function UsersClient() {
  const searchParams = useSearchParams();

  // خواندن ?q= (جستجوی سریع هدر پنل)
  const [qInput, setQInput] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [q, setQ] = useState(() => searchParams.get("q")?.trim() ?? "");

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [city, setCity] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const [data, setData] = useState<UsersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<AppUserRow | null>(null);
  const [pending, setPending] = useState<{ user: AppUserRow; to: StatusValue } | null>(null);
  const [applying, setApplying] = useState(false);
  const [role, setRole] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  const canEdit = role !== "VIEWER";

  const stats = data?.stats ?? {
    total: 0,
    active: 0,
    blocked: 0,
    todayTrips: 0,
    newThisMonth: 0,
    growthPct: null,
  };

  // جستجو با debounce
  useEffect(() => {
    const t = setTimeout(() => {
      const v = qInput.trim();
      setQ((prev) => (prev === v ? prev : v));
    }, 400);
    return () => clearTimeout(t);
  }, [qInput]);

  // با تغییر فیلترها به صفحه اول برگرد
  useEffect(() => {
    setPage(1);
  }, [q, status, city, pageSize]);

  // دریافت فهرست کاربران
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, pageSize };
      if (q) params.q = q;
      if (status !== "ALL") params.status = status;
      if (city !== "ALL") params.city = city;
      const res = await fetch(apiUrl("/api/v1/users", params));
      const json = (await res.json()) as
        | (UsersData & { ok: boolean; error?: string })
        | { ok: false; error: string };
      if ("ok" in json && json.ok) {
        setData(json);
        setSelectedId((prev) =>
          prev && json.users.some((u) => u.id === prev)
            ? prev
            : json.users[0]?.id ?? null
        );
      } else {
        toast.error(("error" in json && json.error) || "خطا در دریافت فهرست کاربران");
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      setLoading(false);
    }
  }, [q, status, city, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  // نقش مدیر فعلی (برای قفل عملیات ناظر)
  useEffect(() => {
    fetch(gw("/api/v1/auth/me"))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.ok && j.admin) setRole(String(j.admin.role));
      })
      .catch(() => {});
  }, []);

  const selected = useMemo(
    () => data?.users.find((u) => u.id === selectedId) ?? null,
    [data, selectedId]
  );

  // ---------- تغییر وضعیت حساب (مسدود / رفع مسدودی) ----------
  async function applyStatus(user: AppUserRow, to: StatusValue) {
    setApplying(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/users/${user.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      const json = await res.json();
      if (res.ok && json?.ok) {
        toast.success(
          to === "BLOCKED"
            ? `حساب «${user.displayName}» مسدود شد`
            : `حساب «${user.displayName}» دوباره فعال شد`
        );
        setPending(null);
        setDetailUser((prev) => (prev && prev.id === user.id ? json.user : prev));
        await load();
      } else {
        setPending(null);
        toast.error(
          json?.error ||
            (res.status === 403 ? "دسترسی شما فقط مشاهده است" : "عملیات ناموفق بود")
        );
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      setApplying(false);
    }
  }

  function openDetail(u: AppUserRow) {
    setDetailUser(u);
    setDetailOpen(true);
  }

  function requireConfirm(u: AppUserRow) {
    if (!canEdit) {
      toast.error("دسترسی شما فقط مشاهده است");
      return;
    }
    setPending({ user: u, to: u.status === "ACTIVE" ? "BLOCKED" : "ACTIVE" });
  }

  // ---------- خروجی CSV ----------
  async function exportCsv() {
    setExporting(true);
    try {
      const params: Record<string, string | number> = { page: 1, pageSize: 100 };
      if (q) params.q = q;
      if (status !== "ALL") params.status = status;
      if (city !== "ALL") params.city = city;
      const res = await fetch(apiUrl("/api/v1/users", params));
      const json = await res.json();
      if (!json?.ok) throw new Error("failed");
      const rows = json.users as AppUserRow[];
      const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const head = ["نام نمایشی", "تلفن", "شهر", "دستگاه", "وضعیت", "سفرها", "دستور صوتی", "تاریخ عضویت", "آخرین بازدید"];
      const lines = [head.map(esc).join(",")].concat(
        rows.map((u) =>
          [
            u.displayName,
            u.phone,
            u.city,
            u.deviceModel,
            STATUS_LABEL[u.status] ?? u.status,
            u.tripsCount,
            u.voiceCount,
            fmtDate(u.createdAt),
            fmtDate(u.lastSeenAt),
          ]
            .map(esc)
            .join(",")
        )
      );
      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "darmasir-users.csv";
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`خروجی CSV با ${fa(rows.length)} کاربر آماده شد`);
    } catch {
      toast.error("ساخت خروجی CSV ناموفق بود");
    } finally {
      setExporting(false);
    }
  }

  const from = data && data.total > 0 ? (data.page - 1) * pageSize + 1 : 0;
  const to = data ? Math.min(data.page * pageSize, data.total) : 0;

  return (
    <div className="space-y-6">
      {/* ==================== ۱. نوار اقدام بالای صفحه ==================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-headline-md font-headline-md text-on-surface font-extrabold tracking-tight">
              مدیریت کاربران و حساب‌های مسافران
            </h1>
            <span className="text-label-sm font-label-sm px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-bold">
              {fa(stats.total)} مسافر
            </span>
          </div>
          <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
            پایش وضعیت حساب‌ها، سوابق سفر و مدیریت دسترسی‌های مسافران شبکه درون‌شهری درمسیر
          </p>
        </div>
        {/* دکمه‌های اقدام */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => void exportCsv()}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-surface-container-lowest hover:bg-surface-container border border-outline-variant rounded-xl text-label-md font-label-md text-on-surface transition-all active:scale-95 shadow-sm disabled:opacity-50 disabled:active:scale-100"
          >
            <span className="material-symbols-outlined text-body-md text-tertiary">download</span>
            <span>{exporting ? "در حال آماده‌سازی..." : "خروجی اکسل / CSV"}</span>
          </button>
          <button
            onClick={() => toast.info("ارسال پیام همگانی در نسخه‌های بعدی پنل فعال می‌شود")}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/40 rounded-xl text-label-md font-label-md text-primary transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-body-md">campaign</span>
            <span>ارسال پیام همگانی به مسافران</span>
          </button>
          <button
            onClick={() => toast.info("ثبت دستی کاربر در نسخه‌های بعدی پنل فعال می‌شود")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-xl text-label-md font-label-md transition-all active:scale-95 shadow-sm shadow-primary/30"
          >
            <span className="material-symbols-outlined text-body-md">person_add</span>
            <span>ثبت کاربر جدید / پشتیبانی دستی</span>
          </button>
        </div>
      </div>

      {/* ==================== ۲. کارت‌های شاخص آماری ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* کل مسافران */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-sm flex flex-col justify-between hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-body-sm font-body-sm text-outline">کل مسافران ثبت‌نامی</span>
            <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-body-lg">groups</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-headline-lg font-headline-lg text-on-surface">
              {fa(stats.total)} <span className="text-label-md font-label-md text-outline">نفر</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-label-sm font-label-sm flex-wrap">
              {stats.growthPct !== null ? (
                <>
                  <span className={cn("flex items-center gap-0.5 font-bold", stats.growthPct >= 0 ? "text-tertiary" : "text-error")}>
                    <span className="material-symbols-outlined text-body-sm">
                      {stats.growthPct >= 0 ? "trending_up" : "trending_down"}
                    </span>
                    {fa(Math.abs(stats.growthPct))}٪ {stats.growthPct >= 0 ? "رشد" : "کاهش"}
                  </span>
                  <span className="text-on-surface-variant font-normal">نسبت به ماه گذشته</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-body-sm text-tertiary">trending_up</span>
                  <span className="text-on-surface-variant font-normal">
                    ثبت‌نام این ماه: <b className="text-tertiary">{fa(stats.newThisMonth)}</b> نفر
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* کاربران فعال */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-sm flex flex-col justify-between hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-body-sm font-body-sm text-outline">کاربران فعال</span>
            <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-body-lg">directions_subway</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-headline-lg font-headline-lg text-on-surface">
              {fa(stats.active)} <span className="text-label-md font-label-md text-outline">مسافر فعال</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-on-surface-variant text-label-sm font-label-sm">
              <span className="w-2 h-2 rounded-full bg-tertiary"></span>
              <span>حساب با دسترسی کامل به سرویس‌های درمسیر</span>
            </div>
          </div>
        </div>

        {/* حساب‌های مسدود */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-sm flex flex-col justify-between hover:border-secondary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-body-sm font-body-sm text-outline">حساب‌های مسدود</span>
            <div className="w-8 h-8 rounded-lg bg-error-container/60 flex items-center justify-center text-error">
              <span className="material-symbols-outlined text-body-lg">gavel</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-headline-lg font-headline-lg text-secondary">
              {fa(stats.blocked)} <span className="text-label-md font-label-md text-outline">حساب</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-on-surface-variant text-label-sm font-label-sm">
              <span className="material-symbols-outlined text-body-sm text-error">shield</span>
              <span>قابل رفع با «رفع مسدودی» توسط اپراتور</span>
            </div>
          </div>
        </div>

        {/* سفرهای امروز */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-sm flex flex-col justify-between hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-body-sm font-body-sm text-outline">سفرهای امروز</span>
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined text-body-lg">route</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-headline-lg font-headline-lg text-on-surface">
              {fa(stats.todayTrips)} <span className="text-label-md font-label-md text-outline">سفر</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-on-surface-variant text-label-sm font-label-sm">
              <span className="material-symbols-outlined text-body-sm text-outline">reviews</span>
              <span>مجموع سفر کاربرانی که امروز در سامانه بوده‌اند</span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== ۳. فیلتر، جستجو و کنترل‌ها ==================== */}
      <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/60 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute right-3.5 top-1/2 -translate-y-1/2 text-outline text-body-lg">search</span>
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              className="w-full pr-11 pl-10 py-2 bg-surface-container-low text-on-surface placeholder:text-outline border border-outline-variant rounded-xl text-body-sm font-body-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              placeholder="جستجو بر اساس نام مسافر یا شماره موبایل..."
              type="text"
              aria-label="جستجوی کاربران"
            />
            {qInput && (
              <button
                onClick={() => setQInput("")}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface rounded p-0.5 transition-colors"
                title="پاک کردن جستجو"
                aria-label="پاک کردن جستجو"
              >
                <span className="material-symbols-outlined text-body-md">close</span>
              </button>
            )}
          </div>
          {/* فیلتر شهر و تعداد در صفحه */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={city} onValueChange={(v) => setCity(v)}>
              <SelectTrigger className="bg-surface-container-low border-outline-variant rounded-xl text-body-sm font-body-sm text-on-surface h-10 w-auto min-w-40 px-3 gap-1.5 shadow-none focus:ring-1 focus:ring-primary [&_svg]:text-outline">
                <span className="material-symbols-outlined text-primary text-body-md">location_city</span>
                <span className="text-outline text-label-sm">شهر:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-outline-variant">
                <SelectItem value="ALL">همه شهرها</SelectItem>
                {(data?.cities ?? []).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="bg-surface-container-low border-outline-variant rounded-xl text-body-sm font-body-sm text-on-surface h-10 w-auto min-w-36 px-3 gap-1.5 shadow-none focus:ring-1 focus:ring-primary [&_svg]:text-outline">
                <span className="material-symbols-outlined text-outline text-body-md">tune</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-outline-variant">
                <SelectItem value="12">{fa(12)} کاربر در صفحه</SelectItem>
                <SelectItem value="24">{fa(24)} کاربر در صفحه</SelectItem>
                <SelectItem value="48">{fa(48)} کاربر در صفحه</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {/* تب‌های وضعیت */}
        <div className="flex items-center gap-2 border-t border-outline-variant/40 pt-3 overflow-x-auto text-label-md font-label-md">
          {(
            [
              { key: "ALL", label: "همه کاربران", count: stats.total, activeCls: "bg-primary-container text-on-primary-container", badgeCls: "bg-primary/20" },
              { key: "ACTIVE", label: "مسافران فعال", count: stats.active, activeCls: "bg-tertiary-fixed text-on-tertiary-fixed", badgeCls: "bg-tertiary/20" },
              { key: "BLOCKED", label: "حساب‌های مسدود", count: stats.blocked, activeCls: "bg-error-container text-error", badgeCls: "bg-error/20" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatus(tab.key)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0 transition-colors",
                status === tab.key
                  ? cn(tab.activeCls, "font-bold")
                  : "text-on-surface-variant hover:bg-surface-container"
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "text-label-sm px-1.5 py-0.2 rounded-full",
                  status === tab.key ? tab.badgeCls : "bg-surface-container-high"
                )}
              >
                {fa(tab.count)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ==================== ۴. جدول کاربران + کارت مسافر انتخابی ==================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* جدول اصلی */}
        <div className="xl:col-span-8 bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-right border-collapse min-w-[820px]">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant text-label-md font-label-md text-on-surface-variant">
                  <th className="p-3.5 pr-4">مشخصات مسافر</th>
                  <th className="p-3.5">شناسه کاربری</th>
                  <th className="p-3.5">شهر و عضویت</th>
                  <th className="p-3.5">دستگاه</th>
                  <th className="p-3.5">وضعیت حساب</th>
                  <th className="p-3.5">سفرها</th>
                  <th className="p-3.5">آخرین بازدید</th>
                  <th className="p-3.5 pl-4 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40 text-body-sm font-body-sm">
                {loading
                  ? [0, 1, 2, 3, 4].map((i) => (
                      <tr key={`sk-${i}`} className="animate-pulse">
                        <td className="p-3.5 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-surface-container" />
                            <div className="space-y-1.5">
                              <div className="h-3 w-28 rounded bg-surface-container" />
                              <div className="h-2.5 w-20 rounded bg-surface-container" />
                            </div>
                          </div>
                        </td>
                        {[0, 1, 2, 3, 4, 5, 6].map((j) => (
                          <td key={j} className="p-3.5">
                            <div className="h-3 w-16 rounded bg-surface-container" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data && data.users.length > 0 ? (
                      data.users.map((u) => {
                        const isSelected = u.id === selectedId;
                        const blocked = u.status === "BLOCKED";
                        return (
                          <tr
                            key={u.id}
                            onClick={() => setSelectedId(u.id)}
                            className={cn(
                              "cursor-pointer transition-colors",
                              isSelected
                                ? "bg-primary/5 border-r-4 border-r-primary hover:bg-primary/10"
                                : blocked
                                  ? "bg-error-container/10 hover:bg-error-container/20"
                                  : "hover:bg-surface-container-low"
                            )}
                          >
                            <td className="p-3.5 pr-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "w-9 h-9 rounded-full flex items-center justify-center font-bold text-label-md shrink-0",
                                    blocked
                                      ? "bg-secondary-fixed text-on-secondary-fixed"
                                      : "bg-primary-container text-on-primary-container ring-2 ring-primary/20"
                                  )}
                                >
                                  {initials(u.displayName)}
                                </div>
                                <div>
                                  <div className="font-bold text-on-surface flex items-center gap-1.5">
                                    <span>{u.displayName}</span>
                                    {blocked && (
                                      <span className="material-symbols-outlined text-secondary text-body-sm" title="هشدار: حساب مسدود">warning</span>
                                    )}
                                  </div>
                                  <div className="text-label-sm font-label-sm text-outline" dir="ltr">
                                    {u.phone ?? "بدون شماره"}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3.5 text-label-sm font-label-sm text-outline font-mono" dir="ltr">
                              {uid(u.id)}
                            </td>
                            <td className="p-3.5">
                              <span className="text-on-surface block font-medium">{u.city}</span>
                              <span className="text-label-sm font-label-sm text-outline">عضویت: {fmtDate(u.createdAt)}</span>
                            </td>
                            <td className="p-3.5">
                              <div className="flex items-center gap-1.5 text-on-surface-variant">
                                <span className="material-symbols-outlined text-body-sm text-outline">devices</span>
                                <span className="text-label-sm font-label-sm font-semibold text-on-surface" dir="ltr">
                                  {u.deviceModel ?? "نامشخص"}
                                </span>
                              </div>
                            </td>
                            <td className="p-3.5">
                              {blocked ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-label-sm font-label-sm bg-error-container text-error font-bold"
                                  title="حساب مسدود شده توسط پنل مدیریت"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                                  مسدود
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-label-sm font-label-sm bg-tertiary-fixed text-on-tertiary-fixed font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
                                  فعال
                                </span>
                              )}
                            </td>
                            <td className="p-3.5">
                              <span className="font-bold text-on-surface">{fa(u.tripsCount)} سفر</span>
                              <span className="block text-label-sm font-label-sm text-outline">صوتی: {fa(u.voiceCount)}</span>
                            </td>
                            <td className="p-3.5 text-label-sm font-label-sm text-outline">
                              <span className={cn("block", blocked && "text-error")}>{relTime(u.lastSeenAt)}</span>
                              <span className={cn("block", blocked ? "text-error font-medium" : "text-on-surface-variant font-medium")}>
                                {fmtDate(u.lastSeenAt)}
                              </span>
                            </td>
                            <td className="p-3.5 pl-4 text-center">
                              <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => openDetail(u)}
                                  className="p-1.5 text-primary hover:bg-primary-fixed rounded-lg transition-colors"
                                  title="مشاهده جزئیات"
                                >
                                  <span className="material-symbols-outlined text-body-md">visibility</span>
                                </button>
                                <button
                                  onClick={() => requireConfirm(u)}
                                  disabled={!canEdit}
                                  className={cn(
                                    "p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                                    blocked
                                      ? "text-tertiary hover:bg-tertiary-fixed/40"
                                      : "text-error hover:bg-error-container"
                                  )}
                                  title={canEdit ? (blocked ? "رفع مسدودی حساب" : "مسدودسازی حساب") : "دسترسی شما فقط مشاهده است"}
                                >
                                  <span className="material-symbols-outlined text-body-md">{blocked ? "lock_open" : "block"}</span>
                                </button>
                                <button
                                  onClick={() => openDetail(u)}
                                  className="p-1.5 text-outline hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors"
                                  title="بیشتر"
                                >
                                  <span className="material-symbols-outlined text-body-md">more_vert</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-10 text-center">
                          <span className="material-symbols-outlined text-headline-xl text-outline block mb-3">person_off</span>
                          <div className="text-title-md font-title-md text-on-surface font-bold">کاربری با این مشخصات یافت نشد</div>
                          <div className="text-body-sm font-body-sm text-on-surface-variant mt-1">
                            عبارت جستجو یا فیلترهای شهر و وضعیت را تغییر دهید
                          </div>
                        </td>
                      </tr>
                    )}
              </tbody>
            </table>
          </div>

          {/* پانوشت صفحه‌بندی */}
          <div className="p-3.5 bg-surface-container-low border-t border-outline-variant flex flex-col sm:flex-row items-center justify-between gap-3 text-label-md font-label-md text-on-surface-variant">
            <div className="flex items-center gap-2 flex-wrap">
              <span>
                نمایش مسافر <b>{fa(from)}</b> تا <b>{fa(to)}</b> از <b>{fa(data?.total ?? 0)}</b> مسافر
              </span>
              <span className="text-outline">|</span>
              <span className="text-label-sm font-label-sm text-tertiary flex items-center gap-1">
                <span className="material-symbols-outlined text-body-sm">sync</span>
                همگام با پایگاه داده سامانه
              </span>
            </div>
            {/* دکمه‌های صفحه */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!data || data.page <= 1}
                className="p-1.5 text-outline hover:text-on-surface rounded-lg border border-outline-variant/60 hover:bg-surface-container transition-colors disabled:opacity-40 disabled:hover:text-outline"
                title="صفحه قبل"
                aria-label="صفحه قبل"
              >
                <span className="material-symbols-outlined text-body-md">chevron_right</span>
              </button>
              {(data ? pageList(data.page, data.pages) : [1]).map((p, i) =>
                p === "…" ? (
                  <span key={`e-${i}`} className="px-1 text-outline">…</span>
                ) : (
                  <button
                    key={`p-${p}`}
                    onClick={() => setPage(p)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-label-md transition-colors",
                      data?.page === p
                        ? "bg-primary text-on-primary font-bold"
                        : "hover:bg-surface-container text-on-surface font-semibold"
                    )}
                  >
                    {fa(p)}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => (data ? Math.min(data.pages, p + 1) : p))}
                disabled={!data || data.page >= data.pages}
                className="p-1.5 text-outline hover:text-on-surface rounded-lg border border-outline-variant/60 hover:bg-surface-container transition-colors disabled:opacity-40 disabled:hover:text-outline"
                title="صفحه بعد"
                aria-label="صفحه بعد"
              >
                <span className="material-symbols-outlined text-body-md">chevron_left</span>
              </button>
            </div>
          </div>
        </div>

        {/* کارت مسافر انتخابی */}
        <div className="xl:col-span-4 bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-title-md">badge</span>
              <h3 className="text-title-md font-title-md text-on-surface font-bold">کارت هوشمند مسافر انتخابی</h3>
            </div>
            <span className="text-label-sm font-label-sm px-2 py-0.5 rounded bg-surface-container text-outline font-mono" title="استاندارد حریم خصوصی">
              MRT-PRIVACY-403
            </span>
          </div>

          {selected ? (
            <>
              {/* سرصفحه مسافر */}
              <div className="flex items-start gap-3.5">
                <div
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-headline-md shrink-0",
                    selected.status === "BLOCKED"
                      ? "bg-secondary-fixed text-on-secondary-fixed ring-4 ring-secondary/10"
                      : "bg-primary text-on-primary ring-4 ring-primary/10"
                  )}
                >
                  {initials(selected.displayName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="text-title-lg font-title-lg text-on-surface font-bold">{selected.displayName}</h4>
                    <span
                      className={cn(
                        "text-label-sm font-label-sm px-2 py-0.5 rounded-full font-bold",
                        selected.status === "BLOCKED"
                          ? "bg-error-container text-error"
                          : "bg-tertiary-fixed text-on-tertiary-fixed"
                      )}
                    >
                      {selected.status === "BLOCKED" ? "حساب مسدود" : "حساب فعال"}
                    </span>
                  </div>
                  <div className="text-body-sm font-body-sm text-outline mt-0.5" dir="ltr">
                    {selected.phone ?? "بدون شماره تماس"}
                  </div>
                  <div className="text-label-sm font-label-sm text-on-surface-variant mt-1 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-body-sm text-outline">pin_drop</span>
                    <span>
                      {selected.city}
                      {selected.deviceModel ? ` — ${selected.deviceModel}` : ""}
                    </span>
                  </div>
                </div>
              </div>

              {/* کارت گرادیانی سفر */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary via-primary-container to-surface-tint text-on-primary space-y-3 shadow-md shadow-primary/20 relative overflow-hidden">
                <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-white/10 blur-xl"></div>
                <div className="flex items-center justify-between text-label-sm font-label-sm opacity-90">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-body-md">contactless</span>
                    کارت ناوبری درمسیر
                  </span>
                  <span className="font-mono" dir="ltr">{uid(selected.id)}</span>
                </div>
                <div className="flex items-baseline justify-between pt-1 gap-2">
                  <div>
                    <span className="text-label-sm font-label-sm opacity-80 block">سفرهای ثبت‌شده مسافر:</span>
                    <span className="text-headline-md font-headline-md font-black">
                      {fa(selected.tripsCount)} <span className="text-label-md font-label-md font-normal opacity-90">سفر</span>
                    </span>
                  </div>
                  <span className="text-label-sm font-label-sm bg-white/20 px-2 py-1 rounded-lg backdrop-blur-sm shrink-0">
                    دستیار صوتی: {fa(selected.voiceCount)}
                  </span>
                </div>
              </div>

              {/* خلاصه آمار */}
              <div className="space-y-2 border-t border-outline-variant/60 pt-3">
                <span className="text-label-md font-label-md font-bold text-on-surface block">خلاصه کارکرد مسافر</span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-surface-container-low">
                    <span className="text-title-md font-title-md font-extrabold text-primary block">{fa(selected.tripsCount)}</span>
                    <span className="text-label-sm font-label-sm text-outline">سفر ثبت‌شده</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-container-low">
                    <span className="text-title-md font-title-md font-extrabold text-tertiary block">{fa(selected.voiceCount)}</span>
                    <span className="text-label-sm font-label-sm text-outline">دستور صوتی</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-container-low">
                    <span className="text-title-md font-title-md font-extrabold text-on-surface block">
                      {fa(Math.max(1, Math.floor((Date.now() - new Date(selected.createdAt).getTime()) / 86400000)))}
                    </span>
                    <span className="text-label-sm font-label-sm text-outline">روز عضویت</span>
                  </div>
                </div>
              </div>

              {/* مشخصات حساب */}
              <div className="space-y-2 border-t border-outline-variant/60 pt-3 text-label-md font-label-md">
                <span className="text-label-md font-label-md font-bold text-on-surface block">مشخصات حساب</span>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-container-low">
                  <span className="material-symbols-outlined text-body-md text-outline">devices</span>
                  <span className="text-outline">دستگاه:</span>
                  <span className="text-on-surface font-bold" dir="ltr">{selected.deviceModel ?? "نامشخص"}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-container-low">
                  <span className="material-symbols-outlined text-body-md text-outline">event</span>
                  <span className="text-outline">تاریخ عضویت:</span>
                  <span className="text-on-surface font-bold">{fmtDate(selected.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-container-low">
                  <span className="material-symbols-outlined text-body-md text-outline">schedule</span>
                  <span className="text-outline">آخرین بازدید:</span>
                  <span className="text-on-surface font-bold">{relTime(selected.lastSeenAt)}</span>
                </div>
              </div>

              {/* دکمه‌های اقدام کارت */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={() => openDetail(selected)}
                  className="flex-1 py-2 px-3 bg-surface-container-high hover:bg-surface-container-highest text-primary rounded-xl text-label-md font-label-md transition-colors flex items-center justify-center gap-1.5 font-bold"
                >
                  <span className="material-symbols-outlined text-body-md">history</span>
                  <span>جزئیات کامل حساب</span>
                </button>
                <button
                  onClick={() => requireConfirm(selected)}
                  disabled={!canEdit}
                  title={canEdit ? (selected.status === "ACTIVE" ? "مسدودسازی موقت" : "رفع مسدودی") : "دسترسی شما فقط مشاهده است"}
                  className={cn(
                    "py-2 px-3 rounded-xl text-label-md font-label-md font-bold transition-colors flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed",
                    selected.status === "ACTIVE"
                      ? "bg-error-container text-error hover:bg-error-container/80"
                      : "bg-tertiary-fixed text-on-tertiary-fixed hover:bg-tertiary-fixed/70"
                  )}
                >
                  <span className="material-symbols-outlined text-body-md">
                    {selected.status === "ACTIVE" ? "block" : "lock_open"}
                  </span>
                  <span>{selected.status === "ACTIVE" ? "مسدودسازی" : "رفع مسدودی"}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="py-12 text-center">
              <span className="material-symbols-outlined text-headline-lg text-outline block mb-2">touch_app</span>
              <p className="text-body-md font-body-md text-on-surface-variant">
                برای مشاهده کارت، یک مسافر را از جدول انتخاب کنید
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ==================== دیالوگ جزئیات کاربر ==================== */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg bg-surface-container-lowest border-outline-variant p-6 gap-0 max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-title-lg font-title-lg text-on-surface font-bold">
              <span className="material-symbols-outlined text-primary">badge</span>
              جزئیات کاربر و مسافر
            </DialogTitle>
            <DialogDescription className="text-body-sm font-body-sm text-on-surface-variant mt-1">
              بررسی کامل فیلدهای حساب، آمار سفر و دستورهای صوتی مسافر
            </DialogDescription>
          </DialogHeader>

          {detailUser && (
            <div className="mt-4 space-y-4">
              {/* سرصفحه */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/60">
                <div
                  className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center font-bold text-label-lg shrink-0",
                    detailUser.status === "BLOCKED"
                      ? "bg-secondary-fixed text-on-secondary-fixed"
                      : "bg-primary-container text-on-primary-container ring-2 ring-primary/20"
                  )}
                >
                  {initials(detailUser.displayName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-title-md font-title-md text-on-surface font-bold">{detailUser.displayName}</div>
                  <div className="text-label-sm font-label-sm text-outline" dir="ltr">
                    {detailUser.phone ?? "بدون شماره تماس"}
                  </div>
                </div>
                <span
                  className={cn(
                    "text-label-sm font-label-sm px-2.5 py-0.5 rounded-full font-bold shrink-0",
                    detailUser.status === "BLOCKED"
                      ? "bg-error-container text-error"
                      : "bg-tertiary-fixed text-on-tertiary-fixed"
                  )}
                >
                  {STATUS_LABEL[detailUser.status] ?? detailUser.status}
                </span>
              </div>

              {/* آمار سفر و صدا */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/60 text-center">
                  <span className="material-symbols-outlined text-body-lg text-primary block mb-1">route</span>
                  <span className="text-headline-md font-headline-md font-extrabold text-primary block">{fa(detailUser.tripsCount)}</span>
                  <span className="text-label-sm font-label-sm text-outline">سفر ثبت‌شده</span>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/60 text-center">
                  <span className="material-symbols-outlined text-body-lg text-tertiary block mb-1">record_voice_over</span>
                  <span className="text-headline-md font-headline-md font-extrabold text-tertiary block">{fa(detailUser.voiceCount)}</span>
                  <span className="text-label-sm font-label-sm text-outline">دستور صوتی</span>
                </div>
              </div>

              {/* همه فیلدها */}
              <div className="divide-y divide-outline-variant/40 rounded-xl border border-outline-variant/60 overflow-hidden">
                {[
                  { icon: "person", label: "نام نمایشی", value: detailUser.displayName },
                  { icon: "call", label: "شماره تماس", value: detailUser.phone ?? "ثبت نشده", ltr: true },
                  { icon: "devices", label: "دستگاه", value: detailUser.deviceModel ?? "نامشخص", ltr: true },
                  { icon: "location_city", label: "شهر", value: detailUser.city },
                  { icon: "route", label: "تعداد سفرها", value: `${fa(detailUser.tripsCount)} سفر` },
                  { icon: "record_voice_over", label: "دستورهای صوتی", value: `${fa(detailUser.voiceCount)} مورد` },
                  { icon: "event", label: "تاریخ عضویت", value: fmtDateTime(detailUser.createdAt) },
                  {
                    icon: "schedule",
                    label: "آخرین بازدید",
                    value: detailUser.lastSeenAt
                      ? `${relTime(detailUser.lastSeenAt)} — ${fmtDateTime(detailUser.lastSeenAt)}`
                      : "بدون بازدید ثبت‌شده",
                  },
                  { icon: "fingerprint", label: "شناسه رکورد", value: detailUser.id, mono: true, ltr: true },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 px-3 py-2.5 bg-surface-container-lowest">
                    <span className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                      <span className="material-symbols-outlined text-body-md">{row.icon}</span>
                    </span>
                    <span className="text-label-md font-label-md text-outline w-28 shrink-0">{row.label}</span>
                    <span
                      dir={row.ltr ? "ltr" : undefined}
                      className={cn(
                        "text-body-sm font-body-sm text-on-surface font-semibold break-all",
                        row.mono && "font-mono text-label-sm"
                      )}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <DialogFooter className="gap-2">
                <button
                  onClick={() => setDetailOpen(false)}
                  className="py-2 px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-label-md font-label-md transition-colors"
                >
                  بستن
                </button>
                <button
                  onClick={() => requireConfirm(detailUser)}
                  disabled={!canEdit}
                  title={canEdit ? undefined : "دسترسی شما فقط مشاهده است"}
                  className={cn(
                    "py-2 px-4 rounded-xl text-label-md font-label-md font-bold transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed",
                    detailUser.status === "ACTIVE"
                      ? "bg-error-container text-error hover:bg-error-container/80"
                      : "bg-tertiary-container text-on-tertiary hover:bg-tertiary-container/90"
                  )}
                >
                  <span className="material-symbols-outlined text-body-md">
                    {detailUser.status === "ACTIVE" ? "block" : "lock_open"}
                  </span>
                  <span>{detailUser.status === "ACTIVE" ? "مسدودسازی حساب" : "رفع مسدودی حساب"}</span>
                </button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== تأیید مسدودسازی / رفع مسدودی ==================== */}
      <AlertDialog open={!!pending} onOpenChange={(o) => (!o ? setPending(null) : undefined)}>
        <AlertDialogContent className="bg-surface-container-lowest border-outline-variant">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-title-lg font-title-lg text-on-surface font-bold flex items-center gap-2">
              <span
                className={cn(
                  "material-symbols-outlined",
                  pending?.to === "BLOCKED" ? "text-error" : "text-tertiary"
                )}
              >
                {pending?.to === "BLOCKED" ? "gavel" : "verified_user"}
              </span>
              {pending?.to === "BLOCKED" ? "مسدودسازی حساب کاربر" : "رفع مسدودی حساب کاربر"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-body-md font-body-md text-on-surface-variant leading-7">
              {pending?.to === "BLOCKED"
                ? `آیا از مسدودسازی حساب «${pending?.user.displayName}» مطمئن هستید؟ با تأیید این عملیات، دسترسی این مسافر به همه سرویس‌های درمسیر بلافاصله قطع می‌شود و وضعیت حساب به «مسدود» تغییر می‌کند. تاریخچه سفرها و داده‌های حساب حفظ می‌شود و هر زمان می‌توانید با گزینه «رفع مسدودی» دسترسی را دوباره بازگردانید.`
                : `با تأیید این عملیات، حساب «${pending?.user.displayName}» دوباره فعال می‌شود؛ مسافر دسترسی کامل به سرویس‌های درمسیر را بازیابی می‌کند و می‌تواند مانند قبل سفر ثبت کند و از دستیار صوتی استفاده نماید.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={applying}
              className="bg-surface-container text-on-surface hover:bg-surface-container-high border-outline-variant"
            >
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={applying}
              onClick={(e) => {
                e.preventDefault();
                if (pending && !applying) void applyStatus(pending.user, pending.to);
              }}
              className={cn(
                pending?.to === "BLOCKED"
                  ? "bg-secondary text-on-primary hover:bg-secondary/90"
                  : "bg-tertiary-container text-on-tertiary hover:bg-tertiary-container/90"
              )}
            >
              {applying ? "در حال انجام..." : pending?.to === "BLOCKED" ? "بله، مسدود کن" : "بله، فعال کن"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
