/* ============================================================
   پل API محلی برای نسخه اندروید (Capacitor)
   روی گوشی سرور Next وجود ندارد؛ درخواست‌های /api/* با همین
   ماژول از حافظه دستگاه (localStorage) پاسخ داده می‌شوند.
   فقط وقتی فعال می‌شود که اپ داخل WebView اندروید اجرا شود.
   ============================================================ */

import {
  computeRoute,
  getLine,
  getStation,
  nextArrivalsBoth,
  toFa,
} from "@/lib/metro-data";

type Json = Record<string, unknown>;

const LS = {
  trips: "metrojo-native-trips",
  daily: "metrojo-native-daily",
  favs: "metrojo-native-favs",
  reports: "metrojo-native-reports",
};

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* حافظه پر است */
  }
}

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/* ---------------------------- handlers ---------------------------- */

function getHistory(): Response {
  const trips = lsGet<Json[]>(LS.trips, []);
  const minutes = trips.reduce((a, t) => a + Number(t.minutes ?? 0), 0);
  const fare = trips.reduce((a, t) => a + Number(t.fare ?? 0), 0);
  const stats = {
    count: trips.length,
    minutes,
    fare,
    topFrom: trips.length ? trips[0].fromName : null,
  };
  return json({ trips, stats });
}

function postHistory(body: Json): Response {
  const from = getStation(String(body?.fromStationId ?? ""));
  const to = getStation(String(body?.toStationId ?? ""));
  if (!from || !to) return json({ error: "ایستگاه نامعتبر است" }, 400);

  const plan = computeRoute(from.id, to.id, (body?.pref as string) ?? "fastest");
  if (!plan) return json({ error: "مسیری یافت نشد" }, 404);

  const trip = {
    id: uid(),
    fromStationId: from.id,
    fromName: from.name,
    toStationId: to.id,
    toName: to.name,
    minutes: plan.totalMinutes,
    transfers: plan.transfers,
    fare: plan.fare,
    pref: plan.pref,
    createdAt: new Date().toISOString(),
  };
  const trips = lsGet<Json[]>(LS.trips, []);
  trips.unshift(trip);
  lsSet(LS.trips, trips.slice(0, 40));
  return json({ trip });
}

function deleteHistory(id: string | null, all: boolean): Response {
  if (all) {
    lsSet(LS.trips, []);
    return json({ ok: true });
  }
  if (!id) return json({ error: "شناسه لازم است" }, 400);
  lsSet(
    LS.trips,
    lsGet<Json[]>(LS.trips, []).filter((t) => t.id !== id)
  );
  return json({ ok: true });
}

function getDailyRoutes(): Response {
  return json({ routes: lsGet<Json[]>(LS.daily, []) });
}

function postDailyRoute(body: Json): Response {
  const from = getStation(String(body?.fromStationId ?? ""));
  const to = getStation(String(body?.toStationId ?? ""));
  if (!from || !to) return json({ error: "ایستگاه نامعتبر است" }, 400);

  const kind = ["home", "work", "custom"].includes(String(body?.kind))
    ? String(body?.kind)
    : "custom";
  const route = {
    id: uid(),
    kind,
    label:
      (body?.label as string) ??
      (kind === "home"
        ? "به سمت خانه"
        : kind === "work"
          ? "به سمت محل کار"
          : "مسیر جدید"),
    fromStationId: from.id,
    toStationId: to.id,
    fromName: from.name,
    toName: to.name,
    createdAt: new Date().toISOString(),
  };
  const routes = lsGet<Json[]>(LS.daily, []);
  routes.push(route);
  lsSet(LS.daily, routes);
  return json({ route });
}

function deleteDailyRoute(id: string | null): Response {
  if (!id) return json({ error: "شناسه لازم است" }, 400);
  lsSet(
    LS.daily,
    lsGet<Json[]>(LS.daily, []).filter((r) => r.id !== id)
  );
  return json({ ok: true });
}

function getFavorites(): Response {
  const favs = lsGet<string[]>(LS.favs, []);
  const stations = favs
    .map((stationId) => {
      const s = getStation(stationId);
      if (!s) return null;
      return {
        id: s.id,
        name: s.name,
        isInterchange: s.lines.length > 1,
        lines: s.lines.map((l) => {
          const line = getLine(l.lineId);
          return {
            id: line.id,
            number: line.number,
            name: line.name,
            color: line.color,
            textOnColor: line.textOnColor,
          };
        }),
        amenities: s.amenities,
        favoritedAt: new Date().toISOString(),
      };
    })
    .filter(Boolean);
  return json({ favorites: stations, ids: favs });
}

function postFavorite(body: Json): Response {
  const stationId = String(body?.stationId ?? "");
  if (!stationId || !getStation(stationId)) {
    return json({ error: "ایستگاه نامعتبر است" }, 400);
  }
  const favs = lsGet<string[]>(LS.favs, []);
  if (!favs.includes(stationId)) {
    favs.unshift(stationId);
    lsSet(LS.favs, favs);
  }
  return json({ ok: true });
}

function deleteFavorite(stationId: string | null): Response {
  if (!stationId) return json({ error: "شناسه لازم است" }, 400);
  lsSet(
    LS.favs,
    lsGet<string[]>(LS.favs, []).filter((s) => s !== stationId)
  );
  return json({ ok: true });
}

const TYPE_LABEL: Record<string, string> = {
  escalator: "پله‌برقی",
  elevator: "آسانسور",
  ramp: "رمپ متحرک",
};
const STATUS_LABEL: Record<string, string> = {
  working: "فعال و روان",
  malfunction: "متوقف و خاموش",
  under_maintenance: "در حال سرویس فنی",
};

function getReports(stationId: string | null): Response {
  const all = lsGet<Json[]>(LS.reports, []);
  const reports = stationId ? all.filter((r) => r.stationId === stationId) : all;
  return json({ reports: reports.slice(0, 30) });
}

function postReport(body: Json): Response {
  const stationId = String(body?.stationId ?? "");
  if (!stationId || !getStation(stationId)) {
    return json({ error: "ایستگاه نامعتبر است" }, 400);
  }
  const equipmentType = String(body?.equipmentType ?? "");
  const status = String(body?.status ?? "");
  if (!TYPE_LABEL[equipmentType] || !STATUS_LABEL[status]) {
    return json({ error: "نوع تجهیزات یا وضعیت نامعتبر است" }, 400);
  }
  const report = {
    id: uid(),
    stationId,
    equipmentType,
    exitLabel: (body?.exitLabel as string) ?? "ورودی اصلی",
    status,
    note: (body?.note as string) ?? null,
    createdAt: new Date().toISOString(),
  };
  const reports = lsGet<Json[]>(LS.reports, []);
  reports.unshift(report);
  lsSet(LS.reports, reports);
  return json({
    ok: true,
    report: {
      ...report,
      equipmentLabel: TYPE_LABEL[equipmentType],
      statusLabel: STATUS_LABEL[status],
    },
  });
}

function getArrivals(stationId: string | null): Response {
  const station = stationId ? getStation(stationId) : undefined;
  if (!station) return json({ error: "ایستگاه یافت نشد" }, 404);

  const now = Date.now();
  const arrivals = station.lines.map((ls) => {
    const line = getLine(ls.lineId);
    return {
      lineId: line.id,
      lineName: line.name,
      lineNumber: line.number,
      color: line.color,
      textOnColor: line.textOnColor,
      headwayLabel: toFa(line.headway),
      directions: nextArrivalsBoth(ls.lineId, station.id, now).map((d) => ({
        to: d.to,
        nextMin: Math.max(1, Math.ceil(d.minutes[0] / 60)),
        next2Min: Math.max(2, Math.ceil(d.minutes[1] / 60)),
        crowd: d.crowd,
        crowdLabel: d.crowdLabel,
      })),
      firstTrain: line.firstTrain,
      lastTrain: line.lastTrain,
    };
  });

  return json({ station: { id: station.id, name: station.name }, arrivals, ts: now });
}

/* ---------------------------- dispatcher ---------------------------- */

async function handle(pathname: string, search: URLSearchParams, method: string, body: Json | null): Promise<Response | null> {
  switch (pathname) {
    case "/api/history": {
      if (method === "GET") return getHistory();
      if (method === "POST") return postHistory(body ?? {});
      if (method === "DELETE")
        return deleteHistory(search.get("id"), Boolean(search.get("all")));
      return null;
    }
    case "/api/daily-routes": {
      if (method === "GET") return getDailyRoutes();
      if (method === "POST") return postDailyRoute(body ?? {});
      if (method === "DELETE") return deleteDailyRoute(search.get("id"));
      return null;
    }
    case "/api/favorites": {
      if (method === "GET") return getFavorites();
      if (method === "POST") return postFavorite(body ?? {});
      if (method === "DELETE") return deleteFavorite(search.get("stationId"));
      return null;
    }
    case "/api/reports": {
      if (method === "GET") return getReports(search.get("station"));
      if (method === "POST") return postReport(body ?? {});
      return null;
    }
    case "/api/arrivals": {
      if (method === "GET") return getArrivals(search.get("station"));
      return null;
    }
    default:
      return null;
  }
}

/** نصب پل — فقط داخل اپ اندروید (WebView) */
export function installNativeApiBridge(): void {
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (!w.Capacitor?.isNativePlatform?.()) return;
  const win = window as unknown as {
    fetch: typeof fetch;
    __metrojoApiBridge?: boolean;
  };
  if (win.__metrojoApiBridge) return;
  win.__metrojoApiBridge = true;

  const originalFetch = win.fetch.bind(window);
  win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        window.location.origin
      );
      if (url.pathname.startsWith("/api/")) {
        const method = (init?.method ?? "GET").toUpperCase();
        let body: Json | null = null;
        if (init?.body && typeof init.body === "string") {
          try {
            body = JSON.parse(init.body) as Json;
          } catch {
            body = null;
          }
        }
        const res = await handle(url.pathname, url.searchParams, method, body);
        if (res) return res;
        // مسیرهای صوتی و سایر مسیرها → پاسخ خطای کنترل‌شده
        return json({ message: "در حالت آفلاین در دسترس نیست" }, 503);
      }
    } catch {
      /* ادامه با fetch اصلی */
    }
    return originalFetch(input, init);
  };
}
