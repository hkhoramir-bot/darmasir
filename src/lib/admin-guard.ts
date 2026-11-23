/* ============================================================
   گارد کلید مدیریتی — محافظت از API های مدیریتی اپ درمسیر
   پنل مدیریت با هدر X-Admin-Key به این API ها دسترسی دارد.
   کلید پیش‌فرض برای توسعه: darmasir-admin-1404 (با ADMIN_API_KEY قابل تغییر)
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";

const ADMIN_KEY = process.env.ADMIN_API_KEY || "darmasir-admin-1404";

/** بررسی هدر X-Admin-Key — در صورت نامعتبر بودن پاسخ 401 برگردانده می‌شود */
export function requireAdminKey(req: NextRequest): NextResponse | null {
  const key = req.headers.get("x-admin-key") || "";
  if (key && key === ADMIN_KEY) return null;
  return NextResponse.json(
    { ok: false, error: { code: "UNAUTHORIZED", message: "کلید مدیریتی نامعتبر است" } },
    { status: 401 }
  );
}

export const MSG_BLOCKED = "حساب شما مسدود شده است — با پشتیبانی درمسیر تماس بگیرید";
