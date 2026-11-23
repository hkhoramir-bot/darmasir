/* ============================================================
   درمسیر API — Cloudflare Worker + D1
   قرارداد پاسخ دقیقاً هم‌سان با پنل (mini-services/darmasir-admin):
     { ok: true, data }  |  { ok: false, error: { code, message } }
   رمزها: PBKDF2-SHA256 (WebCrypto) — توکن نشست: 32B تصادفی،
   در دیتابیس sha256 توکن ذخیره می‌شود (توکن خام هرگز ذخیره نمی‌شود).
   ============================================================ */

const SESSION_COOKIE = "darmasir_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CITIES = ["tehran", "karaj", "mashhad", "isfahan"];
const AMENITIES = ["elevator", "escalator", "wc", "atm", "baby", "parking", "bus", "taxi", "bike", "wifi"];
const PLACEMENTS = ["HOME_BANNER", "LINES", "MAP", "STATION_DETAIL"];
const LINE_STATUSES = ["normal", "crowded", "delay", "closed"];
const TICKET_STATUSES = ["OPEN", "PENDING", "CLOSED"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH"];
const CATEGORIES = ["BUG", "SUGGESTION", "BILLING", "OTHER"];
const ROLES = ["SUPERADMIN", "OPERATOR", "VIEWER"];

/* ---------------------------- پاسخ‌ها ---------------------------- */

const enc = new TextEncoder();

function ok(data, status = 200, cors) {
  return json({ ok: true, data }, status, cors);
}
function fail(status, code, message, cors) {
  return json({ ok: false, error: { code, message } }, status, cors);
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...(cors || {}) },
  });
}
function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("origin") || "";
  let allow = "";
  if (allowed.includes("*")) allow = origin || "*";
  else if (origin && allowed.includes(origin)) allow = origin;
  if (!allow) return {};
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    vary: "origin",
  };
}

/* ---------------------------- خطاها ---------------------------- */

class ApiErr extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ---------------------------- اعتبارسنجی سبک ---------------------------- */

function needStr(v, fa, min = 1, max = 500) {
  if (typeof v !== "string" || v.trim().length < min)
    throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» الزامی است (حداقل ${min} نویسه).`);
  if (v.trim().length > max)
    throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» حداکثر ${max} نویسه است.`);
  return v.trim();
}
function optStr(v, fa, max = 500) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» باید متن باشد.`);
  if (v.trim().length > max)
    throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» حداکثر ${max} نویسه است.`);
  return v.trim() || null;
}
function needInt(v, fa, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» باید عدد صحیح بین ${min} و ${max} باشد.`);
  return n;
}
function optInt(v, fa, min, max) {
  if (v === undefined || v === null || v === "") return null;
  return needInt(v, fa, min, max);
}
function optNum(v, fa, min, max) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n) || n < min || n > max)
    throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» باید عددی بین ${min} و ${max} باشد.`);
  return n;
}
function optBool(v, def = false) {
  if (v === undefined || v === null) return def ? 1 : 0;
  return v === true || v === "true" ? 1 : 0;
}
function optDate(v, fa) {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» تاریخ نامعتبر است.`);
  return d.toISOString();
}
function needOneOf(v, list, fa) {
  const s = String(v || "");
  if (!list.includes(s)) throw new ApiErr(400, "VALIDATION", `مقدار «${fa}» معتبر نیست.`);
  return s;
}
function optOneOf(v, list, fa) {
  if (v === undefined || v === null || v === "") return null;
  return needOneOf(v, list, fa);
}
function slug(v, fa, min, max) {
  const s = needStr(v, fa, min, max);
  if (!/^[a-z0-9-]+$/.test(s))
    throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» فقط حروف لاتین کوچک، عدد و خط تیره.`);
  return s;
}
function hex6(v, fa) {
  const s = needStr(v, fa, 7, 7);
  if (!/^#[0-9a-fA-F]{6}$/.test(s))
    throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» باید کد رنگ مثل #e52421 باشد.`);
  return s;
}
function strArray(v, fa, maxItems) {
  if (!Array.isArray(v)) throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» باید آرایه باشد.`);
  if (v.length > maxItems)
    throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» حداکثر ${maxItems} عضو دارد.`);
  return v.map((x) => String(x).trim()).filter(Boolean);
}
function hhmm(v, fa, def) {
  if (v === undefined || v === null || v === "") return def;
  const s = String(v);
  if (!/^\d{2}:\d{2}$/.test(s)) throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» باید مثل 04:30 باشد.`);
  return s;
}
async function readBody(request) {
  try {
    const j = await request.json();
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
    return j;
  } catch {
    throw new ApiErr(400, "INVALID_JSON", "بدنه درخواست معتبر نیست.");
  }
}

/* ---------------------------- رمزشناسی ---------------------------- */

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function sha256Hex(text) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function pbkdf2Hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
  return `pbkdf2$${iterations}$${b64(salt.buffer)}$${b64(bits)}`;
}
async function pbkdf2Verify(password, stored) {
  try {
    const [scheme, iterStr, saltB64, hashB64] = String(stored).split("$");
    if (scheme !== "pbkdf2") return false;
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations: Number(iterStr) },
      key,
      256
    );
    const a = new Uint8Array(fromB64(hashB64));
    const b = new Uint8Array(bits);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  } catch {
    return false;
  }
}
function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

/* ---------------------------- D1 کمکی‌ها ---------------------------- */

function now() {
  return new Date().toISOString();
}
function uuid() {
  return crypto.randomUUID();
}

async function audit(request, env, admin, action, opts = {}) {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, admin_id, admin_name, action, entity, entity_id, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        uuid(),
        admin?.id || null,
        admin?.name || null,
        action,
        opts.entity || null,
        opts.entityId ? String(opts.entityId).slice(0, 100) : null,
        opts.detail ? String(opts.detail).slice(0, 500) : null,
        clientIp(request),
        now()
      )
      .run();
  } catch (e) {
    console.error("audit failed", e);
  }
}

async function rateLimit(request, env, key, limit, windowMs) {
  const bucketKey = `${key}:${clientIp(request)}`;
  const n = now();
  const row = await env.DB.prepare("SELECT count, window_start FROM rate_buckets WHERE key = ?")
    .bind(bucketKey)
    .first();
  if (!row || Date.now() - Number(row.window_start) > windowMs) {
    await env.DB.prepare(
      "INSERT INTO rate_buckets (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = ?"
    )
      .bind(bucketKey, Date.now(), Date.now())
      .run();
    return;
  }
  if (Number(row.count) + 1 > limit) {
    const waitSec = Math.ceil((Number(row.window_start) + windowMs - Date.now()) / 1000);
    throw new ApiErr(429, "RATE_LIMIT", `درخواست‌های شما بیش از حد مجاز است. ${waitSec} ثانیه دیگر تلاش کنید.`);
  }
  await env.DB.prepare("UPDATE rate_buckets SET count = count + 1 WHERE key = ?").bind(bucketKey).run();
}

/* ---------------------------- نشست‌ها ---------------------------- */

function extractToken(request) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9]+)`));
  if (m) return m[1];
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return null;
}

async function getAdmin(request, env) {
  const token = extractToken(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT a.id, a.username, a.name, a.role, a.active, s.expires_at
     FROM sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(tokenHash, now())
    .first();
  if (!row || !row.active) return null;
  return { id: row.id, username: row.username, name: row.name, role: row.role };
}

function can(role, action) {
  switch (action) {
    case "READ":
      return true;
    case "CREATE":
    case "UPDATE":
      return role === "SUPERADMIN" || role === "OPERATOR";
    case "DELETE":
    case "ADMIN":
      return role === "SUPERADMIN";
    default:
      return false;
  }
}

async function requireAdmin(request, env) {
  const admin = await getAdmin(request, env);
  if (!admin) throw new ApiErr(401, "UNAUTHORIZED", "برای این عملیات باید وارد شوید.");
  return admin;
}
async function requirePerm(request, env, action) {
  const admin = await requireAdmin(request, env);
  if (!can(admin.role, action))
    throw new ApiErr(403, "FORBIDDEN", "نقش شما اجازه این عملیات را ندارد.");
  return admin;
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax; Secure`;
}
function clearCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

async function createSession(request, env, adminId) {
  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (id, token_hash, admin_id, ip, user_agent, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(uuid(), await sha256Hex(token), adminId, clientIp(request), request.headers.get("user-agent") || null, expires, now())
    .run();
  // پاک‌سازی نشست‌های منقضی
  env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now()).run();
  return token;
}

/* ---------------------------- نگاشت ردیف‌ها ---------------------------- */

function mapLine(r) {
  return {
    id: r.id, cityId: r.city_id, number: r.number, name: r.name,
    color: r.color, textOnColor: r.text_on_color,
    terminals: JSON.parse(r.terminals || "[]"),
    direction: r.direction, headway: r.headway,
    headwayPeak: r.headway_peak, headwayOff: r.headway_off,
    firstTrain: r.first_train, lastTrain: r.last_train,
    segmentMinutes: r.segment_minutes,
    badges: r.badges ? JSON.parse(r.badges) : null,
    status: r.status, statusNote: r.status_note,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function mapStation(r) {
  return {
    id: r.id, name: r.name, cityId: r.city_id,
    lines: JSON.parse(r.lines || "[]"),
    amenities: JSON.parse(r.amenities || "[]"),
    featured: Boolean(r.featured), lat: r.lat, lng: r.lng,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function mapAd(r) {
  return {
    id: r.id, title: r.title, body: r.body, imageUrl: r.image_url, linkUrl: r.link_url,
    placement: r.placement, active: Boolean(r.active),
    startsAt: r.starts_at, endsAt: r.ends_at,
    views: r.views, clicks: r.clicks,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function mapTicket(r) {
  return {
    id: r.id, subject: r.subject, category: r.category, status: r.status, priority: r.priority,
    deviceId: r.device_id, createdAt: r.created_at, updatedAt: r.updated_at,
    user: r.user_name || r.user_device ? { name: r.user_name, deviceId: r.user_device } : null,
    _count: { messages: r.msg_count ?? undefined },
  };
}
function mapAdmin(r) {
  return {
    id: r.id, username: r.username, name: r.name, role: r.role,
    active: Boolean(r.active), createdAt: r.created_at,
    _count: r.session_count !== undefined ? { sessions: r.session_count } : undefined,
  };
}
function mapVersion(r) {
  return {
    id: r.id, versionName: r.version_name, versionCode: r.version_code,
    apkUrl: r.apk_url, notes: r.notes, mandatory: Boolean(r.mandatory),
    active: Boolean(r.active), createdAt: r.created_at,
  };
}
function mapMessage(r) {
  return { id: r.id, ticketId: r.ticket_id, author: r.author, authorName: r.author_name, body: r.body, createdAt: r.created_at };
}

/* ---------------------------- مسیرها ---------------------------- */

const routes = [];
function route(method, pattern, opts, handler) {
  const rx = new RegExp(
    "^" + pattern.replace(/:[A-Za-z]+/g, (m) => `(?<${m.slice(1)}>[^/]+)`) + "$"
  );
  routes.push({ method, rx, opts, handler });
}

/* ----- ورود/خروج/حساب ----- */

route("POST", "/api/v1/auth/login", {}, async (ctx) => {
  await rateLimit(ctx.request, ctx.env, "login", 10, 5 * 60 * 1000);
  const v = await readBody(ctx.request);
  const username = needStr(v.username, "نام کاربری", 3, 40);
  const password = needStr(v.password, "گذرواژه", 4, 100);
  const admin = await ctx.env.DB.prepare("SELECT * FROM admins WHERE username = ?").bind(username).first();
  const good = admin && admin.active && (await pbkdf2Verify(password, admin.password_hash));
  if (!good) {
    await audit(ctx.request, ctx.env, null, "LOGIN_FAILED", { detail: username });
    throw new ApiErr(401, "BAD_CREDENTIALS", "نام کاربری یا گذرواژه اشتباه است.");
  }
  const token = await createSession(ctx.request, ctx.env, admin.id);
  await audit(ctx.request, ctx.env, { id: admin.id, name: admin.name }, "LOGIN", { detail: username });
  const res = ok({ token, admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role } }, 200, ctx.cors);
  res.headers.append("set-cookie", sessionCookie(token));
  return res;
});

route("POST", "/api/v1/auth/logout", {}, async (ctx) => {
  const token = extractToken(ctx.request);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await ctx.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    const admin = await getAdmin(ctx.request, ctx.env).catch(() => null);
    await audit(ctx.request, ctx.env, admin, "LOGOUT");
  }
  const res = ok({}, 200, ctx.cors);
  res.headers.append("set-cookie", clearCookie());
  return res;
});

route("GET", "/api/v1/auth/me", { auth: true }, async (ctx) => ok({ admin: ctx.admin }));

route("POST", "/api/v1/setup", {}, async (ctx) => {
  await rateLimit(ctx.request, ctx.env, "setup", 3, 10 * 60 * 1000);
  const count = await ctx.env.DB.prepare("SELECT COUNT(*) AS c FROM admins").first();
  if (Number(count.c) > 0)
    throw new ApiErr(409, "ALREADY_SETUP", "راه‌اندازی قبلاً انجام شده است.");
  const v = await readBody(ctx.request);
  const username = /^[a-z0-9_.-]{3,30}$/.test(String(v.username || "admin"))
    ? String(v.username || "admin")
    : (() => { throw new ApiErr(400, "VALIDATION", "نام کاربری فقط حروف لاتین کوچک، عدد، نقطه، خط تیره و زیرخط."); })();
  const password = needStr(v.password, "گذرواژه", 8, 72);
  const name = optStr(v.name, "نام", 60) || "مدیر کل";
  const id = uuid();
  await ctx.env.DB.prepare(
    "INSERT INTO admins (id, username, name, role, password_hash, active, created_at) VALUES (?, ?, ?, 'SUPERADMIN', ?, 1, ?)"
  )
    .bind(id, username, name, await pbkdf2Hash(password), now())
    .run();
  await audit(ctx.request, ctx.env, { id, name }, "SETUP", { detail: username });
  return ok({ admin: { id, username, name, role: "SUPERADMIN" } }, 201, ctx.cors);
});

/* ----- آمار ----- */

route("GET", "/api/v1/stats", { auth: true }, async (ctx) => {
  const { env } = ctx;
  const one = async (sql) => Number((await env.DB.prepare(sql).first()).c);
  const [lines, stations, appUsers, admins, versions] = await Promise.all([
    one("SELECT COUNT(*) AS c FROM lines"),
    one("SELECT COUNT(*) AS c FROM stations"),
    one("SELECT COUNT(*) AS c FROM app_users"),
    one("SELECT COUNT(*) AS c FROM admins"),
    one("SELECT COUNT(*) AS c FROM app_versions"),
  ]);
  const adsAgg = await env.DB.prepare(
    "SELECT COALESCE(SUM(CASE WHEN active=1 THEN 1 ELSE 0 END),0) AS a, COALESCE(SUM(views),0) AS v, COALESCE(SUM(clicks),0) AS c FROM ads"
  ).first();
  const t = async (status) =>
    Number((await env.DB.prepare("SELECT COUNT(*) AS c FROM tickets WHERE status = ?").bind(status).first()).c);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const u7 = await env.DB.prepare(
    "SELECT SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS n, SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) AS a FROM app_users"
  ).bind(weekAgo, weekAgo).first();
  const recentAudit = await env.DB.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 12").all();
  const topAds = await env.DB.prepare(
    "SELECT id, title, views, clicks, placement FROM ads WHERE active = 1 ORDER BY views DESC LIMIT 5"
  ).all();
  return ok({
    lines, stations, appUsers, admins, versions,
    activeAds: Number(adsAgg.a), adViews: Number(adsAgg.v), adClicks: Number(adsAgg.c),
    ticketsOpen: await t("OPEN"), ticketsPending: await t("PENDING"), ticketsClosed: await t("CLOSED"),
    usersNew7d: Number(u7.n || 0), usersActive7d: Number(u7.a || 0),
    recentAudit: recentAudit.results.map((r) => ({
      id: r.id, adminName: r.admin_name, action: r.action, entity: r.entity,
      entityId: r.entity_id, detail: r.detail, ip: r.ip, createdAt: r.created_at,
    })),
    topAds: topAds.results,
  });
});

/* ----- خطوط ----- */

function linePayload(v, partial) {
  const p = {};
  if (!partial) {
    p.id = slug(v.id, "شناسه خط", 2, 24);
    p.city_id = needOneOf(v.cityId, CITIES, "شهر");
    p.number = needInt(v.number, "شماره خط", 1, 99);
    p.name = needStr(v.name, "نام خط", 2, 60);
    p.color = hex6(v.color, "رنگ");
    p.direction = needStr(v.direction, "مسیر", 2, 60);
    const terminals = strArray(v.terminals, "ترمینال‌ها", 4);
    if (terminals.length !== 2)
      throw new ApiErr(400, "VALIDATION", "دو ترمینال لازم است.");
    p.terminals = JSON.stringify(terminals);
  } else {
    if (v.cityId !== undefined) p.city_id = needOneOf(v.cityId, CITIES, "شهر");
    if (v.number !== undefined) p.number = needInt(v.number, "شماره خط", 1, 99);
    if (v.name !== undefined) p.name = needStr(v.name, "نام خط", 2, 60);
    if (v.color !== undefined) p.color = hex6(v.color, "رنگ");
    if (v.direction !== undefined) p.direction = needStr(v.direction, "مسیر", 2, 60);
    if (v.terminals !== undefined) {
      const terminals = strArray(v.terminals, "ترمینال‌ها", 4);
      if (terminals.length !== 2) throw new ApiErr(400, "VALIDATION", "دو ترمینال لازم است.");
      p.terminals = JSON.stringify(terminals);
    }
    if (v.textOnColor !== undefined) p.text_on_color = hex6(v.textOnColor, "رنگ متن");
    if (v.badges !== undefined)
      p.badges = v.badges === null ? null : JSON.stringify(strArray(v.badges, "برچسب‌ها", 6));
    if (v.status !== undefined) p.status = needOneOf(v.status, LINE_STATUSES, "وضعیت خط");
    if (v.statusNote !== undefined) p.status_note = optStr(v.statusNote, "یادداشت وضعیت", 200);
  }
  if (v.headway !== undefined || !partial) p.headway = optInt(v.headway, "فاصله حرکت", 1, 120) ?? 10;
  if (v.headwayPeak !== undefined) p.headway_peak = optInt(v.headwayPeak, "فاصله اوج", 1, 120);
  if (v.headwayOff !== undefined) p.headway_off = optInt(v.headwayOff, "فاصله غیراوج", 1, 120);
  if (v.firstTrain !== undefined || !partial) p.first_train = hhmm(v.firstTrain, "ساعت شروع", "04:30");
  if (v.lastTrain !== undefined || !partial) p.last_train = hhmm(v.lastTrain, "ساعت پایان", "22:30");
  if (v.segmentMinutes !== undefined || !partial)
    p.segment_minutes = optNum(v.segmentMinutes, "زمان میان‌بخش", 0.5, 30) ?? 2.5;
  return p;
}

route("GET", "/api/v1/lines", { auth: true }, async (ctx) => {
  const city = ctx.url.searchParams.get("city");
  let sql = "SELECT * FROM lines";
  const binds = [];
  if (city) {
    needOneOf(city, CITIES, "شهر");
    sql += " WHERE city_id = ?";
    binds.push(city);
  }
  sql += " ORDER BY city_id, number";
  const rows = await ctx.env.DB.prepare(sql).bind(...binds).all();
  return ok(rows.results.map(mapLine));
});

route("POST", "/api/v1/lines", { perm: "CREATE" }, async (ctx) => {
  const v = await readBody(ctx.request);
  const p = linePayload(v, false);
  if (await ctx.env.DB.prepare("SELECT 1 FROM lines WHERE id = ?").bind(p.id).first())
    throw new ApiErr(409, "CONFLICT", "خطی با این شناسه وجود دارد.");
  await ctx.env.DB.prepare(
    `INSERT INTO lines (id, city_id, number, name, color, text_on_color, terminals, direction, headway, headway_peak, headway_off, first_train, last_train, segment_minutes, badges, status, status_note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(p.id, p.city_id, p.number, p.name, p.color, p.text_on_color || "#ffffff", p.terminals, p.direction,
      p.headway, p.headway_peak, p.headway_off, p.first_train, p.last_train, p.segment_minutes,
      p.badges || null, p.status || "normal", p.status_note || null, now(), now())
    .run();
  await audit(ctx.request, ctx.env, ctx.admin, "CREATE_LINE", { entity: "Line", entityId: p.id, detail: p.name });
  return ok(mapLine(await ctx.env.DB.prepare("SELECT * FROM lines WHERE id = ?").bind(p.id).first()), 201, ctx.cors);
});

route("GET", "/api/v1/lines/:id", { auth: true }, async (ctx) => {
  const r = await ctx.env.DB.prepare("SELECT * FROM lines WHERE id = ?").bind(ctx.params.id).first();
  if (!r) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  return ok(mapLine(r));
});

route("PUT", "/api/v1/lines/:id", { perm: "UPDATE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM lines WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  const v = await readBody(ctx.request);
  const p = linePayload(v, true);
  const keys = Object.keys(p);
  if (keys.length) {
    await ctx.env.DB.prepare(
      `UPDATE lines SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`
    ).bind(...keys.map((k) => p[k]), now(), ctx.params.id).run();
    await audit(ctx.request, ctx.env, ctx.admin, "UPDATE_LINE", { entity: "Line", entityId: ctx.params.id, detail: existing.name });
  }
  return ok(mapLine(await ctx.env.DB.prepare("SELECT * FROM lines WHERE id = ?").bind(ctx.params.id).first()));
});

route("DELETE", "/api/v1/lines/:id", { perm: "DELETE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM lines WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  await ctx.env.DB.prepare("DELETE FROM lines WHERE id = ?").bind(ctx.params.id).run();
  await audit(ctx.request, ctx.env, ctx.admin, "DELETE_LINE", { entity: "Line", entityId: ctx.params.id, detail: existing.name });
  return ok({}, 200, ctx.cors);
});

/* ----- ایستگاه‌ها ----- */

async function stationPayload(env, v, partial) {
  const p = {};
  if (!partial) {
    p.id = slug(v.id, "شناسه ایستگاه", 2, 40);
    p.name = needStr(v.name, "نام ایستگاه", 1, 80);
    p.city_id = needOneOf(v.cityId, CITIES, "شهر");
    p.lines = JSON.stringify(await validLines(env, v.lines));
    if (!JSON.parse(p.lines).length)
      throw new ApiErr(400, "VALIDATION", "ایستگاه باید به حداقل یک خط تعلق داشته باشد.");
  } else {
    if (v.name !== undefined) p.name = needStr(v.name, "نام ایستگاه", 1, 80);
    if (v.cityId !== undefined) p.city_id = needOneOf(v.cityId, CITIES, "شهر");
    if (v.lines !== undefined) p.lines = JSON.stringify(await validLines(env, v.lines));
    if (v.amenities !== undefined)
      p.amenities = JSON.stringify(validAmenities(v.amenities));
    if (v.featured !== undefined) p.featured = optBool(v.featured);
    if (v.lat !== undefined) p.lat = optNum(v.lat, "عرض جغرافیایی", -90, 90);
    if (v.lng !== undefined) p.lng = optNum(v.lng, "طول جغرافیایی", -180, 180);
  }
  return p;
}
async function validLines(env, v) {
  if (!Array.isArray(v)) throw new ApiErr(400, "VALIDATION", "فیلد «خطوط» باید آرایه باشد.");
  const out = [];
  for (const item of v.slice(0, 10)) {
    const lineId = String(item?.lineId || "");
    const order = Number(item?.order);
    if (!Number.isInteger(order) || order < 0)
      throw new ApiErr(400, "VALIDATION", "ترتیب ایستگاه در خط باید عدد صحیح نامنفی باشد.");
    if (!(await env.DB.prepare("SELECT 1 FROM lines WHERE id = ?").bind(lineId).first()))
      throw new ApiErr(400, "VALIDATION", `خط «${lineId}» وجود ندارد.`);
    out.push({ lineId, order });
  }
  return out;
}
function validAmenities(v) {
  if (!Array.isArray(v)) throw new ApiErr(400, "VALIDATION", "فیلد «امکانات» باید آرایه باشد.");
  const arr = v.slice(0, 10).map(String);
  for (const a of arr)
    if (!AMENITIES.includes(a))
      throw new ApiErr(400, "VALIDATION", `امکانات «${a}» معتبر نیست.`);
  return [...new Set(arr)];
}

route("GET", "/api/v1/stations", { auth: true }, async (ctx) => {
  const city = ctx.url.searchParams.get("city");
  const q = ctx.url.searchParams.get("q");
  const lineId = ctx.url.searchParams.get("lineId");
  let sql = "SELECT * FROM stations";
  const binds = [];
  const wheres = [];
  if (city) {
    needOneOf(city, CITIES, "شهر");
    wheres.push("city_id = ?");
    binds.push(city);
  }
  if (q) {
    wheres.push("name LIKE ?");
    binds.push(`%${q}%`);
  }
  if (wheres.length) sql += " WHERE " + wheres.join(" AND ");
  sql += " ORDER BY name";
  const rows = (await ctx.env.DB.prepare(sql).bind(...binds).all()).results.map(mapStation);
  const filtered = lineId ? rows.filter((s) => s.lines.some((l) => l.lineId === lineId)) : rows;
  return ok(filtered);
});

route("POST", "/api/v1/stations", { perm: "CREATE" }, async (ctx) => {
  const v = await readBody(ctx.request);
  const p = await stationPayload(ctx.env, v, false);
  if (await ctx.env.DB.prepare("SELECT 1 FROM stations WHERE id = ?").bind(p.id).first())
    throw new ApiErr(409, "CONFLICT", "ایستگاهی با این شناسه وجود دارد.");
  await ctx.env.DB.prepare(
    `INSERT INTO stations (id, name, city_id, lines, amenities, featured, lat, lng, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(p.id, p.name, p.city_id, p.lines, p.amenities || "[]", p.featured || 0, p.lat ?? null, p.lng ?? null, now(), now())
    .run();
  await audit(ctx.request, ctx.env, ctx.admin, "CREATE_STATION", { entity: "Station", entityId: p.id, detail: p.name });
  return ok(mapStation(await ctx.env.DB.prepare("SELECT * FROM stations WHERE id = ?").bind(p.id).first()), 201, ctx.cors);
});

route("GET", "/api/v1/stations/:id", { auth: true }, async (ctx) => {
  const r = await ctx.env.DB.prepare("SELECT * FROM stations WHERE id = ?").bind(ctx.params.id).first();
  if (!r) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  return ok(mapStation(r));
});

route("PUT", "/api/v1/stations/:id", { perm: "UPDATE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM stations WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  const v = await readBody(ctx.request);
  const p = await stationPayload(ctx.env, v, true);
  const keys = Object.keys(p);
  if (keys.length) {
    await ctx.env.DB.prepare(
      `UPDATE stations SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`
    ).bind(...keys.map((k) => p[k]), now(), ctx.params.id).run();
    await audit(ctx.request, ctx.env, ctx.admin, "UPDATE_STATION", { entity: "Station", entityId: ctx.params.id, detail: existing.name });
  }
  return ok(mapStation(await ctx.env.DB.prepare("SELECT * FROM stations WHERE id = ?").bind(ctx.params.id).first()));
});

route("DELETE", "/api/v1/stations/:id", { perm: "DELETE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM stations WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  await ctx.env.DB.prepare("DELETE FROM stations WHERE id = ?").bind(ctx.params.id).run();
  await audit(ctx.request, ctx.env, ctx.admin, "DELETE_STATION", { entity: "Station", entityId: ctx.params.id, detail: existing.name });
  return ok({}, 200, ctx.cors);
});

/* ----- کاربران اپ ----- */

route("GET", "/api/v1/users", { auth: true }, async (ctx) => {
  const q = ctx.url.searchParams.get("q");
  const banned = ctx.url.searchParams.get("banned");
  const page = Math.max(1, Number(ctx.url.searchParams.get("page") || 1) || 1);
  const take = 200;
  const wheres = [];
  const binds = [];
  if (q) {
    wheres.push("(name LIKE ? OR device_id LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (banned === "true" || banned === "false") {
    wheres.push("banned = ?");
    binds.push(banned === "true" ? 1 : 0);
  }
  const where = wheres.length ? " WHERE " + wheres.join(" AND ") : "";
  const total = Number((await ctx.env.DB.prepare(`SELECT COUNT(*) AS c FROM app_users${where}`).bind(...binds).first()).c);
  const rows = await ctx.env.DB.prepare(
    `SELECT * FROM app_users${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, take, (page - 1) * take).all();
  return ok({
    total,
    items: rows.results.map((r) => ({
      id: r.id, deviceId: r.device_id, name: r.name, platform: r.platform,
      appVersion: r.app_version, city: r.city, active: Boolean(r.active),
      banned: Boolean(r.banned), banReason: r.ban_reason,
      lastSeenAt: r.last_seen_at, createdAt: r.created_at,
    })),
  });
});

route("GET", "/api/v1/users/:id", { auth: true }, async (ctx) => {
  const r = await ctx.env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(ctx.params.id).first();
  if (!r) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  const tc = Number((await ctx.env.DB.prepare("SELECT COUNT(*) AS c FROM tickets WHERE user_id = ?").bind(r.id).first()).c);
  return ok({
    id: r.id, deviceId: r.device_id, name: r.name, platform: r.platform,
    appVersion: r.app_version, city: r.city, active: Boolean(r.active),
    banned: Boolean(r.banned), banReason: r.ban_reason,
    lastSeenAt: r.last_seen_at, createdAt: r.created_at, ticketCount: tc,
  });
});

route("PUT", "/api/v1/users/:id", { perm: "UPDATE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  const v = await readBody(ctx.request);
  const p = {};
  if (v.name !== undefined) p.name = optStr(v.name, "نام", 60);
  if (v.city !== undefined) p.city = optStr(v.city, "شهر", 40);
  if (v.active !== undefined) p.active = optBool(v.active, true);
  if (v.banned !== undefined) p.banned = optBool(v.banned);
  if (v.banReason !== undefined) p.ban_reason = optStr(v.banReason, "دلیل مسدودسازی", 200);
  const keys = Object.keys(p);
  if (keys.length) {
    await ctx.env.DB.prepare(
      `UPDATE app_users SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`
    ).bind(...keys.map((k) => p[k]), ctx.params.id).run();
    await audit(ctx.request, ctx.env, ctx.admin, "UPDATE_USER", { entity: "AppUser", entityId: ctx.params.id, detail: existing.device_id });
  }
  return ok({ ...(await ctx.env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(ctx.params.id).first()) });
});

route("DELETE", "/api/v1/users/:id", { perm: "DELETE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  await ctx.env.DB.prepare("DELETE FROM app_users WHERE id = ?").bind(ctx.params.id).run();
  await audit(ctx.request, ctx.env, ctx.admin, "DELETE_USER", { entity: "AppUser", entityId: ctx.params.id, detail: existing.device_id });
  return ok({}, 200, ctx.cors);
});

/* ----- تبلیغات ----- */

function adPayload(v, partial) {
  const p = {};
  if (!partial) p.title = needStr(v.title, "عنوان", 2, 120);
  else if (v.title !== undefined) p.title = needStr(v.title, "عنوان", 2, 120);
  if (v.body !== undefined) p.body = optStr(v.body, "متن", 500);
  if (v.imageUrl !== undefined) p.image_url = validUrl(v.imageUrl, "نشانی تصویر");
  if (v.linkUrl !== undefined) p.link_url = validUrl(v.linkUrl, "نشانی لینک");
  if (v.placement !== undefined) p.placement = needOneOf(v.placement, PLACEMENTS, "محل نمایش");
  if (v.active !== undefined) p.active = optBool(v.active);
  if (v.startsAt !== undefined) p.starts_at = optDate(v.startsAt, "زمان شروع");
  if (v.endsAt !== undefined) p.ends_at = optDate(v.endsAt, "زمان پایان");
  return p;
}
function validUrl(v, fa) {
  const s = optStr(v, fa, 500);
  if (s && !/^https?:\/\/.+/i.test(s))
    throw new ApiErr(400, "VALIDATION", `فیلد «${fa}» باید نشانی اینترنتی معتبر باشد.`);
  return s;
}

route("GET", "/api/v1/ads", { auth: true }, async (ctx) => {
  const placement = ctx.url.searchParams.get("placement");
  const active = ctx.url.searchParams.get("active");
  let sql = "SELECT * FROM ads";
  const binds = [];
  const wheres = [];
  if (placement) {
    needOneOf(placement, PLACEMENTS, "محل نمایش");
    wheres.push("placement = ?");
    binds.push(placement);
  }
  if (active === "true" || active === "false") {
    wheres.push("active = ?");
    binds.push(active === "true" ? 1 : 0);
  }
  if (wheres.length) sql += " WHERE " + wheres.join(" AND ");
  sql += " ORDER BY created_at DESC";
  const rows = await ctx.env.DB.prepare(sql).bind(...binds).all();
  return ok(rows.results.map(mapAd));
});

route("POST", "/api/v1/ads", { perm: "CREATE" }, async (ctx) => {
  const v = await readBody(ctx.request);
  const p = adPayload(v, false);
  if (p.starts_at && p.ends_at && p.ends_at <= p.starts_at)
    throw new ApiErr(400, "VALIDATION", "پایان تبلیغ باید بعد از شروع باشد.");
  const id = uuid();
  await ctx.env.DB.prepare(
    `INSERT INTO ads (id, title, body, image_url, link_url, placement, active, starts_at, ends_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, p.title, p.body, p.image_url, p.link_url, p.placement || "HOME_BANNER", p.active || 0, p.starts_at, p.ends_at, now(), now())
    .run();
  await audit(ctx.request, ctx.env, ctx.admin, "CREATE_AD", { entity: "Ad", entityId: id, detail: p.title });
  return ok(mapAd(await ctx.env.DB.prepare("SELECT * FROM ads WHERE id = ?").bind(id).first()), 201, ctx.cors);
});

route("GET", "/api/v1/ads/:id", { auth: true }, async (ctx) => {
  const r = await ctx.env.DB.prepare("SELECT * FROM ads WHERE id = ?").bind(ctx.params.id).first();
  if (!r) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  return ok(mapAd(r));
});

route("PUT", "/api/v1/ads/:id", { perm: "UPDATE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM ads WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  const v = await readBody(ctx.request);
  const p = adPayload(v, true);
  const starts = p.starts_at ?? existing.starts_at;
  const ends = p.ends_at ?? existing.ends_at;
  if (starts && ends && ends <= starts)
    throw new ApiErr(400, "VALIDATION", "پایان تبلیغ باید بعد از شروع باشد.");
  const keys = Object.keys(p);
  if (keys.length) {
    await ctx.env.DB.prepare(
      `UPDATE ads SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`
    ).bind(...keys.map((k) => p[k]), now(), ctx.params.id).run();
    await audit(ctx.request, ctx.env, ctx.admin, "UPDATE_AD", { entity: "Ad", entityId: ctx.params.id, detail: existing.title });
  }
  return ok(mapAd(await ctx.env.DB.prepare("SELECT * FROM ads WHERE id = ?").bind(ctx.params.id).first()));
});

route("DELETE", "/api/v1/ads/:id", { perm: "DELETE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM ads WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  await ctx.env.DB.prepare("DELETE FROM ads WHERE id = ?").bind(ctx.params.id).run();
  await audit(ctx.request, ctx.env, ctx.admin, "DELETE_AD", { entity: "Ad", entityId: ctx.params.id, detail: existing.title });
  return ok({}, 200, ctx.cors);
});

route("POST", "/api/v1/ads/:id/event", { public: true }, async (ctx) => {
  const v = await readBody(ctx.request);
  const type = needOneOf(v.type, ["view", "click"], "نوع رویداد");
  const col = type === "view" ? "views" : "clicks";
  const r = await ctx.env.DB.prepare(`UPDATE ads SET ${col} = ${col} + 1 WHERE id = ? RETURNING views, clicks`)
    .bind(ctx.params.id)
    .first();
  if (!r) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  return ok({ views: r.views, clicks: r.clicks });
});

/* ----- تیکت‌ها ----- */

const TICKET_SELECT = `
  SELECT t.*, u.name AS user_name, u.device_id AS user_device,
         (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS msg_count
  FROM tickets t LEFT JOIN app_users u ON u.id = t.user_id`;

route("GET", "/api/v1/tickets", { auth: true }, async (ctx) => {
  const status = ctx.url.searchParams.get("status");
  const priority = ctx.url.searchParams.get("priority");
  const q = ctx.url.searchParams.get("q");
  const wheres = [];
  const binds = [];
  if (status) {
    needOneOf(status, TICKET_STATUSES, "وضعیت تیکت");
    wheres.push("t.status = ?");
    binds.push(status);
  }
  if (priority) {
    needOneOf(priority, PRIORITIES, "اولویت");
    wheres.push("t.priority = ?");
    binds.push(priority);
  }
  if (q) {
    wheres.push("t.subject LIKE ?");
    binds.push(`%${q}%`);
  }
  const sql =
    TICKET_SELECT +
    (wheres.length ? " WHERE " + wheres.join(" AND ") : "") +
    " ORDER BY t.created_at DESC";
  const rows = await ctx.env.DB.prepare(sql).bind(...binds).all();
  return ok(rows.results.map(mapTicket));
});

route("POST", "/api/v1/tickets", { perm: "CREATE" }, async (ctx) => {
  const v = await readBody(ctx.request);
  const subject = needStr(v.subject, "موضوع", 3, 150);
  const body = needStr(v.body, "متن پیام", 3, 1000);
  const category = optOneOf(v.category, CATEGORIES, "دسته‌بندی");
  const priority = optOneOf(v.priority, PRIORITIES, "اولویت") || "NORMAL";
  const deviceId = optStr(v.deviceId, "شناسه دستگاه", 100);
  const id = uuid();
  await ctx.env.DB.prepare(
    `INSERT INTO tickets (id, device_id, subject, category, status, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?)`
  )
    .bind(id, deviceId, subject, category, priority, now(), now())
    .run();
  await ctx.env.DB.prepare(
    "INSERT INTO ticket_messages (id, ticket_id, author, author_name, body, created_at) VALUES (?, ?, 'ADMIN', ?, ?, ?)"
  )
    .bind(uuid(), id, ctx.admin.name, body, now())
    .run();
  await audit(ctx.request, ctx.env, ctx.admin, "CREATE_TICKET", { entity: "Ticket", entityId: id, detail: subject });
  return ok({ id }, 201, ctx.cors);
});

route("GET", "/api/v1/tickets/:id", { auth: true }, async (ctx) => {
  const r = await ctx.env.DB.prepare(`${TICKET_SELECT} WHERE t.id = ?`).bind(ctx.params.id).first();
  if (!r) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  const msgs = await ctx.env.DB.prepare(
    "SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC"
  ).bind(ctx.params.id).all();
  return ok({ ...mapTicket(r), messages: msgs.results.map(mapMessage) });
});

route("PUT", "/api/v1/tickets/:id", { perm: "UPDATE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  const v = await readBody(ctx.request);
  const p = {};
  if (v.status !== undefined) p.status = needOneOf(v.status, TICKET_STATUSES, "وضعیت تیکت");
  if (v.priority !== undefined) p.priority = needOneOf(v.priority, PRIORITIES, "اولویت");
  if (v.category !== undefined) p.category = optOneOf(v.category, CATEGORIES, "دسته‌بندی");
  const keys = Object.keys(p);
  if (keys.length) {
    await ctx.env.DB.prepare(
      `UPDATE tickets SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`
    ).bind(...keys.map((k) => p[k]), now(), ctx.params.id).run();
    await audit(ctx.request, ctx.env, ctx.admin, "UPDATE_TICKET", {
      entity: "Ticket", entityId: ctx.params.id,
      detail: `${existing.subject} (وضعیت: ${p.status || existing.status})`,
    });
  }
  return ok(mapTicket(await ctx.env.DB.prepare(`${TICKET_SELECT} WHERE t.id = ?`).bind(ctx.params.id).first()));
});

route("DELETE", "/api/v1/tickets/:id", { perm: "DELETE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  await ctx.env.DB.prepare("DELETE FROM tickets WHERE id = ?").bind(ctx.params.id).run();
  await audit(ctx.request, ctx.env, ctx.admin, "DELETE_TICKET", { entity: "Ticket", entityId: ctx.params.id, detail: existing.subject });
  return ok({}, 200, ctx.cors);
});

route("POST", "/api/v1/tickets/:id/messages", { perm: "UPDATE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  const v = await readBody(ctx.request);
  const body = needStr(v.body, "متن پیام", 1, 1000);
  const mid = uuid();
  await ctx.env.DB.prepare(
    "INSERT INTO ticket_messages (id, ticket_id, author, author_name, body, created_at) VALUES (?, ?, 'ADMIN', ?, ?, ?)"
  )
    .bind(mid, ctx.params.id, ctx.admin.name, body, now())
    .run();
  if (existing.status === "OPEN")
    await ctx.env.DB.prepare("UPDATE tickets SET status = 'PENDING', updated_at = ? WHERE id = ?").bind(now(), ctx.params.id).run();
  else
    await ctx.env.DB.prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").bind(now(), ctx.params.id).run();
  await audit(ctx.request, ctx.env, ctx.admin, "REPLY_TICKET", { entity: "Ticket", entityId: ctx.params.id, detail: existing.subject });
  return ok(mapMessage(await ctx.env.DB.prepare("SELECT * FROM ticket_messages WHERE id = ?").bind(mid).first()), 201, ctx.cors);
});

/* ----- مدیران ----- */

route("GET", "/api/v1/admins", { perm: "ADMIN" }, async (ctx) => {
  const rows = await ctx.env.DB.prepare(
    `SELECT a.*, (SELECT COUNT(*) FROM sessions s WHERE s.admin_id = a.id AND s.expires_at > ?) AS session_count
     FROM admins a ORDER BY a.created_at`
  ).bind(now()).all();
  return ok(rows.results.map(mapAdmin));
});

async function lastSuperadminGuard(env, targetId, changeActive, changeRole) {
  const target = await env.DB.prepare("SELECT * FROM admins WHERE id = ?").bind(targetId).first();
  if (!target) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  const losingSuperadmin =
    target.role === "SUPERADMIN" && target.active === 1 &&
    ((changeActive && !changeActive) || (changeRole && changeRole !== "SUPERADMIN"));
  if (losingSuperadmin) {
    const others = Number(
      (await env.DB.prepare(
        "SELECT COUNT(*) AS c FROM admins WHERE role = 'SUPERADMIN' AND active = 1 AND id != ?"
      ).bind(targetId).first()).c
    );
    if (others === 0)
      throw new ApiErr(400, "VALIDATION", "باید حداقل یک مدیر کل فعال بماند.");
  }
  return target;
}

route("POST", "/api/v1/admins", { perm: "ADMIN" }, async (ctx) => {
  const v = await readBody(ctx.request);
  const username = slug(v.username, "نام کاربری", 3, 30);
  const name = needStr(v.name, "نام", 2, 60);
  const role = needOneOf(v.role, ROLES, "نقش");
  const password = needStr(v.password, "گذرواژه", 8, 72);
  if (await ctx.env.DB.prepare("SELECT 1 FROM admins WHERE username = ?").bind(username).first())
    throw new ApiErr(409, "CONFLICT", "نام کاربری تکراری است.");
  const id = uuid();
  await ctx.env.DB.prepare(
    "INSERT INTO admins (id, username, name, role, password_hash, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)"
  ).bind(id, username, name, role, await pbkdf2Hash(password), now()).run();
  await audit(ctx.request, ctx.env, ctx.admin, "CREATE_ADMIN", { entity: "AdminUser", entityId: id, detail: username });
  return ok(mapAdmin(await ctx.env.DB.prepare("SELECT * FROM admins WHERE id = ?").bind(id).first()), 201, ctx.cors);
});

route("PUT", "/api/v1/admins/:id", { perm: "ADMIN" }, async (ctx) => {
  const v = await readBody(ctx.request);
  const newActive = v.active !== undefined ? optBool(v.active, true) : null;
  const newRole = v.role !== undefined ? needOneOf(v.role, ROLES, "نقش") : null;
  const target = await lastSuperadminGuard(ctx.env, ctx.params.id, v.active !== undefined ? newActive : null, newRole);
  if (ctx.admin.id === ctx.params.id && (newActive === 0 || (newRole && newRole !== "SUPERADMIN")))
    throw new ApiErr(400, "VALIDATION", "نمی‌توانید نقش یا وضعیت حساب خودتان را این‌گونه تغییر دهید.");
  const p = {};
  if (v.name !== undefined) p.name = needStr(v.name, "نام", 2, 60);
  if (newRole !== null) p.role = newRole;
  if (newActive !== null) p.active = newActive;
  if (v.password !== undefined && v.password !== "")
    p.password_hash = await pbkdf2Hash(needStr(v.password, "گذرواژه", 8, 72));
  const keys = Object.keys(p);
  if (keys.length) {
    await ctx.env.DB.prepare(
      `UPDATE admins SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`
    ).bind(...keys.map((k) => p[k]), ctx.params.id).run();
    if (newActive === 0)
      await ctx.env.DB.prepare("DELETE FROM sessions WHERE admin_id = ?").bind(ctx.params.id).run();
    await audit(ctx.request, ctx.env, ctx.admin, "UPDATE_ADMIN", { entity: "AdminUser", entityId: ctx.params.id, detail: target.username });
  }
  const r = await ctx.env.DB.prepare("SELECT * FROM admins WHERE id = ?").bind(ctx.params.id).first();
  return ok(mapAdmin(r));
});

route("DELETE", "/api/v1/admins/:id", { perm: "ADMIN" }, async (ctx) => {
  if (ctx.admin.id === ctx.params.id)
    throw new ApiErr(400, "VALIDATION", "نمی‌توانید حساب خودتان را حذف کنید.");
  await lastSuperadminGuard(ctx.env, ctx.params.id, 0, null);
  const target = await ctx.env.DB.prepare("SELECT * FROM admins WHERE id = ?").bind(ctx.params.id).first();
  if (!target) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  await ctx.env.DB.prepare("DELETE FROM sessions WHERE admin_id = ?").bind(ctx.params.id).run();
  await ctx.env.DB.prepare("DELETE FROM admins WHERE id = ?").bind(ctx.params.id).run();
  await audit(ctx.request, ctx.env, ctx.admin, "DELETE_ADMIN", { entity: "AdminUser", entityId: ctx.params.id, detail: target.username });
  return ok({}, 200, ctx.cors);
});

/* ----- تنظیمات ----- */

route("GET", "/api/v1/settings", { auth: true }, async (ctx) => {
  const rows = await ctx.env.DB.prepare("SELECT * FROM settings").all();
  const out = {};
  for (const r of rows.results) out[r.key] = r.value;
  return ok(out);
});

route("PUT", "/api/v1/settings", { perm: "UPDATE" }, async (ctx) => {
  const v = await readBody(ctx.request);
  const keys = Object.keys(v);
  if (keys.length > 40) throw new ApiErr(400, "VALIDATION", "حداکثر ۴۰ کلید تنظیماتی مجاز است.");
  for (const k of keys) {
    if (!/^[a-z0-9_.-]{2,60}$/.test(k))
      throw new ApiErr(400, "VALIDATION", `کلید «${k}» معتبر نیست.`);
    const value = String(v[k] ?? "");
    if (value.length > 500)
      throw new ApiErr(400, "VALIDATION", `مقدار «${k}» حداکثر ۵۰۰ نویسه است.`);
    await ctx.env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).bind(k, value, now()).run();
  }
  await audit(ctx.request, ctx.env, ctx.admin, "UPDATE_SETTINGS", { detail: keys.join(", ") });
  return ok({ updated: keys.length });
});

/* ----- نسخه‌ها ----- */

route("GET", "/api/v1/versions", { auth: true }, async (ctx) => {
  const rows = await ctx.env.DB.prepare("SELECT * FROM app_versions ORDER BY version_code DESC").all();
  return ok(rows.results.map(mapVersion));
});

route("POST", "/api/v1/versions", { perm: "CREATE" }, async (ctx) => {
  const v = await readBody(ctx.request);
  const versionName = needStr(v.versionName, "نام نسخه", 5, 20);
  if (!/^\d+\.\d+\.\d+$/.test(versionName))
    throw new ApiErr(400, "VALIDATION", "قالب نسخه باید مثل 4.8.17 باشد.");
  const versionCode = needInt(v.versionCode, "کد نسخه", 1, 999999);
  if (await ctx.env.DB.prepare("SELECT 1 FROM app_versions WHERE version_code = ?").bind(versionCode).first())
    throw new ApiErr(409, "CONFLICT", "کد نسخه تکراری است.");
  const apkUrl = optStr(v.apkUrl, "نشانی APK", 500);
  if (apkUrl && !/^https?:\/\/.+/i.test(apkUrl) && !apkUrl.startsWith("/"))
    throw new ApiErr(400, "VALIDATION", "نشانی APK باید لینک اینترنتی یا مسیر داخلی باشد.");
  const id = uuid();
  await ctx.env.DB.prepare(
    "INSERT INTO app_versions (id, version_name, version_code, apk_url, notes, mandatory, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, versionName, versionCode, apkUrl, optStr(v.notes, "توضیحات", 1000), optBool(v.mandatory), optBool(v.active, true), now())
    .run();
  await audit(ctx.request, ctx.env, ctx.admin, "CREATE_VERSION", { entity: "AppVersion", entityId: id, detail: versionName });
  return ok(mapVersion(await ctx.env.DB.prepare("SELECT * FROM app_versions WHERE id = ?").bind(id).first()), 201, ctx.cors);
});

route("PUT", "/api/v1/versions/:id", { perm: "UPDATE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM app_versions WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  const v = await readBody(ctx.request);
  const p = {};
  if (v.versionName !== undefined) {
    const vn = needStr(v.versionName, "نام نسخه", 5, 20);
    if (!/^\d+\.\d+\.\d+$/.test(vn)) throw new ApiErr(400, "VALIDATION", "قالب نسخه باید مثل 4.8.17 باشد.");
    p.version_name = vn;
  }
  if (v.versionCode !== undefined) {
    const vc = needInt(v.versionCode, "کد نسخه", 1, 999999);
    const clash = await ctx.env.DB.prepare("SELECT 1 FROM app_versions WHERE version_code = ? AND id != ?").bind(vc, ctx.params.id).first();
    if (clash) throw new ApiErr(409, "CONFLICT", "کد نسخه تکراری است.");
    p.version_code = vc;
  }
  if (v.apkUrl !== undefined) {
    const a = optStr(v.apkUrl, "نشانی APK", 500);
    if (a && !/^https?:\/\/.+/i.test(a) && !a.startsWith("/"))
      throw new ApiErr(400, "VALIDATION", "نشانی APK باید لینک اینترنتی یا مسیر داخلی باشد.");
    p.apk_url = a;
  }
  if (v.notes !== undefined) p.notes = optStr(v.notes, "توضیحات", 1000);
  if (v.mandatory !== undefined) p.mandatory = optBool(v.mandatory);
  if (v.active !== undefined) p.active = optBool(v.active, true);
  const keys = Object.keys(p);
  if (keys.length) {
    await ctx.env.DB.prepare(
      `UPDATE app_versions SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`
    ).bind(...keys.map((k) => p[k]), ctx.params.id).run();
    await audit(ctx.request, ctx.env, ctx.admin, "UPDATE_VERSION", { entity: "AppVersion", entityId: ctx.params.id, detail: existing.version_name });
  }
  return ok(mapVersion(await ctx.env.DB.prepare("SELECT * FROM app_versions WHERE id = ?").bind(ctx.params.id).first()));
});

route("DELETE", "/api/v1/versions/:id", { perm: "DELETE" }, async (ctx) => {
  const existing = await ctx.env.DB.prepare("SELECT * FROM app_versions WHERE id = ?").bind(ctx.params.id).first();
  if (!existing) throw new ApiErr(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  await ctx.env.DB.prepare("DELETE FROM app_versions WHERE id = ?").bind(ctx.params.id).run();
  await audit(ctx.request, ctx.env, ctx.admin, "DELETE_VERSION", { entity: "AppVersion", entityId: ctx.params.id, detail: existing.version_name });
  return ok({}, 200, ctx.cors);
});

/* ----- گزارش رویدادها ----- */

route("GET", "/api/v1/audit", { perm: "ADMIN" }, async (ctx) => {
  const sp = ctx.url.searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(sp.get("pageSize") || 50) || 50));
  const action = sp.get("action");
  const adminId = sp.get("adminId");
  const wheres = [];
  const binds = [];
  if (action) {
    wheres.push("action = ?");
    binds.push(action);
  }
  if (adminId) {
    wheres.push("admin_id = ?");
    binds.push(adminId);
  }
  const where = wheres.length ? " WHERE " + wheres.join(" AND ") : "";
  const total = Number((await ctx.env.DB.prepare(`SELECT COUNT(*) AS c FROM audit_logs${where}`).bind(...binds).first()).c);
  const rows = await ctx.env.DB.prepare(
    `SELECT * FROM audit_logs${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, pageSize, (page - 1) * pageSize).all();
  return ok({
    items: rows.results.map((r) => ({
      id: r.id, adminId: r.admin_id, adminName: r.admin_name, action: r.action,
      entity: r.entity, entityId: r.entity_id, detail: r.detail, ip: r.ip, createdAt: r.created_at,
    })),
    total, page, pageSize,
  });
});

/* ----- نقاط عمومی اپلیکیشن (بدون احراز هویت) ----- */

route("GET", "/api/v1/public/bootstrap", { public: true }, async (ctx) => {
  const [lines, stations, settings, ads, version] = await Promise.all([
    ctx.env.DB.prepare("SELECT * FROM lines ORDER BY city_id, number").all(),
    ctx.env.DB.prepare("SELECT * FROM stations ORDER BY name").all(),
    ctx.env.DB.prepare("SELECT * FROM settings").all(),
    ctx.env.DB.prepare(
      `SELECT id, title, body, image_url, link_url, placement FROM ads
       WHERE active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)`
    ).bind(now(), now()).all(),
    ctx.env.DB.prepare("SELECT version_name, version_code, apk_url, notes, mandatory FROM app_versions WHERE active = 1 ORDER BY version_code DESC LIMIT 1").first(),
  ]);
  const settingsObj = {};
  for (const s of settings.results) settingsObj[s.key] = s.value;
  return ok(
    {
      lines: lines.results.map(mapLine),
      stations: stations.results.map(mapStation),
      settings: settingsObj,
      ads: ads.results.map((r) => ({
        id: r.id, title: r.title, body: r.body, imageUrl: r.image_url,
        linkUrl: r.link_url, placement: r.placement,
      })),
      version: version ? { versionName: version.version_name, versionCode: version.version_code, apkUrl: version.apk_url, notes: version.notes, mandatory: Boolean(version.mandatory) } : null,
      servedAt: now(),
    },
    200,
    { ...ctx.cors, "cache-control": "public, max-age=60" }
  );
});

/* ---------------------------- dispatch ---------------------------- */

async function dispatch(request, env) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  for (const r of routes) {
    if (r.method !== request.method) continue;
    const m = path.match(r.rx);
    if (!m) continue;
    const ctx = { request, env, url, params: m.groups || {}, cors };
    try {
      if (r.opts.auth || r.opts.perm) {
        const admin = await getAdmin(request, env);
        if (!admin) throw new ApiErr(401, "UNAUTHORIZED", "برای این عملیات باید وارد شوید.");
        if (r.opts.perm && !can(admin.role, r.opts.perm))
          throw new ApiErr(403, "FORBIDDEN", "نقش شما اجازه این عملیات را ندارد.");
        ctx.admin = admin;
      }
      return await r.handler(ctx);
    } catch (e) {
      if (e instanceof ApiErr) return fail(e.status, e.code, e.message, cors);
      console.error("[darmasir-api] unhandled:", e);
      return fail(500, "INTERNAL", "خطای داخلی سرور. بعداً دوباره تلاش کنید.", cors);
    }
  }
  return fail(404, "NOT_FOUND", "مسیر یافت نشد.", cors);
}

export default {
  async fetch(request, env, ctx) {
    return dispatch(request, env);
  },
};
