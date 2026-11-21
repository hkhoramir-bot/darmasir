"use client";

// جعبه‌ابزار مشترک صفحات پنل درمسیر — تاریخ فارسی، برچسب‌ها، هوک نقش و اجزای کوچک
// فقط از ui/* و کتابخانه‌های مجاز استفاده می‌کند؛ هیچ وابستگی جدیدی ندارد.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/client";
import type { Role } from "@/lib/roles";

export { ROLE_LABEL } from "@/lib/roles";

// ------------------------------ انواع داده ------------------------------

export type AdminMe = { id: string; username: string; name: string; role: Role };

export type AuditItemT = {
  id: string;
  adminName: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
};

export type TopAdT = {
  id: string;
  title: string;
  views: number;
  clicks: number;
  placement: string;
};

export type StatsT = {
  lines: number;
  stations: number;
  appUsers: number;
  admins: number;
  activeAds: number;
  adViews: number;
  adClicks: number;
  ticketsOpen: number;
  ticketsPending: number;
  ticketsClosed: number;
  versions: number;
  usersNew7d: number;
  usersActive7d: number;
  recentAudit: AuditItemT[];
  topAds: TopAdT[];
};

export type LineT = {
  id: string;
  cityId: string;
  number: number;
  name: string;
  color: string;
  textOnColor: string;
  terminals: string[];
  direction: string;
  headway: number;
  headwayPeak?: number | null;
  headwayOff?: number | null;
  firstTrain: string;
  lastTrain: string;
  segmentMinutes: number;
  badges: string[] | null;
  status: string;
  statusNote?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StationLineRefT = { lineId: string; order: number };

export type StationT = {
  id: string;
  name: string;
  cityId: string;
  lines: StationLineRefT[];
  amenities: string[];
  featured: boolean;
  lat?: number | null;
  lng?: number | null;
};

export type AppUserT = {
  id: string;
  deviceId: string;
  name?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  city?: string | null;
  active: boolean;
  banned: boolean;
  banReason?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
};

export type AdT = {
  id: string;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  placement: string;
  active: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  views: number;
  clicks: number;
  createdAt: string;
};

export type TicketMessageT = {
  id: string;
  author: string; // USER | ADMIN
  authorName?: string | null;
  body: string;
  createdAt: string;
};

export type TicketListItemT = {
  id: string;
  subject: string;
  category?: string | null;
  status: string;
  priority: string;
  deviceId?: string | null;
  createdAt: string;
  user: { name?: string | null; deviceId?: string | null } | null;
  _count?: { messages: number };
};

export type TicketDetailT = TicketListItemT & { messages: TicketMessageT[] };

export type AdminUserT = {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
  _count?: { sessions: number };
};

export type AppVersionT = {
  id: string;
  versionName: string;
  versionCode: number;
  apkUrl?: string | null;
  notes?: string | null;
  mandatory: boolean;
  active: boolean;
  createdAt: string;
};

export type SettingsMap = Record<string, string>;

// ------------------------------ برچسب‌ها ------------------------------

export const CITY_LABEL: Record<string, string> = {
  tehran: "تهران",
  karaj: "کرج",
  mashhad: "مشهد",
  isfahan: "اصفهان",
};

export const AMENITY_LABEL: Record<string, string> = {
  elevator: "آسانسور",
  escalator: "پله‌برقی",
  wc: "سرویس بهداشتی",
  atm: "خودپرداز",
  baby: "اتاق مادر و کودک",
  parking: "پارکینگ",
  bus: "اتوبوس تندرو",
  taxi: "تاکسی",
  bike: "دوچرخه",
  wifi: "اینترنت رایگان",
};

export const AMENITY_KEYS: string[] = Object.keys(AMENITY_LABEL);

export const STATUS_LABEL: Record<string, string> = {
  normal: "عادی",
  crowded: "پرجمعیت",
  delay: "تاخیر",
  closed: "تعطیل",
};

export const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: "باز",
  PENDING: "در بررسی",
  CLOSED: "بسته",
};

export const TICKET_PRIORITY_LABEL: Record<string, string> = {
  LOW: "کم",
  NORMAL: "عادی",
  HIGH: "زیاد",
};

export const PLACEMENT_LABEL: Record<string, string> = {
  HOME_BANNER: "بنر خانه",
  LINES: "صفحه خطوط",
  MAP: "نقشه",
  STATION_DETAIL: "جزئیات ایستگاه",
};

export const ACTION_LABEL: Record<string, string> = {
  LOGIN: "ورود",
  LOGOUT: "خروج",
  LOGIN_FAILED: "ورود ناموفق",
  CREATE_LINE: "ایجاد خط",
  UPDATE_LINE: "ویرایش خط",
  DELETE_LINE: "حذف خط",
  CREATE_STATION: "ایجاد ایستگاه",
  UPDATE_STATION: "ویرایش ایستگاه",
  DELETE_STATION: "حذف ایستگاه",
  CREATE_AD: "ایجاد تبلیغ",
  UPDATE_AD: "ویرایش تبلیغ",
  DELETE_AD: "حذف تبلیغ",
  CREATE_TICKET: "ایجاد تیکت",
  UPDATE_TICKET: "بروزرسانی تیکت",
  DELETE_TICKET: "حذف تیکت",
  REPLY_TICKET: "پاسخ تیکت",
  CREATE_ADMIN: "ایجاد مدیر",
  UPDATE_ADMIN: "ویرایش مدیر",
  DELETE_ADMIN: "حذف مدیر",
  UPDATE_SETTINGS: "بروزرسانی تنظیمات",
  CREATE_VERSION: "ایجاد نسخه",
  UPDATE_VERSION: "ویرایش نسخه",
  DELETE_VERSION: "حذف نسخه",
  UPDATE_USER: "ویرایش کاربر",
  DELETE_USER: "حذف کاربر",
};

// ------------------------------ تاریخ فارسی ------------------------------

const faFormatter = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});

/** نمایش تاریخ و ساعت فارسی (تهران)؛ برای مقدار نامعتبر «—» */
export function faDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return faFormatter.format(d);
  } catch {
    return "—";
  }
}

// ------------------------------ واریانت‌های نشان ------------------------------

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export type BadgeStyle = { variant: BadgeVariant; className?: string };

/** رنگ نشان وضعیت خط: عادی، پرجمعیت (کهربایی)، تاخیر (نارنجی)، تعطیل (مخرب) */
export function lineStatusVariant(status: string): BadgeStyle {
  switch (status) {
    case "crowded":
      return {
        variant: "default",
        className: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
      };
    case "delay":
      return {
        variant: "default",
        className: "border-transparent bg-orange-500/15 text-orange-700 dark:text-orange-400",
      };
    case "closed":
      return { variant: "destructive" };
    default:
      return { variant: "default" };
  }
}

/** رنگ نشان وضعیت تیکت: باز (پیش‌فرض)، در بررسی (کهربایی)، بسته (خاکستری) */
export function ticketStatusVariant(status: string): BadgeStyle {
  switch (status) {
    case "PENDING":
      return {
        variant: "default",
        className: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
      };
    case "CLOSED":
      return { variant: "outline", className: "text-muted-foreground" };
    default:
      return { variant: "default" };
  }
}

/** آیکون متناسب با گروه هر اکشن audit */
export function auditIcon(action: string): LucideIcon {
  if (action === "LOGIN" || action === "LOGIN_FAILED") return LogIn;
  if (action === "LOGOUT") return LogOut;
  if (action.startsWith("CREATE")) return Plus;
  if (action.startsWith("UPDATE")) return Pencil;
  if (action.startsWith("DELETE")) return Trash2;
  return Activity;
}

// ------------------------------ هوک نقش من ------------------------------

let meCache: AdminMe | null = null;
let mePromise: Promise<AdminMe | null> | null = null;

function fetchMe(): Promise<AdminMe | null> {
  if (!mePromise) {
    mePromise = apiFetch<{ admin: AdminMe }>("/api/v1/auth/me")
      .then((d) => {
        meCache = d.admin;
        return d.admin;
      })
      .catch(() => null);
  }
  return mePromise;
}

/** نقش کاربر جاری — در هر نشست فقط یک‌بار از سرور گرفته می‌شود */
export function useAdmin(): { admin: AdminMe | null; loading: boolean } {
  const [admin, setAdmin] = useState<AdminMe | null>(meCache);
  const [loading, setLoading] = useState<boolean>(meCache === null);

  useEffect(() => {
    let alive = true;
    fetchMe().then((a) => {
      if (!alive) return;
      setAdmin(a);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { admin, loading };
}

// ------------------------------ اجزای کوچک ------------------------------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-xl font-bold leading-tight">{value}</div>
          {hint ? (
            <div className="text-xs text-muted-foreground">{hint}</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="font-medium">{title}</div>
      {description ? (
        <div className="max-w-sm text-sm text-muted-foreground">{description}</div>
      ) : null}
      {action}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4"
    >
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" className="h-9" onClick={onRetry}>
          تلاش دوباره
        </Button>
      ) : null}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  loading = false,
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  loading?: boolean;
  destructive?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            لغو
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Spinner /> : null}
            {destructive ? "تایید و حذف" : "تایید"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={"size-4 animate-spin " + (className ?? "")}
      aria-hidden
    />
  );
}

export function LoadingBlock({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-label="در حال بارگذاری"
      className={"grid gap-4 sm:grid-cols-2 " + (className ?? "")}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
