"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAP_LINES,
  MAP_STATIONS,
  MAP_STATION_BY_ID,
  MAP_CANVAS,
  type MapStation,
} from "@/lib/map-geometry";
import { nearestStationTo } from "@/lib/station-geo";
import { LINES, toFa } from "@/lib/metro-data";
import { MI } from "./ui";

/* ============================================================
   نقشه تعاملی مترو — موتور ژست چندلمسی (پینچ/جابجایی بدون خطا)
   + موتور برچسب «فضای صفحه»: متن همیشه با اندازه ثابت و خوانا،
     موقعیت‌یابی زنده روی نقشه و حذف هوشمند همپوشانی
   + راهنمای خطوط + موقعیت‌یاب GPS
   ============================================================ */

interface MetroMapProps {
  onStationSelect?: (stationId: string) => void;
  highlightStations?: string[];
  className?: string;
}

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 0.75;
const MAX_SCALE = 4;
const TAP_SLOP_PX = 7; // حرکت بیشتر از این = جابجایی، نه لمس ایستگاه
const STALE_POINTER_MS = 1500; // اشاره‌گر بدون هیچ رویداد جدید بعد از این مدت = مرده

const TEHRAN_LINES = LINES.filter((l) => l.cityId === "tehran");

/* ایستگاه‌های تبادلی (اشتراک دو خط یا بیشتر) — ثابت و مستقل از رندر */
const INTERCHANGE_IDS = new Set(
  MAP_LINES.flatMap((ml) => ml.stations).filter(
    (id) => MAP_LINES.filter((ml) => ml.stations.includes(id)).length > 1
  )
);

/** نقاط هر خط به‌صورت رشته points برای polyline */
function linePoints(stations: string[]): string {
  return stations
    .map((id) => {
      const s = MAP_STATION_BY_ID.get(id);
      return s ? `${s.x},${s.y}` : "";
    })
    .filter(Boolean)
    .join(" ");
}

/* ---------------- اندازه‌گیری واقعی عرض متن (برای جلوگیری از همپوشانی) ---------------- */
let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

function textWidthPx(text: string, weight: number, px: number, epoch: number): number {
  const key = `${epoch}|${weight}|${px}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  let w: number;
  try {
    if (!measureCtx) {
      measureCtx = document.createElement("canvas").getContext("2d");
    }
    if (measureCtx) {
      measureCtx.font = `${weight} ${px}px Vazirmatn, sans-serif`;
      w = measureCtx.measureText(text).width;
    } else {
      w = text.length * px * 0.6;
    }
  } catch {
    w = text.length * px * 0.6;
  }
  widthCache.set(key, w);
  return w;
}

/* ---------------- انواع لایه برچسب ---------------- */
interface LabelItem {
  id: string;
  name: string;
  x: number;
  y: number;
  anchor: "start" | "end";
  fontSize: number;
  weight: number;
  halo: number;
}

interface BadgeItem {
  key: string;
  x: number;
  y: number;
  r: number;
  stroke: number;
  font: number;
  num: string;
  color: string;
  ink: string;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type LocateState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok"; stationId: string; stationName: string; distanceM: number; accuracyM: number | null }
  | { kind: "far" }
  | { kind: "error"; message: string };

export default function MetroMap({
  onStationSelect,
  highlightStations,
  className = "",
}: MetroMapProps) {
  const [t, setT] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const [legendOpen, setLegendOpen] = useState(false);
  const [locate, setLocate] = useState<LocateState>({ kind: "idle" });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [fontsTick, setFontsTick] = useState(0);

  /* ---------- آینه همزمان ترنسفورم — جلوگیری از رقابت با React ---------- */
  const tRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  /* اشاره‌گرهای فعال — پایه ژست چندلمسی (t = آخرین زمان دیدن اشاره‌گر) */
  const pointersRef = useRef<Map<number, { x: number; y: number; t: number }>>(new Map());
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const pinchRef = useRef<{
    dist0: number;
    vx0: number;
    vy0: number;
    s0: number;
    tx0: number;
    ty0: number;
  } | null>(null);
  const movedRef = useRef(false); // بعد از جابجایی، تپ ایستگاه نادیده گرفته می‌شود

  /* ---------- اندازه واقعی بوم برای مقیاس ثابت متن ---------- */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      setBox((b) =>
        Math.abs(b.w - r.width) > 0.5 || Math.abs(b.h - r.height) > 0.5
          ? { w: r.width, h: r.height }
          : b
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------- بعد از لود کامل فونت، عرض متن‌ها دوباره اندازه‌گیری می‌شود ---------- */
  useEffect(() => {
    let alive = true;
    try {
      document.fonts?.ready
        .then(() => {
          if (!alive) return;
          widthCache.clear();
          setFontsTick((v) => v + 1);
        })
        .catch(() => {});
    } catch {
      /* مرورگرهای قدیمی */
    }
    return () => {
      alive = false;
    };
  }, []);

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  /** ثبت ترنسفورم جدید — همیشه از طریق این تابع */
  const commit = useCallback((next: Transform) => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    /* پنجره دید واقعی بر حسب واحدهای viewBox — با احتساب letterbox حالت meet.
       clamp قبلی فقط مرکز بوم را مبنا می‌گرفت و در بزرگ‌نمایی اجازه می‌داد
       کل نقشه از پنجره دید خارج شود (کاربر حس می‌کرد pan خراب است). */
    let wx0 = 0, wy0 = 0, winW = MAP_CANVAS.w, winH = MAP_CANVAS.h;
    const svg = svgRef.current;
    if (svg) {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 2 && rect.height > 2) {
        const f = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
        wx0 = -((rect.width - MAP_CANVAS.w * f) / 2) / f;
        wy0 = -((rect.height - MAP_CANVAS.h * f) / 2) / f;
        winW = rect.width / f;
        winH = rect.height / f;
      }
    }
    const OVER = 60; // اجازه سرریز اندک در لبه‌ها
    // لبه محتوا نباید از پنجره دید بیرون بزند — در هر بزرگ‌نمایی کل نقشه قابل رسیدن است
    const loX = wx0 + winW - scale * MAP_CANVAS.w - OVER;
    const hiX = wx0 + OVER;
    const loY = wy0 + winH - scale * MAP_CANVAS.h - OVER;
    const hiY = wy0 + OVER;
    const tx = loX <= hiX ? clamp(next.tx, loX, hiX) : (loX + hiX) / 2;
    const ty = loY <= hiY ? clamp(next.ty, loY, hiY) : (loY + hiY) / 2;
    const fixed = { scale, tx, ty };
    tRef.current = fixed;
    setT(fixed);
  }, []);

  /** تبدیل مختصات صفحه به مختصات viewBox (با احتساب letterbox وضعیت meet) */
  const viewPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { vx: 0, vy: 0 };
    const rect = svg.getBoundingClientRect();
    const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
    const ox = (rect.width - MAP_CANVAS.w * fit) / 2;
    const oy = (rect.height - MAP_CANVAS.h * fit) / 2;
    return {
      vx: (clientX - rect.left - ox) / (fit * tRef.current.scale) - tRef.current.tx / tRef.current.scale,
      vy: (clientY - rect.top - oy) / (fit * tRef.current.scale) - tRef.current.ty / tRef.current.scale,
    };
  }, []);

  /** بزرگ‌نمایی حول یک نقطه صفحه (پیش‌فرض: مرکز) — لنگر ثابت می‌ماند */
  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const t0 = tRef.current;
      const svg = svgRef.current;
      if (!svg) {
        commit({ ...t0, scale: t0.scale * factor });
        return;
      }
      const rect = svg.getBoundingClientRect();
      const cx = clientX ?? rect.left + rect.width / 2;
      const cy = clientY ?? rect.top + rect.height / 2;
      const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
      const ox = (rect.width - MAP_CANVAS.w * fit) / 2;
      const oy = (rect.height - MAP_CANVAS.h * fit) / 2;
      // نقطه لنگر در مختصات viewBox فعلی
      const ax = (cx - rect.left - ox) / fit;
      const ay = (cy - rect.top - oy) / fit;
      const scale = clamp(t0.scale * factor, MIN_SCALE, MAX_SCALE);
      commit({
        scale,
        tx: ax - ((ax - t0.tx) * scale) / t0.scale,
        ty: ay - ((ay - t0.ty) * scale) / t0.scale,
      });
    },
    [commit]
  );

  /* ---------- چرخ ماوس (غیر-Passive تا preventDefault کار کند) ---------- */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.15 : 0.87, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ---------- تور ایمنی سراسری برای اشاره‌گرهای گم‌شده ----------
     اگر pointerup/pointercancel انگشتی به SVG نرسد (مثلاً انگشت روی کارت
     راهنما، دکمه‌های شناور یا بیرون نقشه بالا آمده باشد، یا برچسبِ زیر
     انگشت در میانه ژست از DOM حذف شود)، اشاره‌گر «مرده» در حافظه می‌ماند
     و ژستِ بعدی به‌جای جابجایی، پینچِ خراب با لنگر مرده اجرا می‌شد —
     همین باعث «ناتوانی در pan بعد از zoom» بود. این شنوندهٔ سراسری
     (فاز capture) هر اشاره‌گر گم‌شده را بلافاصله پاک می‌کند. */
  useEffect(() => {
    const release = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size === 1) {
        // یک انگشت باقی مانده — ادامه با جابجایی از موقعیت فعلی او
        pinchRef.current = null;
        const [p] = [...pointersRef.current.values()];
        panRef.current = { startX: p.x, startY: p.y, tx: tRef.current.tx, ty: tRef.current.ty };
      } else if (pointersRef.current.size === 0) {
        panRef.current = null;
        pinchRef.current = null;
      }
    };
    const resetAll = () => {
      pointersRef.current.clear();
      panRef.current = null;
      pinchRef.current = null;
    };
    const onVisibility = () => {
      if (document.hidden) resetAll();
    };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", resetAll);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", resetAll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /* ---------- اشاره‌گرها ---------- */
  const onPointerDown = (e: React.PointerEvent) => {
    /* پاک‌سازی اشاره‌گرهای مرده — pointerup آن‌ها هرگز به نقشه نرسیده
       (انگشت روی کارت HTML یا بیرون نقشه بالا آمده بود). همین اشاره‌گرهای
       مرده ژستِ بعدی را به پینچ خراب تبدیل می‌کردند. */
    const now = performance.now();
    for (const [id, p] of pointersRef.current) {
      if (now - p.t > STALE_POINTER_MS) pointersRef.current.delete(id);
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: now });

    if (pointersRef.current.size === 1) {
      // شروع جابجایی تک‌انگشتی — کپچر عمداً فعال نمی‌شود تا تپ روی
      // برچسب/ایستگاه با click واقعی روی خود عنصر کار کند؛
      // کپچر روی SVG به‌محض عبور از آستانه درگ فعال می‌شود.
      movedRef.current = false;
      panRef.current = { startX: e.clientX, startY: e.clientY, tx: tRef.current.tx, ty: tRef.current.ty };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      // شروع پینچ — کپچر هر دو انگشت روی خود SVG (عنصر پایدار که هرگز
      // unmount نمی‌شود؛ برخلاف برچسب‌ها که در میانه ژست حذف می‌شوند)
      try {
        svgRef.current?.setPointerCapture?.(e.pointerId);
        for (const id of pointersRef.current.keys()) {
          if (id !== e.pointerId) svgRef.current?.setPointerCapture?.(id);
        }
      } catch {
        /* برخی محیط‌ها (رویدادهای ساختگی/WebView) خطای InvalidPointerId می‌دهند */
      }
      const [p1, p2] = [...pointersRef.current.values()];
      const t0 = tRef.current;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
      const ox = (rect.width - MAP_CANVAS.w * fit) / 2;
      const oy = (rect.height - MAP_CANVAS.h * fit) / 2;
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      pinchRef.current = {
        dist0: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1,
        vx0: (mx - rect.left - ox) / fit,
        vy0: (my - rect.top - oy) / fit,
        s0: t0.scale,
        tx0: t0.tx,
        ty0: t0.ty,
      };
      panRef.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });

    if (pinchRef.current && pointersRef.current.size >= 2) {
      // پینچ: مقیاس + حفظ لنگر زیر انگشتان
      const [p1, p2] = [...pointersRef.current.values()];
      const p0 = pinchRef.current;
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
      const ox = (rect.width - MAP_CANVAS.w * fit) / 2;
      const oy = (rect.height - MAP_CANVAS.h * fit) / 2;
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const vxm = (mx - rect.left - ox) / fit;
      const vym = (my - rect.top - oy) / fit;
      const scale = clamp((p0.s0 * dist) / p0.dist0, MIN_SCALE, MAX_SCALE);
      // نقطه میانی اولیه باید زیر انگشتان بماند
      const cx = (p0.vx0 - p0.tx0) / p0.s0;
      const cy = (p0.vy0 - p0.ty0) / p0.s0;
      commit({
        scale,
        tx: vxm - scale * cx,
        ty: vym - scale * cy,
      });
      movedRef.current = true;
      return;
    }

    if (panRef.current && pointersRef.current.size === 1) {
      const p0 = panRef.current;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
      const dx = (e.clientX - p0.startX) / fit;
      const dy = (e.clientY - p0.startY) / fit;
      if (Math.abs(e.clientX - p0.startX) > TAP_SLOP_PX || Math.abs(e.clientY - p0.startY) > TAP_SLOP_PX) {
        if (!movedRef.current) {
          // گذر از آستانه درگ — کپچر روی SVG تا pointerup حتی روی کارت‌های
          // HTML یا بیرون نقشه هم تضمین‌شده به همین عنصر برسد
          try {
            svgRef.current?.setPointerCapture?.(e.pointerId);
          } catch {
            /* محیط‌های ساختگی */
          }
        }
        movedRef.current = true;
      }
      commit({ scale: tRef.current.scale, tx: p0.tx + dx, ty: p0.ty + dy });
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    try {
      svgRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* قبلاً آزاد شده */
    }
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 1) {
      // یک انگشت باقی مانده — پینچ تمام شده، ادامه با جابجایی
      pinchRef.current = null;
      const [p] = [...pointersRef.current.values()];
      panRef.current = { startX: p.x, startY: p.y, tx: tRef.current.tx, ty: tRef.current.ty };
    } else if (pointersRef.current.size === 0) {
      panRef.current = null;
      pinchRef.current = null;
    }
  };

  /* ---------- مرکز کردن دید روی یک ایستگاه ---------- */
  const zoomToStation = useCallback(
    (sx: number, sy: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const fit = Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
      const scale = 2.4;
      commit({
        scale,
        tx: rect.width / (2 * fit) - scale * sx,
        ty: rect.height / (2 * fit) - scale * sy,
      });
    },
    [commit]
  );

  /* ---------- موقعیت‌یاب GPS ---------- */
  const locateMe = useCallback(() => {
    if (locate.kind === "busy") return;
    /* احترام به کلید GPS در تنظیمات */
    try {
      if (localStorage.getItem("mj-gps-enabled") === "false") {
        setLocate({ kind: "error", message: "دسترسی موقعیت مکانی در تنظیمات غیرفعال است" });
        return;
      }
    } catch {
      /* حافظه در دسترس نیست — ادامه */
    }
    if (!("geolocation" in navigator)) {
      setLocate({ kind: "error", message: "مرورگر از موقعیت‌یابی پشتیبانی نمی‌کند" });
      return;
    }
    setLocate({ kind: "busy" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const near = nearestStationTo(latitude, longitude);
        if (!near) {
          setLocate({ kind: "far" });
          return;
        }
        const st = MAP_STATION_BY_ID.get(near.id);
        if (!st) {
          setLocate({ kind: "far" });
          return;
        }
        setLocate({
          kind: "ok",
          stationId: near.id,
          stationName: near.name,
          distanceM: near.distanceM,
          accuracyM: typeof accuracy === "number" ? Math.round(accuracy) : null,
        });
        // بزرگ‌نمایی روی ایستگاه
        zoomToStation(st.x, st.y);
      },
      (err) => {
        setLocate({
          kind: "error",
          message:
            err.code === err.PERMISSION_DENIED
              ? "دسترسی موقعیت مکانی داده نشد"
              : "موقعیت مکانی در دسترس نیست",
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [locate.kind, zoomToStation]);

  const resetView = useCallback(() => {
    commit({ scale: 1, tx: 0, ty: 0 });
    setLocate({ kind: "idle" });
  }, [commit]);

  const highlighted = useMemo(() => {
    const set = new Set(highlightStations ?? []);
    if (locate.kind === "ok") set.add(locate.stationId);
    return set;
  }, [highlightStations, locate]);

  /* ============================================================
     موتور برچسب‌ها — مقیاس «فضای صفحه»:
     برخلاف گذشته که متن‌ها داخل گروه بزرگ‌نمایی‌شونده بودند (و در
     بزرگ‌نمایی ۱ روی هم ریخته دیده می‌شدند)، اینجا هر برچسب:
     ۱. با اندازه ثابت روی صفحه رندر می‌شود (مستقل از زوم)
     ۲. زنده از مختصات ایستگاه پیروی می‌کند
     ۳. فقط اگر با برچسب مهم‌تری همپوشانی نداشته باشد نمایش
        داده می‌شود — با نزدیک‌تر شدن (زوم بیشتر) برچسب‌های
        بیشتری جا می‌گیرند و ظاهر می‌شوند
     ============================================================ */
  const fit = box.w > 0 && box.h > 0 ? Math.min(box.w / MAP_CANVAS.w, box.h / MAP_CANVAS.h) : 0;

  const labelLayout = useMemo(() => {
    const empty: { labels: LabelItem[]; badges: BadgeItem[] } = { labels: [], badges: [] };
    if (fit <= 0) return empty;
    const toVb = (px: number) => px / fit;

    const boxes: Box[] = [];
    const overlaps = (b: Box) =>
      boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);

    /* ---------- ناحیه کارت‌های HTML روی نقشه (راهنما + کنترل‌ها) —
       برچسب و نشان نباید زیر این کارت‌ها پنهان شوند ---------- */
    const ox = (box.w - MAP_CANVAS.w * fit) / 2;
    const oy = (box.h - MAP_CANVAS.h * fit) / 2;
    const htmlZone = (left: number, top: number, w: number, h: number): Box | null => {
      const x0 = Math.max(0, (left - ox) / fit);
      const y0 = Math.max(0, (top - oy) / fit);
      const x1 = Math.min(MAP_CANVAS.w, (left + w - ox) / fit);
      const y1 = Math.min(MAP_CANVAS.h, (top + h - oy) / fit);
      if (x1 <= x0 || y1 <= y0) return null;
      return { x0, y0, x1, y1 };
    };
    const legendZone = htmlZone(10, 10, 158, legendOpen ? 185 : 40);
    if (legendZone) boxes.push(legendZone);
    // ستون دکمه‌های شناور پایین-چپ (۴ دکمه ۳۶px با فاصله)
    const controlsZone = htmlZone(8, box.h - 196, 44, 188);
    if (controlsZone) boxes.push(controlsZone);

    /* ---------- نشان شماره خطوط (اندازه ثابت، پشته‌ای در ایستگاه مشترک) ---------- */
    const badges: BadgeItem[] = [];
    const badgeN = new Map<string, number>();
    for (const ml of MAP_LINES) {
      for (const id of [ml.stations[0], ml.stations[ml.stations.length - 1]]) {
        const s = MAP_STATION_BY_ID.get(id);
        if (!s) continue;
        const n = badgeN.get(id) ?? 0;
        badgeN.set(id, n + 1);
        const r = toVb(8);
        const side = s.x > MAP_CANVAS.w / 2 ? -1 : 1;
        const bx = s.x * t.scale + t.tx + side * toVb(14);
        const by = s.y * t.scale + t.ty - toVb(15) - n * toVb(19);
        if (bx < -r || bx > MAP_CANVAS.w + r || by < -r || by > MAP_CANVAS.h + r) continue;
        const bBox: Box = {
          x0: bx - r - toVb(1),
          y0: by - r - toVb(1),
          x1: bx + r + toVb(1),
          y1: by + r + toVb(1),
        };
        // نشان زیر کارت‌های HTML پنهان نمی‌شود
        if (overlaps(bBox)) continue;
        badges.push({
          key: `${ml.lineId}-${id}-${n}`,
          x: bx,
          y: by,
          r,
          stroke: toVb(1.5),
          font: toVb(9.5),
          num: toFa(TEHRAN_LINES.find((l) => l.id === ml.lineId)?.number ?? 0),
          color: ml.color,
          ink: ml.lineId === "l4" ? "#1a1a1a" : "#ffffff",
        });
        boxes.push(bBox);
      }
    }

    /* ---------- ناحیه حفاظتی نشان بزرگ ایستگاه‌های تبادلی ---------- */
    const interExcl: { id: string; box: Box }[] = [];
    for (const s of MAP_STATIONS) {
      if (!INTERCHANGE_IDS.has(s.id)) continue;
      const half = 6.4 * t.scale + 3 / fit;
      const X = s.x * t.scale + t.tx;
      const Y = s.y * t.scale + t.ty;
      interExcl.push({
        id: s.id,
        box: { x0: X - half, y0: Y - half, x1: X + half, y1: Y + half },
      });
    }
    const hitsInterchange = (b: Box, selfId: string) =>
      interExcl.some(
        (e) => e.id !== selfId && b.x0 < e.box.x1 && b.x1 > e.box.x0 && b.y0 < e.box.y1 && b.y1 > e.box.y0
      );

    /* ---------- برچسب‌ها به ترتیب اولویت (تبادلی ← پرچم‌دار ← عادی) ---------- */
    const cands = MAP_STATIONS.map((s: MapStation) => {
      const isInter = INTERCHANGE_IDS.has(s.id);
      const prio = highlighted.has(s.id)
        ? 1000
        : isInter && s.label
          ? 500
          : isInter
            ? 400
            : s.label
              ? 300
              : 200;
      return { s, prio, major: isInter || s.label };
    }).sort((a, b) => b.prio - a.prio);

    const labels: LabelItem[] = [];
    for (const { s, prio, major } of cands) {
      void prio;
      const X = s.x * t.scale + t.tx;
      const Y = s.y * t.scale + t.ty;
      const margin = toVb(26);
      if (X < -margin || X > MAP_CANVAS.w + margin || Y < -margin || Y > MAP_CANVAS.h + margin) continue;

      const fontPx = major ? 10.5 : 9.5;
      const weight = major ? 800 : 600;
      const wVb = toVb(textWidthPx(s.name, weight, fontPx, fontsTick) + 7);
      const hVb = toVb(fontPx * 1.1 + 5);
      const gapVb = toVb(10);
      // جهت متن فارسی rtl است: anchor «end» یعنی لبه چپ متن در x
      const prefRight = s.x <= MAP_CANVAS.w / 2;
      const sides: ("right" | "left")[] = prefRight ? ["right", "left"] : ["left", "right"];

      for (const side of sides) {
        const bx0 = side === "right" ? X + gapVb : X - gapVb - wVb;
        const by0 = Y - hVb / 2;
        const b: Box = { x0: bx0, y0: by0, x1: bx0 + wVb, y1: by0 + hVb };
        if (b.x0 < 1 || b.x1 > MAP_CANVAS.w - 1 || b.y0 < 1 || b.y1 > MAP_CANVAS.h - 1) continue;
        if (overlaps(b) || hitsInterchange(b, s.id)) continue;
        boxes.push(b);
        labels.push({
          id: s.id,
          name: s.name,
          x: side === "right" ? X + gapVb : X - gapVb,
          y: Y + toVb(fontPx * 0.35),
          anchor: side === "right" ? "end" : "start",
          fontSize: toVb(fontPx),
          weight,
          halo: toVb(major ? 3.4 : 2.8),
        });
        break;
      }
    }

    return { labels, badges };
  }, [t, fit, fontsTick, highlighted, legendOpen, box.w, box.h]);

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      {/* لایه SVG نقشه */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_CANVAS.w} ${MAP_CANVAS.h}`}
        className="w-full h-full map-viewport select-none"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        role="img"
        aria-label="نقشه شماتیک شبکه متروی تهران — با دو انگشت بزرگ‌نمایی کنید"
      >
        <defs>
          <pattern id="map-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="var(--mq-map-grid)" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect width={MAP_CANVAS.w} height={MAP_CANVAS.h} fill="var(--mq-map-bg)" />
        <rect width={MAP_CANVAS.w} height={MAP_CANVAS.h} fill="url(#map-grid)" />

        <g transform={`translate(${t.tx} ${t.ty}) scale(${t.scale})`}>
          {/* خطوط — هر خط با زیرلایه روشن تا در تقاطع‌ها از هم جدا دیده شوند */}
          {MAP_LINES.map((ml) => (
            <g key={ml.lineId}>
              <polyline
                points={linePoints(ml.stations)}
                fill="none"
                stroke="var(--mq-map-bg)"
                strokeWidth={12}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={linePoints(ml.stations)}
                fill="none"
                stroke={ml.color}
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ))}

          {/* ایستگاه‌ها — فقط نشان‌ها؛ برچسب‌ها در لایه جداگانه پایین رندر می‌شوند */}
          {MAP_STATIONS.map((s) => {
            const isInter = INTERCHANGE_IDS.has(s.id);
            const isHi = highlighted.has(s.id);
            const r = isInter ? 7.2 : 5.2;
            return (
              <g
                key={s.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (movedRef.current) return; // بعد از جابجایی نقشه، تپ نیست
                  onStationSelect?.(s.id);
                }}
                className="cursor-pointer"
              >
                <circle cx={s.x} cy={s.y} r={16} fill="transparent" />
                {isInter && <circle cx={s.x} cy={s.y} r={r + 3.4} fill="var(--mq-card)" opacity={0.95} />}
                {isHi && <circle cx={s.x} cy={s.y} r={13} fill="#0d58a6" opacity={0.18} className="map-pulse" />}
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={isHi ? 7.4 : r}
                  fill={isHi ? "#0d58a6" : "var(--mq-card)"}
                  stroke={isHi ? "#0d58a6" : "var(--mq-ink)"}
                  strokeWidth={isHi ? 2.6 : 1.7}
                />
              </g>
            );
          })}
        </g>

        {/* ============================================================
            لایه برچسب‌ها (خارج از گروه بزرگ‌نمایی — اندازه ثابت روی صفحه)
            ============================================================ */}
        {fit > 0 && (
          <g style={{ pointerEvents: "none" }}>
            {/* نشان شماره خطوط */}
            {labelLayout.badges.map((b) => (
              <g key={b.key}>
                <circle
                  cx={b.x}
                  cy={b.y}
                  r={b.r}
                  fill={b.color}
                  stroke="var(--mq-card)"
                  strokeWidth={b.stroke}
                />
                <text
                  x={b.x}
                  y={b.y + b.r * 0.38}
                  textAnchor="middle"
                  fontSize={b.font}
                  fontWeight={800}
                  fill={b.ink}
                  style={{ fontFamily: "Vazirmatn, sans-serif" }}
                >
                  {b.num}
                </text>
              </g>
            ))}

            {/* نام ایستگاه‌ها — با هاله روشن و کنترل همپوشانی */}
            {labelLayout.labels.map((L) => (
              <text
                key={L.id}
                x={L.x}
                y={L.y}
                textAnchor={L.anchor}
                fontSize={L.fontSize}
                fontWeight={L.weight}
                fill="var(--mq-ink)"
                stroke="var(--mq-card)"
                strokeWidth={L.halo}
                paintOrder="stroke"
                strokeLinejoin="round"
                style={{
                  fontFamily: "Vazirmatn, sans-serif",
                  direction: "rtl",
                  pointerEvents: "auto",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (movedRef.current) return; // بعد از جابجایی نقشه، تپ نیست
                  onStationSelect?.(L.id);
                }}
              >
                {L.name}
              </text>
            ))}
          </g>
        )}
      </svg>

      {/* ================= کارت راهنمای خطوط (جای دکمه در هر دو حالت ثابت است) ================= */}
      <div className="absolute top-2.5 left-2.5 w-[9.5rem] rounded-xl bg-metro-card/95 backdrop-blur border border-metro-outline-var shadow-md overflow-hidden">
        <button
          onClick={() => setLegendOpen((o) => !o)}
          aria-expanded={legendOpen}
          aria-label={legendOpen ? "بستن راهنمای خطوط" : "نمایش راهنمای خطوط"}
          className="w-full h-9 px-2.5 flex items-center gap-1.5 text-[10px] font-bold text-metro-ink active:bg-surface-container transition-colors"
        >
          <MI name="layers" size={15} className="text-metro-primary-c shrink-0" />
          راهنمای خطوط
          <MI
            name="expand_more"
            size={14}
            className={`text-outline mr-auto transition-transform ${legendOpen ? "rotate-180" : ""}`}
          />
        </button>
        {legendOpen && (
          <div className="fade-in px-2.5 pb-2 grid grid-cols-1 gap-1 border-t border-metro-outline-var/50 pt-1.5">
            {TEHRAN_LINES.map((l) => (
              <div key={l.id} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-[9px] font-semibold text-metro-ink truncate">
                  {l.name} — {l.terminals[0]} / {l.terminals[1]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ================= نتیجه موقعیت‌یاب ================= */}
      {locate.kind === "busy" && (
        <div className="absolute top-2.5 right-2.5 bg-metro-card/95 backdrop-blur rounded-full shadow-md border border-metro-outline-var px-3 py-1.5 flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 border-2 border-metro-primary-c/30 border-t-metro-primary-c rounded-full animate-spin" />
          <span className="text-[10px] font-bold text-metro-ink">در حال یافتن موقعیت...</span>
        </div>
      )}
      {locate.kind === "ok" && (
        <div className="fade-in absolute top-2.5 right-2.5 max-w-[70%] bg-metro-card/95 backdrop-blur rounded-xl shadow-md border border-metro-outline-var px-3 py-1.5 flex items-center gap-2">
          <MI name="near_me" size={15} className="text-metro-primary-c shrink-0" />
          <span className="text-[10px] font-bold text-metro-ink truncate">
            نزدیک‌ترین ایستگاه: {locate.stationName} (حدود {toFa(Math.round(locate.distanceM / 50) * 50)} متر
            {locate.accuracyM !== null && locate.accuracyM > 100
              ? ` — دقت GPS کم: ±${toFa(Math.round(locate.accuracyM / 50) * 50)} متر`
              : ""}
            )
          </span>
          <button
            onClick={() => setLocate({ kind: "idle" })}
            aria-label="بستن"
            className="text-outline shrink-0 active:scale-90 transition-transform"
          >
            <MI name="close" size={13} />
          </button>
        </div>
      )}
      {(locate.kind === "far" || locate.kind === "error") && (
        <div className="fade-in absolute top-2.5 right-2.5 max-w-[70%] bg-metro-card/95 backdrop-blur rounded-xl shadow-md border border-error/40 px-3 py-1.5 flex items-center gap-2">
          <MI name="location_off" size={15} className="text-error shrink-0" />
          <span className="text-[10px] font-bold text-metro-ink">
            {locate.kind === "far" ? "در محدوده ایستگاه‌های مترو نیستید" : locate.message}
          </span>
          <button
            onClick={() => setLocate({ kind: "idle" })}
            aria-label="بستن"
            className="text-outline shrink-0 active:scale-90 transition-transform"
          >
            <MI name="close" size={13} />
          </button>
        </div>
      )}

      {/* ================= کنترل‌های شناور (بزرگ‌نمایی + موقعیت) ================= */}
      <div className="absolute bottom-2.5 left-2.5 flex flex-col gap-1.5">
        <button
          onClick={locateMe}
          aria-label="نزدیک‌ترین ایستگاه به من"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="my_location" size={18} />
        </button>
        <button
          onClick={() => zoomAt(1.25)}
          aria-label="بزرگ‌نمایی"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="add" size={18} />
        </button>
        <button
          onClick={() => zoomAt(0.8)}
          aria-label="کوچک‌نمایی"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="remove" size={18} />
        </button>
        <button
          onClick={resetView}
          aria-label="بازگشت به نمای کامل"
          className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
        >
          <MI name="center_focus_strong" size={18} />
        </button>
      </div>
    </div>
  );
}
