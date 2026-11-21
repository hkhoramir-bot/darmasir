"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gw } from "@/lib/gw";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================
// تیکت‌ها و پشتیبانی کاربران — بازتولید وفادار طراحی Stitch
// نمای دوستونه: فهرست تیکت‌ها (راست) + گفتگو و پاسخ‌گذاری (چپ)
// ============================================================

type TicketMsg = {
  id: string;
  ticketId: string;
  author: string; // ADMIN | USER
  body: string;
  createdAt: string;
};

type Ticket = {
  id: string;
  code: string;
  subject: string;
  userName: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages?: TicketMsg[];
};

type Stats = {
  open: number;
  pending: number;
  closed: number;
  urgent: number;
  total: number;
};

const PAGE_SIZE = 8;

const STATUS_LABEL: Record<string, string> = {
  OPEN: "باز",
  PENDING: "در حال پیگیری",
  CLOSED: "بسته",
};

const PRIORITY_LABEL: Record<string, string> = {
  URGENT: "فوری",
  HIGH: "بالا",
  NORMAL: "عادی",
  LOW: "کم",
};

const CATEGORY_LABEL: Record<string, string> = {
  GENERAL: "عمومی",
  GPS: "GPS",
  VOICE: "دستیار صوتی",
  ROUTE: "مسیریابی",
  PAYMENT: "پرداخت",
  OTHER: "سایر",
};

// اولویت: فوری قرمز، بالا (secondary-fixed با متن error)، عادی خنثی، کم outline
const PRIORITY_BADGE: Record<string, string> = {
  URGENT: "bg-secondary-container text-white",
  HIGH: "bg-secondary-fixed text-error",
  NORMAL: "bg-surface-container-high text-on-surface-variant",
  LOW: "border border-outline-variant text-outline",
};

// وضعیت: باز قرمز، در حال پیگیری primary-fixed طرح، بسته سبز tertiary
const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-error-container text-on-error-container",
  PENDING: "bg-primary-fixed text-on-primary-fixed-variant",
  CLOSED: "bg-tertiary-fixed text-on-tertiary-fixed",
};

const CANNED = [
  "سلام و تشکر از گزارش شما؛ موضوع در دست بررسی است و به‌زودی نتیجه اطلاع‌رسانی می‌شود.",
  "مشکل گزارش‌شده بررسی شد و در نسخه بعدی اپلیکیشن اصلاح می‌شود.",
  "لطفاً کد پیگیری تراکنش یا تصویر رسید را برای بررسی ارسال کنید.",
  "موضوع به تیم فنی مربوطه ارجاع شد و پس از رفع، از همین تیکت مطلع می‌شوید.",
];

// ---------- کمکی‌ها ----------
const fa = (n: number | string) =>
  String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "-";
  const diffMin = Math.floor((Date.now() - t) / 60000);
  if (diffMin < 1) return "همین حالا";
  if (diffMin < 60) return `${fa(diffMin)} دقیقه پیش`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${fa(h)} ساعت پیش`;
  const d = Math.floor(h / 24);
  if (d === 1) return "دیروز";
  if (d < 30) return `${fa(d)} روز پیش`;
  return fa(new Date(iso).toLocaleDateString("fa-IR"));
}

function faDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("fa-IR");
}

function faTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 1);
  return `${parts[0][0]}\u200C${parts[parts.length - 1][0]}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

type DetailData = { ticket: Ticket; messages: TicketMsg[] };

// ============================================================
// بدنه جزئیات تیکت — هم در پنل سمت چپ دسکتاپ و هم در Dialog موبایل
// ============================================================
function DetailBody({
  data,
  canWrite,
  onPatch,
  onReply,
  onCloseTicket,
  busy,
  reply,
  setReply,
  sending,
}: {
  data: DetailData;
  canWrite: boolean;
  onPatch: (patch: { status?: string; priority?: string }) => void;
  onReply: () => void;
  onCloseTicket: () => void;
  busy: boolean;
  reply: string;
  setReply: (v: string) => void;
  sending: boolean;
}) {
  const { ticket, messages } = data;

  // بازیابی پیش‌نویس ذخیره‌شده در مرورگر هنگام باز شدن تیکت
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`darmasir-draft-${ticket.id}`);
      setReply(saved ?? "");
    } catch {
      /* حافظه مرورگر در دسترس نیست */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  function saveDraft() {
    try {
      window.localStorage.setItem(`darmasir-draft-${ticket.id}`, reply);
      toast.success("پیش‌نویس پاسخ ذخیره شد");
    } catch {
      toast.error("ذخیره پیش‌نویس ممکن نشد");
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* ---------- هدر تیکت ---------- */}
      <div className="shrink-0 border-b border-outline-variant/40 bg-surface-container-lowest p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-headline-md text-headline-md font-extrabold text-primary" dir="ltr">
                #{ticket.code}
              </span>
              <span
                className={cn(
                  "font-label-sm text-label-sm px-2.5 py-0.5 rounded-full font-bold",
                  PRIORITY_BADGE[ticket.priority] ?? ""
                )}
              >
                اولویت {PRIORITY_LABEL[ticket.priority] ?? ticket.priority}
              </span>
              <span
                className={cn(
                  "font-label-sm text-label-sm px-2.5 py-0.5 rounded-full font-bold",
                  STATUS_BADGE[ticket.status] ?? ""
                )}
              >
                وضعیت: {STATUS_LABEL[ticket.status] ?? ticket.status}
              </span>
            </div>
            <h3 className="font-title-lg text-title-lg font-bold text-on-surface mt-1">
              {ticket.subject}
            </h3>
          </div>

          {/* اکشن‌های وضعیت و اولویت */}
          {canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={ticket.status}
                onValueChange={(v) => onPatch({ status: v })}
                disabled={busy}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="تغییر وضعیت تیکت"
                  className="rounded-xl bg-surface-container-low border-outline-variant/60 text-label-md text-on-surface-variant font-label-md w-[132px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["OPEN", "PENDING", "CLOSED"] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={ticket.priority}
                onValueChange={(v) => onPatch({ priority: v })}
                disabled={busy}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="تغییر اولویت تیکت"
                  className="rounded-xl bg-surface-container-low border-outline-variant/60 text-label-md text-on-surface-variant font-label-md w-[116px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["URGENT", "HIGH", "NORMAL", "LOW"] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={onCloseTicket}
                disabled={busy || ticket.status === "CLOSED"}
                className="flex items-center gap-1.5 rounded-xl bg-tertiary-fixed px-3 py-1.5 font-label-md text-label-md font-bold text-on-tertiary-fixed transition-colors hover:bg-tertiary-container hover:text-white disabled:opacity-50 disabled:pointer-events-none"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  task_alt
                </span>
                <span>حل‌شده و بستن تیکت</span>
              </button>
            </div>
          ) : (
            <span className="flex items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-1.5 font-label-md text-label-md text-on-surface-variant">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                visibility
              </span>
              <span>حالت مشاهده</span>
            </span>
          )}
        </div>

        {/* ---------- نوار اطلاعات مسافر ---------- */}
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-outline-variant/30 pt-3 text-right xl:grid-cols-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold font-title-md text-primary">
              {initials(ticket.userName)}
            </div>
            <div className="min-w-0">
              <span className="block font-label-sm text-label-sm text-outline">مسافر اپلیکیشن</span>
              <span className="block truncate font-label-md text-label-md font-bold text-on-surface">
                {ticket.userName}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined shrink-0 text-outline">category</span>
            <div>
              <span className="block font-label-sm text-label-sm text-outline">دسته موضوع</span>
              <span className="block font-label-md text-label-md font-bold text-on-surface">
                {CATEGORY_LABEL[ticket.category] ?? ticket.category}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined shrink-0 text-outline">schedule</span>
            <div>
              <span className="block font-label-sm text-label-sm text-outline">تاریخ ثبت تیکت</span>
              <span className="block font-label-md text-label-md text-on-surface">
                {faDate(ticket.createdAt)} - {faTime(ticket.createdAt)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined shrink-0 text-outline">update</span>
            <div>
              <span className="block font-label-sm text-label-sm text-outline">آخرین به‌روزرسانی</span>
              <span className="block font-label-md text-label-md text-on-surface">
                {relTime(ticket.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- خط زمان گفتگو ---------- */}
      <div className="min-h-[120px] flex-1 space-y-4 overflow-y-auto bg-background p-4 custom-scrollbar">
        <div className="my-2 flex items-center justify-center">
          <span className="rounded-full bg-surface-container px-3 py-1 font-label-sm text-label-sm text-on-surface-variant">
            گفتگوی تیکت {ticket.code} — {faDate(ticket.createdAt)}
          </span>
        </div>

        {messages.map((m) =>
          m.author === "USER" ? (
            // پیام کاربر — حباب روش‌دار طرح (surface-container-high)
            <div key={m.id} className="flex max-w-2xl gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-label-md text-primary">
                {firstName(ticket.userName)}
              </div>
              <div className="flex-1 space-y-2 rounded-2xl rounded-tr-none bg-surface-container-high p-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
                  <span className="font-label-md text-label-md font-bold text-on-surface">
                    {ticket.userName} (مسافر اپلیکیشن درمسیر)
                  </span>
                  <span className="font-label-sm text-label-sm text-outline">
                    {faTime(m.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap font-body-md text-body-md leading-relaxed text-on-surface">
                  {m.body}
                </p>
              </div>
            </div>
          ) : (
            // پاسخ مدیر — حباب primary-container سمت مقابل
            <div key={m.id} className="ms-auto flex max-w-2xl flex-row-reverse gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm">
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}
                >
                  support_agent
                </span>
              </div>
              <div className="flex-1 space-y-2 rounded-2xl rounded-tl-none bg-primary-container p-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-on-primary-container/20 pb-2">
                  <span className="font-label-md text-label-md font-bold text-on-primary-container">
                    پاسخ کارشناس پشتیبانی درمسیر
                  </span>
                  <span className="font-label-sm text-label-sm text-on-primary-container/70">
                    {faTime(m.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap font-body-md text-body-md leading-relaxed text-on-primary-container">
                  {m.body}
                </p>
              </div>
            </div>
          )
        )}

        {messages.length === 0 && (
          <p className="py-6 text-center font-body-sm text-body-sm text-outline">
            هنوز پیامی در این تیکت ثبت نشده است.
          </p>
        )}
      </div>

      {/* ---------- جعبه پاسخ ---------- */}
      {canWrite ? (
        <div className="shrink-0 space-y-3 border-t border-outline-variant/40 bg-surface-container-lowest p-4">
          {/* قالب‌های سریع */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
            <span className="flex shrink-0 items-center gap-1 font-label-sm text-label-sm text-outline">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span>
              <span>قالب‌های سریع:</span>
            </span>
            {CANNED.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setReply(c)}
                className="whitespace-nowrap rounded-lg bg-surface-container-low px-2.5 py-1 font-label-sm text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                {["تشکر و اعلام بررسی", "اصلاح در نسخه بعدی", "درخواست کد پیگیری", "ارجاع به تیم فنی"][i]}
              </button>
            ))}
          </div>

          {/* جعبه متن پاسخ */}
          <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-low/60 p-2">
              <div className="flex items-center gap-1 text-on-surface-variant">
                <span className="p-1 rounded" title="درشت Bold">
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>format_bold</span>
                </span>
                <span className="p-1 rounded" title="مورب Italic">
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>format_italic</span>
                </span>
                <span className="p-1 rounded" title="فهرست شماره‌دار">
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>format_list_numbered</span>
                </span>
                <div className="mx-1 h-4 w-px bg-outline-variant/40" />
                <span
                  className="flex items-center gap-1 font-label-sm text-label-sm text-outline"
                  title="پیوست فایل یا تصویر راهنما"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>attach_file</span>
                  <span className="hidden sm:inline">پیوست فایل یا تصویر راهنما</span>
                </span>
              </div>
              <label className="hidden cursor-pointer items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant sm:flex">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded border-outline-variant text-primary focus:ring-primary/20"
                />
                <span>ارسال پیامک اطلاع‌رسانی به مسافر</span>
              </label>
            </div>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              placeholder="پاسخ خود را برای مسافر تایپ کنید (این پیام در بخش تیکت‌های اپلیکیشن مسافر نمایش داده می‌شود)..."
              className="w-full resize-none bg-transparent p-3 font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none"
            />
          </div>

          {/* دکمه‌های ارسال */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={saveDraft}
              className="rounded-xl bg-surface-container px-4 py-2 font-label-lg text-label-lg text-on-surface transition-colors hover:bg-surface-container-high"
            >
              ذخیره پیش‌نویس
            </button>
            <button
              type="button"
              onClick={onReply}
              disabled={sending || !reply.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary shadow-sm transition-all hover:bg-primary-container active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              <span>{sending ? "در حال ارسال..." : "ارسال پاسخ به اپلیکیشن مسافر"}</span>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}
              >
                send
              </span>
            </button>
          </div>
        </div>
      ) : (
        // نقش VIEWER — فقط مشاهده
        <div className="shrink-0 border-t border-outline-variant/40 bg-surface-container-lowest p-4">
          <div className="flex items-center gap-2 rounded-xl bg-surface-container-low p-3 text-on-surface-variant">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>
              lock
            </span>
            <span className="font-label-md text-label-md">
              دسترسی شما فقط مشاهده است — ارسال پاسخ و تغییر وضعیت برای نقش ناظر فعال نیست.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// صفحه اصلی تیکت‌ها
// ============================================================
export default function TicketsClient({ role }: { role: string }) {
  const canWrite = role !== "VIEWER";

  // --- داده‌ها ---
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats>({ open: 0, pending: 0, closed: 0, urgent: 0, total: 0 });
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // --- فیلترها ---
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  // --- جزئیات ---
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // --- پاسخ ---
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  // جستجوی تایپ‌شده با تاخیر
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // --- دریافت فهرست تیکت‌ها (و آمار) ---
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (status !== "ALL") p.set("status", status);
      if (priority !== "ALL") p.set("priority", priority);
      if (category !== "ALL") p.set("category", category);
      if (q) p.set("q", q);
      p.set("page", String(page));
      p.set("pageSize", String(PAGE_SIZE));
      const r = await fetch(gw(`/api/v1/tickets?${p.toString()}`));
      const d = await r.json();
      if (d?.ok) {
        setTickets(d.data.tickets as Ticket[]);
        setStats(d.data.stats as Stats);
        setTotal(d.data.total as number);
        setPages(Math.max(1, Math.ceil((d.data.total as number) / (d.data.pageSize as number))));
      } else {
        toast.error(d?.error ?? "خطا در دریافت فهرست تیکت‌ها");
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      setLoading(false);
    }
  }, [status, priority, category, q, page]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // اصلاح شماره صفحه اگر از محدوده خارج شد
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [pages, page]);

  // --- دریافت جزئیات تیکت انتخاب‌شده ---
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const r = await fetch(gw(`/api/v1/tickets/${encodeURIComponent(id)}`));
      const d = await r.json();
      if (d?.ok) {
        setDetail({ ticket: d.data.ticket as Ticket, messages: d.data.messages as TicketMsg[] });
      } else {
        setDetail(null);
        toast.error(d?.error ?? "خطا در دریافت جزئیات تیکت");
      }
    } catch {
      setDetail(null);
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  // انتخاب خودکار اولین تیکت پس از بارگذاری اولیه
  const autoSelected = useRef(false);
  useEffect(() => {
    if (!autoSelected.current && !loading && tickets.length > 0 && !selectedId) {
      setSelectedId(tickets[0].id);
      autoSelected.current = true;
    }
  }, [loading, tickets, selectedId]);

  function selectTicket(id: string) {
    setSelectedId(id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setDialogOpen(true);
    }
  }

  // --- اکشن‌ها ---
  const refresh = useCallback(async () => {
    await loadList();
    if (selectedId) await loadDetail(selectedId);
  }, [loadList, loadDetail, selectedId]);

  async function patchTicket(patch: { status?: string; priority?: string }) {
    if (!selectedId || !detail) return;
    setBusy(true);
    try {
      const r = await fetch(gw(`/api/v1/tickets/${encodeURIComponent(detail.ticket.id)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (d?.ok) {
        toast.success("تغییرات تیکت ذخیره شد");
        await refresh();
      } else {
        toast.error(d?.error ?? "ثبت تغییرات ناموفق بود");
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      setBusy(false);
    }
  }

  function closeTicket() {
    if (!detail || detail.ticket.status === "CLOSED") return;
    // پیام موفقیت در خود patchTicket نمایش داده می‌شود
    patchTicket({ status: "CLOSED" });
  }

  async function sendReply() {
    if (!detail || !reply.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(
        gw(`/api/v1/tickets/${encodeURIComponent(detail.ticket.id)}/messages`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: reply.trim() }),
        }
      );
      const d = await r.json();
      if (d?.ok) {
        try {
          window.localStorage.removeItem(`darmasir-draft-${detail.ticket.id}`);
        } catch {
          /* بی‌اهمیت */
        }
        setReply("");
        toast.success(
          d.data.status === "PENDING"
            ? "پاسخ ارسال شد و وضعیت تیکت به «در حال پیگیری» تغییر کرد"
            : "پاسخ با موفقیت ارسال شد"
        );
        await refresh();
      } else {
        toast.error(d?.error ?? "ارسال پاسخ ناموفق بود");
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      setSending(false);
    }
  }

  // --- خروجی اکسل (CSV) از نتایج فعلی ---
  function exportCsv() {
    if (tickets.length === 0) {
      toast.error("تیکتی برای خروجی گرفتن وجود ندارد");
      return;
    }
    const rows: string[][] = [
      ["کد", "موضوع", "کاربر", "دسته", "اولویت", "وضعیت", "تاریخ ثبت"],
      ...tickets.map((t) => [
        t.code,
        t.subject,
        t.userName,
        CATEGORY_LABEL[t.category] ?? t.category,
        PRIORITY_LABEL[t.priority] ?? t.priority,
        STATUS_LABEL[t.status] ?? t.status,
        faDate(t.createdAt),
      ]),
    ];
    const csv =
      "\uFEFF" +
      rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "darmasir-tickets.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("خروجی گزارش دانلود شد");
  }

  const tabs = useMemo(
    () => [
      { key: "ALL", label: "همه تیکت‌ها", count: stats.total },
      { key: "OPEN", label: "باز", count: stats.open },
      { key: "PENDING", label: "در حال پیگیری", count: stats.pending },
      { key: "CLOSED", label: "بسته‌شده", count: stats.closed },
    ],
    [stats]
  );

  const rangeText = useMemo(() => {
    if (total === 0) return "تیکتی یافت نشد";
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, total);
    return `نمایش ${fa(start)} تا ${fa(end)} از ${fa(total)} تیکت`;
  }, [total, page]);

  const pageNumbers = useMemo(() => {
    const arr: number[] = [];
    const from = Math.max(1, page - 2);
    const to = Math.min(pages, from + 4);
    for (let i = from; i <= to; i++) arr.push(i);
    return arr;
  }, [pages, page]);

  const kpis = useMemo(
    () => [
      {
        key: "OPEN",
        label: "تیکت‌های باز",
        value: stats.open,
        hint: "در انتظار بررسی و پاسخ کارشناس",
        icon: "inbox",
        box: "bg-surface-container text-primary",
        valueColor: "text-on-surface",
        filter: () => {
          setStatus("OPEN");
          setPriority("ALL");
          setPage(1);
        },
      },
      {
        key: "PENDING",
        label: "در حال پیگیری",
        value: stats.pending,
        hint: "پاسخ داده شده و منتظر واکنش مسافر",
        icon: "hourglass_top",
        box: "bg-error-container/30 text-secondary",
        valueColor: "text-secondary",
        filter: () => {
          setStatus("PENDING");
          setPriority("ALL");
          setPage(1);
        },
      },
      {
        key: "CLOSED",
        label: "بسته‌شده",
        value: stats.closed,
        hint: "حل‌شده و مختومه با رضایت مسافر",
        icon: "task_alt",
        box: "bg-tertiary-fixed/30 text-tertiary",
        valueColor: "text-tertiary",
        filter: () => {
          setStatus("CLOSED");
          setPriority("ALL");
          setPage(1);
        },
      },
      {
        key: "URGENT",
        label: "فوری (CRITICAL)",
        value: stats.urgent,
        hint: "نیاز به اقدام فوری کارشناس پشتیبانی",
        icon: "priority_high",
        box: "bg-secondary-fixed/60 text-error",
        valueColor: "text-error",
        filter: () => {
          setPriority("URGENT");
          setStatus("ALL");
          setPage(1);
        },
      },
    ],
    [stats]
  );

  return (
    <div className="flex flex-col p-4 space-y-6 sm:p-6 lg:h-full lg:space-y-5">
      {/* ================= عنوان صفحه و اکشن‌ها ================= */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 font-headline-lg text-headline-lg font-bold text-primary">
            <span>تیکت‌ها و پشتیبانی کاربران</span>
            <span className="rounded-full bg-primary-fixed px-2.5 py-0.5 font-label-md text-label-md font-normal text-on-primary-fixed">
              درخواست‌های درون‌برنامه‌ای مسافران
            </span>
          </h2>
          <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
            بررسی و رسیدگی لحظه‌ای به گزارشات مشکلات خطوط، شارژ بلیت، ناوبری صوتی و ایستگاه‌ها
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 font-label-md text-label-md text-on-surface-variant shadow-xs transition-colors hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
            <span>خروجی اکسل گزارش</span>
          </button>
          <button
            type="button"
            onClick={() =>
              toast.info("ثبت تیکت مسافر حضوری به‌زودی از طریق همین بخش فعال می‌شود")
            }
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-label-lg text-label-lg text-on-primary shadow-sm transition-all hover:bg-primary-container active:scale-95"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            <span>ثبت تیکت مسافر حضوری</span>
          </button>
        </div>
      </div>

      {/* ================= کارت‌های خلاصه (باز / پیگیری / بسته / فوری) ================= */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={k.filter}
            title={`فیلتر نمایش: ${k.label}`}
            className="flex items-center justify-between rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 text-right shadow-xs transition-all hover:border-primary/50 hover:shadow-sm"
          >
            <div>
              <span className="font-label-md text-label-md text-on-surface-variant">{k.label}</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={cn("font-headline-xl text-headline-xl font-extrabold", k.valueColor)}>
                  {fa(k.value)}
                </span>
                <span className="font-label-sm text-label-sm text-outline">تیکت</span>
              </div>
              <span className="mt-0.5 block font-body-sm text-body-sm text-outline">{k.hint}</span>
            </div>
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", k.box)}>
              <span className="material-symbols-outlined" style={{ fontSize: 26 }}>
                {k.icon}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* ================= نوار فیلترها ================= */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* تب‌های وضعیت */}
        <div className="flex max-w-full items-center overflow-x-auto rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-1 shadow-xs">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setStatus(t.key);
                setPage(1);
              }}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-label-md text-label-md transition-colors",
                status === t.key
                  ? "bg-secondary font-bold text-white shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              <span>{t.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-label-sm text-label-sm",
                  status === t.key ? "bg-white/20" : "bg-surface-container-high"
                )}
              >
                {fa(t.count)}
              </span>
            </button>
          ))}
        </div>

        {/* جستجو + دراپ‌داون‌ها */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <span
              className="material-symbols-outlined absolute right-3 top-2 text-outline"
              style={{ fontSize: 18 }}
            >
              search
            </span>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              type="text"
              placeholder="جستجو در موضوع، کاربر یا کد تیکت..."
              aria-label="جستجوی تیکت"
              className="w-56 rounded-xl border border-outline-variant/60 bg-surface-container-lowest py-2 pr-9 pl-3 font-body-sm text-body-sm text-on-surface transition-all placeholder:text-outline focus:border-primary focus:outline-none sm:w-64"
            />
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 py-1.5">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: 18 }}>
              category
            </span>
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v);
                setPage(1);
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label="فیلتر دسته"
                className="w-[140px] border-0 bg-transparent px-0 shadow-none font-body-sm text-body-sm text-on-surface focus-visible:ring-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همه دسته‌ها</SelectItem>
                {(["GENERAL", "GPS", "VOICE", "ROUTE", "PAYMENT", "OTHER"] as const).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 py-1.5">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: 18 }}>
              flag
            </span>
            <Select
              value={priority}
              onValueChange={(v) => {
                setPriority(v);
                setPage(1);
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label="فیلتر اولویت"
                className="w-[128px] border-0 bg-transparent px-0 shadow-none font-body-sm text-body-sm text-on-surface focus-visible:ring-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همه اولویت‌ها</SelectItem>
                {(["URGENT", "HIGH", "NORMAL", "LOW"] as const).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ================= نمای دوستونه: فهرست + جزئیات ================= */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 lg:min-h-[620px] lg:flex-row">
        {/* ---------- ستون راست: فهرست تیکت‌ها ---------- */}
        <section className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest shadow-xs lg:w-5/12 lg:h-full">
          {/* هدر فهرست */}
          <div className="flex shrink-0 items-center justify-between border-b border-outline-variant/40 bg-surface-container-low/50 p-3.5">
            <div className="flex items-center gap-2">
              <span className="font-label-lg text-label-lg font-bold text-on-surface">صف تیکت‌ها</span>
              <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm font-bold text-primary">
                {fa(total)} تیکت
              </span>
            </div>
            <div className="flex items-center gap-2 text-outline">
              <span className="font-label-sm text-label-sm">مرتب‌سازی: جدیدترین‌ها</span>
              <button
                type="button"
                className="p-1 transition-colors hover:text-primary"
                title="مرتب‌سازی بر اساس آخرین فعالیت"
                onClick={() => toast.info("فهرست بر اساس آخرین فعالیت مرتب شده است")}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>swap_vert</span>
              </button>
            </div>
          </div>

          {/* کارت تیکت‌ها */}
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 custom-scrollbar max-h-[440px] lg:max-h-none">
            {loading ? (
              [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="animate-pulse space-y-2 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4"
                >
                  <div className="h-4 w-2/3 rounded bg-surface-container-high" />
                  <div className="h-3 w-full rounded bg-surface-container" />
                  <div className="h-3 w-1/2 rounded bg-surface-container" />
                </div>
              ))
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="material-symbols-outlined text-outline" style={{ fontSize: 40 }}>
                  inbox
                </span>
                <p className="font-title-md text-title-md text-on-surface-variant">
                  تیکتی با این فیلترها یافت نشد
                </p>
                <p className="font-body-sm text-body-sm text-outline">
                  فیلترها را تغییر دهید یا جستجو را پاک کنید
                </p>
              </div>
            ) : (
              tickets.map((t) => {
                const selected = t.id === selectedId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTicket(t.id)}
                    className={cn(
                      "relative block w-full cursor-pointer rounded-xl p-4 text-right transition-all",
                      selected
                        ? "border-2 border-primary bg-primary-fixed/20 shadow-xs"
                        : "border border-outline-variant/40 bg-surface-container-lowest shadow-xs hover:bg-surface-container-low/40"
                    )}
                  >
                    {selected && (
                      <div className="absolute -right-0.5 top-4 bottom-4 w-1 rounded-l-full bg-primary" />
                    )}
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 font-label-sm text-label-sm font-bold",
                            PRIORITY_BADGE[t.priority] ?? ""
                          )}
                        >
                          {PRIORITY_LABEL[t.priority] ?? t.priority}
                        </span>
                        <span className="rounded bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
                          {CATEGORY_LABEL[t.category] ?? t.category}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-label-sm text-label-sm",
                            STATUS_BADGE[t.status] ?? ""
                          )}
                        >
                          {STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 font-label-sm text-label-sm text-outline">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                          schedule
                        </span>
                        <span>{relTime(t.updatedAt)}</span>
                      </span>
                    </div>
                    <span
                      className={cn(
                        "mb-1 line-clamp-1 block font-title-md text-title-md font-bold",
                        selected ? "text-primary" : "text-on-surface"
                      )}
                    >
                      {t.subject}
                    </span>
                    <span className="mb-3 line-clamp-2 block font-body-sm text-body-sm text-on-surface-variant">
                      {t.messages?.[0]?.body ?? "بدون پیام"}
                    </span>
                    <div className="flex items-center justify-between border-t border-outline-variant/30 pt-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full font-bold text-label-sm",
                            selected ? "bg-primary/10 text-primary" : "bg-surface-container text-on-surface"
                          )}
                        >
                          {initials(t.userName)}
                        </div>
                        <span className="font-label-md text-label-md font-semibold text-on-surface">
                          {t.userName}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "font-label-sm text-label-sm font-bold",
                          selected ? "text-primary" : "text-outline"
                        )}
                        dir="ltr"
                      >
                        #{t.code}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* صفحه‌بندی */}
          <div className="flex shrink-0 items-center justify-between border-t border-outline-variant/40 bg-surface-container-lowest p-3 font-label-sm text-label-sm text-outline">
            <span>{rangeText}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded p-1 transition-colors hover:bg-surface-container disabled:opacity-30"
                aria-label="صفحه قبل"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
              </button>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={cn(
                    "rounded px-2 py-0.5 transition-colors hover:bg-surface-container",
                    n === page ? "bg-surface-container font-bold text-on-surface" : "text-outline"
                  )}
                >
                  {fa(n)}
                </button>
              ))}
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                className="rounded p-1 transition-colors hover:bg-surface-container disabled:opacity-30"
                aria-label="صفحه بعد"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
              </button>
            </div>
          </div>
        </section>

        {/* ---------- ستون چپ: جزئیات و پاسخ‌گذاری (دسکتاپ) ---------- */}
        <section className="hidden min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest shadow-xs lg:flex lg:h-full">
          {detailLoading && !detail ? (
            <div className="flex flex-1 items-center justify-center">
              <span
                className="material-symbols-outlined animate-spin text-primary"
                style={{ fontSize: 32 }}
              >
                progress_activity
              </span>
            </div>
          ) : detail ? (
            <DetailBody
              data={detail}
              canWrite={canWrite}
              busy={busy}
              reply={reply}
              setReply={setReply}
              sending={sending}
              onPatch={patchTicket}
              onReply={sendReply}
              onCloseTicket={closeTicket}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <span
                className="material-symbols-outlined text-outline"
                style={{ fontSize: 44, fontVariationSettings: "'FILL' 0" }}
              >
                support_agent
              </span>
              <p className="font-title-md text-title-md text-on-surface-variant">
                برای پیگیری، یک تیکت از فهرست انتخاب کنید
              </p>
              <p className="font-body-sm text-body-sm text-outline">
                رشته گفتگو، جعبه پاسخ و تغییر وضعیت و اولویت در این بخش نمایش داده می‌شود
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ================= جزئیات در موبایل (Dialog بزرگ) ================= */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="h-[88vh] w-[calc(100%-1.5rem)] max-w-4xl grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl border-outline-variant/50 bg-surface-container-lowest p-0 sm:max-w-4xl">
          <DialogTitle className="sr-only">جزئیات تیکت پشتیبانی</DialogTitle>
          <DialogDescription className="sr-only">
            رشته گفتگو و ابزارهای پاسخ به تیکت
          </DialogDescription>
          {detail ? (
            <DetailBody
              data={detail}
              canWrite={canWrite}
              busy={busy}
              reply={reply}
              setReply={setReply}
              sending={sending}
              onPatch={patchTicket}
              onReply={sendReply}
              onCloseTicket={closeTicket}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: 32 }}>
                progress_activity
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
