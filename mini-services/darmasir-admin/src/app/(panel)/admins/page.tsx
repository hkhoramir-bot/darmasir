"use client";

// مدیران — فقط برای مدیر کل؛ مدیریت حساب‌ها و رویدادهای امنیتی (audit)

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  ACTION_LABEL,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingBlock,
  PageHeader,
  ROLE_LABEL,
  Spinner,
  faDate,
  useAdmin,
  type AdminUserT,
  type AuditItemT,
} from "@/components/panel-kit";
import type { Role } from "@/lib/roles";

type FormState = {
  username: string;
  name: string;
  role: Role;
  password: string;
};

const EMPTY_FORM: FormState = { username: "", name: "", role: "VIEWER", password: "" };

export default function AdminsPage() {
  const { admin: me, loading: meLoading } = useAdmin();

  const [admins, setAdmins] = useState<AdminUserT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // رویدادهای امنیتی
  const [audit, setAudit] = useState<AuditItemT[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUserT | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AdminUserT | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isSuper = me?.role === "SUPERADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiFetch<AdminUserT[]>("/api/v1/admins");
      setAdmins(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "بارگذاری مدیران ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditError(null);
    try {
      const d = await apiFetch<{ items: AuditItemT[] }>(
        "/api/v1/audit?page=1&pageSize=15"
      );
      setAudit(d.items ?? []);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "بارگذاری رویدادها ناموفق بود.");
    }
  }, []);

  useEffect(() => {
    if (me && me.role === "SUPERADMIN") {
      void load();
      void loadAudit();
    }
  }, [me, load, loadAudit]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(a: AdminUserT) {
    setEditing(a);
    setForm({ username: a.username, name: a.name, role: a.role, password: "" });
    setDialogOpen(true);
  }

  async function submit() {
    if (!isSuper) return;
    if (!form.username.trim() || !form.name.trim()) {
      toast.error("نام کاربری و نام مدیر الزامی است.");
      return;
    }
    if (form.password.trim() && form.password.length < 8) {
      toast.error("گذرواژه باید حداقل ۸ نویسه باشد.");
      return;
    }
    if (!editing && !form.password.trim()) {
      toast.error("برای مدیر جدید، گذرواژه الزامی است.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = {
          name: form.name.trim(),
          role: form.role,
        };
        if (form.password.trim()) payload.password = form.password;
        await apiFetch(`/api/v1/admins/${encodeURIComponent(editing.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("مدیر بروزرسانی شد.");
      } else {
        await apiFetch("/api/v1/admins", {
          method: "POST",
          body: JSON.stringify({
            username: form.username.trim(),
            name: form.name.trim(),
            role: form.role,
            password: form.password,
          }),
        });
        toast.success("مدیر جدید ایجاد شد.");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ذخیره مدیر ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a: AdminUserT, active: boolean) {
    if (!isSuper) return;
    setSavingId(a.id);
    try {
      await apiFetch(`/api/v1/admins/${encodeURIComponent(a.id)}`, {
        method: "PUT",
        body: JSON.stringify({ active }),
      });
      toast.success(active ? "حساب فعال شد." : "حساب غیرفعال شد.");
      setAdmins((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, active } : x))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تغییر وضعیت ناموفق بود.");
    } finally {
      setSavingId(null);
    }
  }

  async function doDelete() {
    if (!deleteTarget || !isSuper) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/admins/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      toast.success("مدیر حذف شد.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف مدیر ناموفق بود.");
    } finally {
      setDeleting(false);
    }
  }

  if (meLoading) {
    return (
      <div>
        <PageHeader title="مدیران" description="مدیریت حساب‌های پنل مدیریت" />
        <LoadingBlock count={4} />
      </div>
    );
  }

  if (!isSuper) {
    return (
      <div>
        <PageHeader title="مدیران" description="مدیریت حساب‌های پنل مدیریت" />
        <EmptyState
          icon={ShieldOff}
          title="دسترسی محدود"
          description="این بخش فقط برای مدیر کل است."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="مدیران"
        description="مدیریت حساب‌های پنل مدیریت و رویدادهای امنیتی"
        actions={
          <Button className="h-9" onClick={openCreate}>
            <Plus className="size-4" aria-hidden />
            مدیر جدید
          </Button>
        }
      />

      {loading ? (
        <LoadingBlock count={4} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void load()} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>نام</TableHead>
                    <TableHead>نقش</TableHead>
                    <TableHead>نشست‌های فعال</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>عضویت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.map((a) => {
                    const isSelf = a.id === me?.id;
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{a.name}</span>
                            <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                              {a.username}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              a.role === "SUPERADMIN"
                                ? "default"
                                : a.role === "OPERATOR"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {ROLE_LABEL[a.role] ?? a.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {(a._count?.sessions ?? 0).toLocaleString("fa-IR")}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={a.active}
                            disabled={isSelf || savingId === a.id}
                            onCheckedChange={(v) => void toggleActive(a, v)}
                            aria-label={`فعال/غیرفعال ${a.name}`}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {faDate(a.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9"
                              onClick={() => openEdit(a)}
                              aria-label={`ویرایش ${a.name}`}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(a)}
                              disabled={isSelf}
                              aria-label={`حذف ${a.name}`}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* رویدادهای امنیتی */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">رویدادهای امنیتی</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {auditError ? (
              <div className="px-6 pb-4">
                <ErrorBanner message={auditError} onRetry={() => void loadAudit()} />
              </div>
            ) : audit.length === 0 ? (
              <div className="px-6 pb-6">
                <EmptyState icon={ShieldOff} title="رویدادی ثبت نشده است." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>عملیات</TableHead>
                      <TableHead>مدیر</TableHead>
                      <TableHead>موجودیت</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>زمان</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm font-medium">
                          {ACTION_LABEL[a.action] ?? a.action}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {a.adminName ?? "—"}
                        </TableCell>
                        <TableCell dir="ltr" className="text-xs text-muted-foreground">
                          {a.entity ?? "—"}
                        </TableCell>
                        <TableCell dir="ltr" className="font-mono text-xs text-muted-foreground">
                          {a.ip ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {faDate(a.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* گفتگوی ایجاد/ویرایش مدیر */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? `ویرایش «${editing.name}»` : "مدیر جدید"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            {!editing ? (
              <Field label="نام کاربری">
                <Input
                  dir="ltr"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  className="h-9"
                  placeholder="operator1"
                />
              </Field>
            ) : null}
            <Field label="نام و نام‌خانوادگی">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9"
              />
            </Field>
            <Field label="نقش">
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={editing ? "گذرواژه جدید" : "گذرواژه"}
              hint={
                editing
                  ? "در صورت خالی بودن، گذرواژه تغییر نمی‌کند."
                  : "حداقل ۸ نویسه"
              }
            >
              <Input
                dir="ltr"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="h-9"
                autoComplete="new-password"
              />
            </Field>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              لغو
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? <Spinner /> : null}
              ذخیره
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
        title="حذف مدیر"
        description={`حساب «${deleteTarget?.name ?? ""}» حذف شود؟ این عملیات بازگشت‌پذیر نیست.`}
        onConfirm={() => void doDelete()}
        loading={deleting}
      />
    </div>
  );
}
