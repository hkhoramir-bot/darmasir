/* ============================================================
   GET /api/admin/users/activity — فعالیت واقعی یک کاربر اپ
   (سفرهای ثبت‌شده، ایستگاه‌های نشان‌شده، مسیرهای روزمره)
   منبع: جداول AppUserTrip / AppUserFavorite / AppUserDailyRoute
   در همان دیتابیس ابری (D1) که اپ اندروید با ورکر پر می‌کند.
   هدر لازم: X-Admin-Key — ?identifier=09...  یا user=<User.id>
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminKey } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  const identifier = (req.nextUrl.searchParams.get("identifier") || "").trim().slice(0, 120);
  const userId = (req.nextUrl.searchParams.get("user") || "").trim().slice(0, 40);
  if (!identifier && !userId) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_INPUT", message: "شناسه کاربر (شماره/ایمیل) الزامی است" } },
      { status: 400 }
    );
  }

  try {
    let ident = identifier;
    if (!ident && userId) {
      const u = await db.user.findUnique({ where: { id: userId } });
      ident = (u?.phone || u?.email || "").toString();
    }
    if (!ident) {
      return NextResponse.json({ ok: true, data: { identifier: "", trips: [], favorites: [], daily_routes: [], tickets: [] } });
    }

    const anyDb = db as any;
    const safe = async (p: Promise<any[]>) => {
      try {
        return (await p) ?? [];
      } catch {
        return [];
      }
    };

    const [trips, favorites, dailyRoutes, tickets] = await Promise.all([
      safe(
        anyDb.appUserTrip.findMany({
          where: { identifier: ident },
          orderBy: { createdAt: "desc" as const },
          take: 40,
        }) ?? []
      ),
      safe(
        anyDb.appUserFavorite.findMany({
          where: { identifier: ident },
          orderBy: { createdAt: "desc" as const },
          take: 100,
        }) ?? []
      ),
      safe(
        anyDb.appUserDailyRoute.findMany({
          where: { identifier: ident },
          orderBy: { createdAt: "desc" as const },
          take: 50,
        }) ?? []
      ),
      safe(
        db.supportTicket.findMany({
          where: { contact: { contains: ident } },
          orderBy: { createdAt: "desc" as const },
          take: 20,
        })
      ),
    ]);

    const iso = (v: any) => {
      const d = v instanceof Date ? v : new Date(typeof v === "number" ? v : String(v));
      return isNaN(d.getTime()) ? null : d.toISOString();
    };

    return NextResponse.json({
      ok: true,
      data: {
        identifier: ident,
        trips: trips.map((t: any) => ({
          id: t.id,
          from_name: t.fromName,
          to_name: t.toName,
          minutes: t.minutes,
          transfers: t.transfers,
          fare: t.fare,
          created_at: iso(t.createdAt),
        })),
        favorites: favorites.map((f: any) => ({
          station_id: f.stationId,
          station_name: f.stationName,
          created_at: iso(f.createdAt),
        })),
        daily_routes: dailyRoutes.map((d: any) => ({
          id: d.id,
          kind: d.kind,
          label: d.label,
          from_name: d.fromName,
          to_name: d.toName,
          created_at: iso(d.createdAt),
        })),
        tickets: tickets.map((t: any) => ({
          id: t.id,
          subject: t.subject,
          status: t.status,
          created_at: iso(t.createdAt),
        })),
      },
    });
  } catch (e) {
    console.error("[admin/users/activity]", e);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "خطا در خواندن فعالیت کاربر" } },
      { status: 500 }
    );
  }
}
