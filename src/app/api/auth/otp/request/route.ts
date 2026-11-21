/* ============================================================
   POST /api/auth/otp/request — ارسال کد ورود پیامکی
   { phone } → { ok, expiresInSeconds, devCode? }
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/auth-server";
import { sendOtpSms, smsProviderConfigured } from "@/lib/sms";

export const dynamic = "force-dynamic";

const CODE_TTL_MS = 3 * 60 * 1000; // اعتبار کد: ۳ دقیقه
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 3; // حداکثر ۳ کد در هر دقیقه برای هر شماره

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (!phone) {
    return NextResponse.json({ error: "شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)" }, { status: 400 });
  }

  try {
    // محدودیت ارسال
    const recent = await db.otpCode.count({
      where: { phone, createdAt: { gt: new Date(Date.now() - RATE_WINDOW_MS) } },
    });
    if (recent >= RATE_LIMIT) {
      return NextResponse.json(
        { error: "درخواست کد زیاد است — یک دقیقه بعد دوباره تلاش کنید" },
        { status: 429 }
      );
    }

    // باطل کردن کدهای قبلی استفاده‌نشده
    await db.otpCode.updateMany({ where: { phone, used: false }, data: { used: true } });

    const code = genCode();
    await db.otpCode.create({
      data: { phone, code, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    });

    const sms = await sendOtpSms(phone, code);

    return NextResponse.json({
      ok: true,
      delivered: sms.delivered,
      expiresInSeconds: Math.floor(CODE_TTL_MS / 1000),
      // حالت توسعه (سرویس پیامک تنظیم نشده): کد در پاسخ برگردانده می‌شود تا ورود قابل تست باشد
      devCode: !sms.delivered && !smsProviderConfigured() ? code : undefined,
    });
  } catch (e) {
    console.error("[auth/otp/request]", e);
    return NextResponse.json({ error: "خطا در ارسال کد — دوباره تلاش کنید" }, { status: 500 });
  }
}
