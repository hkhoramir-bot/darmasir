export const dynamic = "force-dynamic";

// آمار کلی داشبورد — شمارش‌ها، روند ۷روزه کاربران و آخرین رویدادها
import { NextRequest } from "next/server";
import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  return handler(async () => {
    await requireAdmin(req);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      lines,
      stations,
      appUsers,
      admins,
      activeAds,
      adAgg,
      ticketsOpen,
      ticketsPending,
      ticketsClosed,
      versions,
      usersNew7d,
      usersActive7d,
      recentAudit,
      topAds,
    ] = await Promise.all([
      db.line.count(),
      db.station.count(),
      db.appUser.count(),
      db.adminUser.count(),
      db.ad.count({ where: { active: true } }),
      db.ad.aggregate({ _sum: { views: true, clicks: true } }),
      db.ticket.count({ where: { status: "OPEN" } }),
      db.ticket.count({ where: { status: "PENDING" } }),
      db.ticket.count({ where: { status: "CLOSED" } }),
      db.appVersion.count(),
      db.appUser.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      db.appUser.count({ where: { lastSeenAt: { gte: sevenDaysAgo } } }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
      db.ad.findMany({
        where: { active: true },
        orderBy: [{ views: "desc" }],
        take: 5,
        select: { id: true, title: true, views: true, clicks: true, placement: true },
      }),
    ]);

    return ok({
      lines,
      stations,
      appUsers,
      admins,
      activeAds,
      adViews: adAgg._sum.views ?? 0,
      adClicks: adAgg._sum.clicks ?? 0,
      ticketsOpen,
      ticketsPending,
      ticketsClosed,
      versions,
      usersNew7d,
      usersActive7d,
      recentAudit,
      topAds,
    });
  });
}
