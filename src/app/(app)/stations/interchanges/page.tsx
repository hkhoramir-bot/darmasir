"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { STATIONS, getLine, toFa, type StationDef } from "@/lib/metro-data";
import { PageHeader, MI } from "@/components/metro/shell";
import { AdBanner } from "@/components/metro/ui";

/* ============================================================
   ایستگاه‌های تقاطعی تهران — بازسازی دقیق ui/_17 + ui/_27
   (جستجو + چیپ‌های فیلتر + کارت‌های تبادل با زمان پیاده‌روی +
   نشان‌های خطوط متقاطع + راهنمای تعویض خط)
   ============================================================ */

/** نام انگلیسی ایستگاه‌های تقاطعی — مطابق طراحی ui/_17 */
const EN_NAME: Record<string, string> = {
  dowlat: "Darvazeh Dowlat",
  "theater-shahr": "Tehran City Theater",
  "emam-khomeini-sq": "Imam Khomeini",
  beheshti: "Shahid Beheshti",
  shadman: "Shademan",
  "navab-safavi": "Navvab-e Safavi",
  "valiasr-sq": "Meydan-e ValiAsr",
  "haft-tir": "Haft-e Tir",
  mohammadieh: "Mohammadieh",
  sadeghieh: "Sadeghieh",
  "darvazeh-shemiran": "Darvazeh Shemiran",
  "emam-hossein-sq": "Emam Hossein",
  mahdieh: "Mahdieh",
  "erm-sabz": "Eram-e Sabz",
  towhid: "Towhid",
  "shohada-sq": "Shohada",
  "tarbit-modarres": "Tarbiat Modarres",
};

/** ترتیب پرتردد (هسته‌ای) — مطابق طراحی ui/_17 */
const CORE_ORDER = [
  "dowlat",
  "theater-shahr",
  "emam-khomeini-sq",
  "beheshti",
  "shadman",
  "navab-safavi",
  "valiasr-sq",
  "haft-tir",
];

/** اطلاعات غنی هر تقاطع — رشته‌های دقیق طراحی ui/_17 و ui/_27 */
const RICH: Record<
  string,
  { walkMin: string; meters: number; context: string; icon: string; note: string; tag?: string; pill?: string }
> = {
  dowlat: {
    walkMin: "۲",
    meters: 95,
    context: "منطقه ۱۲ • تقاطع شریانی مرکز پایتخت",
    icon: "layers",
    note: "تقاطع تراز ۱- و ۲- (پله‌برقی مستقیم)",
    pill: "سریع‌ترین تبادل",
  },
  "theater-shahr": {
    walkMin: "۳",
    meters: 120,
    context: "چهارراه ولیعصر • تبادل فرهنگ و هنر",
    icon: "directions_bus",
    note: "اتصال مستقیم به خطوط BRT ۱ و ۷",
    tag: "۴ خروجی زیرگذر",
  },
  "emam-khomeini-sq": {
    walkMin: "۲.۵",
    meters: 110,
    context: "میدان توپخانه سابق • اولین هاب تقاطعی تهران",
    icon: "storefront",
    note: "دسترسی آسان به بازار بزرگ و میدان توپخانه",
    tag: "آسانسور فعال",
  },
  beheshti: {
    walkMin: "۳",
    meters: 130,
    context: "مصلای امام خمینی • خیابان بهشتی",
    icon: "stairs",
    note: "اختلاف تراز متوسط با پله‌برقی متوالی",
    tag: "مصلای امام",
  },
  shadman: {
    walkMin: "۲",
    meters: 85,
    context: "خیابان آزادی • تقاطع پرتردد غرب",
    icon: "check_circle",
    note: "پله‌های برقی استاندارد، عبور سریع و مستقیم",
    tag: "آزادی",
  },
  "navab-safavi": {
    walkMin: "۴",
    meters: 160,
    context: "بزرگراه نواب و آذربایجان • عمیق‌ترین سکو",
    icon: "accessible",
    note: "تراز عمیق خط ۷ (توصیه به استفاده از آسانسور)",
    tag: "آذربایجان",
  },
  "valiasr-sq": {
    walkMin: "۲.۵",
    meters: 90,
    context: "پلازای شهری ولیعصر • تبادل مدرن",
    icon: "foundation",
    note: "پلازای باز زیرزمینی مجهز به آسانسور و رمپ",
    tag: "پلازا ولیعصر",
  },
  "haft-tir": {
    walkMin: "۲.۵",
    meters: 100,
    context: "پایتخت بورس ایران • تقاطع پرتردد مرکز",
    icon: "swap_calls",
    note: "تبادل میان‌تراز با پله‌برقی متصل",
    tag: "میدان هفت تیر",
  },
};

const FALLBACK = {
  walkMin: "۳",
  meters: 120,
  context: "تقاطع فعال شبکه مترو تهران",
  icon: "swap_calls",
  note: "تبادل میان‌تراز با پله‌برقی و تابلوی راهنمای سکو",
};

type Filter = "all" | "core" | "l1" | "l4" | "multi3";

const FILTERS: { id: Filter; label: string; icon?: string }[] = [
  { id: "all", label: "همه تقاطع‌ها", icon: "done" },
  { id: "core", label: "تقاطع‌های پرتردد (هسته‌ای)" },
  { id: "l1", label: "تقاطع‌های خط ۱" },
  { id: "l4", label: "تقاطع‌های خط ۴" },
  { id: "multi3", label: "تقاطع‌های ۳ خطه" },
];

function InterchangeCard({ st, index }: { st: StationDef; index: number }) {
  const router = useRouter();
  const lines = st.lines.map((l) => getLine(l.lineId));
  const mainColor = lines[0].color;
  const rich = RICH[st.id] ?? FALLBACK;
  const en = EN_NAME[st.id];

  return (
    <article className="bg-surface-container-lowest border border-outline-variant/40 rounded-2xl p-3.5 shadow-sm space-y-2.5">
      {/* ردیف عنوان: نشان شماره + نام + زمان پیاده‌روی */}
      <div className="flex items-start gap-2.5">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm text-sm font-bold"
          style={{ backgroundColor: mainColor, color: lines[0].textOnColor }}
          aria-hidden
        >
          {toFa(index)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <h3 className="text-sm font-bold text-on-surface leading-tight">{st.name}</h3>
            {en && <span className="text-[10px] text-outline leading-tight" dir="ltr">({en})</span>}
          </div>
          <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">{rich.context}</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-tertiary bg-tertiary/10 border border-tertiary/30 px-2 py-1 rounded-full">
          <MI name="directions_walk" size={13} />
          {rich.walkMin} دقیقه
        </span>
      </div>

      {/* چیپ‌های خطوط متقاطع */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {lines.map((ln) => (
          <span
            key={ln.id}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold text-on-surface bg-surface-container border border-outline-variant/50 rounded-full pl-2 pr-1.5 py-1"
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ln.color }} />
            خط {toFa(ln.number)}:
            <span className="text-on-surface-variant font-medium">
              {ln.terminals[0]} ⇄ {ln.terminals[1]}
            </span>
          </span>
        ))}
      </div>

      {/* ردیف نکته راهنما */}
      <div className="flex items-center justify-between gap-2 bg-surface-container-low rounded-xl px-2.5 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <MI name={rich.icon} size={15} className="text-primary shrink-0" />
          <span className="text-[10px] font-medium text-on-surface-variant truncate">{rich.note}</span>
        </div>
        {rich.pill && (
          <span className="shrink-0 text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {rich.pill}
          </span>
        )}
        {rich.tag && (
          <span className="shrink-0 text-[9px] font-bold text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded-full">
            {rich.tag}
          </span>
        )}
      </div>

      {/* اکشن‌ها */}
      <div className="grid grid-cols-3 gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => router.push(`/stations/${st.id}`)}
          className="flex items-center justify-center gap-1 text-[10px] font-bold text-primary bg-primary/10 rounded-xl py-2.5 active:scale-95 transition-all hover:bg-primary/15"
        >
          <MI name="floor" size={14} />
          پلان طبقات
        </button>
        <button
          type="button"
          onClick={() => router.push(`/stations/${st.id}`)}
          className="flex items-center justify-center gap-1 text-[10px] font-bold text-primary bg-primary/10 rounded-xl py-2.5 active:scale-95 transition-all hover:bg-primary/15"
        >
          <MI name="schedule" size={14} />
          زمان‌بندی
        </button>
        <button
          type="button"
          onClick={() => router.push(`/plan?from=${st.id}`)}
          className="flex items-center justify-center gap-1 text-[10px] font-bold text-white bg-primary-container rounded-xl py-2.5 active:scale-95 transition-all hover:shadow-md"
        >
          <MI name="near_me" size={14} />
          مسیریابی
        </button>
      </div>
    </article>
  );
}

export default function InterchangesPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [guideDismissed, setGuideDismissed] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setGuideDismissed(window.localStorage.getItem("mq-interchange-guide") === "1");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const interchanges = useMemo(() => {
    const all = STATIONS.filter((s) => s.cityId === "tehran" && s.lines.length > 1);
    const rank = (id: string) => {
      const i = CORE_ORDER.indexOf(id);
      return i === -1 ? 99 : i;
    };
    return all.sort((a, b) => rank(a.id) - rank(b.id) || b.lines.length - a.lines.length);
  }, []);

  const filtered = useMemo(() => {
    let list = interchanges;
    if (filter === "core") list = list.filter((s) => CORE_ORDER.includes(s.id));
    if (filter === "l1") list = list.filter((s) => s.lines.some((l) => l.lineId === "l1"));
    if (filter === "l4") list = list.filter((s) => s.lines.some((l) => l.lineId === "l4"));
    if (filter === "multi3") list = list.filter((s) => s.lines.length >= 3);
    const q = query.trim();
    if (q) {
      list = list.filter((s) => {
        const hay = [
          s.name,
          EN_NAME[s.id] ?? "",
          ...s.lines.map((l) => {
            const ln = getLine(l.lineId);
            return `${ln.name} ${ln.terminals[0]} ${ln.terminals[1]}`;
          }),
        ].join(" ");
        return hay.includes(q);
      });
    }
    return list;
  }, [interchanges, filter, query]);

  const dismissGuide = () => {
    setGuideDismissed(true);
    window.localStorage.setItem("mq-interchange-guide", "1");
  };

  return (
    <>
      <PageHeader
        title="ایستگاه‌های تقاطعی تهران"
        subtitle="راهنمای سریع تعویض خط و تراز طبقات"
        actions={
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full whitespace-nowrap">
            {toFa(interchanges.length)} ایستگاه
          </span>
        }
      />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-3.5">
        {/* ================= جستجو ================= */}
        <section className="relative" aria-label="جستجوی ایستگاه تقاطعی">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="text"
            placeholder="جستجوی نام ایستگاه یا خطوط متقاطع..."
            className="w-full bg-surface-container-lowest border border-outline-variant/60 rounded-2xl py-2.5 pr-10 pl-10 text-xs text-on-surface focus:outline-none focus:border-primary-container shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          />
          <MI name="search" size={18} className="text-outline absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          {query && (
            <button
              type="button"
              aria-label="پاک کردن جستجو"
              onClick={() => setQuery("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-surface-container text-on-surface-variant active:scale-90 transition-all"
            >
              <MI name="close" size={14} />
            </button>
          )}
        </section>

        {/* ================= چیپ‌های فیلتر ================= */}
        <section
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5"
          aria-label="فیلتر تقاطع‌ها"
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-3 py-2 rounded-full border transition-all active:scale-95 ${
                  active
                    ? "bg-primary-container text-white border-primary-container shadow-sm"
                    : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/50 hover:border-primary-container"
                }`}
              >
                {active && f.icon && <MI name={f.icon} size={13} />}
                {f.label}
              </button>
            );
          })}
        </section>

        {/* ================= فهرست کارت‌ها ================= */}
        <section className="space-y-3" aria-label="فهرست ایستگاه‌های تقاطعی">
          {filtered.map((st, i) => (
            <InterchangeCard key={st.id} st={st} index={i + 1} />
          ))}
          {filtered.length === 0 && (
            <div className="bg-surface-container-lowest border border-dashed border-outline-variant/60 rounded-2xl py-8 text-center space-y-1.5">
              <MI name="search_off" size={22} className="text-outline" />
              <p className="text-xs font-bold text-on-surface">تقاطعی یافت نشد</p>
              <p className="text-[10px] text-outline">عبارت جستجو یا فیلتر را تغییر دهید</p>
            </div>
          )}
        </section>

        {/* ================= بنر تبلیغات ================= */}
        <AdBanner text="شارژ آنلاین بلیت مترو — پرداخت مستقیم بدون معطلی در باجه صف" />

        {/* ================= راهنمای تعویض خط ================= */}
        {!guideDismissed && (
          <section
            className="bg-primary-fixed dark:bg-[#1e3050] border border-outline-variant/40 rounded-2xl p-4 space-y-2.5"
            aria-label="راهنمای تعویض خط و ناوبری"
          >
            <h3 className="text-xs font-bold text-on-primary-fixed dark:text-[#d5e3ff] flex items-center gap-1.5">
              <MI name="info" size={16} />
              راهنمای تعویض خط و ناوبری
            </h3>
            {[
              { icon: "info", text: "زمان‌های پیاده‌روی اعلام شده بر مبنای سرعت ۱ متر بر ثانیه محاسبه شده‌اند." },
              { icon: "elevator", text: "تمامی ایستگاه‌های تقاطعی دارای مسیر ویژه معلولین و آسانسور تراز هستند." },
              { icon: "navigation", text: "پیش از صعود یا نزول از پله‌برقی‌ها، به تابلوهای راهنمای سکو دقت فرمایید." },
            ].map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <MI
                  name={r.icon}
                  size={14}
                  className="text-on-primary-fixed-variant dark:text-[#a8c8ff] shrink-0 mt-0.5"
                />
                <p className="text-[10px] leading-relaxed text-on-primary-fixed-variant dark:text-[#d5e3ff]">
                  {r.text}
                </p>
              </div>
            ))}
            <button
              type="button"
              onClick={dismissGuide}
              className="w-full bg-primary-container text-white text-[11px] font-bold rounded-xl py-2.5 active:scale-[0.98] transition-all hover:shadow-md"
            >
              متوجه شدم
            </button>
          </section>
        )}
      </main>
    </>
  );
}
