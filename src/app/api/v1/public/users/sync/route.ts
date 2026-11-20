/* ============================================================
   POST /api/v1/public/users/sync — همگام‌سازی کاربر اپ اندروید
   قراردادِ هم‌شکل ورکر ابری (همان مسیر، همان کلید) — اپ اندروید
   علاوه بر ورکر، سرور اپ را هم به‌عنوان مقصد همگام‌سازی استفاده
   می‌کند تا ثبت‌نام‌ها بدون واسطه در Turso (جدول User) بنشیند و
   پنل مدیریت بلافاصله ببیند.
   هدر لازم: X-Sync-Key
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeEmail, normalizePhone } from "@/lib/auth-server";
import { syncAppUser } from "@/lib/panel";

export const dynamic = "force-dynamic";

function checkKey(req: NextRequest): boolean {
  const key = req.headers.get("X-Sync-Key") || "";
  return !!key && key === (process.env.DARMASIR_SYNC_KEY || "darmasir-sync-1404");
}

export async function POST(req: NextRequest) {
  if (!checkKey(req)) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "کلید همگام‌سازی نامعتبر است" } },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const incoming: Record<string, unknown>[] = Array.isArray(body?.users)
    ? body.users
    : body?.user
      ? [body.user]
      : [];
  let synced = 0;
  try {
    for (const u of incoming.slice(0, 500)) {
      const rawId = String(u?.phone ?? "").trim().slice(0, 120);
      const name = String(u?.name ?? "").trim().slice(0, 80) || "کاربر درمسیر";
      if (!rawId) continue;
      const isEmail = rawId.includes("@");
      const phone = isEmail ? null : normalizePhone(rawId);
      const email = isEmail ? normalizeEmail(rawId) : null;
      if (isEmail && !email) continue;
      if (!isEmail && !phone) continue;

      const dup = await db.user.findFirst({
        where: phone ? { phone } : { email: email! },
      });
      if (dup) {
        /* رکورد موجود دست نمی‌خورد (وضعیت مسدودی/رمز حفظ می‌شود) — فقط آخرین ورود */
        await db.user.update({
          where: { id: dup.id },
          data: { lastLoginAt: new Date() },
        });
      } else {
        await db.user.create({
          data: {
            name,
            phone,
            email,
            status: "active",
            lastLoginAt: new Date(),
          },
        });
      }
      synced++;
    }
    /* آینه در پنل مدیریت (app_users) — fire-and-forget، هرگز مسیر اصلی را نمی‌شکند */
    if (synced > 0 && incoming[0]) {
      const first = incoming[0] as { phone?: string; email?: string; name?: string };
      syncAppUser({
        phone: (first.phone as string) || null,
        email: (first.email as string) || null,
        name: (first.name as string) || "کاربر درمسیر",
      });
    }
    return NextResponse.json({ ok: true, data: { synced } });
  } catch (e) {
    console.error("[v1/users/sync]", e);
    return NextResponse.json(
      { ok: false, error: { code: "DB_ERROR", message: "خطا در ثبت کاربر در دیتابیس" } },
      { status: 502 }
    );
  }
}
