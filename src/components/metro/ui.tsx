"use client";

import { useEffect, useState } from "react";
import { toFa, type CrowdLevel, CROWD_LABEL } from "@/lib/metro-data";
import { nav } from "@/lib/store";

/* ------------------------- آیکون متریال ------------------------- */
export function MI({
  name,
  size = 24,
  fill = false,
  className = "",
}: {
  name: string;
  size?: number;
  fill?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${fill ? "ms-fill" : ""} ${className}`}
      style={{ fontSize: size }}
      aria-hidden
    >
      {name}
    </span>
  );
}

/* ------------------------- نشان خط ------------------------- */
export function LineBadge({
  number,
  color,
  textOn,
  size = "md",
}: {
  number: number;
  color: string;
  textOn: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? "w-5 h-5 text-[10px]" : size === "lg" ? "w-10 h-10" : "w-7 h-7 text-xs";
  return (
    <span
      className={`${dim} rounded-lg flex flex-col items-center justify-center font-bold shrink-0 shadow-sm leading-none`}
      style={{ backgroundColor: color, color: textOn }}
    >
      <span className="mt-0.5">{toFa(number)}</span>
    </span>
  );
}

/** نشان خط دوخطی (خط / عدد) مثل دیزاین اصلی */
export function LineBadgeBig({
  number,
  color,
  textOn,
}: {
  number: number;
  color: string;
  textOn: string;
}) {
  return (
    <div
      className="w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-sm"
      style={{ backgroundColor: color, color: textOn }}
    >
      <span className="text-[9px] leading-none opacity-90">خط</span>
      <span className="text-sm font-bold leading-none mt-0.5">{toFa(number)}</span>
    </div>
  );
}

/* ------------------------- وضعیت شلوغی ------------------------- */
export function CrowdPill({ level, label }: { level: CrowdLevel; label?: string }) {
  const cls =
    level === "quiet"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : level === "moderate"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-red-500/10 text-red-600 dark:text-red-400";
  const dot = level === "quiet" ? "bg-emerald-500" : level === "moderate" ? "bg-amber-500" : "bg-red-500";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label ?? CROWD_LABEL[level]}
    </span>
  );
}

/* ------------------------- بنر تبلیغات ------------------------- */
export function AdBanner({ text = "شارژ سریع بلیت اعتباری و متروکارت بدون صف" }: { text?: string }) {
  return (
    <section
      aria-label="آگهی"
      className="w-full bg-metro-c-low rounded-2xl border border-metro-outline-var/40 p-2.5 flex items-center justify-between shadow-[0_1px_3px_rgba(15,23,42,0.04)]"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="bg-metro-c-highest text-metro-onvar font-bold px-2 py-0.5 rounded-md text-[10px] shrink-0">
          آگهی
        </span>
        <p className="text-xs text-metro-onvar line-clamp-1">{text}</p>
      </div>
      <button className="text-xs text-metro-primary-c font-bold flex items-center gap-0.5 whitespace-nowrap pl-1 hover:underline shrink-0">
        مشاهده
        <MI name="chevron_left" size={14} />
      </button>
    </section>
  );
}

/* ------------------------- تیتر بخش ------------------------- */
export function SectionTitle({
  title,
  extra,
}: {
  title: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pt-1">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-4 bg-metro-primary-c rounded-full" />
        <h2 className="text-sm font-bold text-metro-onsurface">{title}</h2>
      </div>
      {extra}
    </div>
  );
}

/* ------------------------- هدر صفحه‌های داخلی ------------------------- */
export function SubHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="bg-metro-surface/95 backdrop-blur sticky top-0 z-40 w-full px-2 h-16 flex items-center justify-between shadow-sm border-b border-metro-outline-var/30">
      <button
        aria-label="بازگشت"
        onClick={() => nav.back()}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-metro-primary hover:bg-metro-c active:scale-95 transition-all"
      >
        <MI name="arrow_forward" />
      </button>
      <div className="flex flex-col items-center text-center flex-1 min-w-0 px-1">
        <h1 className="text-base font-bold text-metro-primary truncate w-full">{title}</h1>
        {subtitle && (
          <span className="text-[11px] text-metro-onvar flex items-center gap-1">{subtitle}</span>
        )}
      </div>
      <div className="flex items-center gap-1 min-w-10 justify-end">{actions}</div>
    </header>
  );
}

/* ------------------------- تیکر زمان ------------------------- */
export function useTicker(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/* ------------------------- ورودی جستجو ------------------------- */
export function SearchInput({
  value,
  onChange,
  placeholder = "جستجوی ایستگاه، تقاطع یا خط...",
  onMic,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onMic?: () => void;
}) {
  return (
    <div className="relative flex items-center">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-metro-card border border-metro-outline-var/60 rounded-2xl py-2.5 pr-10 pl-10 text-xs text-metro-onsurface focus:outline-none focus:border-metro-primary-c shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        placeholder={placeholder}
        type="text"
      />
      <span className="absolute right-3 text-metro-outline">
        <MI name="search" size={20} />
      </span>
      {onMic && (
        <button
          onClick={onMic}
          aria-label="جستجوی صوتی"
          className="absolute left-3 text-metro-outline hover:text-metro-primary-c flex items-center justify-center"
        >
          <MI name="mic" size={18} />
        </button>
      )}
    </div>
  );
}
