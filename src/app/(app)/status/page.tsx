"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { MI, PageHeader, useInitCity } from "@/components/metro/shell";
import { usePanelNotice } from "@/components/metro/panel-banners";
import { toFa } from "@/lib/metro-data";
import {
  isNoticeUnseen,
  isReplyUnseen,
  markAllNotifsSeen,
  readNotifSeenAt,
  readNoticeSeen,
  repliedTickets,
  replyTs,
  type LocalTicket,
} from "@/lib/notifs";

/* ============================================================
   اطلاعیه‌ها — درمسیر (فقط نوتیف‌های واقعی؛ بدون وضعیت خط)
   تنها دو نوع اطلاعیه واقعی این اپ اینجا نمایش داده می‌شود:
   ۱) اطلاعیه مدیریت — تنظیم «اطلاعیه در اپ» پنل مدیریت (app.notice)
   ۲) پاسخ پشتیبانی به تیکت‌ها — از مخزن محلی خود اپ؛ بدون هیچ فچ سروری
   ============================================================ */

const subscribeNoop = () => () => {};
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** زمان نسبی فارسی برای اطلاعیه‌ها */
function relTimeFa(ts: number, nowMs: number): string {
  if (!ts || !nowMs) return "";
  const diff = Math.max(0, nowMs - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "همین حالا";
  if (min < 60) return `${toFa(min)} دقیقه پیش`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${toFa(h)} ساعت پیش`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${toFa(d)} روز پیش`;
  try {
    return new Date(ts).toLocaleDateString("fa-IR");
  } catch {
    return "";
  }
}

export default function StatusPage() {
  const router = useRouter();
  useInitCity();

  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  /* ---------- اطلاعیه مدیریت — از پنل (کش مشترک؛ بدون polling مستقل) ---------- */
  const { notice, loaded: noticeLoaded } = usePanelNotice();

  /* ---------- پاسخ‌های پشتیبانی — فقط از مخزن محلی خود اپ؛ صفر فچ ---------- */
  const [replies, setReplies] = useState<LocalTicket[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const [seenNotice, setSeenNotice] = useState("");
  useIsoLayoutEffect(() => {
    setReplies(repliedTickets());
    setSeenAt(readNotifSeenAt());
    setSeenNotice(readNoticeSeen());
  }, []);

  /* ---------- دیدن اطلاعیه‌ها — پس از آماده شدن محتوا ثبت می‌شود؛
     نشان‌های «جدید» همین بازدید با snapshot قبلی رندر شده‌اند و بازدید بعدی پاک هستند ---------- */
  const seenMarkedRef = useRef(false);
  useEffect(() => {
    if (!mounted || !noticeLoaded || seenMarkedRef.current) return;
    seenMarkedRef.current = true;
    markAllNotifsSeen(notice);
  }, [mounted, noticeLoaded, notice]);

  const nowMs = mounted ? Date.now() : 0;
  const noticeUnseen = isNoticeUnseen(notice, seenNotice);
  const hasAny = !!notice || replies.length > 0;
  /* خالی فقط وقتی نشان داده می‌شود که مطمئنیم اطلاعیه‌ای نیست (پاسخ محلی + اطلاعیه پنل هر دو بررسی شد) */
  const ready = mounted && noticeLoaded;

  return (
    <>
      <PageHeader
        title="اطلاعیه‌ها"
        subtitle="اطلاعیه‌های مدیریت و پاسخ‌های پشتیبانی"
      />

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-3 pb-28 space-y-4">
        {/* ---------------- حالت خالی — فقط وقتی واقعاً اطلاعیه‌ای نیست ---------------- */}
        {ready && !hasAny && (
          <article className="bg-surface-container-lowest border border-outline-variant/40 rounded-2xl p-6 shadow-sm text-center space-y-2.5">
            <div className="w-12 h-12 mx-auto rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
              <MI name="notifications_none" size={24} />
            </div>
            <h2 className="text-title-md font-bold text-on-surface">فعلاً اطلاعیه‌ای ندارید</h2>
            <p className="text-body-sm text-on-surface-variant leading-6">
              اطلاعیه‌های مدیریت و پاسخ‌های پشتیبانی به تیکت‌هایتان همین‌جا نمایش داده می‌شود.
            </p>
            <button
              type="button"
              onClick={() => router.push("/contact")}
              className="mt-1 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-on-primary text-label-md font-semibold active:scale-95 transition-all shadow-sm"
            >
              <MI name="support_agent" size={16} />
              ارسال تیکت به پشتیبانی
            </button>
          </article>
        )}

        {/* ---------------- ۱. اطلاعیه مدیریت — تنها محتوای سروری این بخش ---------------- */}
        {notice && (
          <article className="bg-surface-container-lowest border border-primary/25 rounded-2xl p-4 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <MI name="campaign" size={20} />
                </span>
                <h2 className="text-title-md font-bold text-on-surface truncate">اطلاعیه مدیریت</h2>
              </div>
              {noticeUnseen && (
                <span className="text-[10px] font-bold text-on-primary bg-secondary px-2 py-0.5 rounded-full shrink-0">
                  جدید
                </span>
              )}
            </div>
            <p className="text-body-md text-on-surface leading-relaxed whitespace-pre-line">
              {notice}
            </p>
            <p className="text-label-sm text-on-surface-variant flex items-center gap-1">
              <MI name="verified" size={14} className="text-primary" />
              مدیریت درمسیر
            </p>
          </article>
        )}

        {/* ---------------- ۲. پاسخ‌های پشتیبانی — از مخزن محلی خود اپ ---------------- */}
        {replies.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-title-md font-bold text-on-surface flex items-center gap-1.5">
                <MI name="support_agent" size={18} className="text-primary" />
                پاسخ‌های پشتیبانی
              </h2>
              <span className="text-label-sm text-on-surface-variant">
                {toFa(replies.length)} مورد
              </span>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 divide-y divide-outline-variant/20 shadow-sm overflow-hidden">
              {replies.map((t, i) => {
                const unseen = isReplyUnseen(t, seenAt);
                const ts = replyTs(t);
                return (
                  <button
                    key={`${String(t.id)}-${i}`}
                    type="button"
                    onClick={() => router.push("/contact")}
                    className="w-full p-3.5 flex items-start gap-3 text-right hover:bg-surface-container-low active:bg-surface-container transition-colors"
                  >
                    <span className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                      <MI name="mail" size={18} />
                    </span>
                    <span className="flex-1 min-w-0 space-y-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-body-md font-bold text-on-surface truncate">
                          پاسخ به «{t.subject}»
                        </span>
                        {unseen && (
                          <span className="text-[9px] font-bold text-on-primary bg-secondary px-1.5 py-0.5 rounded-full shrink-0">
                            جدید
                          </span>
                        )}
                      </span>
                      <span className="block text-body-sm text-on-surface-variant leading-5 line-clamp-2">
                        {String(t.reply).trim()}
                      </span>
                    </span>
                    <span className="text-label-sm text-on-surface-variant shrink-0 pt-1">
                      {relTimeFa(ts, nowMs)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
