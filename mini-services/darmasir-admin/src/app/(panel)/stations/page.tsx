"use client";

// ایستگاه‌ها — فهرست با فیلتر شهر/خط و جستجو، ایجاد/ویرایش کامل، حذف (فقط مدیر کل)

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Pencil, Plus, Star, Trash2, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
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
  AMENITY_KEYS,
  AMENITY_LABEL,
  CITY_LABEL,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingBlock,
  PageHeader,
  Spinner,
  useAdmin,
  type LineT,
  type StationLineRefT,
  type StationT,
} from "@/components/panel-kit";

type FormState = {
  id: string;
  name: string;
  cityId: string;
  featured: boolean;
  lat: string;
  lng: string;
};

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  cityId: "tehran",
  featured: false,
  lat: "",
  lng: "",
};

function floatOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export default function StationsPage() {
  const { admin } = useAdmin();
  const role = admin?.role ?? null;
  const canEdit = role === "SUPERADMIN" || role === "OPERATOR";
  const canDelete = role === "SUPERADMIN";

  const [stations, setStations] = useState<StationT[]>([]);
  const [lines, setLines] = useState<LineT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [lineFilter, setLineFilter] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StationT | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [formLines, setFormLines] = useState<StationLineRefT[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<StationT | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // خطوط برای نمایش رنگ/شماره و فیلتر خط — یک‌بار با ایستگاه‌ها می‌آید
      const [st, ln] = await Promise.all([
        apiFetch<StationT[]>("/api/v1/stations"),
        apiFetch<LineT[]>("/api/v1/lines"),
      ]);
      setStations(st);
      setLines(ln);
    } catch (e) {
      setError(e instanceof Error ? e.message : "بارگذاری ایستگاه‌ها ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lineMap = useMemo(
    () => new Map(lines.map((l) => [l.id, l] as const)),
    [lines]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stations.filter((s) => {
      if (cityFilter !== "all" && s.cityId !== cityFilter) return false;
      if (lineFilter !== "all" && !s.lines.some((r) => r.lineId === lineFilter))
        return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
    });
  }, [stations, search, cityFilter, lineFilter]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setAmenities([]);
    setFormLines([]);
    setDialogOpen(true);
  }

  function openEdit(s: StationT) {
    setEditing(s);
    setForm({
      id: s.id,
      name: s.name,
      cityId: s.cityId,
      featured: s.featured,
      lat: s.lat == null ? "" : String(s.lat),
      lng: s.lng == null ? "" : String(s.lng),
    });
    setAmenities([...(s.amenities ?? [])]);
    setFormLines(
      [...(s.lines ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((r) => ({ lineId: r.lineId, order: r.order }))
    );
    setDialogOpen(true);
  }

  function toggleAmenity(key: string) {
    setAmenities((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]
    );
  }

  function updateLineRef(idx: number, patch: Partial<StationLineRefT>) {
    setFormLines((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function submit() {
    if (!canEdit) return;
    if (!form.id.trim() || !form.name.trim()) {
      toast.error("شناسه و نام ایستگاه الزامی است.");
      return;
    }
    const validLines = formLines.filter((r) => r.lineId.trim());
    if (validLines.length === 0) {
      toast.error("حداقل یک خط به ایستگاه متصل کنید.");
      return;
    }

    const payload: Record<string, unknown> = {
      id: form.id.trim(),
      name: form.name.trim(),
      cityId: form.cityId,
      featured: form.featured,
      lat: floatOrNull(form.lat),
      lng: floatOrNull(form.lng),
      amenities,
      lines: validLines.map((r) => ({
        lineId: r.lineId.trim(),
        order: Number(r.order) || 0,
      })),
    };

    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/v1/stations/${encodeURIComponent(editing.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("ایستگاه بروزرسانی شد.");
      } else {
        await apiFetch("/api/v1/stations", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("ایستگاه جدید ایجاد شد.");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ذخیره ایستگاه ناموفق بود.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/stations/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      toast.success("ایستگاه حذف شد.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف ایستگاه ناموفق بود.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="ایستگاه‌ها"
        description="مدیریت ایستگاه‌ها، امکانات و اتصال خطوط"
        actions={
          canEdit ? (
            <Button className="h-9" onClick={openCreate}>
              <Plus className="size-4" aria-hidden />
              ایستگاه جدید
            </Button>
          ) : null
        }
      />

      {/* نوار ابزار */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجوی نام ایستگاه..."
          className="h-9 w-full sm:w-64"
          aria-label="جستجوی ایستگاه"
        />
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="h-9 w-36" aria-label="فیلتر شهر">
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
        <Select value={lineFilter} onValueChange={setLineFilter}>
          <SelectTrigger className="h-9 w-44" aria-label="فیلتر خط">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه خطوط</SelectItem>
            {lines.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {CITY_LABEL[l.cityId] ?? l.cityId} — خط {l.number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filtered.length.toLocaleString("fa-IR")} ایستگاه
        </span>
      </div>

      {loading ? (
        <LoadingBlock count={8} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void load()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="ایستگاهی یافت نشد."
          description={
            stations.length === 0
              ? "هنوز ایستگاهی ثبت نشده است؛ اولین ایستگاه را بسازید."
              : "با تغییر جستجو یا فیلترها دوباره تلاش کنید."
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[520px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>نام</TableHead>
                    <TableHead>شناسه</TableHead>
                    <TableHead>خطوط</TableHead>
                    <TableHead>شهر</TableHead>
                    <TableHead>امکانات</TableHead>
                    <TableHead>مختصات</TableHead>
                    <TableHead>ویژه</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => {
                    const amenityLabels = (s.amenities ?? []).map(
                      (a) => AMENITY_LABEL[a] ?? a
                    );
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell dir="ltr" className="font-mono text-xs text-muted-foreground">
                          {s.id}
                        </TableCell>
                        <TableCell>
                          {s.lines.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {[...s.lines]
                                .sort((a, b) => a.order - b.order)
                                .map((r) => {
                                  const line = lineMap.get(r.lineId);
                                  return (
                                    <span
                                      key={r.lineId}
                                      className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs"
                                    >
                                      <span
                                        className="size-2 rounded-full"
                                        style={{
                                          background:
                                            line?.color ?? "var(--muted-foreground)",
                                        }}
                                        aria-hidden
                                      />
                                      {line ? `خط ${line.number}` : r.lineId}
                                    </span>
                                  );
                                })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{CITY_LABEL[s.cityId] ?? s.cityId}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {amenityLabels.length === 0
                            ? "—"
                            : amenityLabels.slice(0, 3).join("، ") +
                              (amenityLabels.length > 3
                                ? ` +${(amenityLabels.length - 3).toLocaleString("fa-IR")}`
                                : "")}
                        </TableCell>
                        <TableCell dir="ltr" className="font-mono text-xs text-muted-foreground">
                          {s.lat != null && s.lng != null
                            ? `${s.lat.toFixed(3)}, ${s.lng.toFixed(3)}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {s.featured ? (
                            <Star className="size-4 fill-amber-400 text-amber-400" aria-label="ایستگاه ویژه" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {canEdit ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-9"
                                onClick={() => openEdit(s)}
                                aria-label={`ویرایش ${s.name}`}
                              >
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-9 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(s)}
                                aria-label={`حذف ${s.name}`}
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
            <DialogTitle>
              {editing ? `ویرایش «${editing.name}»` : "ایستگاه جدید"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="شناسه ایستگاه" hint="مثل tajrish — همان شناسه اپلیکیشن">
              <Input
                dir="ltr"
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                disabled={!!editing}
                className="h-9"
                placeholder="tajrish"
              />
            </Field>
            <Field label="نام ایستگاه">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9"
                placeholder="تجریش"
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
            <div className="flex items-end gap-2 pb-0.5">
              <div className="flex h-9 items-center gap-2 text-sm">ایستگاه ویژه</div>
              <Switch
                checked={form.featured}
                onCheckedChange={(v) => setForm((f) => ({ ...f, featured: v }))}
                aria-label="ایستگاه ویژه"
              />
            </div>

            <Field label="عرض جغرافیایی (lat)">
              <Input
                dir="ltr"
                type="number"
                step="any"
                value={form.lat}
                onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                className="h-9"
                placeholder="35.7876"
              />
            </Field>
            <Field label="طول جغرافیایی (lng)">
              <Input
                dir="ltr"
                type="number"
                step="any"
                value={form.lng}
                onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                className="h-9"
                placeholder="51.4340"
              />
            </Field>
          </div>

          <Field label="امکانات">
            <div className="flex flex-wrap gap-2">
              {AMENITY_KEYS.map((key) => {
                const on = amenities.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleAmenity(key)}
                    aria-pressed={on}
                    className={
                      "h-9 rounded-full border px-3 text-sm transition-colors " +
                      (on
                        ? "border-primary bg-accent text-accent-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted")
                    }
                  >
                    {AMENITY_LABEL[key]}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="خطوط عبوری" hint="هر خط با ترتیب ایستگاه روی آن خط">
            <div className="flex flex-col gap-2">
              {formLines.map((ref, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={ref.lineId}
                    onValueChange={(v) => updateLineRef(idx, { lineId: v })}
                  >
                    <SelectTrigger className="h-9 flex-1" aria-label="انتخاب خط">
                      <SelectValue placeholder="انتخاب خط" />
                    </SelectTrigger>
                    <SelectContent>
                      {lines.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {CITY_LABEL[l.cityId] ?? l.cityId} — خط {l.number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    dir="ltr"
                    type="number"
                    value={String(ref.order)}
                    onChange={(e) =>
                      updateLineRef(idx, { order: Number(e.target.value) || 0 })
                    }
                    className="h-9 w-20 shrink-0"
                    aria-label="ترتیب ایستگاه روی خط"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 text-destructive hover:text-destructive"
                    onClick={() =>
                      setFormLines((prev) => prev.filter((_, i) => i !== idx))
                    }
                    aria-label="حذف خط از ایستگاه"
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() =>
                    setFormLines((prev) => [...prev, { lineId: "", order: prev.length + 1 }])
                  }
                >
                  <Plus className="size-4" aria-hidden />
                  افزودن خط
                </Button>
              </div>
            </div>
          </Field>

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
        title="حذف ایستگاه"
        description={`ایستگاه «${deleteTarget?.name ?? ""}» حذف شود؟ این عملیات بازگشت‌پذیر نیست.`}
        onConfirm={() => void doDelete()}
        loading={deleting}
      />
    </div>
  );
}
