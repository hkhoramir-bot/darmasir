"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  computeRoute,
  getLine,
  getStation,
  headwayAt,
  nextArrivalsBoth,
  searchStations,
  toFa,
} from "@/lib/metro-data";
import { MI, PageHeader, useInitCity, useShell } from "@/components/metro/shell";
import { PanelAdSlot, useTravelModes } from "@/components/metro/panel-banners";

/* ============================================================
   مسیرهای برگزیده — بازطراحی دقیق بر اساس ui/_7/code.html
   مقصدهای روزمره + ایستگاه‌های نشان‌شده + سفرهای پرتردد
   ============================================================ */

interface DailyRoute {
  id: string;
  kind: "home" | "work" | "custom";
  label: string;
  fromStationId: string;
  fromName: string;
  toStationId: string;
  toName: string;
  createdAt: string;
}

interface FavLine {
  id: string;
  number: number;
  name: string;
  color: string;
  textOnColor: string;
}

interface FavStation {
  id: string;
  name: string;
  isInterchange: boolean;
  lines: FavLine[];
  amenities: string[];
  favoritedAt: string;
}

interface Trip {
  id: string;
  fromStationId: string;
  fromName: string;
  toStationId: string;
  toName: string;
  minutes: number;
  transfers: number;
  fare: number;
  createdAt: string;
}

type Sel = { id: string; name: string };

const KINDS: { id: "home" | "work" | "custom"; label: string; icon: string }[] = [
  { id: "home", label: "خانه", icon: "home" },
  { id: "work", label: "محل کار", icon: "work" },
  { id: "custom", label: "سفارشی", icon: "place" },
];

/* ------------------------------ کمکی‌ها ------------------------------ */

function relDate(iso: string): string {
  try {
    const d = new Date(iso);
    const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.floor((start(new Date()) - start(d)) / 86400000);
    if (diff <= 0) return "امروز";
    if (diff === 1) return "دیروز";
    return `${toFa(diff)} روز پیش`;
  } catch {
    return "";
  }
}

function speakRoute(toName: string, minutes: number | null) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const text =
      minutes === null
        ? `مسیر به ${toName}، قطار در ساعات سرویس نیست.`
        : `مسیر به ${toName}، قطار بعدی ${toFa(minutes)} دقیقه`;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fa-IR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}

/* ------------------- انتخابگر ایستگاه (مودال افزودن) ------------------- */

function StationPicker({
  title,
  icon,
  sel,
  onSelect,
}: {
  title: string;
  icon: string;
  sel: Sel | null;
  onSelect: (s: Sel | null) => void;
}) {
  const city = useShell((s) => s.city);
  const [q, setQ] = useState(sel?.name ?? "");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchStations({ q, cityId: city }).slice(0, 6), [q, city]);

  return (
    <div className="relative mb-3">
      <span className="text-label-md text-on-surface-variant mb-1 flex items-center gap-1">
        <MI name={icon} size={14} className="text-primary" />
        {title}
      </span>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onSelect(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder="جستجوی ایستگاه..."
        className="w-full bg-surface-container rounded-xl px-3 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant border border-outline-variant/40 focus:outline-none focus:border-primary"
      />
      {open && (
        <div className="absolute z-10 top-full mt-1 inset-x-0 bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-lg max-h-56 overflow-y-auto py-1">
          {results.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant px-3 py-2">ایستگاهی یافت نشد</p>
          ) : (
            results.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect({ id: s.id, name: s.name });
                  setQ(s.name);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 text-right px-3 py-2 hover:bg-surface-container text-body-sm text-on-surface"
              >
                <span className="truncate">{s.name}</span>
                <span className="flex gap-1 shrink-0">
                  {s.lines.slice(0, 2).map((l) => {
                    const line = getLine(l.lineId);
                    return (
                      <span
                        key={l.lineId}
                        className="px-1.5 py-0.2 rounded text-[10px] font-bold"
                        style={{ background: line.color, color: line.textOnColor }}
                      >
                        {line.name}
                      </span>
                    );
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ============================== صفحه ============================== */

export default function SavedPage() {
  const router = useRouter();
  useInitCity();

  /* ---------------------- سربرگ مدهای سفر (از پنل مدیریت) ----------------------
     ذخیره‌ها فقط مختص مترو نیست — هر مد سفر فعال پنل یک سربرگ دارد؛
     مد بدون داده با برچسب «بزودی» و جای‌نگهداشت خالی نمایش داده می‌شود */
  const travelModes = useTravelModes();
  const [activeTab, setActiveTab] = useState("metro");
  const enabledModes = useMemo(() => travelModes.filter((m) => m.enabled), [travelModes]);
  const activeMode = enabledModes.find((m) => m.id === activeTab);
  const isMetroTab = !activeMode || activeMode.id === "metro";

  const [routes, setRoutes] = useState<DailyRoute[]>([]);
  const [favs, setFavs] = useState<FavStation[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [smartAlert, setSmartAlert] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<DailyRoute | null>(null);
  const [kind, setKind] = useState<"home" | "work" | "custom">("home");
  const [labelInput, setLabelInput] = useState("");
  const [fromSel, setFromSel] = useState<Sel | null>(null);
  const [toSel, setToSel] = useState<Sel | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, setTick] = useState(0);

  /** مرجع زمانی برای محاسبات زنده — با تیک هر دقیقه رفرش می‌شود */
  const now = new Date();

  /* ---------------------- بارگذاری داده‌ها ---------------------- */

  const loadRoutes = useCallback(() => {
    return fetch("/api/daily-routes")
      .then((r) => (r.ok ? r.json() : { routes: [] }))
      .then((d) => setRoutes(d.routes ?? []))
      .catch(() => {});
  }, []);

  const loadFavs = useCallback(() => {
    return fetch("/api/favorites")
      .then((r) => (r.ok ? r.json() : { favorites: [] }))
      .then((d) => setFavs(Array.isArray(d) ? d : (d.favorites ?? [])))
      .catch(() => {});
  }, []);

  const loadTrips = useCallback(() => {
    return fetch("/api/history")
      .then((r) => (r.ok ? r.json() : { trips: [] }))
      .then((d) => setTrips(d.trips ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    try {
      const v = localStorage.getItem("metrojo-smart-alert");
      if (v !== null) setSmartAlert(v === "1");
    } catch {}
    Promise.allSettled([loadRoutes(), loadFavs(), loadTrips()]).then(() => {
      if (alive) setLoading(false);
    });
    const t = window.setInterval(() => setTick((x) => x + 1), 60000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [loadRoutes, loadFavs, loadTrips]);

  function onSmartChange(v: boolean) {
    setSmartAlert(v);
    try {
      localStorage.setItem("metrojo-smart-alert", v ? "1" : "0");
    } catch {}
  }

  async function removeFav(stationId: string) {
    setFavs((prev) => prev.filter((f) => f.id !== stationId));
    try {
      await fetch(`/api/favorites?stationId=${stationId}`, { method: "DELETE" });
    } catch {}
    loadFavs();
  }

  /* ---------------------- مودال مقصد جدید ---------------------- */

  function openAdd() {
    setEditing(null);
    setKind("home");
    setLabelInput("");
    setFromSel(null);
    setToSel(null);
    setFormError(null);
    setAddOpen(true);
  }

  function openEdit(r: DailyRoute) {
    setEditing(r);
    setKind(r.kind);
    setLabelInput(r.label ?? "");
    setFromSel({ id: r.fromStationId, name: r.fromName });
    setToSel({ id: r.toStationId, name: r.toName });
    setFormError(null);
    setAddOpen(true);
  }

  function closeAdd() {
    setAddOpen(false);
    setEditing(null);
  }

  async function saveDestination() {
    if (!fromSel || !toSel) {
      setFormError("مبدأ و مقصد را از فهرست ایستگاه‌ها انتخاب کنید.");
      return;
    }
    if (fromSel.id === toSel.id) {
      setFormError("مبدأ و مقصد نمی‌توانند یک ایستگاه باشند.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const fallback = kind === "home" ? "به سمت خانه" : kind === "work" ? "به سمت محل کار" : "مسیر سفارشی";
    try {
      if (editing) await fetch(`/api/daily-routes?id=${editing.id}`, { method: "DELETE" });
      const res = await fetch("/api/daily-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          label: labelInput.trim() || fallback,
          fromStationId: fromSel.id,
          toStationId: toSel.id,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setFormError(d?.error ?? "ذخیره ناموفق بود — دوباره تلاش کنید.");
        return;
      }
      closeAdd();
      loadRoutes();
    } catch {
      setFormError("خطای شبکه — دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------- مشتقات ---------------------- */

  const nowMin = now.getHours() * 60 + now.getMinutes();

  const pairCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of trips) {
      const k = `${t.fromStationId}>${t.toStationId}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [trips]);

  const recentTrips = trips.slice(0, 4);

  return (
    <>
      <PageHeader
        title="مسیرهای برگزیده"
        subtitle="دسترسی سریع و ناوبری زنده"
        actions={
          <>
            <button
              aria-label="راهنما"
              title="راهنمای مسیرهای برگزیده"
              onClick={() => setHelpOpen(true)}
              className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-all"
            >
              <MI name="help" size={18} />
            </button>
            {isMetroTab && (
              <button
                onClick={openAdd}
                className="flex items-center gap-1 px-3 py-2 bg-primary-container text-on-primary rounded-xl text-label-md shadow-sm hover:bg-primary active:scale-95 transition-all shrink-0"
              >
                <MI name="bookmark_add" size={18} />
                <span>مقصد جدید</span>
              </button>
            )}
          </>
        }
      />

      <main className="flex-1 w-full max-w-lg mx-auto px-4 pt-4 pb-28">
        {/* ==================== سربرگ مدهای سفر — هر مد فعال از پنل یک سربرگ ==================== */}
        {enabledModes.length > 0 && (
          <div
            role="tablist"
            aria-label="بخش‌های ذخیره‌ها"
            className="flex gap-2 overflow-x-auto pb-1.5 mb-4 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {enabledModes.map((m) => {
              const selected = m.id === (activeMode?.id ?? "metro");
              return (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(m.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border transition-all active:scale-95 ${
                    selected
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/40 hover:bg-surface-container-low"
                  }`}
                >
                  <MI name={m.icon} size={16} />
                  <span>{m.label}</span>
                  {m.status === "soon" && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        selected ? "bg-white/20 text-white" : "bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      بزودی
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {isMetroTab ? (
          <>
        {/* ==================== ۱. هشدار هوشمند حرکت ==================== */}
        <section className="mb-5 bg-surface-container-low rounded-xl p-3.5 border border-outline-variant/40 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0">
              <MI name="notifications_active" size={20} />
            </div>
            <div>
              <h3 className="text-title-md text-on-surface">هشدار هوشمند حرکت</h3>
              <p className="text-body-sm text-on-surface-variant">اعلام خودکار زمان قطار نزدیک</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              className="sr-only peer"
              type="checkbox"
              checked={smartAlert}
              onChange={(e) => onSmartChange(e.target.checked)}
            />
            <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container"></div>
          </label>
        </section>

        {/* ==================== ۲. مسیرهای اصلی ==================== */}
        <section className="space-y-3.5 mb-6">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-title-md text-on-surface flex items-center gap-1.5">
              <MI name="explore" size={20} className="text-primary" />
              <span>مسیرهای اصلی</span>
            </h3>
            <span className="text-label-sm text-tertiary-container bg-surface-container px-2 py-0.5 rounded-full font-bold dark:text-tertiary-fixed-dim">
              {toFa(routes.length)} مقصد فعال
            </span>
          </div>

          {loading ? (
            <div className="h-40 rounded-xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
          ) : routes.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-xl border-2 border-dashed border-outline-variant/60 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center mx-auto mb-3 text-on-surface-variant">
                <MI name="bookmark_add" size={24} />
              </div>
              <h4 className="text-title-md text-on-surface mb-1">هنوز مقصدی ذخیره نشده است</h4>
              <p className="text-body-md text-on-surface-variant mb-4">
                مسیرهای روزمره مثل خانه و محل کار را ذخیره کنید تا با یک لمس ناوبری را شروع کنید.
              </p>
              <button
                onClick={openAdd}
                className="px-4 py-2 bg-primary-container text-on-primary rounded-xl text-label-md inline-flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <MI name="bookmark_add" size={18} />
                افزودن اولین مقصد
              </button>
            </div>
          ) : (
            routes.map((r) => {
              const plan = computeRoute(r.fromStationId, r.toStationId, "fastest", now);
              const toSt = getStation(r.toStationId);
              const toLine = toSt ? getLine(toSt.lines[0].lineId) : null;
              const fromSt = getStation(r.fromStationId);
              const fromLineId = fromSt?.lines[0]?.lineId ?? null;
              const fromLine = fromLineId ? getLine(fromLineId) : null;
              const arrs = fromLineId ? nextArrivalsBoth(fromLineId, r.fromStationId, now.getTime()) : [];
              const arr = arrs[0];
              const nextMin = arr && !arr.outOfService && arr.minutes.length > 0 ? arr.minutes[0] : null;
              const kindIcon = r.kind === "home" ? "home" : r.kind === "work" ? "work" : "place";
              return (
                <div
                  key={r.id}
                  className="bg-surface-container-lowest rounded-xl p-3.5 border border-outline-variant/40 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md"
                >
                  <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-primary-container via-surface-tint to-secondary"></div>
                  <div className="flex items-center justify-between mb-2.5 pt-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-surface-container text-primary flex items-center justify-center shrink-0">
                        <MI name={kindIcon} size={22} fill />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-title-lg text-on-surface font-bold">{r.label}</h4>
                        </div>
                        <p className="text-body-sm text-on-surface-variant flex items-center gap-1.5 mt-0.5">
                          <span>{r.toName}</span>
                          {toLine && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold"
                              style={{ background: toLine.color, color: toLine.textOnColor }}
                            >
                              {toLine.name}
                            </span>
                          )}
                          {plan && (
                            <>
                              <span className="text-on-surface-variant">•</span>
                              <span className="text-primary font-bold">
                                {toFa(Math.round(plan.totalMinutes))} دقیقه
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        aria-label="ویرایش"
                        onClick={() => openEdit(r)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface active:scale-95 transition-all"
                      >
                        <MI name="edit" size={20} />
                      </button>
                    </div>
                  </div>
                  {/* نوار زنده — ورود قطار بعدی */}
                  {fromLine && (
                    <div className="flex items-center justify-between bg-surface-container/60 rounded-lg px-3 py-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary-container"></span>
                        </span>
                        <span className="text-body-sm text-on-surface">
                          ورود قطار {fromLine.name}:{" "}
                          {nextMin !== null ? (
                            <strong className="text-secondary font-bold">{toFa(nextMin)} دقیقه</strong>
                          ) : (
                            <strong className="text-error font-bold">خارج از سرویس</strong>
                          )}
                        </span>
                      </div>
                      <span className="text-label-sm text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded-full whitespace-nowrap">
                        {arr ? arr.crowdLabel : "—"}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/plan?from=${r.fromStationId}&to=${r.toStationId}`)}
                      className="flex-1 py-2 px-4 bg-primary-container text-on-primary rounded-xl text-label-lg flex items-center justify-center gap-2 shadow-sm hover:bg-primary active:scale-95 transition-all"
                    >
                      <MI name="near_me" size={18} fill />
                      <span>شروع ناوبری</span>
                    </button>
                    <button
                      aria-label="صوتی"
                      onClick={() => speakRoute(r.toName, nextMin)}
                      className="w-10 h-10 rounded-xl bg-surface-container text-primary flex items-center justify-center hover:bg-surface-container-high active:scale-95 transition-all"
                    >
                      <MI name="record_voice_over" size={20} />
                    </button>
                  </div>
                  {/* نوار سرفاصله و تعویض */}
                  {fromLine && (
                    <>
                      <div className="flex items-center justify-between bg-surface-container/60 rounded-lg px-3 py-2 mt-3 mb-3 text-body-sm">
                        <span className="text-on-surface">
                          سرفاصله {fromLine.name}:{" "}
                          <strong className="text-tertiary-container font-bold dark:text-tertiary-fixed-dim">
                            {toFa(headwayAt(fromLine, nowMin))} دقیقه
                          </strong>
                        </span>
                        <span className="text-label-sm text-on-surface-variant whitespace-nowrap">
                          {plan && plan.transfers > 0 && plan.transferStations[0]
                            ? `تعویض در ${plan.transferStations[0]}`
                            : "بدون تعویض"}
                        </span>
                      </div>
                      <button
                        onClick={() => router.push(`/lines/${fromLineId}`)}
                        className="w-full py-2 px-4 bg-surface-container hover:bg-surface-container-high text-primary rounded-xl text-label-lg flex items-center justify-center gap-2 active:scale-95 transition-all"
                      >
                        <MI name="schedule" size={18} />
                        <span>مشاهده برنامه حرکت</span>
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </section>

        {/* ==================== ۳. ایستگاه‌های نشان‌شده من ==================== */}
        <section className="mb-6">
          <div className="flex items-center justify-between px-1 mb-3">
            <h3 className="text-title-md text-on-surface flex items-center gap-1.5">
              <MI name="push_pin" size={20} className="text-primary" />
              <span>ایستگاه‌های نشان‌شده من</span>
            </h3>
            <button
              onClick={() => router.push("/stations")}
              className="text-label-md text-primary font-bold flex items-center gap-0.5 hover:underline"
            >
              <span>مدیریت همه</span>
              <MI name="chevron_left" size={16} />
            </button>
          </div>
          <div className="space-y-2.5">
            {loading ? (
              <div className="h-20 rounded-xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse" />
            ) : favs.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-xl border-2 border-dashed border-outline-variant/60 p-5 text-center">
                <MI name="push_pin" size={22} className="text-on-surface-variant mx-auto mb-2" />
                <p className="text-body-md text-on-surface-variant mb-3">
                  هنوز ایستگاهی نشان نکرده‌اید — از صفحه ایستگاه‌ها به علاقه‌مندی‌ها اضافه کنید.
                </p>
                <button
                  onClick={() => router.push("/stations")}
                  className="text-label-md text-primary font-bold inline-flex items-center gap-1"
                >
                  رفتن به ایستگاه‌ها
                  <MI name="chevron_left" size={16} />
                </button>
              </div>
            ) : (
              favs.map((f) => {
                const arrivals = f.lines
                  .slice(0, 2)
                  .map((l) => {
                    const a = nextArrivalsBoth(l.id, f.id, now.getTime())[0];
                    const m = a && !a.outOfService && a.minutes.length > 0 ? a.minutes[0] : null;
                    return { name: l.name, min: m };
                  })
                  .filter((x) => x.min !== null);
                const mainLine = f.lines[0];
                return (
                  <div
                    key={f.id}
                    onClick={() => router.push(`/stations/${f.id}`)}
                    className="bg-surface-container-lowest rounded-xl p-3.5 border border-outline-variant/40 shadow-sm flex items-center justify-between gap-3 hover:border-primary transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full border-2 bg-surface-container flex items-center justify-center shrink-0 relative"
                        style={{ borderColor: mainLine?.color }}
                      >
                        {f.lines.length > 1 ? (
                          <MI name="transfer_within_a_station" size={20} className="text-primary" />
                        ) : (
                          <span style={{ color: mainLine?.color }}>
                            <MI name="directions_subway" size={20} />
                          </span>
                        )}
                        {mainLine && (
                          <span
                            className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full border border-white text-[9px] font-bold flex items-center justify-center"
                            style={{ background: mainLine.color, color: mainLine.textOnColor }}
                          >
                            {toFa(mainLine.number)}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-title-md text-on-surface">{f.name}</h4>
                          <div className="flex gap-1">
                            {f.lines.slice(0, 2).map((l) => (
                              <span
                                key={l.id}
                                className="px-1.5 py-0.2 rounded text-[10px] font-bold"
                                style={{ background: l.color, color: l.textOnColor }}
                              >
                                {l.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-body-sm text-on-surface-variant mt-1">
                          {arrivals.length === 0 ? (
                            <span className="text-on-surface-variant">خارج از ساعات سرویس</span>
                          ) : (
                            arrivals.map((a, i) => (
                              <span key={a.name} className="flex items-center gap-1">
                                {i > 0 && <span className="text-on-surface-variant mr-1.5">•</span>}
                                {i === 0 && <MI name="train" size={14} className="text-tertiary-container dark:text-tertiary-fixed-dim" />}
                                <span className={i === 0 ? "text-tertiary-container font-semibold dark:text-tertiary-fixed-dim" : "text-on-surface"}>
                                  {a.name}: {toFa(a.min ?? 0)} دقیقه
                                </span>
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        aria-label="حذف"
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeFav(f.id);
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container/20 active:scale-95 transition-all"
                      >
                        <MI name="delete" size={20} />
                      </button>
                      <MI name="chevron_left" size={20} className="text-on-surface-variant" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ==================== ۴. سفرهای پرتردد اخیر ==================== */}
        <section className="mb-5">
          <div className="flex items-center justify-between px-1 mb-3">
            <h3 className="text-title-md text-on-surface flex items-center gap-1.5">
              <MI name="history" size={20} className="text-primary" />
              <span>سفرهای پرتردد اخیر</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {loading ? (
              <div className="h-28 rounded-xl bg-surface-container-lowest border border-outline-variant/40 animate-pulse sm:col-span-2" />
            ) : recentTrips.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-xl border-2 border-dashed border-outline-variant/60 p-5 text-center sm:col-span-2">
                <MI name="history" size={22} className="text-on-surface-variant mx-auto mb-2" />
                <p className="text-body-md text-on-surface-variant">
                  هنوز سفری ثبت نشده است — با اولین ناوبری، سفرها اینجا جمع می‌شوند.
                </p>
              </div>
            ) : (
              recentTrips.map((t) => {
                const plan = computeRoute(t.fromStationId, t.toStationId, "fastest", now);
                const firstLineName = plan?.legs[0]?.lineName;
                const isFrequent = (pairCounts.get(`${t.fromStationId}>${t.toStationId}`) ?? 1) > 1;
                return (
                  <div
                    key={t.id}
                    onClick={() => router.push(`/plan?from=${t.fromStationId}&to=${t.toStationId}`)}
                    className="bg-surface-container-lowest rounded-xl p-3.5 border border-outline-variant/40 shadow-sm hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-label-md text-on-surface-variant mb-2">
                      <span className="bg-surface-container px-2 py-0.5 rounded text-primary font-bold">
                        {isFrequent ? "مسیر پرتردد" : "سفر اخیر"}
                      </span>
                      <span className="text-label-sm text-on-surface-variant">{relDate(t.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-title-md text-on-surface mb-2 font-bold">
                      <span className="truncate">{t.fromName}</span>
                      <MI name="sync_alt" size={16} className="text-primary shrink-0" />
                      <span className="truncate">{t.toName}</span>
                    </div>
                    <div className="flex items-center justify-between text-body-sm pt-2 border-t border-outline-variant/20 text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <MI name="timer" size={16} className="text-on-surface-variant" />
                        {toFa(t.minutes)} دقیقه{firstLineName ? ` (${firstLineName})` : ""}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
          </>
        ) : (
          activeMode && (
            <div className="bg-surface-container-lowest rounded-2xl border-2 border-dashed border-outline-variant/50 p-8 text-center mb-6">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                  activeMode.status === "soon"
                    ? "bg-surface-container text-on-surface-variant"
                    : "bg-primary-fixed text-primary"
                }`}
              >
                <MI name={activeMode.icon} size={30} />
              </div>
              <h3 className="text-title-lg text-on-surface font-bold mb-2">ذخیره‌های {activeMode.label}</h3>
              <p className="text-body-md text-on-surface-variant leading-relaxed max-w-xs mx-auto">
                {activeMode.status === "soon"
                  ? "این بخش به‌زودی فعال می‌شود — پس از اتصال به داده رسمی، موارد ذخیره‌شده‌اش همین‌جا نمایش داده می‌شود."
                  : "هنوز موردی ذخیره نشده است — پس از استفاده از این بخش، موارد ذخیره‌شده اینجا جمع می‌شوند."}
              </p>
              {activeMode.status === "soon" && (
                <span className="inline-flex items-center gap-1 mt-4 text-[10px] font-bold text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-full">
                  <MI name="hourglass_empty" size={13} />
                  به‌زودی
                </span>
              )}
            </div>
          )
        )}

        {/* ==================== ۵. جایگاه آگهی — محتوای واقعی از پنل مدیریت (placement = saved) ==================== */}
        <PanelAdSlot placement="saved" />
      </main>

      {/* ==================== مودال راهنما ==================== */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="bg-surface-container-lowest rounded-xl max-w-sm w-full p-4 border border-outline-variant/40 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-primary">
                <MI name="info" size={22} />
                <h3 className="text-title-md font-bold text-on-surface">راهنمای مسیرهای برگزیده</h3>
              </div>
              <button
                aria-label="بستن"
                onClick={() => setHelpOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all"
              >
                <MI name="close" size={20} />
              </button>
            </div>
            <div className="space-y-2.5 text-body-sm text-on-surface-variant mb-4">
              <div className="flex items-start gap-2">
                <MI name="bookmark_add" size={18} className="text-primary shrink-0 mt-0.5" />
                <p>
                  <strong className="text-on-surface">افزودن مسیر:</strong> با دکمه «مقصد جدید» مبدا و مقصد دلخواهتان
                  را ذخیره کنید.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <MI name="edit" size={18} className="text-primary shrink-0 mt-0.5" />
                <p>
                  <strong className="text-on-surface">ویرایش و جابجایی:</strong> با زدن آیکون مداد، ایستگاه‌ها و زمان
                  یادآور تغییر می‌کند.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <MI name="navigation" size={18} className="text-primary shrink-0 mt-0.5" />
                <p>
                  <strong className="text-on-surface">ناوبری زنده:</strong> زمان‌بندی دقیق ورود قطار و راهنمای صوتی
                  گام‌به‌گام را فعال کنید.
                </p>
              </div>
            </div>
            <button
              onClick={() => setHelpOpen(false)}
              className="w-full py-2 bg-primary-container text-on-primary rounded-lg text-label-md active:scale-95 transition-all text-center"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}

      {/* ==================== مودال افزودن/ویرایش مقصد ==================== */}
      {addOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={closeAdd}
        >
          <div
            className="bg-surface-container-lowest rounded-t-2xl sm:rounded-2xl p-4 max-w-md w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-primary">
                <MI name={editing ? "edit" : "bookmark_add"} size={20} />
                <h3 className="text-title-md font-bold text-on-surface">
                  {editing ? "ویرایش مقصد" : "افزودن مقصد جدید"}
                </h3>
              </div>
              <button
                aria-label="بستن"
                onClick={closeAdd}
                className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all"
              >
                <MI name="close" size={20} />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-label-md transition-all active:scale-95 ${
                    kind === k.id
                      ? "bg-primary text-white font-bold shadow-sm"
                      : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  <MI name={k.icon} size={16} />
                  {k.label}
                </button>
              ))}
            </div>

            <StationPicker title="مبدأ" icon="trip_origin" sel={fromSel} onSelect={setFromSel} />
            <StationPicker title="مقصد" icon="location_on" sel={toSel} onSelect={setToSel} />

            <label className="block mb-3">
              <span className="text-label-md text-on-surface-variant mb-1 block">عنوان دلخواه (اختیاری)</span>
              <input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder={
                  kind === "home" ? "به سمت خانه" : kind === "work" ? "به سمت محل کار" : "مثلاً مسیر باشگاه"
                }
                className="w-full bg-surface-container rounded-xl px-3 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant border border-outline-variant/40 focus:outline-none focus:border-primary"
              />
            </label>

            {formError && (
              <p className="text-body-sm text-error mb-2 flex items-center gap-1">
                <MI name="error" size={14} />
                {formError}
              </p>
            )}

            <button
              disabled={saving}
              onClick={() => void saveDestination()}
              className="w-full py-2.5 bg-primary text-white rounded-xl text-label-lg flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-all"
            >
              <MI name={saving ? "hourglass_top" : "bookmark_add"} size={18} />
              {saving ? "در حال ذخیره..." : editing ? "ذخیره تغییرات" : "ذخیره مقصد"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
