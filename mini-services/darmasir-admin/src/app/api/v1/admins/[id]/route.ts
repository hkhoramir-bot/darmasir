export const dynamic = "force-dynamic";

// ویرایش و حذف مدیر — با محافظ‌های حساب خود و آخرین مدیر کل فعال
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ApiError, handler, ok, bool, str } from "@/lib/api";
import { requirePermission, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const ROLES = ["SUPERADMIN", "OPERATOR", "VIEWER"] as const;

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
    return j as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "بدنه درخواست معتبر نیست.");
  }
}

const ADMIN_SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export async function PUT(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "ADMIN");
    const { id } = await ctx.params;
    const target = await db.adminUser.findUnique({ where: { id } });
    if (!target) throw new ApiError(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");

    const v = await parseBody(req);
    const data: Prisma.AdminUserUpdateInput = {};

    if (v.name !== undefined) {
      const s = str(v.name, "نام", { min: 2, max: 60 });
      if (s !== undefined) data.name = s;
    }
    if (v.role !== undefined) {
      const s = String(v.role);
      if (!(ROLES as readonly string[]).includes(s)) {
        throw new ApiError(400, "VALIDATION", "نقش باید یکی از SUPERADMIN، OPERATOR، VIEWER باشد.");
      }
      data.role = s;
    }
    if (v.active !== undefined) data.active = bool(v.active, "وضعیت فعال");
    if (v.password !== undefined) {
      const p = str(v.password, "گذرواژه", { max: 72 });
      if (p !== undefined) {
        if (p.length < 8) throw new ApiError(400, "VALIDATION", "گذرواژه باید حداقل ۸ نویسه باشد.");
        data.passwordHash = hashPassword(p);
      }
    }

    // محافظ ۱ — حساب خود را نمی‌توان غیرفعال کرد یا نقش خود را از مدیرکل پایین آورد
    const demoteOrDeactivate =
      data.active === false || (data.role !== undefined && data.role !== "SUPERADMIN");
    if (admin.id === id && demoteOrDeactivate) {
      throw new ApiError(400, "VALIDATION", "نمی‌توانید نقش یا وضعیت حساب خودتان را این‌گونه تغییر دهید.");
    }

    // محافظ ۲ — آخرین مدیر کل فعال نباید از دسترس خارج شود
    const touchesSuperadmin =
      target.role === "SUPERADMIN" &&
      target.active &&
      (data.active === false || (data.role !== undefined && data.role !== "SUPERADMIN"));
    if (touchesSuperadmin) {
      const others = await db.adminUser.count({
        where: { role: "SUPERADMIN", active: true, id: { not: id } },
      });
      if (others === 0) {
        throw new ApiError(400, "VALIDATION", "باید حداقل یک مدیر کل فعال بماند.");
      }
    }

    const row = await db.adminUser.update({ where: { id }, data, select: ADMIN_SELECT });

    // غیرفعال‌سازی حساب → همه نشست‌های فعال باطل می‌شوند
    if (data.active === false) {
      await db.session.deleteMany({ where: { adminId: id } });
    }

    await audit(req, admin, "UPDATE_ADMIN", { entity: "AdminUser", entityId: id, detail: row.username });
    return ok(row);
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "ADMIN");
    const { id } = await ctx.params;

    // حذف حساب خود مجاز نیست
    if (admin.id === id) {
      throw new ApiError(400, "VALIDATION", "نمی‌توانید حساب خودتان را حذف کنید.");
    }
    const target = await db.adminUser.findUnique({ where: { id } });
    if (!target) throw new ApiError(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");

    // آخرین مدیر کل فعال قابل حذف نیست
    if (target.role === "SUPERADMIN" && target.active) {
      const others = await db.adminUser.count({
        where: { role: "SUPERADMIN", active: true, id: { not: id } },
      });
      if (others === 0) {
        throw new ApiError(400, "VALIDATION", "باید حداقل یک مدیر کل فعال بماند.");
      }
    }

    await db.session.deleteMany({ where: { adminId: id } });
    await db.adminUser.delete({ where: { id } });

    await audit(req, admin, "DELETE_ADMIN", { entity: "AdminUser", entityId: id, detail: target.username });
    return ok({});
  });
}
