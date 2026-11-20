"use client";

import { useCallback, useEffect, useState } from "react";
import { MI, PageHeader } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";
import { useContactPage, type ContactMethod } from "@/components/metro/panel-banners";
import { useAuth } from "@/lib/auth-client";
import { toFa } from "@/lib/metro-data";

/* ============================================================
   تماس با ما — همه بخش‌ها از پنل مدیریت (تک منبع حقیقت)
   — راه‌های ارتباطی: افزودن/حذف/نمایش هر مورد در پنل
   — فرم ثبت تیکت: نمایش/عدم نمایش و متن‌ها در پنل
   — تیکت‌های من: پاسخ مدیر در پنل، بلافاصله همین‌جا نمایش داده می‌شود
   ============================================================ */

type Category = "general" | "bug" | "idea" | "ad";

const CATEGORY_OPTIONS: { id: Category; label: string; icon: string }[] = [
  { id: "general", label: "پرسش عمومی", icon: "help_outline" },
  { id: "bug", label: "گزارش خطا", icon: "bug_report" },
  { id: "idea", label: "پیشنهاد", icon: "lightbulb" },
  { id: "ad", label: "تبلیغات", icon: "campaign" },
];

const CATEGORY_FA: Record<string, string> = {
  general: "پرسش عمومی",
  bug: "گزارش خطا",
  idea: "پیشنهاد",
  ad: "تبلیغات",
};

interface MyTicket {
  id: number;
  subject: string;
  category: string;
  message: string;
  status: string;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

const STATUS_FA: Record<string, { label: string; cls: string }> = {
  open: { label: "در انتظار بررسی", cls: "bg-secondary/15 text-secondary" },
  answered: { label: "پاسخ داده شد", cls: "bg-primary/10 text-primary" },
  closed: { label: "بسته شده", cls: "bg-surface-container text-on-surface-variant" },
};

export default function ContactPage() {
  const { toast } = useToast();
  const contact = useContactPage();
  const user = useAuth((s) => s.user);

  /* ---------- فرم ثبت تیکت ---------- */
  const [form, setForm] = useState({
    name: "",
    contact: "",
    category: "general" as Category,
    subject: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  /* ---------- تیکت‌های من ---------- */
  const [myTickets, setMyTickets] = useState<MyTicket[]>([]);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  /* راه تماس برای مرور پاسخ‌ها: ایمیل/شماره کاربر واردشده یا راه تماس تایپ‌شده در فرم */
  const lookupContact = user?.email || user?.phone || form.contact.trim();
  const contactValueOf = (c: string) => c.trim();

  const loadReplies = useCallback(async (who: string) => {
    if (!who) return;
    try {
      const res = await fetch(`/api/tickets/replies?contact=${encodeURIComponent(who)}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMyTickets(Array.isArray(data.tickets) ? data.tickets : []);
        setRepliesLoaded(true);
      }
    } catch {
      /* قطعی شبکه — بی‌صدا */
    }
  }, []);

  useEffect(() => {
    loadReplies(lookupContact);
    const timer = setInterval(() => loadReplies(lookupContact), 20_000);
    return () => clearInterval(timer);
  }, [user?.email, user?.phone]);

  const submitTicket = async () => {
    if (sending) return;
    setSending(true);
    const typedContact = contactValueOf(form.contact);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setDone(true);
        setForm({ name: "", contact: "", category: "general", subject: "", message: "" });
        toast({
          title: "تیکت ثبت شد",
          description: "پاسخ در بخش «تیکت‌های من» همین صفحه اعلام می‌شود",
        });
        /* تیکت جدید ممکن است با راه تماس تایپ‌شده (نه ایمیل/شماره حساب) ثبت شده باشد */
        loadReplies(user?.email || user?.phone || typedContact || lookupContact);
        if (typedContact && typedContact !== (user?.email || user?.phone || "")) {
          loadReplies(typedContact);
        }
      } else {
        toast({
          title: "ثبت تیکت ناموفق بود",
          description: data.error ?? "لطفاً اطلاعات را بررسی و دوباره تلاش کنید",
        });
      }
    } catch {
      toast({
        title: "خطای شبکه",
        description: "اتصال اینترنت را بررسی و دوباره تلاش کنید",
      });
    } finally {
      setSending(false);
    }
  };

  const inputCls =
    "w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

  /* ---------- رفتار هر راه ارتباطی بر اساس نوع ---------- */
  const methodChevron = (t: ContactMethod["type"]) => (t === "url" ? "open_in_new" : "chevron_left");

  const openMethod = (m: (typeof contact.methods)[number]) => {
    if (m.type === "tel") {
      window.location.href = `tel:${m.link.replace(/[^\d+]/g, "")}`;
    } else if (m.type === "url") {
      window.open(m.link, "_blank", "noreferrer");
    } else if (m.type === "mailto") {
      window.location.href = `mailto:${m.link}?subject=${encodeURIComponent("تماس از اپ درمسیر")}`;
    } else {
      toast({
        title: "به‌زودی",
        description: `${m.title} به‌زودی به درمسیر اضافه می‌شود`,
      });
    }
  };

  return (
    <>
      <PageHeader title={contact.title} subtitle={contact.subtitle} />

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-28 space-y-4">
        {/* ------------------- راه‌های تماس (مدیریت‌شده در پنل) ------------------- */}
        {contact.methods.some((m) => m.enabled) && (
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm space-y-1">
            <div className="flex items-center gap-2 pb-2 mb-1 border-b border-outline-variant/20 text-primary">
              <MI name="call" size={20} />
              <h2 className="text-sm font-bold text-on-surface">{contact.methodsTitle}</h2>
            </div>

            {contact.methods
              .filter((m) => m.enabled)
              .map((m) => {
                const clickable = m.type !== "toast";
                const content = (
                  <>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                        <MI name={m.icon} size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-on-surface">{m.title}</p>
                        {m.value && (
                          <p dir="ltr" className="text-body-sm text-on-surface-variant text-right truncate">
                            {m.value}
                          </p>
                        )}
                      </div>
                    </div>
                    <MI
                      name={methodChevron(m.type)}
                      size={18}
                      className={`${m.type === "url" ? "text-on-surface-variant" : "text-primary"} shrink-0`}
                    />
                  </>
                );
                return clickable ? (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => openMethod(m)}
                    className="w-full flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-surface-container-low active:scale-[0.99] transition-all gap-3 text-right"
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-surface-container-low transition-all gap-3"
                  >
                    {content}
                  </div>
                );
              })}
          </section>
        )}

        {/* ------------------- تیکت‌های من و پاسخ‌های مدیر ------------------- */}
        {repliesLoaded && myTickets.length > 0 && (
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm space-y-2">
            <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20 text-primary">
              <MI name="forum" size={20} />
              <h2 className="text-sm font-bold text-on-surface">تیکت‌های من و پاسخ‌ها</h2>
              <span className="text-[10px] text-on-surface-variant mr-auto">{toFa(myTickets.length)} تیکت</span>
            </div>

            {myTickets.map((t) => {
              const st = STATUS_FA[t.status] ?? STATUS_FA.open;
              const isOpen = expanded === t.id;
              const hasReply = !!t.reply;
              return (
                <div key={t.id} className="rounded-xl border border-outline-variant/30 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : t.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-2 p-3 bg-surface-container-low hover:bg-surface-container transition-all text-right"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{t.subject}</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">
                        {CATEGORY_FA[t.category] ?? t.category}
                        {t.reply && <span className="text-primary font-bold"> — پاسخ داده شد</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {hasReply && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-label="پاسخ جدید" />}
                      <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${st.cls}`}>{st.label}</span>
                      <MI name={isOpen ? "expand_less" : "expand_more"} size={16} className="text-on-surface-variant" />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="p-3 space-y-2 bg-surface-container-lowest">
                      <p className="text-body-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">{t.message}</p>
                      {t.reply && (
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                          <p className="text-label-md text-primary font-bold flex items-center gap-1.5 mb-1">
                            <MI name="support_agent" size={14} />
                            پاسخ پشتیبانی
                          </p>
                          <p className="text-body-sm text-on-surface leading-relaxed whitespace-pre-wrap">{t.reply}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* ------------------- ثبت تیکت (نمایش/عدم نمایش از پنل) ------------------- */}
        {contact.ticketEnabled && (
          <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20 text-primary">
              <MI name="confirmation_number" size={20} />
              <h2 className="text-sm font-bold text-on-surface">{contact.ticketTitle}</h2>
            </div>

            {done && (
              <div className="bg-tertiary-fixed/30 text-tertiary rounded-xl p-3 flex items-center gap-2 text-sm font-bold">
                <MI name="check_circle" size={18} className="shrink-0" />
                {contact.successMessage}
                <button
                  type="button"
                  onClick={() => setDone(false)}
                  aria-label="بستن پیام موفقیت"
                  className="mr-auto w-6 h-6 rounded-full flex items-center justify-center hover:bg-tertiary/10 shrink-0"
                >
                  <MI name="close" size={14} />
                </button>
              </div>
            )}

            <div className="space-y-2.5">
              <div>
                <label htmlFor="tk-name" className="text-label-md text-on-surface-variant block mb-1">
                  نام و نام خانوادگی <span className="text-error">*</span>
                </label>
                <input
                  id="tk-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div>
                <label htmlFor="tk-contact" className="text-label-md text-on-surface-variant block mb-1">
                  ایمیل یا شماره تماس <span className="text-error">*</span>
                </label>
                <input
                  id="tk-contact"
                  type="text"
                  dir="ltr"
                  value={form.contact}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                  className={`${inputCls} text-left`}
                />
                <p className="text-[10px] text-on-surface-variant mt-1">
                  پاسخ تیکت با همین راه تماس در بخش «تیکت‌های من» نمایش داده می‌شود
                </p>
              </div>

              <div>
                <span className="text-label-md text-on-surface-variant block mb-1">موضوع تیکت</span>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORY_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: c.id }))}
                      aria-pressed={form.category === c.id}
                      className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs transition-all active:scale-95 ${
                        form.category === c.id
                          ? "border-2 border-primary bg-primary/10 text-primary font-bold"
                          : "border border-outline-variant/30 bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                      }`}
                    >
                      <MI name={c.icon} size={16} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="tk-subject" className="text-label-md text-on-surface-variant block mb-1">
                  عنوان تیکت <span className="text-error">*</span>
                </label>
                <input
                  id="tk-subject"
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="خلاصه درخواست خود را بنویسید"
                  className={inputCls}
                />
              </div>

              <div>
                <label htmlFor="tk-message" className="text-label-md text-on-surface-variant block mb-1">
                  متن پیام <span className="text-error">*</span>
                </label>
                <textarea
                  id="tk-message"
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="توضیح کامل مشکل یا درخواست خود را بنویسید..."
                  rows={4}
                  className={`${inputCls} resize-none leading-relaxed`}
                />
              </div>

              <button
                type="button"
                onClick={submitTicket}
                disabled={sending}
                className="w-full bg-primary hover:bg-primary-container text-white rounded-xl py-3 text-sm font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-70"
              >
                {sending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    در حال ارسال...
                  </>
                ) : (
                  <>
                    <MI name="send" size={18} />
                    ثبت تیکت
                  </>
                )}
              </button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
