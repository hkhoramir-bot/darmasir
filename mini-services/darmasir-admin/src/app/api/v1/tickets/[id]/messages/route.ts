export const dynamic = "force-dynamic";

// پاسخ مدیر به تیکت — پیام جدید ثبت و تیکت باز به «در انتظار پاسخ کاربر» می‌رود
import { NextRequest } from "next/server";
import { ApiError, handler, ok, str } from "@/lib/api";
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

/** رشته الزامی — str با تضمین مقدار */
function reqStr(v: unknown, field: string, o: { min?: number; max?: number } = {}): string {
  const s = str(v, field, { ...o, optional: false });
  return s as string;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "UPDATE");
    const { id } = await ctx.params;

    const ticket = await db.ticket.findUnique({ where: { id } });
    if (!ticket) throw new ApiError(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");

    const v = await parseBody(req);
    const body = reqStr(v.body, "متن پیام", { min: 1, max: 1000 });

    const message = await db.ticketMessage.create({
      data: { ticketId: id, author: "ADMIN", authorName: admin.name, body },
    });

    // تیکت OPEN پس از پاسخ مدیر، در انتظار واکنش کاربر می‌ماند
    if (ticket.status === "OPEN") {
      await db.ticket.update({ where: { id }, data: { status: "PENDING" } });
    }

    await audit(req, admin, "REPLY_TICKET", { entity: "Ticket", entityId: id, detail: ticket.subject });
    return ok(message);
  });
}
