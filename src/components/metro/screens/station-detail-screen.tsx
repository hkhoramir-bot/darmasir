"use client";

import { useEffect, useState, useCallback } from "react";
import { useMetro } from "@/lib/store";
import { MI, CrowdPill, useTicker } from "../ui";
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

/* ترتیب بر اساس دیزاین: تجهیزات، زمان‌بندی، امکانات — کلیدها بدون تغییر */
const TABS = [
  { key: "equip", label: "تجهیزات و آسانسورها", icon: "elevator" },
  { key: "time", label: "زمان‌بندی", icon: "schedule" },
  { key: "info", label: "امکانات", icon: "meeting_room" },
] as const;

/** آیکون متناسب با نوع تجهیز */
function equipIcon(type: string): string {
  if (type === "elevator") return "elevator";
  if (type === "ramp") return "accessible";
  return "escalator";
}

/** رنگ متن وضعیت تجهیز — سبز برای سالم، کهربایی برای مشکل‌دار */
function eqTone(ok: boolean): string {
  return ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400";
}

export default function StationDetailScreen({ stationId }: { stationId: string }) {
  const [data, setData] = useState<StationData | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("info");
  const [dirTab, setDirTab] = useState(0);
  const [favPending, setFavPending] = useState(false);
  const favorites = useMetro((s) => s.favorites);
  const toggleFavoriteLocal = useMetro((s) => s.toggleFavoriteLocal);
  const setFavorites = useMetro((s) => s.setFavorites);
  const now = useTicker(20000);
  const { announce, speaking, stop } = useAnnouncer();

  const load = useCallback(async () => {
    const res = await fetch(`/api/stations/${stationId}`);
    if (res.ok) setData(await res.json());
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

  /* آمار کلی تجهیزات — مبنای نشان وضعیت ایستگاه و نوار پیشرفت */
  const totalEq = data.equipment.reduce((s, e) => s + e.total, 0);
  const activeEq = data.equipment.reduce((s, e) => s + e.active, 0);
  const eqPct = totalEq > 0 ? Math.round((activeEq / totalEq) * 100) : 100;
  const eqNormal = totalEq === 0 || activeEq / totalEq >= 0.9;

  /* سایر خطوط ایستگاه برای بخش «مسیر تبادلی مستقیم» */
  const otherLines = data.isInterchange ? data.lines.slice(1) : [];

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
      {/* ---------- هدر ایستگاه ---------- */}
      <section className="bg-metro-card rounded-2xl border border-metro-outline-var/40 p-4 shadow-sm space-y-3">
        {/* عنوان + اکشن‌ها (بازگشت با هدر کلی برنامه) */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-metro-onsurface leading-snug">{data.name}</h2>
            <p className="text-[11px] text-metro-onvar flex items-center gap-1 mt-0.5">
              <MI name="stairs" size={13} />
              عمق {data.depthLabel}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={toggleFav}
              disabled={favPending}
              aria-label={isFav ? "حذف از نشان‌شده‌ها" : "افزودن به نشان‌شده‌ها"}
              className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-all ${
                isFav ? "bg-amber-500/10 text-amber-400" : "bg-metro-c-low text-metro-outline hover:text-metro-primary"
              }`}
            >
              <MI name="star" size={20} fill={isFav} />
            </button>
            <button
              onClick={() => (speaking ? stop() : announce(`${data.name}، قطار بعدی ${mainLine.arrivalsMin[0]} دقیقه دیگر وارد ایستگاه می‌شود.`))}
              aria-label="اعلام صوتی"
              className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-all ${
                speaking ? "bg-metro-primary/10 text-metro-primary" : "bg-metro-c-low text-metro-outline hover:text-metro-primary"
              }`}
            >
              <MI name={speaking ? "stop_circle" : "record_voice_over"} size={20} />
            </button>
          </div>
        </div>

        {/* نشان خطوط + وضعیت + تقاطعی */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {data.lines.map((l) => (
            <span
              key={l.id}
              className="rounded-full px-2 py-1 text-[10px] font-bold shadow-sm"
              style={{ backgroundColor: l.color, color: l.textOnColor }}
            >
              خط {toFa(l.number)}
            </span>
          ))}
          {data.isInterchange && (
            <span className="bg-metro-fixed/60 text-metro-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
              ایستگاه تقاطعی
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
              eqNormal
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${eqNormal ? "bg-emerald-500" : "bg-amber-500"}`} />
            {eqNormal ? "وضعیت عادی" : "وضعیت محدود"}
          </span>
        </div>

        {/* ورودهای زنده هر خط */}
        <div className="space-y-2">
          {data.lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between bg-metro-c-low rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-xs font-bold text-metro-onsurface truncate">
                  {l.name} — به سمت {l.terminals[1]}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-bold text-metro-tertiary bg-metro-card px-2 py-0.5 rounded-lg">
                  {toFa(l.arrivalsMin[0])} دقیقه
                </span>
                <span className="text-[10px] text-metro-outline">سپس {toFa(l.arrivalsMin[1])}</span>
                <CrowdPill level={l.crowd} label={l.crowdLabel} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- تب‌ها (حبابی) ---------- */}
      <div className="flex items-center gap-1 bg-metro-c rounded-full p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 h-9 rounded-full text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
              tab === t.key ? "bg-primary text-white shadow-sm" : "text-metro-onvar"
            }`}
          >
            <MI name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- تب تجهیزات ---------- */}
      {tab === "equip" && (
        <div className="space-y-4 fade-in">
          {/* خلاصه گروه‌های تجهیزات */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 bg-metro-tertiary-c rounded-full" />
                <h3 className="text-sm font-bold text-metro-onsurface">وضعیت پله‌برقی‌ها و آسانسورها</h3>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                  eqNormal
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${eqNormal ? "bg-emerald-500" : "bg-amber-500"}`} />
                {eqNormal ? "وضعیت عادی" : "وضعیت محدود"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {data.equipment.map((eq) => {
                const ok = eq.active >= eq.total;
                return (
                  <div
                    key={eq.type}
                    className={`bg-metro-card rounded-xl border border-metro-outline-var/40 border-r-4 p-3 shadow-sm ${
                      ok ? "border-r-emerald-500" : "border-r-amber-500"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-metro-onvar mb-1">
                      <span className="font-medium">{eq.typeLabel}</span>
                      <MI name={equipIcon(eq.type)} size={16} className={eqTone(ok)} />
                    </div>
                    <p className={`text-sm font-extrabold ${eqTone(ok)}`}>
                      {toFa(eq.active)} از {toFa(eq.total)} فعال
                    </p>
                    <p className="text-[10px] text-metro-onvar/80 mt-0.5 truncate">
                      {eq.note ?? (ok ? "همه دستگاه‌ها فعال" : "در حال سرویس")}
                    </p>
                  </div>
                );
              })}
            </div>
            {/* پیشرفت کلی تجهیزات ایستگاه */}
            <div className="bg-metro-card rounded-xl border border-metro-outline-var/40 p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-metro-onsurface flex items-center gap-1.5">
                  <MI name="checklist" size={15} className="text-metro-primary-c" />
                  مجموع تجهیزات ایستگاه
                </h4>
                <span className="text-[11px] font-bold text-metro-onsurface">
                  {toFa(activeEq)} از {toFa(totalEq)} تجهیزات فعال
                </span>
              </div>
              <div className="h-2.5 bg-metro-c rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${eqNormal ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${eqPct}%` }}
                />
              </div>
              <span className="block text-left text-[10px] font-bold text-metro-onvar mt-1">{toFa(eqPct)}٪</span>
            </div>
          </section>

          {/* مسیر تبادلی مستقیم — فقط ایستگاه تقاطعی */}
          {data.isInterchange && otherLines.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                  <h3 className="text-sm font-bold text-metro-onsurface">مسیر تبادلی مستقیم</h3>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  بدون خروج از گیت
                </span>
              </div>
              <div className="bg-metro-card rounded-2xl border border-metro-outline-var/40 p-3.5 shadow-sm space-y-2">
                {otherLines.map((l) => (
                  <div key={l.id} className="flex items-center gap-2.5 bg-metro-c-low rounded-xl px-3 py-2.5">
                    <span
                      className="rounded-lg px-2 py-1 text-[10px] font-bold shadow-sm shrink-0"
                      style={{ backgroundColor: l.color, color: l.textOnColor }}
                    >
                      خط {toFa(l.number)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-metro-onsurface">تبدیل به {l.name}</p>
                      <p className="text-[10px] text-metro-onvar flex items-center gap-1 mt-0.5">
                        <MI name="sync_alt" size={12} />
                        {l.terminals[0]} ↔ {l.terminals[1]}
                      </p>
                    </div>
                    <MI name="subway" size={16} className="text-metro-outline shrink-0" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* جزئیات هر تجهیز */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 bg-metro-primary-c rounded-full" />
              <h3 className="text-sm font-bold text-metro-onsurface">جزئیات تجهیزات</h3>
            </div>
            {data.equipment.map((eq) => {
              const pct = Math.round((eq.active / eq.total) * 100);
              const ok = pct >= 100;
              return (
                <div key={eq.type} className="bg-metro-card rounded-xl border border-metro-outline-var/40 p-3 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-metro-onsurface flex items-center gap-1.5">
                      <MI name={equipIcon(eq.type)} size={16} className="text-metro-primary-c" />
                      {eq.typeLabel}
                    </p>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ok ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {ok ? "فعال" : "محدود"} — {toFa(eq.active)} از {toFa(eq.total)}
                    </span>
                  </div>
                  <div className="h-2 bg-metro-c-low rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${ok ? "bg-emerald-500" : "bg-amber-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {eq.note && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                      <MI name="info" size={12} />
                      {eq.note}
                    </p>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* ---------- تب زمان‌بندی ---------- */}
      {tab === "time" && (
        <div className="space-y-3 fade-in">
          {/* انتخاب جهت */}
          <div className="flex items-center gap-2" role="tablist" aria-label="جهت قطار">
            {mainLine.firstLast.map((t, i) => (
              <button
                key={t.direction}
                role="tab"
                aria-selected={dirTab === i}
                onClick={() => setDirTab(i)}
                className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
                  dirTab === i ? "bg-primary text-white shadow-sm" : "bg-metro-card text-metro-onvar border border-metro-outline-var/40"
                }`}
              >
                {t.direction}
              </button>
            ))}
          </div>
          <section className="bg-metro-card rounded-2xl border border-metro-outline-var/40 p-4 shadow-sm space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 bg-metro-primary-c rounded-full" />
              <h3 className="text-sm font-bold text-metro-onsurface">زمان‌بندی حرکت قطارها</h3>
            </div>
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

      {/* ---------- تب امکانات ---------- */}
      {tab === "info" && (
        <div className="space-y-4 fade-in">
          {/* امکانات و خدمات ایستگاه */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 bg-metro-primary-c rounded-full" />
                <h3 className="text-sm font-bold text-metro-onsurface">امکانات و خدمات ایستگاه</h3>
              </div>
              <span className="text-[10px] text-metro-outline">{toFa(data.amenities.length)} خدمت</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {data.amenities.map((a) => (
                <div
                  key={a.key}
                  className="bg-metro-card rounded-xl border border-metro-outline-var/40 p-3 shadow-sm flex items-center gap-2.5"
                >
                  <span className="w-8 h-8 rounded-lg bg-metro-fixed/40 text-metro-primary-c flex items-center justify-center shrink-0">
                    <MI name={a.icon} size={17} />
                  </span>
                  <span className="text-[11px] font-bold text-metro-onsurface leading-snug">{a.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* خروجی‌ها و گیت‌ها */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 bg-metro-primary-c rounded-full" />
                <h3 className="text-sm font-bold text-metro-onsurface">خروجی‌ها و گیت‌ها</h3>
              </div>
              <span className="text-[10px] text-metro-outline">{toFa(data.exits.length)} خروجی فعال</span>
            </div>
            <div className="space-y-2">
              {data.exits.map((e) => (
                <div key={e.label} className="bg-metro-card rounded-xl border border-metro-outline-var/40 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-metro-onsurface flex items-center gap-1.5 min-w-0">
                      <MI name="door_open" size={15} className="text-metro-primary-c shrink-0" />
                      <span className="truncate">
                        {e.label} — {e.direction}
                      </span>
                    </p>
                    <span className="text-[10px] font-bold text-metro-tertiary bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                      {e.accessibility}
                    </span>
                  </div>
                  {e.landmarks.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-metro-outline-var/30 flex-wrap">
                      {e.landmarks.map((lm) => (
                        <span
                          key={lm}
                          className="text-[10px] text-metro-onvar bg-metro-c-low px-1.5 py-0.5 rounded-md flex items-center gap-0.5"
                        >
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

          {/* نقاط شاخص اطراف */}
          {data.landmarks.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 bg-metro-primary-c rounded-full" />
                <h3 className="text-sm font-bold text-metro-onsurface">نقاط شاخص اطراف</h3>
              </div>
              <div className="bg-metro-card rounded-xl border border-metro-outline-var/40 shadow-sm overflow-hidden divide-y divide-metro-outline-var/30">
                {data.landmarks.map((lm) => (
                  <div key={lm} className="flex items-center gap-2.5 px-3 py-2.5">
                    <span className="w-7 h-7 rounded-lg bg-metro-fixed/40 text-metro-primary-c flex items-center justify-center shrink-0">
                      <MI name="place" size={15} />
                    </span>
                    <span className="text-xs font-medium text-metro-onsurface flex-1">{lm}</span>
                    <MI name="chevron_left" size={16} className="text-metro-outline/70" />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
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
      <span className={`text-sm font-extrabold ${highlight ? "text-metro-primary" : "text-metro-onsurface"}`}>{value}</span>
    </div>
  );
}
