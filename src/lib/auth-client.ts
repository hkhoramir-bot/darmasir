"use client";

/* ============================================================
   وضعیت حساب کاربری سمت کلاینت — زوستاند
   توکن در localStorage نگه‌داری می‌شود و با هر شروع برنامه
   از طریق /api/auth/me اعتبارسنجی می‌شود.
   وضعیت‌ها: loading → guest (صفحه ورود) | authed | locked (اثر انگشت)
   ============================================================ */

import { create } from "zustand";

/* ---------------------------- انواع ---------------------------- */
export type AuthUser = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

export type AuthStatus = "loading" | "guest" | "authed" | "locked";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  hydrate: () => Promise<void>;
  setSession: (token: string, user: AuthUser) => void;
  unlock: () => void;
  logout: () => Promise<void>;
}

/* ------------------------ کلیدهای حافظه ------------------------ */
export const LS_TOKEN = "metrojo-auth-token";
export const LS_USER = "metrojo-auth-user";
export const LS_BIO = "metrojo-biometric"; // «true» = ورود با اثر انگشت فعال

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {}
}
function lsDel(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/* ------------------------- اثر انگشت ------------------------- */
export function isBiometricEnabled(): boolean {
  return lsGet(LS_BIO) === "true";
}

export function setBiometricEnabled(v: boolean): void {
  lsSet(LS_BIO, v ? "true" : "false");
}

/* --------------------------- استور --------------------------- */
export const useAuth = create<AuthState>((set) => ({
  status: "loading",
  user: null,

  hydrate: async () => {
    const token = lsGet(LS_TOKEN);
    if (!token) {
      set({ status: "guest", user: null });
      return;
    }
    // کاربر ذخیره‌شده به‌عنوان جایگزین آفلاین
    let cached: AuthUser | null = null;
    try {
      const raw = lsGet(LS_USER);
      cached = raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      cached = null;
    }

    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { user: AuthUser };
        lsSet(LS_USER, JSON.stringify(data.user));
        set({ status: isBiometricEnabled() ? "locked" : "authed", user: data.user });
      } else if (res.status === 401 || res.status === 403) {
        // نشست منقضی — پاکسازی و رفتن به صفحه ورود
        lsDel(LS_TOKEN);
        lsDel(LS_USER);
        set({ status: "guest", user: null });
      } else {
        // خطای سرور — با کاربر ذخیره‌شده ادامه می‌دهیم (تحمل خطا)
        set({ status: isBiometricEnabled() && cached ? "locked" : cached ? "authed" : "guest", user: cached });
      }
    } catch {
      // شبکه در دسترس نیست (مثلاً حالت آفلاین) — کاربر ذخیره‌شده معتبر است
      set({ status: isBiometricEnabled() && cached ? "locked" : cached ? "authed" : "guest", user: cached });
    }
  },

  setSession: (token, user) => {
    lsSet(LS_TOKEN, token);
    lsSet(LS_USER, JSON.stringify(user));
    set({ status: "authed", user });
  },

  unlock: () => set((s) => (s.user ? { status: "authed" } : { status: "guest" })),

  logout: async () => {
    const token = lsGet(LS_TOKEN);
    lsDel(LS_TOKEN);
    lsDel(LS_USER);
    set({ status: "guest", user: null });
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
  },
}));

/* ------------------- فراخوانی‌های API ورود ------------------- */
type AuthApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function postJson<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<AuthApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(headers ?? {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: String((data as { error?: string }).error ?? "خطا در انجام عملیات") };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "اتصال به سرور برقرار نشد — اینترنت را بررسی کنید" };
  }
}

export const authApi = {
  register: (p: { name: string; phone?: string; email?: string; password: string }) =>
    postJson<{ token: string; user: AuthUser }>("/api/auth/register", { ...p, device: detectDevice() }),

  login: (p: { identifier: string; password: string }) =>
    postJson<{ token: string; user: AuthUser }>("/api/auth/login", { ...p, device: detectDevice() }),

  otpRequest: (p: { phone: string }) =>
    postJson<{ ok: boolean; delivered: boolean; expiresInSeconds: number; devCode?: string }>(
      "/api/auth/otp/request",
      p
    ),

  otpVerify: (p: { phone: string; code: string }) =>
    postJson<{ token: string; user: AuthUser; isNew: boolean }>("/api/auth/otp/verify", {
      ...p,
      device: detectDevice(),
    }),

  /** برای قفل اثر انگشت — تأیید رمز به‌عنوان روش جایگزین */
  loginWithToken: (token: string) =>
    postJson<{ user: AuthUser }>("/api/auth/me", {}, { Authorization: `Bearer ${token}` }),
};

function detectDevice(): string {
  try {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    return w.Capacitor?.isNativePlatform?.() ? "android" : "web";
  } catch {
    return "web";
  }
}
