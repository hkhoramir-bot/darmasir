import { ok, fail, requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";

// ============================================================
// GET /api/v1/reports?range=7|30|90 — گزارش‌ها و تحلیل داده
// kpis + weeklyUsage + topLines + adsStats + ticketCategories
// ============================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const TICKET_CATEGORY_FA: Record<string, string> = {
  GENERAL: "عمومی",
  GPS: "GPS و موقعیت‌یابی",
  VOICE: "دستیار صوتی",
  ROUTE: "مسیریابی",
  PAYMENT: "پرداخت",
  OTHER: "سایر",
};

const LINE_KIND_FA: Record<string, string> = {
  METRO: "مترو",
  BRT: "اتوبوس تندرو",
  BUS: "اتوبوس",
};

const LINE_STATUS_FA: Record<string, string> = {
  ACTIVE: "فعال",
  MAINTENANCE: "تعمیر و نگهداری",
  INACTIVE: "غیرفعال",
};

const PLACEMENT_FA: Record<string, string> = {
  HOME_BANNER: "بنر صفحه اصلی",
  PLAN_TOP: "بالای صفحه مسیر",
  MAP_BOTTOM: "پایین نقشه",
  DRAWER: "کشوی برنامه",
};

export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  try {
    const url = new URL(req.url);
    const rangeRaw = url.searchParams.get("range") ?? "30";
    const range = ["7", "30", "90"].includes(rangeRaw) ? Number(rangeRaw) : 30;
    if (!["7", "30", "90"].includes(rangeRaw)) {
      return fail("مقدار range باید یکی از ۷، ۳۰ یا ۹۰ باشد", 400);
    }

    const today = startOfDay(new Date());
    const from = new Date(today.getTime() - (range - 1) * DAY_MS);
    const prevFrom = new Date(from.getTime() - range * DAY_MS);
    const prevTo = new Date(from.getTime());

    const [
      totalUsers,
      activeUsers,
      newUsersRange,
      newUsersPrevRange,
      tripsSum,
      voiceSum,
      ticketsRange,
      ticketsClosedRange,
      ticketsRangePrev,
      userCreations,
      ticketCreations,
      linesRaw,
      adsAgg,
      adsActiveCount,
      adsByPlacementRaw,
      ticketCategoriesRaw,
    ] = await Promise.all([
      db.appUser.count(),
      db.appUser.count({ where: { status: "ACTIVE" } }),
      db.appUser.count({ where: { createdAt: { gte: from } } }),
      db.appUser.count({ where: { createdAt: { gte: prevFrom, lt: prevTo } } }),
      db.appUser.aggregate({ _sum: { tripsCount: true } }),
      db.appUser.aggregate({ _sum: { voiceCount: true } }),
      db.ticket.count({ where: { createdAt: { gte: from } } }),
      db.ticket.count({ where: { createdAt: { gte: from }, status: "CLOSED" } }),
      db.ticket.count({ where: { createdAt: { gte: prevFrom, lt: prevTo } } }),
      db.appUser.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
      db.ticket.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
      db.line.findMany({
        select: { id: true, code: true, name: true, kind: true, stationCount: true, status: true },
      }),
      db.ad.aggregate({ _sum: { impressions: true, clicks: true } }),
      db.ad.count({ where: { active: true } }),
      db.ad.groupBy({ by: ["placement"], _sum: { impressions: true, clicks: true }, _count: { _all: true } }),
      db.ticket.groupBy({ by: ["category"], _count: { _all: true } }),
    ]);

    // نمودار میله‌ای استفاده هفتگی — تجمیع روزهای هفته در طول بازه
    const weekdayBuckets = WEEKDAYS_FA.map((label) => ({ label, users: 0, tickets: 0 }));
    for (const u of userCreations) weekdayBuckets[new Date(u.createdAt).getDay()].users++;
    for (const t of ticketCreations) weekdayBuckets[new Date(t.createdAt).getDay()].tickets++;

    // استفاده هفتگی به تفکیک هر هفته از بازه (برای نمایش روند)
    const weekCount = Math.ceil(range / 7);
    const weeklySeries: { label: string; users: number; tickets: number }[] = [];
    for (let w = weekCount - 1; w >= 0; w--) {
      const wStart = new Date(today.getTime() - (w + 1) * 7 * DAY_MS + DAY_MS);
      const wEnd = new Date(wStart.getTime() + 7 * DAY_MS);
      weeklySeries.push({
        label: w === 0 ? "هفته جاری" : `${w} هفته قبل`,
        users: userCreations.filter((u) => {
          const c = new Date(u.createdAt);
          return c >= wStart && c < wEnd;
        }).length,
        tickets: ticketCreations.filter((t) => {
          const c = new Date(t.createdAt);
          return c >= wStart && c < wEnd;
        }).length,
      });
    }

    // محبوب‌ترین خطوط بر اساس تعداد ایستگاه (داده واقعی)
    const totalStationCount = linesRaw.reduce((acc, l) => acc + l.stationCount, 0);
    const topLines = [...linesRaw]
      .sort((a, b) => b.stationCount - a.stationCount)
      .slice(0, 6)
      .map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        kind: l.kind,
        kindLabel: LINE_KIND_FA[l.kind] ?? l.kind,
        stationCount: l.stationCount,
        status: l.status,
        statusLabel: LINE_STATUS_FA[l.status] ?? l.status,
        share:
          totalStationCount > 0
            ? Math.round((l.stationCount / totalStationCount) * 1000) / 10
            : 0,
      }));

    // آمار تبلیغات
    const impressions = adsAgg._sum.impressions ?? 0;
    const clicks = adsAgg._sum.clicks ?? 0;
    const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
    const adsByPlacement = adsByPlacementRaw
      .map((p) => ({
        placement: p.placement,
        placementLabel: PLACEMENT_FA[p.placement] ?? p.placement,
        count: p._count._all,
        impressions: p._sum.impressions ?? 0,
        clicks: p._sum.clicks ?? 0,
        ctr:
          (p._sum.impressions ?? 0) > 0
            ? Math.round(((p._sum.clicks ?? 0) / (p._sum.impressions ?? 1)) * 10000) / 100
            : 0,
      }))
      .sort((a, b) => b.impressions - a.impressions);

    // توزیع تیکت‌ها بر اساس دسته
    const totalTicketsAll = ticketCategoriesRaw.reduce((acc, c) => acc + c._count._all, 0);
    const ticketCategories = ticketCategoriesRaw
      .map((c) => ({
        category: c.category,
        label: TICKET_CATEGORY_FA[c.category] ?? c.category,
        count: c._count._all,
        percent:
          totalTicketsAll > 0 ? Math.round((c._count._all / totalTicketsAll) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const trips = tripsSum._sum.tripsCount ?? 0;
    const voiceRequests = voiceSum._sum.voiceCount ?? 0;
    const newUsersChange =
      newUsersPrevRange > 0
        ? Math.round(((newUsersRange - newUsersPrevRange) / newUsersPrevRange) * 1000) / 10
        : null;
    const ticketsChange =
      ticketsRangePrev > 0
        ? Math.round(((ticketsRange - ticketsRangePrev) / ticketsRangePrev) * 1000) / 10
        : null;
    const closeRate = ticketsRange > 0 ? Math.round((ticketsClosedRange / ticketsRange) * 1000) / 10 : 0;
    const avgTripsPerUser = totalUsers > 0 ? Math.round((trips / totalUsers) * 10) / 10 : 0;

    return ok({
      data: {
        range,
        from: from.toISOString(),
        to: today.toISOString(),
        kpis: {
          totalUsers,
          activeUsers,
          newUsersRange,
          newUsersPrevRange,
          newUsersChange,
          trips,
          voiceRequests,
          avgTripsPerUser,
          ticketsRange,
          ticketsRangePrev,
          ticketsChange,
          ticketsClosedRange,
          closeRate,
        },
        weeklyUsage: weekdayBuckets,
        weeklySeries,
        topLines,
        adsStats: {
          impressions,
          clicks,
          ctr,
          activeAds: adsActiveCount,
          byPlacement: adsByPlacement,
        },
        ticketCategories,
      },
    });
  } catch (e) {
    console.error("reports route error", e);
    return fail("خطا در محاسبه گزارش‌ها", 500);
  }
}
