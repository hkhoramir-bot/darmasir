/* ============================================================
   درمسیر — پنل مدیریت | ارسال ایمیل (SMTP اختیاری)
   — اطلاع تیکت جدید به مدیر + ارسال پاسخ تیکت به کاربر
   — اگر SMTP تنظیم نشده باشد، بدون خطا رد می‌شود (ارسال اختیاری)
   ============================================================ */
import nodemailer from "nodemailer";
import { q1 } from "./db";

export interface MailResult {
  sent: boolean;
  error?: string;
}

async function getSetting(key: string): Promise<string> {
  return String(((await q1("SELECT value FROM settings WHERE key = ?", [key])) as any)?.value ?? "").trim();
}

export async function smtpConfigured(): Promise<boolean> {
  return !!(await getSetting("smtp_host")) && !!(await getSetting("admin_email"));
}

async function transporter() {
  const host = await getSetting("smtp_host");
  const port = Number(await getSetting("smtp_port")) || 587;
  const user = await getSetting("smtp_user");
  const pass = await getSetting("smtp_pass");
  const from = (await getSetting("smtp_from")) || user || "درمسیر <no-reply@darmasir.local>";
  return {
    transport: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    }),
    from,
  };
}

/** ارسال ایمیل ساده — هرگز نمی‌ریزد؛ در خطا { sent: false } برمی‌گرداند */
export async function sendMail(to: string, subject: string, html: string): Promise<MailResult> {
  const toAddr = String(to || "").trim();
  if (!toAddr || !(await getSetting("smtp_host"))) return { sent: false, error: "SMTP تنظیم نشده" };
  try {
    const { transport, from } = await transporter();
    await transport.sendMail({ from, to: toAddr, subject, html });
    return { sent: true };
  } catch (e: any) {
    console.error("[mail] send failed:", e?.message ?? e);
    return { sent: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

/** قالب ساده ایمیل فارسی RTL */
export function mailTemplate(title: string, bodyHtml: string): string {
  return `<!doctype html><html dir="rtl" lang="fa"><body style="font-family:Tahoma,Vazirmatn,sans-serif;background:#f4f6f5;padding:24px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e8e5">
    <div style="background:#07805f;color:#fff;padding:16px 20px;font-size:16px;font-weight:bold">${title}</div>
    <div style="padding:20px;color:#1d2a25;font-size:14px;line-height:2">${bodyHtml}</div>
    <div style="padding:12px 20px;background:#f0f4f2;color:#6b7a73;font-size:11px;text-align:center">پیام خودکار سامانه درمسیر — ارسال‌شده از پنل مدیریت</div>
  </div></body></html>`;
}
