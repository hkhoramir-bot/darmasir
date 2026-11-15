/* ============================================================
   درمسیر — پنل مدیریت | احراز هویت (بدون وابستگی خارجی)
   ============================================================ */
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(pw, salt, 32);
  const ref = Buffer.from(hash, "hex");
  return test.length === ref.length && timingSafeEqual(test, ref);
}

export function newToken(): string {
  return randomBytes(24).toString("hex");
}

/* ---- محدودسازی تلاش ورود (Rate Limit) ---- */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function loginAllowed(ip: string): boolean {
  const a = attempts.get(ip);
  if (!a || a.resetAt < Date.now()) return true;
  return a.count < MAX_ATTEMPTS;
}

export function registerFailedLogin(ip: string) {
  const a = attempts.get(ip);
  if (!a || a.resetAt < Date.now()) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
    return;
  }
  a.count += 1;
}

export function clearLoginAttempts(ip: string) {
  attempts.delete(ip);
}
