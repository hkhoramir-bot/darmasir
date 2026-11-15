"use client";

import { useState } from "react";
import { MI, PageHeader } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   تماس با ما — ارتباط با پشتیبانی + ثبت تیکت
   ============================================================ */

type Category = "general" | "bug" | "idea" | "ad";

const CATEGORY_OPTIONS: { id: Category; label: string; icon: string }[] = [
  { id: "general", label: "پرسش عمومی", icon: "help_outline" },
  { id: "bug", label: "گزارش خطا", icon: "bug_report" },
  { id: "idea", label: "پیشنهاد", icon: "lightbulb" },
  { id: "ad", label: "تبلیغات", icon: "campaign" },
];

export default function ContactPage() {
  const { toast } = useToast();

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

  const submitTicket = async () => {
    if (sending) return;
    setSending(true);
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
          description: "کارشناسان ما حداکثر تا ۲۴ ساعت آینده پاسخ می‌دهند",
        });
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
    "w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

  return (
    <>
      <PageHeader
        title="تماس با ما"
        subtitle="ارتباط با تیم پشتیبانی درمسیر"
        actions={
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <MI name="support_agent" size={20} />
          </div>
        }
      />

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-28 space-y-4">
        {/* ------------------- راه‌های تماس ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-2 pb-2 mb-1 border-b border-outline-variant/20 text-primary">
            <MI name="call" size={20} />
            <h2 className="text-sm font-bold text-on-surface">راه‌های ارتباطی</h2>
          </div>

          {/* تماس با پشتیبانی */}
          <div className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-surface-container-low transition-all gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                <MI name="support_agent" size={18} />
              </div>
              <p className="text-sm font-medium text-on-surface">تماس با پشتیبانی ۲۴ ساعته</p>
            </div>
            <a
              dir="ltr"
              href="tel:02191000000"
              className="text-label-md text-primary font-bold dark:text-primary-fixed-dim bg-primary-fixed/40 dark:bg-primary/20 px-2 py-1 rounded-md shrink-0 active:scale-95 transition-all"
            >
              ۰۲۱-۹۱۰۰۰۰۰۰
            </a>
          </div>

          {/* وب‌سایت و ایمیل */}
          <a
            href="https://metrojo.ir"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-surface-container-low active:scale-[0.99] transition-all gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                <MI name="language" size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface">وب‌سایت و ایمیل پشتیبانی</p>
                <p dir="ltr" className="text-body-sm text-outline text-right truncate">
                  info@metrojo.ir | metrojo.ir
                </p>
              </div>
            </div>
            <MI name="open_in_new" size={20} className="text-outline-variant shrink-0" />
          </a>

          {/* درخواست تبلیغات */}
          <a
            href={`mailto:info@metrojo.ir?subject=${encodeURIComponent("تبلیغات")}`}
            className="flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-surface-container-low active:scale-[0.99] transition-all gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                <MI name="campaign" size={18} />
              </div>
              <p className="text-sm font-medium text-on-surface">درخواست تبلیغات در برنامه</p>
            </div>
            <MI name="chevron_left" size={18} className="text-primary shrink-0" />
          </a>

          {/* سایر محصولات شهری */}
          <button
            type="button"
            onClick={() =>
              toast({
                title: "به‌زودی",
                description: "سایر محصولات شهری ما به‌زودی به درمسیر اضافه می‌شوند",
              })
            }
            className="w-full flex items-center justify-between py-2.5 px-1 rounded-lg hover:bg-surface-container-low active:scale-[0.99] transition-all text-right"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                <MI name="apps" size={18} />
              </div>
              <p className="text-sm font-medium text-on-surface">سایر محصولات شهری ما</p>
            </div>
            <MI name="chevron_left" size={20} className="text-outline-variant shrink-0" />
          </button>
        </section>

        {/* ------------------- ثبت تیکت ------------------- */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20 text-primary">
            <MI name="confirmation_number" size={20} />
            <h2 className="text-sm font-bold text-on-surface">ثبت تیکت پشتیبانی</h2>
          </div>

          {done && (
            <div className="bg-tertiary-fixed/30 text-tertiary rounded-xl p-3 flex items-center gap-2 text-sm font-bold">
              <MI name="check_circle" size={18} className="shrink-0" />
              تیکت شما با موفقیت ثبت شد — پاسخ از طریق تماس یا ایمیل اعلام می‌شود.
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
                placeholder="مثلاً علی محمدی"
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
                placeholder="email@example.com | 09121234567"
                className={`${inputCls} text-left`}
              />
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
            <p className="text-[11px] text-outline text-center">
              میانگین زمان پاسخ‌گویی: کمتر از ۲۴ ساعت
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
