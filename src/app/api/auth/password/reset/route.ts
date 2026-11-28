/* ============================================================
   POST /api/auth/password/reset — بازیابی رمز عبور با کد پیامکی
   { phone, code, newPassword } → { ok }
   جریان: کاربر کد را از /api/auth/otp/request می‌گیرد،
   سپس با تأیید کد، رمز جدید تنظیم و همه نشست‌ها باطل می‌شود.
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, normalizePhone } from "@/lib/auth-server";
import { MSG_BLOCKED } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body?.phone ?? ""));
  const code = String(body?.code ?? "").replace(/\D/g, "");
  const newPassword = String(body?.newPassword ?? "");

  if (!phone) {
    return NextResponse.json({ error: "شماره موبایل معتبر نیست" }, { status: 400 });
  }
  if (code.length !== 6) {
    return NextResponse.json({ error: "کد ۶ رقمی را کامل وارد کنید" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "رمز عبور جدید باید حداقل ۶ کاراکتر باشد" }, { status: 400 });
  }

  try {
    const user = await db.user.findUnique({ where: { phone } });
    if (!user) {
      return NextResponse.json({ error: "حسابی با این شماره پیدا نشد" }, { status: 404 });
    }
    if (user.status === "blocked") {
      return NextResponse.json({ error: MSG_BLOCKED }, { status: 403 });
    }

    const otp = await db.otpCode.findFirst({
      where: { phone, used: false, purpose: "password_reset" },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      return NextResponse.json({ error: "کدی برای این شماره یافت نشد — دوباره درخواست کنید" }, { status: 400 });
    }
    if (otp.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "کد منقضی شده است — کد جدید بگیرید" }, { status: 400 });
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      await db.otpCode.update({ where: { id: otp.id }, data: { used: true } });
      return NextResponse.json({ error: "تلاش‌های بیش از حد — کد جدید بگیرید" }, { status: 429 });
    }
    if (otp.code !== code) {
      await db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return NextResponse.json(
        { error: `کد اشتباه است — ${MAX_ATTEMPTS - otp.attempts - 1} تلاش باقی مانده` },
        { status: 400 }
      );
    }

    // مصرف کد و تنظیم رمز جدید
    await db.otpCode.update({ where: { id: otp.id }, data: { used: true } });
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword) },
    });

    // امنیت: باطل کردن همه نشست‌های فعال پس از تغییر رمز عبور
    await db.session.deleteMany({ where: { userId: user.id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[auth/password/reset]", e);
    return NextResponse.json({ error: "خطا در تغییر رمز عبور — دوباره تلاش کنید" }, { status: 500 });
  }
}
