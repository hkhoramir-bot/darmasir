/* ============================================================
   POST /api/auth/otp/verify — تأیید کد پیامکی و ورود/ثبت‌نام خودکار
   { phone, code, device? } → { token, user, isNew }
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, normalizePhone, publicUser } from "@/lib/auth-server";
import { MSG_BLOCKED } from "@/lib/admin-guard";
import { syncAppUser } from "@/lib/panel";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body?.phone ?? ""));
  const code = String(body?.code ?? "").replace(/\D/g, "");
  const device = String(body?.device ?? "web").slice(0, 40);

  if (!phone) {
    return NextResponse.json({ error: "شماره موبایل معتبر نیست" }, { status: 400 });
  }
  if (code.length !== 6) {
    return NextResponse.json({ error: "کد ۶ رقمی را کامل وارد کنید" }, { status: 400 });
  }

  // کاربر مسدود شده اجازه ورود با کد پیامکی ندارد
  try {
    const blocked = await db.user.findUnique({ where: { phone }, select: { status: true } });
    if (blocked?.status === "blocked") {
      return NextResponse.json({ error: MSG_BLOCKED }, { status: 403 });
    }
  } catch {
    /* بررسی مسدودی نباید جریان تأیید کد را بشکند */
  }

  try {
    const otp = await db.otpCode.findFirst({
      where: { phone, used: false, purpose: "login" },
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

    await db.otpCode.update({ where: { id: otp.id }, data: { used: true } });

    // کاربر با این شماره — موجود یا جدید
    let user = await db.user.findUnique({ where: { phone } });
    const isNew = !user;
    const now = new Date();

    if (!user) {
      user = await db.user.create({
        data: {
          name: `کاربر ${phone.slice(-4)}`,
          phone,
          lastLoginAt: now,
        },
      });
    } else {
      await db.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
    }

    const { token } = await createSession(user.id, device);
    syncAppUser({ phone: user.phone, email: user.email, name: user.name });
    return NextResponse.json({ token, user: publicUser({ ...user, lastLoginAt: now }), isNew });
  } catch (e) {
    console.error("[auth/otp/verify]", e);
    return NextResponse.json({ error: "خطا در تأیید کد — دوباره تلاش کنید" }, { status: 500 });
  }
}
