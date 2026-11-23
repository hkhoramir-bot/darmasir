import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdmin, ok, fail, logAudit } from "@/lib/api";

// ============================================================
// بازنشانی گذرواژه مدیر — فقط SUPERADMIN، حداقل ۸ کاراکتر
// ============================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const admin = guard.admin;

  if (admin.role !== "SUPERADMIN") {
    return fail("بازنشانی گذرواژه فقط توسط مدیر ارشد سامانه امکان‌پذیر است", 403);
  }

  const { id } = await params;
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return fail("درخواست نامعتبر است");
  }

  const password = body.password || "";
  if (password.length < 8) {
    return fail("گذرواژه باید حداقل ۸ کاراکتر باشد");
  }
  if (password.length > 72) {
    return fail("گذرواژه حداکثر می‌تواند ۷۲ کاراکتر باشد");
  }

  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) {
    return fail("مدیر مورد نظر یافت نشد", 404);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.adminUser.update({ where: { id }, data: { passwordHash } });

  await logAudit(admin.id, "PASSWORD_RESET", "ADMIN", id, {
    username: target.username,
  });
  return ok({ changed: true });
}
