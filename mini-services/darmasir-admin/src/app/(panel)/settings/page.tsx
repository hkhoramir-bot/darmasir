"use client";

// تنظیمات — دو زبانه: «عمومی» (تنظیمات اپ) و «نسخه‌ها» (مدیریت نسخه‌های اپلیکیشن)

import { useCallback, useEffect, useState } from "react";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  type AppVersionT,
  type SettingsMap,
} from "@/components/panel-kit";

type GeneralForm = {
  appName: string;
  tagline: string;
  minVersion: string;
  supportMessage: string;
  notice: string;
  adsEnabled: boolean;
  publicBaseUrl: string;
};

type VersionForm = {
  versionName: string;
  versionCode: string;
  apkUrl: string;
  notes: string;
  mandatory: boolean;
  active: boolean;
};

const EMPTY_VERSION_FORM: VersionForm = {
  versionName: "",
  versionCode: "",
  apkUrl: "",
  notes: "",
  mandatory: false,
  active: true,
};

function generalFromSettings(s: SettingsMap): GeneralForm {
  return {
    appName: s["app.name"] ?? "",
    tagline: s["app.tagline"] ?? "",
    minVersion: s["app.minVersion"] ?? "",
    supportMessage: s["app.supportMessage"] ?? "",
    notice: s["app.notice"] ?? "",
    adsEnabled: s["ads.enabled"] === "true",
    publicBaseUrl: s["api.publicBaseUrl"] ?? "",
  };
}

export default function SettingsPage() {
  const { admin } = useAdmin();
  const role = admin?.role ?? null;
  const canEdit = role === "SUPERADMIN" || role === "OPERATOR";
  const canDelete = role === "SUPERADMIN";

  // عمومی
  const [original, setOriginal] = useState<SettingsMap>({});
  const [general, setGeneral] = useState<GeneralForm>({
    appName: "",
    tagline: "",
    minVersion: "",
    supportMessage: "",
    notice: "",
    adsEnabled: false,
    publicBaseUrl: "",
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // نسخه‌ها
  const [versions, setVersions] = useState<AppVersionT[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<AppVersionT | null>(null);
  const [versionForm, setVersionForm] = useState<VersionForm>(EMPTY_VERSION_FORM);
  const [savingVersion, setSavingVersion] = useState(false);

  const [versionDeleteTarget, setVersionDeleteTarget] = useState<AppVersionT | null>(null);
  const [deletingVersion, setDeletingVersion] = useState(false);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const d = await apiFetch<SettingsMap>("/api/v1/settings");
      setOriginal(d ?? {});
      setGeneral(generalFromSettings(d ?? {}));
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "بارگذاری تنظیمات ناموفق بود.");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const d = await apiFetch<AppVersionT[]>("/api/v1/versions");
      setVersions(d);
    } catch (e) {
      setVersionsError(e instanceof Error ? e.message : "بارگذاری نسخه‌ها ناموفق بود.");
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadVersions();
  }, [loadSettings, loadVersions]);

  async function saveSettings() {
    if (!canEdit) return;
    // کلیدهای ناشناخته هم دست‌نخورده در همان payload برگردند
    const payload: SettingsMap = { ...original };
    payload["app.name"] = general.appName.trim();
    payload["app.tagline"] = general.tagline.trim();
    payload["app.minVersion"] = general.minVersion.trim();
    payload["app.supportMessage"] = general.supportMessage;
    payload["app.notice"] = general.notice;
    payload["ads.enabled"] = general.adsEnabled ? "true" : "false";
    payload["api.publicBaseUrl"] = general.publicBaseUrl.trim();

    setSavingSettings(true);
    try {
      await apiFetch("/api/v1/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setOriginal(payload);
      toast.success("تنظیمات ذخیره شد.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ذخیره تنظیمات ناموفق بود.");
    } finally {
      setSavingSettings(false);
    }
  }

  function openVersionCreate() {
    setEditingVersion(null);
    setVersionForm({ ...EMPTY_VERSION_FORM });
    setVersionDialogOpen(true);
  }

  function openVersionEdit(v: AppVersionT) {
    setEditingVersion(v);
    setVersionForm({
      versionName: v.versionName,
      versionCode: String(v.versionCode),
      apkUrl: v.apkUrl ?? "",
      notes: v.notes ?? "",
      mandatory: v.mandatory,
      active: v.active,
    });
    setVersionDialogOpen(true);
  }

  async function submitVersion() {
    if (!canEdit) return;
    if (!versionForm.versionName.trim()) {
      toast.error("نام نسخه الزامی است.");
      return;
    }
    const code = Number(versionForm.versionCode);
    if (!versionForm.versionCode.trim() || !Number.isFinite(code)) {
      toast.error("کد نسخه باید عدد باشد.");
      return;
    }

    const payload: Record<string, unknown> = {
      versionName: versionForm.versionName.trim(),
      versionCode: Math.round(code),
      apkUrl: versionForm.apkUrl.trim() || null,
      notes: versionForm.notes.trim() || null,
      mandatory: versionForm.mandatory,
      active: versionForm.active,
    };

    setSavingVersion(true);
    try {
      if (editingVersion) {
        await apiFetch(`/api/v1/versions/${encodeURIComponent(editingVersion.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("نسخه بروزرسانی شد.");
      } else {
        await apiFetch("/api/v1/versions", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("نسخه جدید ایجاد شد.");
      }
      setVersionDialogOpen(false);
      await loadVersions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ذخیره نسخه ناموفق بود.");
    } finally {
      setSavingVersion(false);
    }
  }

  async function doDeleteVersion() {
    if (!versionDeleteTarget || !canDelete) return;
    setDeletingVersion(true);
    try {
      await apiFetch(`/api/v1/versions/${encodeURIComponent(versionDeleteTarget.id)}`, {
        method: "DELETE",
      });
      toast.success("نسخه حذف شد.");
      setVersionDeleteTarget(null);
      await loadVersions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حذف نسخه ناموفق بود.");
    } finally {
      setDeletingVersion(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="تنظیمات"
        description="پیکربندی اپلیکیشن و مدیریت نسخه‌های انتشار"
      />

      <Tabs defaultValue="general" className="gap-4">
        <TabsList>
          <TabsTrigger value="general">عمومی</TabsTrigger>
          <TabsTrigger value="versions">نسخه‌ها</TabsTrigger>
        </TabsList>

        {/* ------------------------------ عمومی ------------------------------ */}
        <TabsContent value="general" className="mt-0">
          {settingsLoading ? (
            <LoadingBlock count={4} />
          ) : settingsError ? (
            <ErrorBanner message={settingsError} onRetry={() => void loadSettings()} />
          ) : (
            <Card>
              <CardContent className="grid gap-4 p-4 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="نام اپلیکیشن">
                    <Input
                      value={general.appName}
                      onChange={(e) =>
                        setGeneral((f) => ({ ...f, appName: e.target.value }))
                      }
                      className="h-9"
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="شعار">
                    <Input
                      value={general.tagline}
                      onChange={(e) =>
                        setGeneral((f) => ({ ...f, tagline: e.target.value }))
                      }
                      className="h-9"
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="حداقل نسخه مجاز">
                    <Input
                      dir="ltr"
                      value={general.minVersion}
                      onChange={(e) =>
                        setGeneral((f) => ({ ...f, minVersion: e.target.value }))
                      }
                      className="h-9"
                      placeholder="4.8.0"
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="آدرس عمومی API">
                    <Input
                      dir="ltr"
                      value={general.publicBaseUrl}
                      onChange={(e) =>
                        setGeneral((f) => ({ ...f, publicBaseUrl: e.target.value }))
                      }
                      className="h-9"
                      placeholder="https://..."
                      disabled={!canEdit}
                    />
                  </Field>
                </div>

                <Field label="پیام پشتیبانی">
                  <Textarea
                    value={general.supportMessage}
                    onChange={(e) =>
                      setGeneral((f) => ({ ...f, supportMessage: e.target.value }))
                    }
                    rows={3}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="اطلاعیه در اپ">
                  <Textarea
                    value={general.notice}
                    onChange={(e) =>
                      setGeneral((f) => ({ ...f, notice: e.target.value }))
                    }
                    rows={3}
                    disabled={!canEdit}
                  />
                </Field>

                <div className="flex items-center gap-2">
                  <Switch
                    id="ads-enabled"
                    checked={general.adsEnabled}
                    onCheckedChange={(v) =>
                      setGeneral((f) => ({ ...f, adsEnabled: v }))
                    }
                    disabled={!canEdit}
                  />
                  <label htmlFor="ads-enabled" className="text-sm font-medium">
                    نمایش تبلیغ‌ها در اپلیکیشن
                  </label>
                </div>

                {canEdit ? (
                  <div className="flex justify-start">
                    <Button
                      onClick={() => void saveSettings()}
                      disabled={savingSettings}
                      className="h-9"
                    >
                      {savingSettings ? <Spinner /> : null}
                      ذخیره تنظیمات
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ------------------------------ نسخه‌ها ------------------------------ */}
        <TabsContent value="versions" className="mt-0">
          <div className="mb-4 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {versions.length.toLocaleString("fa-IR")} نسخه ثبت شده
            </span>
            {canEdit ? (
              <Button className="h-9" onClick={openVersionCreate}>
                <Plus className="size-4" aria-hidden />
                نسخه جدید
              </Button>
            ) : null}
          </div>

          {versionsLoading ? (
            <LoadingBlock count={4} />
          ) : versionsError ? (
            <ErrorBanner message={versionsError} onRetry={() => void loadVersions()} />
          ) : versions.length === 0 ? (
            <EmptyState
              icon={Package}
              title="نسخه‌ای ثبت نشده است."
              description="برای انتشار اپلیکیشن، اولین نسخه را ثبت کنید."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>نسخه</TableHead>
                        <TableHead>نشانی APK</TableHead>
                        <TableHead>وضعیت</TableHead>
                        <TableHead>تاریخ</TableHead>
                        <TableHead className="text-left">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {versions.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold">{v.versionName}</span>
                              <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                                code {v.versionCode}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-56">
                            {v.apkUrl ? (
                              <a
                                href={v.apkUrl}
                                target="_blank"
                                rel="noreferrer"
                                dir="ltr"
                                className="block truncate text-xs underline underline-offset-4"
                              >
                                {v.apkUrl}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1">
                              {v.mandatory ? (
                                <Badge variant="destructive">اجباری</Badge>
                              ) : null}
                              <Badge variant={v.active ? "default" : "outline"}>
                                {v.active ? "فعال" : "غیرفعال"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {faDate(v.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {canEdit ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-9"
                                  onClick={() => openVersionEdit(v)}
                                  aria-label={`ویرایش نسخه ${v.versionName}`}
                                >
                                  <Pencil className="size-4" aria-hidden />
                                </Button>
                              ) : null}
                              {canDelete ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-9 text-destructive hover:text-destructive"
                                  onClick={() => setVersionDeleteTarget(v)}
                                  aria-label={`حذف نسخه ${v.versionName}`}
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
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* گفتگوی ایجاد/ویرایش نسخه */}
      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingVersion ? `ویرایش نسخه ${editingVersion.versionName}` : "نسخه جدید"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="نام نسخه">
                <Input
                  dir="ltr"
                  value={versionForm.versionName}
                  onChange={(e) =>
                    setVersionForm((f) => ({ ...f, versionName: e.target.value }))
                  }
                  className="h-9"
                  placeholder="4.8.20"
                />
              </Field>
              <Field label="کد نسخه">
                <Input
                  dir="ltr"
                  type="number"
                  value={versionForm.versionCode}
                  onChange={(e) =>
                    setVersionForm((f) => ({ ...f, versionCode: e.target.value }))
                  }
                  className="h-9"
                  placeholder="497"
                />
              </Field>
            </div>
            <Field label="نشانی APK">
              <Input
                dir="ltr"
                value={versionForm.apkUrl}
                onChange={(e) =>
                  setVersionForm((f) => ({ ...f, apkUrl: e.target.value }))
                }
                className="h-9"
                placeholder="https://..."
              />
            </Field>
            <Field label="توضیحات نسخه">
              <Textarea
                value={versionForm.notes}
                onChange={(e) =>
                  setVersionForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={3}
              />
            </Field>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="version-mandatory"
                  checked={versionForm.mandatory}
                  onCheckedChange={(v) =>
                    setVersionForm((f) => ({ ...f, mandatory: v }))
                  }
                />
                <label htmlFor="version-mandatory" className="text-sm font-medium">
                  اجباری (بروزرسانی الزامی)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="version-active"
                  checked={versionForm.active}
                  onCheckedChange={(v) => setVersionForm((f) => ({ ...f, active: v }))}
                />
                <label htmlFor="version-active" className="text-sm font-medium">
                  فعال
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setVersionDialogOpen(false)}
              disabled={savingVersion}
            >
              لغو
            </Button>
            <Button onClick={() => void submitVersion()} disabled={savingVersion}>
              {savingVersion ? <Spinner /> : null}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تایید حذف نسخه */}
      <ConfirmDialog
        open={!!versionDeleteTarget}
        onOpenChange={(o) => {
          if (!o) setVersionDeleteTarget(null);
        }}
        title="حذف نسخه"
        description={`نسخه «${versionDeleteTarget?.versionName ?? ""}» حذف شود؟ این عملیات بازگشت‌پذیر نیست.`}
        onConfirm={() => void doDeleteVersion()}
        loading={deletingVersion}
      />
    </div>
  );
}
