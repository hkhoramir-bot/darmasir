// ============================================================
// درمسیر — سرور API عمومی روی Cloudflare Workers
// ------------------------------------------------------------
// اپ اندروید به این سرور وصل می‌شود (فاز ۳ سند توسعه):
//   - تنظیمات و اعلان‌ها (kill-switch بدون انتشار نسخه جدید)
//   - تبلیغات (مدیریت کامل از پنل، بدون انتشار نسخه)
//   - بررسی نسخه (پیشنهاد آپدیت درون‌اپ)
//   - ثبت و پیگیری تیکت پشتیبانی
//
// دیتابیس: Turso (libSQL) — همان دیتابیسِ پنل مدیریت.
// پنل می‌نویسد، ورکر فقط می‌خواند (به‌جز تیکت که از اپ می‌آید).
//
// این فایل دو روش استفاده دارد:
//   ۱) استقرار مستقل:  wrangler deploy
//   ۲) ادغام در ورکر موجود شما: تابع handleApi را import کنید و
//      در fetch handler خودتان صدا بزنید (README را ببینید)
// ============================================================
import { createClient, type Client } from "@libsql/client/web";

export interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id",
  "Access-Control-Max-Age": "86400",
} as const;

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extraHeaders },
  });
}

function fail(error: string, status = 400): Response {
  return json({ ok: false, error }, status);
}

function ok(data: unknown, extraHeaders: Record<string, string> = {}): Response {
  return json({ ok: true, data }, 200, extraHeaders);
}

/** رشته ISO با فرمت یکسان با رکوردهای Prisma — برای مقایسه لغوی تاریخ در SQLite */
function nowIso(): string {
  return new Date().toISOString();
}

function getDb(env: Env): Client {
  return createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
}

/** پاسخ‌های GET پرترافمان را ۶۰ ثانیه در cache لبه Cloudflare نگه می‌دارد
 *  (مصرف free tier دیتابیس را به شدت کم می‌کند) */
async function cached(
  ctx: ExecutionContext,
  url: URL,
  producer: () => Promise<Response>
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const res = await producer();
  const res2 = new Response(res.body, res);
  res2.headers.set("Cache-Control", "public, max-age=60");
  ctx.waitUntil(cache.put(cacheKey, res2.clone()));
  return res2;
}

// ------------------------------------------------------------
// endpoint ها
// ------------------------------------------------------------

/** GET / — سلامت سرویس */
async function health(): Promise<Response> {
  return ok({
    service: "darmasir-api",
    version: 1,
    time: nowIso(),
  });
}

/** GET /v1/config — تنظیمات عمومی اپ (اعلان‌ها، راهنمای صوتی و ...) */
async function getConfig(db: Client): Promise<Response> {
  const res = await db.execute("SELECT key, value FROM Setting");
  const settings: Record<string, string> = {};
  for (const row of res.rows) {
    settings[String(row.key)] = String(row.value);
  }
  return ok({ settings });
}

/** GET /v1/ads?placement=HOME_BANNER — بنرهای فعال (بند ۹ سند) */
async function getAds(db: Client, url: URL): Promise<Response> {
  const placement = url.searchParams.get("placement");
  const now = nowIso();
  const args: string[] = [now, now];
  let wherePlacement = "";
  if (placement) {
    wherePlacement = " AND placement = ?";
    args.push(placement);
  }
  const res = await db.execute({
    sql:
      "SELECT id, title, body, imageUrl, linkUrl, placement FROM Ad " +
      "WHERE active = 1 AND startAt <= ? AND endAt >= ?" +
      wherePlacement +
      " ORDER BY createdAt DESC LIMIT 10",
    args,
  });
  const ads = res.rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    body: r.body ? String(r.body) : null,
    imageUrl: r.imageUrl ? String(r.imageUrl) : null,
    linkUrl: r.linkUrl ? String(r.linkUrl) : null,
    placement: String(r.placement),
  }));
  return ok({ ads, serverTime: now });
}

/** GET /v1/version — آخرین نسخه اپ (بررسی آپدیت درون‌اپ) */
async function getVersion(db: Client): Promise<Response> {
  const res = await db.execute(
    "SELECT versionName, versionCode, apkUrl, notes, publishedAt " +
      "FROM AppVersion WHERE latest = 1 ORDER BY publishedAt DESC LIMIT 1"
  );
  const row = res.rows[0];
  if (!row) {
    return ok({ version: null, message: "نسخه‌ای ثبت نشده است" });
  }
  return ok({
    version: {
      versionName: String(row.versionName),
      versionCode: Number(row.versionCode),
      apkUrl: row.apkUrl ? String(row.apkUrl) : null,
      notes: row.notes ? String(row.notes) : null,
      publishedAt: String(row.publishedAt),
    },
  });
}

/** GET /v1/lines — خطوط و ایستگاه‌ها (به‌روزرسانی داده نقشه بدون انتشار APK) */
async function getLines(db: Client): Promise<Response> {
  const lines = await db.execute(
    'SELECT id, code, name, kind, color, stationCount, status FROM Line ORDER BY kind, code'
  );
  const stations = await db.execute(
    'SELECT id, name, lineId, lat, lng, kind, status, "order" FROM Station ORDER BY lineId, "order"'
  );
  const stationsByLine = new Map<string, unknown[]>();
  for (const s of stations.rows) {
    const key = s.lineId ? String(s.lineId) : "";
    if (!stationsByLine.has(key)) stationsByLine.set(key, []);
    stationsByLine.get(key)!.push({
      id: String(s.id),
      name: String(s.name),
      lat: Number(s.lat),
      lng: Number(s.lng),
      kind: String(s.kind),
      status: String(s.status),
      order: Number(s["order"]),
    });
  }
  const data = lines.rows.map((l) => ({
    id: String(l.id),
    code: String(l.code),
    name: String(l.name),
    kind: String(l.kind),
    color: String(l.color),
    stationCount: Number(l.stationCount),
    status: String(l.status),
    stations: stationsByLine.get(String(l.id)) ?? [],
  }));
  return ok({ lines: data });
}

/** POST /v1/tickets — ثبت تیکت پشتیبانی از اپ
 *  بدنه: { subject, userName, message, category?, priority? }
 *  هدر: X-Device-Id (الزامی — برای پیگیری توسط خود کاربر) */
async function createTicket(db: Client, req: Request): Promise<Response> {
  const deviceId = req.headers.get("x-device-id");
  if (!deviceId || deviceId.length < 8 || deviceId.length > 64) {
    return fail("هدر X-Device-Id معتبر لازم است", 401);
  }

  let body: {
    subject?: string;
    userName?: string;
    message?: string;
    category?: string;
    priority?: string;
  };
  try {
    body = await req.json();
  } catch {
    return fail("بدنه JSON نامعتبر است");
  }

  const subject = (body.subject || "").trim();
  const userName = (body.userName || "").trim() || "کاربر اپلیکیشن";
  const message = (body.message || "").trim();
  if (!subject || !message) {
    return fail("موضوع و متن پیام الزامی است");
  }
  const category = ["GENERAL", "GPS", "VOICE", "ROUTE", "PAYMENT", "OTHER"].includes(
    body.category || ""
  )
    ? body.category!
    : "GENERAL";
  const priority = ["LOW", "NORMAL", "HIGH", "URGENT"].includes(body.priority || "")
    ? body.priority!
    : "NORMAL";

  // کد تیکت: بزرگ‌ترین شماره فعلی + ۱
  const maxRes = await db.execute(
    "SELECT MAX(CAST(SUBSTR(code, 4) AS INTEGER)) AS n FROM Ticket"
  );
  const maxN = Number(maxRes.rows[0]?.n ?? 1000);
  const code = `TK-${maxN + 1}`;

  const now = nowIso();
  const ticketId = crypto.randomUUID();
  await db.execute({
    sql:
      "INSERT INTO Ticket (id, code, subject, userName, deviceId, category, priority, status, createdAt, updatedAt) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)",
    args: [
      ticketId,
      code,
      subject.slice(0, 200),
      userName.slice(0, 80),
      deviceId,
      category,
      priority,
      now,
      now,
    ],
  });

  await db.execute({
    sql:
      "INSERT INTO TicketMessage (id, ticketId, author, body, createdAt) VALUES (?, ?, 'USER', ?, ?)",
    args: [crypto.randomUUID(), ticketId, message.slice(0, 2000), now],
  });

  // رد در گزارش پنل
  await db.execute({
    sql:
      "INSERT INTO AuditLog (id, adminId, action, entity, entityId, detail, createdAt) VALUES (?, NULL, 'APP_TICKET_CREATED', 'TICKET', ?, ?, ?)",
    args: [crypto.randomUUID(), code, `تیکت جدید از اپ (${category})`, now],
  });

  return ok({ code, status: "OPEN" }, { "Cache-Control": "no-store" });
}

/** GET /v1/tickets/:code — پیگیری تیکت (فقط توسط همان دستگاه) */
async function getTicket(db: Client, code: string, req: Request): Promise<Response> {
  const deviceId = req.headers.get("x-device-id");
  if (!deviceId) {
    return fail("هدر X-Device-Id لازم است", 401);
  }
  const res = await db.execute({
    sql:
      "SELECT id, code, subject, userName, category, priority, status, createdAt, updatedAt " +
      "FROM Ticket WHERE code = ? AND deviceId = ?",
    args: [code, deviceId],
  });
  const t = res.rows[0];
  if (!t) {
    return fail("تیکتی با این کد برای این دستگاه پیدا نشد", 404);
  }
  const msgs = await db.execute({
    sql: "SELECT author, body, createdAt FROM TicketMessage WHERE ticketId = ? ORDER BY createdAt",
    args: [String(t.id)],
  });
  return ok({
    ticket: {
      code: String(t.code),
      subject: String(t.subject),
      userName: String(t.userName),
      category: String(t.category),
      priority: String(t.priority),
      status: String(t.status),
      createdAt: String(t.createdAt),
      updatedAt: String(t.updatedAt),
    },
    messages: msgs.rows.map((m) => ({
      author: String(m.author),
      body: String(m.body),
      createdAt: String(m.createdAt),
    })),
  });
}

// ------------------------------------------------------------
// روتینگ
// ------------------------------------------------------------

export async function handleApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    if (path === "/" && request.method === "GET") {
      return await health();
    }

    const db = getDb(env);

    if (request.method === "GET") {
      switch (path) {
        case "/v1/config":
          return await cached(ctx, url, () => getConfig(db));
        case "/v1/ads":
          return await cached(ctx, url, () => getAds(db, url));
        case "/v1/version":
          return await cached(ctx, url, () => getVersion(db));
        case "/v1/lines":
          return await cached(ctx, url, () => getLines(db));
        default: {
          const ticketMatch = /^\/v1\/tickets\/(TK-\d+)$/.exec(path);
          if (ticketMatch) {
            return await getTicket(db, ticketMatch[1], request);
          }
          return fail("مسیر پیدا نشد", 404);
        }
      }
    }

    if (request.method === "POST" && path === "/v1/tickets") {
      return await createTicket(db, request);
    }

    return fail("مسیر یا متد پشتیبانی نمی‌شود", 404);
  } catch (e) {
    console.error("api error:", e);
    return fail("خطای داخلی سرور — بعداً تلاش کنید", 500);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleApi(request, env, ctx);
  },
};
