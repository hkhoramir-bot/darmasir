/* ============================================================
   POST /api/admin/tickets/reply — پاسخ مدیر به تیکت ابری (D1)
   پنل مدیریت پس از پاسخ به تیکتِ همگام‌شده از ابر، پاسخ را همینجا
   در دیتابیس واقعی هم ثبت می‌کند تا کاربر اپ اندروید پاسخ را
   بلافاصله در بخش «تیکت‌های من» ببیند.
   هدر لازم: X-Admin-Key
   بدنه: { id, reply?, status? }
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminKey } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_INPUT", message: "شناسه تیکت الزامی است" } },
      { status: 400 }
    );
  }
  const reply = typeof body?.reply === "string" ? body.reply.trim().slice(0, 4000) : "";
  const status = ["open", "answered", "closed"].includes(body?.status) ? body.status : undefined;

  try {
    const ticket = await db.supportTicket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "تیکت در دیتابیس ابری یافت نشد" } },
        { status: 404 }
      );
    }
    const nextStatus = status ?? (reply ? "answered" : ticket.status);
    await db.supportTicket.update({
      where: { id },
      data: {
        ...(reply ? { reply, repliedAt: new Date() } : {}),
        status: nextStatus,
      },
    });
    return NextResponse.json({ ok: true, data: { id, status: nextStatus, replied: !!reply } });
  } catch (e) {
    console.error("[admin/tickets/reply]", e);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "خطا در ثبت پاسخ در دیتابیس ابری" } },
      { status: 500 }
    );
  }
}
