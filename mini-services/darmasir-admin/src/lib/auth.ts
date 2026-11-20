// احراز هویت پنل — bcrypt + نشست کوکی‌محور
// توکن خام فقط در کوکی/پاسخ می‌آید؛ در دیتابیس sha256 آن ذخیره می‌شود.

import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { ApiError } from "./api";
import type { Role } from "./roles";

export const SESSION_COOKIE = "darmasir_admin_session";
const SESSION_TTL_DAYS = 7;

export type AdminIdentity = {
  id: string;
  username: string;
  name: string;
  role: Role;
};

// ------------------------- رمزها -------------------------

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

// ------------------------- نشست‌ها -------------------------

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function createSession(
  adminId: string,
  ip?: string,
  userAgent?: string
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      adminId,
      ip: ip ?? null,
      userAgent: userAgent?.slice(0, 300) ?? null,
      expiresAt,
    },
  });
  // پاک‌سازی نشست‌های منقضی — بهترین تلاش
  db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function tokenCookieOptions(maxAgeDays = SESSION_TTL_DAYS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false, // پشت Caddy/HTTPS نهایی — در تولید با secure: true مستقر می‌شود
    path: "/",
    maxAge: maxAgeDays * 24 * 60 * 60,
  };
}

// ------------------------- شناسایی درخواست -------------------------

/** استخراج توکن از کوکی یا هدر Authorization: Bearer (برای سازگاری با Worker ابری) */
function extractToken(req: Request): string | undefined {
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const m = cookieHeader.match(
      new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9]+)`)
    );
    if (m) return m[1];
  }
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || undefined;
  return undefined;
}

/** آدرس IP درخواست — پشت پراکسی از هدر استاندارد می‌خواند */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * احراز هویت کامل درخواست — کوکی/توکن معتبر + مدیر فعال.
 * در صورت ناموفق بودن ApiError 401 می‌دهد.
 */
export async function requireAdmin(req: Request): Promise<AdminIdentity> {
  const token = extractToken(req);
  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "برای این عملیات باید وارد شوید.");
  }

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { admin: true },
  });

  if (!session || session.expiresAt < new Date()) {
    throw new ApiError(401, "UNAUTHORIZED", "نشست شما منقضی شده است. دوباره وارد شوید.");
  }
  if (!session.admin.active) {
    throw new ApiError(403, "FORBIDDEN", "حساب شما غیرفعال شده است.");
  }

  return {
    id: session.admin.id,
    username: session.admin.username,
    name: session.admin.name,
    role: session.admin.role as Role,
  };
}

/** احراز هویت + بررسی مجوز اکشن (READ/CREATE/UPDATE/DELETE/ADMIN) */
export async function requirePermission(
  req: Request,
  action: string
): Promise<AdminIdentity> {
  const admin = await requireAdmin(req);
  const { can } = await import("./roles");
  if (!can(admin.role, action)) {
    throw new ApiError(403, "FORBIDDEN", "نقش شما اجازه این عملیات را ندارد.");
  }
  return admin;
}

// ------------------------- کوکی سمت سرور (Server Actions/Layout) -------------------------

/** خواندن نشست از کوکی در محیط سرور (برای layout صفحات) */
export async function getServerAdmin(): Promise<AdminIdentity | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { admin: true },
  });
  if (!session || session.expiresAt < new Date() || !session.admin.active) {
    return null;
  }
  return {
    id: session.admin.id,
    username: session.admin.username,
    name: session.admin.name,
    role: session.admin.role as Role,
  };
}
