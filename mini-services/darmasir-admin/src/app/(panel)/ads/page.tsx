"use client";

// تبلیغات — فهرست کارتی با فیلتر جایگاه/وضعیت، ایجاد/ویرایش و حذف

import { useCallback, useEffect, useState } from "react";
import { Eye, Megaphone, MousePointerClick, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Field,
  LoadingBlock,
  PageHeader,
  PLACEMENT_LABEL,
  Spinner,
  faDate,
  useAdmin,
  type AdT,
} from "@/components/panel-kit";

type FormState = {
  title: string;
  body: string;
  imageUrl: string;
  linkUrl: string;
  placement: string;
  active: boolean;
  startsAt: string; // مقدار datetime-local
  endsAt: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  body: "",
  imageUrl: "",
  linkUrl: "",
  placement: "HOME_BANNER",
  active: false,
  startsAt: "",
  endsAt: "",
};

/** ISO → مقدار datetime-local با منطقه زمانی محلی مرورگر */
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** مقدار datetime-local → ISO (اگر خالی، حذف فیلد از payload) */
function localInputToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export default function AdsPage() {
  const { admin } = useAdmin();
  const role = admin?.role ?? null;
  const canEdit = role === "SUPERADMIN" || role === "OPERATOR";
  const canDelete = role === "SUPERADMIN";

  const [ads, setAds] = useState<AdT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [placementFilter, setPlacementFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdT | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdT | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (placementFilter !== "all") params.set("placement", placementFilter);
      if (activeFilter !== "all") params.set("active", activeFilter);
      const d = await apiFetch<AdT[]>(`/api/v1/ads?${params.toString()}`);
      setAds(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "بارگذاری تبلیغات ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, [placementFilter, activeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(a: AdT) {
    setEditing(a);
    setForm({
      title: a.title,
      body: a.body ?? "",
      imageUrl: a.imageUrl ?? "",
      linkUrl: a.linkUrl ?? "",
      placement: a.placement,
      active: a.active,
      startsAt: isoToLocalInput(a.startsAt),
      endsAt: isoToLocalInput(a.endsAt),
    });
    setDialogOpen(true);
  }

  async function submit() {
    if (!canEdit) return;
    if (!form.title.trim()) {
      toast.error("عنوان تبلیغ الزامی است.");
      return;
    }
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      body: form.body.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      linkUrl: form.linkUrl.trim() || null,
      placement: form.placement,
      active: form.active,
    };
    const starts = localInputToIso(form.startsAt);
    if (starts) payload.startsAt = starts;
    const ends = localInputToIso(form.endsAt);
    if (ends) payload.endsAt = ends;

    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/v1/ads/${encodeURIComponent(editing.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("تبلیغ بروزرسانی شد.");
      } else {
        await apiFetch("/api/v1/ads", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("تبلیغ جدید ایجاد شد.");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ذخیره تبلیغ ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/ads/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      toast.success("تبلیغ حذف شد.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف تبلیغ ناموفق بود.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="تبلیغات"
        description="مدیریت بنرها و تبلیغات درون اپلیکیشن"
        actions={
          canEdit ? (
            <Button className="h-9" onClick={openCreate}>
              <Plus className="size-4" aria-hidden />
              تبلیغ جدید
            </Button>
          ) : null
        }
      />

      {/* نوار ابزار */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={placementFilter} onValueChange={setPlacementFilter}>
          <SelectTrigger className="h-9 w-40" aria-label="فیلتر جایگاه">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه جایگاه‌ها</SelectItem>
            {Object.entries(PLACEMENT_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="h-9 w-32" aria-label="فیلتر وضعیت">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه</SelectItem>
            <SelectItem value="true">فعال</SelectItem>
            <SelectItem value="false">غیرفعال</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {ads.length.toLocaleString("fa-IR")} تبلیغ
        </span>
      </div>

      {loading ? (
        <LoadingBlock count={6} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void load()} />
      ) : ads.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="تبلیغی یافت نشد."
          description="اولین تبلیغ را بسازید تا در اپلیکیشن نمایش داده شود."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ads.map((a) => (
            <Card key={a.id} className="flex flex-col gap-3 p-4">
              {a.imageUrl ? (
                <img
                  src={a.imageUrl}
                  alt={a.title}
                  className="h-36 w-full rounded-lg object-cover"
                  loading="lazy"
                />
              ) : null}
              <div className="flex flex-col gap-2">
                <h3 className="font-bold leading-snug">{a.title}</h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">
                    {PLACEMENT_LABEL[a.placement] ?? a.placement}
                  </Badge>
                  <Badge variant={a.active ? "default" : "outline"}>
                    {a.active ? "فعال" : "غیرفعال"}
                  </Badge>
                </div>
              </div>
              {a.body ? (
                <p className="line-clamp-2 text-sm text-muted-foreground">{a.body}</p>
              ) : null}
              <div className="text-xs text-muted-foreground">
                بازه:{" "}
                {a.startsAt || a.endsAt
                  ? `${faDate(a.startsAt)} تا ${faDate(a.endsAt)}`
                  : "همیشه"}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-4" aria-hidden />
                  {a.views.toLocaleString("fa-IR")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MousePointerClick className="size-4" aria-hidden />
                  {a.clicks.toLocaleString("fa-IR")}
                </span>
              </div>
              {a.linkUrl ? (
                <div dir="ltr" className="truncate text-xs text-muted-foreground">
                  {a.linkUrl}
                </div>
              ) : null}
              <div className="mt-auto flex items-center justify-end gap-1 border-t pt-3">
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    onClick={() => openEdit(a)}
                    aria-label={`ویرایش ${a.title}`}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(a)}
                    aria-label={`حذف ${a.title}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
                {!canEdit && !canDelete ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* گفتگوی ایجاد/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `ویرایش «${editing.title}»` : "تبلیغ جدید"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="عنوان">
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="h-9"
              />
            </Field>
            <Field label="متن">
              <Textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={3}
              />
            </Field>
            <Field label="نشانی تصویر">
              <Input
                dir="ltr"
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                className="h-9"
                placeholder="https://..."
              />
            </Field>
            <Field label="نشانی مقصد (لینک)">
              <Input
                dir="ltr"
                value={form.linkUrl}
                onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                className="h-9"
                placeholder="https://..."
              />
            </Field>

            <Field label="جایگاه">
              <Select
                value={form.placement}
                onValueChange={(v) => setForm((f) => ({ ...f, placement: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLACEMENT_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                id="ad-active"
              />
              <label htmlFor="ad-active" className="text-sm font-medium">
                فعال
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="شروع نمایش">
                <Input
                  dir="ltr"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  className="h-9"
                />
              </Field>
              <Field label="پایان نمایش">
                <Input
                  dir="ltr"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                  className="h-9"
                />
              </Field>
            </div>
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
        title="حذف تبلیغ"
        description={`تبلیغ «${deleteTarget?.title ?? ""}» حذف شود؟ این عملیات بازگشت‌پذیر نیست.`}
        onConfirm={() => void doDelete()}
        loading={deleting}
      />
    </div>
  );
}
