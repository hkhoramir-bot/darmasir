"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { gw } from "@/lib/gw";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ============================================================
// امنیت، نشست‌ها و لاگ‌های ممیزی — بازتولید وفادار طراحی Stitch
// سه تب: مدیران / نشست‌های فعال / لاگ ممیزی
// ============================================================

const fa = (n: number | string) =>
  String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

type AdminRow = {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

type SessionRow = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
  admin: { id: string; name: string; username: string; role: string };
};

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
  admin: { id: string; name: string; username: string; role: string } | null;
};

type Me = { id: string; username: string; name: string; role: string };

const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: "مدیر ارشد",
  OPERATOR: "اپراتور",
  VIEWER: "ناظر",
};

const ROLE_BADGE: Record<string, string> = {
  SUPERADMIN: "bg-primary text-on-primary",
  OPERATOR: "bg-primary-fixed text-on-primary-fixed-variant",
  VIEWER: "bg-surface-container-high text-on-surface-variant",
};

const ACTION_LABEL: Record<string, string> = {
  LOGIN: "ورود موفق",
  LOGIN_FAILED: "ورود ناموفق",
  LOGOUT: "خروج از حساب",
  CREATE: "ایجاد رکورد",
  UPDATE: "ویرایش",
  DELETE: "حذف",
  PUBLISH: "انتشار",
  REVOKE: "ابطال نشست",
  PASSWORD_RESET: "بازنشانی گذرواژه",
  SYSTEM_SEEDED: "راه‌اندازی اولیه",
};

const ACTION_ICON: Record<string, string> = {
  LOGIN: "login",
  LOGIN_FAILED: "gpp_bad",
  LOGOUT: "logout",
  CREATE: "add_circle",
  UPDATE: "edit",
  DELETE: "delete",
  PUBLISH: "campaign",
  REVOKE: "link_off",
  PASSWORD_RESET: "lock_reset",
  SYSTEM_SEEDED: "settings_suggest",
};

const ACTION_COLOR: Record<string, string> = {
  LOGIN: "text-primary",
  LOGIN_FAILED: "text-error",
  LOGOUT: "text-outline",
  CREATE: "text-tertiary",
  UPDATE: "text-primary",
  DELETE: "text-error",
  PUBLISH: "text-tertiary",
  REVOKE: "text-error",
  PASSWORD_RESET: "text-primary",
  SYSTEM_SEEDED: "text-primary",
};

const ENTITY_LABEL: Record<string, string> = {
  AUTH: "دسترسی و احراز هویت",
  ADMIN: "مدیران",
  SESSION: "نشست‌ها",
  SETTING: "تنظیمات هسته",
  VERSION: "نسخه‌ها",
  VOICE_SETTING: "دستیار صوتی",
  SYSTEM: "سامانه",
  USER: "کاربران",
  LINE: "خطوط و ناوگان",
  STATION: "ایستگاه‌ها",
  AD: "تبلیغات و بنرها",
  TICKET: "تیکت‌ها",
};

const ACTION_OPTIONS = [
  "LOGIN", "LOGIN_FAILED", "LOGOUT", "CREATE", "UPDATE",
  "DELETE", "PUBLISH", "REVOKE", "PASSWORD_RESET", "SYSTEM_SEEDED",
];
const ENTITY_OPTIONS = [
  "AUTH", "ADMIN", "SESSION", "SETTING", "VERSION", "VOICE_SETTING",
  "SYSTEM", "USER", "LINE", "STATION", "AD", "TICKET",
];

function fmtDateTime(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("fa-IR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function relTime(v: string) {
  const diff = Date.now() - new Date(v).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "هم‌اکنون";
  if (m < 60) return `${fa(m)} دقیقه پیش`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${fa(h)} ساعت پیش`;
  return `${fa(Math.floor(h / 24))} روز پیش`;
}

function shortUA(ua: string | null) {
  if (!ua) return "نامشخص";
  const browser = ua.includes("Edg/") ? "Edge"
    : ua.includes("Chrome") ? "Chrome"
    : ua.includes("Firefox") ? "Firefox"
    : ua.includes("Safari") ? "Safari"
    : "مرورگر";
  const os = ua.includes("Windows") ? "Windows"
    : ua.includes("Android") ? "Android"
    : ua.includes("iPhone") || ua.includes("iPad") ? "iOS"
    : ua.includes("Mac OS") ? "macOS"
    : ua.includes("Linux") ? "Linux"
    : "سامانه";
  return `${os} / ${browser}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

/** نمایش خوانای detail — تلاش برای parse از JSON */
function DetailCell({ detail }: { detail: string | null }) {
  if (!detail) return <span className="text-outline">—</span>;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(detail);
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === "object") {
    const entries = Object.entries(parsed as Record<string, unknown>).slice(0, 6);
    return (
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => (
          <span
            key={k}
            className="px-2 py-0.5 rounded bg-surface-container text-label-sm text-on-surface-variant font-medium"
          >
            <span className="text-primary font-bold">{k}: </span>
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </span>
        ))}
      </div>
    );
  }
  return <span className="text-body-sm text-on-surface-variant">{detail}</span>;
}

function SectionHeader({
  icon, title, desc, badge, action,
}: {
  icon: string;
  title: string;
  desc: string;
  badge?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-5 border-b border-surface-container-high flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary">
          <span className="material-symbols-outlined text-xl">{icon}</span>
        </div>
        <div>
          <h2 className="text-title-lg font-title-lg text-on-surface font-bold">{title}</h2>
          <p className="text-body-sm font-body-sm text-on-surface-variant">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badge && (
          <span className="text-label-sm font-label-sm bg-surface-container px-3 py-1 rounded-md text-primary font-semibold">
            {badge}
          </span>
        )}
        {action}
      </div>
    </div>
  );
}

export default function SecurityPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("admins");

  // فیلترهای لاگ
  const [fAction, setFAction] = useState("all");
  const [fEntity, setFEntity] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // دیالوگ افزودن مدیر
  const [addOpen, setAddOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fUsername, setFUsername] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fRole, setFRole] = useState("OPERATOR");
  const [savingAdd, setSavingAdd] = useState(false);

  // دیالوگ گذرواژه
  const [pwTarget, setPwTarget] = useState<AdminRow | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const isSuper = me?.role === "SUPERADMIN";

  const loadAdmins = useCallback(async () => {
    try {
      const r = await fetch(gw("/api/v1/security/admins"));
      const d = await r.json();
      if (d.ok) setAdmins(d.admins);
    } catch { /* شبکه — بی‌صدا */ }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const r = await fetch(gw("/api/v1/security/sessions"));
      const d = await r.json();
      if (d.ok) setSessions(d.sessions);
    } catch { /* شبکه — بی‌صدا */ }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (fAction !== "all") q.set("action", fAction);
      if (fEntity !== "all") q.set("entity", fEntity);
      const r = await fetch(gw(`/api/v1/security/audit?${q.toString()}`));
      const d = await r.json();
      if (d.ok) {
        setAudit(d.items);
        setAuditTotal(d.total);
      }
    } catch { /* شبکه — بی‌صدا */ }
  }, [fAction, fEntity, page]);

  useEffect(() => {
    (async () => {
      const r = await fetch(gw("/api/v1/auth/me"));
      const d = await r.json();
      if (d.ok) setMe(d.admin);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([loadAdmins(), loadSessions(), loadAudit()]);
      setLoading(false);
    })();
  }, [loadAdmins, loadSessions, loadAudit]);

  const activeSuperCount = useMemo(
    () => admins.filter((a) => a.role === "SUPERADMIN" && a.active).length,
    [admins]
  );

  const sessionRoleBreakdown = useMemo(() => {
    const sup = sessions.filter((s) => s.admin.role === "SUPERADMIN").length;
    const others = sessions.length - sup;
    return { sup, others };
  }, [sessions]);

  const totalPages = Math.max(1, Math.ceil(auditTotal / pageSize));

  async function toggleActive(a: AdminRow, next: boolean) {
    const r = await fetch(gw(`/api/v1/security/admins/${a.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    const d = await r.json();
    if (d.ok) {
      toast.success(next ? "مدیر فعال شد" : "مدیر غیرفعال شد");
      loadAdmins();
    } else {
      toast.error(d.error || "عملیات ناموفق بود");
    }
  }

  async function changeRole(a: AdminRow, role: string) {
    const r = await fetch(gw(`/api/v1/security/admins/${a.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const d = await r.json();
    if (d.ok) {
      toast.success("نقش مدیر به‌روزرسانی شد");
      loadAdmins();
    } else {
      toast.error(d.error || "عملیات ناموفق بود");
      loadAdmins();
    }
  }

  async function submitAdd() {
    if (!fName.trim() || fName.trim().length < 2) {
      toast.error("نام مدیر را وارد کنید");
      return;
    }
    if (!/^[a-z0-9_]{3,32}$/.test(fUsername.trim())) {
      toast.error("نام کاربری باید انگلیسی و ۳ تا ۳۲ کاراکتر باشد");
      return;
    }
    if (fPassword.length < 8) {
      toast.error("گذرواژه باید حداقل ۸ کاراکتر باشد");
      return;
    }
    setSavingAdd(true);
    try {
      const r = await fetch(gw("/api/v1/security/admins"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fName.trim(),
          username: fUsername.trim(),
          password: fPassword,
          role: fRole,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("مدیر جدید ایجاد شد");
        setAddOpen(false);
        setFName(""); setFUsername(""); setFPassword(""); setFRole("OPERATOR");
        loadAdmins();
      } else {
        toast.error(d.error || "ایجاد مدیر ناموفق بود");
      }
    } finally {
      setSavingAdd(false);
    }
  }

  async function submitPassword() {
    if (!pwTarget) return;
    if (pwValue.length < 8) {
      toast.error("گذرواژه باید حداقل ۸ کاراکتر باشد");
      return;
    }
    setSavingPw(true);
    try {
      const r = await fetch(gw(`/api/v1/security/admins/${pwTarget.id}/password`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwValue }),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("گذرواژه با موفقیت بازنشانی شد");
        setPwTarget(null);
        setPwValue("");
      } else {
        toast.error(d.error || "عملیات ناموفق بود");
      }
    } finally {
      setSavingPw(false);
    }
  }

  async function revokeSession(s: SessionRow) {
    const r = await fetch(gw(`/api/v1/security/sessions/${s.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revoked: true }),
    });
    const d = await r.json();
    if (d.ok) {
      toast.success("نشست باطل شد");
      loadSessions();
    } else {
      toast.error(d.error || "عملیات ناموفق بود");
    }
  }

  function pageNumbers(): (number | "...")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: (number | "...")[] = [1];
    if (page > 3) out.push("...");
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) out.push(p);
    if (page < totalPages - 2) out.push("...");
    out.push(totalPages);
    return out;
  }

  return (
    <main className="p-4 sm:p-6 space-y-6">
      {/* ===== کارت‌های شاخص کلیدی امنیت (Bento Grid) ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1: نشست‌های فعال */}
        <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-primary" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-label-md font-label-md text-on-surface-variant font-semibold">نشست‌های فعال مدیران</span>
              <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined">devices</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-headline-xl font-headline-xl text-primary font-extrabold">
                {loading ? "—" : fa(sessions.length)}
              </span>
              <span className="text-label-md font-label-md text-on-surface-variant">نشست معتبر</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-surface-container flex items-center justify-between text-body-sm font-body-sm text-on-surface-variant">
            <span>{loading ? "—" : `${fa(sessionRoleBreakdown.sup)} مدیر ارشد سیستم`}</span>
            <span className="w-1 h-1 rounded-full bg-outline" />
            <span>{loading ? "—" : `${fa(sessionRoleBreakdown.others)} سایر سطوح`}</span>
          </div>
        </div>
        {/* KPI 2: مدیران سامانه */}
        <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-secondary" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-label-md font-label-md text-on-surface-variant font-semibold">حساب‌های مدیریتی سامانه</span>
              <div className="w-10 h-10 rounded-lg bg-error-container flex items-center justify-center text-error">
                <span className="material-symbols-outlined">admin_panel_settings</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-headline-xl font-headline-xl text-secondary font-extrabold">
                {loading ? "—" : fa(admins.length)}
              </span>
              <span className="text-label-md font-label-md text-secondary font-medium">حساب مدیر</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-surface-container flex items-center gap-1.5 text-body-sm font-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-base text-tertiary">verified_user</span>
            <span>
              {loading ? "—" : `${fa(admins.filter((a) => a.active).length)} فعال — ${fa(admins.filter((a) => !a.active).length)} غیرفعال`}
            </span>
          </div>
        </div>
        {/* KPI 3: رویدادهای ممیزی */}
        <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-tertiary" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-label-md font-label-md text-on-surface-variant font-semibold">رویدادهای ممیزی ثبت‌شده</span>
              <div className="w-10 h-10 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary">
                <span className="material-symbols-outlined">history_edu</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-headline-xl font-headline-xl text-tertiary font-extrabold">
                {loading ? "—" : fa(auditTotal)}
              </span>
              <span className="text-label-md font-label-md text-tertiary font-semibold">رویداد امنیتی</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-surface-container text-body-sm font-body-sm text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-base text-tertiary">lock</span>
            <span>ثبت تغییرناپذیر کلیه عملیات مدیریتی</span>
          </div>
        </div>
        {/* KPI 4: کنترل دسترسی نقش‌محور */}
        <div className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-primary-container" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-label-md font-label-md text-on-surface-variant font-semibold">کنترل دسترسی نقش‌محور (RBAC)</span>
              <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined">policy</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-title-lg font-title-lg text-primary font-bold">سه سطح دسترسی فعال</span>
            </div>
          </div>
          <div className="mt-2 pt-3 border-t border-surface-container text-label-sm font-label-sm text-on-surface-variant leading-relaxed">
            مدیریت مدیران فقط برای <span className="font-bold text-on-surface">مدیر ارشد</span> — ناظر تنها اجازه مشاهده دارد
          </div>
        </div>
      </section>

      {/* ===== تب‌های سه‌گانه ===== */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="flex border-b border-outline-variant px-4 sm:px-6 bg-surface-container-low overflow-x-auto custom-scrollbar">
          {([
            { key: "admins", label: "مدیران سامانه", icon: "manage_accounts" },
            { key: "sessions", label: "نشست‌های فعال", icon: "vpn_key" },
            { key: "audit", label: "لاگ ممیزی", icon: "history_edu" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`py-4 px-5 border-b-2 flex items-center gap-2 whitespace-nowrap text-title-md transition-colors ${
                tab === t.key
                  ? "border-primary text-primary font-bold"
                  : "border-transparent text-on-surface-variant hover:text-on-surface font-medium"
              }`}
            >
              <span className="material-symbols-outlined text-title-lg">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ==================== تب ۱: مدیران ==================== */}
        {tab === "admins" && (
          <div>
            <SectionHeader
              icon="manage_accounts"
              title="مدیران سامانه (Admins)"
              desc="ایجاد حساب مدیر، تعیین نقش و کنترل فعال‌بودن دسترسی به پنل"
              badge="مدیریت فقط با نقش مدیر ارشد"
              action={
                <button
                  onClick={() => setAddOpen(true)}
                  disabled={!isSuper}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors shadow-sm font-label-md text-label-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <span className="material-symbols-outlined text-lg">person_add</span>
                  <span>افزودن مدیر</span>
                </button>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant text-label-md font-label-md border-b border-outline-variant">
                    <th className="py-3.5 px-6">مدیر</th>
                    <th className="py-3.5 px-6">نقش سازمانی</th>
                    <th className="py-3.5 px-6">وضعیت حساب</th>
                    <th className="py-3.5 px-6">آخرین ورود</th>
                    <th className="py-3.5 px-6 text-center">عملیات کنترلی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container text-body-md font-body-md text-on-surface">
                  {loading && (
                    <tr>
                      <td colSpan={5} className="py-10 px-6 text-center text-on-surface-variant">
                        در حال بارگذاری فهرست مدیران...
                      </td>
                    </tr>
                  )}
                  {!loading && admins.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 px-6 text-center text-on-surface-variant">
                        هیچ مدیری ثبت نشده است
                      </td>
                    </tr>
                  )}
                  {admins.map((a) => {
                    const lastSuper = a.role === "SUPERADMIN" && a.active && activeSuperCount <= 1;
                    return (
                      <tr key={a.id} className="hover:bg-surface-container-low/60 transition-colors">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${a.active ? "bg-surface-container-high text-primary" : "bg-surface-container text-outline"}`}>
                              {initials(a.name)}
                            </div>
                            <div>
                              <div className="font-bold text-on-surface flex items-center gap-2">
                                <span>{a.name}</span>
                                {a.id === me?.id && (
                                  <span className="text-label-sm font-label-sm bg-primary text-on-primary px-2 py-0.5 rounded-full">شما</span>
                                )}
                              </div>
                              <div className="text-body-sm font-body-sm text-on-surface-variant" dir="ltr">@{a.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          {isSuper && !lastSuper ? (
                            <Select value={a.role} onValueChange={(v) => changeRole(a, v)}>
                              <SelectTrigger className={`w-32 h-8 rounded-full border-0 text-label-md font-bold ${ROLE_BADGE[a.role] ?? "bg-surface-container text-primary"} [&>span]:text-current`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(ROLE_LABEL).map(([k, v]) => (
                                  <SelectItem key={k} value={k}>{v}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-label-sm font-label-sm font-bold ${ROLE_BADGE[a.role] ?? "bg-surface-container text-primary"}`}>
                              {ROLE_LABEL[a.role] ?? a.role}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={a.active}
                              onCheckedChange={(v) => toggleActive(a, v)}
                              disabled={!isSuper || a.id === me?.id || lastSuper}
                              aria-label={`فعال‌سازی حساب ${a.name}`}
                            />
                            <span className={`text-label-sm font-label-sm font-bold ${a.active ? "text-tertiary" : "text-error"}`}>
                              {a.active ? "فعال" : "غیرفعال"}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-body-sm font-body-sm font-semibold text-on-surface">{fmtDateTime(a.lastLoginAt)}</div>
                          {a.lastLoginAt && (
                            <div className="text-label-sm font-label-sm text-outline">{relTime(a.lastLoginAt)}</div>
                          )}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <button
                            onClick={() => { setPwTarget(a); setPwValue(""); }}
                            disabled={!isSuper}
                            className="px-3 py-1.5 rounded-lg border border-outline-variant text-outline hover:text-primary hover:border-primary hover:bg-surface-container transition-all text-label-sm font-label-sm flex items-center gap-1 mx-auto disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <span className="material-symbols-outlined text-base">lock_reset</span>
                            <span>تغییر گذرواژه</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== تب ۲: نشست‌های فعال ==================== */}
        {tab === "sessions" && (
          <div>
            <SectionHeader
              icon="vpn_key"
              title="نشست‌های فعال مدیران سامانه (Active Sessions)"
              desc="فهرست اتصالات زنده به پنل کنترل با توکن اعتبارسنجی‌شده"
              badge="توکن نشست‌ها با SHA-256 انبار می‌شود"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant text-label-md font-label-md border-b border-outline-variant">
                    <th className="py-3.5 px-6">مدیر و نقش سازمانی</th>
                    <th className="py-3.5 px-6">آدرس IP</th>
                    <th className="py-3.5 px-6">دستگاه و مرورگر</th>
                    <th className="py-3.5 px-6">آغاز نشست</th>
                    <th className="py-3.5 px-6">وضعیت نشست</th>
                    <th className="py-3.5 px-6 text-center">عملیات کنترلی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container text-body-md font-body-md text-on-surface">
                  {loading && (
                    <tr>
                      <td colSpan={6} className="py-10 px-6 text-center text-on-surface-variant">
                        در حال بارگذاری نشست‌های فعال...
                      </td>
                    </tr>
                  )}
                  {!loading && sessions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 px-6 text-center text-on-surface-variant">
                        هیچ نشست فعالی وجود ندارد
                      </td>
                    </tr>
                  )}
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      className={`hover:bg-surface-container-low/60 transition-colors ${s.current ? "bg-primary-fixed/15" : ""}`}
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${s.current ? "bg-primary text-on-primary" : "bg-surface-container-high text-primary"}`}>
                            {initials(s.admin.name)}
                          </div>
                          <div>
                            <div className={`font-bold flex items-center gap-2 ${s.current ? "text-primary" : "text-on-surface"}`}>
                              <span>{s.admin.name}</span>
                              {s.current && (
                                <span className="text-label-sm font-label-sm bg-primary text-on-primary px-2 py-0.5 rounded-full">نشست جاری شما</span>
                              )}
                            </div>
                            <div className="text-body-sm font-body-sm text-on-surface-variant">
                              {ROLE_LABEL[s.admin.role] ?? s.admin.role} — <span dir="ltr">@{s.admin.username}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-mono text-sm text-on-surface inline-block" dir="ltr">{s.ip || "نامشخص"}</div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-1.5 text-on-surface">
                          <span className="material-symbols-outlined text-lg text-outline">laptop_mac</span>
                          <span className="text-body-sm">{shortUA(s.userAgent)}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-body-sm font-body-sm font-semibold">{fmtDateTime(s.createdAt)}</div>
                        <div className="text-label-sm font-label-sm text-outline">{relTime(s.createdAt)}</div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-label-sm font-label-sm bg-tertiary-fixed text-on-tertiary-fixed-variant font-bold">
                          {s.current ? "معتبر / نشست جاری" : "معتبر"}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        {s.current ? (
                          <button
                            disabled
                            className="px-3 py-1.5 rounded-lg border border-outline-variant text-outline text-label-sm font-label-sm flex items-center gap-1 mx-auto opacity-60 cursor-not-allowed"
                          >
                            <span className="material-symbols-outlined text-base">block</span>
                            <span>غیرفعال برای نشست خود</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => revokeSession(s)}
                            disabled={me?.role === "VIEWER"}
                            className="px-3 py-1.5 rounded-lg border border-secondary text-secondary hover:bg-secondary hover:text-on-secondary transition-all text-label-sm font-label-sm flex items-center gap-1 mx-auto disabled:opacity-40 disabled:pointer-events-none"
                          >
                            <span className="material-symbols-outlined text-base">link_off</span>
                            <span>قطع نشست</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== تب ۳: لاگ ممیزی ==================== */}
        {tab === "audit" && (
          <div>
            <SectionHeader
              icon="history_edu"
              title="گزارش‌های ممیزی رویدادها (System Audit Logs)"
              desc="ثبت تغییرناپذیر کلیه تصمیمات، تغییرات پیکربندی و ورود مدیران"
            />
            {/* نوار فیلترها */}
            <div className="p-4 border-b border-surface-container-high flex flex-wrap items-center gap-3 bg-surface-container-low/50">
              <span className="text-label-md font-label-md text-outline">فیلتر عملیات:</span>
              <Select
                value={fAction}
                onValueChange={(v) => { setFAction(v); setPage(1); }}
              >
                <SelectTrigger className="w-44 h-9 rounded-lg bg-surface-container-lowest border-outline-variant text-body-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه عملیات</SelectItem>
                  {ACTION_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>{ACTION_LABEL[a] ?? a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-label-md font-label-md text-outline">فیلتر دسته:</span>
              <Select
                value={fEntity}
                onValueChange={(v) => { setFEntity(v); setPage(1); }}
              >
                <SelectTrigger className="w-44 h-9 rounded-lg bg-surface-container-lowest border-outline-variant text-body-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه دسته‌ها</SelectItem>
                  {ENTITY_OPTIONS.map((e) => (
                    <SelectItem key={e} value={e}>{ENTITY_LABEL[e] ?? e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="mr-auto text-label-sm font-label-sm bg-surface-container px-3 py-1 rounded-md text-primary font-semibold">
                مجموع {fa(auditTotal)} رویداد
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant text-label-md font-label-md border-b border-outline-variant">
                    <th className="py-3.5 px-6">شناسه رویداد</th>
                    <th className="py-3.5 px-6">زمان و تاریخ</th>
                    <th className="py-3.5 px-6">مدیر عامل</th>
                    <th className="py-3.5 px-6">نوع عملیات</th>
                    <th className="py-3.5 px-6">دسته‌بندی</th>
                    <th className="py-3.5 px-6">شرح و جزئیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container text-body-md font-body-md text-on-surface">
                  {loading && (
                    <tr>
                      <td colSpan={6} className="py-10 px-6 text-center text-on-surface-variant">
                        در حال بارگذاری گزارش‌های ممیزی...
                      </td>
                    </tr>
                  )}
                  {!loading && audit.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 px-6 text-center text-on-surface-variant">
                        رویدادی مطابق فیلترها یافت نشد
                      </td>
                    </tr>
                  )}
                  {audit.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-container-low/70 transition-colors">
                      <td className="py-4 px-6 font-mono text-xs font-bold text-primary" dir="ltr">
                        LOG-#{log.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-body-sm font-body-sm font-semibold text-on-surface">{fmtDateTime(log.createdAt)}</div>
                        <div className="text-label-sm font-label-sm text-outline">{relTime(log.createdAt)}</div>
                      </td>
                      <td className="py-4 px-6">
                        {log.admin ? (
                          <>
                            <div className="font-bold text-on-surface">{log.admin.name}</div>
                            <div className="text-body-sm font-body-sm text-on-surface-variant">{ROLE_LABEL[log.admin.role] ?? log.admin.role}</div>
                          </>
                        ) : (
                          <div className="text-body-sm text-outline">حذف‌شده</div>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1 text-label-sm font-label-sm font-bold ${ACTION_COLOR[log.action] ?? "text-primary"}`}>
                          <span className="material-symbols-outlined text-sm">{ACTION_ICON[log.action] ?? "history"}</span>
                          {ACTION_LABEL[log.action] ?? log.action}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-2 py-0.5 rounded text-label-sm font-label-sm bg-surface-container text-primary font-medium">
                          {ENTITY_LABEL[log.entity] ?? log.entity}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <DetailCell detail={log.detail} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* صفحه‌بندی */}
            <div className="p-4 bg-surface-container-low border-t border-outline-variant flex flex-wrap items-center justify-between text-body-sm font-body-sm text-on-surface-variant gap-3">
              <div className="flex items-center gap-2">
                <span>
                  صفحه {fa(page)} از {fa(totalPages)} — نمایش {fa(Math.min(pageSize, auditTotal - (page - 1) * pageSize) > 0 ? Math.min(pageSize, auditTotal - (page - 1) * pageSize) : 0)} مورد از مجموع
                </span>
                <span className="font-bold text-on-surface">{fa(auditTotal)} رویداد ثبت‌شده</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors text-label-sm font-label-sm disabled:opacity-50"
                >
                  قبلی
                </button>
                {pageNumbers().map((p, i) =>
                  p === "..." ? (
                    <span key={`e${i}`} className="px-2 text-outline">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-3 py-1 rounded text-label-sm font-label-sm transition-colors ${
                        p === page
                          ? "bg-primary text-on-primary font-bold"
                          : "bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      {fa(p)}
                    </button>
                  )
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors text-label-sm font-label-sm disabled:opacity-50"
                >
                  بعدی
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== دیالوگ افزودن مدیر ===== */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-title-lg text-on-surface">افزودن مدیر جدید</DialogTitle>
            <DialogDescription className="text-body-sm text-on-surface-variant">
              حساب مدیریتی جدید با نقش دلخواه ایجاد کنید؛ گذرواژه به‌صورت امن انبار می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-label-lg font-label-lg text-on-surface mb-1.5">نام و نام خانوادگی</label>
              <input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface text-on-surface text-body-md focus:outline-none focus:border-primary"
                placeholder="مثال: مهندس سارا نوروزی"
              />
            </div>
            <div>
              <label className="block text-label-lg font-label-lg text-on-surface mb-1.5">نام کاربری (انگلیسی)</label>
              <input
                value={fUsername}
                onChange={(e) => setFUsername(e.target.value.toLowerCase())}
                dir="ltr"
                className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface text-on-surface text-body-md font-mono focus:outline-none focus:border-primary"
                placeholder="sara.n"
              />
              <p className="text-label-sm font-label-sm text-outline mt-1.5">حروف کوچک انگلیسی، عدد یا زیرخط — ۳ تا ۳۲ کاراکتر</p>
            </div>
            <div>
              <label className="block text-label-lg font-label-lg text-on-surface mb-1.5">گذرواژه</label>
              <input
                type="password"
                value={fPassword}
                onChange={(e) => setFPassword(e.target.value)}
                dir="ltr"
                className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface text-on-surface text-body-md font-mono focus:outline-none focus:border-primary"
                placeholder="••••••••"
              />
              <p className="text-label-sm font-label-sm text-outline mt-1.5">حداقل ۸ کاراکتر</p>
            </div>
            <div>
              <label className="block text-label-lg font-label-lg text-on-surface mb-1.5">نقش سازمانی</label>
              <Select value={fRole} onValueChange={setFRole}>
                <SelectTrigger className="w-full h-11 rounded-xl border-outline-variant bg-surface text-body-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setAddOpen(false)}
              className="px-5 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-all text-label-md font-label-md"
            >
              انصراف
            </button>
            <button
              onClick={submitAdd}
              disabled={savingAdd}
              className="px-6 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container transition-all active:scale-[0.98] text-label-md font-label-md font-bold shadow-sm disabled:opacity-60"
            >
              {savingAdd ? "در حال ایجاد..." : "ایجاد مدیر"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== دیالوگ تغییر گذرواژه ===== */}
      <Dialog open={!!pwTarget} onOpenChange={(o) => !o && setPwTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-title-lg text-on-surface">تغییر گذرواژه مدیر</DialogTitle>
            <DialogDescription className="text-body-sm text-on-surface-variant">
              گذرواژه جدید برای حساب <span className="font-bold text-on-surface">{pwTarget?.name}</span> (<span dir="ltr">@{pwTarget?.username}</span>) تعیین کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="block text-label-lg font-label-lg text-on-surface mb-1.5">گذرواژه جدید</label>
            <input
              type="password"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              dir="ltr"
              className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface text-on-surface text-body-md font-mono focus:outline-none focus:border-primary"
              placeholder="••••••••"
            />
            <p className="text-label-sm font-label-sm text-outline mt-1.5">حداقل ۸ کاراکتر — پس از ثبت، کاربر با گذرواژه جدید وارد می‌شود</p>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setPwTarget(null)}
              className="px-5 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-all text-label-md font-label-md"
            >
              انصراف
            </button>
            <button
              onClick={submitPassword}
              disabled={savingPw}
              className="px-6 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container transition-all active:scale-[0.98] text-label-md font-label-md font-bold shadow-sm disabled:opacity-60"
            >
              {savingPw ? "در حال ثبت..." : "ثبت گذرواژه"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
