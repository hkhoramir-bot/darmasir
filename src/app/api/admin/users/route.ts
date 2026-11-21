/* ============================================================
   GET /api/admin/users — فهرست کاربران واقعی اپ (منبع: Prisma)
   هدر لازم: X-Admin-Key (پنل مدیریت با این کلید وصل می‌شود)
   ?q= جست‌وجو در نام/شماره/ایمیل
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminKey } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 60);

  try {
    const users = await db.user.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q } },
              { phone: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" as const },
      take: 200,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        passwordHash: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { sessions: true } },
      },
    });

    /* فعالیت واقعی کاربران اپ اندروید (سفر/علاقه‌مندی/مسیر روزمره) — از D1
       شناسه فعالیت = شماره موبایل یا ایمیل کاربر (همان که اپ با X-Sync-Key می‌فرستد) */
    const tripCounts: Record<string, number> = {};
    const favCounts: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};
    try {
      const anyDb = db as any;
      const [t, f, d] = await Promise.all([
        anyDb.appUserTrip?.groupCount?.("identifier"),
        anyDb.appUserFavorite?.groupCount?.("identifier"),
        anyDb.appUserDailyRoute?.groupCount?.("identifier"),
      ]);
      Object.assign(tripCounts, t ?? {});
      Object.assign(favCounts, f ?? {});
      Object.assign(dailyCounts, d ?? {});
    } catch {
      /* نبود جدول فعالیت (بکاند محلی قدیمی) — صفر نمایش داده می‌شود */
    }
    const actOf = (u: { phone: string | null; email: string | null }) => {
      const key = u.phone || u.email || "";
      return {
        trips: tripCounts[key] ?? 0,
        favorites: favCounts[key] ?? 0,
        daily_routes: dailyCounts[key] ?? 0,
      };
    };

    const asIso = (v: unknown): string | null => {
      try {
        if (v instanceof Date) return v.toISOString();
        if (typeof v === "number") return new Date(v).toISOString();
        if (typeof v === "string" && v.trim()) {
          const n = Number(v);
          return new Date(Number.isFinite(n) && n > 0 ? n : v).toISOString();
        }
        return null;
      } catch {
        return null;
      }
    };

    return NextResponse.json({
      ok: true,
      data: users.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        status: u.status,
        has_password: !!u.passwordHash,
        sessions: Number((u._count as { sessions?: number } | undefined)?.sessions ?? 0),
        ...actOf(u),
        created_at: asIso(u.createdAt) ?? new Date(0).toISOString(),
        last_login_at: asIso(u.lastLoginAt),
      })),
    });
  } catch (e) {
    console.error("[admin/users]", e);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "خطا در خواندن کاربران" } },
      { status: 500 }
    );
  }
}
