"use client";

// پشتیبانی — فهرست تیکت‌ها (ستون راست) + گفتگوی تیکت با رشته پیام (ستون چپ)
// موبایل: با انتخاب تیکت، جزئیات نمایش داده می‌شود؛ دکمه بازگشت به فهرست.

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, LifeBuoy, MessageSquare, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/client";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  PageHeader,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  Spinner,
  faDate,
  ticketStatusVariant,
  useAdmin,
  type TicketDetailT,
  type TicketListItemT,
} from "@/components/panel-kit";

const CATEGORY_LABEL: Record<string, string> = {
  BUG: "خطا",
  SUGGESTION: "پیشنهاد",
  BILLING: "مالی",
  OTHER: "سایر",
};

function ticketUser(t: {
  user: { name?: string | null; deviceId?: string | null } | null;
  deviceId?: string | null;
}): string {
  if (t.user?.name) return t.user.name;
  return "کاربر ناشناس";
}

export default function TicketsPage() {
  const { admin } = useAdmin();
  const role = admin?.role ?? null;
  const canEdit = role === "SUPERADMIN" || role === "OPERATOR";
  const canDelete = role === "SUPERADMIN";

  // فهرست
  const [tickets, setTickets] = useState<TicketListItemT[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [qQuery, setQQuery] = useState("");

  // جزئیات
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetailT | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // پاسخ
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  // حذف تیکت
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // جستجوی تاخیری
  useEffect(() => {
    const t = setTimeout(() => setQQuery(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (qQuery.trim()) params.set("q", qQuery.trim());
      const d = await apiFetch<TicketListItemT[]>(
        `/api/v1/tickets?${params.toString()}`
      );
      setTickets(d);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "بارگذاری تیکت‌ها ناموفق بود.");
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, qQuery]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    try {
      const d = await apiFetch<TicketDetailT>(
        `/api/v1/tickets/${encodeURIComponent(selectedId)}`
      );
      setDetail(d);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "بارگذاری تیکت ناموفق بود.");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function patchTicket(patch: { status?: string; priority?: string }) {
    if (!detail || !canEdit) return;
    try {
      await apiFetch(`/api/v1/tickets/${encodeURIComponent(detail.id)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      toast.success("تیکت بروزرسانی شد.");
      await loadDetail();
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "بروزرسانی ناموفق بود.");
    }
  }

  async function sendReply() {
    if (!detail || !canEdit) return;
    const body = reply.trim();
    if (!body) return;
    setSending(true);
    try {
      await apiFetch(`/api/v1/tickets/${encodeURIComponent(detail.id)}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      toast.success("پاسخ ارسال شد.");
      setReply("");
      await loadDetail();
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ارسال پاسخ ناموفق بود.");
    } finally {
      setSending(false);
    }
  }

  async function doDelete() {
    if (!detail || !canDelete) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/tickets/${encodeURIComponent(detail.id)}`, {
        method: "DELETE",
      });
      toast.success("تیکت حذف شد.");
      setDeleteOpen(false);
      setSelectedId(null);
      setDetail(null);
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف تیکت ناموفق بود.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="پشتیبانی"
        description="پیام‌ها و تیکت‌های دریافتی از کاربران اپلیکیشن"
      />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* ستون فهرست — اول در DOM، در RTL ستون راست */}
        <div
          className={
            "flex-col gap-4 " + (selectedId ? "hidden lg:flex" : "flex flex-col")
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-32" aria-label="فیلتر وضعیت">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="OPEN">باز</SelectItem>
                <SelectItem value="PENDING">در بررسی</SelectItem>
                <SelectItem value="CLOSED">بسته</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجو در موضوع..."
              className="h-9 flex-1"
              aria-label="جستجوی تیکت"
            />
          </div>

          {listLoading ? (
            <LoadingBlock count={4} />
          ) : listError ? (
            <ErrorBanner message={listError} onRetry={() => void loadList()} />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title="تیکتی یافت نشد."
              description="با تغییر فیلتر وضعیت یا جستجو دوباره تلاش کنید."
            />
          ) : (
            <div className="flex max-h-[640px] flex-col gap-2 overflow-y-auto pl-1">
              {tickets.map((t) => {
                const badge = ticketStatusVariant(t.status);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    aria-pressed={selectedId === t.id}
                    className={
                      "flex w-full flex-col gap-1.5 rounded-lg border p-3 text-right transition-colors " +
                      (selectedId === t.id
                        ? "border-primary bg-accent/50"
                        : "bg-card hover:bg-muted/60")
                    }
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{t.subject}</span>
                      <Badge variant={badge.variant} className={badge.className}>
                        {TICKET_STATUS_LABEL[t.status] ?? t.status}
                      </Badge>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {t.priority === "HIGH" ? (
                        <span className="rounded border border-destructive/40 px-1.5 py-0.5 text-destructive">
                          فوری
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="size-3.5" aria-hidden />
                        {(t._count?.messages ?? 0).toLocaleString("fa-IR")}
                      </span>
                      <span className="truncate">{ticketUser(t)}</span>
                      <span className="shrink-0">{faDate(t.createdAt)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ستون جزئیات */}
        <div
          className={
            "flex-col gap-4 " + (selectedId ? "flex flex-col" : "hidden lg:flex")
          }
        >
          {detailLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center p-10">
                <Spinner className="size-6" />
              </CardContent>
            </Card>
          ) : detailError ? (
            <ErrorBanner message={detailError} onRetry={() => void loadDetail()} />
          ) : !detail ? (
            <EmptyState
              icon={MessageSquare}
              title="یک تیکت را انتخاب کنید."
              description="برای دیدن گفتگو و پاسخ، از فهرست سمت راست یک تیکت را انتخاب کنید."
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
                {/* سرصفحه */}
                <div className="flex items-start gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0 lg:hidden"
                    onClick={() => setSelectedId(null)}
                    aria-label="بازگشت به فهرست"
                  >
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold leading-snug">{detail.subject}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{ticketUser(detail)}</span>
                      {detail.user?.deviceId ? (
                        <span dir="ltr" className="font-mono">
                          {detail.user.deviceId}
                        </span>
                      ) : null}
                      {detail.category ? (
                        <span>
                          دسته: {CATEGORY_LABEL[detail.category] ?? detail.category}
                        </span>
                      ) : null}
                      <span>{faDate(detail.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* کنترل‌ها */}
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit ? (
                    <>
                      <Select
                        value={detail.status}
                        onValueChange={(v) => void patchTicket({ status: v })}
                      >
                        <SelectTrigger className="h-9 w-32" aria-label="تغییر وضعیت">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TICKET_STATUS_LABEL).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={detail.priority}
                        onValueChange={(v) => void patchTicket({ priority: v })}
                      >
                        <SelectTrigger className="h-9 w-28" aria-label="تغییر اولویت">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TICKET_PRIORITY_LABEL).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  ) : (
                    <Badge variant="secondary">
                      {TICKET_STATUS_LABEL[detail.status] ?? detail.status}
                    </Badge>
                  )}
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-9 text-destructive hover:text-destructive"
                      onClick={() => setDeleteOpen(true)}
                      aria-label="حذف تیکت"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>

                {/* رشته پیام‌ها */}
                <div
                  className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded-lg border bg-muted/30 p-3"
                  aria-label="گفتگوی تیکت"
                >
                  {detail.messages.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      پیامی ثبت نشده است.
                    </div>
                  ) : (
                    detail.messages.map((m) => {
                      const isAdmin = m.author === "ADMIN";
                      return (
                        <div
                          key={m.id}
                          className={
                            "flex max-w-[85%] flex-col gap-1 rounded-xl px-3 py-2 " +
                            (isAdmin
                              ? "self-end bg-primary text-primary-foreground"
                              : "self-start border bg-muted")
                          }
                        >
                          <span className="text-xs opacity-80">
                            {m.authorName ?? (isAdmin ? "پشتیبانی" : "کاربر")}
                          </span>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed">
                            {m.body}
                          </div>
                          <span className="text-[10px] opacity-70">
                            {faDate(m.createdAt)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* پاسخ */}
                {canEdit ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      placeholder="پاسخ خود را بنویسید..."
                      className="flex-1"
                      aria-label="متن پاسخ"
                    />
                    <Button
                      className="h-9 sm:w-28"
                      onClick={() => void sendReply()}
                      disabled={!reply.trim() || sending}
                    >
                      {sending ? <Spinner /> : <Send className="size-4" aria-hidden />}
                      ارسال پاسخ
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* تایید حذف تیکت */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف تیکت"
        description={`تیکت «${detail?.subject ?? ""}» حذف شود؟ این عملیات بازگشت‌پذیر نیست.`}
        onConfirm={() => void doDelete()}
        loading={deleting}
      />
    </div>
  );
}
