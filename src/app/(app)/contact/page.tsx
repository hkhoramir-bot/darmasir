"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { MI, PageHeader } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";
import { useContactPage, type ContactMethod } from "@/components/metro/panel-banners";
import { useAuth } from "@/lib/auth-client";
import { toFa } from "@/lib/metro-data";

/* ============================================================
   تماس با ما — همه بخش‌ها از پنل مدیریت (تک منبع حقیقت)
   — راه‌های ارتباطی: افزودن/حذف/نمایش هر مورد در پنل
   — فرم ثبت تیکت: نمایش/عدم نمایش و متن‌ها در پنل
   — تیکت‌های من: روی خود اپ ذخیره می‌شوند و از رندر اول همین‌جا هستند؛
     فقط «پاسخ مدیر» از سرور یک بار چک و در مخزن محلی ادغام می‌شود
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
  id: string | number;
  subject: string;
  category: string;
  message: string;
  status: string;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  contact?: string;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const STATUS_FA: Record<string, { label: string; cls: string }> = {
  open: { label: "در انتظار بررسی", cls: "bg-secondary/15 text-secondary" },
  answered: { label: "پاسخ داده شد", cls: "bg-primary/10 text-primary" },
  closed: { label: "بسته شده", cls: "bg-surface-container text-on-surface-variant" },
};

/* ---------- مخزن محلی «تیکت‌های من» — منبع حقیقت روی خود اپ ----------
   تیکت‌ها روی خود اپ ذخیره می‌شوند و از رندر اول همان‌جا نمایش داده می‌شوند؛
   سرور فقط برای «پاسخ مدیر» یک بار در هر بازدید چک می‌شود و پاسخ در همین
   مخزن محلی ادغام می‌ماند — هیچ رندری وابسته به سرور نیست و هیچ polling هم نیست */
const TICKETS_LS_KEY = "darmasir-my-tickets-v2";
let ticketsStore: MyTicket[] | null = null;
let appliedTicketsJson = ""; /* آخرین فهرست اعمال‌شده — برای جلوگیری از setState بی‌دلیل */

const ticketKey = (t: MyTicket) => `${String(t.subject ?? "")}|${String(t.message ?? "").slice(0, 100)}`;

function readStore(): MyTicket[] {
  if (ticketsStore) return ticketsStore;
  let list: MyTicket[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(TICKETS_LS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) list = p.filter((t) => t && typeof t === "object" && !!t.subject);
      }
    } catch {
      /* JSON خراب یا دسترسی محدود — بی‌صدا */
    }
    /* مهاجرت یک‌باره از کش نسخه قبل (per-contactsKey) به مخزن تخت */
    if (list.length === 0) {
      try {
        const raw1 = window.localStorage.getItem("darmasir-my-tickets-v1");
        if (raw1) {
          const p = JSON.parse(raw1);
          const seen = new Set<string>();
          if (Array.isArray(p)) {
            for (const e of p) {
              for (const t of (e?.t ?? []) as MyTicket[]) {
                const k = `${String(t?.id)}|${ticketKey(t)}`;
                if (t && t.subject && !seen.has(k)) {
                  seen.add(k);
                  list.push(t);
                }
              }
            }
          }
          list.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
        }
        window.localStorage.removeItem("darmasir-my-tickets-v1");
      } catch {
        /* بی‌صدا */
      }
    }
  }
  ticketsStore = list.slice(0, 30);
  return ticketsStore;
}

function writeStore(list: MyTicket[]): MyTicket[] {
  ticketsStore = list.slice(0, 30);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(TICKETS_LS_KEY, JSON.stringify(ticketsStore));
    } catch {
      /* دسترسی محدود — بی‌صدا */
    }
  }
  return ticketsStore;
}

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

  /* ---------- تیکت‌های من ----------
     همه راه‌های تماسی که کاربر تا حالا تیکت با آنها زده (حساب + تایپ‌شده‌ها) —
     تیکت با هر کدام از این‌ها ثبت شده باشد، در «تیکت‌های من» دیده می‌شود */
  const [myTickets, setMyTickets] = useState<MyTicket[]>([]);
  const [expanded, setExpanded] = useState<string | number | null>(null);
  const TICKET_CONTACTS_LS = "darmasir-ticket-contacts";
  const [contactsVersion, setContactsVersion] = useState(0); /* راه تماس جدید ذخیره شد — کش راه‌ها دوباره خوانده شود */

  const readSavedTicketContacts = (): string[] => {
    try {
      const raw = localStorage.getItem(TICKET_CONTACTS_LS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((c: unknown) => typeof c === "string" && c.trim()).slice(0, 5) : [];
    } catch {
      return [];
    }
  };

  const saveTicketContact = (c: string) => {
    const v = c.trim();
    if (!v) return;
    try {
      const list = readSavedTicketContacts();
      if (!list.includes(v)) {
        localStorage.setItem(TICKET_CONTACTS_LS, JSON.stringify([v, ...list].slice(0, 5)));
        setContactsVersion((n) => n + 1); /* contactsKey به‌روز می‌شود و واکشی خودکار تکرار می‌شود */
      }
    } catch {
      /* حافظه در دسترس نیست */
    }
  };

  /* همه راه‌های تماسی که باید برایشان تیکت‌ها مرور شود — حساب + راه‌های ذخیره‌شده
     (فرم عمداً اینجا نیست تا هر ضربه کلید، واکشی نزند؛ بعد از ثبت، ذخیره و اضافه می‌شود) */
  const allMyContacts = useMemo(() => {
    const set = new Set<string>();
    if (user?.email) set.add(user.email.trim());
    if (user?.phone) set.add(user.phone.trim());
    for (const c of readSavedTicketContacts()) set.add(c);
    return Array.from(set).filter(Boolean).slice(0, 6);
  }, [user?.email, user?.phone, contactsVersion]);

  const contactsKey = allMyContacts.join(",");

  /* هیدراتاسیون پیش از رنگ‌آمیزی — تیکت‌ها از مخزن خود اپ، از رندر اول همین‌جا هستند */
  useIsoLayoutEffect(() => {
    const local = readStore();
    if (local.length > 0) {
      appliedTicketsJson = JSON.stringify(local);
      setMyTickets(local);
    }
  }, []);

  /* چک پاسخ‌ها — فقط یک بار برای هر مجموعه راه تماس (نه polling):
     فقط «پاسخ مدیر» از سرور می‌آید و در مخزن محلی ادغام می‌شود؛
     اگر پاسخ تازه‌ای نباشد، هیچ setState و هیچ رندری رخ نمی‌دهد */
  const checkReplies = useCallback(async (who: string) => {
    if (!who) return;
    try {
      const res = await fetch(`/api/tickets/replies?contacts=${encodeURIComponent(who)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) return;
      const serverList: MyTicket[] = Array.isArray(data.tickets) ? data.tickets : [];
      if (serverList.length === 0) return;
      const store = [...readStore()];
      let changed = false;
      for (const s of serverList) {
        const idx = store.findIndex(
          (l) => String(l.id) === String(s.id) || ticketKey(l) === ticketKey(s)
        );
        if (idx >= 0) {
          const l = store[idx];
          if (s.reply && !l.reply) {
            /* پاسخ تازه مدیر — تنها چیزی که از سرور رندر می‌شود */
            store[idx] = { ...l, reply: s.reply, repliedAt: s.repliedAt ?? null, status: s.status || "answered" };
            changed = true;
          } else if (!l.reply && /^local-/.test(String(l.id)) && s.id) {
            /* شناسه واقعی سرور جای شناسه محلی — بدون تغییر ظاهری */
            store[idx] = { ...l, id: s.id };
            changed = true;
          }
        } else {
          /* تیکت‌های دستگاه/نشست دیگر — یک بار به مخزن محلی اضافه و بعد از همان رندر می‌شوند */
          store.unshift(s);
          changed = true;
        }
      }
      if (changed) {
        store.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
        const saved = writeStore(store);
        const nextJson = JSON.stringify(saved);
        if (nextJson !== appliedTicketsJson) {
          appliedTicketsJson = nextJson;
          setMyTickets(saved);
        }
      }
    } catch {
      /* قطعی شبکه — مخزن محلی سر جایش می‌ماند */
    }
  }, []);

  useEffect(() => {
    if (contactsKey) checkReplies(contactsKey);
  }, [contactsKey, checkReplies]);

  const submitTicket = async () => {
    if (sending) return;
    const name = form.name.trim();
    const typedContact = form.contact.trim();
    const subject = form.subject.trim();
    const message = form.message.trim();
    /* اعتبارسنجی سمت اپ — مثل سرور، پیش از هر چیز */
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedContact);
    const isPhone = /^0?\d{9,11}$/.test(typedContact.replace(/[\s-]/g, ""));
    if (name.length < 2) {
      toast({ title: "نام ناقص است", description: "نام و نام خانوادگی را وارد کنید" });
      return;
    }
    if (!isEmail && !isPhone) {
      toast({ title: "راه تماس نامعتبر", description: "ایمیل یا شماره تماس معتبر وارد کنید" });
      return;
    }
    if (subject.length < 3) {
      toast({ title: "موضوع کوتاه است", description: "موضوع تیکت باید حداقل ۳ نویسه باشد" });
      return;
    }
    if (message.length < 10) {
      toast({ title: "متن پیام کوتاه است", description: "متن پیام باید حداقل ۱۰ نویسه باشد" });
      return;
    }

    setSending(true);
    const localId = `local-${Date.now()}`;
    /* ۱) تیکت فوراً روی خود اپ ذخیره و نمایش داده می‌شود — «در انتظار بررسی» تا رسیدن پاسخ مدیر */
    const optimistic: MyTicket = {
      id: localId,
      subject,
      category: form.category,
      message,
      status: "open",
      reply: null,
      repliedAt: null,
      createdAt: new Date().toISOString(),
      contact: typedContact,
    };
    const nextList = writeStore([optimistic, ...readStore()]);
    appliedTicketsJson = JSON.stringify(nextList);
    setMyTickets(nextList);
    /* راه تماس تایپ‌شده به‌خاطر سپرده شود — تیکت با همین ثبت شده است */
    if (typedContact) saveTicketContact(typedContact);
    try {
      /* ۲) همگام‌سازی با سرور فقط برای اینکه مدیر بتواند پاسخ بدهد — پاسخ بعداً یک بار چک می‌شود */
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contact: typedContact, category: form.category, subject, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setDone(true);
        setForm({ name: "", contact: "", category: "general", subject: "", message: "" });
        if (user?.email) saveTicketContact(user.email);
        if (user?.phone) saveTicketContact(user.phone);
        /* شناسه واقعی سرور جای شناسه محلی — در مخزن، بدون رندر محسوس */
        if (data.id) {
          const store = [...readStore()];
          const idx = store.findIndex((t) => String(t.id) === localId);
          if (idx >= 0) {
            store[idx] = { ...store[idx], id: data.id };
            const saved = writeStore(store);
            appliedTicketsJson = JSON.stringify(saved);
          }
        }
        toast({
          title: "تیکت ثبت شد",
          description: "پاسخ در بخش «تیکت‌های من» همین صفحه اعلام می‌شود",
        });
      } else {
        /* تیکت روی اپ مانده ولی به سرور نرسید — کاربر همان را می‌بیند */
        toast({
          title: "همگام‌سازی ناموفق بود",
          description: data.error ?? "تیکت در حافظه اپ ثبت شد؛ با اتصال بهتر دوباره تلاش کنید",
        });
      }
    } catch {
      toast({
        title: "خطای شبکه",
        description: "تیکت در حافظه اپ ثبت شد؛ برای رسیدن پاسخ مدیر، اتصال اینترنت لازم است",
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

        {/* ------------------- تیکت‌های من و پاسخ‌های مدیر (مخزن محلی اپ) ------------------- */}
        {myTickets.length > 0 && (
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
