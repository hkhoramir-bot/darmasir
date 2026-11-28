/* ============================================================
   POST /api/admin/users/action — عملیات مدیریتی روی کاربر اپ
   هدر لازم: X-Admin-Key
   بدنه: { action: "block" | "unblock" | "password" | "delete", phone?/id?, password? }
   - block:   مسدودسازی کاربر + ابطال همه نشست‌های او
   - unblock: رفع مسدودی
   - password: تنظیم/تغییر رمز عبور کاربر توسط مدیر
   - delete:   حذف واقعی کاربر از دیتابیس (کاربر + نشست‌ها + کدهای پیامکی) — برگشت‌ناپذیر
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminKey, MSG_BLOCKED } from "@/lib/admin-guard";
import { hashPassword, normalizeEmail, normalizePhone } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "").trim();
  const identifier = String(body?.phone ?? "").trim();
  const rawId = String(body?.id ?? "").trim();

  if (!["block", "unblock", "password", "delete"].includes(action)) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_INPUT", message: "عملیات نامعتبر است" } },
      { status: 400 }
    );
  }
  // حذف می‌تواند مستقیم با شناسه کاربر هم انجام شود؛ بقیه عملیات به شماره/ایمیل نیاز دارند
  if (action !== "delete" && !identifier) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_INPUT", message: "شماره موبایل یا ایمیل کاربر الزامی است" } },
      { status: 400 }
    );
  }

  // شناسایی کاربر: شناسه مستقیم (فقط حذف) یا شماره موبایل یا ایمیل
  let phone: string | null = null;
  let email: string | null = null;
  if (action === "delete" && rawId && !identifier) {
    try {
      const byId = await db.user.findUnique({ where: { id: rawId } });
      if (!byId) {
        return NextResponse.json(
          { ok: false, error: { code: "NOT_FOUND", message: "کاربری با این شناسه در اپ پیدا نشد" } },
          { status: 404 }
        );
      }
      // حذف واقعی از دیتابیس — نشست‌ها با CASCADE حذف می‌شوند؛ کدهای پیامکی با شماره
      const deletedSessions = await db.session.deleteMany({ where: { userId: byId.id } });
      let deletedOtps = 0;
      if (byId.phone) {
        const r = await db.otpCode.deleteMany({ where: { phone: byId.phone } });
        deletedOtps = r.count;
      }
      await db.user.delete({ where: { id: byId.id } });
      return NextResponse.json({
        ok: true,
        data: {
          id: byId.id,
          phone: byId.phone,
          email: byId.email,
          name: byId.name,
          deleted: true,
          sessions_revoked: deletedSessions.count,
          otps_removed: deletedOtps,
        },
      });
    } catch (e) {
      console.error("[admin/users/action:delete]", e);
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "خطا در حذف کاربر از دیتابیس" } },
        { status: 500 }
      );
    }
  }
  if (identifier.includes("@")) {
    email = normalizeEmail(identifier);
    if (!email) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: "ایمیل معتبر نیست" } },
        { status: 400 }
      );
    }
  } else {
    phone = normalizePhone(identifier);
    if (!phone) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: "شماره موبایل معتبر نیست" } },
        { status: 400 }
      );
    }
  }

  try {
    const user = await db.user.findFirst({
      where: { OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] },
    });
    if (!user) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "کاربری با این مشخصات در اپ پیدا نشد" } },
        { status: 404 }
      );
    }

    if (action === "delete") {
      const deletedSessions = await db.session.deleteMany({ where: { userId: user.id } });
      let deletedOtps = 0;
      if (user.phone) {
        const r = await db.otpCode.deleteMany({ where: { phone: user.phone } });
        deletedOtps = r.count;
      }
      await db.user.delete({ where: { id: user.id } });
      return NextResponse.json({
        ok: true,
        data: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          name: user.name,
          deleted: true,
          sessions_revoked: deletedSessions.count,
          otps_removed: deletedOtps,
        },
      });
    }

    if (action === "block" || action === "unblock") {
      const status = action === "block" ? "blocked" : "active";
      await db.user.update({ where: { id: user.id }, data: { status } });
      if (status === "blocked") {
        // ابطال همه نشست‌های فعال کاربر مسدودشده — خروج اجباری فوری
        await db.session.deleteMany({ where: { userId: user.id } });
      }
      return NextResponse.json({
        ok: true,
        data: { id: user.id, phone: user.phone, email: user.email, status },
        message: status === "blocked" ? MSG_BLOCKED : undefined,
      });
    }

    // action === "password"
    const password = String(body?.password ?? "");
    if (password.length < 6) {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_INPUT", message: "رمز عبور باید حداقل ۶ کاراکتر باشد" } },
        { status: 400 }
      );
    }
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password) },
    });
    return NextResponse.json({
      ok: true,
      data: { id: user.id, phone: user.phone, email: user.email, has_password: true },
    });
  } catch (e) {
    console.error("[admin/users/action]", e);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "خطا در انجام عملیات" } },
      { status: 500 }
    );
  }
}
