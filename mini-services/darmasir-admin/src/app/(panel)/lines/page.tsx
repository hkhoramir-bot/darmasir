"use client";

// خطوط — فهرست، جستجو و فیلتر شهر، ایجاد/ویرایش کامل، حذف (فقط مدیر کل)

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Route, Trash2 } from "lucide-react";
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
  CITY_LABEL,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingBlock,
  PageHeader,
  STATUS_LABEL,
  Spinner,
  lineStatusVariant,
  useAdmin,
  type LineT,
} from "@/components/panel-kit";

type FormState = {
  id: string;
  cityId: string;
  number: string;
  name: string;
  color: string;
  textOnColor: string;
  terminal1: string;
  terminal2: string;
  direction: string;
  headway: string;
  headwayPeak: string;
  headwayOff: string;
  firstTrain: string;
  lastTrain: string;
  segmentMinutes: string;
  badges: string;
  status: string;
  statusNote: string;
};

const EMPTY_FORM: FormState = {
  id: "",
  cityId: "tehran",
  number: "1",
  name: "",
  color: "#0d9484",
  textOnColor: "#ffffff",
  terminal1: "",
  terminal2: "",
  direction: "",
  headway: "10",
  headwayPeak: "",
  headwayOff: "",
  firstTrain: "05:30",
  lastTrain: "22:30",
  segmentMinutes: "2.5",
  badges: "",
  status: "normal",
  statusNote: "",
};

/** تبدیل رشته به عدد صحیح؛ نامعتبر یا خالی → null */
function intOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** تبدیل رشته به عدد اعشاری؛ نامعتبر یا خالی → null */
function floatOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export default function LinesPage() {
  const { admin } = useAdmin();
  const role = admin?.role ?? null;
  const canEdit = role === "SUPERADMIN" || role === "OPERATOR";
  const canDelete = role === "SUPERADMIN";

  const [lines, setLines] = useState<LineT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LineT | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<LineT | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiFetch<LineT[]>("/api/v1/lines");
      setLines(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "بارگذاری خطوط ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (cityFilter !== "all" && l.cityId !== cityFilter) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) || l.id.toLowerCase().includes(q)
      );
    });
  }, [lines, search, cityFilter]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(l: LineT) {
    setEditing(l);
    setForm({
      id: l.id,
      cityId: l.cityId,
      number: String(l.number),
      name: l.name,
      color: l.color,
      textOnColor: l.textOnColor,
      terminal1: l.terminals[0] ?? "",
      terminal2: l.terminals[1] ?? "",
      direction: l.direction ?? "",
      headway: String(l.headway ?? ""),
      headwayPeak: l.headwayPeak == null ? "" : String(l.headwayPeak),
      headwayOff: l.headwayOff == null ? "" : String(l.headwayOff),
      firstTrain: l.firstTrain,
      lastTrain: l.lastTrain,
      segmentMinutes: String(l.segmentMinutes ?? ""),
      badges: (l.badges ?? []).join(", "),
      status: l.status,
      statusNote: l.statusNote ?? "",
    });
    setDialogOpen(true);
  }

  async function submit() {
    if (!canEdit) return;
    if (!form.id.trim() || !form.name.trim() || !form.number.trim()) {
      toast.error("شناسه، شماره و نام خط الزامی است.");
      return;
    }
    const number = intOrNull(form.number);
    if (number == null) {
      toast.error("شماره خط باید عدد باشد.");
      return;
    }
    const segmentMinutes = floatOrNull(form.segmentMinutes);
    if (segmentMinutes == null) {
      toast.error("زمان بین ایستگاه‌ها باید عدد باشد.");
      return;
    }

    const badgeList = form.badges
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      id: form.id.trim(),
      cityId: form.cityId,
      number,
      name: form.name.trim(),
      color: form.color.trim() || "#0d9484",
      textOnColor: form.textOnColor.trim() || "#ffffff",
      terminals: [form.terminal1.trim(), form.terminal2.trim()].filter(Boolean),
      direction: form.direction.trim(),
      headway: intOrNull(form.headway) ?? 10,
      headwayPeak: intOrNull(form.headwayPeak),
      headwayOff: intOrNull(form.headwayOff),
      firstTrain: form.firstTrain.trim() || "05:30",
      lastTrain: form.lastTrain.trim() || "22:30",
      segmentMinutes,
      status: form.status,
      statusNote: form.statusNote.trim() || null,
    };
    if (badgeList.length > 0) payload.badges = badgeList;

    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/v1/lines/${encodeURIComponent(editing.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("خط بروزرسانی شد.");
      } else {
        await apiFetch("/api/v1/lines", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("خط جدید ایجاد شد.");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ذخیره خط ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/lines/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      toast.success("خط حذف شد.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف خط ناموفق بود.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="خطوط"
        description="مدیریت خطوط حمل‌ونقل شهری در چهار شهر"
        actions={
          canEdit ? (
            <Button className="h-9" onClick={openCreate}>
              <Plus className="size-4" aria-hidden />
              خط جدید
            </Button>
          ) : null
        }
      />

      {/* نوار ابزار */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجو بر اساس نام یا شناسه خط..."
          className="h-9 w-full sm:w-64"
          aria-label="جستجوی خط"
        />
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="h-9 w-40" aria-label="فیلتر شهر">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه شهرها</SelectItem>
            {Object.entries(CITY_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filtered.length.toLocaleString("fa-IR")} خط
        </span>
      </div>

      {loading ? (
        <LoadingBlock count={6} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void load()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Route}
          title="خطی یافت نشد."
          description={
            lines.length === 0
              ? "هنوز خطی ثبت نشده است؛ اولین خط را بسازید."
              : "با تغییر جستجو یا فیلتر شهر دوباره تلاش کنید."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>رنگ</TableHead>
                    <TableHead>نام</TableHead>
                    <TableHead>شهر</TableHead>
                    <TableHead>ترمینال‌ها</TableHead>
                    <TableHead>فاصله حرکت</TableHead>
                    <TableHead>ساعت کار</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => {
                    const badge = lineStatusVariant(l.status);
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="size-4 shrink-0 rounded-full border"
                              style={{ background: l.color }}
                              aria-hidden
                            />
                            <span className="font-bold">{l.number}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{l.name}</TableCell>
                        <TableCell>{CITY_LABEL[l.cityId] ?? l.cityId}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {l.terminals.length > 0 ? l.terminals.join(" ↔ ") : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{l.headway} دقیقه</div>
                          {l.headwayPeak != null || l.headwayOff != null ? (
                            <div className="text-xs text-muted-foreground">
                              اوج {l.headwayPeak ?? l.headway} · غیراوج{" "}
                              {l.headwayOff ?? l.headway}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell dir="ltr" className="text-sm">
                          {l.firstTrain}–{l.lastTrain}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Badge
                              variant={badge.variant}
                              className={badge.className}
                              title={l.statusNote ?? undefined}
                            >
                              {STATUS_LABEL[l.status] ?? l.status}
                            </Badge>
                            {l.status !== "normal" && l.statusNote ? (
                              <span
                                className="max-w-44 truncate text-xs text-muted-foreground"
                                title={l.statusNote}
                              >
                                {l.statusNote}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {canEdit ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-9"
                                onClick={() => openEdit(l)}
                                aria-label={`ویرایش ${l.name}`}
                              >
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-9 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(l)}
                                aria-label={`حذف ${l.name}`}
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
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* گفتگوی ایجاد/ویرایش */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `ویرایش «${editing.name}»` : "خط جدید"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="شناسه خط" hint="مثل l1 — همان شناسه اپلیکیشن">
              <Input
                dir="ltr"
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                disabled={!!editing}
                className="h-9"
                placeholder="l1"
              />
            </Field>
            <Field label="شماره خط">
              <Input
                dir="ltr"
                type="number"
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                className="h-9"
              />
            </Field>

            <Field label="نام خط">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9"
                placeholder="خط ۱ حرم تا قدس"
              />
            </Field>
            <Field label="شهر">
              <Select
                value={form.cityId}
                onValueChange={(v) => setForm((f) => ({ ...f, cityId: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CITY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="رنگ خط">
              <div className="flex gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                  aria-label="انتخاب رنگ خط"
                />
                <Input
                  dir="ltr"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-9 flex-1"
                  placeholder="#d81a3d"
                />
              </div>
            </Field>
            <Field label="رنگ متن روی خط">
              <div className="flex gap-2">
                <input
                  type="color"
                  value={form.textOnColor}
                  onChange={(e) => setForm((f) => ({ ...f, textOnColor: e.target.value }))}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                  aria-label="انتخاب رنگ متن"
                />
                <Input
                  dir="ltr"
                  value={form.textOnColor}
                  onChange={(e) => setForm((f) => ({ ...f, textOnColor: e.target.value }))}
                  className="h-9 flex-1"
                  placeholder="#ffffff"
                />
              </div>
            </Field>

            <Field label="ترمینال اول">
              <Input
                value={form.terminal1}
                onChange={(e) => setForm((f) => ({ ...f, terminal1: e.target.value }))}
                className="h-9"
                placeholder="کهریزک"
              />
            </Field>
            <Field label="ترمینال دوم">
              <Input
                value={form.terminal2}
                onChange={(e) => setForm((f) => ({ ...f, terminal2: e.target.value }))}
                className="h-9"
                placeholder="تجریش"
              />
            </Field>

            <Field label="مسیر">
              <Input
                value={form.direction}
                onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
                className="h-9"
                placeholder="شمال - جنوب"
              />
            </Field>
            <Field label="وضعیت">
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="فاصله حرکت (دقیقه)">
              <Input
                dir="ltr"
                type="number"
                value={form.headway}
                onChange={(e) => setForm((f) => ({ ...f, headway: e.target.value }))}
                className="h-9"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="اوج (دقیقه)">
                <Input
                  dir="ltr"
                  type="number"
                  value={form.headwayPeak}
                  onChange={(e) => setForm((f) => ({ ...f, headwayPeak: e.target.value }))}
                  className="h-9"
                />
              </Field>
              <Field label="غیراوج (دقیقه)">
                <Input
                  dir="ltr"
                  type="number"
                  value={form.headwayOff}
                  onChange={(e) => setForm((f) => ({ ...f, headwayOff: e.target.value }))}
                  className="h-9"
                />
              </Field>
            </div>

            <Field label="اولین قطار">
              <Input
                dir="ltr"
                type="time"
                value={form.firstTrain}
                onChange={(e) => setForm((f) => ({ ...f, firstTrain: e.target.value }))}
                className="h-9"
              />
            </Field>
            <Field label="آخرین قطار">
              <Input
                dir="ltr"
                type="time"
                value={form.lastTrain}
                onChange={(e) => setForm((f) => ({ ...f, lastTrain: e.target.value }))}
                className="h-9"
              />
            </Field>

            <Field label="زمان بین ایستگاه‌ها (دقیقه)">
              <Input
                dir="ltr"
                type="number"
                step="0.1"
                value={form.segmentMinutes}
                onChange={(e) => setForm((f) => ({ ...f, segmentMinutes: e.target.value }))}
                className="h-9"
              />
            </Field>
            <Field label="برچسب‌ها" hint="با ویرگول جدا کنید، مثل: فرودگاه, سری‌السیر">
              <Input
                value={form.badges}
                onChange={(e) => setForm((f) => ({ ...f, badges: e.target.value }))}
                className="h-9"
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="توضیح وضعیت"
                hint="مثلا علت تاخیر یا ازدحام — در اپ نمایش داده می‌شود"
              >
                <Input
                  value={form.statusNote}
                  onChange={(e) => setForm((f) => ({ ...f, statusNote: e.target.value }))}
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
        title="حذف خط"
        description={`خط «${deleteTarget?.name ?? ""}» حذف شود؟ این عملیات بازگشت‌پذیر نیست.`}
        onConfirm={() => void doDelete()}
        loading={deleting}
      />
    </div>
  );
}
