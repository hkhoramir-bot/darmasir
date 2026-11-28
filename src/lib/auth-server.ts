/* ============================================================
   ابزارهای سمت سرور برای حساب کاربری درمسیر
   هش رمز (scrypt) + توکن نشست + نرمال‌سازی ایمیل/موبایل
   ============================================================ */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

/* ---------------- نرمال‌سازی شماره موبایل ---------------- */
/** ۰۹۱۲... / 98912... / +98912... / 912... → 0912... (۱۱ رقم) */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  // تبدیل ارقام فارسی/عربی به لاتین
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  let s = String(raw).trim();
  s = s.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)));
  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("98") && s.length >= 12) s = "0" + s.slice(2);
  if (/^9\d{9}$/.test(s)) s = "0" + s;
  if (/^09\d{9}$/.test(s)) return s;
  return null;
}

/** ارقام فارسی ایمیل → لاتین و حروف کوچک */
export function normalizeEmail(raw: string): string | null {
  if (!raw) return null;
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return null;
  return s;
}

/* ---------------- هش رمز عبور (scrypt) ---------------- */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const calc = scryptSync(password, salt, 64);
    const ref = Buffer.from(hash, "hex");
    return calc.length === ref.length && timingSafeEqual(calc, ref);
  } catch {
    return false;
  }
}

/* ---------------- نشست‌ها ---------------- */
const SESSION_DAYS = 30;

export function publicUser(u: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  };
}

/** ساخت نشست جدید و برگرداندن توکن */
export async function createSession(userId: string, device = "web"): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { token, userId, device, expiresAt } });
  // پاکسازی نشست‌های منقضی — هر چند وقت یک‌بار
  if (Math.random() < 0.1) {
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
  }
  return { token, expiresAt };
}

/** خواندن کاربر از هدر Authorization — بدون نشست معتبر null برمی‌گرداند */
export async function getUserFromRequest(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const session = await db.session.findUnique({ where: { token }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  await db.session
    .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
  return session.user;
}
