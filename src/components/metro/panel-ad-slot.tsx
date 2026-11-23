"use client";

/* ============================================================
   جایگاه آگهی مدیریت‌شده از پنل درمسیر — PanelAdSlot
   — همه آگهی‌های اپ فقط از پنل مدیریت می‌آیند (تک منبع حقیقت)
   — مدیر می‌تواند هر بنر را از بخش «تبلیغات» پنل ویرایش،
     غیرفعال یا حذف کند؛ همین لحظه بعد اپ دیگر آن را نشان نمی‌دهد.
   — در نبود آگهی فعال یا قطعی پنل، هیچ چیزی رندر نمی‌شود.
   جایگاه‌ها: home (بنر چرخشی جدا) / account / saved / status
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { MI } from "@/components/metro/shell";

export type PanelAdPlacement = "account" | "saved" | "status";

interface PanelAd {
  id: number;
  title: string;
  subtitle: string | null;
  badge: string | null;
  cta_text: string | null;
  advertiser: string | null;
  image_url: string | null;
  link_url: string | null;
  placement: string;
}

interface PanelContentShape {
  ads: PanelAd[];
  settings: Record<string, string>;
}

/** بازکردن لینک بنر — لینک داخلی APK دانلود مستقیم، بیرونی تب جدید */
function openAdLink(url: string) {
  if (url.startsWith("/") || url.startsWith(window.location.origin)) {
    window.location.href = url;
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export default function PanelAdSlot({
  placement,
  forceHidden = false,
}: {
  placement: PanelAdPlacement;
  forceHidden?: boolean;
}) {
  const [ad, setAd] = useState<PanelAd | null>(null);
  const trackedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (forceHidden) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/content", { cache: "no-store" });
        const json = await res.json();
        if (!alive || !json?.ok || !json?.connected) return;
        const content = json.content as PanelContentShape;
        const rows = (content.ads ?? [])
          .filter((a) => (a.placement ?? "home") === placement)
          .sort((a, b) => b.id - a.id);
        /* یک بنر در هر جایگاه — بالاترین اولویت */
        setAd(rows[0] ?? null);
      } catch {
        /* پنل در دسترس نیست — وضعیت فعلی حفظ می‌شود */
      }
    };
    load();
    /* همگام‌سازی زنده: غیرفعال‌سازی بنر در پنل حداکثر تا یک دقیقه بعد روی اپ اعمال می‌شود */
    const timer = setInterval(load, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [placement, forceHidden]);

  /* ثبت نمایش/کلیک در پنل — یک‌بار برای هر بنر در هر نشست */
  const track = useCallback((id: number, type: "impression" | "click") => {
    if (type === "impression") {
      if (trackedRef.current.has(id)) return;
      trackedRef.current.add(id);
    }
    fetch("/api/content/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, type }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (ad && !forceHidden) track(ad.id, "impression");
  }, [ad, forceHidden, track]);

  if (forceHidden || !ad) return null;

  const openLink = () => {
    track(ad.id, "click");
    if (ad.link_url) openAdLink(ad.link_url);
  };

  /* ---------- حساب من: بنر افقی با دکمه CTA ---------- */
  if (placement === "account") {
    return (
      <section
        aria-label="آگهی"
        className="w-full bg-surface-container-low rounded-2xl border border-outline-variant/40 p-3 flex items-center justify-between shadow-sm relative overflow-hidden"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
            <MI name="campaign" size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-label-sm bg-outline-variant/50 text-on-surface-variant px-1.5 py-0.5 rounded shrink-0">
                آگهی
              </span>
              <p className="text-sm font-bold text-on-surface truncate">{ad.title}</p>
            </div>
            {ad.advertiser && (
              <p className="text-[11px] text-outline mt-0.5 truncate">{ad.advertiser}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={openLink}
          className="text-body-sm font-bold bg-primary text-white px-3 py-1.5 rounded-lg active:scale-95 transition-all flex items-center gap-1 shrink-0"
        >
          <span>{ad.cta_text || "مشاهده"}</span>
          <MI name="chevron_left" size={14} />
        </button>
      </section>
    );
  }

  /* ---------- مسیرهای برگزیده: کارت آگهی با زیرعنوان ---------- */
  if (placement === "saved") {
    return (
      <div
        aria-label="آگهی"
        className="rounded-xl bg-surface-container-low border border-outline-variant/30 p-3 flex items-center justify-between gap-3 shadow-sm"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-surface-container-highest text-primary flex items-center justify-center shrink-0">
            <MI name="credit_card" size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-label-sm bg-outline/20 text-outline px-1.5 py-0.5 rounded font-bold shrink-0">
                آگهی
              </span>
              <h5 className="text-title-md text-on-surface text-[13px] truncate">{ad.title}</h5>
            </div>
            {ad.subtitle && (
              <p className="text-body-sm text-on-surface-variant text-[11px] mt-0.5 truncate">
                {ad.subtitle}
              </p>
            )}
          </div>
        </div>
        {ad.link_url && (
          <button
            type="button"
            onClick={openLink}
            className="px-3 py-1.5 bg-primary-container text-on-primary rounded-lg text-label-md shrink-0 active:scale-95 transition-all"
          >
            {ad.cta_text || "مشاهده"}
          </button>
        )}
      </div>
    );
  }

  /* ---------- گزارش وضعیت: نوار باریک dashed ---------- */
  return (
    <section
      aria-label="آگهی"
      className="bg-surface-container rounded-xl p-3 border border-dashed border-outline-variant/60 flex items-center justify-between gap-2 text-on-surface-variant my-1"
    >
      <div className="flex items-center gap-2 min-w-0">
        <MI name="campaign" size={20} className="text-primary shrink-0" />
        <span className="text-body-sm font-medium truncate">{ad.title}</span>
      </div>
      {ad.link_url ? (
        <button
          type="button"
          onClick={openLink}
          className="text-label-sm px-2 py-1 bg-primary/10 text-primary rounded border border-primary/30 shrink-0 font-bold active:scale-95 transition-all"
        >
          {ad.cta_text || "مشاهده"}
        </button>
      ) : (
        <span className="text-label-sm px-2 py-0.5 bg-surface-container-lowest rounded border border-outline-variant/40 shrink-0">
          آگهی
        </span>
      )}
    </section>
  );
}
