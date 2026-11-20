"use client";

// کاربران اپ — فهرست کاربران اپلیکیشن با جستجوی سروری، فیلتر مسدود،
// مسدودسازی/رفع مسدودی و حذف (فقط مدیر کل)

import { useCallback, useEffect, useState } from "react";
import { Ban, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/client";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingBlock,
  PageHeader,
  Spinner,
  faDate,
  useAdmin,
  type AppUserT,
} from "@/components/panel-kit";

const PAGE_SIZE = 200;

export default function UsersPage() {
  const { admin } = useAdmin();
  const role = admin?.role ?? null;
  const canEdit = role === "SUPERADMIN" || role === "OPERATOR";
  const canDelete = role === "SUPERADMIN";

  const [items, setItems] = useState<AppUserT[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [qQuery, setQQuery] = useState("");
  const [bannedFilter, setBannedFilter] = useState("all");

  // گفتگوی مسدودسازی
  const [banTarget, setBanTarget] = useState<AppUserT | null>(null);
  const [banReason, setBanReason] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AppUserT | null>(null);
  const [deleting, setDeleting] = useState(false);

  // جستجوی تاخیری تا با هر حرف درخواست نزنیم
  useEffect(() => {
    const t = setTimeout(() => setQQuery(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [qQuery, bannedFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (qQuery.trim()) params.set("q", qQuery.trim());
      if (bannedFilter !== "all") params.set("banned", bannedFilter);
      params.set("page", String(page));
      const d = await apiFetch<{ items: AppUserT[]; total: number }>(
        `/api/v1/users?${params.toString()}`
      );
      setItems(d.items ?? []);
      setTotal(d.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "بارگذاری کاربران ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, [qQuery, bannedFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function unban(u: AppUserT) {
    if (!canEdit) return;
    try {
      await apiFetch(`/api/v1/users/${encodeURIComponent(u.id)}`, {
        method: "PUT",
        body: JSON.stringify({ banned: false, banReason: null }),
      });
      toast.success("مسدودی کاربر برداشته شد.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "عملیات ناموفق بود.");
    }
  }

  async function submitBan() {
    if (!banTarget || !canEdit) return;
    setSaving(true);
    try {
      await apiFetch(`/api/v1/users/${encodeURIComponent(banTarget.id)}`, {
        method: "PUT",
        body: JSON.stringify({ banned: true, banReason: banReason.trim() || null }),
      });
      toast.success("کاربر مسدود شد.");
      setBanTarget(null);
      setBanReason("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "مسدودسازی ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/users/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      toast.success("کاربر حذف شد.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف کاربر ناموفق بود.");
    } finally {
      setDeleting(false);
    }
  }

  const hasNext = page * PAGE_SIZE < total;

  return (
    <div>
      <PageHeader
        title="کاربران اپ"
        description="کاربران اپلیکیشن درمسیر و وضعیت دسترسی آن‌ها"
      />

      {/* نوار ابزار */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجوی نام یا شناسه دستگاه..."
          className="h-9 w-full sm:w-64"
          aria-label="جستجوی کاربر"
        />
        <Select value={bannedFilter} onValueChange={setBannedFilter}>
          <SelectTrigger className="h-9 w-36" aria-label="فیلتر وضعیت">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه کاربران</SelectItem>
            <SelectItem value="false">فعال</SelectItem>
            <SelectItem value="true">مسدود</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          مجموع: {total.toLocaleString("fa-IR")} کاربر
        </span>
      </div>

      {loading ? (
        <LoadingBlock count={6} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="هنوز کاربری ثبت نشده"
          description="به‌محض ورود کاربران به اپلیکیشن درمسیر، فهرست آن‌ها اینجا نمایش داده می‌شود."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>کاربر</TableHead>
                    <TableHead>پلتفرم</TableHead>
                    <TableHead>نسخه</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>آخرین بازدید</TableHead>
                    <TableHead>عضویت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{u.name || "بدون نام"}</span>
                          <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                            {u.deviceId}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell dir="ltr" className="text-sm text-muted-foreground">
                        {u.platform || "—"}
                      </TableCell>
                      <TableCell dir="ltr" className="text-sm text-muted-foreground">
                        {u.appVersion || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={u.active ? "default" : "secondary"}>
                            {u.active ? "فعال" : "غیرفعال"}
                          </Badge>
                          {u.banned ? (
                            <Badge
                              variant="destructive"
                              title={u.banReason ? `دلیل: ${u.banReason}` : undefined}
                            >
                              مسدود
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {faDate(u.lastSeenAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {faDate(u.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {canEdit ? (
                            u.banned ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9"
                                onClick={() => void unban(u)}
                              >
                                رفع مسدودی
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-9"
                                onClick={() => {
                                  setBanTarget(u);
                                  setBanReason("");
                                }}
                                aria-label={`مسدودسازی ${u.name || "کاربر"}`}
                              >
                                <Ban className="size-4" aria-hidden />
                              </Button>
                            )
                          ) : null}
                          {canDelete ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(u)}
                              aria-label="حذف کاربر"
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          ) : null}
                          {!canEdit && !canDelete ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* صفحه‌بندی ساده */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">
                مجموع: {total.toLocaleString("fa-IR")} کاربر
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  قبلی
                </Button>
                <span className="text-sm text-muted-foreground">
                  صفحه {page.toLocaleString("fa-IR")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={!hasNext || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  بعدی
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* گفتگوی مسدودسازی */}
      <Dialog
        open={!!banTarget}
        onOpenChange={(o) => {
          if (!o) {
            setBanTarget(null);
            setBanReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              مسدودسازی {banTarget?.name || "کاربر"}
            </DialogTitle>
          </DialogHeader>
          <Field label="دلیل مسدودسازی" hint="اختیاری — در اپ به کاربر نمایش داده می‌شود">
            <Textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              rows={3}
              placeholder="دلیل را بنویسید..."
            />
          </Field>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setBanTarget(null);
                setBanReason("");
              }}
              disabled={saving}
            >
              لغو
            </Button>
            <Button variant="destructive" onClick={() => void submitBan()} disabled={saving}>
              {saving ? <Spinner /> : null}
              مسدودسازی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تایید حذف */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title="حذف کاربر"
        description={`کاربر «${deleteTarget?.name || deleteTarget?.deviceId || ""}» حذف شود؟ این عملیات بازگشت‌پذیر نیست.`}
        onConfirm={() => void doDelete()}
        loading={deleting}
      />
    </div>
  );
}
