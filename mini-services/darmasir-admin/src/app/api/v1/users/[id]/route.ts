export const dynamic = "force-dynamic";

// جزئیات، ویرایش و حذف کاربر اپلیکیشن
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ApiError, handler, ok, bool, str } from "@/lib/api";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

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

async function findOrThrow(id: string) {
  const row = await db.appUser.findUnique({
    where: { id },
    include: { _count: { select: { tickets: true } } },
  });
  if (!row) throw new ApiError(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  return row;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const user = await findOrThrow(id);
    const { _count, ...rest } = user;
    return ok({ ...rest, ticketCount: _count.tickets });
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "UPDATE");
    const { id } = await ctx.params;
    const existing = await findOrThrow(id);

    const v = await parseBody(req);
    const data: Prisma.AppUserUpdateInput = {};

    if (v.name !== undefined) {
      // ارسال null یا رشته خالی یعنی پاک‌کردن نام
      const s = str(v.name, "نام", { optional: true, max: 60 });
      data.name = s ?? null;
    }
    if (v.active !== undefined) data.active = bool(v.active, "وضعیت فعال");
    if (v.banned !== undefined) data.banned = bool(v.banned, "مسدودی");
    if (v.banReason !== undefined) {
      const s = str(v.banReason, "دلیل مسدودی", { optional: true, max: 200 });
      data.banReason = s ?? null;
    }
    if (v.city !== undefined) {
      const s = str(v.city, "شهر", { optional: true, max: 40 });
      data.city = s ?? null;
    }

    const row = await db.appUser.update({ where: { id }, data });
    await audit(req, admin, "UPDATE_USER", { entity: "AppUser", entityId: id, detail: existing.deviceId });
    return ok(row);
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "DELETE");
    const { id } = await ctx.params;
    const existing = await findOrThrow(id);
    // تیکت‌های کاربر با SetNull حفظ می‌شوند
    await db.appUser.delete({ where: { id } });
    await audit(req, admin, "DELETE_USER", { entity: "AppUser", entityId: id, detail: existing.deviceId });
    return ok({});
  });
}
