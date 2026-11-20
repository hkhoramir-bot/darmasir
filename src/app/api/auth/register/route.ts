/* ============================================================
   POST /api/auth/register — ثبت‌نام با ایمیل/موبایل + رمز
   { name, phone?, email?, password, device? }
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, hashPassword, normalizeEmail, normalizePhone, publicUser } from "@/lib/auth-server";
import { MSG_BLOCKED } from "@/lib/admin-guard";
import { syncAppUser } from "@/lib/panel";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const password = String(body?.password ?? "");
  const device = String(body?.device ?? "web").slice(0, 40);

  if (name.length < 2) {
    return NextResponse.json({ error: "نام و نام خانوادگی را کامل وارد کنید" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "رمز عبور باید حداقل ۶ کاراکتر باشد" }, { status: 400 });
  }

  const phone = body?.phone ? normalizePhone(String(body.phone)) : null;
  const email = body?.email ? normalizeEmail(String(body.email)) : null;

  if (body?.phone && !phone) {
    return NextResponse.json({ error: "شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)" }, { status: 400 });
  }
  if (body?.email && !email) {
    return NextResponse.json({ error: "ایمیل معتبر نیست" }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json({ error: "شماره موبایل یا ایمیل را وارد کنید" }, { status: 400 });
  }

  try {
    // بررسی تکراری نبودن
    const dup = await db.user.findFirst({
      where: { OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] },
    });
    if (dup) {
      if (dup.status === "blocked") {
        return NextResponse.json({ error: MSG_BLOCKED }, { status: 403 });
      }
      const which = dup.phone && phone && dup.phone === phone ? "شماره موبایل" : "ایمیل";
      return NextResponse.json(
        { error: `این ${which} قبلاً ثبت شده است — وارد شوید` },
        { status: 409 }
      );
    }

    const user = await db.user.create({
      data: {
        name,
        phone,
        email,
        passwordHash: hashPassword(password),
        lastLoginAt: new Date(),
      },
    });

    const { token } = await createSession(user.id, device);
    syncAppUser({ phone: user.phone, email: user.email, name: user.name });
    return NextResponse.json({ token, user: publicUser(user) });
  } catch (e) {
    console.error("[auth/register]", e);
    return NextResponse.json({ error: "خطا در ثبت‌نام — دوباره تلاش کنید" }, { status: 500 });
  }
}
