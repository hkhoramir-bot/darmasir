export const dynamic = "force-dynamic";

// جزئیات، ویرایش و حذف تبلیغ
import { NextRequest } from "next/server";
import type { Ad, Prisma } from "@prisma/client";
import { ApiError, handler, ok, bool, isUrl, str } from "@/lib/api";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

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

function placementOf(v: unknown): string {
  if (v === undefined || v === null || v === "") return "HOME_BANNER";
  const s = String(v);
  if (!(PLACEMENTS as readonly string[]).includes(s)) {
    throw new ApiError(400, "VALIDATION", "جایگاه تبلیغ معتبر نیست.");
  }
  return s;
}

function dateOpt(v: unknown): Date | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "VALIDATION", "تاریخ نامعتبر است.");
  return d;
}

async function findOrThrow(id: string): Promise<Ad> {
  const row = await db.ad.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  return row;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    await requireAdmin(req);
    const { id } = await ctx.params;
    return ok(await findOrThrow(id));
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "UPDATE");
    const { id } = await ctx.params;
    const existing = await findOrThrow(id);

    const v = await parseBody(req);
    const data: Prisma.AdUpdateInput = {};

    if (v.title !== undefined) {
      const s = str(v.title, "عنوان تبلیغ", { min: 2, max: 120 });
      if (s !== undefined) data.title = s;
    }
    if (v.body !== undefined) {
      const s = str(v.body, "متن تبلیغ", { optional: true, max: 500 });
      data.body = s ?? null;
    }
    const imageUrl = isUrl(v.imageUrl, "نشانی تصویر");
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    const linkUrl = isUrl(v.linkUrl, "نشانی لینک");
    if (linkUrl !== undefined) data.linkUrl = linkUrl;
    if (v.placement !== undefined) data.placement = placementOf(v.placement);
    if (v.active !== undefined) data.active = bool(v.active, "فعال");

    // بازه تاریخ با مقادیر موجود ادغام می‌شود تا بازه ناهمگون ذخیره نشود
    const startsAt = dateOpt(v.startsAt);
    const endsAt = dateOpt(v.endsAt);
    const effStart = startsAt ?? existing.startsAt;
    const effEnd = endsAt ?? existing.endsAt;
    if (effStart && effEnd && effEnd.getTime() <= effStart.getTime()) {
      throw new ApiError(400, "VALIDATION", "پایان تبلیغ باید بعد از شروع باشد.");
    }
    if (startsAt !== undefined) data.startsAt = startsAt;
    if (endsAt !== undefined) data.endsAt = endsAt;

    const row = await db.ad.update({ where: { id }, data });
    await audit(req, admin, "UPDATE_AD", { entity: "Ad", entityId: id, detail: row.title });
    return ok(row);
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "DELETE");
    const { id } = await ctx.params;
    const existing = await findOrThrow(id);
    await db.ad.delete({ where: { id } });
    await audit(req, admin, "DELETE_AD", { entity: "Ad", entityId: id, detail: existing.title });
    return ok({});
  });
}
