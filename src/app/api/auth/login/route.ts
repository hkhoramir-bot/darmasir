/* ============================================================
   POST /api/auth/login — ورود با ایمیل/موبایل + رمز عبور
   { identifier, password, device? }
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, normalizeEmail, normalizePhone, publicUser, verifyPassword } from "@/lib/auth-server";
import { MSG_BLOCKED } from "@/lib/admin-guard";
import { syncAppUser } from "@/lib/panel";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const identifier = String(body?.identifier ?? "").trim();
  const password = String(body?.password ?? "");
  const device = String(body?.device ?? "web").slice(0, 40);

  if (!identifier || !password) {
    return NextResponse.json({ error: "اطلاعات ورود را کامل وارد کنید" }, { status: 400 });
  }

  // تشخیص ایمیل یا شماره موبایل
  let phone: string | null = null;
  let email: string | null = null;
  if (identifier.includes("@")) {
    email = normalizeEmail(identifier);
    if (!email) return NextResponse.json({ error: "ایمیل معتبر نیست" }, { status: 400 });
  } else {
    phone = normalizePhone(identifier);
    if (!phone) return NextResponse.json({ error: "شماره موبایل معتبر نیست" }, { status: 400 });
  }

  try {
    const user = await db.user.findFirst({
      where: { OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] },
    });
    if (!user) {
      return NextResponse.json({ error: "حسابی با این مشخصات پیدا نشد" }, { status: 404 });
    }
    if (user.status === "blocked") {
      return NextResponse.json({ error: MSG_BLOCKED }, { status: 403 });
    }
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "برای این حساب رمز عبور تنظیم نشده — از ورود با کد پیامکی استفاده کنید" },
        { status: 400 }
      );
    }
    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "رمز عبور اشتباه است" }, { status: 401 });
    }

    const now = new Date();
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
    const { token } = await createSession(user.id, device);
    syncAppUser({ phone: user.phone, email: user.email, name: user.name });
    return NextResponse.json({ token, user: publicUser({ ...user, lastLoginAt: now }) });
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json({ error: "خطا در ورود — دوباره تلاش کنید" }, { status: 500 });
  }
}
