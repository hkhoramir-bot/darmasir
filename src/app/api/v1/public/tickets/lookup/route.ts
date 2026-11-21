/* ============================================================
   GET /api/v1/public/tickets/lookup — تیکت‌ها و پاسخ‌های مدیر
   قراردادِ هم‌شکل ورکر ابری — بخش «تیکت‌های من» اپ اندروید
   هدر لازم: X-Sync-Key   ?contact=...
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = req.headers.get("X-Sync-Key") || "";
  if (!key || key !== (process.env.DARMASIR_SYNC_KEY || "darmasir-sync-1404")) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "کلید همگام‌سازی نامعتبر است" } },
      { status: 403 }
    );
  }
  const contact = (req.nextUrl.searchParams.get("contact") || "").trim().slice(0, 120);
  if (!contact) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_INPUT", message: "راه تماس الزامی است" } },
      { status: 400 }
    );
  }
  try {
    const rows = await (db as unknown as {
      supportTicket: { findMany: (o: unknown) => Promise<Record<string, unknown>[]> };
    }).supportTicket.findMany({
      where: { contact },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const tickets = rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      category: r.category,
      message: r.message,
      status: r.status,
      reply: r.reply ?? null,
      repliedAt: r.repliedAt instanceof Date ? r.repliedAt.toISOString() : (r.repliedAt ?? null),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
    }));
    return NextResponse.json({ ok: true, data: { tickets } });
  } catch (e) {
    console.error("[v1/tickets/lookup]", e);
    return NextResponse.json(
      { ok: false, error: { code: "DB_ERROR", message: "خطا در خواندن تیکت‌ها" } },
      { status: 502 }
    );
  }
}
