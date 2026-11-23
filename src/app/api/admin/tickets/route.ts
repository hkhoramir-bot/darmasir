/* ============================================================
   GET /api/admin/tickets — تیکت‌های واقعی اپ از دیتابیس ابری (D1)
   همه تیکت‌هایی که کاربران وب و اپ اندروید ثبت کرده‌اند.
   هدر لازم: X-Admin-Key — ?since=<iso> برای همگام‌سازی افزایشی پنل
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminKey } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  try {
    const rows = await db.supportTicket.findMany({
      orderBy: { createdAt: "desc" as const },
      take: 300,
    });
    return NextResponse.json({
      ok: true,
      data: rows.map((t: any) => ({
        id: t.id,
        name: t.name,
        contact: t.contact,
        category: t.category,
        subject: t.subject,
        message: t.message,
        status: t.status,
        reply: t.reply ?? null,
        replied_at: t.repliedAt ? new Date(t.repliedAt).toISOString() : null,
        created_at: new Date(t.createdAt).toISOString(),
      })),
    });
  } catch (e) {
    console.error("[admin/tickets]", e);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "خطا در خواندن تیکت‌های ابری" } },
      { status: 500 }
    );
  }
}
