export const dynamic = "force-dynamic";

// خروج مدیر — ابطال نشست در دیتابیس و پاک‌سازی کوکی
import { NextRequest, NextResponse } from "next/server";
import { handler } from "@/lib/api";
import {
  SESSION_COOKIE,
  destroySession,
  requireAdmin,
  tokenCookieOptions,
} from "@/lib/auth";
import type { AdminIdentity } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  return handler(async () => {
    // استخراج توکن از کوکی یا هدر Authorization: Bearer — همان الگوی requireAdmin
    const cookieHeader = req.headers.get("cookie") ?? "";
    const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9]+)`));
    let token = m?.[1];
    if (!token) {
      const auth = req.headers.get("authorization");
      if (auth?.startsWith("Bearer ")) token = auth.slice(7).trim() || undefined;
    }

    // شناسایی برای ثبت audit — بهترین تلاش؛ حتی با نشست نامعتبر هم خروج انجام می‌شود
    let admin: AdminIdentity | null = null;
    try {
      admin = await requireAdmin(req);
    } catch {
      admin = null;
    }

    if (token) await destroySession(token);
    await audit(req, admin, "LOGOUT", admin ? { detail: admin.username } : undefined);

    const res = NextResponse.json({ ok: true, data: {} });
    res.cookies.set(SESSION_COOKIE, "", { ...tokenCookieOptions(0), maxAge: 0 });
    return res;
  });
}
