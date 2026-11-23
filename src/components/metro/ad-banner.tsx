"use client";

/* ============================================================
   بنر تبلیغات درمسیر — کاملاً متصل به پنل مدیریت
   • داده فقط از /api/ads (پنل ← سرور ابری) می‌آید — هیچ بنر
     هاردکدی در اپ وجود ندارد؛ پنل تنها منبع کنترل است.
   • چرخش خودکار هر ads_rotation_seconds ثانیه (تنظیم پنل)
   • ثبت نمایش/کلیک در سرور ابری و پنل
   • بدون تبلیغ فعال: جای‌گاه شفاف و صادقانه
   ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { MI } from "./ui";
import { toFa } from "@/lib/metro-data";
import { fetchPanelContent, type ClientAd } from "@/lib/client-content";

const seenImpressions = new Set<string>();

function track(id: number, type: "impression" | "click") {
  const body = JSON.stringify({ id, type });
  // وب: از راه سرور خودمان (هم‌زمان ابر + پنل) — اندروید: مستقیم ابر
  try {
    fetch("/api/ads/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* آمار حیاتی نیست */
  }
  try {
    fetch("https://darmasir-api.hkhoramir.workers.dev/api/v1/public/ads/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* آمار حیاتی نیست */
  }
}

export function AdBanner({
  placement = "home",
  className = "",
}: {
  placement?: "home" | "map" | "plan" | "station" | "line" | "splash" | "drawer";
  className?: string;
}) {
  const [ads, setAds] = useState<ClientAd[] | null>(null); // null = در حال بارگذاری
  const [idx, setIdx] = useState(0);
  const [seconds, setSeconds] = useState(6);

  const loadAds = useCallback(() => {
    let alive = true;
    // محتوا از پنل مدیریت — وب از /api/content، اندروید مستقیم از سرور ابری
    fetchPanelContent()
      .then((content) => {
        if (!alive) return;
        if (!content) {
          setAds([]);
          return;
        }
        const list = (content.ads ?? [])
          .filter((a) => (a.placement ?? "home") === placement)
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id - b.id)
          .slice(0, 5);
        setAds(list);
        const secs = Number(content.settings?.ads_rotation_seconds ?? 6);
        if (Number.isFinite(secs) && secs >= 4) setSeconds(secs);
      })
      .catch(() => alive && setAds([]));
    return () => {
      alive = false;
    };
  }, [placement]);

  useEffect(() => loadAds(), [loadAds]);

  /* با بازگشت به اپ، بنرها از پنل تازه‌سازی می‌شوند — تغییر پنل سریع اعمال می‌شود */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") loadAds();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadAds]);

  /* چرخش خودکار */
  useEffect(() => {
    if (!ads || ads.length < 2) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % ads.length), Math.max(4, seconds) * 1000);
    return () => window.clearInterval(t);
  }, [ads, seconds]);

  const ad = ads && ads.length ? ads[idx % ads.length] : null;

  /* ثبت نمایش یک‌بار برای هر بنر در نشست */
  useEffect(() => {
    if (!ad) return;
    const key = `${ad.id}:${Math.floor(Date.now() / 600000)}`;
    if (seenImpressions.has(key)) return;
    seenImpressions.add(key);
    track(ad.id, "impression");
  }, [ad]);

  const onClick = useCallback(() => {
    if (!ad) return;
    track(ad.id, "click");
    if (ad.link_url) {
      try {
        window.open(ad.link_url, "_blank", "noopener");
      } catch {
        /* باز نشد */
      }
    }
  }, [ad]);

  /* در حال بارگذاری — اسکلت سبک */
  if (ads === null) {
    return (
      <div className={`rounded-2xl bg-surface-container-low border border-outline-variant/30 p-4 ${className}`} aria-hidden>
        <div className="h-4 w-24 bg-surface-container rounded-full animate-pulse" />
        <div className="h-3 w-48 bg-surface-container rounded-full animate-pulse mt-2" />
      </div>
    );
  }

  /* بدون تبلیغ فعال — جای‌گاه شفاف */
  if (!ad) {
    return (
      <section
        className={`bg-gradient-to-l from-primary/5 via-surface-container-low to-surface-container-lowest rounded-2xl p-4 border border-primary/20 shadow-sm relative overflow-hidden ${className}`}
        aria-label="بخش تبلیغات"
      >
        <div className="flex items-center justify-center py-2 text-center text-xs font-medium text-outline">
          <MI name="campaign" size={16} className="ml-1.5" />
          بخش تبلیغ — کمپینی فعال نیست
        </div>
      </section>
    );
  }

  return (
    <section
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-l from-primary-container/90 via-primary-container to-primary-container/80 text-on-primary-container shadow-md border border-primary/30 ${className}`}
      aria-label={ad.advertiser ? `تبلیغ ${ad.advertiser}` : "تبلیغ"}
    >
      {ads.length > 1 && (
        <div className="absolute top-2 left-2 flex gap-1 z-10" aria-hidden>
          {ads.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === idx % ads.length ? "w-4 bg-current opacity-90" : "w-1.5 bg-current opacity-40"
              }`}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onClick}
        className="w-full text-right p-4 flex items-center gap-3 active:scale-[0.99] transition-transform cursor-pointer"
        aria-label={ad.cta_text ? `${ad.title} — ${ad.cta_text}` : ad.title}
      >
        <span className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <MI name={ad.image_url ? "image" : ad.link_url ? "open_in_new" : "campaign"} size={24} fill />
        </span>
        <span className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="flex items-center gap-1.5 flex-wrap">
            {ad.badge && (
              <span className="text-[10px] font-bold bg-secondary-container text-on-secondary-container px-1.5 py-0.5 rounded-md">
                {ad.badge}
              </span>
            )}
            <span className="text-[10px] font-medium opacity-75">{toFa("تبلیغ")}</span>
          </span>
          <span className="text-sm font-bold leading-snug line-clamp-1">{ad.title}</span>
          {ad.subtitle && <span className="text-[11px] opacity-85 leading-snug line-clamp-1">{ad.subtitle}</span>}
          {ad.cta_text && (
            <span className="text-[11px] font-bold inline-flex items-center gap-0.5 mt-0.5">
              {ad.cta_text}
              <MI name="chevron_left" size={14} />
            </span>
          )}
        </span>
      </button>
    </section>
  );
}
