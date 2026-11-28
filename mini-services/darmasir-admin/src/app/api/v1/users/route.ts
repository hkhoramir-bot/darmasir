export const dynamic = "force-dynamic";

// کاربران اپلیکیشن — فهرست با جست‌وجو، فیلتر مسدودی و صفحه‌بندی
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { handler, ok, bool } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

const TAKE = 200;

export async function GET(req: NextRequest) {
  return handler(async () => {
    await requireAdmin(req);
    const sp = req.nextUrl.searchParams;

    const q = sp.get("q");
    const where: Prisma.AppUserWhereInput = {};
    if (q) {
      where.OR = [{ name: { contains: q } }, { deviceId: { contains: q } }];
    }
    const banned = sp.get("banned");
    if (banned !== null) where.banned = bool(banned, "وضعیت مسدودی");

    const page = Math.max(1, Math.trunc(Number(sp.get("page")) || 1));
    const [items, total] = await Promise.all([
      db.appUser.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: TAKE,
        skip: (page - 1) * TAKE,
      }),
      db.appUser.count({ where }),
    ]);
    return ok({ items, total });
  });
}
