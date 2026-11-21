"use client";

// داشبورد — نمای کلی آمار، رویدادهای اخیر و تبلیغ‌های پربازدید

import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  LifeBuoy,
  MapPin,
  Megaphone,
  MousePointerClick,
  Route,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/client";
import {
  ACTION_LABEL,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  PageHeader,
  PLACEMENT_LABEL,
  StatCard,
  auditIcon,
  faDate,
  type StatsT,
} from "@/components/panel-kit";

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiFetch<StatsT>("/api/v1/stats");
      setStats(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "بارگذاری آمار ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = stats
    ? [
        { icon: Route, label: "خطوط", value: stats.lines },
        { icon: MapPin, label: "ایستگاه‌ها", value: stats.stations },
        { icon: Users, label: "کاربران اپ", value: stats.appUsers },
        { icon: UserPlus, label: "ثبت‌نام ۷ روز اخیر", value: stats.usersNew7d },
        { icon: UserCheck, label: "کاربران فعال ۷ روز", value: stats.usersActive7d },
        { icon: Megaphone, label: "تبلیغات فعال", value: stats.activeAds },
        { icon: Eye, label: "بازدید تبلیغ‌ها", value: stats.adViews.toLocaleString("fa-IR") },
        {
          icon: MousePointerClick,
          label: "کلیک تبلیغ‌ها",
          value: stats.adClicks.toLocaleString("fa-IR"),
        },
        {
          icon: LifeBuoy,
          label: "تیکت باز",
          value: stats.ticketsOpen,
          hint: `در بررسی: ${stats.ticketsPending.toLocaleString("fa-IR")}`,
        },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="داشبورد"
        description="نمای کلی وضعیت درمسیر"
        actions={
          stats ? (
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
              وضعیت API: محلی
            </span>
          ) : null
        }
      />

      {loading ? (
        <LoadingBlock count={9} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void load()} />
      ) : stats ? (
        <div className="flex flex-col gap-6">
          <section aria-label="آمار کلی">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {cards.map((c) => (
                <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} hint={c.hint} />
              ))}
            </div>
          </section>

          <section aria-label="رویدادها و تبلیغ‌ها" className="grid gap-4 lg:grid-cols-2">
            {/* رویدادهای اخیر */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">رویدادهای اخیر</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-2">
                {stats.recentAudit.length === 0 ? (
                  <div className="px-6 pb-4">
                    <EmptyState icon={Megaphone} title="رویدادی ثبت نشده است." />
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto px-6">
                    <div className="flex flex-col divide-y">
                      {stats.recentAudit.map((a) => {
                        const Icon = auditIcon(a.action);
                        return (
                          <div key={a.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                              <Icon className="size-4" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="text-sm font-medium">
                                  {ACTION_LABEL[a.action] ?? a.action}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {a.adminName ?? "سیستم"}
                                </span>
                              </div>
                              {a.detail ? (
                                <div className="mt-0.5 truncate text-xs text-muted-foreground" title={a.detail}>
                                  {a.detail}
                                </div>
                              ) : null}
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {faDate(a.createdAt)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* تبلیغ‌های پربازدید */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">تبلیغ‌های فعال</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-2">
                {stats.topAds.length === 0 ? (
                  <div className="px-6 pb-4">
                    <EmptyState
                      icon={Megaphone}
                      title="تبلیغ فعالی وجود ندارد."
                      description="تبلیغ‌ها را می‌توانید از بخش «تبلیغات» بسازید و فعال کنید."
                    />
                  </div>
                ) : (
                  <div className="px-6">
                    <div className="flex flex-col divide-y">
                      {stats.topAds.map((ad) => (
                        <div key={ad.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{ad.title}</div>
                            <Badge variant="secondary" className="mt-1">
                              {PLACEMENT_LABEL[ad.placement] ?? ad.placement}
                            </Badge>
                          </div>
                          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Eye className="size-3.5" aria-hidden />
                              {ad.views.toLocaleString("fa-IR")}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MousePointerClick className="size-3.5" aria-hidden />
                              {ad.clicks.toLocaleString("fa-IR")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      ) : null}
    </div>
  );
}
