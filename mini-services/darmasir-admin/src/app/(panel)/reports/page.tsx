"use client";

import { useCallback, useEffect, useState } from "react";
import { gw } from "@/lib/gw";
import { Skeleton } from "@/components/ui/skeleton";

// ============================================================
// گزارش‌ها و تحلیل داده — بازتولید وفادار طرح Stitch (_5)
// داده واقعی از GET /api/v1/reports?range=7|30|90
// ============================================================

type Kpis = {
  totalUsers: number;
  activeUsers: number;
  newUsersRange: number;
  newUsersPrevRange: number;
  newUsersChange: number | null;
  trips: number;
  voiceRequests: number;
  avgTripsPerUser: number;
  ticketsRange: number;
  ticketsRangePrev: number;
  ticketsChange: number | null;
  ticketsClosedRange: number;
  closeRate: number;
};

type UsagePoint = { label: string; users: number; tickets: number };

type TopLine = {
  id: string;
  code: string;
  name: string;
  kind: string;
  kindLabel: string;
  stationCount: number;
  status: string;
  statusLabel: string;
  share: number;
};

type AdsPlacement = {
  placement: string;
  placementLabel: string;
  count: number;
  impressions: number;
  clicks: number;
  ctr: number;
};

type TicketCategory = { category: string; label: string; count: number; percent: number };

type ReportsData = {
  range: number;
  from: string;
  to: string;
  kpis: Kpis;
  weeklyUsage: UsagePoint[];
  weeklySeries: UsagePoint[];
  topLines: TopLine[];
  adsStats: {
    impressions: number;
    clicks: number;
    ctr: number;
    activeAds: number;
    byPlacement: AdsPlacement[];
  };
  ticketCategories: TicketCategory[];
};

const RANGES: { value: number; label: string }[] = [
  { value: 7, label: "۷ روز گذشته" },
  { value: 30, label: "۳۰ روز گذشته" },
  { value: 90, label: "سه ماه اخیر" },
];

const KIND_COLOR: Record<string, string> = {
  METRO: "bg-primary text-on-primary",
  BRT: "bg-secondary text-on-secondary",
  BUS: "bg-tertiary text-on-tertiary",
};

// اعداد فارسی با جداکننده هزارگان
const fa = (n: number | string) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
const faN = (n: number) => fa(n.toLocaleString("en-US"));

function faDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fa-IR");
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(30);
  const [grouping, setGrouping] = useState<"weekday" | "weekly">("weekday");

  const load = useCallback(async (r: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(gw(`/api/v1/reports?range=${r}`));
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "خطا در دریافت گزارش‌ها");
      setData(json.data as ReportsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای نامشخص در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  function exportCsv() {
    if (!data) return;
    const k = data.kpis;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(esc("گزارش‌ها و تحلیل داده — پنل مدیریت درمسیر"));
    lines.push([esc("بازه"), `${faDate(data.from)} تا ${faDate(data.to)}`].join(","));
    lines.push("");
    lines.push(esc("شاخص‌های کلیدی"));
    lines.push([esc("شاخص"), esc("مقدار")].join(","));
    lines.push([esc("کل کاربران"), k.totalUsers].join(","));
    lines.push([esc("کاربران فعال"), k.activeUsers].join(","));
    lines.push([esc("کاربران جدید در بازه"), k.newUsersRange].join(","));
    lines.push([esc("کاربران جدید دوره قبل"), k.newUsersPrevRange].join(","));
    lines.push([esc("تغییر کاربران جدید (درصد)"), k.newUsersChange ?? 0].join(","));
    lines.push([esc("کل سفرهای ثبت‌شده"), k.trips].join(","));
    lines.push([esc("میانگین سفر به ازای هر کاربر"), k.avgTripsPerUser].join(","));
    lines.push([esc("تیکت‌های دریافتی در بازه"), k.ticketsRange].join(","));
    lines.push([esc("تیکت‌های بسته‌شده در بازه"), k.ticketsClosedRange].join(","));
    lines.push([esc("نرخ بسته شدن (درصد)"), k.closeRate].join(","));
    lines.push("");
    lines.push(esc("استفاده هفتگی (روزهای هفته)"));
    lines.push([esc("روز"), esc("ثبت‌نام کاربران"), esc("تیکت‌های دریافتی")].join(","));
    for (const p of data.weeklyUsage) {
      lines.push([esc(p.label), p.users, p.tickets].join(","));
    }
    lines.push("");
    lines.push(esc("استفاده هفتگی (سری هفتگی)"));
    lines.push([esc("دوره"), esc("ثبت‌نام کاربران"), esc("تیکت‌های دریافتی")].join(","));
    for (const p of data.weeklySeries) {
      lines.push([esc(p.label), p.users, p.tickets].join(","));
    }
    lines.push("");
    lines.push(esc("محبوب‌ترین خطوط بر اساس تعداد ایستگاه"));
    lines.push([esc("کد"), esc("نام خط"), esc("نوع"), esc("تعداد ایستگاه"), esc("سهم (درصد)"), esc("وضعیت")].join(","));
    for (const l of data.topLines) {
      lines.push([esc(l.code), esc(l.name), esc(l.kindLabel), l.stationCount, l.share, esc(l.statusLabel)].join(","));
    }
    lines.push("");
    lines.push(esc("آمار تبلیغات"));
    lines.push([esc("جمع نمایش‌ها"), data.adsStats.impressions].join(","));
    lines.push([esc("جمع کلیک‌ها"), data.adsStats.clicks].join(","));
    lines.push([esc("نرخ کلیک CTR (درصد)"), data.adsStats.ctr].join(","));
    lines.push([esc("کمپین‌های فعال"), data.adsStats.activeAds].join(","));
    lines.push([esc("جایگاه"), esc("تعداد کمپین"), esc("نمایش"), esc("کلیک"), esc("CTR (درصد)")].join(","));
    for (const p of data.adsStats.byPlacement) {
      lines.push([esc(p.placementLabel), p.count, p.impressions, p.clicks, p.ctr].join(","));
    }
    lines.push("");
    lines.push(esc("توزیع تیکت‌ها بر اساس دسته"));
    lines.push([esc("دسته"), esc("تعداد"), esc("سهم (درصد)")].join(","));
    for (const t of data.ticketCategories) {
      lines.push([esc(t.label), t.count, t.percent].join(","));
    }
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports-range-${data.range}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <ReportsSkeleton />;
  if (error || !data)
    return (
      <div className="p-4 sm:p-6">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-8 flex flex-col items-center gap-4 text-center">
          <span className="w-12 h-12 rounded-xl bg-error-container/60 text-error flex items-center justify-center">
            <span className="material-symbols-outlined text-headline-md">cloud_off</span>
          </span>
          <div>
            <p className="text-title-md font-title-md text-on-surface font-bold">دریافت گزارش‌ها ناموفق بود</p>
            <p className="text-body-md font-body-md text-on-surface-variant mt-1">{error}</p>
          </div>
          <button
            onClick={() => load(range)}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl text-label-lg font-label-lg shadow-sm hover:bg-primary-container transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-title-md">refresh</span>
            <span>تلاش مجدد</span>
          </button>
        </div>
      </div>
    );

  const k = data.kpis;
  const activePercent = k.totalUsers > 0 ? Math.round((k.activeUsers / k.totalUsers) * 1000) / 10 : 0;
  const usagePoints = grouping === "weekday" ? data.weeklyUsage : data.weeklySeries;
  const maxUsage = Math.max(...usagePoints.map((p) => p.users + p.tickets), 1);
  const usageHasData = usagePoints.some((p) => p.users + p.tickets > 0);
  const maxAdImpr = Math.max(...data.adsStats.byPlacement.map((p) => p.impressions), 1);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* ===== سربرگ و نوار کنترل ===== */}
      <div className="bg-surface-container-lowest rounded-2xl p-4 sm:p-6 shadow-sm border border-outline-variant/60 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="px-2 py-0.5 rounded text-label-sm font-label-sm bg-primary/10 text-primary font-bold">
              گزارش‌های عملیاتی پنل
            </span>
            <span className="text-label-sm font-label-sm text-on-surface-variant">
              بازه {faDate(data.from)} تا {faDate(data.to)}
            </span>
          </div>
          <h1 className="text-headline-lg font-headline-lg font-bold text-on-surface">گزارش‌ها و تحلیل داده سامانه</h1>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">
            پایش روند ثبت‌نام کاربران، تیکت‌های پشتیبانی، عملکرد شبکه خطوط و بازدهی کمپین‌های تبلیغاتی
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-1 bg-surface-container-low rounded-xl border border-outline-variant/60 text-label-md font-label-md">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={
                  "px-3 py-1.5 rounded-lg transition-colors " +
                  (range === r.value
                    ? "bg-surface-container-lowest text-primary font-bold shadow-xs"
                    : "text-on-surface-variant hover:text-on-surface")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl text-label-lg font-label-lg shadow-sm hover:bg-primary-container transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-title-md">download</span>
              <span>خروجی گزارش (CSV)</span>
            </button>
            <button
              onClick={() => load(range)}
              className="p-2 border border-outline-variant/60 rounded-xl hover:bg-surface-container-low text-on-surface-variant transition-colors"
              title="به‌روزرسانی شاخص‌ها"
              aria-label="به‌روزرسانی شاخص‌ها"
            >
              <span className="material-symbols-outlined text-title-md">tune</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== شاخص‌های کلیدی ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {/* کارت ۱: کاربران */}
        <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/60 shadow-sm relative overflow-hidden group hover:border-primary/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-label-md font-label-md text-on-surface-variant">کل کاربران اپلیکیشن</span>
            <div className="w-10 h-10 rounded-xl bg-primary-fixed text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-title-lg">directions_transit</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-headline-xl font-headline-xl font-bold text-on-surface">{faN(k.totalUsers)}</div>
            <div className="flex items-center gap-2 mt-2 text-label-sm font-label-sm flex-wrap">
              {k.newUsersChange !== null && (
                <span className="flex items-center text-tertiary font-bold bg-tertiary-fixed/40 px-2 py-0.5 rounded-full">
                  <span className="material-symbols-outlined text-body-sm ml-0.5">
                    {k.newUsersChange >= 0 ? "trending_up" : "trending_down"}
                  </span>
                  {k.newUsersChange >= 0 ? "+" : ""}
                  {fa(k.newUsersChange)}٪
                </span>
              )}
              <span className="text-on-surface-variant">
                {faN(k.newUsersRange)} ثبت‌نام جدید در بازه
              </span>
            </div>
          </div>
          <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-4 overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{ width: `${activePercent}%` }}></div>
          </div>
          <p className="text-label-sm font-label-sm text-outline mt-2">سهم کاربران فعال: {fa(activePercent)}٪</p>
        </div>

        {/* کارت ۲: سفرها */}
        <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/60 shadow-sm relative overflow-hidden group hover:border-primary/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-label-md font-label-md text-on-surface-variant">کل سفرهای ثبت‌شده کاربران</span>
            <div className="w-10 h-10 rounded-xl bg-secondary-fixed text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-title-lg">route</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-headline-xl font-headline-xl font-bold text-on-surface">{faN(k.trips)}</div>
            <div className="flex items-center gap-2 mt-2 text-label-sm font-label-sm flex-wrap">
              <span className="text-primary font-bold bg-primary-fixed/60 px-2 py-0.5 rounded-full">
                میانگین {fa(k.avgTripsPerUser)} سفر به ازای هر کاربر
              </span>
              <span className="text-on-surface-variant">درخواست صوتی: {faN(k.voiceRequests)}</span>
            </div>
          </div>
          <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-4 overflow-hidden">
            <div className="bg-secondary-container h-full rounded-full" style={{ width: "72%" }}></div>
          </div>
        </div>

        {/* کارت ۳: تیکت‌ها */}
        <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/60 shadow-sm relative overflow-hidden group hover:border-primary/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-label-md font-label-md text-on-surface-variant">تیکت‌های دریافتی در بازه</span>
            <div className="w-10 h-10 rounded-xl bg-surface-container-high text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-title-lg">support_agent</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-headline-xl font-headline-xl font-bold text-on-surface">{faN(k.ticketsRange)}</div>
            <div className="flex items-center gap-2 mt-2 text-label-sm font-label-sm flex-wrap">
              <span className="flex items-center text-tertiary font-bold bg-tertiary-fixed/40 px-2 py-0.5 rounded-full">
                <span className="material-symbols-outlined text-body-sm ml-0.5">task_alt</span>
                نرخ بسته شدن {fa(k.closeRate)}٪
              </span>
              <span className="text-on-surface-variant">{faN(k.ticketsClosedRange)} تیکت بسته شده</span>
            </div>
          </div>
          <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-4 overflow-hidden">
            <div className="bg-primary-container h-full rounded-full" style={{ width: `${Math.max(6, k.closeRate)}%` }}></div>
          </div>
        </div>

        {/* کارت ۴: تبلیغات */}
        <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/60 shadow-sm relative overflow-hidden group hover:border-primary/50 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-label-md font-label-md text-on-surface-variant">بازدهی کمپین‌های تبلیغاتی</span>
            <div className="w-10 h-10 rounded-xl bg-tertiary-fixed text-tertiary flex items-center justify-center">
              <span className="material-symbols-outlined text-title-lg">campaign</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-headline-xl font-headline-xl font-bold text-on-surface">{fa(data.adsStats.ctr)}٪</div>
            <div className="flex items-center gap-2 mt-2 text-label-sm font-label-sm flex-wrap">
              <span className="text-tertiary font-bold bg-tertiary-fixed/40 px-2 py-0.5 rounded-full">
                {faN(data.adsStats.impressions)} نمایش
              </span>
              <span className="text-on-surface-variant">{faN(data.adsStats.clicks)} کلیک</span>
            </div>
          </div>
          <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-4 overflow-hidden">
            <div className="bg-tertiary-container h-full rounded-full" style={{ width: `${Math.min(100, Math.max(6, data.adsStats.ctr * 4))}%` }}></div>
          </div>
        </div>
      </div>

      {/* ===== نمودار استفاده هفتگی و محبوب‌ترین خطوط ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* نمودار میله‌ای استفاده هفتگی */}
        <div className="lg:col-span-8 bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/60 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-title-lg font-title-lg font-bold text-on-surface">نمودار میله‌ای استفاده هفتگی</h3>
              <p className="text-body-sm font-body-sm text-on-surface-variant mt-0.5">
                مقایسه ثبت‌نام کاربران و تیکت‌های دریافتی در طول بازه گزارش
              </p>
            </div>
            <div className="inline-flex p-1 bg-surface-container-low rounded-xl border border-outline-variant/60 text-label-md font-label-md">
              <button
                onClick={() => setGrouping("weekday")}
                className={
                  "px-3 py-1 rounded-lg transition-colors " +
                  (grouping === "weekday" ? "bg-surface-container-lowest text-primary font-bold shadow-xs" : "text-on-surface-variant")
                }
              >
                روزهای هفته
              </button>
              <button
                onClick={() => setGrouping("weekly")}
                className={
                  "px-3 py-1 rounded-lg transition-colors " +
                  (grouping === "weekly" ? "bg-surface-container-lowest text-primary font-bold shadow-xs" : "text-on-surface-variant")
                }
              >
                سری هفتگی
              </button>
            </div>
          </div>
          {/* راهنمای رنگ‌ها */}
          <div className="flex items-center gap-3 text-label-sm font-label-sm mt-3">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-primary"></span>
              <span>ثبت‌نام کاربران</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-secondary"></span>
              <span>تیکت‌های دریافتی</span>
            </div>
          </div>
          {!usageHasData ? (
            <div className="py-14 text-center">
              <span className="material-symbols-outlined text-headline-md text-outline">monitoring</span>
              <p className="text-body-md font-body-md text-on-surface-variant mt-2">
                در این بازه ثبت‌نام یا تیکت جدیدی ثبت نشده است. بازه زمانی دیگری را انتخاب کنید.
              </p>
            </div>
          ) : (
            <div className="mt-8 h-64 flex items-end gap-2 sm:gap-3 px-2 border-b border-outline-variant/60 relative">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                <div className="border-b border-dashed border-outline"></div>
                <div className="border-b border-dashed border-outline"></div>
                <div className="border-b border-dashed border-outline"></div>
                <div className="border-b border-dashed border-outline"></div>
              </div>
              {usagePoints.map((p) => {
                const total = p.users + p.tickets;
                const h = Math.max(6, Math.round((total / maxUsage) * 220));
                const usersH = total > 0 ? Math.round((p.users / total) * h) : 0;
                const ticketsH = h - usersH;
                const isMax = total === maxUsage && total > 0;
                return (
                  <div key={p.label} className="flex-1 flex flex-col items-center gap-1 group z-10 relative min-w-0">
                    {isMax && (
                      <span className="absolute -top-6 text-label-sm font-label-sm text-primary font-bold bg-primary-fixed px-1 rounded whitespace-nowrap">
                        اوج {faN(total)}
                      </span>
                    )}
                    <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: `${h}px` }}>
                      {p.users > 0 && (
                        <div
                          className={
                            "w-full bg-primary rounded-t " + (isMax ? "ring-2 ring-primary/30" : "group-hover:bg-primary-container transition-all")
                          }
                          style={{ height: `${usersH}px` }}
                        ></div>
                      )}
                      {p.tickets > 0 && (
                        <div
                          className={
                            "w-full bg-secondary rounded-b " + (isMax ? "ring-2 ring-secondary/30" : "group-hover:bg-secondary-container transition-all")
                          }
                          style={{ height: `${ticketsH}px` }}
                        ></div>
                      )}
                    </div>
                    <span
                      className={
                        "text-label-sm font-label-sm truncate max-w-full " + (isMax ? "text-primary font-bold" : "text-on-surface-variant")
                      }
                    >
                      {p.label}
                    </span>
                    <span className="text-label-sm font-label-sm text-outline">{faN(total)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-outline-variant/40 flex items-center justify-between text-label-md font-label-md text-on-surface-variant">
            <span>مجموع ثبت‌نام‌ها: {faN(usagePoints.reduce((a, p) => a + p.users, 0))} نفر</span>
            <span className="text-primary font-bold">مجموع تیکت‌ها: {faN(usagePoints.reduce((a, p) => a + p.tickets, 0))} مورد</span>
          </div>
        </div>

        {/* محبوب‌ترین خطوط */}
        <div className="lg:col-span-4 bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/60 shadow-sm">
          <h3 className="text-title-lg font-title-lg font-bold text-on-surface">محبوب‌ترین خطوط شبکه</h3>
          <p className="text-body-sm font-body-sm text-on-surface-variant mt-0.5">
            رتبه‌بندی بر اساس تعداد ایستگاه‌های ثبت‌شده هر خط
          </p>
          {data.topLines.length === 0 ? (
            <p className="text-body-md font-body-md text-outline py-10 text-center">
              هنوز خطی در سامانه ثبت نشده است.
            </p>
          ) : (
            <div className="space-y-4 mt-6">
              {data.topLines.map((l, i) => {
                const barClass = l.kind === "BRT" ? "bg-secondary" : l.kind === "BUS" ? "bg-tertiary" : "bg-primary";
                return (
                  <div key={l.id}>
                    <div className="flex justify-between text-body-sm font-body-sm mb-1.5 gap-2">
                      <span className="font-bold flex items-center gap-1.5 text-on-surface min-w-0">
                        <span className="text-label-sm font-label-sm text-outline shrink-0">{fa(i + 1)}</span>
                        <span className="truncate">{l.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-label-sm font-label-sm shrink-0 ${KIND_COLOR[l.kind] ?? "bg-surface-container-high text-on-surface"}`}
                        >
                          {l.kindLabel}
                        </span>
                      </span>
                      <span className="font-bold text-primary shrink-0">{fa(l.stationCount)} ایستگاه</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                        <div className={`${barClass} h-full rounded-full`} style={{ width: `${Math.max(4, l.share)}%` }}></div>
                      </div>
                      <span className="text-label-sm font-label-sm text-on-surface-variant shrink-0">{fa(l.share)}٪</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="bg-surface-container-low rounded-xl p-3.5 mt-6 border border-outline-variant/40 flex items-center gap-3">
            <span className="material-symbols-outlined text-tertiary text-headline-md">route</span>
            <div className="text-body-sm font-body-sm">
              <span className="font-bold text-tertiary block">پوشش شبکه حمل‌ونقل</span>
              <span className="text-on-surface-variant text-label-md font-label-md">
                {faN(data.topLines.reduce((a, l) => a + l.stationCount, 0))} ایستگاه در {faN(data.topLines.length)} خط پرترافیک بازه گزارش
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== توزیع تیکت‌ها بر اساس دسته ===== */}
      <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/60 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-outline-variant/50 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-title-lg">category</span>
              <h3 className="text-title-lg font-title-lg font-bold text-on-surface">توزیع تیکت‌ها بر اساس دسته‌بندی</h3>
            </div>
            <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">
              شناسایی موضوعات پرتکرار پشتیبانی برای اولویت‌گذاری بهبود سرویس‌ها
            </p>
          </div>
          <span className="px-3 py-1 bg-primary-fixed text-primary rounded-lg text-label-md font-label-md font-bold">
            رتبه‌بندی بر اساس بیشترین تعداد تیکت
          </span>
        </div>
        {data.ticketCategories.length === 0 ? (
          <p className="text-body-md font-body-md text-outline py-10 text-center">
            در این بازه تیکتی ثبت نشده است.
          </p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-outline-variant/50 text-label-md font-label-md text-on-surface-variant">
                  <th className="py-3 px-4">دسته‌بندی تیکت</th>
                  <th className="py-3 px-4">تعداد تیکت</th>
                  <th className="py-3 px-4">سهم از کل</th>
                  <th className="py-3 px-4">سطح سهم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40 text-body-md font-body-md">
                {data.ticketCategories.map((t, i) => (
                  <tr key={t.category} className="hover:bg-surface-container-low transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <span className="text-label-md font-label-md text-outline shrink-0">{fa(i + 1)}</span>
                        <span className="font-bold text-on-surface">{t.label}</span>
                        {i === 0 && (
                          <span className="px-2 py-0.5 rounded-md text-label-sm font-label-sm bg-primary-fixed text-on-primary-fixed-variant font-bold">
                            پرتکرارترین
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-on-surface">{faN(t.count)} تیکت</td>
                    <td className="py-3.5 px-4 font-bold text-primary">{fa(t.percent)}٪</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-28 bg-surface-container-high h-2 rounded-full overflow-hidden">
                          <div
                            className={(t.percent >= 40 ? "bg-secondary" : "bg-primary") + " h-full rounded-full"}
                            style={{ width: `${Math.max(4, t.percent)}%` }}
                          ></div>
                        </div>
                        <span
                          className={
                            "text-label-sm font-label-sm font-bold " + (t.percent >= 40 ? "text-secondary" : "text-primary")
                          }
                        >
                          {t.percent >= 40 ? "سهم بالا" : t.percent >= 15 ? "سهم متوسط" : "سهم کم"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== آمار تبلیغات ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* به تفکیک جایگاه */}
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/60 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-outline-variant/50 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary-fixed text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-title-lg">view_carousel</span>
              </div>
              <div>
                <h3 className="text-title-lg font-title-lg font-bold text-on-surface">عملکرد کمپین‌ها به تفکیک جایگاه</h3>
                <p className="text-body-sm font-body-sm text-on-surface-variant">نمایش، کلیک و نرخ تبدیل هر جایگاه تبلیغاتی</p>
              </div>
            </div>
            <span className="text-label-sm font-label-sm bg-tertiary-fixed/50 text-tertiary px-2 py-0.5 rounded-full font-bold">
              {faN(data.adsStats.activeAds)} کمپین فعال
            </span>
          </div>
          {data.adsStats.byPlacement.length === 0 ? (
            <p className="text-body-md font-body-md text-outline py-10 text-center">
              هنوز کمپین تبلیغاتی در سامانه ثبت نشده است.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {data.adsStats.byPlacement.map((p) => (
                <div key={p.placement}>
                  <div className="flex justify-between text-body-sm font-body-sm mb-1.5 gap-2 flex-wrap">
                    <span className="font-bold text-on-surface">{p.placementLabel}</span>
                    <span className="text-on-surface-variant">
                      {faN(p.impressions)} نمایش | {faN(p.clicks)} کلیک | CTR {fa(p.ctr)}٪
                    </span>
                  </div>
                  <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${Math.max(4, (p.impressions / maxAdImpr) * 100)}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* خلاصه آمار تبلیغات */}
        <div className="lg:col-span-5 bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/60 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-outline-variant/50">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-tertiary-fixed text-tertiary flex items-center justify-center">
                  <span className="material-symbols-outlined text-title-lg">query_stats</span>
                </div>
                <div>
                  <h3 className="text-title-lg font-title-lg font-bold text-on-surface">خلاصه بازدهی تبلیغات</h3>
                  <p className="text-body-sm font-body-sm text-on-surface-variant">مجموع کل کمپین‌های ثبت‌شده</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/40">
                <span className="text-label-sm font-label-sm text-on-surface-variant">جمع نمایش‌ها (Impressions)</span>
                <div className="text-headline-md font-headline-md font-bold text-primary mt-1">{faN(data.adsStats.impressions)}</div>
              </div>
              <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/40">
                <span className="text-label-sm font-label-sm text-on-surface-variant">جمع کلیک‌ها (Clicks)</span>
                <div className="text-headline-md font-headline-md font-bold text-tertiary mt-1">{faN(data.adsStats.clicks)}</div>
              </div>
              <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/40">
                <span className="text-label-sm font-label-sm text-on-surface-variant">نرخ کلیک (CTR)</span>
                <div className="text-headline-md font-headline-md font-bold text-primary mt-1">{fa(data.adsStats.ctr)}٪</div>
              </div>
              <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/40">
                <span className="text-label-sm font-label-sm text-on-surface-variant">کمپین‌های فعال</span>
                <div className="text-headline-md font-headline-md font-bold text-tertiary mt-1">{faN(data.adsStats.activeAds)}</div>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-outline-variant/40 flex items-center justify-between">
            <span className="text-label-sm font-label-sm text-on-surface-variant">مدیریت کمپین‌ها و زمان‌بندی انتشار</span>
            <button
              onClick={exportCsv}
              className="text-primary font-bold text-label-md font-label-md hover:underline"
            >
              خروجی CSV ←
            </button>
          </div>
        </div>
      </div>

      {/* ===== نوار راهنمای سیستمی ===== */}
      <div className="rounded-xl border border-outline-variant/50 bg-surface-container-low p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded text-label-sm font-label-sm bg-surface-dim text-on-surface-variant shrink-0">راهنمای سیستمی</span>
          <span className="text-body-sm font-body-sm text-on-surface-variant">
            کلیه شاخص‌های این گزارش مستقیماً از پایگاه داده پنل محاسبه می‌شود و با تغییر بازه زمانی به‌روزرسانی خواهد شد.
          </span>
        </div>
        <span className="text-label-sm font-label-sm text-outline shrink-0">درمسیر نسخه ۲.۴</span>
      </div>
    </div>
  );
}

// ===== اسکلت لودینگ مطابق ساختار صفحه =====
function ReportsSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-6" aria-busy="true" aria-label="در حال بارگذاری گزارش‌ها">
      <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/60 space-y-3">
        <Skeleton className="h-5 w-40 bg-surface-container-high" />
        <Skeleton className="h-9 w-72 bg-surface-container-high" />
        <Skeleton className="h-4 w-full max-w-lg bg-surface-container" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/60 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28 bg-surface-container-high" />
              <Skeleton className="h-10 w-10 rounded-xl bg-surface-container-high" />
            </div>
            <Skeleton className="h-9 w-28 bg-surface-container-high" />
            <Skeleton className="h-2 w-full rounded-full bg-surface-container-high" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/60 space-y-4">
          <Skeleton className="h-6 w-56 bg-surface-container-high" />
          <Skeleton className="h-64 w-full bg-surface-container" />
        </div>
        <div className="lg:col-span-4 bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/60 space-y-4">
          <Skeleton className="h-6 w-40 bg-surface-container-high" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-full bg-surface-container" />
              <Skeleton className="h-2 w-full rounded-full bg-surface-container-high" />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/60 space-y-3">
        <Skeleton className="h-6 w-64 bg-surface-container-high" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full bg-surface-container" />
        ))}
      </div>
    </div>
  );
}
