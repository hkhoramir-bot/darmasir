"use client";

// ============================================================
// صفحه خطوط و ایستگاه‌های ناوگان شهری — بازتولید وفادار طرح Stitch
// تب «خطوط»: جدول پایش خطوط + ویرایش (نام/وضعیت/رنگ)
// تب «ایستگاه‌ها»: جدول جستجوپذیر + فیلتر خط + افزودن/ویرایش/حذف
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { gw } from "@/lib/gw";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

// ---------- انواع ----------

type LineT = {
  id: string;
  code: string;
  name: string;
  kind: string;
  color: string;
  status: string;
  stationCount: number;
};

type MetaT = {
  totalLines: number;
  linesByKind: { METRO: number; BRT: number; BUS: number };
  linesByStatus: { ACTIVE: number; MAINTENANCE: number; INACTIVE: number };
  stations: { total: number; active: number; maintenance: number };
};

type LineChip = { id: string; code: string; name: string; color: string; kind: string };

type StationT = {
  id: string;
  name: string;
  lineId: string | null;
  lat: number;
  lng: number;
  kind: string;
  status: string;
  order: number;
  line: LineChip | null;
};

type StationsResp = {
  stations: StationT[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type LastPublishT = {
  kind: "PUBLISH" | "HEADWAY";
  at: string;
  byName: string;
  note?: string;
  lineCode?: string;
} | null;

const PAGE_SIZE = 15;
const LINE_KINDS = ["METRO", "BRT", "BUS"] as const;
const LINE_STATUSES = ["ACTIVE", "MAINTENANCE", "INACTIVE"] as const;

// ---------- ابزارهای کمکی ----------

const fa = (v: number | string) => String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

const faNum = (n: number, frac = 0) =>
  n.toLocaleString("fa-IR", { maximumFractionDigits: frac, minimumFractionDigits: 0 });

function isDarkColor(hex: string): boolean {
  const m = hex.replace("#", "");
  if (m.length !== 6) return true;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

const KIND_FA: Record<string, string> = { METRO: "مترو", BRT: "BRT", BUS: "اتوبوس" };

const STATUS_PILL: Record<string, { label: string; cls: string; dot: string }> = {
  ACTIVE: { label: "فعال و در سرویس", cls: "bg-tertiary-fixed text-tertiary", dot: "bg-tertiary" },
  MAINTENANCE: { label: "تحت تعمیرات", cls: "bg-secondary-fixed text-on-secondary-fixed", dot: "bg-secondary" },
  INACTIVE: { label: "غیرفعال", cls: "bg-surface-container-high text-on-surface-variant", dot: "bg-outline" },
};

/** برچسب کوتاه نشان خط: l1 → ۱ ، brt-1 → BRT ۱ ، k1 → K1 */
function codeLabel(line: { code: string; kind: string }): string {
  const m = /^l(\d+)$/.exec(line.code);
  if (m) return fa(m[1]);
  const b = /^brt-?(\d+)$/i.exec(line.code);
  if (b || line.kind === "BRT") {
    const n = b ? b[1] : line.code.replace(/[^0-9]/g, "");
    return n ? `BRT ${fa(n)}` : line.code.toUpperCase();
  }
  return line.code.toUpperCase();
}

/** برچسب کامل خط برای نشان‌های کوچک: خط ۱ / BRT ۱ / K1 */
function lineLabel(line: { code: string; kind: string }): string {
  const m = /^l(\d+)$/.exec(line.code);
  if (m) return `خط ${fa(m[1])}`;
  const l = codeLabel(line);
  return l.startsWith("BRT") ? l : l;
}

function LinePill({ line }: { line: LineChip | null }) {
  if (!line) {
    return <span className="text-label-md text-outline">بدون خط</span>;
  }
  const dark = isDarkColor(line.color);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap",
        dark ? "text-white" : "text-on-surface"
      )}
      style={{ backgroundColor: line.color }}
    >
      {lineLabel(line)}
      <span className="opacity-80">{KIND_FA[line.kind] ?? line.kind}</span>
    </span>
  );
}

function StatusPill({ status, className }: { status: string; className?: string }) {
  const pill = STATUS_PILL[status] ?? STATUS_PILL.INACTIVE;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-md font-bold whitespace-nowrap",
        pill.cls,
        className
      )}
    >
      <span className={cn("w-2 h-2 rounded-full", pill.dot)} />
      {pill.label}
    </span>
  );
}

/** کلاس استاندارد فیلدهای فرم مطابق طراحی Stitch */
const FIELD =
  "w-full h-10 rounded-xl border-outline-variant bg-surface-container-low text-body-md font-body-md text-on-surface placeholder:text-outline focus-visible:border-primary focus-visible:ring-primary/30";

// ---------- صفحه اصلی ----------

export default function LinesClient({ role }: { role: string }) {
  const canWrite = role !== "VIEWER";
  const canDelete = role === "SUPERADMIN";

  // داده خطوط و آمار
  const [lines, setLines] = useState<LineT[] | null>(null);
  const [meta, setMeta] = useState<MetaT | null>(null);
  const [kindFilter, setKindFilter] = useState<"ALL" | "METRO" | "BRT" | "BUS">("ALL");

  // داده ایستگاه‌ها (سرور-ساید: جستجو، فیلتر، صفحه‌بندی)
  const [tab, setTab] = useState("lines");
  const [stData, setStData] = useState<StationsResp | null>(null);
  const [stLoading, setStLoading] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [lineFilter, setLineFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);

  // پنل پایش ایستگاه‌های تحت تعمیر
  const [maint, setMaint] = useState<StationT[] | null>(null);

  // انتشار
  const [lastPublish, setLastPublish] = useState<LastPublishT>(null);
  const [publishing, setPublishing] = useState(false);

  // دیالوگ‌ها
  const [editLine, setEditLine] = useState<LineT | null>(null);
  const [lineForm, setLineForm] = useState({ name: "", status: "ACTIVE", color: "#00417f" });
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [addLineForm, setAddLineForm] = useState({ code: "", name: "", kind: "METRO", color: "#00417f" });

  const [stationDialog, setStationDialog] = useState<{ mode: "add" | "edit"; station: StationT | null } | null>(null);
  const [stationForm, setStationForm] = useState({
    name: "",
    lineId: "",
    lat: "",
    lng: "",
    order: "",
    status: "ACTIVE",
  });

  const [deleteTarget, setDeleteTarget] = useState<StationT | null>(null);

  // مودال سرفاصله پیک (مطابق طراحی)
  const [headwayOpen, setHeadwayOpen] = useState(false);
  const [headwayLineId, setHeadwayLineId] = useState("");
  const [headwayNote, setHeadwayNote] = useState("");
  const [headwayAm, setHeadwayAm] = useState("3.0");
  const [headwayMid, setHeadwayMid] = useState("5.0");
  const [headwayPm, setHeadwayPm] = useState("3.5");
  const [headwayExpress, setHeadwayExpress] = useState(true);

  const [saving, setSaving] = useState(false);

  // ---------- بارگذاری داده ----------

  const loadLines = useCallback(async () => {
    try {
      const res = await fetch(gw("/api/v1/lines"));
      const data = await res.json();
      if (data?.ok) {
        setLines(data.lines as LineT[]);
        setMeta(data.meta as MetaT);
      } else {
        toast.error(data?.error || "خطا در دریافت خطوط");
      }
    } catch {
      toast.error("خطا در ارتباط با سرور");
    }
  }, []);

  const loadMaint = useCallback(async () => {
    try {
      const res = await fetch(gw("/api/v1/stations?status=MAINTENANCE&pageSize=6"));
      const data = await res.json();
      if (data?.ok) setMaint(data.stations as StationT[]);
    } catch {
      /* پنل فرعی — بی‌صدا */
    }
  }, []);

  const loadStations = useCallback(async (opts: { q: string; lineId: string; page: number }) => {
    setStLoading(true);
    try {
      const params = new URLSearchParams({
        q: opts.q,
        lineId: opts.lineId === "ALL" ? "" : opts.lineId,
        page: String(opts.page),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(gw(`/api/v1/stations?${params.toString()}`));
      const data = await res.json();
      if (data?.ok) setStData(data as StationsResp);
      else toast.error(data?.error || "خطا در دریافت ایستگاه‌ها");
    } catch {
      toast.error("خطا در ارتباط با سرور");
    } finally {
      setStLoading(false);
    }
  }, []);

  const loadLastPublish = useCallback(async () => {
    try {
      const res = await fetch(gw("/api/v1/lines/publish"));
      const data = await res.json();
      if (data?.ok) setLastPublish(data.lastPublish as LastPublishT);
    } catch {
      /* غیرحیاتی */
    }
  }, []);

  useEffect(() => {
    loadLines();
    loadMaint();
    loadLastPublish();
  }, [loadLines, loadMaint, loadLastPublish]);

  // جستجوی تأخیری ایستگاه‌ها
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  // بارگذاری ایستگاه‌ها هنگام تغییر تب / جستجو / فیلتر / صفحه
  useEffect(() => {
    if (tab !== "stations") return;
    loadStations({ q, lineId: lineFilter, page });
  }, [tab, q, lineFilter, page, refreshTick, loadStations]);

  const refreshAll = useCallback(() => {
    loadLines();
    loadMaint();
    setRefreshTick((t) => t + 1);
  }, [loadLines, loadMaint]);

  // ---------- عملیات خط ----------

  async function patchLine(id: string, payload: Record<string, unknown>, successMsg: string) {
    setSaving(true);
    try {
      const res = await fetch(gw(`/api/v1/lines/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.ok) {
        toast.success(successMsg);
        return true;
      }
      toast.error(data?.error || "خطا در ذخیره تغییرات");
      return false;
    } catch {
      toast.error("خطا در ارتباط با سرور");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitEditLine() {
    if (!editLine) return;
    const okDone = await patchLine(
      editLine.id,
      { name: lineForm.name.trim(), status: lineForm.status, color: lineForm.color },
      "تغییرات خط با موفقیت ذخیره و در Audit Log ثبت شد"
    );
    if (okDone) {
      setEditLine(null);
      loadLines();
    }
  }

  async function submitAddLine() {
    setSaving(true);
    try {
      const res = await fetch(gw("/api/v1/lines"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addLineForm),
      });
      const data = await res.json();
      if (data?.ok) {
        toast.success("خط جدید با موفقیت در پایگاه داده ثبت شد");
        setAddLineOpen(false);
        setAddLineForm({ code: "", name: "", kind: "METRO", color: "#00417f" });
        loadLines();
      } else {
        toast.error(data?.error || "خطا در ثبت خط");
      }
    } catch {
      toast.error("خطا در ارتباط با سرور");
    } finally {
      setSaving(false);
    }
  }

  function toggleLineStatus(line: LineT) {
    const next = line.status === "MAINTENANCE" ? "ACTIVE" : "MAINTENANCE";
    patchLine(line.id, { status: next }, `وضعیت «${line.name}» به ${STATUS_PILL[next].label} تغییر کرد`).then(
      (done) => {
        if (done) loadLines();
      }
    );
  }

  // ---------- عملیات ایستگاه ----------

  function openAddStation() {
    const defaultLine = lineFilter !== "ALL" ? lineFilter : (lines && lines.length === 1 ? lines[0].id : "");
    setStationForm({ name: "", lineId: defaultLine || "", lat: "", lng: "", order: "", status: "ACTIVE" });
    setStationDialog({ mode: "add", station: null });
  }

  function openEditStation(st: StationT) {
    setStationForm({
      name: st.name,
      lineId: st.lineId || "",
      lat: String(st.lat),
      lng: String(st.lng),
      order: String(st.order),
      status: st.status,
    });
    setStationDialog({ mode: "edit", station: st });
  }

  async function submitStation() {
    if (!stationDialog) return;
    const { mode, station } = stationDialog;
    setSaving(true);
    try {
      const payload =
        mode === "add"
          ? {
              name: stationForm.name.trim(),
              lineId: stationForm.lineId,
              lat: parseFloat(stationForm.lat),
              lng: parseFloat(stationForm.lng),
              order: stationForm.order === "" ? undefined : parseInt(stationForm.order, 10),
            }
          : {
              name: stationForm.name.trim(),
              lineId: stationForm.lineId,
              lat: parseFloat(stationForm.lat),
              lng: parseFloat(stationForm.lng),
              order: parseInt(stationForm.order || "0", 10),
              status: stationForm.status,
            };
      const res = await fetch(
        mode === "add" ? gw("/api/v1/stations") : gw(`/api/v1/stations/${station?.id}`),
        {
          method: mode === "add" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (data?.ok) {
        toast.success(
          mode === "add"
            ? "ایستگاه جدید ثبت و شمارنده خط به‌روزرسانی شد"
            : "تغییرات ایستگاه ذخیره و در Audit Log ثبت شد"
        );
        setStationDialog(null);
        refreshAll();
      } else {
        toast.error(data?.error || "خطا در ذخیره ایستگاه");
      }
    } catch {
      toast.error("خطا در ارتباط با سرور");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(gw(`/api/v1/stations/${deleteTarget.id}`), { method: "DELETE" });
      const data = await res.json();
      if (data?.ok) {
        toast.success(`ایستگاه «${deleteTarget.name}» از پایگاه داده حذف شد`);
        setDeleteTarget(null);
        refreshAll();
      } else {
        toast.error(data?.error || "خطا در حذف ایستگاه");
      }
    } catch {
      toast.error("خطا در ارتباط با سرور");
    } finally {
      setSaving(false);
    }
  }

  // ---------- انتشار و سرفاصله ----------

  async function publish(kind: "PUBLISH" | "HEADWAY", extra?: Record<string, unknown>) {
    setPublishing(true);
    try {
      const res = await fetch(gw("/api/v1/lines/publish"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...extra }),
      });
      const data = await res.json();
      if (data?.ok) {
        setLastPublish(data.lastPublish as LastPublishT);
        return true;
      }
      toast.error(data?.error || "خطا در ثبت انتشار");
      return false;
    } catch {
      toast.error("خطا در ارتباط با سرور");
      return false;
    } finally {
      setPublishing(false);
    }
  }

  // ---------- محاسبات نمایشی ----------

  const filteredLines = useMemo(() => {
    if (!lines) return [];
    if (kindFilter === "ALL") return lines;
    return lines.filter((l) => l.kind === kindFilter);
  }, [lines, kindFilter]);

  const linesByKind = meta?.linesByKind ?? { METRO: 0, BRT: 0, BUS: 0 };
  const linesByStatus = meta?.linesByStatus ?? { ACTIVE: 0, MAINTENANCE: 0, INACTIVE: 0 };
  const stMeta = meta?.stations ?? { total: 0, active: 0, maintenance: 0 };

  const avgStations = meta && meta.totalLines > 0 ? meta.stations.total / meta.totalLines : 0;
  const activeCoverage = meta && meta.totalLines > 0 ? (linesByStatus.ACTIVE / meta.totalLines) * 100 : 0;

  function goStationTab(lineId?: string) {
    setLineFilter(lineId || "ALL");
    setPage(1);
    setQInput("");
    setTab("stations");
  }

  // ---------- رندر ----------

  return (
    <main className="p-4 sm:p-6 space-y-6">
      {/* ============ بخش ۱: سربرگ صفحه و نوار اقدامات سراسری ============ */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-2xl">fork_right</span>
            </span>
            <h2 className="text-headline-lg font-headline-lg text-on-surface font-extrabold tracking-tight">
              مدیریت خطوط و ایستگاه‌های ناوگان شهری
            </h2>
          </div>
          <p className="mt-1 text-body-md font-body-md text-on-surface-variant md:mr-10">
            تنظیم و ویرایش خطوط مترو، اتوبوس و BRT، پایش وضعیت ایستگاه‌ها و ثبت تغییرات در پایگاه داده پنل
          </p>
        </div>

        {canWrite && (
          <div className="flex items-center flex-wrap gap-3">
            <button
              onClick={() => {
                setAddLineForm({ code: "", name: "", kind: "METRO", color: "#00417f" });
                setAddLineOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface font-label-lg text-label-lg hover:bg-surface-container transition-colors shadow-sm active:scale-95"
            >
              <span className="material-symbols-outlined text-primary text-xl">add_circle</span>
              <span>افزودن خط یا شاخه جدید</span>
            </button>
            <button
              onClick={() => {
                setHeadwayLineId(lines && lines.length > 0 ? lines[0].id : "");
                setHeadwayNote("");
                setHeadwayOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-secondary text-secondary bg-surface-container-lowest hover:bg-secondary/5 font-label-lg text-label-lg transition-colors shadow-sm active:scale-95"
            >
              <span className="material-symbols-outlined text-xl">speed</span>
              <span>اعمال همگانی سرفاصله پیک ترافیک</span>
            </button>
            <div className="flex items-center">
              <button
                disabled={publishing}
                onClick={async () => {
                  const done = await publish("PUBLISH");
                  if (done) toast.success("تغییرات برای اپلیکیشن مسافرین منتشر شد");
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-all shadow-md active:scale-95 disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-xl">cloud_upload</span>
                <span>{publishing ? "در حال انتشار..." : "انتشار تغییرات به اپلیکیشن (Publish)"}</span>
              </button>
              <span className="mr-3 text-label-sm font-label-sm text-outline hidden xl:inline">
                {lastPublish
                  ? `آخرین انتشار: ${new Date(lastPublish.at).toLocaleString("fa-IR")}`
                  : "هنوز انتشار ثبت نشده است"}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ============ بخش ۲: کارت‌های خلاصه KPI ناوگان ============ */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1: خطوط فعال */}
        <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-label-md font-label-md text-on-surface-variant font-medium">خطوط فعال مترو و اتوبوس</span>
            <span className="p-2 rounded-xl bg-primary-fixed text-primary">
              <span className="material-symbols-outlined text-xl">tram</span>
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-headline-xl font-headline-xl font-black text-on-surface">
                {meta ? faNum(linesByStatus.ACTIVE) : "—"}
              </span>
              <span className="text-label-lg font-label-lg text-on-surface-variant">خط فعال</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-label-sm font-label-sm text-tertiary">
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <span>
                {faNum(linesByKind.METRO)} خط مترو + {faNum(linesByKind.BRT)} BRT + {faNum(linesByKind.BUS)} اتوبوس ثبت‌شده
              </span>
            </div>
          </div>
          <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-primary/5 pointer-events-none" />
        </div>

        {/* KPI 2: میانگین ایستگاه هر خط */}
        <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-label-md font-label-md text-on-surface-variant font-medium">میانگین ایستگاه به‌ازای هر خط</span>
            <span className="p-2 rounded-xl bg-tertiary-fixed text-tertiary">
              <span className="material-symbols-outlined text-xl">timer</span>
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-headline-xl font-headline-xl font-black text-on-surface">
                {meta ? faNum(avgStations, 1) : "—"}
              </span>
              <span className="text-label-lg font-label-lg text-on-surface-variant">ایستگاه</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-label-sm font-label-sm text-tertiary">
              <span className="material-symbols-outlined text-base">route</span>
              <span>
                {faNum(stMeta.total)} ایستگاه ثبت‌شده روی {faNum(meta?.totalLines ?? 0)} خط شبکه
              </span>
            </div>
          </div>
          <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-tertiary/5 pointer-events-none" />
        </div>

        {/* KPI 3: ایستگاه‌های عملیاتی */}
        <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-label-md font-label-md text-on-surface-variant font-medium">کل ایستگاه‌های عملیاتی</span>
            <span className="p-2 rounded-xl bg-surface-container-high text-primary">
              <span className="material-symbols-outlined text-xl">pin_drop</span>
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-headline-xl font-headline-xl font-black text-on-surface">
                {meta ? faNum(stMeta.active) : "—"}
              </span>
              <span className="text-label-lg font-label-lg text-on-surface-variant">ایستگاه باز</span>
            </div>
            <div
              className={cn(
                "mt-2 flex items-center gap-2 text-label-sm font-label-sm",
                stMeta.maintenance > 0 ? "text-secondary" : "text-tertiary"
              )}
            >
              <span className="material-symbols-outlined text-base">
                {stMeta.maintenance > 0 ? "construction" : "task_alt"}
              </span>
              <span>
                {stMeta.maintenance > 0
                  ? `${faNum(stMeta.maintenance)} ایستگاه تحت تعمیرات تجهیزات`
                  : "همه ایستگاه‌ها عملیاتی هستند"}
              </span>
            </div>
          </div>
          <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-surface-container pointer-events-none" />
        </div>

        {/* KPI 4: پوشش خطوط فعال */}
        <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-label-md font-label-md text-on-surface-variant font-medium">وضعیت پایداری سرویس شبکه</span>
            <span className="p-2 rounded-xl bg-primary-fixed text-primary">
              <span className="material-symbols-outlined text-xl">published_with_changes</span>
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-headline-xl font-headline-xl font-black text-tertiary">
                {meta ? `${faNum(activeCoverage, 1)}٪` : "—"}
              </span>
              <span className="text-label-lg font-label-lg text-on-surface-variant">پوشش خطوط فعال</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-label-sm font-label-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-base text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>
                verified
              </span>
              <span>
                {faNum(linesByStatus.MAINTENANCE + linesByStatus.INACTIVE)} خط در وضعیت تعمیر یا غیرفعال
              </span>
            </div>
          </div>
          <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-tertiary/5 pointer-events-none" />
        </div>
      </section>

      {/* ============ بخش ۳: جدول مدیریتی + پنل پایش ============ */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start">
        {/* --- کارت مدیریت (۸ ستون) --- */}
        <div className="xl:col-span-8 bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
          {/* نوار ابزار: عنوان + تب‌ها */}
          <div className="p-5 border-b border-outline-variant flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-title-lg font-title-lg font-bold text-on-surface">جدول پایش و پیکربندی خطوط حمل‌ونقل</h3>
              <p className="text-label-md font-label-md text-on-surface-variant">
                مدیریت مستقیم خطوط، ایستگاه‌ها و وضعیت ناوگان با ثبت تاریخچه تغییرات
              </p>
            </div>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-surface-container-low border border-outline-variant rounded-xl p-1 h-auto w-full md:w-fit">
                <TabsTrigger
                  value="lines"
                  className="rounded-lg px-4 py-1.5 text-label-md font-label-md text-on-surface-variant data-[state=active]:bg-surface-container-lowest data-[state=active]:text-primary data-[state=active]:font-bold data-[state=active]:shadow-xs transition-colors"
                >
                  <span className="material-symbols-outlined text-base">alt_route</span>
                  خطوط
                </TabsTrigger>
                <TabsTrigger
                  value="stations"
                  className="rounded-lg px-4 py-1.5 text-label-md font-label-md text-on-surface-variant data-[state=active]:bg-surface-container-lowest data-[state=active]:text-primary data-[state=active]:font-bold data-[state=active]:shadow-xs transition-colors"
                >
                  <span className="material-symbols-outlined text-base">pin_drop</span>
                  ایستگاه‌ها
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* ======== تب خطوط ======== */}
          {tab === "lines" && (
            <>
              {/* فیلتر نوع خط (سگمنت طرح اصلی) */}
              <div className="px-5 pt-4 pb-1 flex items-center flex-wrap">
                <div className="flex items-center flex-wrap gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant text-label-md font-label-md">
                  {(
                    [
                      ["ALL", `همه خطوط (${fa(lines?.length ?? 0)})`],
                      ["METRO", "خطوط مترو شهری"],
                      ["BRT", "خطوط تندرو BRT"],
                      ["BUS", "خطوط اتوبوس"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setKindFilter(k)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg transition-colors",
                        kindFilter === k
                          ? "bg-surface-container-lowest font-bold text-primary shadow-xs"
                          : "text-on-surface-variant hover:text-on-surface"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* جدول خطوط */}
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low text-on-surface-variant text-label-md font-label-md border-b border-outline-variant">
                      <th className="py-3.5 px-5">شناسه و عنوان خط</th>
                      <th className="py-3.5 px-4">نوع ناوگان</th>
                      <th className="py-3.5 px-4">ایستگاه‌ها</th>
                      <th className="py-3.5 px-4">وضعیت سرویس</th>
                      <th className="py-3.5 px-5 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant text-body-md font-body-md">
                    {!lines &&
                      [0, 1, 2, 3, 4].map((i) => (
                        <tr key={i}>
                          <td colSpan={5} className="py-4 px-5">
                            <Skeleton className="h-9 w-full rounded-xl" />
                          </td>
                        </tr>
                      ))}
                    {lines && filteredLines.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-label-lg text-outline">
                          خطی با این نوع ناوگان ثبت نشده است
                        </td>
                      </tr>
                    )}
                    {lines &&
                      filteredLines.map((line) => (
                        <tr
                          key={line.id}
                          className={cn(
                            "hover:bg-surface-container-low/60 transition-colors",
                            line.status === "MAINTENANCE" && "bg-secondary-fixed/20"
                          )}
                        >
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "w-8 h-8 rounded-lg font-bold flex items-center justify-center shadow-xs shrink-0",
                                  isDarkColor(line.color) ? "text-white" : "text-on-surface",
                                  codeLabel(line).length > 3 ? "text-[10px] px-1" : "text-sm"
                                )}
                                style={{ backgroundColor: line.color }}
                              >
                                {codeLabel(line)}
                              </span>
                              <div>
                                <div className="font-bold text-on-surface text-title-md flex items-center gap-2">
                                  {line.name}
                                  <span className="text-label-sm font-label-sm text-outline" dir="ltr">
                                    {line.code}
                                  </span>
                                </div>
                                <div className="text-label-sm font-label-sm text-outline flex items-center gap-1">
                                  <span>{KIND_FA[line.kind] ?? line.kind}</span>
                                  <span className="material-symbols-outlined text-xs">swap_horiz</span>
                                  <span>شناسه دیتابیس: {line.id.slice(-6)}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container font-bold text-primary text-label-md">
                              <span className="material-symbols-outlined text-base">
                                {line.kind === "BRT" ? "directions_bus" : line.kind === "BUS" ? "directions_bus" : "tram"}
                              </span>
                              {KIND_FA[line.kind] ?? line.kind}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-semibold text-on-surface">
                            {faNum(line.stationCount)} ایستگاه
                          </td>
                          <td className="py-4 px-4">
                            <StatusPill status={line.status} />
                          </td>
                          <td className="py-4 px-5">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => goStationTab(line.id)}
                                className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
                                title="مدیریت ایستگاه‌های این خط"
                                aria-label={`مدیریت ایستگاه‌های ${line.name}`}
                              >
                                <span className="material-symbols-outlined text-xl">list_alt</span>
                              </button>
                              {canWrite && (
                                <>
                                  <button
                                    onClick={() => {
                                      setLineForm({ name: line.name, status: line.status, color: line.color });
                                      setEditLine(line);
                                    }}
                                    className="p-2 rounded-lg text-primary hover:bg-primary-fixed transition-colors"
                                    title="ویرایش خط (نام، وضعیت، رنگ)"
                                    aria-label={`ویرایش ${line.name}`}
                                  >
                                    <span className="material-symbols-outlined text-xl">tune</span>
                                  </button>
                                  <button
                                    onClick={() => toggleLineStatus(line)}
                                    className={cn(
                                      "p-2 rounded-lg transition-colors",
                                      line.status === "MAINTENANCE"
                                        ? "text-tertiary hover:bg-tertiary-fixed"
                                        : "text-secondary hover:bg-secondary-fixed"
                                    )}
                                    title={line.status === "MAINTENANCE" ? "بازگشت به سرویس عادی" : "ثبت وضعیت تعمیرات"}
                                    aria-label="تغییر سریع وضعیت خط"
                                  >
                                    <span className="material-symbols-outlined text-xl">bolt</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* فوتر جدول خطوط */}
              <div className="p-4 border-t border-outline-variant bg-surface-container-low/40 flex items-center justify-between text-label-md font-label-md text-on-surface-variant">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-tertiary">database</span>
                  <span>همگام‌سازی مستقیم با پایگاه داده پنل (SQLite) — شمارش واقعی ایستگاه‌ها</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>
                    نمایش {fa(1)} تا {fa(filteredLines.length)} از {fa(filteredLines.length)} خط
                  </span>
                </div>
              </div>
            </>
          )}

          {/* ======== تب ایستگاه‌ها ======== */}
          {tab === "stations" && (
            <>
              {/* نوار ابزار: جستجو، فیلتر خط، افزودن */}
              <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center flex-wrap gap-3">
                  <div className="relative w-full sm:w-64">
                    <span className="material-symbols-outlined absolute right-3 top-2.5 text-outline text-xl">search</span>
                    <Input
                      value={qInput}
                      onChange={(e) => setQInput(e.target.value)}
                      className={`${FIELD} pr-10`}
                      placeholder="جستجوی نام ایستگاه..."
                      aria-label="جستجوی ایستگاه"
                    />
                  </div>
                  <Select
                    value={lineFilter}
                    onValueChange={(v) => {
                      setLineFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className={`${FIELD} sm:w-56 data-[placeholder]:text-outline`}>
                      <SelectValue placeholder="فیلتر بر اساس خط" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest max-h-72 custom-scrollbar">
                      <SelectItem value="ALL" className="text-body-md">
                        همه خطوط ({faNum(lines?.length ?? 0)})
                      </SelectItem>
                      {(lines ?? []).map((l) => (
                        <SelectItem key={l.id} value={l.id} className="text-body-md">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                            {l.name}
                            <span className="text-label-sm text-outline" dir="ltr">
                              {l.code}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {canWrite && (
                  <button
                    onClick={openAddStation}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-all shadow-md active:scale-95"
                  >
                    <span className="material-symbols-outlined text-xl">add_location</span>
                    <span>افزودن ایستگاه جدید</span>
                  </button>
                )}
              </div>

              {/* جدول ایستگاه‌ها */}
              <div className="overflow-x-auto custom-scrollbar max-h-[38rem] overflow-y-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="text-on-surface-variant text-label-md font-label-md">
                      <th className="py-3.5 px-5 bg-surface-container-low border-y border-outline-variant sticky top-0 z-10">نام ایستگاه</th>
                      <th className="py-3.5 px-4 bg-surface-container-low border-y border-outline-variant sticky top-0 z-10">خط</th>
                      <th className="py-3.5 px-4 bg-surface-container-low border-y border-outline-variant sticky top-0 z-10">ترتیب</th>
                      <th className="py-3.5 px-4 bg-surface-container-low border-y border-outline-variant sticky top-0 z-10">مختصات (Lat, Lng)</th>
                      <th className="py-3.5 px-4 bg-surface-container-low border-y border-outline-variant sticky top-0 z-10">وضعیت</th>
                      <th className="py-3.5 px-5 bg-surface-container-low border-y border-outline-variant sticky top-0 z-10 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant text-body-md font-body-md">
                    {stLoading &&
                      [0, 1, 2, 3, 4].map((i) => (
                        <tr key={`sk-${i}`}>
                          <td colSpan={6} className="py-3 px-5">
                            <Skeleton className="h-8 w-full rounded-xl" />
                          </td>
                        </tr>
                      ))}
                    {!stLoading && stData && stData.stations.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-label-lg text-outline">
                          {q || lineFilter !== "ALL"
                            ? "ایستگاهی مطابق جستجو یا فیلتر یافت نشد"
                            : "هنوز ایستگاهی در پایگاه داده ثبت نشده است"}
                        </td>
                      </tr>
                    )}
                    {!stLoading &&
                      stData &&
                      stData.stations.map((st) => (
                        <tr key={st.id} className="hover:bg-surface-container-low/60 transition-colors">
                          <td className="py-3.5 px-5">
                            <div className="font-semibold text-on-surface text-title-md">{st.name}</div>
                            <div className="text-label-sm font-label-sm text-outline">{KIND_FA[st.kind] ?? st.kind}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <LinePill line={st.line} />
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-on-surface">{fa(st.order)}</td>
                          <td className="py-3.5 px-4">
                            <span dir="ltr" className="font-mono text-label-md text-on-surface-variant tracking-tight">
                              {st.lat.toFixed(5)}, {st.lng.toFixed(5)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusPill status={st.status} className="text-[10px]" />
                          </td>
                          <td className="py-3.5 px-5">
                            <div className="flex items-center justify-center gap-1.5">
                              {canWrite && (
                                <button
                                  onClick={() => openEditStation(st)}
                                  className="p-2 rounded-lg text-primary hover:bg-primary-fixed transition-colors"
                                  title="ویرایش ایستگاه"
                                  aria-label={`ویرایش ایستگاه ${st.name}`}
                                >
                                  <span className="material-symbols-outlined text-xl">edit</span>
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => setDeleteTarget(st)}
                                  className="p-2 rounded-lg text-secondary hover:bg-secondary-fixed transition-colors"
                                  title="حذف ایستگاه (فقط مدیر ارشد)"
                                  aria-label={`حذف ایستگاه ${st.name}`}
                                >
                                  <span className="material-symbols-outlined text-xl">delete</span>
                                </button>
                              )}
                              {!canWrite && (
                                <span className="text-label-sm text-outline">فقط مشاهده</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* فوتر جدول ایستگاه‌ها: صفحه‌بندی */}
              <div className="p-4 border-t border-outline-variant bg-surface-container-low/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-label-md font-label-md text-on-surface-variant">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-tertiary">pin_drop</span>
                  <span>
                    {stData && stData.total > 0
                      ? `نمایش ${faNum((stData.page - 1) * PAGE_SIZE + 1)} تا ${faNum(
                          Math.min(stData.page * PAGE_SIZE, stData.total)
                        )} از ${faNum(stData.total)} ایستگاه`
                      : "بدون نتیجه"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={!stData || stData.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    aria-label="صفحه قبل"
                  >
                    <span className="material-symbols-outlined text-xl">chevron_right</span>
                  </button>
                  {stData &&
                    buildPageList(stData.page, stData.totalPages).map((p, idx) =>
                      p === "dots" ? (
                        <span key={`d-${idx}`} className="px-1 text-outline">
                          …
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={cn(
                            "min-w-8 h-8 px-2 rounded-lg transition-colors",
                            p === stData.page
                              ? "bg-primary text-on-primary font-bold"
                              : "hover:bg-surface-container text-on-surface-variant"
                          )}
                          aria-label={`صفحه ${fa(p)}`}
                          aria-current={p === stData.page ? "page" : undefined}
                        >
                          {fa(p)}
                        </button>
                      )
                    )}
                  <button
                    disabled={!stData || stData.page >= stData.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-1.5 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    aria-label="صفحه بعد"
                  >
                    <span className="material-symbols-outlined text-xl">chevron_left</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* --- پنل پایش ایستگاه‌های شاخص (۴ ستون) --- */}
        <div className="xl:col-span-4 space-y-5">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-outline-variant">
              <div>
                <h3 className="text-title-lg font-title-lg font-bold text-on-surface">پایش ایستگاه‌های تحت تعمیر و شاخص</h3>
                <p className="text-label-md font-label-md text-on-surface-variant">وضعیت بهره‌برداری و مختصات ایستگاه‌ها</p>
              </div>
              <span className="material-symbols-outlined text-primary text-2xl">hub</span>
            </div>

            {/* لیست ایستگاه‌های دارای وضعیت تعمیر */}
            <div className="mt-5 space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
              {maint === null &&
                [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              {maint !== null && maint.length === 0 && (
                <div className="p-6 rounded-xl border border-outline-variant bg-surface-container-low/30 text-center">
                  <span className="material-symbols-outlined text-tertiary text-3xl">task_alt</span>
                  <p className="mt-2 text-title-md text-on-surface">همه ایستگاه‌ها عملیاتی هستند</p>
                  <p className="text-label-md text-outline mt-1">
                    هیچ ایستگاهی در وضعیت تعمیرات (MAINTENANCE) ثبت نشده است
                  </p>
                </div>
              )}
              {maint !== null &&
                maint.map((st) => (
                  <div
                    key={st.id}
                    className="p-4 rounded-xl border border-secondary/40 bg-secondary-fixed/10 hover:border-secondary transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-3 h-3 rounded-full bg-secondary animate-pulse shrink-0" />
                        <h4 className="font-bold text-on-surface text-title-md truncate">{st.name}</h4>
                      </div>
                      <LinePill line={st.line} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-label-md font-label-md">
                      <div className="flex items-center gap-1.5 text-on-surface-variant">
                        <span className="material-symbols-outlined text-base text-primary">pin_drop</span>
                        <span dir="ltr" className="font-mono text-[11px]">
                          {st.lat.toFixed(4)}, {st.lng.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-on-surface-variant">
                        <span className="material-symbols-outlined text-base text-primary">swap_vert</span>
                        <span>ترتیب در خط: {fa(st.order)}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-outline-variant/60 flex items-center justify-between text-label-sm font-label-sm">
                      <span className="text-outline">وضعیت بهره‌برداری:</span>
                      <span className="px-2 py-0.5 rounded-md bg-secondary-fixed text-on-secondary-fixed font-bold">
                        {STATUS_PILL[st.status]?.label ?? st.status}
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            {/* دکمه اقدام سریع */}
            <button
              onClick={() => goStationTab()}
              className="w-full mt-5 py-2.5 px-4 rounded-xl border border-primary text-primary hover:bg-primary-fixed/40 transition-colors font-label-lg text-label-lg flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">map</span>
              <span>مدیریت و پایش همه ایستگاه‌ها</span>
            </button>
          </div>

          {/* جایگاه بنر تبلیغاتی استاندارد درمسیر */}
          <div className="p-5 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-label-sm font-label-sm px-2 py-0.5 rounded bg-outline-variant/50 text-on-surface-variant font-bold">
                آگهی ویژه سامانه
              </span>
              <span className="text-label-sm font-label-sm text-outline">حمایت از توسعه ناوگان پاک</span>
            </div>
            <h4 className="font-bold text-title-md text-on-surface">سامانه بلیت الکترونیک هوشمند درمسیر</h4>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              شارژ مستقیم کارت بلیت مترو و اتوبوس بدون صف از طریق اپلیکیشن مسافرین
            </p>
            <div className="mt-3 flex items-center justify-end">
              <span className="text-label-md text-primary font-bold flex items-center gap-1 hover:underline cursor-pointer">
                <span>اطلاعات بیشتر</span>
                <span className="material-symbols-outlined text-sm">arrow_back</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================= */}
      {/* دیالوگ‌ها                                          */}
      {/* ================================================= */}

      {/* --- ویرایش خط --- */}
      <Dialog open={!!editLine} onOpenChange={(o) => !o && setEditLine(null)}>
        <DialogContent className="sm:max-w-lg bg-surface-container-lowest border-outline-variant rounded-2xl p-0 gap-0 overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-surface-container-low/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">tune</span>
              </div>
              <div>
                <DialogTitle className="text-title-lg font-title-lg font-bold text-on-surface">ویرایش مشخصات خط</DialogTitle>
                <DialogDescription className="text-label-md font-label-md text-on-surface-variant">
                  {editLine ? `${editLine.name} — کد ${editLine.code}` : ""}
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <Label htmlFor="edit-line-name" className="text-label-lg font-label-lg text-on-surface mb-2 block">
                نام خط
              </Label>
              <Input
                id="edit-line-name"
                value={lineForm.name}
                onChange={(e) => setLineForm((f) => ({ ...f, name: e.target.value }))}
                className={FIELD}
                placeholder="مثال: خط ۱ — مبدأ / مقصد"
              />
            </div>
            <div>
              <Label className="text-label-lg font-label-lg text-on-surface mb-2 block">وضعیت سرویس خط</Label>
              <Select value={lineForm.status} onValueChange={(v) => setLineForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className={`${FIELD} data-[placeholder]:text-outline`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest">
                  {LINE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-body-md">
                      {STATUS_PILL[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-line-color" className="text-label-lg font-label-lg text-on-surface mb-2 block">
                رنگ نشان خط
              </Label>
              <div className="flex items-center gap-3">
                <input
                  id="edit-line-color"
                  type="color"
                  value={lineForm.color}
                  onChange={(e) => setLineForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-12 h-10 rounded-lg border border-outline-variant bg-surface-container-low p-1 cursor-pointer"
                  aria-label="انتخاب رنگ خط"
                />
                <Input
                  dir="ltr"
                  value={lineForm.color}
                  onChange={(e) => setLineForm((f) => ({ ...f, color: e.target.value }))}
                  className="font-mono text-label-md w-32 h-10 rounded-xl border-outline-variant bg-surface-container-low"
                  aria-label="کد رنگ"
                />
                <span className="flex-1 text-label-sm font-label-sm text-outline">
                  رنگ خط در اپلیکیشن مسافرین و نقشه شبکه نمایش داده می‌شود
                </span>
              </div>
            </div>
          </div>
          <DialogFooter className="p-5 border-t border-outline-variant bg-surface-container-low/40 sm:justify-between">
            <button
              onClick={() => setEditLine(null)}
              className="px-5 py-2.5 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container font-label-lg text-label-lg transition-colors"
            >
              انصراف
            </button>
            <button
              disabled={saving}
              onClick={submitEditLine}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container shadow-md active:scale-95 transition-all disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-lg">check</span>
              <span>{saving ? "در حال ذخیره..." : "ذخیره و ثبت در تاریخچه"}</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- افزودن خط --- */}
      <Dialog open={addLineOpen} onOpenChange={setAddLineOpen}>
        <DialogContent className="sm:max-w-lg bg-surface-container-lowest border-outline-variant rounded-2xl p-0 gap-0 overflow-hidden">
          <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-surface-container-low/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">add_circle</span>
              </div>
              <div>
                <DialogTitle className="text-title-lg font-title-lg font-bold text-on-surface">افزودن خط یا شاخه جدید</DialogTitle>
                <DialogDescription className="text-label-md font-label-md text-on-surface-variant">
                  ثبت خط در پایگاه داده پنل — پس از ثبت، ایستگاه‌ها را از تب ایستگاه‌ها اضافه کنید
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="add-line-code" className="text-label-lg font-label-lg text-on-surface mb-2 block">
                  کد خط (لاتین، یکتا)
                </Label>
                <Input
                  id="add-line-code"
                  dir="ltr"
                  value={addLineForm.code}
                  onChange={(e) => setAddLineForm((f) => ({ ...f, code: e.target.value }))}
                  className={`${FIELD} font-mono`}
                  placeholder="مثال: l8 یا brt-2"
                />
              </div>
              <div>
                <Label className="text-label-lg font-label-lg text-on-surface mb-2 block">نوع ناوگان</Label>
                <Select value={addLineForm.kind} onValueChange={(v) => setAddLineForm((f) => ({ ...f, kind: v }))}>
                  <SelectTrigger className={`${FIELD} data-[placeholder]:text-outline`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest">
                    {LINE_KINDS.map((k) => (
                      <SelectItem key={k} value={k} className="text-body-md">
                        {KIND_FA[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="add-line-name" className="text-label-lg font-label-lg text-on-surface mb-2 block">
                نام کامل خط
              </Label>
              <Input
                id="add-line-name"
                value={addLineForm.name}
                onChange={(e) => setAddLineForm((f) => ({ ...f, name: e.target.value }))}
                className={FIELD}
                placeholder="مثال: خط ۸ — مبدأ / مقصد"
              />
            </div>
            <div>
              <Label htmlFor="add-line-color" className="text-label-lg font-label-lg text-on-surface mb-2 block">
                رنگ نشان خط
              </Label>
              <div className="flex items-center gap-3">
                <input
                  id="add-line-color"
                  type="color"
                  value={addLineForm.color}
                  onChange={(e) => setAddLineForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-12 h-10 rounded-lg border border-outline-variant bg-surface-container-low p-1 cursor-pointer"
                  aria-label="انتخاب رنگ خط"
                />
                <Input
                  dir="ltr"
                  value={addLineForm.color}
                  onChange={(e) => setAddLineForm((f) => ({ ...f, color: e.target.value }))}
                  className="font-mono text-label-md w-32 h-10 rounded-xl border-outline-variant bg-surface-container-low"
                  aria-label="کد رنگ"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="p-5 border-t border-outline-variant bg-surface-container-low/40 sm:justify-between">
            <button
              onClick={() => setAddLineOpen(false)}
              className="px-5 py-2.5 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container font-label-lg text-label-lg transition-colors"
            >
              انصراف
            </button>
            <button
              disabled={saving}
              onClick={submitAddLine}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container shadow-md active:scale-95 transition-all disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-lg">check</span>
              <span>{saving ? "در حال ثبت..." : "ثبت خط در پایگاه داده"}</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- افزودن / ویرایش ایستگاه --- */}
      <Dialog open={!!stationDialog} onOpenChange={(o) => !o && setStationDialog(null)}>
        <DialogContent className="sm:max-w-xl bg-surface-container-lowest border-outline-variant rounded-2xl p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
          <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-surface-container-low/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">
                  {stationDialog?.mode === "add" ? "add_location" : "edit_location"}
                </span>
              </div>
              <div>
                <DialogTitle className="text-title-lg font-title-lg font-bold text-on-surface">
                  {stationDialog?.mode === "add" ? "افزودن ایستگاه جدید" : "ویرایش ایستگاه"}
                </DialogTitle>
                <DialogDescription className="text-label-md font-label-md text-on-surface-variant">
                  {stationDialog?.mode === "add"
                    ? "ثبت ایستگاه با مختصات جغرافیایی واقعی در پایگاه داده پنل"
                    : stationDialog?.station?.name}
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <Label htmlFor="st-name" className="text-label-lg font-label-lg text-on-surface mb-2 block">
                نام ایستگاه
              </Label>
              <Input
                id="st-name"
                value={stationForm.name}
                onChange={(e) => setStationForm((f) => ({ ...f, name: e.target.value }))}
                className={FIELD}
                placeholder="مثال: ایستگاه تجریش"
              />
            </div>
            <div>
              <Label className="text-label-lg font-label-lg text-on-surface mb-2 block">خط متعلق به ایستگاه</Label>
              <Select value={stationForm.lineId} onValueChange={(v) => setStationForm((f) => ({ ...f, lineId: v }))}>
                <SelectTrigger className={`${FIELD} data-[placeholder]:text-outline`}>
                  <SelectValue placeholder="انتخاب خط..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest max-h-64 custom-scrollbar">
                  {(lines ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id} className="text-body-md">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                        {l.name}
                        <span className="text-label-sm text-outline" dir="ltr">
                          {l.code}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="st-lat" className="text-label-lg font-label-lg text-on-surface mb-2 block">
                  عرض جغرافیایی (Lat)
                </Label>
                <Input
                  id="st-lat"
                  dir="ltr"
                  inputMode="decimal"
                  value={stationForm.lat}
                  onChange={(e) => setStationForm((f) => ({ ...f, lat: e.target.value }))}
                  className={`${FIELD} font-mono`}
                  placeholder="۳۵.۷۰۰۰۰ (بین ۲۵ تا ۴۰)"
                />
              </div>
              <div>
                <Label htmlFor="st-lng" className="text-label-lg font-label-lg text-on-surface mb-2 block">
                  طول جغرافیایی (Lng)
                </Label>
                <Input
                  id="st-lng"
                  dir="ltr"
                  inputMode="decimal"
                  value={stationForm.lng}
                  onChange={(e) => setStationForm((f) => ({ ...f, lng: e.target.value }))}
                  className={`${FIELD} font-mono`}
                  placeholder="۵۱.۴۰۰۰۰ (بین ۴۴ تا ۶۴)"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="st-order" className="text-label-lg font-label-lg text-on-surface mb-2 block">
                  ترتیب ایستگاه در خط
                </Label>
                <Input
                  id="st-order"
                  dir="ltr"
                  inputMode="numeric"
                  value={stationForm.order}
                  onChange={(e) => setStationForm((f) => ({ ...f, order: e.target.value }))}
                  className={`${FIELD} font-mono`}
                  placeholder={stationDialog?.mode === "add" ? "خالی = ادامه خط" : "۰"}
                />
              </div>
              {stationDialog?.mode === "edit" && (
                <div>
                  <Label className="text-label-lg font-label-lg text-on-surface mb-2 block">وضعیت ایستگاه</Label>
                  <Select value={stationForm.status} onValueChange={(v) => setStationForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger className={`${FIELD} data-[placeholder]:text-outline`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest">
                      {LINE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-body-md">
                          {STATUS_PILL[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="p-3.5 rounded-xl border border-outline-variant bg-surface-container-low/30 flex items-center gap-2 text-label-sm font-label-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-base text-primary">info</span>
              <span>
                مختصات باید در محدوده جغرافیایی ایران باشد: عرض ۲۵ تا ۴۰ و طول ۴۴ تا ۶۴. پس از ثبت، شمارنده ایستگاه‌های خط
                به‌صورت خودکار همگام می‌شود.
              </span>
            </div>
          </div>
          <DialogFooter className="p-5 border-t border-outline-variant bg-surface-container-low/40 sm:justify-between">
            <button
              onClick={() => setStationDialog(null)}
              className="px-5 py-2.5 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container font-label-lg text-label-lg transition-colors"
            >
              انصراف
            </button>
            <button
              disabled={saving}
              onClick={submitStation}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container shadow-md active:scale-95 transition-all disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-lg">check</span>
              <span>{saving ? "در حال ذخیره..." : "ذخیره ایستگاه"}</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- حذف ایستگاه (فقط SUPERADMIN) --- */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="sm:max-w-md bg-surface-container-lowest border-outline-variant rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-title-lg text-on-surface">
              <span className="material-symbols-outlined text-error text-2xl">warning</span>
              حذف ایستگاه «{deleteTarget?.name}»
            </AlertDialogTitle>
            <AlertDialogDescription className="text-body-md font-body-md text-on-surface-variant leading-7">
              این عملیات ایستگاه را به‌صورت قطعی از دیتابیس واقعی پنل حذف می‌کند و بازگشت‌پذیر نیست. شمارنده ایستگاه‌های
              خط مربوطه نیز همگام خواهد شد. حذف فقط برای نقش مدیر ارشد سامانه (SUPERADMIN) مجاز است.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl border-outline-variant">انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="rounded-xl bg-error text-on-error hover:bg-error/90 focus-visible:ring-error/40"
            >
              حذف قطعی از دیتابیس
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* --- مودال سرفاصله پیک (مطابق طراحی Stitch) --- */}
      <Dialog open={headwayOpen} onOpenChange={setHeadwayOpen}>
        <DialogContent className="sm:max-w-xl bg-surface-container-lowest border-outline-variant rounded-2xl p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
          <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-surface-container-low/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">tune</span>
              </div>
              <div>
                <DialogTitle className="text-title-lg font-title-lg font-bold text-on-surface">
                  تنظیم و انتشار سرفاصله حرکت ناوگان
                </DialogTitle>
                <DialogDescription className="text-label-md font-label-md text-on-surface-variant">
                  پیکربندی زمان‌بندی اعزام برای خط انتخاب‌شده — ثبت در تاریخچه تغییرات
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <Label className="text-label-lg font-label-lg text-on-surface mb-2 block">خط هدف جهت اعمال تغییرات</Label>
              <Select value={headwayLineId} onValueChange={setHeadwayLineId}>
                <SelectTrigger className={`${FIELD} data-[placeholder]:text-outline`}>
                  <SelectValue placeholder="انتخاب خط..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest max-h-64 custom-scrollbar">
                  {(lines ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id} className="text-body-md">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                        {l.name} — وضعیت فعلی: {STATUS_PILL[l.status]?.label ?? l.status}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(
                [
                  { label: "اوج صبحگاهی (AM)", time: "۰۶:۳۰ تا ۰۹:۰۰", value: headwayAm, set: setHeadwayAm, accent: true },
                  { label: "عادی بین‌روز", time: "۰۹:۰۰ تا ۱۶:۳۰", value: headwayMid, set: setHeadwayMid, accent: false },
                  { label: "اوج عصرگاهی (PM)", time: "۱۶:۳۰ تا ۲۰:۰۰", value: headwayPm, set: setHeadwayPm, accent: true },
                ] as const
              ).map((cfg) => (
                <div key={cfg.label} className="p-3.5 rounded-xl border border-outline-variant bg-surface-container-low/30">
                  <label className="block text-label-md font-label-md font-bold text-on-surface mb-1">{cfg.label}</label>
                  <span className="block text-label-sm font-label-sm text-outline mb-2">{cfg.time}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="60"
                      value={cfg.value}
                      onChange={(e) => cfg.set(e.target.value)}
                      className={cn(
                        "w-full text-center py-1.5 px-2 rounded-lg bg-surface-container-lowest border border-outline-variant font-bold text-title-md outline-none focus:border-primary focus:ring-1 focus:ring-primary",
                        cfg.accent ? "text-primary" : "text-on-surface"
                      )}
                      aria-label={`${cfg.label} به دقیقه`}
                    />
                    <span className="text-label-md text-outline">دقیقه</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 rounded-xl border border-secondary/30 bg-secondary-fixed/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-secondary text-on-secondary shrink-0">
                  <span className="material-symbols-outlined text-xl">electric_bolt</span>
                </span>
                <div>
                  <span className="block font-bold text-on-surface text-label-lg">اعزام ناوگان کمکی و سریع‌السیر</span>
                  <span className="block text-label-sm text-on-surface-variant">
                    تخلیه اضطراری ایستگاه‌های تقاطعی با سرویس خالی
                  </span>
                </div>
              </div>
              <Switch checked={headwayExpress} onCheckedChange={setHeadwayExpress} aria-label="اعزام ناوگان کمکی" />
            </div>
            <div>
              <Label htmlFor="headway-note" className="text-label-lg font-label-lg text-on-surface mb-1.5 block">
                یادداشت ثبت در تاریخچه تغییرات (Audit Log)
              </Label>
              <Textarea
                id="headway-note"
                value={headwayNote}
                onChange={(e) => setHeadwayNote(e.target.value)}
                rows={2}
                className="w-full rounded-xl border-outline-variant bg-surface-container-low text-body-md font-body-md text-on-surface placeholder:text-outline focus-visible:border-primary focus-visible:ring-primary/30"
                placeholder="دلیل تغییر اعزام (مثلاً: پوشش تراکم پس از بازی فوتبال یا بارندگی)..."
              />
            </div>
          </div>
          <DialogFooter className="p-5 border-t border-outline-variant bg-surface-container-low/40 sm:justify-between">
            <button
              onClick={() => setHeadwayOpen(false)}
              className="px-5 py-2.5 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container font-label-lg text-label-lg transition-colors"
            >
              انصراف
            </button>
            <button
              disabled={publishing || !headwayLineId}
              onClick={async () => {
                const done = await publish("HEADWAY", {
                  lineId: headwayLineId,
                  note: headwayNote,
                  config: {
                    am: parseFloat(headwayAm) || null,
                    mid: parseFloat(headwayMid) || null,
                    pm: parseFloat(headwayPm) || null,
                    express: headwayExpress,
                  },
                });
                if (done) {
                  toast.success("سرفاصله پیک برای خط انتخابی اعمال و در Audit Log ثبت شد");
                  setHeadwayOpen(false);
                }
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container shadow-md active:scale-95 transition-all disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-lg">check</span>
              <span>{publishing ? "در حال ثبت..." : "تأیید و انتشار به شبکه"}</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

/** ساخت لیست صفحات با «…» برای صفحه‌بندی */
function buildPageList(current: number, total: number): (number | "dots")[] {
  if (total <= 1) return [1];
  const wanted = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "dots")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("dots");
    out.push(p);
    prev = p;
  }
  return out;
}
