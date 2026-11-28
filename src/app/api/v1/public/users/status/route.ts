/* ============================================================
   GET /api/v1/public/users/status — وضعیت واقعی کاربر در Turso
   قراردادِ هم‌شکل ورکر ابری — اپ اندروید برای بررسی مسدودی/حذف
   هدر لازم: X-Sync-Key   ?identifier=09... | email
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeEmail, normalizePhone } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = req.headers.get("X-Sync-Key") || "";
  if (!key || key !== (process.env.DARMASIR_SYNC_KEY || "darmasir-sync-1404")) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "کلید همگام‌سازی نامعتبر است" } },
      { status: 403 }
    );
  }
  const rawId = (req.nextUrl.searchParams.get("identifier") || "").trim().slice(0, 120);
  if (!rawId) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_INPUT", message: "شناسه کاربر الزامی است" } },
      { status: 400 }
    );
  }
  try {
    const isEmail = rawId.includes("@");
    const row = isEmail
      ? await db.user.findFirst({ where: { email: normalizeEmail(rawId) || "" } })
      : await db.user.findFirst({ where: { phone: normalizePhone(rawId) || "" } });
    return NextResponse.json({
      ok: true,
      data: { exists: !!row, status: row?.status ?? null },
    });
  } catch (e) {
    console.error("[v1/users/status]", e);
    return NextResponse.json(
      { ok: false, error: { code: "DB_ERROR", message: "خطا در خواندن دیتابیس" } },
      { status: 502 }
    );
  }
}
