/* ============================================================
   GET /api/admin/otp?phone= — کدهای پیامکی اخیر یک شماره
   هدر لازم: X-Admin-Key
   پنل مدیریت کد فعال ارسالی به کاربر را با این مسیر می‌بیند.
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminKey } from "@/lib/admin-guard";
import { normalizePhone } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  const phone = normalizePhone(req.nextUrl.searchParams.get("phone") || "");
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_INPUT", message: "شماره موبایل معتبر نیست" } },
      { status: 400 }
    );
  }

  try {
    const codes = await db.otpCode.findMany({
      where: { phone },
      orderBy: { createdAt: "desc" as const },
      take: 5,
      select: {
        code: true,
        attempts: true,
        used: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        phone,
        codes: codes.map((c) => ({
          code: c.code,
          attempts: c.attempts,
          used: c.used,
          expires_at: c.expiresAt.toISOString(),
          created_at: c.createdAt.toISOString(),
          valid: !c.used && c.expiresAt.getTime() > Date.now() && c.attempts < 5,
        })),
      },
    });
  } catch (e) {
    console.error("[admin/otp]", e);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "خطا در خواندن کدهای پیامکی" } },
      { status: 500 }
    );
  }
}
