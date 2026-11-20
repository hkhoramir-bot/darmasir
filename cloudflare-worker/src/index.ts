/* ============================================================
   درمسیر — ورکر یکپارچه (dataid.hurremmed.ir)
   ------------------------------------------------------------
   یک ورکر، همه سرویس‌ها:
     ۱) دیتابیس و API اپ    →  /api/v1/*   (دیتابیس Turso — تک منبع حقیقت)
        - health, public/content, public/content/sync,
          public/users/sync, public/users/status, public/users/activity,
          public/tickets/lookup, public/ads/track, auth/*
     ۲) صدای فارسی (TTS)    →  /tts        (ماژول voice.ts)
     ۳) صفحه وضعیت          →  /
   دامین متصل: dataid.hurremmed.ir (Workers Custom Domain)
   دیتابیس واقعی: Turso (libSQL) — همان دیتابیسی که اپ وب و پنل مدیریت
   می‌خوانند؛ یعنی هر تغییر کاربر در اپ، فوراً در پنل دیده می‌شود و
   هر اقدام مدیر (حذف/مسدودسازی) بلافاصله روی اپ اعمال می‌شود.
   محتوا (شهر/خط/ایستگاه/بنر/تنظیمات) در KV ابری کش می‌شود — پنل پوش می‌کند.
   ============================================================ */

export interface Env {
  KV: KVNamespace; // کش محتوا + آمار بنر + محدودیت نرخ OTP
  TURSO_DATABASE_URL?: string; // مثل: libsql://darmasir-darmasir.turso.io
  TURSO_AUTH_TOKEN?: string; // توکن دیتابیس (بهتر است با wrangler secret تنظیم شود)
  DARMASIR_SYNC_KEY?: string;
  KAVENEGAR_API_KEY?: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Sync-Key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Cache-Control": "no-store",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ ok: true, data }), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });

const fail = (code: string, message: string, status = 400) =>
  new Response(JSON.stringify({ ok: false, error: { code, message } }), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });

const now = () => new Date().toISOString();
const enc = new TextEncoder();

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function toEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}
function normalizePhone(v: string): string | null {
  let p = toEnDigits(v).replace(/[\s\-()]/g, "");
  if (p.startsWith("+98")) p = "0" + p.slice(3);
  else if (p.startsWith("98") && p.length === 12) p = "0" + p.slice(2);
  else if (p.startsWith("9") && p.length === 10) p = "0" + p;
  return /^09\d{9}$/.test(p) ? p : null;
}
function normalizeEmail(v: string): string | null {
  const e = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const randToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const randOtp = () => String(Math.floor(100000 + crypto.getRandomValues(new Uint8Array(1))[0] / 255 * 899999)).padStart(6, "0").slice(0, 6);
const uidRow = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

/* رمز: PBKDF2-SHA256 (سازگار با WebCrypto در Workers) */
async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  try {
    if (stored.startsWith("pbkdf2$")) {
      const [, iterStr, saltB64, hashB64] = stored.split("$");
      const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
      const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: Number(iterStr) }, key, 256);
      return b64(new Uint8Array(bits)) === hashB64;
    }
    /* هش scrypt (ساخت اپ وب/پنل: "salt:hash") در رانتیمم Workers قابل محاسبه نیست —
       ورود با رمز برای این حساب‌ها از طریق خود اپ (PWA) یا ورود با کد پیامکی */
    return false;
  } catch {
    return false;
  }
}
/** آیا هش از نوع scrypt اپ وب است؟ (پیام خطای دقیق‌تر) */
function isScryptHash(stored: string): boolean {
  return /^[0-9a-f]{16,64}:[0-9a-f]{96,256}$/.test(stored);
}

/* ------------------------------ کلاینت Turso (libSQL HTTP v2) ------------------------------ */

type TursoRow = Record<string, unknown>;

/** رمزگشایی مقدار تایپ‌دار Hrana → مقدار JS */
function decVal(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const t = v as { type?: string; value?: unknown; base64?: string };
  switch (t.type) {
    case "null": return null;
    case "integer": return Number(t.value);
    case "float": return Number(t.value);
    case "blob": return t.base64 ?? null;
    default: return (t.value ?? null) as unknown;
  }
}

function makeQ(env: Env) {
  const rawUrl = (env.TURSO_DATABASE_URL || "").trim();
  const tok = (env.TURSO_AUTH_TOKEN || "").trim();
  const httpUrl = rawUrl.startsWith("libsql://")
    ? `https://${rawUrl.slice("libsql://".length)}`.replace(/\/+$/, "")
    : rawUrl.replace(/\/+$/, "");
  const on = !!(httpUrl && tok);

  const arg = (v: unknown) => {
    /* فرمت سخت‌گیرانه Hrana: رشته/صحیح باید تایپ‌دار باشند
       ({"type":"text","value":...} و {"type":"integer","value":"123"} —
       مقدار صحیح حتماً رشته است؛ ارسال خام ۴۰۰ می‌گیرد) */
    if (v === undefined || v === null) return { type: "null" };
    if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
    if (typeof v === "number")
      return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
    return { type: "text", value: String(v) };
  };

  async function pipeline(stmts: { sql: string; args?: unknown[] }[]): Promise<{ rowsList: TursoRow[][]; changes: number[] }> {
    const res = await fetch(`${httpUrl}/v2/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify({
        requests: [
          ...stmts.map((s) => ({ type: "execute", stmt: { sql: s.sql, args: (s.args ?? []).map(arg) } })),
          { type: "close" },
        ],
      }),
    });
    if (!res.ok) throw new Error(`TURSO_HTTP_${res.status}`);
    const j: any = await res.json().catch(() => null);
    const results: any[] = j?.results ?? [];
    for (let i = 0; i < stmts.length; i++) {
      const r = results[i];
      if (!r || r.type !== "ok") throw new Error(`TURSO_${r?.error?.message ?? "ERROR"}`);
    }
    const rowsList: TursoRow[][] = [];
    const changes: number[] = [];
    for (const r of results.slice(0, stmts.length)) {
      const result = r.response?.result ?? {};
      const cols: { name: string }[] = result.cols ?? [];
      /* نکته پروتکل Hrana v2: هر «ردیف» خودش آرایهٔ مقادیر است
         (rows: Array<Array<Value>>) — نه شیء {value: [...]}. و هر سلول
         یک مقدار تایپ‌دار است ({type,value}) — باید رمزگشایی شود. */
      const rows: unknown[][] = result.rows ?? [];
      rowsList.push(
        rows.map((cells) => {
          const o: TursoRow = {};
          cols.forEach((c, i) => {
            const raw = Array.isArray(cells) ? cells[i] : (cells as { value?: unknown[] })?.value?.[i];
            o[c.name] = decVal(raw);
          });
          return o;
        })
      );
      changes.push(Number(result.affected_row_count ?? 0));
    }
    return { rowsList, changes };
  }

  return {
    on,
    /** همه ردیف‌های کوئری SELECT */
    async all(sql: string, args: unknown[] = []): Promise<TursoRow[]> {
      const { rowsList } = await pipeline([{ sql, args }]);
      return rowsList[0] ?? [];
    },
    /** اولین ردیف یا null */
    async first(sql: string, args: unknown[] = []): Promise<TursoRow | null> {
      return (await this.all(sql, args))[0] ?? null;
    },
    /** اجرای دستور نوشتن — تعداد ردیف‌های تغییرکرده */
    async run(sql: string, args: unknown[] = []): Promise<number> {
      const { changes } = await pipeline([{ sql, args }]);
      return changes[0] ?? 0;
    },
  };
}

type Q = ReturnType<typeof makeQ>;

/* کلیدهای KV — فقط کش محتوا + آمار بنر + نرخ OTP */
const K_CONTENT = "content:v1";
const K_SYNC_META = "sync:meta";
const K_AD_STATS = "ads:stats:v1";

const MSG_BLOCKED = "حساب شما مسدود شده است — با پشتیبانی درمسیر تماس بگیرید";
const MSG_SCRYPT = "ورود با رمز برای این حساب فقط در اپ اصلی ممکن است — از ورود با کد پیامکی استفاده کنید";

const publicUser = (u: TursoRow) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  email: u.email,
  status: u.status || "active",
  createdAt: u.createdAt ?? u.created_at,
  lastLoginAt: u.lastLoginAt ?? u.last_login_at,
});

/* ------------------------------ نشست‌ها (جدول Session در Turso) ------------------------------ */

async function createSession(q: Q, userId: string, device: string): Promise<string> {
  const token = randToken();
  const t = String(Date.now());
  await q.run(
    `INSERT INTO "Session" ("id","token","userId","device","createdAt","lastSeenAt","expiresAt")
     VALUES (?,?,?,?,?,?,?)`,
    [uidRow(), token, userId, device || "web", t, t, String(Date.now() + 30 * 864e5)]
  );
  /* پاکسازی گاه‌به‌گاه نشست‌های منقضی */
  if (Math.random() < 0.1) {
    await q.run(`DELETE FROM "Session" WHERE CAST("expiresAt" AS INTEGER) < ?`, [String(Date.now())]).catch(() => {});
  }
  return token;
}

async function getSessionUser(q: Q, req: Request): Promise<TursoRow | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const row = await q.first(
    `SELECT u.*, s."id" AS sid, s."expiresAt" AS s_expires
     FROM "Session" s JOIN "User" u ON u."id" = s."userId"
     WHERE s."token" = ? LIMIT 1`,
    [token]
  );
  if (!row) return null;
  const exp = Number(row.s_expires ?? 0);
  if (exp && exp < Date.now()) {
    await q.run(`DELETE FROM "Session" WHERE "id" = ?`, [row.sid]).catch(() => {});
    return null;
  }
  if (row.status === "blocked") {
    /* کاربر مسدودشده از پنل — همه نشست‌هایش ابطال و دسترسی رد می‌شود */
    await q.run(`DELETE FROM "Session" WHERE "userId" = ?`, [row.id]).catch(() => {});
    return null;
  }
  await q.run(`UPDATE "Session" SET "lastSeenAt" = ? WHERE "id" = ?`, [String(Date.now()), row.sid]).catch(() => {});
  return row;
}

async function getUserByPhone(q: Q, phone: string): Promise<TursoRow | null> {
  return q.first(`SELECT * FROM "User" WHERE "phone" = ? LIMIT 1`, [phone]);
}
async function getUserByEmail(q: Q, email: string): Promise<TursoRow | null> {
  return q.first(`SELECT * FROM "User" WHERE "email" = ? LIMIT 1`, [email]);
}

async function getContent(KV: KVNamespace): Promise<any | null> {
  return KV.get(K_CONTENT, "json");
}

/* پیامک با کاوه‌نگار (اگر تنظیم باشد) — وگرنه حالت توسعه با devCode */
async function sendOtpSms(phone: string, code: string, env: Env): Promise<{ delivered: boolean }> {
  const key = env.KAVENEGAR_API_KEY;
  if (!key) return { delivered: false };
  try {
    const url = `https://api.kavenegar.com/v1/${key}/verify/lookup.json?receptor=${phone}&token=${code}&template=darmasir`;
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) });
    return { delivered: res.ok };
  } catch {
    return { delivered: false };
  }
}

/* ------------------------------ router API ------------------------------ */

async function handleApi(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  const path = url.pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");
  const method = req.method.toUpperCase();
  const KV = env.KV;
  const q = makeQ(env);

  let body: any = {};
  if (method === "POST" || method === "PUT") {
    body = await req.json().catch(() => ({}));
  }

  /* ---------- health ---------- */
  if (path === "health" && method === "GET") {
    return json({ service: "darmasir-api", db: q.on ? "turso" : "unconfigured", voice: "/tts", time: now() });
  }

  /* ---------- public: محتوا (هم‌شکل پنل محلی) ---------- */
  if (path === "public/content" && method === "GET") {
    const content = await getContent(KV);
    if (!content) {
      return json({ cities: [], lines: [], stations: [], ads: [], settings: {}, lexicon: [], generated_at: now(), last_content_sync: null });
    }
    const t = now();
    const isActive = (r: any) => r == null || Number(r.is_active ?? 1) === 1;
    const inWindow = (a: any) => (!a.starts_at || a.starts_at === "" || a.starts_at <= t) && (!a.ends_at || a.ends_at === "" || a.ends_at >= t);
    const filtered = {
      ...content,
      cities: (content.cities ?? []).filter((c: any) => isActive(c)),
      lines: (content.lines ?? []).filter((l: any) => isActive(l)),
      stations: (content.stations ?? []).filter((s: any) => isActive(s)),
      ads: (content.ads ?? []).filter((a: any) => isActive(a) && inWindow(a)).map(({ is_active, starts_at, ends_at, ...rest }: any) => rest),
    };
    const meta = await KV.get(K_SYNC_META, "json");
    return json({ ...filtered, last_content_sync: (meta as any)?.last_content_sync ?? null });
  }

  /* ---------- public: همگام‌سازی محتوا از پنل (کلید مشترک) ---------- */
  if (path === "public/content/sync" && method === "POST") {
    if ((req.headers.get("X-Sync-Key") || "") !== (env.DARMASIR_SYNC_KEY || "darmasir-sync-1404")) {
      return fail("FORBIDDEN", "کلید همگام‌سازی نامعتبر است", 403);
    }
    const t = now();
    const cities: any[] = body?.cities ?? [];
    const lines: any[] = body?.lines ?? [];
    const stations: any[] = body?.stations ?? [];
    const ads: any[] = body?.ads ?? [];
    const settings: Record<string, string> = body?.settings ?? {};
    const lexicon: any[] = body?.lexicon ?? [];
    if (!Array.isArray(cities) || !Array.isArray(lines)) return fail("BAD_INPUT", "ساختار داده نامعتبر است", 400);

    const stats = (await KV.get(K_AD_STATS, "json")) ?? {};
    const keepIds = new Set(ads.map((a: any) => Number(a.id)).filter(Boolean));
    // آمار بنرهای حذف‌شده از پنل پاک می‌شود
    for (const id of Object.keys(stats)) {
      if (ads.length ? !keepIds.has(Number(id)) : true) delete stats[id];
    }
    const content = {
      cities: cities.slice(0, 500),
      lines: lines.slice(0, 500),
      stations: stations.slice(0, 5000),
      ads: ads.slice(0, 500),
      settings: Object.fromEntries(Object.keys(settings).slice(0, 100).map((k) => [k, String(settings[k])])),
      lexicon: lexicon.slice(0, 1000),
      generated_at: t,
    };
    await KV.put(K_CONTENT, JSON.stringify(content));
    await KV.put(K_SYNC_META, JSON.stringify({ last_content_sync: t }));
    await KV.put(K_AD_STATS, JSON.stringify(stats));
    return json({ synced: { cities: cities.length, lines: lines.length, stations: stations.length, ads: ads.length, settings: Object.keys(settings).length, lexicon: lexicon.length }, at: t });
  }

  /* ---------- public: همگام‌سازی کاربر (اپ اندروید/پنل) → جدول User در Turso ----------
     ثبت‌نام موبایل مستقیم در همان جدول User ثبت می‌شود (تک منبع حقیقت پنل مدیریت)؛
     رکورد موجود دست نمی‌خورد (وضعیت مسدودی حفظ می‌شود)؛ فقط نام و آخرین ورود بروز می‌شود */
  if (path === "public/users/sync" && method === "POST") {
    if ((req.headers.get("X-Sync-Key") || "") !== (env.DARMASIR_SYNC_KEY || "darmasir-sync-1404")) {
      return fail("FORBIDDEN", "کلید همگام‌سازی نامعتبر است", 403);
    }
    if (!q.on) return fail("DB_ERROR", "دیتابیس Turso پیکربندی نشده است", 502);
    const incoming: any[] = Array.isArray(body?.users) ? body.users : body?.user ? [body.user] : [];
    let synced = 0;
    try {
      for (const u of incoming.slice(0, 500)) {
        const rawId = String(u?.phone ?? "").trim().slice(0, 120);
        const name = String(u?.name ?? "").trim().slice(0, 80) || "کاربر درمسیر";
        if (!rawId) continue;
        const isEmail = rawId.includes("@");
        const phone = isEmail ? null : normalizePhone(rawId);
        const email = isEmail ? normalizeEmail(rawId) : null;
        if (isEmail && !email) continue;
        if (!isEmail && !phone) continue;
        const t = String(Date.now());
        const id = uidRow();
        if (phone) {
          await q.run(
            `INSERT INTO "User" ("id","name","phone","email","passwordHash","status","createdAt","lastLoginAt")
             VALUES (?, ?, ?, NULL, NULL, 'active', ?, ?)
             ON CONFLICT("phone") DO UPDATE SET "name" = excluded."name", "lastLoginAt" = excluded."lastLoginAt"`,
            [id, name, phone, t, t]
          );
        } else if (email) {
          await q.run(
            `INSERT INTO "User" ("id","name","phone","email","passwordHash","status","createdAt","lastLoginAt")
             VALUES (?, ?, NULL, ?, NULL, 'active', ?, ?)
             ON CONFLICT("email") DO UPDATE SET "name" = excluded."name", "lastLoginAt" = excluded."lastLoginAt"`,
            [id, name, email, t, t]
          );
        }
        synced++;
      }
      return json({ synced });
    } catch (e: any) {
      console.error("[users/sync]", e?.message ?? e);
      return fail("DB_ERROR", "خطا در ثبت کاربر در دیتابیس", 502);
    }
  }

  /* ---------- public: بررسی وضعیت واقعی کاربر (برای اپ اندروید) ---------- */
  if (path === "public/users/status" && method === "GET") {
    if ((req.headers.get("X-Sync-Key") || "") !== (env.DARMASIR_SYNC_KEY || "darmasir-sync-1404")) {
      return fail("FORBIDDEN", "کلید همگام‌سازی نامعتبر است", 403);
    }
    if (!q.on) return fail("DB_ERROR", "دیتابیس Turso پیکربندی نشده است", 502);
    const rawId = String(url.searchParams.get("identifier") ?? "").trim().slice(0, 120);
    if (!rawId) return fail("BAD_INPUT", "شناسه کاربر الزامی است", 400);
    try {
      const isEmail = rawId.includes("@");
      const row = isEmail
        ? await q.first(`SELECT "status" FROM "User" WHERE "email" = ?`, [normalizeEmail(rawId) || ""])
        : await q.first(`SELECT "status" FROM "User" WHERE "phone" = ?`, [normalizePhone(rawId) || ""]);
      return json({ exists: !!row, status: (row as any)?.status ?? null });
    } catch (e: any) {
      console.error("[users/status]", e?.message ?? e);
      return fail("DB_ERROR", "خطا در خواندن دیتابیس", 502);
    }
  }

  /* ---------- public: همگام‌سازی فعالیت کاربر اپ (سفر/علاقه‌مندی/مسیر روزمره/تیکت) ----------
     اپ اندروید هر تغییر کاربر را با کلید مشترک اینجا می‌فرستد — واقعاً در Turso ثبت می‌شود
     و در پنل مدیریت (بخش کاربران → فعالیت) همان لحظه دیده می‌شود. آفلاین: اپ در صف محلی نگه می‌دارد. */
  if (path === "public/users/activity" && method === "POST") {
    if ((req.headers.get("X-Sync-Key") || "") !== (env.DARMASIR_SYNC_KEY || "darmasir-sync-1404")) {
      return fail("FORBIDDEN", "کلید همگام‌سازی نامعتبر است", 403);
    }
    if (!q.on) return fail("DB_ERROR", "دیتابیس Turso پیکربندی نشده است", 502);
    const identifier = String(body?.identifier ?? "").trim().slice(0, 120);
    const kind = String(body?.kind ?? "").trim();
    const data: any = body?.data ?? {};
    if (!identifier) return fail("BAD_INPUT", "شناسه کاربر الزامی است", 400);
    const t = String(Date.now());
    const rid = () => "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try {
      let done: any = { ok: true };
      switch (kind) {
        case "trip_add": {
          const id = String(data?.id ?? "").trim().slice(0, 40) || rid();
          await q.run(
            `INSERT INTO "AppUserTrip" ("id","identifier","fromName","toName","minutes","transfers","fare","createdAt")
             VALUES (?,?,?,?,?,?,?,?)
             ON CONFLICT("id") DO NOTHING`,
            [id, identifier, String(data?.fromName ?? "").slice(0, 80), String(data?.toName ?? "").slice(0, 80),
              Number(data?.minutes) || 0, Number(data?.transfers) || 0, Number(data?.fare) || 0, t]
          );
          done = { id };
          break;
        }
        case "trip_del": {
          await q.run(`DELETE FROM "AppUserTrip" WHERE "id" = ? AND "identifier" = ?`, [String(data?.id ?? ""), identifier]);
          break;
        }
        case "trip_del_all": {
          await q.run(`DELETE FROM "AppUserTrip" WHERE "identifier" = ?`, [identifier]);
          break;
        }
        case "fav_add": {
          const stationId = String(data?.stationId ?? "").trim().slice(0, 60);
          if (!stationId) return fail("BAD_INPUT", "شناسه ایستگاه الزامی است", 400);
          const id = rid();
          await q.run(
            `INSERT INTO "AppUserFavorite" ("id","identifier","stationId","stationName","createdAt")
             VALUES (?,?,?,?,?)
             ON CONFLICT("identifier","stationId") DO UPDATE SET "stationName" = excluded."stationName"`,
            [id, identifier, stationId, String(data?.stationName ?? "").slice(0, 80), t]
          );
          break;
        }
        case "fav_del": {
          await q.run(`DELETE FROM "AppUserFavorite" WHERE "identifier" = ? AND "stationId" = ?`, [identifier, String(data?.stationId ?? "")]);
          break;
        }
        case "daily_add": {
          const id = String(data?.id ?? "").trim().slice(0, 40) || rid();
          await q.run(
            `INSERT INTO "AppUserDailyRoute" ("id","identifier","kind","label","fromName","toName","createdAt")
             VALUES (?,?,?,?,?,?,?)
             ON CONFLICT("id") DO UPDATE SET "kind" = excluded."kind", "label" = excluded."label",
               "fromName" = excluded."fromName", "toName" = excluded."toName"`,
            [id, identifier, String(data?.kind ?? "custom").slice(0, 20), String(data?.label ?? "").slice(0, 80),
              String(data?.fromName ?? "").slice(0, 80), String(data?.toName ?? "").slice(0, 80), t]
          );
          done = { id };
          break;
        }
        case "daily_del": {
          await q.run(`DELETE FROM "AppUserDailyRoute" WHERE "id" = ? AND "identifier" = ?`, [String(data?.id ?? ""), identifier]);
          break;
        }
        case "daily_del_all": {
          await q.run(`DELETE FROM "AppUserDailyRoute" WHERE "identifier" = ?`, [identifier]);
          break;
        }
        case "ticket": {
          const name = String(data?.name ?? "").trim().slice(0, 80) || "کاربر درمسیر";
          const contact = String(data?.contact ?? "").trim().slice(0, 120) || identifier;
          const message = String(data?.message ?? "").trim().slice(0, 4000);
          const subject = String(data?.subject ?? "").trim().slice(0, 200);
          if (message.length < 5) return fail("BAD_INPUT", "متن تیکت کوتاه است", 400);
          const category = ["general", "bug", "idea", "ad"].includes(data?.category) ? data.category : "general";
          await q.run(
            `INSERT INTO "SupportTicket" ("id","name","contact","category","subject","message","status","createdAt")
             VALUES (?,?,?,?,?,?, 'open', ?)`,
            [rid(), name, contact, category, subject || "بدون موضوع", message, t]
          );
          break;
        }
        default:
          return fail("BAD_INPUT", "نوع فعالیت نامعتبر است", 400);
      }
      return json({ synced: true, kind, ...done });
    } catch (e: any) {
      console.error("[activity]", e?.message ?? e);
      return fail("DB_ERROR", "خطا در ثبت فعالیت در دیتابیس", 502);
    }
  }

  /* ---------- public: خواندن فعالیت کاربر (اپ برای همگام‌سازی چنددستگاه + پنل) ---------- */
  if (path === "public/users/activity" && method === "GET") {
    if ((req.headers.get("X-Sync-Key") || "") !== (env.DARMASIR_SYNC_KEY || "darmasir-sync-1404")) {
      return fail("FORBIDDEN", "کلید همگام‌سازی نامعتبر است", 403);
    }
    if (!q.on) return fail("DB_ERROR", "دیتابیس Turso پیکربندی نشده است", 502);
    const identifier = String(url.searchParams.get("identifier") ?? "").trim().slice(0, 120);
    if (!identifier) return fail("BAD_INPUT", "شناسه کاربر الزامی است", 400);
    try {
      const trips = await q.all(`SELECT * FROM "AppUserTrip" WHERE "identifier" = ? ORDER BY CAST("createdAt" AS INTEGER) DESC LIMIT 40`, [identifier]);
      const favorites = await q.all(`SELECT * FROM "AppUserFavorite" WHERE "identifier" = ? ORDER BY CAST("createdAt" AS INTEGER) DESC LIMIT 100`, [identifier]);
      const daily = await q.all(`SELECT * FROM "AppUserDailyRoute" WHERE "identifier" = ? ORDER BY CAST("createdAt" AS INTEGER) DESC LIMIT 50`, [identifier]);
      return json({ identifier, trips, favorites, daily });
    } catch (e: any) {
      console.error("[activity:read]", e?.message ?? e);
      return fail("DB_ERROR", "خطا در خواندن فعالیت", 502);
    }
  }

  /* ---------- public: مرور تیکت‌ها و پاسخ‌های کاربر (اپ اندروید — «تیکت‌های من») ---------- */
  if (path === "public/tickets/lookup" && method === "GET") {
    if ((req.headers.get("X-Sync-Key") || "") !== (env.DARMASIR_SYNC_KEY || "darmasir-sync-1404")) {
      return fail("FORBIDDEN", "کلید همگام‌سازی نامعتبر است", 403);
    }
    if (!q.on) return fail("DB_ERROR", "دیتابیس Turso پیکربندی نشده است", 502);
    const contact = String(url.searchParams.get("contact") ?? "").trim().slice(0, 120);
    if (!contact) return fail("BAD_INPUT", "راه تماس الزامی است", 400);
    try {
      const rows = await q.all(
        `SELECT "id","subject","category","message","status","reply","repliedAt","createdAt"
         FROM "SupportTicket" WHERE "contact" = ? ORDER BY CAST("createdAt" AS INTEGER) DESC LIMIT 20`,
        [contact]
      );
      return json({ tickets: rows });
    } catch (e: any) {
      console.error("[tickets:lookup]", e?.message ?? e);
      return fail("DB_ERROR", "خطا در خواندن تیکت‌ها", 502);
    }
  }

  /* ---------- public: ردگیری بنر ---------- */
  if (path === "public/ads/track" && method === "POST") {
    const id = Number(body?.id) || 0;
    const type = String(body?.type ?? "");
    if (!id || (type !== "impression" && type !== "click")) return fail("BAD_INPUT", "پارامتر نامعتبر", 400);
    const content = await getContent(KV);
    const exists = content && Array.isArray(content.ads) && content.ads.some((a: any) => Number(a.id) === id);
    if (!exists) return fail("NOT_FOUND", "بنر یافت نشد", 404);
    ctx.waitUntil(
      (async () => {
        const stats = (await KV.get(K_AD_STATS, "json")) ?? {};
        const day = now().slice(0, 10);
        const rec = stats[id] ?? { impressions: 0, clicks: 0, daily: {} };
        if (type === "impression") rec.impressions += 1;
        else rec.clicks += 1;
        rec.daily[day] = rec.daily[day] ?? { impressions: 0, clicks: 0 };
        if (type === "impression") rec.daily[day].impressions += 1;
        else rec.daily[day].clicks += 1;
        stats[id] = rec;
        await KV.put(K_AD_STATS, JSON.stringify(stats));
      })()
    );
    return json({ tracked: true });
  }

  /* ---------- auth: ثبت‌نام (جدول User در Turso) ---------- */
  if (path === "auth/register" && method === "POST") {
    if (!q.on) return fail("DB_ERROR", "دیتابیس Turso پیکربندی نشده است", 502);
    const name = String(body?.name ?? "").trim().slice(0, 80);
    const password = String(body?.password ?? "");
    const phone = body?.phone ? normalizePhone(String(body.phone)) : null;
    const email = body?.email ? normalizeEmail(String(body.email)) : null;
    if (!name) return fail("BAD_INPUT", "نام و نام خانوادگی را کامل وارد کنید", 400);
    if (password.length < 6) return fail("BAD_INPUT", "رمز عبور باید حداقل ۶ کاراکتر باشد", 400);
    if (body?.phone && !phone) return fail("BAD_INPUT", "شماره موبایل معتبر نیست", 400);
    if (body?.email && !email) return fail("BAD_INPUT", "ایمیل معتبر نیست", 400);
    if (!phone && !email) return fail("BAD_INPUT", "شماره موبایل یا ایمیل را وارد کنید", 400);

    try {
      const dupe = phone ? await getUserByPhone(q, phone) : await getUserByEmail(q, email!);
      if (dupe) {
        if (dupe.status === "blocked") return fail("FORBIDDEN", MSG_BLOCKED, 403);
        return fail("DUPLICATE", "حسابی با این مشخصات قبلاً ثبت شده", 409);
      }
      const id = "u" + hex(crypto.getRandomValues(new Uint8Array(8)));
      const hash = await hashPassword(password);
      const t = String(Date.now());
      await q.run(
        `INSERT INTO "User" ("id","name","phone","email","passwordHash","status","createdAt","lastLoginAt")
         VALUES (?,?,?,?,?, 'active', ?, ?)`,
        [id, name, phone, email, hash, t, t]
      );
      const token = await createSession(q, id, String(body?.device ?? "web"));
      const user = await q.first(`SELECT * FROM "User" WHERE "id" = ?`, [id]);
      return json({ token, user: user ? publicUser(user) : { id, name, phone, email } });
    } catch (e: any) {
      console.error("[auth/register]", e?.message ?? e);
      return fail("DB_ERROR", "خطا در ثبت‌نام", 502);
    }
  }

  /* ---------- auth: ورود با رمز ---------- */
  if (path === "auth/login" && method === "POST") {
    if (!q.on) return fail("DB_ERROR", "دیتابیس Turso پیکربندی نشده است", 502);
    const identifier = toEnDigits(String(body?.identifier ?? "")).trim();
    const password = String(body?.password ?? "");
    if (!identifier || !password) return fail("BAD_INPUT", "اطلاعات ورود را کامل وارد کنید", 400);
    try {
      let user: TursoRow | null = null;
      if (identifier.includes("@")) {
        const email = normalizeEmail(identifier);
        if (!email) return fail("BAD_INPUT", "ایمیل معتبر نیست", 400);
        user = await getUserByEmail(q, email);
      } else {
        const phone = normalizePhone(identifier);
        if (!phone) return fail("BAD_INPUT", "شماره موبایل معتبر نیست", 400);
        user = await getUserByPhone(q, phone);
      }
      if (!user) return fail("NOT_FOUND", "حسابی با این مشخصات پیدا نشد", 404);
      if (user.status === "blocked") return fail("FORBIDDEN", MSG_BLOCKED, 403);
      const stored = String(user.passwordHash ?? "");
      if (!stored) return fail("NOT_FOUND", "حسابی با این مشخصات پیدا نشد", 404);
      if (isScryptHash(stored)) return fail("USE_APP_OR_OTP", MSG_SCRYPT, 400);
      if (!(await verifyPassword(password, stored))) return fail("BAD_PASSWORD", "رمز عبور اشتباه است", 401);
      await q.run(`UPDATE "User" SET "lastLoginAt" = ? WHERE "id" = ?`, [String(Date.now()), user.id]);
      const token = await createSession(q, String(user.id), String(body?.device ?? "web"));
      return json({ token, user: publicUser(user) });
    } catch (e: any) {
      console.error("[auth/login]", e?.message ?? e);
      return fail("DB_ERROR", "خطا در ورود", 502);
    }
  }

  /* ---------- auth: درخواست کد پیامکی (جدول OtpCode در Turso) ---------- */
  if (path === "auth/otp/request" && method === "POST") {
    if (!q.on) return fail("DB_ERROR", "دیتابیس Turso پیکربندی نشده است", 502);
    const phone = normalizePhone(String(body?.phone ?? ""));
    if (!phone) return fail("BAD_INPUT", "شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)", 400);
    const rateKey = `otp:rate:${phone}`;
    const recent = Number((await KV.get(rateKey)) ?? 0);
    if (recent >= 3) return fail("RATE", "درخواست کد زیاد است — یک دقیقه بعد دوباره تلاش کنید", 429);
    await KV.put(rateKey, String(recent + 1), { expirationTtl: 60 });
    try {
      const code = randOtp();
      const t = Date.now();
      /* کدهای قبلی استفاده‌نشده باطل می‌شوند */
      await q.run(`DELETE FROM "OtpCode" WHERE "phone" = ? AND "used" = 0`, [phone]);
      await q.run(
        `INSERT INTO "OtpCode" ("id","phone","code","attempts","used","expiresAt","createdAt")
         VALUES (?,?,?,0,0,?,?)`,
        [uidRow(), phone, code, String(t + 180000), String(t)]
      );
      const sms = await sendOtpSms(phone, code, env);
      return json({
        ok: true, delivered: sms.delivered, expiresInSeconds: 180,
        devCode: !sms.delivered && !env.KAVENEGAR_API_KEY ? code : undefined,
      });
    } catch (e: any) {
      console.error("[auth/otp/request]", e?.message ?? e);
      return fail("DB_ERROR", "خطا در صدور کد", 502);
    }
  }

  /* ---------- auth: تأیید کد پیامکی ---------- */
  if (path === "auth/otp/verify" && method === "POST") {
    if (!q.on) return fail("DB_ERROR", "دیتابیس Turso پیکربندی نشده است", 502);
    const phone = normalizePhone(String(body?.phone ?? ""));
    const code = toEnDigits(String(body?.code ?? "")).trim();
    const device = String(body?.device ?? "web");
    if (!phone) return fail("BAD_INPUT", "شماره موبایل معتبر نیست", 400);
    if (!/^\d{6}$/.test(code)) return fail("BAD_INPUT", "کد ۶ رقمی را کامل وارد کنید", 400);
    try {
      const otp = await q.first(
        `SELECT * FROM "OtpCode" WHERE "phone" = ? AND "used" = 0
         ORDER BY CAST("createdAt" AS INTEGER) DESC LIMIT 1`,
        [phone]
      );
      if (!otp) return fail("NO_OTP", "کدی برای این شماره یافت نشد — دوباره درخواست کنید", 400);
      if (Number(otp.expiresAt ?? 0) < Date.now()) return fail("EXPIRED", "کد منقضی شده است — کد جدید بگیرید", 400);
      if (Number(otp.attempts ?? 0) >= 5) return fail("RATE", "تلاش‌های بیش از حد — کد جدید بگیرید", 429);
      if (String(otp.code ?? "") !== code) {
        await q.run(`UPDATE "OtpCode" SET "attempts" = "attempts" + 1 WHERE "id" = ?`, [otp.id]);
        return fail("WRONG_CODE", "کد اشتباه است", 400);
      }
      await q.run(`UPDATE "OtpCode" SET "used" = 1 WHERE "id" = ?`, [otp.id]);

      let user = await getUserByPhone(q, phone);
      const isNew = !user;
      if (user && user.status === "blocked") return fail("FORBIDDEN", MSG_BLOCKED, 403);
      const t = String(Date.now());
      if (!user) {
        const id = "u" + hex(crypto.getRandomValues(new Uint8Array(8)));
        const name = `کاربر ${phone.slice(-4)}`;
        await q.run(
          `INSERT INTO "User" ("id","name","phone","email","passwordHash","status","createdAt","lastLoginAt")
           VALUES (?, ?, ?, NULL, NULL, 'active', ?, ?)`,
          [id, name, phone, t, t]
        );
        user = await getUserByPhone(q, phone);
      } else {
        await q.run(`UPDATE "User" SET "lastLoginAt" = ? WHERE "id" = ?`, [t, user.id]);
      }
      if (!user) return fail("DB_ERROR", "خطا در ساخت حساب", 502);
      const token = await createSession(q, String(user.id), device);
      return json({ token, user: publicUser(user), isNew });
    } catch (e: any) {
      console.error("[auth/otp/verify]", e?.message ?? e);
      return fail("DB_ERROR", "خطا در تأیید کد", 502);
    }
  }

  /* ---------- auth: اطلاعات کاربر فعلی ---------- */
  if (path === "auth/me" && method === "GET") {
    if (!q.on) return fail("DB_ERROR", "دیتابیس Turso پیکربندی نشده است", 502);
    const user = await getSessionUser(q, req);
    if (!user) return fail("UNAUTHORIZED", "ابتدا وارد شوید", 401);
    return json({ user: publicUser(user) });
  }

  return fail("NOT_FOUND", "مسیر یافت نشد", 404);
}

/* ------------------------------ ورودی اصلی ------------------------------ */

import { handleVoice, voiceStatus } from "./voice";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);

    try {
      /* ---------- سرویس صدا: /tts و /voice/tts ---------- */
      if (url.pathname === "/tts" || url.pathname === "/voice/tts" || url.pathname === "/api/v1/voice/tts") {
        return await handleVoice(req);
      }

      /* ---------- API دیتابیس اپ: /api/v1/* ---------- */
      if (url.pathname.startsWith("/api/v1/")) {
        return await handleApi(req, env, url, ctx);
      }

      /* ---------- صفحه وضعیت ---------- */
      if (url.pathname === "/" || url.pathname === "") {
        return json({
          service: "darmasir-dataid",
          version: "4.0-turso",
          description: "ورکر یکپارچه درمسیر — دیتابیس Turso + صدای فارسی",
          services: {
            api: { health: "/api/v1/health", content: "/api/v1/public/content", voice: "/tts" },
            voice: voiceStatus(),
          },
          time: now(),
        });
      }

      return fail("NOT_FOUND", "مسیر یافت نشد — راهنما: GET /", 404);
    } catch (e: any) {
      console.error("[darmasir-dataid]", e?.message ?? e);
      return fail("INTERNAL", "خطای داخلی سرور ابری", 500);
    }
  },
};
