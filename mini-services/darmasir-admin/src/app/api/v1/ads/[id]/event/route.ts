export const dynamic = "force-dynamic";

// ثبت رویداد تبلیغ (نمایش/کلیک) — نقطه عمومی برای اپلیکیشن؛ بدون احراز هویت پنل
import { NextRequest } from "next/server";
import { ApiError, handler, ok } from "@/lib/api";
import { clientIp } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
    return j as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "بدنه درخواست معتبر نیست.");
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    rateLimit(`ad:${clientIp(req)}`, 120, 60 * 1000);

    const { id } = await ctx.params;
    const v = await parseBody(req);
    const type = v.type;
    if (type !== "view" && type !== "click") {
      throw new ApiError(400, "VALIDATION", "نوع رویداد باید view یا click باشد.");
    }

    const ad = await db.ad.findUnique({ where: { id }, select: { id: true } });
    if (!ad) throw new ApiError(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");

    const row = await db.ad.update({
      where: { id },
      data: type === "view" ? { views: { increment: 1 } } : { clicks: { increment: 1 } },
      select: { views: true, clicks: true },
    });
    return ok({ views: row.views, clicks: row.clicks });
  });
}
