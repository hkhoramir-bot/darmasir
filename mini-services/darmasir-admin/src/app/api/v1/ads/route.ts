export const dynamic = "force-dynamic";

// تبلیغات — فهرست و ایجاد
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ApiError, handler, ok, bool, isUrl, str } from "@/lib/api";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

const PLACEMENTS = ["HOME_BANNER", "LINES", "MAP", "STATION_DETAIL"] as const;

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
    return j as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "بدنه درخواست معتبر نیست.");
  }
}

/** رشته الزامی — str با تضمین مقدار */
function reqStr(v: unknown, field: string, o: { min?: number; max?: number } = {}): string {
  const s = str(v, field, { ...o, optional: false });
  return s as string;
}

function placementOf(v: unknown): string {
  if (v === undefined || v === null || v === "") return "HOME_BANNER";
  const s = String(v);
  if (!(PLACEMENTS as readonly string[]).includes(s)) {
    throw new ApiError(400, "VALIDATION", "جایگاه تبلیغ معتبر نیست.");
  }
  return s;
}

/** تاریخ اختیاری — رشته ISO معتبر به Date تبدیل می‌شود */
function dateOpt(v: unknown): Date | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "VALIDATION", "تاریخ نامعتبر است.");
  return d;
}

export async function GET(req: NextRequest) {
  return handler(async () => {
    await requireAdmin(req);
    const sp = req.nextUrl.searchParams;

    const where: Prisma.AdWhereInput = {};
    const placement = sp.get("placement");
    if (placement) {
      if (!(PLACEMENTS as readonly string[]).includes(placement)) {
        throw new ApiError(400, "VALIDATION", "جایگاه تبلیغ معتبر نیست.");
      }
      where.placement = placement;
    }
    const active = sp.get("active");
    if (active !== null) where.active = bool(active, "وضعیت فعال");

    const rows = await db.ad.findMany({ where, orderBy: { createdAt: "desc" } });
    return ok(rows);
  });
}

export async function POST(req: NextRequest) {
  return handler(async () => {
    const admin = await requirePermission(req, "CREATE");
    const v = await parseBody(req);

    const title = reqStr(v.title, "عنوان تبلیغ", { min: 2, max: 120 });
    const body = str(v.body, "متن تبلیغ", { optional: true, max: 500 });
    const imageUrl = isUrl(v.imageUrl, "نشانی تصویر");
    const linkUrl = isUrl(v.linkUrl, "نشانی لینک");
    const placement = placementOf(v.placement);
    const active = bool(v.active, "فعال", false);
    const startsAt = dateOpt(v.startsAt);
    const endsAt = dateOpt(v.endsAt);

    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new ApiError(400, "VALIDATION", "پایان تبلیغ باید بعد از شروع باشد.");
    }

    const row = await db.ad.create({
      data: {
        title,
        body: body ?? null,
        imageUrl: imageUrl ?? null,
        linkUrl: linkUrl ?? null,
        placement,
        active,
        startsAt: startsAt ?? null,
        endsAt: endsAt ?? null,
      },
    });

    await audit(req, admin, "CREATE_AD", { entity: "Ad", entityId: row.id, detail: title });
    return ok(row);
  });
}
