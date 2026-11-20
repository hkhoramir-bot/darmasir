/* ============================================================
   ارسال پیامک کد ورود — پشتیبانی از سرویس‌دهنده ایرانی
   اگر SMS_API_KEY تنظیم نشده باشد، کد در پاسخ API برگردانده
   می‌شود (حالت توسعه) تا ورود قابل تست باشد.
   برای راه‌اندازی واقعی فقط متغیرهای محیطی را تنظیم کنید:
     SMS_API_URL  → مثلا https://api.kavenegar.com/v1/{KEY}/sms/send.json
     SMS_API_KEY  → کلید سرویس پیامک
     SMS_SENDER   → شماره خط (اختیاری)
   ============================================================ */

import { normalizePhone } from "@/lib/auth-server";

const SMS_API_URL = process.env.SMS_API_URL ?? "";
const SMS_API_KEY = process.env.SMS_API_KEY ?? "";
const SMS_SENDER = process.env.SMS_SENDER ?? "";

export function smsProviderConfigured(): boolean {
  return Boolean(SMS_API_URL && SMS_API_KEY);
}

/** ارسال کد ورود با پیامک — در حالت توسعه فقط لاگ می‌شود */
export async function sendOtpSms(phone: string, code: string): Promise<{ delivered: boolean; error?: string }> {
  const norm = normalizePhone(phone);
  if (!norm) return { delivered: false, error: "شماره نامعتبر است" };

  const text = `درمسیر\nکد ورود شما: ${code}\nاعتبار: ۳ دقیقه`;

  if (!smsProviderConfigured()) {
    console.log(`[SMS-DEV] کد ورود ${norm}: ${code}`);
    return { delivered: false, error: "sms-dev-mode" };
  }

  try {
    const url = new URL(SMS_API_URL);
    // سبک کاوه‌نگار: receptor + message به‌صورت query — سایر سرویس‌ها هم معمولاً سازگارند
    url.searchParams.set("receptor", norm);
    if (SMS_SENDER) url.searchParams.set("sender", SMS_SENDER);
    url.searchParams.set("message", text);

    const res = await fetch(url.href, {
      method: "GET",
      headers: { Authorization: `Bearer ${SMS_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[SMS] پاسخ غیرموفق سرویس پیامک:", res.status);
      return { delivered: false, error: `sms-http-${res.status}` };
    }
    return { delivered: true };
  } catch (e) {
    console.error("[SMS] خطای ارسال پیامک:", e);
    return { delivered: false, error: "sms-network" };
  }
}
