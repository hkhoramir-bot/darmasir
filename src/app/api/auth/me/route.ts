/* ============================================================
   GET  /api/auth/me — اطلاعات کاربر از روی توکن نشست
   PATCH /api/auth/me — ذخیره نام و نام خانوادگی کاربر
   Header: Authorization: Bearer <token>
   Body (PATCH): { firstName, lastName }
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest, publicUser } from "@/lib/auth-server";
import { syncAppUser } from "@/lib/panel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "نشست نامعتبر یا منقضی است" }, { status: 401 });
    }
    return NextResponse.json({ user: publicUser(user) });
  } catch (e) {
    console.error("[auth/me]", e);
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}

/* ذخیره نام واقعی کاربر — جایگزین نام نمایشی خودکار («کاربر ۰۰۰۱») */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "نشست نامعتبر یا منقضی است" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    /* ارقام فارسی/عربی مشکلی ندارند — فقط فاصله‌های اضافی حذف می‌شود */
    const firstName = String(body?.firstName ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);
    const lastName = String(body?.lastName ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);

    if (firstName.length < 2) {
      return NextResponse.json({ error: "نام باید حداقل ۲ حرف باشد" }, { status: 400 });
    }
    if (lastName.length < 2) {
      return NextResponse.json({ error: "نام خانوادگی باید حداقل ۲ حرف باشد" }, { status: 400 });
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: { name: `${firstName} ${lastName}` },
    });

    /* همگام‌سازی نام واقعی با پنل مدیریت و ابر — fire-and-forget */
    syncAppUser({ phone: updated.phone, email: updated.email, name: updated.name });

    return NextResponse.json({ user: publicUser(updated) });
  } catch (e) {
    console.error("[auth/me PATCH]", e);
    return NextResponse.json({ error: "خطا در ذخیره نام — دوباره تلاش کنید" }, { status: 500 });
  }
}
