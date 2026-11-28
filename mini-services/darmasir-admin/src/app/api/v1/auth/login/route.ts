export const dynamic = "force-dynamic";

// ورود مدیر — نشست کوکی‌محور با محدودسازی نرخ تلاش
import { NextRequest, NextResponse } from "next/server";
import { ApiError, handler, str } from "@/lib/api";
import {
  SESSION_COOKIE,
  clientIp,
  createSession,
  tokenCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import type { AdminIdentity } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { Role } from "@/lib/roles";

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
    return j as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "بدنه درخواست معتبر نیست.");
  }
}

/** رشته الزامی — str با تضمین مقدار (در حالت الزامی همیشه مقدار می‌دهد یا ApiError می‌اندازد) */
function reqStr(v: unknown, field: string, o: { min?: number; max?: number } = {}): string {
  const s = str(v, field, { ...o, optional: false });
  return s as string;
}

export async function POST(req: NextRequest) {
  return handler(async () => {
    rateLimit(`login:${clientIp(req)}`, 10, 5 * 60 * 1000);

    const v = await parseBody(req);
    const username = reqStr(v.username, "نام کاربری", { min: 3, max: 40 });
    const password = reqStr(v.password, "گذرواژه", { min: 4, max: 100 });

    const admin = await db.adminUser.findUnique({ where: { username } });
    // پیام یکسان برای همه حالت‌ها تا وجود حساب قابل حدس نباشد
    if (!admin || !admin.active || !verifyPassword(password, admin.passwordHash)) {
      await audit(req, null, "LOGIN_FAILED", { detail: username });
      throw new ApiError(401, "BAD_CREDENTIALS", "نام کاربری یا گذرواژه اشتباه است.");
    }

    const token = await createSession(
      admin.id,
      clientIp(req),
      req.headers.get("user-agent") ?? undefined
    );
    const identity: AdminIdentity = {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role as Role,
    };
    await audit(req, identity, "LOGIN", { detail: admin.username });

    const res = NextResponse.json({
      ok: true,
      data: {
        token,
        admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role },
      },
    });
    res.cookies.set(SESSION_COOKIE, token, tokenCookieOptions());
    return res;
  });
}
