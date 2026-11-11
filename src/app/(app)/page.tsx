"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STATIONS,
  computeRoute,
  searchStations,
  getLine,
  getStation,
  toFa,
  type StationDef,
} from "@/lib/metro-data";
import { AppBar, MI, useInitCity, useShell } from "@/components/metro/shell";
import { ApkDownloadCard } from "@/components/metro/apk-download";
import { useAnnouncer, useVoiceSearch, openStandaloneTab } from "@/components/metro/voice";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   صفحه اصلی — بازسازی دقیق code.html تاییدشده + موتور واقعی مسیریابی
   ============================================================ */

/* رنگ روشن برای نشان خط داخل پیشنهادها (مثل دیزاین: bg-red-50/text-red-800) */
const LINE_CHIP: Record<string, string> = {
  l1: "bg-red-50 text-red-800",
  l2: "bg-blue-50 text-blue-800",
  l3: "bg-cyan-50 text-cyan-800",
  l4: "bg-yellow-50 text-yellow-800",
  l5: "bg-green-50 text-green-800",
  l6: "bg-pink-50 text-pink-800",
  l7: "bg-purple-50 text-purple-800",
  k1: "bg-sky-50 text-sky-800",
  m1: "bg-orange-50 text-orange-800",
  m2: "bg-teal-50 text-teal-800",
  e1: "bg-lime-50 text-lime-800",
};

function chipClass(station: StationDef) {
  if (station.lines.length > 1) return "bg-cyan-50 text-cyan-800";
  return LINE_CHIP[station.lines[0]?.lineId] ?? "bg-surface-container text-on-surface-variant";
}

function chipLabel(station: StationDef) {
  if (station.lines.length > 1)
    return `تقاطع ${station.lines.map((l) => toFa(getLine(l.lineId)?.number ?? 0)).join(" و ")}`;
  return `خط ${toFa(getLine(station.lines[0]?.lineId)?.number ?? 0)}`;
}

/* پیشنهادهای پیش‌فرض مثل دیزاین */
const DEFAULT_ORIGIN_IDS = ["enghelab-sq", "tajrish", "sadeghieh"];
const DEFAULT_DEST_IDS = ["tajrish", "enghelab-sq", "sadeghieh"];

type VoiceState = "idle" | "listening" | "result";

/* مسیرهای روزمره ذخیره‌شده (خانه / محل کار) */
interface DailyRouteItem {
  id: string;
  kind: string;
  label: string;
  fromStationId: string;
  toStationId: string;
  fromName: string;
  toName: string;
}

export default function HomePage() {
  const router = useRouter();
  useInitCity();
  const city = useShell((s) => s.city);

  const [originText, setOriginText] = useState("میدان انقلاب اسلامی");
  const [destText, setDestText] = useState("تجریش");
  const [openDrop, setOpenDrop] = useState<"origin" | "destination" | null>(null);
  const [rotation, setRotation] = useState(0);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceNote, setVoiceNote] = useState("«از اینجا تا تجریش چقدر راهه؟»");
  const originRef = useRef<HTMLInputElement>(null);
  const destRef = useRef<HTMLInputElement>(null);
  const announcer = useAnnouncer();
  const { toast } = useToast();

  /* ---------- resolve + محاسبه زنده مسیر ---------- */
  const resolve = useCallback(
    (text: string): StationDef | undefined => {
      const q = text.trim().replace(/[«»"]/g, "");
      if (!q) return undefined;
      // استخر کامل: نتایج جستجو + همه ایستگاه‌های شهر + همه ایستگاه‌ها
      const seen = new Set<string>();
      const candidates: StationDef[] = [];
      for (const s of [
        ...searchStations({ q, cityId: city }),
        ...searchStations({ q }),
        ...STATIONS.filter((st) => st.cityId === city),
        ...STATIONS,
      ]) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          candidates.push(s);
        }
      }
      // ۱) تطابق دقیق
      const exact = candidates.find((s) => s.name === q);
      if (exact) return exact;
      // ۲) شامل بودن دوطرفه («میدان انقلاب اسلامی» → «میدان انقلاب»)
      const incl = candidates.find((s) => s.name.includes(q) || q.includes(s.name));
      if (incl) return incl;
      // ۳) تطابق کلمه‌به‌کلمه
      const words = q.split(/[\s()]+/).filter((w) => w.length > 1);
      const token = candidates.find((s) => {
        const sn = s.name.replace(/[()]/g, " ");
        return words.length > 0 && words.every((w) => sn.includes(w));
      });
      return token;
    },
    [city]
  );

  const origin = useMemo(() => resolve(originText), [originText, resolve]);
  const dest = useMemo(() => resolve(destText), [destText, resolve]);

  const plan = useMemo(() => {
    if (!origin || !dest || origin.id === dest.id) return null;
    return computeRoute(origin.id, dest.id, "fastest");
  }, [origin, dest]);

  /* ---------- متن‌های نمایشی ---------- */
  const badgeText = useMemo(() => {
    if (!plan) return "خط ۴ به ۱";
    if (plan.legs.length === 1) return `خط ${toFa(getLine(plan.legs[0].lineId)?.number ?? 0)} مستقیم`;
    return `خط ${plan.legs.map((l) => toFa(getLine(l.lineId)?.number ?? 0)).join(" به ")}`;
  }, [plan]);

  const durationText = plan ? `${toFa(Math.round(plan.totalMinutes))} دقیقه` : "—";
  const stationsText = plan ? `${toFa(plan.totalStations)} ایستگاه` : "—";
  const transferText = useMemo(() => {
    if (!plan) return "—";
    if (plan.transfers === 0) return "بدون تعویض";
    const name = plan.transferStations[0] ? getStation(plan.transferStations[0])?.name : "";
    return `${toFa(plan.transfers)} تعویض${name ? ` (${name})` : ""}`;
  }, [plan]);

  /* ایستگاه جاری/بعدی — شبیه‌سازی زنده مثل دیزاین (نام‌ها همیشه متوالی و متفاوت) */
  const live = useMemo(() => {
    if (!plan || plan.legs.length === 0)
      return { current: "دروازه دولت", next: "ایستگاه بعدی: طالقانی (۲ دقیقه)" };
    const leg = plan.legs[0];
    const names = leg.stationNames;
    if (names.length > 2) {
      return {
        current: names[1],
        next: `ایستگاه بعدی: ${names[2]} (${toFa(2)} دقیقه)`,
      };
    }
    // سوار شدن در مبدأ — ایستگاه بعدی همان ایستگاه بعدی روی خط است
    return {
      current: names[0],
      next: `ایستگاه بعدی: ${names[1]} (${toFa(2)} دقیقه)`,
    };
  }, [plan]);

  /* ---------- جابجایی مبدأ/مقصد با چرخش ۱۸۰ درجه ---------- */
  const swap = () => {
    setOriginText(destText);
    setDestText(originText);
    setRotation((r) => r + 180);
  };

  /* ---------- دستیار صوتی ---------- */
  const applyVoiceRoute = useCallback(
    (from: StationDef, to: StationDef) => {
      setOriginText(from.name);
      setDestText(to.name);
      const p = computeRoute(from.id, to.id, "fastest");
      if (p) {
        const mins = toFa(Math.round(p.totalMinutes));
        const tr = p.transfers === 0 ? "بدون تعویض خط" : `${toFa(p.transfers)} تعویض خط`;
        setVoiceState("result");
        setVoiceNote(`«مسیر ${from.name} به ${to.name} آماده است»`);
        announcer.announce(`مسیر محاسبه شد. ${mins} دقیقه، ${tr}`).catch(() => {});
      }
    },
    [announcer]
  );

  const parseVoiceText = useCallback(
    (text: string) => {
      const clean = text.replace(/[«»"]/g, "").trim();
      const m = clean.match(/(?:از|بیا|برو)\s*(.+?)\s*(?:به|تا|سوی)\s*(.+)$/);
      if (m) {
        const from = resolve(m[1]);
        const to = resolve(m[2]);
        if (from && to && from.id !== to.id) {
          applyVoiceRoute(from, to);
          return;
        }
      }
      // اگر فقط یک ایستگاه شنیده شد → مقصد
      const to = resolve(clean);
      if (to) {
        const from = resolve("میدان انقلاب اسلامی");
        if (from && to.id !== from.id) {
          applyVoiceRoute(from, to);
          return;
        }
      }
      setVoiceState("idle");
      setVoiceNote("«متوجه نشدم؛ دوباره بگویید»");
    },
    [resolve, applyVoiceRoute]
  );

  const voice = useVoiceSearch((text) => {
    setVoiceNote(`«گفتید: ${text}»`);
    parseVoiceText(text);
  });

  const onMicClick = () => {
    if (voice.listening) {
      voice.stop();
      setVoiceState("idle");
      setVoiceNote("«از اینجا تا تجریش چقدر راهه؟»");
      return;
    }
    if (voice.busy) return;
    if (typeof MediaRecorder === "undefined") {
      // محیط بدون میکروفون — شبیه‌سازی مثل دیزاین
      setVoiceNote("«در حال شنیدن...»");
      setTimeout(() => {
        const from = resolve("میدان انقلاب اسلامی");
        const to = resolve("تجریش");
        if (from && to) applyVoiceRoute(from, to);
      }, 1800);
      return;
    }
    setVoiceNote("«دارم گوش می‌دهم...»");
    voice.start();
  };

  /* ---------- بستن دراپ‌داون با کلیک بیرون ---------- */
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-station-drop]")) setOpenDrop(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  /* ---------- مسیرهای روزمره (خانه / محل کار) — علاقمندی کاربر ---------- */
  const [dailyRoutes, setDailyRoutes] = useState<DailyRouteItem[] | null>(null);
  const [routeDialog, setRouteDialog] = useState<"home" | "work" | null>(null);
  const [dlgFrom, setDlgFrom] = useState("");
  const [dlgTo, setDlgTo] = useState("");
  const [dlgSaving, setDlgSaving] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  useEffect(() => {
    fetch("/api/daily-routes")
      .then((r) => r.json())
      .then((d: { routes?: DailyRouteItem[] }) => setDailyRoutes(d.routes ?? []))
      .catch(() => setDailyRoutes([]));
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  const homeRoute = dailyRoutes?.find((r) => r.kind === "home");
  const workRoute = dailyRoutes?.find((r) => r.kind === "work");

  const openRouteDialog = (kind: "home" | "work") => {
    const saved = kind === "home" ? homeRoute : workRoute;
    setDlgFrom(saved?.fromName ?? "میدان انقلاب اسلامی");
    setDlgTo(saved?.toName ?? "");
    setRouteDialog(kind);
  };

  /** لمس کوتاه: اجرای مسیر ذخیره‌شده یا باز کردن فرم تعریف */
  const applyQuickRoute = (kind: "home" | "work") => {
    const saved = kind === "home" ? homeRoute : workRoute;
    if (saved) {
      setOriginText(saved.fromName);
      setDestText(saved.toName);
      setVoiceState("result");
      setVoiceNote(`«مسیر ${kind === "home" ? "خانه" : "محل کار"}: به سمت ${saved.toName}»`);
    } else {
      openRouteDialog(kind);
    }
  };

  /** نگه‌داشتن دکمه: باز کردن فرم تغییر ایستگاه */
  const quickPress = (kind: "home" | "work") => {
    longPressedRef.current = false;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      longPressedRef.current = true;
      openRouteDialog(kind);
    }, 550);
  };
  const quickRelease = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  const quickClick = (kind: "home" | "work") => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    applyQuickRoute(kind);
  };

  const saveDailyRoute = async () => {
    if (!routeDialog) return;
    const from = resolve(dlgFrom);
    const to = resolve(dlgTo);
    if (!from || !to || from.id === to.id) return;
    setDlgSaving(true);
    try {
      const prev = routeDialog === "home" ? homeRoute : workRoute;
      if (prev) await fetch(`/api/daily-routes?id=${prev.id}`, { method: "DELETE" });
      const res = await fetch("/api/daily-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: routeDialog, fromStationId: from.id, toStationId: to.id }),
      });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { route?: DailyRouteItem };
      setDailyRoutes((prevList) => {
        const base = (prevList ?? []).filter((r) => r.kind !== routeDialog);
        return d.route ? [...base, d.route] : base;
      });
      setOriginText(from.name);
      setDestText(to.name);
      setRouteDialog(null);
      toast({
        title: "مسیر ذخیره شد",
        description: `${routeDialog === "home" ? "مسیر خانه" : "مسیر محل کار"}: به سمت ${to.name}`,
      });
    } catch {
      toast({ title: "خطا در ذخیره مسیر", description: "لطفاً دوباره تلاش کنید" });
    } finally {
      setDlgSaving(false);
    }
  };

  const deleteDailyRoute = async (kind: "home" | "work") => {
    const saved = kind === "home" ? homeRoute : workRoute;
    if (!saved) return;
    try {
      await fetch(`/api/daily-routes?id=${saved.id}`, { method: "DELETE" });
      setDailyRoutes((prevList) => (prevList ?? []).filter((r) => r.id !== saved.id));
      toast({ title: "مسیر حذف شد" });
    } catch {}
  };

  /** انتخابگر ایستگاه داخل دیالوگ مسیر روزمره */
  const dlgPicker = (field: "from" | "to") => {
    const isFrom = field === "from";
    const value = isFrom ? dlgFrom : dlgTo;
    const setValue = isFrom ? setDlgFrom : setDlgTo;
    const q = value.trim();
    const res = q ? searchStations({ q, cityId: city }).slice(0, 5) : [];
    return (
      <div className="relative">
        <span className="text-[10px] font-bold text-outline">
          {isFrom ? "مبدأ سفر" : routeDialog === "home" ? "ایستگاه خانه" : "ایستگاه محل کار"}
        </span>
        <div className="mt-1 flex items-center gap-2 bg-surface-container-low rounded-lg px-2.5 py-1.5 border border-outline-variant/30">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isFrom ? "bg-emerald-500" : "bg-red-600"}`} />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="جستجوی ایستگاه..."
            className="w-full bg-transparent text-[12px] font-bold text-on-surface focus:outline-none border-none p-0"
            aria-label={isFrom ? "مبدأ سفر" : "ایستگاه مقصد"}
          />
          {value && (
            <button
              type="button"
              aria-label="پاک کردن"
              onClick={() => setValue("")}
              className="text-outline hover:text-on-surface p-0.5"
            >
              <MI name="close" size={13} />
            </button>
          )}
        </div>
        {res.length > 0 && (
          <div className="absolute top-full right-0 left-0 mt-1 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 py-1 z-[90] text-xs">
            {res.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setValue(s.name)}
                className="w-full text-right px-3 py-2 hover:bg-surface-container text-on-surface flex items-center justify-between"
              >
                <span className="truncate">{s.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${chipClass(s)}`}>
                  {chipLabel(s)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const suggestionsFor = (field: "origin" | "destination", q: string) => {
    const defaults = (field === "origin" ? DEFAULT_ORIGIN_IDS : DEFAULT_DEST_IDS)
      .map((id) => getStation(id))
      .filter((s): s is StationDef => !!s);
    const text = q.trim();
    if (!text) return defaults.slice(0, 3);
    const res = searchStations({ q: text, cityId: city });
    return (res.length ? res : searchStations({ q: text })).slice(0, 4);
  };

  const suggestions = {
    origin: suggestionsFor("origin", originText),
    destination: suggestionsFor("destination", destText),
  };

  const goFullPlan = () => {
    if (origin && dest && origin.id !== dest.id) {
      router.push(`/plan?from=${origin.id}&to=${dest.id}`);
    } else {
      router.push("/plan");
    }
  };

  const inputRow = (field: "origin" | "destination") => {
    const isOrigin = field === "origin";
    const value = isOrigin ? originText : destText;
    const setValue = isOrigin ? setOriginText : setDestText;
    const inputRef = isOrigin ? originRef : destRef;
    return (
      <div className="relative flex items-center gap-2 bg-surface-container-lowest rounded-lg px-2.5 py-1.5 border border-outline-variant/30 shadow-sm" data-station-drop>
        <span className={`w-2 h-2 rounded-full shrink-0 ${isOrigin ? "bg-emerald-500" : "bg-red-600"}`} />
        <div className="flex-1 flex flex-col justify-center min-w-0">
          <span className="text-[10px] text-outline leading-tight font-bold">{isOrigin ? "مبدأ" : "مقصد"}</span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpenDrop(field);
            }}
            onFocus={() => setOpenDrop(field)}
            placeholder={isOrigin ? "انتخاب ایستگاه مبدأ..." : "انتخاب ایستگاه مقصد..."}
            className="w-full bg-transparent text-[13px] font-bold text-on-surface focus:outline-none border-none p-0 mt-0.5"
            aria-label={isOrigin ? "ایستگاه مبدأ" : "ایستگاه مقصد"}
          />
        </div>
        <button
          type="button"
          aria-label="پاک کردن"
          onClick={() => {
            setValue("");
            setOpenDrop(field);
            inputRef.current?.focus();
          }}
          className="text-outline hover:text-on-surface p-0.5 rounded-full hover:bg-surface-container transition-colors shrink-0"
        >
          <MI name="close" size={13} />
        </button>

        {/* دراپ‌داون پیشنهاد ایستگاه */}
        {openDrop === field && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/40 py-1 z-[60] text-xs">
            {suggestions[field].length === 0 && (
              <div className="px-3 py-2 text-outline">ایستگاهی یافت نشد</div>
            )}
            {suggestions[field].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setValue(s.name);
                  setOpenDrop(null);
                }}
                className="w-full text-right px-3 py-2 hover:bg-surface-container text-on-surface flex items-center justify-between"
              >
                <span className="truncate">{s.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${chipClass(s)}`}>
                  {chipLabel(s)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const listening = voice.listening;
  // نمایش پیام خطای واقعی (میکروفن/شبکه/تشخیص گفتار) به‌جای متن ثابت
  const voiceNoteFinal = voice.error ? `«${voice.error}»` : voiceNote;

  return (
    <>
      <AppBar />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-3">
        {/* ================= ۱. بنر تبلیغ ================= */}
        <section className="bg-gradient-to-l from-primary/5 via-surface-container-low to-surface-container-lowest rounded-xl p-3 border border-primary/20 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-center text-center text-[10px] font-medium text-outline">
            <MI name="campaign" size={14} className="ml-1.5" />
            بخش تبلیغ
          </div>
        </section>

        {/* ================= ۲. دستیار صوتی ================= */}
        <section className="bg-gradient-to-b from-surface-container-lowest to-surface-container-low rounded-2xl p-4 border border-outline-variant/40 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
          {/* هاله‌های محیطی */}
          <div className="absolute -top-8 -left-8 w-32 h-32 bg-primary-fixed/40 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-tertiary-fixed/30 rounded-full blur-2xl pointer-events-none" />

          {/* حلقه‌های پالس و دکمه صوتی */}
          <div className="relative w-20 h-20 flex items-center justify-center">
            <div
              className={`pulse-wave-1 absolute inset-0 rounded-full ${
                listening ? "bg-error/30" : "bg-primary-fixed/60"
              }`}
            />
            <div
              className={`pulse-wave-2 absolute inset-1.5 rounded-full ${
                listening ? "bg-error/20" : "bg-primary-fixed/40"
              }`}
            />
            <button
              onClick={onMicClick}
              aria-label="دستیار صوتی"
              className={`relative z-10 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-300 ${
                listening ? "bg-error scale-105" : "bg-primary-container"
              }`}
            >
              {voice.busy ? (
                <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <MI name="mic" size={26} />
              )}
            </button>
          </div>

          <div className="space-y-1 mt-1">
            <h2
              className={`text-sm font-bold text-on-surface transition-colors ${
                listening ? "text-error" : ""
              }`}
            >
              {listening
                ? "در حال شنیدن صدای شما..."
                : voice.busy
                  ? "در حال پردازش گفتار شما..."
                  : voiceState === "result" && plan
                    ? `مسیر محاسبه شد: ${durationText}، ${transferText}`
                    : "لمس کنید و صحبت کنید"}
            </h2>
            <p className="text-[11px] text-outline">نام ایستگاه مبدأ و مقصد را بگویید</p>
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => {
                  const from = resolve("میدان انقلاب اسلامی");
                  const to = resolve("تجریش");
                  if (from && to) {
                    setOriginText(from.name);
                    setDestText(to.name);
                    setVoiceState("result");
                    setVoiceNote("«از اینجا تا تجریش چقدر راهه؟»");
                    const p = computeRoute(from.id, to.id);
                    if (p) announcer.announce(`مسیر محاسبه شد. ${toFa(Math.round(p.totalMinutes))} دقیقه`).catch(() => {});
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-medium cursor-pointer hover:bg-primary/20 transition-colors"
              >
                <MI name="chat_bubble" size={13} />
                {voiceNoteFinal}
              </button>
            </div>
            {/* میکروفن در این پنجره (پیش‌نمایش داخل iframe) مسدود است → راهکار یک‌کلیکی */}
            {voice.errorKind === "blocked" && (
              <div className="pt-1.5">
                <button
                  type="button"
                  onClick={openStandaloneTab}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0d58a6] text-white text-[11px] font-bold shadow-sm hover:bg-[#0a4a8c] active:scale-95 transition-all"
                >
                  <MI name="open_in_new" size={14} />
                  باز کردن متروجو در تب جدید (برای میکروفن)
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ================= ۳. دسترسی سریع مسافر ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MI name="electric_bolt" size={16} className="text-primary" />
              <h3 className="font-bold text-[11px] text-on-surface">دسترسی سریع مسافر</h3>
            </div>
            <span className="text-[9px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              بروزرسانی زنده
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 text-center pt-1">
            {/* به خانه — لمس: اجرا | نگه‌داشتن: تغییر ایستگاه */}
            <button
              type="button"
              onClick={() => quickClick("home")}
              onPointerDown={() => quickPress("home")}
              onPointerUp={quickRelease}
              onPointerLeave={quickRelease}
              onContextMenu={(e) => {
                e.preventDefault();
                openRouteDialog("home");
              }}
              aria-label="مسیر خانه — برای تغییر ایستگاه، دکمه را نگه دارید"
              className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
            >
              <div className="relative w-11 h-11 rounded-xl bg-primary/10 group-hover:bg-primary/20 text-primary flex items-center justify-center transition-colors shadow-sm">
                <MI name="home" size={20} />
                {homeRoute && <span className="absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-emerald-500" />}
              </div>
              <span className="text-[10px] font-medium text-on-surface group-hover:text-primary truncate w-full">
                به خانه
              </span>
            </button>
            {/* محل کار — لمس: اجرا | نگه‌داشتن: تغییر ایستگاه */}
            <button
              type="button"
              onClick={() => quickClick("work")}
              onPointerDown={() => quickPress("work")}
              onPointerUp={quickRelease}
              onPointerLeave={quickRelease}
              onContextMenu={(e) => {
                e.preventDefault();
                openRouteDialog("work");
              }}
              aria-label="مسیر محل کار — برای تغییر ایستگاه، دکمه را نگه دارید"
              className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
            >
              <div className="relative w-11 h-11 rounded-xl bg-tertiary-fixed/50 group-hover:bg-tertiary-fixed text-tertiary flex items-center justify-center transition-colors shadow-sm">
                <MI name="work" size={20} />
                {workRoute && <span className="absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-emerald-500" />}
              </div>
              <span className="text-[10px] font-medium text-on-surface group-hover:text-tertiary truncate w-full">
                محل کار
              </span>
            </button>
            {/* نقشه آفلاین */}
            <button
              type="button"
              onClick={() => router.push("/map")}
              className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-primary-fixed/50 group-hover:bg-primary-fixed text-primary flex items-center justify-center transition-colors shadow-sm">
                <MI name="download_for_offline" size={20} />
              </div>
              <span className="text-[10px] font-medium text-on-surface group-hover:text-primary truncate w-full">
                نقشه آفلاین
              </span>
            </button>
            {/* زمان‌بندی */}
            <button
              type="button"
              onClick={() => router.push("/stations")}
              className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary flex items-center justify-center transition-colors shadow-sm">
                <MI name="schedule" size={20} />
              </div>
              <span className="text-[10px] font-medium text-on-surface group-hover:text-primary truncate w-full">
                زمان‌بندی
              </span>
            </button>
            {/* شلوغی سکو */}
            <button
              type="button"
              onClick={() => router.push("/lines")}
              className="flex flex-col items-center gap-1.5 group active:scale-95 transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-50 group-hover:bg-blue-100 text-primary flex items-center justify-center transition-colors shadow-sm relative">
                <MI name="groups" size={20} />
                <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <span className="text-[10px] font-medium text-on-surface group-hover:text-primary truncate w-full">
                شلوغی سکو
              </span>
            </button>
          </div>
          <p className="text-[9px] text-outline-variant text-center">
            لمس: اجرای مسیر ذخیره‌شده | نگه‌داشتن دکمه خانه یا محل کار: تغییر ایستگاه علاقمندی
          </p>
        </section>

        {/* ================= ۴. محاسبه دقیق زمان سفر ================= */}
        <section className="bg-surface-container-lowest rounded-2xl p-3.5 border border-outline-variant/40 shadow-sm space-y-3">
          {/* هدر */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MI name="route" size={16} className="text-primary" />
              <h3 className="font-bold text-[11px] text-on-surface">محاسبه زمان سفر</h3>
            </div>
            <span
              id="routeLineBadge"
              className="text-[9px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {badgeText}
            </span>
          </div>

          {/* ورودی دوگانه با دکمه جابجایی */}
          <div className="relative bg-surface-container-low rounded-xl p-2.5 border border-outline-variant/30 flex items-center gap-2">
            <div className="flex-1 space-y-2 min-w-0">
              {inputRow("origin")}
              {inputRow("destination")}
            </div>
            <div className="flex items-center justify-center shrink-0">
              <button
                type="button"
                aria-label="جابجایی مبدأ و مقصد"
                onClick={swap}
                className="w-9 h-9 rounded-full bg-surface-container-lowest hover:bg-surface-container-high border border-outline-variant/40 shadow-sm flex items-center justify-center text-primary active:scale-90 transition-all duration-300 ease-in-out focus:outline-none"
                style={{ transform: `rotate(${rotation}deg)` }}
              >
                <MI name="swap_vert" size={18} />
              </button>
            </div>
          </div>

          {/* قرص‌های پیشنهادی */}
          <div className="flex items-center gap-1.5 overflow-x-hidden">
            <span className="text-[10px] text-outline font-medium shrink-0">پیشنهادی:</span>
            {[
              { label: "تجریش", name: "تجریش" },
              { label: "بهشتی", name: "شهید بهشتی" },
              { label: "دروازه دولت", name: "دروازه دولت" },
              { label: "صادقیه", name: "صادقیه (تهران)" },
            ].map((p, i) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setDestText(p.name)}
                className={`px-2 py-1 rounded-full bg-surface-container-low hover:bg-surface-container text-[10px] font-medium border border-outline-variant/30 transition-colors whitespace-nowrap ${
                  i === 0 ? "text-primary" : "text-on-surface-variant"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* آمار سفر */}
          <div className="grid grid-cols-3 gap-2 text-center py-1.5 border-y border-outline-variant/20">
            <div className="flex flex-col items-center justify-center">
              <span className="text-[10px] text-outline">مدت تقریبی</span>
              <span className="text-sm font-bold text-primary">{durationText}</span>
            </div>
            <div className="flex flex-col items-center justify-center border-x border-outline-variant/20">
              <span className="text-[10px] text-outline">تعداد ایستگاه</span>
              <span className="text-sm font-bold text-on-surface">{stationsText}</span>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="text-[10px] text-outline">تبادل خط</span>
              <span className="text-sm font-bold text-tertiary">{transferText}</span>
            </div>
          </div>

          {/* وضعیت زنده ایستگاه */}
          <div className="bg-surface-container-low rounded-xl px-2.5 py-1.5 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 font-medium text-on-surface min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="text-[10px] text-outline">ایستگاه جاری:</span>
              <span className="text-[11px] font-bold text-primary truncate">{live.current}</span>
            </div>
            <span className="text-[9px] font-bold text-tertiary bg-tertiary-fixed/40 px-2 py-0.5 rounded-full shrink-0">
              {live.next}
            </span>
          </div>

          {/* مشاهده مسیر کامل */}
          <button
            type="button"
            onClick={goFullPlan}
            disabled={!plan}
            className="w-full flex items-center justify-center gap-1 py-2 rounded-xl bg-primary-container text-white text-[11px] font-bold shadow-sm active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <MI name="route" size={14} />
            مشاهده مسیر کامل و شروع سفر
            <MI name="chevron_left" size={14} />
          </button>
        </section>

        <ApkDownloadCard />

        <p className="text-center text-[10px] text-outline-variant pt-1">
          متروجو نسخه {toFa("4.8.3")} • طراحی شده برای ناوبری صوتی و سریع مسافران
        </p>
      </main>

      {/* ================= دیالوگ تعیین مسیر خانه / محل کار ================= */}
      {routeDialog && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="تعیین مسیر روزمره"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setRouteDialog(null)} />
          <div className="relative bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-4 space-y-3 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${
                    routeDialog === "home" ? "bg-primary/10 text-primary" : "bg-tertiary-fixed/50 text-tertiary"
                  }`}
                >
                  <MI name={routeDialog === "home" ? "home" : "work"} size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-on-surface">
                    {routeDialog === "home" ? "تعیین مسیر خانه" : "تعیین مسیر محل کار"}
                  </h3>
                  <p className="text-[10px] text-outline">ایستگاه‌های علاقمندی خود را انتخاب کنید</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="بستن"
                onClick={() => setRouteDialog(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container text-outline"
              >
                <MI name="close" size={18} />
              </button>
            </div>

            {dlgPicker("from")}
            {dlgPicker("to")}

            {(routeDialog === "home" ? homeRoute : workRoute) && (
              <div className="flex items-center justify-between bg-surface-container-low rounded-xl px-3 py-2 text-[10px]">
                <span className="text-on-surface-variant font-medium">
                  ذخیره‌شده: {(routeDialog === "home" ? homeRoute : workRoute)?.fromName} ←{" "}
                  {(routeDialog === "home" ? homeRoute : workRoute)?.toName}
                </span>
                <button
                  type="button"
                  onClick={() => deleteDailyRoute(routeDialog)}
                  className="text-error font-bold flex items-center gap-1 shrink-0"
                >
                  <MI name="delete" size={14} />
                  حذف
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={saveDailyRoute}
                disabled={dlgSaving || !dlgFrom.trim() || !dlgTo.trim()}
                className="flex-1 h-10 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {dlgSaving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <MI name="check" size={16} />}
                ذخیره و استفاده
              </button>
              <button
                type="button"
                onClick={() => setRouteDialog(null)}
                className="h-10 px-4 rounded-xl border border-outline-variant text-xs font-bold text-on-surface active:scale-95 transition-all"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
