/* ============================================================
   POST /api/auth/password/forgot — درخواست کد بازیابی رمز عبور
   { phone } → { ok, expiresInSeconds, hasEmail, emailSent?, devCode? }
   بررسی پرونده: اگر کاربر با این شماره در دیتابیس (بخش کاربران
   پنل مدیریت) ثبت‌نشده باشد، خطای NO_RECORD برگردانده می‌شود —
   «شما پرونده‌ای ندارید؛ لطفاً ابتدا ثبت‌نام کنید».
   کد از دو کانال ارسال می‌شود: پیامک + ایمیل (اگر کاربر ایمیل
   داشته باشد؛ ارسال از طریق SMTP پنل مدیریت).
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/auth-server";
import { MSG_BLOCKED } from "@/lib/admin-guard";
import { sendOtpSms, smsProviderConfigured } from "@/lib/sms";
import { sendOtpEmail } from "@/lib/email";

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
    /* ---------- بررسی پرونده کاربر در دیتابیس ---------- */
    const user = await db.user.findUnique({ where: { phone } });
    if (!user) {
      return NextResponse.json(
        {
          code: "NO_RECORD",
          error: "شما پرونده‌ای در درمسیر ندارید — لطفاً ابتدا ثبت‌نام کنید",
        },
        { status: 404 }
      );
    }
    if (user.status === "blocked") {
      return NextResponse.json({ error: MSG_BLOCKED }, { status: 403 });
    }

    /* ---------- محدودیت ارسال ---------- */
    const recent = await db.otpCode.count({
      where: { phone, createdAt: { gt: new Date(Date.now() - RATE_WINDOW_MS) } },
    });
    if (recent >= RATE_LIMIT) {
      return NextResponse.json(
        { error: "درخواست کد زیاد است — یک دقیقه بعد دوباره تلاش کنید" },
        { status: 429 }
      );
    }

    /* ---------- باطل کردن کدهای قبلی استفاده‌نشده ---------- */
    await db.otpCode.updateMany({ where: { phone, used: false }, data: { used: true } });

    const code = genCode();
    const email = user.email?.trim() || null;

    const otp = await db.otpCode.create({
      data: {
        phone,
        code,
        purpose: "password_reset",
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
        ...(email ? { emailTo: email } : {}),
      },
    });

    /* ---------- ارسال پیامک ---------- */
    const sms = await sendOtpSms(phone, code);

    /* ---------- ارسال ایمیل (اگر کاربر ایمیل دارد) ---------- */
    let emailSent: boolean | null = null;
    let emailStatus: string | null = null;
    let emailError: string | null = null;
    if (email) {
      const mail = await sendOtpEmail({
        to: email,
        code,
        name: user.name,
        phone,
        kind: "password_reset",
      });
      emailSent = mail.sent;
      emailStatus = mail.status;
      emailError = mail.error ?? null;
      await db.otpCode.update({
        where: { id: otp.id },
        data: { emailStatus: mail.status },
      });
    }

    return NextResponse.json({
      ok: true,
      delivered: sms.delivered,
      hasEmail: Boolean(email),
      ...(email ? { emailSent, emailStatus, emailError } : {}),
      expiresInSeconds: Math.floor(CODE_TTL_MS / 1000),
      // حالت توسعه (سرویس پیامک تنظیم نشده): کد در پاسخ برگردانده می‌شود تا بازیابی قابل تست باشد
      devCode: !sms.delivered && !smsProviderConfigured() ? code : undefined,
    });
  } catch (e) {
    console.error("[auth/password/forgot]", e);
    return NextResponse.json({ error: "خطا در ارسال کد بازیابی — دوباره تلاش کنید" }, { status: 500 });
  }
}
