export const dynamic = "force-dynamic";

// ویرایش و حذف نسخه اپلیکیشن
import { NextRequest } from "next/server";
import type { AppVersion, Prisma } from "@prisma/client";
import { ApiError, handler, ok, bool, num, str } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
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

function checkApkUrl(s: string): void {
  if (!s.startsWith("/") && !/^https:\/\/.+/i.test(s)) {
    throw new ApiError(400, "VALIDATION", "نشانی فایل باید آدرس https یا مسیری با / باشد.");
  }
}

async function findOrThrow(id: string): Promise<AppVersion> {
  const row = await db.appVersion.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  return row;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    await requirePermission(req, "READ");
    const { id } = await ctx.params;
    return ok(await findOrThrow(id));
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "UPDATE");
    const { id } = await ctx.params;
    await findOrThrow(id);

    const v = await parseBody(req);
    const data: Prisma.AppVersionUpdateInput = {};

    if (v.versionName !== undefined) {
      const s = str(v.versionName, "نام نسخه", { min: 5, max: 20 });
      if (s !== undefined) {
        if (!/^\d+\.\d+\.\d+$/.test(s)) {
          throw new ApiError(400, "VALIDATION", "قالب نسخه باید مثل 4.8.17 باشد.");
        }
        data.versionName = s;
      }
    }
    if (v.versionCode !== undefined) {
      const n = num(v.versionCode, "کد نسخه", { int: true, min: 1, max: 999999 });
      if (n !== undefined) {
        const clash = await db.appVersion.findUnique({ where: { versionCode: n } });
        if (clash && clash.id !== id) {
          throw new ApiError(409, "CONFLICT", "کد نسخه تکراری است.");
        }
        data.versionCode = n;
      }
    }
    if (v.apkUrl === null) data.apkUrl = null;
    else if (v.apkUrl !== undefined) {
      const s = str(v.apkUrl, "نشانی فایل", { optional: true, max: 300 });
      if (s !== undefined) {
        checkApkUrl(s);
        data.apkUrl = s;
      }
    }
    if (v.notes === null) data.notes = null;
    else if (v.notes !== undefined) {
      const s = str(v.notes, "یادداشت‌ها", { optional: true, max: 1000 });
      data.notes = s ?? null;
    }
    if (v.mandatory !== undefined) data.mandatory = bool(v.mandatory, "اجباری");
    if (v.active !== undefined) data.active = bool(v.active, "فعال");

    const row = await db.appVersion.update({ where: { id }, data });
    await audit(req, admin, "UPDATE_VERSION", { entity: "AppVersion", entityId: id, detail: row.versionName });
    return ok(row);
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "DELETE");
    const { id } = await ctx.params;
    const existing = await findOrThrow(id);
    await db.appVersion.delete({ where: { id } });
    await audit(req, admin, "DELETE_VERSION", { entity: "AppVersion", entityId: id, detail: existing.versionName });
    return ok({});
  });
}
