/* ============================================================
   اطلاعیه‌های واقعی اپ درمسیر — منبع حقیقت روی خود دستگاه (local-first)
   ۱) پاسخ پشتیبانی به تیکت‌ها — از مخزن محلی تیکت‌ها؛ بدون هیچ فچ سروری
   ۲) اطلاعیه مدیریت — تنظیم «اطلاعیه در اپ» پنل (app.notice)
   هیچ وضعیت خطی، هیچ آیتم ساختگی — بخش اطلاعیه‌ها فقط نوتیف واقعی نشان می‌دهد
   ============================================================ */

export interface LocalTicket {
  id: string | number;
  subject: string;
  message?: string;
  status?: string;
  reply?: string | null;
  repliedAt?: string | null;
  createdAt?: string;
  contact?: string;
}

/** کلید مخزن محلی تیکت‌ها — همان کلیدی که صفحه تماس می‌نویسد */
export const TICKETS_LS_KEY = "darmasir-my-tickets-v2";
/** زمان آخرین بازدید بخش اطلاعیه‌ها — مبنای نشان «جدید» */
export const NOTIF_SEEN_AT_KEY = "darmasir-notif-seen-at";
/** متن اطلاعیه مدیریتی که آخرین بار دیده شده — تغییر متن یعنی اطلاعیه جدید */
export const NOTICE_SEEN_KEY = "darmasir-notice-seen";
/** رویداد داخلی: اطلاعیه‌ها دیده شدند — نشان زنگ هدر بلافاصله پاک می‌شود */
export const NOTIF_SEEN_EVENT = "darmasir-notif-seen";

/** خواندن مخزن محلی تیکت‌ها — فقط خواندن؛ هیچ نوشتن و هیچ فچ */
export function readLocalTickets(): LocalTicket[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TICKETS_LS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter(
      (t) => t && typeof t === "object" && typeof t.subject === "string" && !!t.subject
    ) as LocalTicket[];
  } catch {
    /* JSON خراب یا دسترسی محدود — بی‌صدا */
    return [];
  }
}

/** زمان آخرین بازدید بخش اطلاعیه‌ها */
export function readNotifSeenAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(NOTIF_SEEN_AT_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** متن اطلاعیه مدیریتی که آخرین بار دیده شده */
export function readNoticeSeen(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NOTICE_SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/** زمان یک پاسخ تیکت — repliedAt یا فالبک createdAt */
export function replyTs(t: LocalTicket): number {
  const r = Date.parse(String(t.repliedAt ?? ""));
  if (Number.isFinite(r) && r > 0) return r;
  const c = Date.parse(String(t.createdAt ?? ""));
  return Number.isFinite(c) && c > 0 ? c : 0;
}

/** تیکت‌های پاسخ‌گرفته — ماده خام اطلاعیه‌های «پاسخ پشتیبانی» (تازه‌ترین اول) */
export function repliedTickets(): LocalTicket[] {
  return readLocalTickets()
    .filter((t) => !!(t.reply && String(t.reply).trim()))
    .sort((a, b) => replyTs(b) - replyTs(a));
}

/** آیا پاسخ این تیکت هنوز دیده نشده؟ */
export function isReplyUnseen(t: LocalTicket, seenAt: number): boolean {
  return replyTs(t) > seenAt;
}

/** آیا اطلاعیه مدیریتی هنوز دیده نشده؟ */
export function isNoticeUnseen(notice: string, seenNotice: string): boolean {
  return !!notice.trim() && notice !== seenNotice;
}

/** آیا هیچ اطلاعیه دیده‌نشده‌ای هست؟ — نشان روی زنگ اعلان هدر */
export function hasAnyUnseenNotifs(currentNotice?: string): boolean {
  const seenAt = readNotifSeenAt();
  if (repliedTickets().some((t) => replyTs(t) > seenAt)) return true;
  if (typeof currentNotice === "string" && currentNotice.trim()) {
    if (readNoticeSeen() !== currentNotice) return true;
  }
  return false;
}

/** ثبت «همه اطلاعیه‌ها دیده شد» — هنگام بازدید بخش اطلاعیه‌ها؛ نشان زنگ همان لحظه پاک می‌شود */
export function markAllNotifsSeen(notice?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTIF_SEEN_AT_KEY, String(Date.now()));
    if (notice !== undefined) {
      window.localStorage.setItem(NOTICE_SEEN_KEY, String(notice ?? ""));
    }
    window.dispatchEvent(new CustomEvent(NOTIF_SEEN_EVENT));
  } catch {
    /* حافظه در دسترس نیست — بی‌صدا */
  }
}
