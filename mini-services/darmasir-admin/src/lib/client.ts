// کلاینت API پنل — fetch با basePath/احراز هویت یکدست

"use client";

import { gw } from "./path";

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const TOKEN_KEY = "darmasir_admin_token";

/** توکن را نگه می‌داریم تا در حالت ابری (کوکی بین‌دامنه‌ای نداریم) هم کار کند */
export function storeToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export async function apiFetch<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  // پشتیبانی از حالت ابری — توکن در هدر
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) headers.set("authorization", `Bearer ${t}`);
  } catch {}

  const res = await fetch(gw(path), {
    ...opts,
    headers,
    credentials: "include",
  });

  let json: ApiEnvelope<T> | null = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiClientError("BAD_RESPONSE", "پاسخ سرور قابل خواندن نبود.", res.status);
  }

  if (!res.ok || !json || !json.ok) {
    const err = json && !json.ok ? json.error : null;
    if (res.status === 401 && typeof window !== "undefined") {
      // نشست منقضی — به صفحه ورود
      window.location.href = gw("/login");
    }
    throw new ApiClientError(
      err?.code ?? "UNKNOWN",
      err?.message ?? "خطای ناشناخته رخ داد.",
      res.status
    );
  }

  return json.data;
}
