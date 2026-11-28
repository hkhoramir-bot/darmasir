/* ============================================================
   ارسال ایمیل کد یک‌بارمصرف — از طریق پنل مدیریت درمسیر
   تنظیمات SMTP تنها یک‌جا در پنل مدیریت (بخش تنظیمات) انجام
   می‌شود و سرویس اپ با فراخوانی API پنل کد را ایمیل می‌کند.
   اگر SMTP در پنل تنظیم نشده باشد، بدون خطا وضعیت «no_smtp»
   ثبت می‌شود تا مدیر در پنل ببیند.
   متغیرهای محیطی (اختیاری):
     PANEL_API_URL  → پیش‌فرض http://localhost:3035
     ADMIN_API_KEY  → کلید مشترک سرویس-به-سرویس (پیش‌فرض توسعه)
   ============================================================ */

const PANEL_URL = (process.env.PANEL_API_URL || "http://localhost:3035").replace(/\/+$/, "");
const SHARED_KEY = process.env.ADMIN_API_KEY || "darmasir-admin-1404";

export interface OtpEmailResult {
  sent: boolean;
  /** no_smtp = SMTP پنل تنظیم نشده | failed = خطای ارسال */
  status: "sent" | "failed" | "no_smtp";
  error?: string;
}

/** ایمیل‌کردن کد بازیابی/ورود به کاربر — هرگز نمی‌ریزد */
export async function sendOtpEmail(p: {
  to: string;
  code: string;
  name?: string;
  phone?: string;
  kind?: "login" | "password_reset";
}): Promise<OtpEmailResult> {
  const to = String(p.to || "").trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { sent: false, status: "failed", error: "ایمیل نامعتبر است" };
  }
  try {
    const res = await fetch(`${PANEL_URL}/api/v1/mail/otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": SHARED_KEY },
      body: JSON.stringify({
        to,
        code: p.code,
        name: p.name,
        phone: p.phone,
        kind: p.kind ?? "password_reset",
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: { sent?: boolean; smtp_configured?: boolean; error?: string }; error?: { message?: string } }
      | null;
    if (!res.ok || !j?.ok) {
      return { sent: false, status: "failed", error: j?.error?.message ?? `panel-http-${res.status}` };
    }
    const d = j.data ?? {};
    if (d.sent) return { sent: true, status: "sent" };
    return {
      sent: false,
      status: d.smtp_configured === false ? "no_smtp" : "failed",
      error: d.error ?? "ارسال ایمیل ناموفق بود",
    };
  } catch (e) {
    console.error("[email] خطای ارتباط با سرویس ایمیل پنل:", e);
    return { sent: false, status: "failed", error: "panel-unreachable" };
  }
}
