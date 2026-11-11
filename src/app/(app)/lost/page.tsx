"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STATIONS, getLine, toFa } from "@/lib/metro-data";
import { PageHeader, MI, useInitCity, useShell } from "@/components/metro/shell";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
   اشیای گمشده و پیدا شده — ثبت و جستجوی موارد گزارش‌شده
   ============================================================ */

interface LostItemRow {
  id: string;
  kind: string; // lost | found
  title: string;
  description: string | null;
  stationId: string;
  contact: string | null;
  createdAt: string;
}

type KindFilter = "all" | "lost" | "found";

const faDate = (iso: string) => new Date(iso).toLocaleDateString("fa-IR");

export default function LostItemsPage() {
  useInitCity();
  const city = useShell((s) => s.city);
  const { toast } = useToast();

  const [items, setItems] = useState<LostItemRow[] | null>(null);
  const [filter, setFilter] = useState<KindFilter>("all");
  const [stationFilter, setStationFilter] = useState("");

  /* ---------- فرم ثبت ---------- */
  const [formOpen, setFormOpen] = useState(false);
  const [fKind, setFKind] = useState<"lost" | "found">("lost");
  const [fTitle, setFTitle] = useState("");
  const [fStation, setFStation] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fContact, setFContact] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/lost-items");
      const d = (await res.json()) as { items?: LostItemRow[] };
      setItems(d.items ?? []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** ایستگاه‌های شهر فعلی + اگر موردی از شهرهای دیگر بود نمایش داده شود */
  const stationOptions = useMemo(() => {
    const inCity = STATIONS.filter((s) => s.cityId === city);
    const others = STATIONS.filter((s) => s.cityId !== city);
    return [...inCity, ...others];
  }, [city]);

  const stationById = useMemo(() => new Map(STATIONS.map((s) => [s.id, s])), []);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter(
      (it) =>
        (filter === "all" || it.kind === filter) &&
        (!stationFilter || it.stationId === stationFilter)
    );
  }, [items, filter, stationFilter]);

  const submit = async () => {
    if (!fTitle.trim() || !fStation) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/lost-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: fKind,
          title: fTitle,
          stationId: fStation,
          description: fDesc,
          contact: fContact,
        }),
      });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { item?: LostItemRow };
      if (d.item) setItems((prev) => [d.item as LostItemRow, ...(prev ?? [])]);
      toast({
        title: fKind === "lost" ? "گزارش شیء گمشده ثبت شد" : "گزارش شیء پیدا‌شده ثبت شد",
        description: fTitle,
      });
      setFTitle("");
      setFDesc("");
      setFContact("");
      setFKind("lost");
      setFormOpen(false);
    } catch {
      toast({ title: "خطا در ثبت گزارش", description: "لطفاً دوباره تلاش کنید" });
    } finally {
      setSubmitting(false);
    }
  };

  const kindBadge = (kind: string) =>
    kind === "found" ? (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 flex items-center gap-1 shrink-0">
        <MI name="check_circle" size={11} />
        پیدا شده
      </span>
    ) : (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-error/10 text-error flex items-center gap-1 shrink-0">
        <MI name="search" size={11} />
        گمشده
      </span>
    );

  return (
    <>
      <PageHeader title="اشیای گمشده و پیدا شده" subtitle="ثبت و جستجوی گمشده‌ها در ایستگاه‌ها" />

      <main className="flex-1 w-full px-4 pt-3 pb-28 space-y-3">
        {/* ================= دکمه ثبت ================= */}
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary-container text-on-primary-container text-xs font-bold shadow-sm active:scale-[0.98] transition-all"
          >
            <MI name="add_circle" size={18} />
            ثبت شیء گمشده یا پیدا‌شده
          </button>
        )}

        {/* ================= فرم ثبت ================= */}
        {formOpen && (
          <section className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/40 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <MI name="travel_explore" size={18} className="text-primary" />
                <h3 className="font-bold text-xs text-on-surface">ثبت مورد جدید</h3>
              </div>
              <button
                type="button"
                aria-label="بستن فرم"
                onClick={() => setFormOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container text-outline"
              >
                <MI name="close" size={18} />
              </button>
            </div>

            {/* نوع */}
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="نوع گزارش">
              {(
                [
                  { key: "lost", label: "شیء گمشده", icon: "search" },
                  { key: "found", label: "شیء پیدا‌شده", icon: "check_circle" },
                ] as const
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={fKind === o.key}
                  onClick={() => setFKind(o.key)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold border transition-all ${
                    fKind === o.key
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-surface-container-low border-outline-variant/30 text-on-surface-variant"
                  }`}
                >
                  <MI name={o.icon} size={15} />
                  {o.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={fTitle}
              onChange={(e) => setFTitle(e.target.value)}
              placeholder="عنوان شیء (مثلاً کیف لپ‌تاپ مشکی)"
              aria-label="عنوان شیء"
              className="w-full bg-surface-container-low rounded-xl px-3 py-2.5 text-xs font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-primary"
            />

            <select
              value={fStation}
              onChange={(e) => setFStation(e.target.value)}
              aria-label="ایستگاه مربوطه"
              className="w-full bg-surface-container-low rounded-xl px-3 py-2.5 text-xs font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-primary"
            >
              <option value="">انتخاب ایستگاه...</option>
              {stationOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <textarea
              value={fDesc}
              onChange={(e) => setFDesc(e.target.value)}
              placeholder="توضیحات (رنگ، نشانی مشخصه، زمان و مکان دقیق...)"
              aria-label="توضیحات"
              rows={3}
              className="w-full bg-surface-container-low rounded-xl px-3 py-2.5 text-xs text-on-surface border border-outline-variant/30 focus:outline-none focus:border-primary resize-none"
            />

            <input
              type="tel"
              dir="ltr"
              value={fContact}
              onChange={(e) => setFContact(e.target.value)}
              placeholder="شماره تماس (اختیاری)"
              aria-label="شماره تماس"
              className="w-full bg-surface-container-low rounded-xl px-3 py-2.5 text-xs font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-primary"
            />

            <button
              type="button"
              onClick={submit}
              disabled={submitting || !fTitle.trim() || !fStation}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-sm active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <MI name="send" size={16} />
              )}
              ثبت گزارش
            </button>
          </section>
        )}

        {/* ================= فیلترها ================= */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-surface-container-low p-1 rounded-full" role="tablist" aria-label="فیلتر نوع">
            {(
              [
                { key: "all", label: "همه" },
                { key: "lost", label: "گمشده" },
                { key: "found", label: "پیدا‌شده" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={filter === t.key}
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 rounded-full text-[11px] transition-all ${
                  filter === t.key
                    ? "bg-surface-container-lowest shadow-sm text-primary font-bold"
                    : "text-on-surface-variant"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <select
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
            aria-label="فیلتر ایستگاه"
            className="flex-1 min-w-0 bg-surface-container-low rounded-full px-3 py-2 text-[11px] font-bold text-on-surface border border-outline-variant/30 focus:outline-none"
          >
            <option value="">همه ایستگاه‌ها</option>
            {stationOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* ================= فهرست موارد ================= */}
        {items === null ? (
          <div className="space-y-2" aria-hidden>
            <div className="bg-surface-container-low rounded-2xl h-20 animate-pulse" />
            <div className="bg-surface-container-low rounded-2xl h-20 animate-pulse" />
            <div className="bg-surface-container-low rounded-2xl h-20 animate-pulse" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 text-center space-y-2">
            <MI name="inventory_2" size={28} className="text-outline mx-auto" />
            <p className="text-xs font-bold text-on-surface">موردی ثبت نشده</p>
            <p className="text-[11px] text-outline">
              {filter === "all" && !stationFilter
                ? "هنوز گزارشی ثبت نشده است. اولین مورد را ثبت کنید."
                : "با این فیلترها موردی پیدا نشد."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((it) => {
              const st = stationById.get(it.stationId);
              const line = st ? getLine(st.lines[0]?.lineId) : undefined;
              return (
                <article
                  key={it.id}
                  className="bg-surface-container-lowest rounded-2xl p-3.5 border border-outline-variant/40 shadow-sm space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {line && (
                        <span
                          className="rounded px-1 py-0.5 text-[9px] font-bold shrink-0"
                          style={{ backgroundColor: line.color, color: line.textOnColor }}
                        >
                          {toFa(line.number)}
                        </span>
                      )}
                      <h4 className="text-xs font-bold text-on-surface truncate">{it.title}</h4>
                    </div>
                    {kindBadge(it.kind)}
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-outline flex-wrap">
                    <span className="flex items-center gap-1 font-bold text-on-surface-variant">
                      <MI name="location_on" size={12} />
                      {st?.name ?? "ایستگاه"}
                    </span>
                    <span aria-hidden>•</span>
                    <span>{faDate(it.createdAt)}</span>
                    {it.contact && (
                      <>
                        <span aria-hidden>•</span>
                        <span dir="ltr" className="font-bold text-on-surface-variant">
                          {toFa(it.contact)}
                        </span>
                      </>
                    )}
                  </div>

                  {it.description && (
                    <p className="text-[11px] text-on-surface-variant leading-5">{it.description}</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
