"use client";

import { useEffect, useState, useCallback } from "react";
import { nav, useMetro } from "@/lib/store";
import { MI, LineBadge, CrowdPill, useTicker } from "../ui";
import { toFa } from "@/lib/metro-data";
import { useAnnouncer } from "../voice";

interface StationData {
  id: string;
  name: string;
  isInterchange: boolean;
  depthLabel: string;
  lines: {
    id: string;
    number: number;
    name: string;
    color: string;
    textOnColor: string;
    terminals: [string, string];
    headway: number;
    arrivalsMin: number[];
    crowd: "quiet" | "moderate" | "busy";
    crowdLabel: string;
    firstLast: { direction: string; first: string; last: string }[];
  }[];
  amenities: { key: string; label: string; icon: string }[];
  exits: { label: string; direction: string; accessibility: string; landmarks: string[] }[];
  equipment: { type: string; typeLabel: string; total: number; active: number; note?: string }[];
  landmarks: string[];
}

interface Report {
  id: string;
  equipmentType: string;
  equipmentLabel: string;
  exitLabel: string;
  status: string;
  statusLabel: string;
  note?: string;
  createdAt: string;
}

const TABS = [
  { key: "info", label: "امکانات", icon: "meeting_room" },
  { key: "time", label: "زمان‌بندی", icon: "schedule" },
  { key: "equip", label: "وضعیت تجهیزات", icon: "elevator" },
  { key: "reports", label: "گزارش مسافران", icon: "forum" },
] as const;

export default function StationDetailScreen({ stationId }: { stationId: string }) {
  const [data, setData] = useState<StationData | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("info");
  const [dirTab, setDirTab] = useState(0);
  const [reports, setReports] = useState<Report[]>([]);
  const [favPending, setFavPending] = useState(false);
  const favorites = useMetro((s) => s.favorites);
  const toggleFavoriteLocal = useMetro((s) => s.toggleFavoriteLocal);
  const setFavorites = useMetro((s) => s.setFavorites);
  const now = useTicker(20000);
  const { announce, speaking, stop } = useAnnouncer();

  const load = useCallback(async () => {
    const res = await fetch(`/api/stations/${stationId}`);
    if (res.ok) setData(await res.json());
    const r = await fetch(`/api/reports?station=${stationId}`);
    const rd = await r.json();
    setReports(rd.reports ?? []);
  }, [stationId]);

  useEffect(() => {
    load();
  }, [load, now]);

  if (!data) {
    return (
      <main className="max-w-md mx-auto p-4 space-y-3">
        <div className="h-28 shimmer rounded-2xl" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 shimmer rounded-2xl" />
        ))}
      </main>
    );
  }

  const isFav = favorites.includes(data.id);
  const mainLine = data.lines[0];

  const toggleFav = async () => {
    setFavPending(true);
    try {
      if (isFav) {
        await fetch(`/api/favorites?stationId=${data.id}`, { method: "DELETE" });
        toggleFavoriteLocal(data.id);
      } else {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stationId: data.id }),
        });
        toggleFavoriteLocal(data.id);
      }
      const r = await fetch("/api/favorites").then((x) => x.json());
      setFavorites(r.ids ?? []);
    } finally {
      setFavPending(false);
    }
  };

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-3">
      {/* هدر ایستگاه */}
      <section className="bg-white rounded-2xl border border-metro-outline-var/40 p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center -space-x-1.5 space-x-reverse">
              {data.lines.map((l) => (
                <LineBadge key={l.id} number={l.number} color={l.color} textOn={l.textOnColor} size="lg" />
              ))}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {data.isInterchange && (
                  <span className="bg-metro-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                    ایستگاه تقاطعی
                  </span>
                )}
                <span className="bg-metro-c text-metro-onvar text-[9px] font-bold px-1.5 py-0.5 rounded">
                  مرکز شهر
                </span>
              </div>
              <h1 className="text-lg font-extrabold text-metro-onsurface mt-1 truncate">{data.name}</h1>
              <p className="text-[11px] text-metro-onvar flex items-center gap-1 mt-0.5">
                <MI name="stairs" size={13} />
                عمق {data.depthLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={toggleFav}
              disabled={favPending}
              aria-label={isFav ? "حذف از نشان‌شده‌ها" : "افزودن به نشان‌شده‌ها"}
              className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all ${
                isFav ? "bg-amber-100 text-amber-600" : "bg-metro-c-low text-metro-outline hover:text-metro-primary"
              }`}
            >
              <MI name="star" size={19} fill={isFav} />
            </button>
            <button
              onClick={() => announce(`${data.name}، قطار بعدی ${mainLine.arrivalsMin[0]} دقیقه دیگر وارد ایستگاه می‌شود.`)}
              aria-label="اعلام صوتی"
              className="w-9 h-9 rounded-xl bg-metro-c-low text-metro-outline hover:text-metro-primary flex items-center justify-center active:scale-95 transition-all"
            >
              <MI name={speaking ? "stop_circle" : "record_voice_over"} size={19} />
            </button>
          </div>
        </div>

        {/* خطوط و arrivals زنده */}
        <div className="mt-3 space-y-2">
          {data.lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between bg-metro-c-low rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-xs font-bold text-metro-onsurface truncate">
                  {l.name} — به سمت {l.terminals[1]}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-bold text-metro-tertiary bg-white px-2 py-0.5 rounded-lg">
                  {toFa(l.arrivalsMin[0])} دقیقه
                </span>
                <span className="text-[10px] text-metro-outline">سپس {toFa(l.arrivalsMin[1])}</span>
                <CrowdPill level={l.crowd} label={l.crowdLabel} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* تب‌ها */}
      <div className="flex items-center gap-1 bg-white rounded-2xl p-1 border border-metro-outline-var/40" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-1.5 rounded-xl text-[10.5px] font-bold flex flex-col items-center gap-0.5 transition-all active:scale-95 ${
              tab === t.key ? "bg-metro-primary text-white shadow-sm" : "text-metro-onvar"
            }`}
          >
            <MI name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- تب امکانات ---- */}
      {tab === "info" && (
        <div className="space-y-3 fade-in">
          <section className="bg-white rounded-2xl border border-metro-outline-var/40 p-3.5">
            <h3 className="text-xs font-bold text-metro-onsurface flex items-center gap-1.5 mb-2.5">
              <MI name="checklist" size={16} className="text-metro-primary-c" />
              امکانات ایستگاه
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {data.amenities.map((a) => (
                <div key={a.key} className="flex items-center gap-2 bg-metro-c-low rounded-xl px-3 py-2">
                  <MI name={a.icon} size={17} className="text-metro-primary-c" />
                  <span className="text-[11px] font-medium text-metro-onsurface">{a.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-metro-outline-var/40 p-3.5">
            <h3 className="text-xs font-bold text-metro-onsurface flex items-center gap-1.5 mb-2.5">
              <MI name="door_open" size={16} className="text-metro-primary-c" />
              خروجی‌ها و گیت‌ها ({toFa(data.exits.length)} خروجی فعال)
            </h3>
            <div className="space-y-2">
              {data.exits.map((e) => (
                <div key={e.label} className="border border-metro-outline-var/30 rounded-xl p-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-metro-onsurface">
                      {e.label} — {e.direction}
                    </p>
                    <span className="text-[10px] font-bold text-metro-tertiary bg-emerald-50 px-1.5 py-0.5 rounded">
                      {e.accessibility}
                    </span>
                  </div>
                  {e.landmarks.length > 0 && (
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {e.landmarks.map((lm) => (
                        <span key={lm} className="text-[10px] text-metro-onvar bg-metro-c-low px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <MI name="place" size={11} />
                          {lm}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {data.landmarks.length > 0 && (
            <section className="bg-white rounded-2xl border border-metro-outline-var/40 p-3.5">
              <h3 className="text-xs font-bold text-metro-onsurface flex items-center gap-1.5 mb-2.5">
                <MI name="account_balance" size={16} className="text-metro-primary-c" />
                مراکز مهم اطراف
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {data.landmarks.map((lm) => (
                  <span key={lm} className="text-[11px] font-medium text-metro-primary bg-metro-fixed/60 px-2.5 py-1 rounded-full">
                    {lm}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ---- تب زمان‌بندی ---- */}
      {tab === "time" && (
        <div className="space-y-3 fade-in">
          <div className="flex items-center gap-2" role="tablist" aria-label="جهت قطار">
            {mainLine.firstLast.map((t, i) => (
              <button
                key={t.direction}
                role="tab"
                aria-selected={dirTab === i}
                onClick={() => setDirTab(i)}
                className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ${
                  dirTab === i ? "bg-metro-primary text-white shadow-sm" : "bg-white text-metro-onvar border border-metro-outline-var/40"
                }`}
              >
                {t.direction}
              </button>
            ))}
          </div>
          <section className="bg-white rounded-2xl border border-metro-outline-var/40 p-4 space-y-3">
            {(() => {
              const t = mainLine.firstLast[dirTab];
              return (
                <>
                  <TimeRow icon="wb_twilight" label="اولین قطار" value={t.first} />
                  <TimeRow icon="bedtime" label="آخرین قطار" value={t.last} />
                  <TimeRow icon="timer" label="سرفاصله حرکت" value={`${toFa(mainLine.headway)} دقیقه`} />
                  <TimeRow
                    icon="tram"
                    label="قطار بعدی از این ایستگاه"
                    value={`${toFa(mainLine.arrivalsMin[0])} دقیقه`}
                    highlight
                  />
                </>
              );
            })()}
          </section>
        </div>
      )}

      {/* ---- تب تجهیزات ---- */}
      {tab === "equip" && (
        <div className="space-y-3 fade-in">
          <section className="bg-white rounded-2xl border border-metro-outline-var/40 p-3.5 space-y-3">
            <h3 className="text-xs font-bold text-metro-onsurface flex items-center gap-1.5">
              <MI name="elevator" size={16} className="text-metro-primary-c" />
              وضعیت پله‌برقی‌ها و آسانسورها — به‌روزرسانی لحظه‌ای مسافران
            </h3>
            {data.equipment.map((eq) => {
              const pct = Math.round((eq.active / eq.total) * 100);
              return (
                <div key={eq.type} className="border border-metro-outline-var/30 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-metro-onsurface flex items-center gap-1">
                      <MI name={eq.type === "elevator" ? "elevator" : eq.type === "ramp" ? "accessible" : "escalator"} size={16} className="text-metro-primary-c" />
                      {eq.typeLabel}
                    </p>
                    <span className={`text-[11px] font-bold ${pct >= 100 ? "text-metro-tertiary" : "text-amber-600"}`}>
                      {toFa(eq.active)} از {toFa(eq.total)} فعال
                    </span>
                  </div>
                  <div className="h-2 bg-metro-c rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-metro-tertiary" : "bg-amber-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {eq.note && <p className="text-[10px] text-amber-700 mt-1.5">{eq.note}</p>}
                </div>
              );
            })}
          </section>

          <button
            onClick={() => nav.go("status")}
            className="w-full bg-metro-error-c/60 border border-metro-error/20 rounded-2xl p-3 flex items-center justify-between active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-2.5">
              <MI name="report_problem" size={20} className="text-metro-error" />
              <p className="text-xs font-bold text-metro-error">گزارش خرابی تجهیزات این ایستگاه</p>
            </div>
            <MI name="chevron_left" size={18} className="text-metro-error/70" />
          </button>
        </div>
      )}

      {/* ---- تب گزارش‌ها ---- */}
      {tab === "reports" && (
        <ReportForm
          stationId={data.id}
          stationName={data.name}
          exits={data.exits.map((e) => e.label)}
          reports={reports}
          onReload={load}
        />
      )}
    </main>
  );
}

function TimeRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${highlight ? "bg-metro-fixed/60" : "bg-metro-c-low"}`}>
      <span className="flex items-center gap-2 text-xs text-metro-onvar">
        <MI name={icon} size={17} className="text-metro-primary-c" />
        {label}
      </span>
      <span className={`text-sm font-bold ${highlight ? "text-metro-primary" : "text-metro-onsurface"}`}>{value}</span>
    </div>
  );
}

/* ---------------- فرم گزارش مسافر ---------------- */
function ReportForm({
  stationId,
  stationName,
  exits,
  reports,
  onReload,
}: {
  stationId: string;
  stationName: string;
  exits: string[];
  reports: Report[];
  onReload: () => void;
}) {
  const [equipmentType, setEquipmentType] = useState("escalator");
  const [exitLabel, setExitLabel] = useState(exits[0] ?? "ورودی اصلی");
  const [status, setStatus] = useState("malfunction");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setSending(true);
    try {
      await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId, equipmentType, exitLabel, status, note }),
      });
      setDone(true);
      setNote("");
      onReload();
      setTimeout(() => setDone(false), 3500);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 fade-in">
      <section className="bg-white rounded-2xl border border-metro-outline-var/40 p-3.5 space-y-3">
        <h3 className="text-xs font-bold text-metro-onsurface flex items-center gap-1.5">
          <MI name="add_task" size={16} className="text-metro-primary-c" />
          ثبت گزارش لحظه‌ای عملکرد تجهیزات
        </h3>
        <div>
          <p className="text-[10px] text-metro-onvar mb-1.5 font-bold">نوع دستگاه</p>
          <div className="flex items-center gap-1.5">
            {[
              { k: "escalator", l: "پله‌برقی" },
              { k: "elevator", l: "آسانسور" },
              { k: "ramp", l: "رمپ متحرک" },
            ].map((o) => (
              <button
                key={o.k}
                onClick={() => setEquipmentType(o.k)}
                className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ${
                  equipmentType === o.k ? "bg-metro-primary text-white" : "bg-metro-c-low text-metro-onvar"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-metro-onvar mb-1.5 font-bold">موقعیت</p>
          <select
            value={exitLabel}
            onChange={(e) => setExitLabel(e.target.value)}
            className="w-full bg-metro-c-low border border-metro-outline-var/40 rounded-xl px-3 py-2 text-xs text-metro-onsurface focus:outline-none"
          >
            {[...exits, "ورودی اصلی", "سکوی اصلی"].map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-[10px] text-metro-onvar mb-1.5 font-bold">وضعیت مشاهده‌شده</p>
          <div className="flex items-center gap-1.5">
            {[
              { k: "malfunction", l: "متوقف و خاموش", c: "text-metro-error" },
              { k: "under_maintenance", l: "در حال سرویس فنی", c: "text-amber-600" },
              { k: "working", l: "فعال و روان", c: "text-metro-tertiary" },
            ].map((o) => (
              <button
                key={o.k}
                onClick={() => setStatus(o.k)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-all ${
                  status === o.k ? "bg-white border-2 border-metro-primary-c" : "bg-metro-c-low border border-transparent"
                } ${status === o.k ? o.c : "text-metro-onvar"}`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="توضیح اختیاری برای سایر مسافران..."
          rows={2}
          className="w-full bg-metro-c-low border border-metro-outline-var/40 rounded-xl px-3 py-2 text-xs text-metro-onsurface focus:outline-none resize-none"
        />
        <button
          onClick={submit}
          disabled={sending}
          className="w-full py-2.5 bg-metro-primary-c text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-60"
        >
          <MI name="send" size={16} />
          {sending ? "در حال ارسال..." : "ارسال گزارش مسافر"}
        </button>
        {done && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-2 fade-in">
            <MI name="check_circle" size={17} className="text-metro-tertiary" fill />
            <p className="text-[11px] text-metro-tertiary font-bold">
              گزارش شما با موفقیت ثبت شد. سپاس از یاری شما!
            </p>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-metro-outline-var/40 p-3.5">
        <h3 className="text-xs font-bold text-metro-onsurface flex items-center gap-1.5 mb-2.5">
          <MI name="forum" size={16} className="text-metro-primary-c" />
          گزارش‌های اخیر {stationName}
        </h3>
        {reports.length === 0 && (
          <p className="text-[11px] text-metro-outline text-center py-3">هنوز گزارشی ثبت نشده است</p>
        )}
        <div className="space-y-2 max-h-64 overflow-y-auto pretty-scroll">
          {reports.map((r) => (
            <div key={r.id} className="bg-metro-c-low rounded-xl p-2.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-metro-onsurface">
                  {r.equipmentLabel} — {r.exitLabel}
                </p>
                <p className="text-[10px] text-metro-onvar mt-0.5">
                  {new Date(r.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                  {r.note ? ` • ${r.note}` : ""}
                </p>
              </div>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  r.status === "working"
                    ? "bg-emerald-50 text-metro-tertiary"
                    : r.status === "under_maintenance"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-red-50 text-metro-error"
                }`}
              >
                {r.statusLabel}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
