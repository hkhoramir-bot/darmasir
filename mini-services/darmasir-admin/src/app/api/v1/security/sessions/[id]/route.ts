import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, ok, fail, logAudit } from "@/lib/api";

// ============================================================
// ابطال نشست — VIEWER اجازه تغییر ندارد
// ============================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const admin = guard.admin;

  if (admin.role === "VIEWER") {
    return fail("دسترسی شما فقط مشاهده است", 403);
  }

  const { id } = await params;
  let body: { revoked?: boolean };
  try {
    body = await req.json();
  } catch {
    return fail("درخواست نامعتبر است");
  }

  if (body.revoked !== true) {
    return fail("فقط ابطال نشست (revoked=true) مجاز است");
  }

  const session = await db.session.findUnique({ where: { id } });
  if (!session) {
    return fail("نشست مورد نظر یافت نشد", 404);
  }
  if (session.revoked) {
    return fail("این نشست قبلاً باطل شده است");
  }

  await db.session.update({ where: { id }, data: { revoked: true } });

  await logAudit(admin.id, "REVOKE", "SESSION", id, {
    adminId: session.adminId,
    ip: session.ip,
  });
  return ok({ revoked: true });
}
