import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const PANEL_BASE = (process.env.PANEL_API_BASE || "http://localhost:3035").replace(/\/+$/, "");

export interface TicketReplyItem {
  id: number;
  subject: string;
  category: string;
  message: string;
  status: string;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

/** GET /api/tickets/replies?contact=... — تیکت‌ها و پاسخ‌های مدیر برای یک راه تماس
 *  منبع اصلی: پنل مدیریت (بخش تیکت‌ها)؛ در قطعی پنل: تیکت‌های محلی بدون پاسخ */
export async function GET(req: NextRequest) {
  const contact = (req.nextUrl.searchParams.get("contact") || "").trim();
  if (!contact) {
    return NextResponse.json({ error: "راه تماس الزامی است" }, { status: 400 });
  }

  /* ۱) پنل مدیریت — منبع پاسخ‌ها */
  try {
    const res = await fetch(`${PANEL_BASE}/api/v1/public/tickets/lookup?contact=${encodeURIComponent(contact)}`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; data?: { tickets?: TicketReplyItem[] } }
      | null;
    if (res.ok && json?.ok && Array.isArray(json.data?.tickets)) {
      return NextResponse.json({ ok: true, source: "panel", tickets: json.data!.tickets });
    }
  } catch {
    /* پنل در دسترس نیست — نسخه محلی */
  }

  /* ۲) تیکت‌های محلی (بدون پاسخ — پاسخ‌ها فقط در پنل ثبت می‌شوند) */
  try {
    const rows = await db.supportTicket.findMany({
      where: { contact },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        subject: true,
        category: true,
        message: true,
        status: true,
        reply: true,
        repliedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({
      ok: true,
      source: "local",
      tickets: rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        category: r.category,
        message: r.message,
        status: r.status,
        reply: r.reply,
        repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[tickets/replies] local fallback failed:", e);
    return NextResponse.json({ ok: true, source: "none", tickets: [] });
  }
}
