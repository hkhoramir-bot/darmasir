"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  amenitiesLabels,
  CROWD_COLOR,
  equipmentFor,
  exitsFor,
  getLine,
  getStation,
  headwayAt,
  landmarksFor,
  nextArrivalsBoth,
  timetableFor,
  toFa,
  type DirectionalArrival,
  type EquipmentStatus,
  type StationDef,
  type TimetableRow,
} from "@/lib/metro-data";
import { nearestStationTo } from "@/lib/station-geo";
import { getCurrentGeoBest } from "@/lib/geo";
import { MI, PageHeader } from "@/components/metro/shell";
import { useAnnouncer } from "@/components/metro/voice";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   جزئیات ایستگاه — نمونه ادغام‌شده طرح‌های _8/_20/_15/_19/_9/_4/_6
   خط‌بندی، قطارهای زنده، امکانات، تجهیزات، طبقات، تعویض خط،
   خروجی‌ها و تاکسی/BRT، جدول اعزام، مراکز، مسیریابی و بیدارباش
   ============================================================ */

type WakeMinutes = 1 | 2 | 3;
type EquipState = "ok" | "partial" | "broken";

/* رنگ وضعیت تجهیزات — هم‌خانواده با CROWD_COLOR */
const EQUIP_COLOR: Record<EquipState, string> = {
  ok: "#006638",
  partial: "#b45309",
  broken: "#bc000c",
};
const EQUIP_BADGE: Record<EquipState, string> = {
  ok: "فعال",
  partial: "تعمیر",
  broken: "از کار افتاده",
};
const EQUIP_ICON: Record<EquipmentStatus["type"], string> = {
  escalator: "escalator",
  elevator: "elevator",
  ramp: "transfer_within_a_station",
};

/* برچسب وضعیت هر امکان — مطابق طراحی _20 */
const AMENITY_STATE: Record<string, string> = {
  elevator: "فعال",
  escalator: "فعال",
  wc: "دایر",
  atm: "مستقر",
  baby: "آماده",
  parking: "دایر",
  bus: "متصل",
  taxi: "مستقر",
  bike: "فعال",
  wifi: "فعال",
};

/* زمان «آخرین بازدید» — قطعی بر اساس شناسه ایستگاه (بدون اختلاف hydrate) */
function lastCheckText(id: string, type: string): string {
  const seed = (id + type).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const hh = 6 + (seed % 14);
  const mm = seed % 60;
  return `${toFa(hh)}:${toFa(String(mm).padStart(2, "0"))}`;
}

/* انتخاب رنگ چیپ دسترسی خروجی — مطابق _8 */
function accChipClass(a: string): string {
  if (a.includes("آسانسور")) return "bg-primary-fixed text-on-primary-fixed-variant";
  if (a.includes("پله")) return "bg-tertiary-fixed/30 text-tertiary";
  return "bg-surface-container text-on-surface-variant";
}

/* ------------------------- ایستگاه یافت نشد ------------------------- */
function NotFound() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="ایستگاه یافت نشد" />
      <main className="flex-1 w-full px-4 pt-3 pb-28">
        <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 shadow-sm flex flex-col items-center text-center gap-3 mt-10">
          <div className="w-14 h-14 rounded-full bg-error-container flex items-center justify-center text-error shrink-0">
            <MI name="search_off" size={28} />
          </div>
          <h2 className="font-bold text-sm text-on-surface">ایستگاه یافت نشد</h2>
          <p className="text-xs text-on-surface-variant leading-6">
            ایستگاه مورد نظر در شبکه مترو وجود ندارد یا آدرس وارد شده اشتباه است.
          </p>
          <button
            type="button"
            onClick={() => router.push("/stations")}
            className="bg-primary-container text-white rounded-xl font-bold text-xs py-2.5 px-6 shadow-sm active:scale-[0.98] transition-all"
          >
            مشاهده همه ایستگاه‌ها
          </button>
        </div>
      </main>
    </>
  );
}

/* ------------------------- صفحه اصلی ------------------------- */
export default function StationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const station = useMemo(() => getStation(id), [id]);

  if (!station) return <NotFound />;
  return <StationDetail key={id} station={station} />;
}

interface LevelCard {
  icon: string;
  name: string;
  accent?: string;
  info: string;
  detail: string[];
}

function StationDetail({ station }: { station: StationDef }) {
  const router = useRouter();
  const { toast } = useToast();
  const announcer = useAnnouncer();
  const id = station.id;
  const isInterchange = station.lines.length > 1;

  /* ---------- وضعیت‌های محلی ---------- */
  const [lineIdx, setLineIdx] = useState(0);
  const [isFav, setIsFav] = useState(false);
  const [favPending, setFavPending] = useState(false);
  const [arrivals, setArrivals] = useState<Record<string, DirectionalArrival[]> | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  const [timetable, setTimetable] = useState<TimetableRow[] | null>(null);
  const [levelOpen, setLevelOpen] = useState<number | null>(0);
  const [wakeOn, setWakeOn] = useState(false);
  const [wakeMin, setWakeMin] = useState<WakeMinutes>(2);
  const [nearest, setNearest] = useState<{ distanceM: number } | null>(null);

  /* ---------- داده‌های ثابت ایستگاه ---------- */
  const amenities = useMemo(() => amenitiesLabels(station.amenities), [station.amenities]);
  const exits = useMemo(() => exitsFor(station.id), [station.id]);
  const equipment = useMemo(() => equipmentFor(station.id), [station.id]);
  const landmarks = useMemo(() => landmarksFor(station.id), [station.id]);

  const activeLs = station.lines[lineIdx] ?? station.lines[0];
  const selectedLine = getLine(activeLs.lineId);
  const headwayNow = nowMin !== null ? headwayAt(selectedLine, nowMin) : selectedLine.headway;

  /* ---------- تابلوی زنده هر دو جهت — بروزرسانی هر ۳۰ ثانیه ---------- */
  useEffect(() => {
    let alive = true;
    const build = () => {
      const now = Date.now();
      const d = new Date(now);
      const nm = d.getHours() * 60 + d.getMinutes();
      const map: Record<string, DirectionalArrival[]> = {};
      for (const ls of station.lines) map[ls.lineId] = nextArrivalsBoth(ls.lineId, station.id, now);
      if (alive) {
        setArrivals(map);
        setNowMin(nm);
      }
    };
    build();
    const t = setInterval(build, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [station]);

  /* ---------- جدول اعزام — وابسته به روز هفته، فقط سمت کلاینت ---------- */
  useEffect(() => {
    setTimetable(timetableFor(selectedLine.id));
  }, [selectedLine.id]);

  /* ---------- نشان‌ها (favorites API) ---------- */
  useEffect(() => {
    let alive = true;
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((d: { ids?: string[] }) => {
        if (alive) setIsFav(!!d.ids?.includes(id));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  const toggleFav = async () => {
    if (favPending) return;
    setFavPending(true);
    const next = !isFav;
    setIsFav(next);
    try {
      if (next) {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stationId: id }),
        });
        if (!res.ok) throw new Error();
        toast({ title: "به نشان‌ها اضافه شد", description: `${station.name} به فهرست نشان‌شده‌ها اضافه شد` });
      } else {
        const res = await fetch(`/api/favorites?stationId=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        toast({ title: "از نشان‌ها حذف شد", description: `${station.name} از فهرست نشان‌شده‌ها حذف شد` });
      }
    } catch {
      setIsFav(!next);
      toast({ title: "خطا در ارتباط با سرور", description: "لطفاً دوباره تلاش کنید", variant: "destructive" });
    } finally {
      setFavPending(false);
    }
  };

  /* ---------- اعلام صوتی (حفظ منطق قبلی) ---------- */
  const speak = useCallback(() => {
    const first = arrivals?.[selectedLine.id]?.[0];
    if (!first || first.outOfService || first.minutes.length === 0) {
      announcer.announce(`ایستگاه ${station.name}. در حال حاضر قطاری در سرویس نیست`).catch(() => {});
      return;
    }
    const m = first.minutes[0];
    const mins = m > 90 ? `ساعت ${first.at[0] ?? ""}` : `${toFa(m)} دقیقه`;
    announcer
      .announce(`ایستگاه ${station.name}. قطار بعدی به سمت ${first.to}، ${mins}`)
      .catch(() => {});
  }, [arrivals, announcer, selectedLine, station.name]);

  /* ---------- اشتراک‌گذاری ---------- */
  const share = async () => {
    const text = `ایستگاه مترو ${station.name} — درمسیر`;
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "درمسیر", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast({ title: "لینک ایستگاه کپی شد", description: "برای اشتراک‌گذاری آماده است" });
    } catch {
      /* کاربر اشتراک‌گذاری را لغو کرد */
    }
  };

  /* ---------- بیدارباش در این ایستگاه (metrojo-wake-{id}) ---------- */
  const WAKE_KEY = `metrojo-wake-${id}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WAKE_KEY);
      if (!raw) return;
      const w = JSON.parse(raw) as { on?: boolean; minutes?: number };
      setWakeOn(!!w.on);
      if (w.minutes === 1 || w.minutes === 2 || w.minutes === 3) setWakeMin(w.minutes);
    } catch {}
  }, [WAKE_KEY]);

  const saveWake = (on: boolean, minutes: WakeMinutes) => {
    try {
      localStorage.setItem(WAKE_KEY, JSON.stringify({ on, minutes, stationId: id, stationName: station.name }));
    } catch {}
  };

  const pickWake = (m: WakeMinutes) => {
    setWakeMin(m);
    if (wakeOn) {
      saveWake(true, m);
      toast({ title: "تنظیم بیدارباش بروزرسانی شد", description: `${toFa(m)} دقیقه پیش از رسیدن بیدار می‌شوید` });
    }
  };

  const toggleWake = () => {
    const next = !wakeOn;
    setWakeOn(next);
    saveWake(next, wakeMin);
    if (next) {
      toast({ title: "بیدارباش فعال شد", description: `${toFa(wakeMin)} دقیقه پیش از ${station.name} بیدار می‌شوید` });
      announcer
        .announce(`بیدارباش فعال شد. ${toFa(wakeMin)} دقیقه پیش از رسیدن به ایستگاه بیدار می‌شوید.`)
        .catch(() => {});
    } else {
      toast({ title: "بیدارباش غیرفعال شد", description: "می‌توانید هر زمان دوباره فعال کنید" });
    }
  };

  /* ---------- نزدیک‌ترین ایستگاه به موقعیت کاربر (GPS) ---------- */
  useEffect(() => {
    let alive = true;
    void (async () => {
      /* بهترین موقعیت (همگرا با GPS دقیق) — فیکس‌های خام شبکه «مکان اشتباه» نمی‌دهند */
      const fix = await getCurrentGeoBest(2, 8000, 450, 15000);
      if (!alive || !fix) return;
      const r = nearestStationTo(fix.lat, fix.lng);
      if (r && r.id === station.id && r.distanceM < 1000) {
        setNearest({ distanceM: Math.round(r.distanceM / 10) * 10 });
      }
    })();
    return () => {
      alive = false;
    };
  }, [station.id]);

  /* ---------- راهنمای طبقات (فقط ایستگاه تقاطعی) ---------- */
  const levels = useMemo<LevelCard[]>(() => {
    if (!isInterchange) return [];
    const esc = equipment.find((e) => e.type === "escalator");
    const elv = equipment.find((e) => e.type === "elevator");
    const cards: LevelCard[] = [
      {
        icon: "door_open",
        name: "تراز ۰ — همکف و خیابان",
        info: exits.length ? exits.map((e) => e.label).join(" • ") : "ورودی اصلی ایستگاه",
        detail: exits.map((e) => `${e.label}: سمت ${e.direction} — ${e.accessibility}`),
      },
      {
        icon: "confirmation_number",
        name: "تراز ۱- — سالن بلیت و گیت",
        info: "گیت‌های تردد، باجه بلیت و خودپرداز",
        detail: [
          esc ? `پله‌برقی: ${toFa(esc.active)} از ${toFa(esc.total)} دستگاه فعال` : "پله ثابت",
          elv ? `آسانسور: ${toFa(elv.active)} از ${toFa(elv.total)} کابین فعال` : "بدون آسانسور",
        ],
      },
    ];
    station.lines.forEach((ls, i) => {
      const line = getLine(ls.lineId);
      const others = station.lines
        .filter((x) => x.lineId !== ls.lineId)
        .map((x) => getLine(x.lineId).name)
        .join(" و ");
      cards.push({
        icon: "directions_subway",
        name: `تراز ${toFa(i + 2)}- — سکوی ${line.name}`,
        accent: line.color,
        info: `دسترسی به ${line.name} — به سمت ${line.terminals[0]} و ${line.terminals[1]}`,
        detail: [
          `اعزام در دو جهت: ${line.terminals[1]} و ${line.terminals[0]}`,
          esc ? `پله‌برقی میانی سکو (${toFa(esc.active)} دستگاه فعال)` : "پله ثابت بین ترازها",
          `رابط مستقیم به ${others} — بدون خروج از گیت`,
        ],
      });
    });
    return cards;
  }, [isInterchange, station, equipment, exits]);

  /* ---------- جفت‌خط‌های تعویض (فقط تقاطعی) ---------- */
  const transferPairs = useMemo(() => {
    const ids = station.lines.map((l) => l.lineId);
    const out: { from: string; to: string }[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) out.push({ from: ids[i], to: ids[j] });
    }
    return out;
  }, [station.lines]);

  /* ---------- تاکسی و اتوبوس اطراف (بسط _15) ---------- */
  const taxiRows = useMemo(() => {
    if (!station.amenities.includes("taxi")) return [];
    const names = landmarks.length > 0 ? landmarks.slice(0, 4) : exits.flatMap((e) => e.landmarks).slice(0, 4);
    return names.map((lm, i) => ({
      title: lm,
      sub: exits[i % Math.max(exits.length, 1)]?.direction ?? "میدان مجاور ایستگاه",
    }));
  }, [station.amenities, landmarks, exits]);

  const busRows = useMemo(() => {
    if (!station.amenities.includes("bus")) return [];
    const names = landmarks.length > 0 ? landmarks.slice(0, 3) : exits.flatMap((e) => e.landmarks).slice(0, 3);
    return names.map((lm, i) => ({
      title: lm,
      sub: `ایستگاه اتوبوس • ${exits[i % Math.max(exits.length, 1)]?.direction ?? "مجاور خروجی اصلی"}`,
    }));
  }, [station.amenities, landmarks, exits]);

  const dirs = arrivals?.[selectedLine.id] ?? null;

  return (
    <>
      <PageHeader
        title={station.name}
        subtitle="شبکه مترو تهران"
        actions={
          <>
            {/* اشتراک‌گذاری — آیکون share در زیرمجموعه فونت نیست؛ SVG داخلی */}
            <button
              type="button"
              onClick={share}
              aria-label="اشتراک‌گذاری ایستگاه"
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all"
            >
              <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden>
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
              </svg>
            </button>
            {/* نشان‌گذاری — پیل پرشده bg-primary هنگام نشان‌شدن */}
            <button
              type="button"
              onClick={toggleFav}
              aria-pressed={isFav}
              aria-label={isFav ? "حذف از نشان‌ها" : "افزودن به نشان‌ها"}
              className={`flex items-center gap-1 rounded-full font-bold text-[11px] transition-all active:scale-95 ${
                isFav
                  ? "bg-primary text-white px-3 py-1.5 shadow-sm"
                  : "w-9 h-9 justify-center border border-outline-variant/50 text-on-surface-variant bg-surface-container-lowest"
              }`}
            >
              <MI name={isFav ? "star" : "star_border"} size={isFav ? 16 : 20} fill={isFav} />
              {isFav && "نشان شد"}
            </button>
          </>
        }
      />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-4">
        {/* ================= نشان نزدیک‌ترین ایستگاه (GPS) ================= */}
        {nearest && (
          <div className="flex justify-center">
            <span className="text-[10px] font-bold text-tertiary bg-tertiary-fixed/40 px-2.5 py-1 rounded-full flex items-center gap-1">
              <MI name="my_location" size={12} />
              نزدیک‌ترین ایستگاه به شما ({toFa(nearest.distanceM)} متر)
            </span>
          </div>
        )}

        {/* ================= چیپ‌های انتخاب خط (فیلتر تابلوی زنده) ================= */}
        <div
          className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5"
          role="group"
          aria-label="انتخاب خط ایستگاه"
        >
          {station.lines.map((ls, i) => {
            const line = getLine(ls.lineId);
            const sel = i === lineIdx;
            return (
              <button
                key={ls.lineId}
                type="button"
                aria-pressed={sel}
                onClick={() => setLineIdx(i)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
                  sel
                    ? "shadow-sm border-2"
                    : "bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant"
                }`}
                style={
                  sel
                    ? ({ backgroundColor: line.color, color: line.textOnColor, borderColor: "rgba(255,255,255,0.55)" } as CSSProperties)
                    : undefined
                }
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sel ? line.textOnColor : line.color }} />
                {line.name}
              </button>
            );
          })}
        </div>

        {/* ================= تابلوی قطارهای بعدی ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MI name="departure_board" size={20} className="text-primary shrink-0" />
              <h2 className="text-sm font-bold text-on-surface shrink-0">قطارهای بعدی</h2>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-sm shrink-0"
                style={{ backgroundColor: selectedLine.color, color: selectedLine.textOnColor }}
              >
                {selectedLine.name}
              </span>
            </div>
            <button
              type="button"
              onClick={speak}
              aria-label="اعلام صوتی اطلاعات ایستگاه"
              className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center active:scale-95 transition-all shrink-0"
            >
              <MI name="volume_up" size={16} />
            </button>
          </div>

          {dirs === null ? (
            <div className="space-y-2" aria-hidden>
              <div className="bg-surface-container-low rounded-xl h-16 animate-pulse" />
              <div className="bg-surface-container-low rounded-xl h-16 animate-pulse" />
            </div>
          ) : (
            <div className="space-y-2">
              {dirs.map((d) => {
                const c = CROWD_COLOR[d.crowd];
                const oos = d.outOfService || d.minutes.length === 0;
                return (
                  <div
                    key={d.to}
                    className="rounded-xl p-3 bg-surface-container-low border border-outline-variant/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: selectedLine.color, color: selectedLine.textOnColor }}
                        >
                          <MI name="train" size={16} />
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-on-surface truncate">به سمت {d.to}</div>
                          <span
                            className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ color: c, backgroundColor: `${c}14` }}
                          >
                            <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: c }} />
                            {d.crowdLabel}
                          </span>
                        </div>
                      </div>
                      {oos ? (
                        <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container px-2 py-1 rounded-lg shrink-0">
                          خارج از ساعات سرویس
                        </span>
                      ) : (
                        <div className="text-left shrink-0 space-y-1">
                          <div className="text-base font-bold text-primary leading-none">
                            {toFa(d.minutes[0])} <span className="text-[10px] font-medium">دقیقه</span>
                          </div>
                          <div className="text-[9px] text-on-surface-variant flex items-center justify-end gap-1" dir="ltr">
                            <MI name="schedule" size={10} />
                            {toFa(d.at[0] ?? "")}
                          </div>
                        </div>
                      )}
                    </div>
                    {!oos && (
                      <div className="mt-2 pt-2 border-t border-outline-variant/20 flex flex-wrap items-center gap-1.5">
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-lg text-[10px] font-bold">
                          قطار بعدی: {toFa(d.minutes[0])} دقیقه
                        </span>
                        {d.minutes[1] !== undefined && (
                          <span className="bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-lg text-[10px] font-bold">
                            پس از آن: {toFa(d.minutes[1])} دقیقه
                          </span>
                        )}
                      </div>
                    )}
                    {oos && (
                      <p className="mt-2 text-[10px] text-on-surface-variant">
                        سرویس امروز پایان یافته — اولین قطار فردا ساعت {toFa(selectedLine.firstTrain)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* نوار ساعات سرویس — الهام از هیرو _15 */}
          <div className="grid grid-cols-3 gap-2 text-center text-[10px] pt-2 border-t border-outline-variant/20">
            <div className="bg-surface-container-low rounded-lg py-1.5 flex flex-col items-center gap-0.5">
              <span className="text-on-surface-variant">اولین قطار</span>
              <span className="font-bold text-on-surface">{toFa(selectedLine.firstTrain)}</span>
            </div>
            <div className="bg-surface-container-low rounded-lg py-1.5 flex flex-col items-center gap-0.5">
              <span className="text-on-surface-variant">آخرین قطار</span>
              <span className="font-bold text-on-surface">{toFa(selectedLine.lastTrain)}</span>
            </div>
            <div className="bg-surface-container-low rounded-lg py-1.5 flex flex-col items-center gap-0.5">
              <span className="text-on-surface-variant">سرفاصله</span>
              <span className="font-bold text-primary">{toFa(headwayNow)} دقیقه</span>
            </div>
          </div>
        </section>

        {/* ================= امکانات رفاهی (طرح _20) ================= */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <MI name="widgets" size={18} className="text-primary" />
              <h2 className="text-sm font-bold text-on-surface">امکانات رفاهی ایستگاه</h2>
            </div>
            {amenities.length > 0 && (
              <span className="text-[10px] font-medium text-on-surface-variant bg-surface-container px-2.5 py-0.5 rounded-full border border-outline-variant/30">
                {toFa(amenities.length)} امکان فعال
              </span>
            )}
          </div>
          {amenities.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-4 text-center text-[11px] text-on-surface-variant">
              امکاناتی ثبت نشده
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {amenities.map((a) => (
                <div
                  key={a.key}
                  className="bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/30 flex items-center justify-between gap-1"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MI name={a.icon} size={17} className="text-on-surface-variant shrink-0" />
                    <span className="text-[11px] text-on-surface font-medium truncate">{a.label}</span>
                  </div>
                  <span className="text-[9px] text-on-surface-variant font-medium bg-surface-container px-1.5 py-0.5 rounded shrink-0">
                    {AMENITY_STATE[a.key] ?? "فعال"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ================= وضعیت پله‌برقی و آسانسورها (طرح _8) ================= */}
        {equipment.length > 0 && (
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 bg-tertiary rounded-full shrink-0" />
                <h2 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                  <MI name="elevator" size={18} className="text-primary" />
                  وضعیت پله‌برقی و آسانسورها
                </h2>
              </div>
              <span className="text-[9px] font-bold text-tertiary bg-tertiary-fixed/30 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                بروزرسانی مسافران
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {equipment.map((eq) => {
                const st: EquipState = eq.active <= 0 ? "broken" : eq.active < eq.total ? "partial" : "ok";
                const c = EQUIP_COLOR[st];
                return (
                  <div
                    key={eq.type}
                    className="bg-surface-container-low rounded-lg p-3 border-r-4 space-y-1"
                    style={{ borderRightColor: c }}
                  >
                    <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                      <span className="font-bold">{eq.typeLabel}</span>
                      <MI name={EQUIP_ICON[eq.type] ?? "elevator"} size={16} className="shrink-0" />
                    </div>
                    <div className="text-sm font-bold leading-none" style={{ color: c }}>
                      {toFa(eq.active)} از {toFa(eq.total)} فعال
                    </div>
                    <div className="text-[9px] text-on-surface-variant/80 leading-4">
                      {eq.note ?? eq.exits.join(" • ")}
                    </div>
                    <div className="flex items-center justify-between gap-1 pt-0.5">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: c, backgroundColor: `${c}14` }}>
                        {EQUIP_BADGE[st]}
                      </span>
                      <span className="text-[8px] text-on-surface-variant">بازدید {lastCheckText(id, eq.type)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ================= راهنمای طبقات (طرح _4 — فقط تقاطعی) ================= */}
        {isInterchange && levels.length > 0 && (
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 bg-primary-container rounded-full shrink-0" />
                <h2 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                  <MI name="layers" size={18} className="text-primary" />
                  راهنمای طبقات ایستگاه
                </h2>
              </div>
              <span className="text-[10px] text-on-surface-variant">برش مقطعی لایه‌ها</span>
            </div>
            <div>
              {levels.map((lv, i) => (
                <div key={lv.name}>
                  {i > 0 && (
                    <div
                      className="line-dashed w-0.5 h-4 mx-auto"
                      style={{ "--tw-line-color": "#c2c6d3" } as CSSProperties}
                      aria-hidden
                    />
                  )}
                  <div
                    className={`rounded-xl p-3 bg-surface-container-low ${lv.accent ? "border-r-4" : "border border-outline-variant/30"}`}
                    style={lv.accent ? ({ borderRightColor: lv.accent } as CSSProperties) : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => setLevelOpen(levelOpen === i ? null : i)}
                      aria-expanded={levelOpen === i}
                      className="w-full flex items-center gap-2.5"
                    >
                      <span
                        className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0"
                        style={lv.accent ? ({ backgroundColor: `${lv.accent}1a`, color: lv.accent } as CSSProperties) : undefined}
                      >
                        <MI name={lv.icon} size={17} className={lv.accent ? "" : "text-primary"} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-on-surface truncate">{lv.name}</div>
                        <div className="text-[10px] text-on-surface-variant truncate mt-0.5">{lv.info}</div>
                      </div>
                      <MI
                        name="expand_more"
                        size={16}
                        className={`text-on-surface-variant shrink-0 transition-transform ${levelOpen === i ? "rotate-180" : ""}`}
                      />
                    </button>
                    {levelOpen === i && (
                      <div className="mt-2.5 pt-2.5 border-t border-outline-variant/20 space-y-1.5">
                        {lv.detail.map((dtx) => (
                          <div key={dtx} className="flex items-start gap-1.5 text-[10px] text-on-surface-variant">
                            <MI name="check_circle" size={12} className="text-tertiary mt-0.5 shrink-0" />
                            <span>{dtx}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ================= راهنمای تعویض خط (طرح _6 — فقط تقاطعی) ================= */}
        {isInterchange && transferPairs.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 bg-secondary rounded-full shrink-0" />
                <h2 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                  <MI name="sync_alt" size={18} className="text-primary" />
                  راهنمای تعویض خط
                </h2>
              </div>
              <span className="text-[10px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full shrink-0">
                بدون خروج از گیت
              </span>
            </div>
            {transferPairs.map(({ from, to }) => {
              const A = getLine(from);
              const B = getLine(to);
              return (
                <div
                  key={`${from}-${to}`}
                  className="bg-surface-container-lowest rounded-2xl p-3.5 border border-outline-variant/40 shadow-sm space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-primary-fixed flex items-center justify-center text-primary shrink-0">
                        <MI name="directions" size={18} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-on-surface truncate">
                          از {A.name} به {B.name}
                        </div>
                        <div className="text-[10px] text-on-surface-variant mt-0.5 truncate">
                          مسیر را به سمت {B.terminals[1]} یا {B.terminals[0]} دنبال کنید
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold bg-tertiary-fixed text-on-tertiary-fixed px-2 py-1 rounded-md shrink-0 flex items-center gap-1">
                      <MI name="schedule" size={12} />
                      ۲ تا ۳ دقیقه
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[A, B].map((L, ix) => (
                      <div
                        key={L.id}
                        className="bg-surface-container-low rounded-lg p-2 flex items-center gap-2 border-r-4"
                        style={{ borderRightColor: L.color }}
                      >
                        <span
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 shadow-sm"
                          style={{ backgroundColor: L.color, color: L.textOnColor }}
                        >
                          {toFa(L.number)}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-on-surface truncate">{L.name}</div>
                          <div className="text-[9px] text-on-surface-variant truncate">{ix === 0 ? "خط فعلی" : "خط مقصد"}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* سه‌گام پیمایش — مطابق _6/_4 */}
                  <div className="grid grid-cols-3 gap-1.5 text-center pt-0.5">
                    {[
                      { n: "۱", t: "پله‌برقی میانی", s: "طبقه میانی" },
                      { n: "۲", t: "راهروی رابط", s: "تابلوهای مسیر" },
                      { n: "۳", t: "ورود به سکو", s: "بدون گیت" },
                    ].map((step) => (
                      <div
                        key={step.n}
                        className="p-2 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col items-center gap-1"
                      >
                        <span className="w-5 h-5 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
                          {step.n}
                        </span>
                        <span className="text-[10px] font-bold text-on-surface leading-tight">{step.t}</span>
                        <span className="text-[9px] text-on-surface-variant">{step.s}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-outline-variant/20">
                    {station.amenities.includes("escalator") && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-surface-container text-on-surface px-2 py-0.5 rounded-md">
                        <MI name="escalator" size={12} className="text-primary shrink-0" />
                        پله‌برقی
                      </span>
                    )}
                    {station.amenities.includes("elevator") && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-surface-container text-on-surface px-2 py-0.5 rounded-md">
                        <MI name="elevator" size={12} className="text-primary shrink-0" />
                        آسانسور
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-surface-container text-on-surface px-2 py-0.5 rounded-md">
                      <MI name="check_circle" size={12} className="text-tertiary shrink-0" />
                      بدون پرداخت مجدد
                    </span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ================= خروجی‌ها و گیت‌ها (طرح _8/_15) ================= */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 bg-primary rounded-full shrink-0" />
              <h2 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                <MI name="door_open" size={18} className="text-primary" />
                خروجی‌ها و گیت‌ها
              </h2>
            </div>
            <span className="text-[10px] font-medium text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
              {toFa(exits.length)} خروجی
            </span>
          </div>

          {exits.map((ex, i) => (
            <article
              key={ex.label}
              className="bg-surface-container-lowest rounded-xl p-3.5 border border-outline-variant/30 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary flex flex-col items-center justify-center shrink-0 shadow-sm">
                  <span className="text-[8px] leading-none opacity-80">خروجی</span>
                  <span className="text-sm font-black leading-none mt-0.5">{toFa(i + 1)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs font-bold text-on-surface">{ex.direction}</h3>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${accChipClass(ex.accessibility)}`}>
                      {ex.accessibility}
                    </span>
                  </div>
                </div>
                <MI name="chevron_left" size={16} className="text-on-surface-variant/70 shrink-0 mt-1" aria-hidden />
              </div>
              {ex.landmarks.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-outline-variant/20 flex flex-wrap gap-1.5">
                  {ex.landmarks.map((lm, li) => (
                    <span
                      key={lm}
                      className={`inline-flex items-center gap-1 text-[10px] bg-surface-container px-2 py-0.5 rounded-md ${
                        li === 0 ? "text-primary font-bold" : "text-on-surface-variant"
                      }`}
                    >
                      <MI name="place" size={11} className={li === 0 ? "text-primary" : "text-on-surface-variant"} />
                      {lm}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}

          {/* تاکسی‌های اطراف — بسط _15 (فقط با امکان تاکسی) */}
          {taxiRows.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2 px-1">
                <span className="w-1.5 h-4 bg-tertiary-container rounded-full shrink-0" />
                <h3 className="text-xs font-bold text-on-surface">تاکسی‌های اطراف ایستگاه</h3>
                <span className="text-[9px] font-medium text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full">
                  فعال و مستقر
                </span>
              </div>
              {taxiRows.map((r, i) => (
                <div
                  key={`taxi-${r.title}-${i}`}
                  className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                      <MI name="local_taxi" size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-on-surface truncate">{r.title}</div>
                      <div className="text-[9px] text-on-surface-variant mt-0.5 truncate">{r.sub}</div>
                    </div>
                  </div>
                  <span className="text-[9px] font-medium text-primary bg-primary-fixed/50 px-2 py-0.5 rounded-full shrink-0">
                    سکوی {toFa(i + 1)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* اتوبوس و BRT اطراف — بسط _15 (فقط با امکان اتوبوس) */}
          {busRows.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2 px-1">
                <span className="w-1.5 h-4 bg-secondary rounded-full shrink-0" />
                <h3 className="text-xs font-bold text-on-surface">اتوبوس و BRT اطراف ایستگاه</h3>
                <span className="text-[9px] font-medium text-secondary bg-secondary-fixed/50 px-2 py-0.5 rounded-full">
                  متصل به شبکه
                </span>
              </div>
              {busRows.map((r, i) => (
                <div
                  key={`bus-${r.title}-${i}`}
                  className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-secondary-fixed text-secondary flex items-center justify-center shrink-0">
                      <MI name="directions_bus" size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-on-surface truncate">{r.title}</div>
                      <div className="text-[9px] text-on-surface-variant mt-0.5 truncate">{r.sub}</div>
                    </div>
                  </div>
                  <span className="text-[9px] font-medium text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full shrink-0">
                    ایستگاه {toFa(i + 1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ================= جدول اعزام قطارها (طرح _9) ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <MI name="calendar_month" size={17} />
              </span>
              <div className="min-w-0">
                <h2 className="text-xs font-bold text-on-surface truncate">جدول اعزام قطارها</h2>
                <p className="text-[9px] text-on-surface-variant mt-0.5 truncate">
                  ساعات کار و اعزام {selectedLine.name} • جدول رسمی ۱۴۰۴
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container px-2 py-1 rounded-lg shrink-0" dir="ltr">
              {toFa(selectedLine.firstTrain)} - {toFa(selectedLine.lastTrain)}
            </span>
          </div>

          {timetable === null ? (
            <div className="bg-surface-container-low rounded-xl h-24 animate-pulse" aria-hidden />
          ) : (
            <div className="overflow-hidden border border-outline-variant/30 rounded-xl">
              <table className="w-full text-right text-[10px]">
                <thead className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/30">
                  <tr>
                    <th className="py-2 px-2 font-medium text-right">جهت</th>
                    <th className="py-2 px-1 text-center font-medium">اولین</th>
                    <th className="py-2 px-1 text-center font-medium">آخرین</th>
                    <th className="py-2 px-2 text-left font-medium whitespace-nowrap">سرفاصله</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                  {timetable.map((r) => (
                    <tr key={r.direction}>
                      <td className="py-2 px-2 font-bold text-on-surface">{r.direction}</td>
                      <td className="py-2 px-1 text-center text-on-surface-variant">{r.first}</td>
                      <td className="py-2 px-1 text-center text-on-surface-variant">{r.last}</td>
                      <td className="py-2 px-2 text-left whitespace-nowrap">
                        <span className="text-primary font-bold">{r.headwayPeak}</span>
                        <span className="text-on-surface-variant font-medium"> / </span>
                        <span className="text-on-surface-variant font-medium">{r.headwayOff}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between text-[9px] text-on-surface-variant px-0.5">
            <span className="flex items-center gap-1">
              <MI name="wb_twilight" size={12} />
              ساعات سرویس: {toFa(selectedLine.firstTrain)} تا {toFa(selectedLine.lastTrain)}
            </span>
            <span className="flex items-center gap-1">
              <MI name="directions_subway" size={12} />
              سرفاصله: {toFa(headwayNow)} دقیقه
            </span>
          </div>
        </section>

        {/* ================= مراکز نزدیک (طرح _8/_15) ================= */}
        {landmarks.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 bg-primary rounded-full shrink-0" />
                <h2 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                  <MI name="account_balance" size={18} className="text-primary" />
                  مراکز نزدیک ایستگاه
                </h2>
              </div>
              <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <MI name="directions" size={11} />
                دسترسی پیاده
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {landmarks.map((lm) => (
                <div key={lm} className="bg-surface-container-lowest rounded-xl p-2.5 border border-outline-variant/30 shadow-sm">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-1.5">
                    <MI name="place" size={15} />
                  </div>
                  <h3 className="text-[11px] font-bold text-on-surface leading-snug">{lm}</h3>
                  <div className="mt-2 pt-1.5 border-t border-outline-variant/20 flex items-center justify-between text-[9px]">
                    <span className="text-primary font-bold flex items-center gap-1">
                      <MI name="directions" size={11} />
                      دسترسی پیاده
                    </span>
                    <span className="text-on-surface-variant">از خروجی اصلی</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ================= اقدامات پایانی: مسیریابی و بیدارباش ================= */}
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => router.push(`/plan?to=${id}`)}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-3 font-bold text-sm shadow-sm active:scale-[0.98] transition-all"
          >
            <MI name="route" size={18} />
            مسیریابی به این ایستگاه
          </button>

          <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MI name="alarm" size={18} className="text-primary shrink-0" />
                <h2 className="text-xs font-bold text-on-surface">بیدارباش در این ایستگاه</h2>
                {wakeOn && (
                  <span className="text-[9px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full">
                    فعال
                  </span>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={wakeOn}
                aria-label="فعال‌سازی بیدارباش در این ایستگاه"
                onClick={toggleWake}
                className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
                  wakeOn ? "bg-primary" : "bg-surface-container-high border border-outline-variant/40"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    wakeOn ? "right-[22px]" : "right-0.5"
                  }`}
                />
              </button>
            </div>

            <p className="text-[11px] text-on-surface-variant leading-6">
              با فعال‌سازی، {toFa(wakeMin)} دقیقه پیش از رسیدن به {station.name} با اعلان صوتی بیدار می‌شوید تا با
              خیال راحت آماده پیاده شدن باشید.
            </p>

            <div className="flex items-center gap-1.5">
              {([1, 2, 3] as WakeMinutes[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={wakeMin === m}
                  onClick={() => pickWake(m)}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-bold border active:scale-95 transition-all ${
                    wakeMin === m
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant"
                  }`}
                >
                  {toFa(m)} دقیقه قبل
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
