"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { faMoney, toFa } from "@/lib/metro-data";
import { MI, PageHeader } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   تاریخچه سفر — سفرها، آمار و مسیرهای پرکاربرد
   ============================================================ */

interface Trip {
  id: string;
  fromStationId: string;
  fromName: string;
  toStationId: string;
  toName: string;
  minutes: number;
  transfers: number;
  fare: number;
  pref: string;
  createdAt: string;
}

interface HistoryStats {
  count: number;
  minutes: number;
  fare: number;
  topFrom: string | null;
}

interface DailyRouteItem {
  id: string;
  kind: string;
  label: string;
  fromStationId: string;
  toStationId: string;
  fromName: string;
  toName: string;
  createdAt: string;
}

function faDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fa-IR");
}

export default function HistoryPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [daily, setDaily] = useState<DailyRouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [hRes, dRes] = await Promise.all([fetch("/api/history"), fetch("/api/daily-routes")]);
      if (!hRes.ok) throw new Error("history failed");
      const hData = (await hRes.json()) as { trips: Trip[]; stats: HistoryStats };
      setTrips(Array.isArray(hData.trips) ? hData.trips : []);
      setStats(hData.stats ?? null);
      if (dRes.ok) {
        const dData = (await dRes.json()) as { routes?: DailyRouteItem[] };
        setDaily(
          (dData.routes ?? []).filter((r) => r.kind === "home" || r.kind === "work")
        );
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const deleteAll = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/history?all=1", { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setTrips([]);
      setStats({ count: 0, minutes: 0, fare: 0, topFrom: null });
      setConfirmAll(false);
      toast({ title: "تاریخچه پاک شد", description: "همه سفرهای ثبت‌شده حذف شدند" });
    } catch {
      toast({ title: "حذف تاریخچه ناموفق بود", description: "لطفاً دوباره تلاش کنید", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const replayTrip = (t: Trip) => {
    router.push(`/plan?from=${t.fromStationId}&to=${t.toStationId}`);
  };

  return (
    <>
      <PageHeader
        title="تاریخچه سفر"
        subtitle="سفرها و آمار شما"
        actions={
          <button
            type="button"
            aria-label="حذف کل تاریخچه"
            onClick={() => {
              if (trips.length === 0) return;
              setConfirmAll(true);
            }}
            className={`w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container active:scale-95 transition-all ${
              confirmAll ? "text-error" : "text-outline"
            }`}
          >
            <MI name="delete" size={22} />
          </button>
        }
      />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        {/* ---------------- ردیف تأیید حذف ---------------- */}
        {confirmAll && (
          <div className="bg-error-container rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-on-error-container">تأیید حذف همه؟ این عمل بازگشت‌پذیر نیست</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={deleteAll}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg bg-error text-white text-[11px] font-bold active:scale-95 transition-all disabled:opacity-60"
              >
                {deleting ? "..." : "بله"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAll(false)}
                className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface text-[11px] font-bold active:scale-95 transition-all"
              >
                خیر
              </button>
            </div>
          </div>
        )}

        {/* ---------------- وضعیت بارگذاری ---------------- */}
        {loading && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="h-16 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
              <div className="h-16 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
              <div className="h-16 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
            </div>
            <div className="h-64 rounded-2xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
          </>
        )}

        {/* ---------------- خطای بارگذاری ---------------- */}
        {!loading && loadError && (
          <section className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 shadow-sm flex flex-col items-center gap-3 text-center">
            <MI name="wifi_off" size={32} className="text-error" />
            <p className="text-xs font-bold text-on-surface">بارگذاری تاریخچه ناموفق بود</p>
            <button
              type="button"
              onClick={loadData}
              className="bg-primary-container text-white rounded-xl font-bold text-xs px-5 py-2 shadow-sm active:scale-95 transition-all"
            >
              تلاش دوباره
            </button>
          </section>
        )}

        {!loading && !loadError && (
          <>
            {/* ---------------- آمار کلی ---------------- */}
            <div className="grid grid-cols-3 gap-2">
              <section className="bg-surface-container-lowest rounded-2xl p-3 border border-outline-variant/40 shadow-sm flex flex-col items-center justify-center gap-0.5 text-center">
                <span className="text-[10px] text-outline font-medium">تعداد سفر</span>
                <span className="text-lg font-bold text-primary leading-tight">
                  {toFa(stats?.count ?? 0)}
                </span>
              </section>
              <section className="bg-surface-container-lowest rounded-2xl p-3 border border-outline-variant/40 shadow-sm flex flex-col items-center justify-center gap-0.5 text-center">
                <span className="text-[10px] text-outline font-medium">کل دقیقه</span>
                <span className="text-lg font-bold text-on-surface leading-tight">
                  {toFa(stats?.minutes ?? 0)}
                </span>
              </section>
              <section className="bg-surface-container-lowest rounded-2xl p-3 border border-outline-variant/40 shadow-sm flex flex-col items-center justify-center gap-0.5 text-center">
                <span className="text-[10px] text-outline font-medium">کل هزینه</span>
                <span className="text-[13px] font-bold text-tertiary leading-tight">
                  {faMoney(stats?.fare ?? 0)}
                </span>
              </section>
            </div>

            {/* ---------------- فهرست سفرها ---------------- */}
            <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <MI name="history" size={20} className="text-primary" />
                <h3 className="font-bold text-xs text-on-surface">سفرهای اخیر</h3>
                {trips.length > 0 && (
                  <span className="mr-auto text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                    {toFa(trips.length)} سفر
                  </span>
                )}
              </div>

              {trips.length === 0 ? (
                <div className="py-8 flex flex-col items-center gap-2 text-center">
                  <MI name="route" size={36} className="text-outline" />
                  <p className="text-xs font-medium text-outline">هنوز سفری ثبت نشده است</p>
                  <p className="text-[10px] text-outline-variant">
                    از صفحه مسیریاب، سفر خود را با «شروع سفر» ثبت کنید
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-outline-variant/30 max-h-96 overflow-y-auto pretty-scroll -mx-1 px-1">
                  {trips.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => replayTrip(t)}
                      className="w-full text-right py-2.5 flex items-start gap-2.5 hover:bg-surface-container-low rounded-xl px-1 transition-colors active:scale-[0.99]"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                        <MI name="trip_origin" size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-bold text-on-surface truncate">{t.fromName}</span>
                          <MI name="arrow_back" size={13} className="text-outline shrink-0" />
                          <span className="text-xs font-bold text-primary truncate">{t.toName}</span>
                        </div>
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[10px] text-on-surface-variant">
                          <span className="flex items-center gap-0.5">
                            <MI name="calendar_month" size={12} className="text-outline" />
                            {faDate(t.createdAt)}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <MI name="schedule" size={12} className="text-outline" />
                            {toFa(t.minutes)} دقیقه
                          </span>
                          <span className="flex items-center gap-0.5">
                            <MI name="sync_alt" size={12} className="text-outline" />
                            {t.transfers === 0 ? "بدون تعویض" : `${toFa(t.transfers)} تعویض`}
                          </span>
                          <span className="flex items-center gap-0.5 text-tertiary font-bold">
                            <MI name="confirmation_number" size={12} />
                            {faMoney(t.fare)} تومان
                          </span>
                        </div>
                      </div>
                      <MI name="replay" size={16} className="text-outline shrink-0 mt-1.5" />
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* ---------------- سفرهای پرکاربرد ---------------- */}
            <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <MI name="bookmarks" size={20} className="text-primary" />
                <h3 className="font-bold text-xs text-on-surface">سفرهای پرکاربرد</h3>
              </div>

              {daily.length === 0 ? (
                <div className="py-5 flex flex-col items-center gap-2 text-center">
                  <MI name="bookmark_add" size={28} className="text-outline" />
                  <p className="text-[11px] text-on-surface-variant font-medium">
                    مسیر خانه و کار را از دسترسی سریع صفحه اصلی اضافه کنید
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {daily.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2.5 bg-surface-container-low rounded-xl px-3 py-2.5 border border-outline-variant/30"
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          r.kind === "home"
                            ? "bg-primary/10 text-primary"
                            : "bg-tertiary-fixed/50 text-tertiary"
                        }`}
                      >
                        <MI name={r.kind === "home" ? "home" : "work"} size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-on-surface truncate">{r.label}</p>
                        <p className="text-[10px] text-on-surface-variant truncate mt-0.5">
                          {r.fromName}
                          <span className="inline-block mx-1 align-middle">←</span>
                          {r.toName}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push(`/plan?from=${r.fromStationId}&to=${r.toStationId}`)}
                        className="bg-primary-container text-white rounded-xl font-bold text-xs px-4 py-2 shadow-sm active:scale-95 transition-all shrink-0"
                      >
                        شروع
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
