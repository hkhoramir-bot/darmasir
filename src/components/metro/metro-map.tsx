"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  MAP_LINES,
  MAP_STATIONS,
  MAP_STATION_BY_ID,
  MAP_CANVAS,
  type MapStation,
} from "@/lib/map-geometry";
import { nearestStationTo } from "@/lib/station-geo";
import { getCurrentGeoBest, requestGeoPermission } from "@/lib/geo";
import { LINES, toFa } from "@/lib/metro-data";
import { MI } from "./ui";

/* ============================================================
   نقشه تعاملی مترو — موتور ژست چندلمسی (پینچ/جابجایی بدون خطا)
   + موتور برچسب «فضای صفحه» + موقعیت‌یابی زنده
   + نمای دوبعدی/سه‌بعدی (چرخش CSS با ریاضی وارونِ دقیق برای تعامل)
   + چرخش قطب‌نما + مسیر منتخب روی نقشه
   ============================================================ */

export interface MetroMapHandle {
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  locateMe(): void;
  /** پرواز نرم به ایستگاه — از جستجو و انتخاب مقصد استفاده می‌شود */
  flyToStation(stationId: string): void;
  toggle3D(): void;
  rotateBy(deg: number): void;
}

interface MetroMapProps {
  onStationSelect?: (stationId: string) => void;
  highlightStations?: string[];
  /** خطوط خاموش‌شده با کلید چشم — ذخیره‌شده در تنظیمات (localStorage) */
  hiddenLineIds?: string[];
  /** تغییر وضعیت چشم هر خط */
  onToggleLine?: (lineId: string) => void;
  /** ترتیب ایستگاه‌های مسیر منتخب — رسم خط پررنگ مسیر روی نقشه */
  routeStations?: string[];
  /** پنهان کردن دکمه‌ها و راهنمای داخلی — صفحه کنترل‌های خودش را می‌سازد */
  showControls?: boolean;
  /** همگام‌سازی وضعیت نما (برای برچسب دکمه‌های صفحه) */
  onViewChange?: (v: { tilt3d: boolean; rotationDeg: number }) => void;
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

/* ---------- ریاضی نمای سه‌بعدی ----------
   CSS روی SVG اعمال می‌شود: rotateX(tilt) rotateZ(rotation) داخل
   پوشش دارای perspective(P). برای تبدیل نقطه صفحه به مختصات تخت
   نقشه، وارونِ همین زنجیره محاسبه می‌شود:
   ۱) rotateZ(φ): x1 = x·cosφ − y·sinφ، y1 = x·sinφ + y·cosφ
   ۲) rotateX(θ): y2 = y1·cosθ، z2 = y1·sinθ
   ۳) perspective(P): s = P/(P − z2)، x_s = x1·s، y_s = y2·s
   وارون: y1 = P·y_s/(P·cosθ + y_s·sinθ)، s = P/(P − y1·sinθ)،
   x1 = x_s/s و سپس وارون rotateZ. در حالت 2D (θ=۰، φ=۰) همه این‌ها
   همانی است — یعنی رفتار فعلی نقشه دست‌نخورده می‌ماند. */
const PERSPECTIVE_PX = 1000;
const TILT_3D_DEG = 42;

/* ---------- نمای پیش‌فرض نقشه (3D) + ذخیره انتخاب کاربر ----------
   طبق دستور بازطراحی: نقشه سه‌بعدی پیش‌فرض است و کاربر می‌تواند
   هر لحظه به دوبعدی برگردد؛ انتخاب در حافظه دستگاه ذخیره می‌شود. */
const MAP_VIEW3D_KEY = "mq-map-view3d";

function readView3d(): boolean {
  try {
    return localStorage.getItem(MAP_VIEW3D_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeView3d(v: boolean) {
  try {
    localStorage.setItem(MAP_VIEW3D_KEY, v ? "1" : "0");
  } catch {
    /* حافظه در دسترس نیست */
  }
}

/* ---------- خطوط نمایان، ایستگاه‌های تبادلی و رنگ هر ایستگاه ----------
   خطوط خاموش‌شده (کلید چشم) در «همه» محاسبات کنار گذاشته می‌شوند:
   مسیر خط، ایستگاه‌های انحصاری آن، برچسب‌ها و نشان‌ها. ایستگاه مشترکی
   که تنها یک خطِ نمایان دارد، دیگر تبادلی حساب نمی‌شود. */
function computeVisibleStats(hidden: Set<string>) {
  const lines = MAP_LINES.filter((ml) => !hidden.has(ml.lineId));
  const stationIds = new Set<string>();
  const count = new Map<string, number>();
  const color = new Map<string, string>();
  for (const ml of lines) {
    for (const id of ml.stations) {
      stationIds.add(id);
      count.set(id, (count.get(id) ?? 0) + 1);
      if (!color.has(id)) color.set(id, ml.color);
    }
  }
  const inter = new Set([...count.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  return { lines, stationIds, inter, color };
}

/* ---------- شبکه اشغال «بدنه خطوط» برای جلوگیری از افتادن متن روی خط ----------
   سلول‌هایی که مرکزشان کمتر از GRID_PAD از هر قطعه خط فاصله دارد علامت
   می‌خورند؛ برچسب‌ها پیش از جای‌گذاری با این شبکه چک می‌شوند. */
const GRID_CELL = 12;
const GRID_PAD = 11; // برچسب حداقل این فاصله را از محور خط حفظ می‌کند
const MINOR_LABEL_SCALE = 1.25; // برچسب ایستگاه‌های کوچک فقط با بزرگ‌نمایی کافی

function buildStrokeGrid(lines: { stations: string[] }[]) {
  const gw = Math.ceil(MAP_CANVAS.w / GRID_CELL);
  const gh = Math.ceil(MAP_CANVAS.h / GRID_CELL);
  const grid = new Uint8Array(gw * gh);
  const ptSegDist = (
    px: number, py: number,
    ax: number, ay: number, bx: number, by: number
  ): number => {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  };
  for (const ml of lines) {
    const pts: { x: number; y: number }[] = [];
    for (const id of ml.stations) {
      const s = MAP_STATION_BY_ID.get(id);
      if (s) pts.push(s);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const c0x = Math.max(0, Math.floor((Math.min(a.x, b.x) - GRID_PAD) / GRID_CELL));
      const c1x = Math.min(gw - 1, Math.floor((Math.max(a.x, b.x) + GRID_PAD) / GRID_CELL));
      const c0y = Math.max(0, Math.floor((Math.min(a.y, b.y) - GRID_PAD) / GRID_CELL));
      const c1y = Math.min(gh - 1, Math.floor((Math.max(a.y, b.y) + GRID_PAD) / GRID_CELL));
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          const px = cx * GRID_CELL + GRID_CELL / 2;
          const py = cy * GRID_CELL + GRID_CELL / 2;
          if (ptSegDist(px, py, a.x, a.y, b.x, b.y) <= GRID_PAD) grid[cy * gw + cx] = 1;
        }
      }
    }
  }
  return { grid, gw, gh };
}

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
  | {
      kind: "ok";
      stationId: string;
      stationName: string;
      distanceM: number;
      accuracyM: number | null;
      altName?: string;
      altDistanceM?: number;
    }
  | { kind: "far" }
  | { kind: "error"; message: string };

export default forwardRef<MetroMapHandle, MetroMapProps>(function MetroMap(
  {
    onStationSelect,
    highlightStations,
    hiddenLineIds,
    onToggleLine,
    routeStations,
    showControls = true,
    onViewChange,
    className = "",
  },
  ref
) {
  const [t, setT] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const [legendOpen, setLegendOpen] = useState(false);
  const [locate, setLocate] = useState<LocateState>({ kind: "idle" });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [fontsTick, setFontsTick] = useState(0);

  /* ---------- نمای دوبعدی/سه‌بعدی + چرخش قطب‌نما ---------- */
  const [tilt3d, setTilt3dState] = useState(false);

  /* بازیابی انتخاب ذخیره‌شده نمای 3D بعد از mount (بدون اختلاف SSR) */
  useEffect(() => {
    setTilt3dState(readView3d());
  }, []);

  const setTilt3d = useCallback((valueOrFn: boolean | ((v: boolean) => boolean)) => {
    setTilt3dState((prev) => {
      const next = typeof valueOrFn === "function" ? valueOrFn(prev) : valueOrFn;
      writeView3d(next);
      return next;
    });
  }, []);
  const [rotationDeg, setRotationDeg] = useState(0);
  const view3dRef = useRef({ tilt: 0, rotation: 0 });

  useEffect(() => {
    view3dRef.current = {
      tilt: tilt3d ? TILT_3D_DEG : 0,
      rotation: rotationDeg,
    };
    onViewChange?.({ tilt3d, rotationDeg });
  }, [tilt3d, rotationDeg, onViewChange]);

  /* ---------- خطوط نمایان (کلید چشم) + شبکه اشغال خطوط ---------- */
  const hiddenSet = useMemo(() => new Set(hiddenLineIds ?? []), [hiddenLineIds]);
  const visible = useMemo(() => computeVisibleStats(hiddenSet), [hiddenSet]);
  const strokeGrid = useMemo(() => buildStrokeGrid(visible.lines), [visible.lines]);

  /* ---------- آینه همزمان ترنسفورم — جلوگیری از رقابت با React ---------- */
  const tRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  /* پوشش ریشه (بدون ترنسفورم) — مبنای مختصات «چیدمان» حتی در نمای 3D */
  const rootRef = useRef<HTMLDivElement>(null);

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
       مبنای اندازه‌گیری «جعبه چیدمان» پوشش ریشه است؛ این عنصر ترنسفورم ندارد
       و در نمای 3D هم مختصات تخت را می‌دهد. */
    let wx0 = 0, wy0 = 0, winW = MAP_CANVAS.w, winH = MAP_CANVAS.h;
    const host = rootRef.current;
    if (host) {
      const rect = host.getBoundingClientRect();
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

  /** تبدیل نقطه صفحه به مختصات تخت چیدمان — با وارون دقیق نمای 3D */
  const unprojectClient = useCallback((clientX: number, clientY: number) => {
    const host = rootRef.current;
    if (!host) return { x: clientX, y: clientY };
    const rect = host.getBoundingClientRect();
    const { tilt, rotation } = view3dRef.current;
    let x = clientX - (rect.left + rect.width / 2);
    let y = clientY - (rect.top + rect.height / 2);
    if (tilt !== 0 || rotation !== 0) {
      const th = (tilt * Math.PI) / 180;
      const ph = (rotation * Math.PI) / 180;
      const ct = Math.cos(th);
      const st = Math.sin(th);
      const cf = Math.cos(ph);
      const sf = Math.sin(ph);
      // وارون rotateX + perspective برای مؤلفه عمودی
      const denom = PERSPECTIVE_PX * ct + y * st;
      const y1 = Math.abs(denom) < 1e-6 ? y : (PERSPECTIVE_PX * y) / denom;
      const s = PERSPECTIVE_PX / Math.max(120, PERSPECTIVE_PX - y1 * st);
      const x1 = x / s;
      // وارون rotateZ
      x = x1 * cf + y1 * sf;
      y = -x1 * sf + y1 * cf;
    }
    return { x: x + rect.width / 2, y: y + rect.height / 2 };
  }, []);

  /** نسبت fit برای یک جعبه چیدمان — هم‌روش با commit */
  const fit0 = useCallback((rect: { width: number; height: number }) => {
    return Math.min(rect.width / MAP_CANVAS.w, rect.height / MAP_CANVAS.h);
  }, []);

  /** هندسه چیدمان: جعبه بدون ترنسفورم + نسبت fit + آفست letterbox */
  const hostGeo = useCallback(() => {
    const host = rootRef.current;
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    const fit = fit0(rect);
    return {
      rect,
      fit,
      ox: (rect.width - MAP_CANVAS.w * fit) / 2,
      oy: (rect.height - MAP_CANVAS.h * fit) / 2,
    };
  }, [fit0]);

  /** تبدیل مختصات صفحه به مختصات viewBox (با احتساب letterbox و نمای 3D) */
  const viewPoint = useCallback(
    (clientX: number, clientY: number) => {
      const g = hostGeo();
      if (!g) return { vx: 0, vy: 0 };
      const p = unprojectClient(clientX, clientY);
      return {
        vx:
          (p.x - g.rect.left - g.ox) / (g.fit * tRef.current.scale) -
          tRef.current.tx / tRef.current.scale,
        vy:
          (p.y - g.rect.top - g.oy) / (g.fit * tRef.current.scale) -
          tRef.current.ty / tRef.current.scale,
      };
    },
    [unprojectClient, hostGeo]
  );

  /** بزرگ‌نمایی حول یک نقطه صفحه (پیش‌فرض: مرکز) — لنگر ثابت می‌ماند */
  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const t0 = tRef.current;
      const g = hostGeo();
      if (!g) {
        commit({ ...t0, scale: t0.scale * factor });
        return;
      }
      const cx = clientX ?? g.rect.left + g.rect.width / 2;
      const cy = clientY ?? g.rect.top + g.rect.height / 2;
      // نقطه لنگر — با وارون 3D به مختصات تخت برگردانده می‌شود
      const p = unprojectClient(cx, cy);
      const ax = (p.x - g.rect.left - g.ox) / g.fit;
      const ay = (p.y - g.rect.top - g.oy) / g.fit;
      const scale = clamp(t0.scale * factor, MIN_SCALE, MAX_SCALE);
      commit({
        scale,
        tx: ax - ((ax - t0.tx) * scale) / t0.scale,
        ty: ay - ((ay - t0.ty) * scale) / t0.scale,
      });
    },
    [commit, hostGeo, unprojectClient]
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
      const g = hostGeo();
      if (!g) return;
      // فاصله و نقطه میانی در «فضای تخت» — وارون 3D برای هر انگشت
      const f1 = unprojectClient(p1.x, p1.y);
      const f2 = unprojectClient(p2.x, p2.y);
      const fm = unprojectClient((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      pinchRef.current = {
        dist0: Math.hypot(f1.x - f2.x, f1.y - f2.y) || 1,
        vx0: (fm.x - g.rect.left - g.ox) / g.fit,
        vy0: (fm.y - g.rect.top - g.oy) / g.fit,
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
      // پینچ: مقیاس + حفظ لنگر زیر انگشتان — همه در فضای تخت (وارون 3D)
      const [p1, p2] = [...pointersRef.current.values()];
      const p0 = pinchRef.current;
      const g = hostGeo();
      if (!g) return;
      const f1 = unprojectClient(p1.x, p1.y);
      const f2 = unprojectClient(p2.x, p2.y);
      const fm = unprojectClient((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      const dist = Math.hypot(f1.x - f2.x, f1.y - f2.y) || 1;
      const vxm = (fm.x - g.rect.left - g.ox) / g.fit;
      const vym = (fm.y - g.rect.top - g.oy) / g.fit;
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
      const g = hostGeo();
      if (!g) return;
      // جابجایی در فضای تخت — در نمای 3D با وارون دقیق محاسبه می‌شود
      const s0 = unprojectClient(p0.startX, p0.startY);
      const s1 = unprojectClient(e.clientX, e.clientY);
      const dx = (s1.x - s0.x) / g.fit;
      const dy = (s1.y - s0.y) / g.fit;
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
      const g = hostGeo();
      if (!g) return;
      const scale = 2.4;
      commit({
        scale,
        tx: g.rect.width / (2 * g.fit) - scale * sx,
        ty: g.rect.height / (2 * g.fit) - scale * sy,
      });
    },
    [commit, hostGeo]
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
    setLocate({ kind: "busy" });
    void (async () => {
      // روی اندروید مجوز لحظه‌ای با دیالوگ سیستم گرفته می‌شود
      const perm = await requestGeoPermission();
      if (perm === "denied") {
        setLocate({ kind: "error", message: "دسترسی موقعیت مکانی داده نشد" });
        return;
      }
      if (perm === "unavailable") {
        setLocate({ kind: "error", message: "مرورگر از موقعیت‌یابی پشتیبانی نمی‌کند" });
        return;
      }
      // همگرایی GPS تا دقت خوب — fixهای اولیه ناعدد باعث
      // «نمایش مکان اشتباه» می‌شد؛ توقف زودهنگام نداریم
      const fix = await getCurrentGeoBest(3, 8000, 450, 25000);
      if (!fix) {
        setLocate({ kind: "error", message: "موقعیت مکانی در دسترس نیست" });
        return;
      }
      if ((fix.accuracy ?? Infinity) > 1000) {
        setLocate({
          kind: "error",
          message: `دقت موقعیت بسیار کم است (±${toFa(Math.round((fix.accuracy ?? 0) / 50) * 50)} متر) — کنار پنجره یا زیر آسمان باز امتحان کنید`,
        });
        return;
      }
      const near = nearestStationTo(fix.lat, fix.lng);
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
        accuracyM: fix.accuracy,
        altName: near.alternative?.name,
        altDistanceM: near.alternative?.distanceM,
      });
      // بزرگ‌نمایی روی ایستگاه
      zoomToStation(st.x, st.y);
    })();
  }, [locate.kind, zoomToStation]);

  const resetView = useCallback(() => {
    commit({ scale: 1, tx: 0, ty: 0 });
    setLocate({ kind: "idle" });
  }, [commit]);

  /* ---------- API دستوری برای کنترل‌های طراحی‌شده صفحه ---------- */
  useImperativeHandle(
    ref,
    (): MetroMapHandle => ({
      zoomIn: () => zoomAt(1.3),
      zoomOut: () => zoomAt(0.77),
      resetView,
      locateMe,
      flyToStation: (stationId: string) => {
        const st = MAP_STATION_BY_ID.get(stationId);
        if (st) zoomToStation(st.x, st.y);
      },
      toggle3D: () =>
        setTilt3d((v) => !v),
      rotateBy: (deg: number) => setRotationDeg((v) => (((v + deg) % 360) + 360) % 360),
    }),
    [zoomAt, resetView, locateMe, zoomToStation]
  );

  const highlighted = useMemo(() => {
    const set = new Set<string>();
    for (const id of highlightStations ?? []) {
      // ایستگاه‌های خطوط خاموش رندر نمی‌شوند
      if (visible.stationIds.has(id)) set.add(id);
    }
    if (locate.kind === "ok" && visible.stationIds.has(locate.stationId)) set.add(locate.stationId);
    return set;
  }, [highlightStations, locate, visible.stationIds]);

  /* ============================================================
     موتور برچسب‌ها — مقیاس «فضای صفحه»:
     برخلاف گذشته که متن‌ها داخل گروه بزرگ‌نمایی‌شونده بودند (و در
     بزرگ‌نمایی ۱ روی هم ریخته دیده می‌شدند)، اینجا هر برچسب:
     ۱. با اندازه ثابت روی صفحه رندر می‌شود (مستقل از زوم)
     ۲. زنده از مختصات ایستگاه پیروی می‌کند
     ۳. فقط اگر با برچسب مهم‌تری همپوشانی نداشته باشد نمایش
        داده می‌شود — با نزدیک‌تر شدن (زوم بیشتر) برچسب‌های
        بیشتری جا می‌گیرند و ظاهر می‌شوند
     ۴. روی «بدنه خطوط» نمی‌افتد (شبکه اشغال خطوط) و در صورت
        کمبود جا، بالای/پایین ایستگاه هم امتحان می‌شود
     ============================================================ */
  const fit = box.w > 0 && box.h > 0 ? Math.min(box.w / MAP_CANVAS.w, box.h / MAP_CANVAS.h) : 0;

  /** چک اشغال خطوط — جعبه برچسب (فضای صفحه) به فضای بوم برگردانده می‌شود */
  const hitsStroke = useCallback(
    (b: Box) => {
      const { grid, gw, gh } = strokeGrid;
      const cx0 = (b.x0 - t.tx) / t.scale;
      const cy0 = (b.y0 - t.ty) / t.scale;
      const cx1 = (b.x1 - t.tx) / t.scale;
      const cy1 = (b.y1 - t.ty) / t.scale;
      const c0x = Math.max(0, Math.floor(cx0 / GRID_CELL));
      const c1x = Math.min(gw - 1, Math.floor(cx1 / GRID_CELL));
      const c0y = Math.max(0, Math.floor(cy0 / GRID_CELL));
      const c1y = Math.min(gh - 1, Math.floor(cy1 / GRID_CELL));
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          if (grid[cy * gw + cx]) return true;
        }
      }
      return false;
    },
    [strokeGrid, t.scale, t.tx, t.ty]
  );

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
    const legendZone = showControls ? htmlZone(10, 10, 158, legendOpen ? (onToggleLine ? 240 : 185) : 40) : null;
    if (legendZone) boxes.push(legendZone);
    // ستون کنترل‌های شناور — داخلی: پایین-چپ؛ کنترل صفحه: ستون چپ از بالای نوار فیلتر
    const controlsZone = showControls
      ? htmlZone(8, box.h - 196, 44, 188)
      : htmlZone(8, 128, 52, Math.min(280, Math.max(120, box.h - 210)));
    if (controlsZone) boxes.push(controlsZone);

    /* ---------- نشان شماره خطوط (اندازه ثابت، پشته‌ای در ایستگاه مشترک) ---------- */
    const badges: BadgeItem[] = [];
    const badgeN = new Map<string, number>();
    for (const ml of visible.lines) {
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

    /* ---------- ناحیه حفاظتی «همه» ایستگاه‌های نمایان ----------
       هیچ برچسبی نباید روی دایره هیچ ایستگاهی بنشیند — نه فقط تبادلی‌ها */
    const dotExcl: { id: string; box: Box }[] = [];
    for (const s of MAP_STATIONS) {
      if (!visible.stationIds.has(s.id)) continue;
      const isInter = visible.inter.has(s.id);
      const half = (isInter ? 6.4 : 5.2) * t.scale + 3.5 / fit;
      const X = s.x * t.scale + t.tx;
      const Y = s.y * t.scale + t.ty;
      dotExcl.push({
        id: s.id,
        box: { x0: X - half, y0: Y - half, x1: X + half, y1: Y + half },
      });
    }
    const hitsDot = (b: Box, selfId: string) =>
      dotExcl.some(
        (e) => e.id !== selfId && b.x0 < e.box.x1 && b.x1 > e.box.x0 && b.y0 < e.box.y1 && b.y1 > e.box.y0
      );

    /* ---------- برچسب‌ها به ترتیب اولویت (تبادلی ← پرچم‌دار ← عادی) ----------
       فقط ایستگاه‌های خطوط نمایان؛ در نمای کلی (زوم کم) فقط ایستگاه‌های
       مهم برچسب می‌گیرند تا نقشه شلوغ به نظر نرسد — با بزرگ‌نمایی،
       برچسب ایستگاه‌های کوچک هم به‌تدریج ظاهر می‌شود */
    const showMinor = t.scale >= MINOR_LABEL_SCALE;
    const cands = MAP_STATIONS.filter((s: MapStation) => visible.stationIds.has(s.id)).map((s: MapStation) => {
      const isInter = visible.inter.has(s.id);
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
    }).sort((a, b) => b.prio - a.prio).filter(({ s, major }) => major || showMinor || highlighted.has(s.id));

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
      // اگر در دو طرفِ هم‌سطح جا نشد: بالای و پایین ایستگاه هم امتحان می‌شود
      const stepDy = hVb + 6;
      const dyOptions = [0, stepDy, -stepDy, stepDy * 2, -(stepDy * 2), stepDy * 3, -(stepDy * 3)];

      let placed = false;
      for (const dy of dyOptions) {
        for (const side of sides) {
          const bx0 = side === "right" ? X + gapVb : X - gapVb - wVb;
          const by0 = Y + dy - hVb / 2;
          const b: Box = { x0: bx0, y0: by0, x1: bx0 + wVb, y1: by0 + hVb };
          if (b.x0 < 1 || b.x1 > MAP_CANVAS.w - 1 || b.y0 < 1 || b.y1 > MAP_CANVAS.h - 1) continue;
          if (overlaps(b) || hitsDot(b, s.id) || hitsStroke(b)) continue;
          boxes.push(b);
          labels.push({
            id: s.id,
            name: s.name,
            x: side === "right" ? X + gapVb : X - gapVb,
            y: Y + dy + toVb(fontPx * 0.35),
            anchor: side === "right" ? "end" : "start",
            fontSize: toVb(fontPx),
            weight,
            halo: toVb(major ? 3.4 : 2.8),
          });
          placed = true;
          break;
        }
        if (placed) break;
      }
    }

    return { labels, badges };
  }, [t, fit, fontsTick, highlighted, legendOpen, box.w, box.h, visible, hitsStroke, onToggleLine, showControls]);

  /* مسیر منتخب — فقط ایستگاه‌هایی که روی خطوط نمایان هستند */
  const routePath = useMemo(() => {
    if (!routeStations || routeStations.length < 2) return null;
    const pts: { x: number; y: number }[] = [];
    for (const id of routeStations) {
      if (!visible.stationIds.has(id)) continue;
      const s = MAP_STATION_BY_ID.get(id);
      if (s) pts.push(s);
    }
    return pts.length >= 2 ? pts : null;
  }, [routeStations, visible.stationIds]);

  return (
    <div
      ref={rootRef}
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{ perspective: `${PERSPECTIVE_PX}px`, perspectiveOrigin: "center center" }}
    >
      {/* لایه SVG نقشه — در نمای سه‌بعدی با چرخش CSS مایل می‌شود؛
          تعامل‌ها با وارون دقیق همان زنجیره ترنسفورم محاسبه می‌شوند */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_CANVAS.w} ${MAP_CANVAS.h}`}
        className="w-full h-full map-viewport select-none"
        style={{
          touchAction: "none",
          transform:
            tilt3d || rotationDeg !== 0
              ? `rotateX(${tilt3d ? TILT_3D_DEG : 0}deg) rotateZ(${rotationDeg}deg)`
              : undefined,
          transition: "transform 320ms cubic-bezier(0.4, 0, 0.2, 1)",
          willChange: "transform",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        role="img"
        aria-label="نقشه تعاملی حمل‌ونقل تهران — با دو انگشت بزرگ‌نمایی کنید"
      >
        <defs>
          <pattern id="map-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="var(--mq-map-grid)" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect width={MAP_CANVAS.w} height={MAP_CANVAS.h} fill="var(--mq-map-bg)" />
        <rect width={MAP_CANVAS.w} height={MAP_CANVAS.h} fill="url(#map-grid)" />

        <g transform={`translate(${t.tx} ${t.ty}) scale(${t.scale})`}>
          {/* خطوط — فقط خطوط نمایان (کلید چشم)؛ هر خط با زیرلایه روشن */}
          {visible.lines.map((ml) => (
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

          {/* مسیر منتخب — نوار پررنگ مسیر روی خطوط */}
          {routePath && (
            <g pointerEvents="none">
              <polyline
                points={routePath.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="var(--mq-card)"
                strokeWidth={13}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
              <polyline
                points={routePath.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#0d58a6"
                strokeWidth={8.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.92}
              />
              <polyline
                points={routePath.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#ffffff"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="2 10"
                opacity={0.9}
              />
            </g>
          )}

          {/* ایستگاه‌ها — فقط ایستگاه‌های خطوط نمایان؛ حلقه با رنگ خط (سبک نقشه کلاسیک) */}
          {MAP_STATIONS.map((s) => {
            if (!visible.stationIds.has(s.id)) return null;
            const isInter = visible.inter.has(s.id);
            const isHi = highlighted.has(s.id);
            const r = isInter ? 7.2 : 5.2;
            const ringColor = visible.color.get(s.id) ?? "var(--mq-ink)";
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
                  stroke={isHi ? "#0d58a6" : isInter ? "var(--mq-ink)" : ringColor}
                  strokeWidth={isHi ? 2.6 : isInter ? 1.7 : 2.4}
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

      {/* ================= کارت راهنمای خطوط — فقط در حالت کنترل داخلی ================= */}
      {showControls && (
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
          <div className="fade-in px-2.5 pb-2 grid grid-cols-1 gap-0.5 border-t border-metro-outline-var/50 pt-1.5">
            {onToggleLine && hiddenSet.size > 0 && (
              <button
                type="button"
                onClick={() => TEHRAN_LINES.forEach((l) => hiddenSet.has(l.id) && onToggleLine(l.id))}
                className="flex items-center justify-center gap-1 w-full h-6 rounded-lg bg-metro-primary-c/10 text-[9px] font-bold text-metro-primary-c active:scale-95 transition-all mb-1"
              >
                <MI name="visibility" size={12} />
                نمایش همه خطوط
              </button>
            )}
            {TEHRAN_LINES.map((l) => {
              const isHidden = hiddenSet.has(l.id);
              const eyeBtn = onToggleLine ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLine(l.id);
                  }}
                  aria-label={isHidden ? `نمایش ${l.name}` : `پنهان کردن ${l.name}`}
                  aria-pressed={!isHidden}
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 active:scale-90 transition-all text-metro-primary-c hover:bg-surface-container"
                >
                  <MI name={isHidden ? "visibility_off" : "visibility"} size={15} className={isHidden ? "text-outline-variant" : ""} />
                </button>
              ) : null;
              return (
                <div
                  key={l.id}
                  className={`flex items-center gap-1.5 rounded-lg px-0.5 transition-opacity ${isHidden ? "opacity-45" : ""}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  <span className={`text-[9px] font-semibold text-metro-ink truncate ${isHidden ? "line-through" : ""}`}>
                    {l.name} — {l.terminals[0]} / {l.terminals[1]}
                  </span>
                  {eyeBtn}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

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
            {locate.altName && locate.altDistanceM !== undefined && locate.accuracyM !== null && locate.accuracyM > 450
              ? ` — یا ${locate.altName}؟`
              : ""}
            {locate.accuracyM !== null && locate.accuracyM > 100
              ? ` — دقت GPS: ±${toFa(Math.round(locate.accuracyM / 50) * 50)} متر`
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

      {/* ================= کنترل‌های شناور داخلی — فقط وقتی صفحه کنترل ندارد ================= */}
      {showControls && (
        <div className="absolute bottom-2.5 left-2.5 flex flex-col gap-1.5">
          {/* تعویض نمای دوبعدی/سه‌بعدی — طبق دستور بازطراحی */}
          <button
            onClick={() => setTilt3d((v) => !v)}
            aria-pressed={tilt3d}
            aria-label={tilt3d ? "رفتن به نمای دوبعدی" : "رفتن به نمای سه‌بعدی"}
            title={tilt3d ? "نمای دوبعدی" : "نمای سه‌بعدی"}
            className={`h-9 w-11 rounded-xl shadow border flex items-center justify-center font-bold text-[11px] active:scale-95 transition-all ${
              tilt3d
                ? "bg-metro-primary-c text-white border-metro-primary-c"
                : "bg-metro-card text-metro-primary-c border-metro-outline-var"
            }`}
          >
            {tilt3d ? "3D" : "2D"}
          </button>
          {/* قطب‌نما — چرخش ۴۵ درجه‌ای نقشه */}
          <button
            onClick={() => setRotationDeg((v) => (((v + 45) % 360) + 360) % 360)}
            aria-label="چرخش نقشه"
            title="چرخش نقشه (هر لمس ۴۵ درجه)"
            className="w-9 h-9 rounded-xl bg-metro-card shadow border border-metro-outline-var flex items-center justify-center text-metro-primary-c active:scale-95 transition-all"
          >
            <span style={{ display: "inline-flex", transform: `rotate(${rotationDeg}deg)` }}>
              <MI name="explore" size={18} />
            </span>
          </button>
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
      )}
    </div>
  );
});
