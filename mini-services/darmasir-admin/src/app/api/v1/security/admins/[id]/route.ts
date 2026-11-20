import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, ok, fail, logAudit } from "@/lib/api";

// ============================================================
// ویرایش مدیر (فعال/غیرفعال، نقش، نام) — فقط SUPERADMIN
// قوانین: عدم غیرفعال‌سازی خود؛ حفظ حداقل یک SUPERADMIN فعال
// ============================================================

const ROLES = ["SUPERADMIN", "OPERATOR", "VIEWER"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const admin = guard.admin;

  if (admin.role !== "SUPERADMIN") {
    return fail("مدیریت مدیران فقط توسط مدیر ارشد سامانه امکان‌پذیر است", 403);
  }

  const { id } = await params;
  let body: { active?: boolean; role?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return fail("درخواست نامعتبر است");
  }

  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) {
    return fail("مدیر مورد نظر یافت نشد", 404);
  }

  const data: { active?: boolean; role?: string; name?: string } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 80) {
      return fail("نام باید بین ۲ تا ۸۰ کاراکتر باشد");
    }
    data.name = name;
  }

  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) {
      return fail("نقش انتخاب‌شده معتبر نیست");
    }
    data.role = body.role;
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return fail("مقدار وضعیت باید true یا false باشد");
    }
    data.active = body.active;
  }

  if (Object.keys(data).length === 0) {
    return fail("هیچ تغییری ارسال نشده است");
  }

  // قانون ۱: کاربر نمی‌تواند خودش را غیرفعال کند
  if (data.active === false && target.id === admin.id) {
    return fail("نمی‌توانید حساب خودتان را غیرفعال کنید");
  }

  // قانون ۲: نقش SUPERADMIN از آخرین مدیر ارشد فعال گرفته نمی‌شود
  const demoteSuper =
    target.role === "SUPERADMIN" &&
    target.active &&
    (data.role !== undefined && data.role !== "SUPERADMIN" ||
      data.active === false);
  if (demoteSuper) {
    const others = await db.adminUser.count({
      where: {
        role: "SUPERADMIN",
        active: true,
        id: { not: target.id },
      },
    });
    if (others === 0) {
      return fail("حداقل یک مدیر ارشد فعال باید در سامانه باقی بماند");
    }
  }

  const updated = await db.adminUser.update({
    where: { id },
    data,
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      active: true,
    },
  });

  await logAudit(admin.id, "UPDATE", "ADMIN", id, { changes: data });
  return ok({ admin: updated });
}
