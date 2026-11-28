/* ============================================================
   درمسیر — پنل مدیریت | مسیریاب API نسخه‌دار /api/v1
   استاندارد: ورودی معتبر، خطای استاندارد، نقش‌ها، لاگ عملیات
   ============================================================ */
import { q, q1, run, exec, now, bumpApiStats, audit, changeLog, UPLOAD_DIR } from "./db";
import { sendMail, mailTemplate, smtpConfigured } from "./mail";
import { join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import {
  verifyPassword,
  newToken,
  loginAllowed,
  registerFailedLogin,
  clearLoginAttempts,
  hashPassword,
} from "./auth";

type Role = "super" | "operator" | "viewer";
interface AdminRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: Role;
  is_active: number;
  created_at: string;
  last_login: string | null;
}

const SESSION_HOURS = 12;
const RANK: Record<Role, number> = { viewer: 1, operator: 2, super: 3 };

const ok = (data: any, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });

const fail = (code: string, message: string, status = 400, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });

/* هدرهای CORS برای endpoint های عمومی اپ درمسیر (فراخوانی مستقیم از APK/PWA) */
const PUBLIC_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Sync-Key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

/* API مدیریتی اپ درمسیر (منبع حقیقت احراز هویت کاربران) */
const APP_API = (process.env.APP_API_URL || "http://localhost:3000").replace(/\/+$/, "");
const APP_ADMIN_KEY = process.env.APP_ADMIN_KEY || "darmasir-admin-1404";

/** فراخوانی API مدیریتی اپ (بلاک/رمز/کد پیامکی) */
async function appAdminCall(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: any; message?: string }> {
  try {
    const r = await fetch(`${APP_API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Admin-Key": APP_ADMIN_KEY, ...(init?.headers || {}) },
      signal: AbortSignal.timeout(6000),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) {
      return { ok: false, status: r.status, message: j?.error?.message || `اپ پاسخ ناموفق داد (${r.status})` };
    }
    return { ok: true, status: r.status, data: j.data };
  } catch {
    return { ok: false, status: 502, message: "اپ درمسیر در دسترس نیست — سرویس اپ را بررسی کنید" };
  }
}

/** انتشار وضعیت کاربر به سرور ابری (fire-and-forget — اگر cloud_api_url تنظیم باشد) */
async function cloudPublishUser(user: Record<string, any>) {
  try {
    const cloudUrl = String(((await q1("SELECT value FROM settings WHERE key = 'cloud_api_url'", [])) as any)?.value ?? "")
      .trim()
      .replace(/\/+$/, "");
    if (!cloudUrl) return;
    const key =
      String(((await q1("SELECT value FROM settings WHERE key = 'cloud_sync_key'", [])) as any)?.value ?? "").trim() ||
      "darmasir-sync-1404";
    fetch(`${cloudUrl}/api/v1/public/users/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sync-Key": key },
      body: JSON.stringify({ user }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {
      /* ابر در دسترس نیست — عملیات پنل نباید وابسته باشد */
    });
  } catch {
    /* انتشار ابری اختیاری است */
  }
}

/** کلید اصلی تبلیغات — اگر خاموش باشد هیچ تبلیغی به اپ/ابر نمی‌رود */
async function adsMasterOff(): Promise<boolean> {
  const v = String(((await q1("SELECT value FROM settings WHERE key = 'ads_enabled'", [])) as any)?.value ?? "on").trim();
  return v === "off" || v === "0" || v === "false";
}

/** کل محتوای پنل (شهر/خط/ایستگاه/تبلیغ/تنظیمات/فرهنگ تلفظ) برای پوش ابری */
async function readFullContent() {
  const cities = (await q("SELECT id, name, is_active, sort FROM cities ORDER BY sort, id", []));
  const lines = (await q("SELECT id, city_id, mode, number, name, color, terminals, direction, is_active, sort FROM lines ORDER BY city_id, sort, id", []));
  const stations = (await q("SELECT id, line_id, name, lat, lng, city_id, order_index, is_active FROM stations ORDER BY line_id, order_index, id", []));
  const ads = (await adsMasterOff())
    ? []
    : (await q("SELECT id, title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, starts_at, ends_at, is_active, priority FROM ads ORDER BY id", []));
  const lexicon = (await q("SELECT spoken, written, priority FROM voice_lexicon ORDER BY id", []));
  const settings: Record<string, string> = {};
  for (const r of (await q("SELECT key, value FROM settings", [])) as any[]) {
    const k = String(r.key);
    if (k === "cloud_api_url" || k === "cloud_sync_key") continue;
    settings[k] = String(r.value ?? "");
  }
  return { cities, lines, stations, ads, settings, lexicon };
}

/** پوش فوری کل محتوا به سرور ابری (fire-and-forget) */
async function cloudPublishContent() {
  try {
    const cloudUrl = String(((await q1("SELECT value FROM settings WHERE key = 'cloud_api_url'", [])) as any)?.value ?? "")
      .trim()
      .replace(/\/+$/, "");
    if (!cloudUrl) return;
    const key =
      String(((await q1("SELECT value FROM settings WHERE key = 'cloud_sync_key'", [])) as any)?.value ?? "").trim() ||
      "darmasir-sync-1404";
    let payload: string;
    try {
      payload = JSON.stringify(await readFullContent());
    } catch (e: any) {
      console.error("[cloud] readFullContent failed:", e?.message ?? e);
      return;
    }
    fetch(`${cloudUrl}/api/v1/public/content/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sync-Key": key },
      body: payload,
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => {
        if (r.ok) console.log("[cloud] content synced to", cloudUrl);
        else console.warn("[cloud] content sync failed:", r.status);
      })
      .catch((e: any) => {
        console.error("[cloud] content sync error:", e?.message ?? e);
      });
  } catch (e: any) {
    console.error("[cloud] publish error:", e?.message ?? e);
  }
}

/** همگام‌سازی ابری با تاخیر کوتاه — عملیات گروهی پشت‌سرهم فقط یک‌بار پوش می‌شوند */
let contentSyncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleCloudContentSync() {
  if (contentSyncTimer) clearTimeout(contentSyncTimer);
  contentSyncTimer = setTimeout(cloudPublishContent, 2500);
}

const str = (v: any, max = 300) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** گریز HTML برای درج امن متن کاربر در قالب ایمیل */
const escHtml = (v: string) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));

const clientIp = (req: Request) =>
  req.headers.get("X-Real-IP") || req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "local";

async function getSession(req: Request): Promise<AdminRow | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const row = (await q1(`SELECT a.* FROM sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token = ? AND s.expires_at > ? AND a.is_active = 1`, [token, now()])) as AdminRow | undefined;
  return row ?? null;
}

function requireRole(admin: AdminRow, role: Role): Response | null {
  if (RANK[admin.role] < RANK[role]) {
    return fail("FORBIDDEN", "سطح دسترسی شما برای این عملیات کافی نیست", 403);
  }
  return null;
}

async function touchSession(adminId: number, token: string, req: Request) {
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  (await run("INSERT INTO sessions (token, admin_id, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?) ON CONFLICT(token) DO UPDATE SET expires_at = excluded.expires_at", [token, adminId, now(), expires, clientIp(req), req.headers.get("User-Agent") ?? ""]));
  (await run("DELETE FROM sessions WHERE expires_at < ?", [now()]));
}

/* --------------------------------------------------------------- */

export async function handleApi(req: Request, url: URL): Promise<Response> {
  bumpApiStats();
  const path = url.pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");
  const method = req.method.toUpperCase();
  const ip = clientIp(req);

  let body: any = {};
  const ctype = req.headers.get("content-type") || "";
  if ((method === "POST" || method === "PUT" || method === "PATCH") && ctype.includes("application/json")) {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  try {
    const res = await route(path, method, url, req, body, ip);
    // هر تغییر محتوایی در پنل (تبلیغ/واژه/تنظیم/شهر/خط/ایستگاه) → پوش خودکار به ابر
    const okJson = (() => {
      try {
        const c = res.headers.get("content-type") ?? "";
        if (!c.includes("application/json")) return false;
        return Boolean((res as any).__ok ?? true);
      } catch {
        return false;
      }
    })();
    if (
      okJson &&
      method !== "GET" &&
      !path.startsWith("auth/") &&
      !path.startsWith("public/") &&
      path !== "tts" &&
      !path.startsWith("voice-lexicon/test") &&
      !path.startsWith("logs") &&
      res.status >= 200 &&
      res.status < 300
    ) {
      scheduleCloudContentSync();
    }
    return res;
  } catch (e: any) {
    console.error("[darmasir-admin][api]", e?.message ?? e);
    return fail("INTERNAL", "خطای داخلی سرور پنل", 500);
  }
}

async function route(
  path: string,
  method: string,
  url: URL,
  req: Request,
  body: any,
  ip: string
): Promise<Response> {
  const admin = await getSession(req);
  const seg = path.split("/");

  /* ---------- auth ---------- */
  if (path === "auth/login" && method === "POST") {
    if (!loginAllowed(ip))
      return fail("RATE_LIMIT", "تلاش‌های ناموفق زیاد است؛ چند دقیقه بعد دوباره امتحان کنید", 429);
    const username = str(body.username, 60);
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password)
      return fail("BAD_INPUT", "نام کاربری و گذرواژه الزامی است");
    const row = (await q1("SELECT * FROM admins WHERE username = ?", [username])) as AdminRow | undefined;
    if (!row || !verifyPassword(password, row.password_hash) || !row.is_active) {
      registerFailedLogin(ip);
      audit(null, username || "ناشناس", "login_failed", `نام کاربری: ${username}`, ip);
      return fail("INVALID_LOGIN", "نام کاربری یا گذرواژه نادرست است", 401);
    }
    clearLoginAttempts(ip);
    const token = newToken();
    await touchSession(row.id, token, req);
    (await run("UPDATE admins SET last_login = ? WHERE id = ?", [now(), row.id]));
    audit(row.id, row.display_name, "login", "ورود موفق", ip);
    return ok({
      token,
      admin: { id: row.id, username: row.username, display_name: row.display_name, role: row.role },
    });
  }

  /* ------------------ public (عمومی — اتصال اپ درمسیر به پنل) ------------------
     بدون احراز هویت ادمین؛ فقط خواندنی + همگام‌سازی کاربر با کلید مشترک.
     منبع داده: همان دیتابیس رایگان SQLite پنل — تک منبع حقیقت محتوا. */
  if (method === "OPTIONS" && path.startsWith("public/")) {
    return new Response(null, { status: 204, headers: PUBLIC_CORS });
  }

  if (path === "public/content" && method === "GET") {
    const t = now();
    /* همه شهرها با پرچم فعال بودن — اپ شهر غیرفعال را با برچسب «بزودی» نشان می‌دهد */
    const cities = (await q("SELECT id, name, is_active, sort FROM cities ORDER BY sort, id", []));
    const lines = (await q("SELECT id, city_id, mode, number, name, color, terminals, direction, sort FROM lines WHERE is_active = 1 ORDER BY sort, id", []));
    const stations = (await q("SELECT id, line_id, name, lat, lng, order_index, city_id FROM stations WHERE is_active = 1 ORDER BY line_id, order_index", []));
    const ads = adsMasterOff()
      ? []
      : (await q(`SELECT id, title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, priority, starts_at, ends_at
         FROM ads
         WHERE is_active = 1
           AND (starts_at IS NULL OR starts_at = '' OR starts_at <= ?)
           AND (ends_at IS NULL OR ends_at = '' OR ends_at >= ?)
         ORDER BY priority DESC, id DESC`, [t, t]));
    const PUBLIC_KEYS = new Set([
      "app_name", "app_version", "app_subtitle", "welcome_message", "maintenance_mode", "voice_enabled",
      "support_message", "support_phone", "store_link", "ads_rotation_seconds",
      "max_ads_per_placement", "default_city", "force_update_version", "ads_enabled",
      "travel_modes", "travel_modes_columns", "about_page", "contact_page",
      "app_server_url", // نشانی عمومی سرور اپ — مقصد دوم همگام‌سازی کاربر/فعالیت در اپ اندروید
      "app.notice", // اطلاعیه مدیریتی در اپ — بخش اطلاعیه‌ها فقط نوتیف واقعی نشان می‌دهد
    ]);
    const settingRows = (await q("SELECT key, value FROM settings", [])) as any[];
    const settings = Object.fromEntries(
      settingRows.filter((r) => PUBLIC_KEYS.has(r.key)).map((r) => [r.key, r.value])
    );
    const lexicon = (await q("SELECT spoken, written, priority FROM voice_lexicon ORDER BY priority DESC", []));
    return ok(
      {
        cities,
        lines,
        stations,
        ads,
        settings,
        lexicon,
        generated_at: t,
      },
      200,
      PUBLIC_CORS
    );
  }

  if (path === "public/users/sync" && method === "POST") {
    const key = req.headers.get("X-Sync-Key") || "";
    if (!key || key !== (process.env.DARMASIR_SYNC_KEY || "darmasir-sync-1404")) {
      return fail("FORBIDDEN", "کلید همگام‌سازی نامعتبر است", 403, PUBLIC_CORS);
    }
    const incoming: any[] = Array.isArray(body?.users)
      ? body.users
      : body?.user
        ? [body.user]
        : [];
    let synced = 0;
    for (const u of incoming.slice(0, 500)) {
      const phone = str(u?.phone, 20);
      const name = str(u?.name, 80) || "کاربر درمسیر";
      if (!phone) continue;
      await run(
        `INSERT INTO app_users (phone, display_name, status, trips_count, created_at, last_seen)
         VALUES (?,?,?,COALESCE(?,0),?,?)
         ON CONFLICT(phone) DO UPDATE SET
           display_name = excluded.display_name,
           last_seen = excluded.last_seen`,
        [phone, name, "active", Number(u?.trips) || 0, now(), now()]
      );
      synced++;
    }
    return ok({ synced }, 200, PUBLIC_CORS);
  }

  if (path === "public/ads/track" && method === "POST") {
    const id = Number(body?.id) || 0;
    const type = str(body?.type, 12);
    if (!id || (type !== "impression" && type !== "click")) {
      return fail("BAD_INPUT", "شناسه یا نوع ردگیری نامعتبر است", 400, PUBLIC_CORS);
    }
    const day = new Date().toISOString().slice(0, 10);
    if (type === "impression") {
      (await run("UPDATE ads SET impressions = impressions + 1 WHERE id = ?", [id]));
      (await run("INSERT INTO ad_stats_daily (ad_id, day, impressions, clicks) VALUES (?,?,1,0) ON CONFLICT(ad_id, day) DO UPDATE SET impressions = impressions + 1", [id, day]));
    } else {
      (await run("UPDATE ads SET clicks = clicks + 1 WHERE id = ?", [id]));
      (await run("INSERT INTO ad_stats_daily (ad_id, day, impressions, clicks) VALUES (?,?,0,1) ON CONFLICT(ad_id, day) DO UPDATE SET clicks = clicks + 1", [id, day]));
    }
    return ok({ tracked: true }, 200, PUBLIC_CORS);
  }

  /* ---------- public tickets: دریافت تیکت از اپ + مرور پاسخ‌ها توسط کاربر ----------
     ثبت تیکت با X-Sync-Key (مثل users/sync)؛ مرور پاسخ‌ها با «همان راه تماس» کاربر */
  const ticketSyncKey = req.headers.get("X-Sync-Key") || "";
  const ticketSyncOk = ticketSyncKey === (process.env.DARMASIR_SYNC_KEY || "darmasir-sync-1404");

  if (path === "public/tickets" && method === "POST") {
    if (!ticketSyncOk) return fail("FORBIDDEN", "کلید همگام‌سازی نامعتبر است", 403, PUBLIC_CORS);
    const name = str(body?.name, 80).trim();
    const contact = str(body?.contact, 100).trim();
    const category = ["general", "bug", "idea", "ad"].includes(body?.category) ? body.category : "general";
    const subject = str(body?.subject, 120).trim();
    const message = str(body?.message, 4000).trim();
    if (!name || !contact || !subject || !message) {
      return fail("BAD_INPUT", "اطلاعات تیکت ناقص است", 400, PUBLIC_CORS);
    }
    const info = (await run("INSERT INTO tickets (name, contact, category, subject, message, status, created_at) VALUES (?,?,?,?,?, 'open', ?)", [name, contact, category, subject, message, now()]));
    const ticketId = Number(info.lastInsertRowid);

    /* اطلاع ایمیل به مدیر — اگر SMTP تنظیم شده باشد */
    const adminEmail = String(((await q1("SELECT value FROM settings WHERE key = 'admin_email'", [])) as any)?.value ?? "").trim();
    let emailed = false;
    if (adminEmail) {
      const catFa: Record<string, string> = { general: "پرسش عمومی", bug: "گزارش خطا", idea: "پیشنهاد", ad: "تبلیغات" };
      const r = await sendMail(
        adminEmail,
        `تیکت جدید #${ticketId} — ${subject}`,
        mailTemplate(
          `تیکت جدید #${ticketId}`,
          `<p><b>موضوع:</b> ${subject} (${catFa[category] ?? category})</p>
           <p><b>فرستنده:</b> ${name} — <span dir="ltr">${contact}</span></p>
           <p><b>متن پیام:</b></p><div style="background:#f6f8f7;border-radius:10px;padding:12px;white-space:pre-wrap">${message}</div>
           <p style="color:#6b7a73">برای پاسخ، وارد پنل مدیریت درمسیر ← بخش «تیکت‌ها» شوید.</p>`
        )
      );
      emailed = r.sent;
    }
    return ok({ id: ticketId, emailed }, 200, PUBLIC_CORS);
  }

  if (path === "public/tickets/lookup" && method === "GET") {
    /* مرور تیکت‌ها و پاسخ‌ها با راه تماس (ایمیل/شماره) — برای بخش «تیکت‌های من» اپ */
    const contact = str(url.searchParams.get("contact") || "", 100).trim();
    if (!contact) return fail("BAD_INPUT", "راه تماس الزامی است", 400, PUBLIC_CORS);
    const rows = (await q(`SELECT id, subject, category, message, status, reply, replied_at AS repliedAt, created_at AS createdAt
         FROM tickets WHERE contact = ? ORDER BY id DESC LIMIT 20`, [contact]));
    return ok({ tickets: rows }, 200, PUBLIC_CORS);
  }

  /* ---------- mail/otp: ارسال ایمیل کد یک‌بارمصرف اپ (سرویس-به-سرویس) ----------
     اپ درمسیر (پورت ۳۰۰۰) هنگام درخواست کد بازیابی/ورود، اگر کاربر ایمیل داشته
     باشد، کد را با این مسیر از طریق SMTP همین پنل ایمیل می‌کند.
     احراز: هدر X-Admin-Key با کلید مشترک (همان کلید فراخوانی API اپ). */
  if (path === "mail/otp" && method === "POST") {
    const key = String(req.headers.get("x-admin-key") || "");
    if (!key || key !== APP_ADMIN_KEY) return fail("FORBIDDEN", "کلید سرویس نامعتبر است", 403);
    const to = str(body?.to, 120).trim();
    const code = str(body?.code, 12).trim();
    const name = str(body?.name, 80).trim();
    const phone = str(body?.phone, 20).trim();
    const kind = body?.kind === "login" ? "login" : "password_reset";
    if (!to || !code) return fail("BAD_INPUT", "گیرنده و کد الزامی است");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail("BAD_INPUT", "ایمیل گیرنده معتبر نیست");
    if (!(await smtpConfigured())) {
      return ok({ sent: false, smtp_configured: false, error: "SMTP تنظیم نشده است" });
    }
    const kindFa = kind === "login" ? "ورود" : "بازیابی رمز عبور";
    const r = await sendMail(
      to,
      `کد ${kindFa} درمسیر: ${code}`,
      mailTemplate(
        `کد ${kindFa}`,
        `<p>${name ? `سلام <b>${escHtml(name)}</b> عزیز،` : "سلام،"}</p>
         <p>کد ${kindFa} شما:</p>
         <div style="direction:ltr;text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;color:#07805f;background:#eef5f2;border-radius:12px;padding:14px;margin:12px 0">${escHtml(code)}</div>
         <p>این کد <b>۳ دقیقه</b> اعتبار دارد و فقط یک‌بار قابل استفاده است.</p>
         ${phone ? `<p style="color:#6b7a73">شماره حساب: <span dir="ltr">${escHtml(phone)}</span></p>` : ""}
         <p style="color:#6b7a73;font-size:12px">اگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.</p>`
      )
    );
    audit(null, "app-service", "otp_email", `ارسال ایمیل کد ${kindFa} به ${to} — ${r.sent ? "موفق" : r.error || "ناموفق"}`, ip);
    return ok({ sent: r.sent, smtp_configured: true, ...(r.sent ? {} : { error: r.error }) });
  }

  if (!admin) return fail("UNAUTHORIZED", "ابتدا وارد پنل شوید", 401);

  /* ---------- tts: پروکسی صدا سمت سرور پنل ----------
     «تست صدا» حتی وقتی workers.dev از ایران فیلتر است کار می‌کند،
     چون پنل (سرور) خودش به ورکر صدا وصل می‌شود و mp3 را برمی‌گرداند. */
  if (path === "tts" && method === "POST") {
    const text = str(body.text, 500);
    if (!text) return fail("BAD_INPUT", "متن برای تبدیل به گفتار الزامی است");
    const rate = Math.min(1.5, Math.max(0.6, Number(body.rate) || 1));
    const gender = body.gender === "male" ? "male" : "female";
    const bases = [
      "https://dataid.hurremmed.ir", // ورکر یکپارچه روی دامنه اختصاصی — گزینه اصلی
      "https://darmasir-api.hkhoramir.workers.dev", // همان ورکر از طریق workers.dev (پشتیبان)
    ];
    for (const b of bases) {
      try {
        const r = await fetch(`${b}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, rate, gender }),
          signal: AbortSignal.timeout(15000),
        });
        if (r.ok) {
          const ctype = r.headers.get("content-type") ?? "";
          if (!ctype.includes("json")) {
            const buf = await r.arrayBuffer();
            return new Response(buf, {
              status: 200,
              headers: { "Content-Type": ctype || "audio/mpeg", "Cache-Control": "no-store" },
            });
          }
        }
      } catch {
        /* سرور بعدی */
      }
    }
    return fail("TTS_FAIL", "سرویس صدای ابری در دسترس نیست — بعداً دوباره تلاش کنید", 502);
  }

  if (path === "auth/me" && method === "GET") {
    return ok({ id: admin.id, username: admin.username, display_name: admin.display_name, role: admin.role });
  }

  if (path === "auth/change-password" && method === "POST") {
    const current = typeof body.current_password === "string" ? body.current_password : "";
    const next = typeof body.new_password === "string" ? body.new_password : "";
    if (!verifyPassword(current, admin.password_hash))
      return fail("INVALID_LOGIN", "گذرواژه فعلی نادرست است", 401);
    if (next.length < 8) return fail("BAD_INPUT", "گذرواژه جدید باید حداقل ۸ کاراکتر باشد");
    (await run("UPDATE admins SET password_hash = ? WHERE id = ?", [hashPassword(next), admin.id]));
    audit(admin.id, admin.display_name, "password_change", "تغییر گذرواژه شخصی", ip);
    return ok({ changed: true });
  }

  if (path === "auth/logout" && method === "POST") {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    (await run("DELETE FROM sessions WHERE token = ?", [token]));
    audit(admin.id, admin.display_name, "logout", "خروج از پنل", ip);
    return ok({ logged_out: true });
  }

  /* ---------- cities (شهرها) ---------- */
  if (seg[0] === "cities") {
    if (method === "GET") {
      const rows = (await q(`SELECT c.*,
                  (SELECT COUNT(*) FROM lines l WHERE l.city_id = c.id) AS lines_count,
                  (SELECT COUNT(*) FROM stations s WHERE s.city_id = c.id) AS stations_count
           FROM cities c ORDER BY c.sort, c.id`, []));
      return ok(rows);
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (method === "POST") {
      const name = str(body.name, 60);
      if (!name) return fail("BAD_INPUT", "نام شهر الزامی است");
      const maxSort = ((await q1("SELECT COALESCE(MAX(sort),0) AS m FROM cities", [])) as any).m;
      try {
        const r = (await run("INSERT INTO cities (name, sort, created_at) VALUES (?,?,?)", [name, Number(body.sort) || maxSort + 1, now()]));
        changeLog("city", Number(r.lastInsertRowid), "create", admin.display_name, name);
        audit(admin.id, admin.display_name, "city_create", name, ip);
        return ok({ id: Number(r.lastInsertRowid) }, 201);
      } catch {
        return fail("DUPLICATE", "این شهر قبلاً ثبت شده است", 409);
      }
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "شهر یافت نشد", 404);
    if (method === "PUT") {
      const cur = (await q1("SELECT * FROM cities WHERE id = ?", [id])) as any;
      if (!cur) return fail("NOT_FOUND", "شهر یافت نشد", 404);
      const name = body.name !== undefined ? str(body.name, 60) || cur.name : cur.name;
      try {
        (await run("UPDATE cities SET name = ?, is_active = ?, sort = ? WHERE id = ?", [name, body.is_active === undefined ? cur.is_active : body.is_active ? 1 : 0, body.sort !== undefined ? Number(body.sort) || cur.sort : cur.sort, id]));
        changeLog("city", id, "update", admin.display_name, name);
        audit(admin.id, admin.display_name, "city_update", name, ip);
        return ok({ updated: true });
      } catch {
        return fail("DUPLICATE", "شهر دیگری با همین نام وجود دارد", 409);
      }
    }
    if (method === "DELETE") {
      const usedLines = ((await q1("SELECT COUNT(*) AS c FROM lines WHERE city_id = ?", [id])) as any).c;
      const usedStations = ((await q1("SELECT COUNT(*) AS c FROM stations WHERE city_id = ?", [id])) as any).c;
      if (usedLines > 0 || usedStations > 0)
        return fail(
          "IN_USE",
          `این شهر به ${usedLines} خط و ${usedStations} ایستگاه متصل است؛ ابتدا آن‌ها را به شهر دیگر منتقل کنید`,
          409
        );
      (await run("DELETE FROM cities WHERE id = ?", [id]));
      changeLog("city", id, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "city_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- dashboard ---------- */
  if (path === "dashboard" && method === "GET") {
    const countOf = async (sql: string): Promise<number> =>
      Number(((await q1(sql, [])) as any)?.c ?? 0);
    const days: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push({ day: d, count: 0 });
    }
    ((await q("SELECT day, count FROM api_stats WHERE day >= ?", [new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)])) as any[]).forEach((r) => {
      const f = days.find((x) => x.day === r.day);
      if (f) f.count = r.count;
    });
    return ok({
      users_total: await countOf("SELECT COUNT(*) AS c FROM app_users"),
      users_active: await countOf("SELECT COUNT(*) AS c FROM app_users WHERE status = 'active'"),
      trips_total: await countOf("SELECT COALESCE(SUM(trips_count),0) AS c FROM app_users"),
      lines_active: await countOf("SELECT COUNT(*) AS c FROM lines WHERE is_active = 1"),
      stations_total: await countOf("SELECT COUNT(*) AS c FROM stations"),
      cities_total: await countOf("SELECT COUNT(*) AS c FROM cities WHERE is_active = 1"),
      revenues_count: await countOf("SELECT COUNT(*) AS c FROM revenues"),
      revenues_settled: await countOf(
        "SELECT COUNT(*) AS c FROM revenues WHERE amount > 0 AND (SELECT COALESCE(SUM(p.amount),0) FROM revenue_payments p WHERE p.revenue_id = revenues.id) >= amount"
      ),
      revenues_total: await countOf("SELECT COALESCE(SUM(amount),0) AS c FROM revenues"),
      revenues_paid: await countOf("SELECT COALESCE(SUM(amount),0) AS c FROM revenue_payments"),
      invoices_count: await countOf("SELECT COUNT(*) AS c FROM invoices WHERE status != 'cancelled'"),
      invoices_paid: await countOf("SELECT COUNT(*) AS c FROM invoices WHERE status = 'paid'"),
      invoices_total: await countOf("SELECT COALESCE(SUM(total),0) AS c FROM invoices WHERE status != 'cancelled'"),
      recent_payments: (await q("SELECT p.amount, p.paid_at, p.method, r.title, r.org_name FROM revenue_payments p JOIN revenues r ON r.id = p.revenue_id ORDER BY p.id DESC LIMIT 6", [])),
      lines_by_city: (await q(`SELECT c.name AS city, COUNT(l.id) AS lines,
                  (SELECT COUNT(*) FROM stations s JOIN lines l2 ON l2.id = s.line_id
                    WHERE l2.city_id = c.id AND s.is_active = 1) AS stations
           FROM cities c LEFT JOIN lines l ON l.city_id = c.id AND l.is_active = 1
           WHERE c.is_active = 1 GROUP BY c.id ORDER BY c.sort, c.id`, [])),
      ads_active: (
        (await q1("SELECT COUNT(*) AS c FROM ads WHERE is_active = 1 AND (ends_at IS NULL OR ends_at > ?)", [now()])) as any
      ).c,
      api_last7: days,
      audit_recent: (await q("SELECT action, admin_name, details, created_at FROM audit_log ORDER BY id DESC LIMIT 8", [])),
      services: [
        { name: "دیتابیس پنل", status: "ok", note: "SQLite محلی فعال" },
        {
          name: "سرویس صوتی",
          status: ((await q1("SELECT value FROM settings WHERE key = 'voice_enabled'", [])) as any)?.value === "on" ? "ok" : "off",
          note: ((await q1("SELECT value FROM settings WHERE key = 'voice_service'", [])) as any)?.value ?? "-",
        },
        { name: "دروازه API پنل", status: "ok", note: "پورت ۳۰۳۵" },
      ],
    });
  }

  /* ---------- users (کاربران اپ) ---------- */
  if (seg[0] === "users") {
    /* کدهای پیامکی اخیر کاربر — پراکسی به API مدیریتی اپ */
    if (path === "users/otp" && method === "GET") {
      const phone = str(url.searchParams.get("phone") ?? "", 20);
      if (!phone) return fail("BAD_INPUT", "شماره موبایل الزامی است");
      const r = await appAdminCall(`/api/admin/otp?phone=${encodeURIComponent(phone)}`);
      if (!r.ok) return fail("APP_ERROR", r.message || "خطا در خواندن کدهای پیامکی", 502);
      return ok(r.data);
    }
    /* فهرست کاربران واقعی اپ — منبع حقیقت: دیتابیس اپ (D1 ابری) */
    if (path === "users/cloud" && method === "GET") {
      const search = str(url.searchParams.get("q") ?? "", 60);
      const r = await appAdminCall(`/api/admin/users?q=${encodeURIComponent(search)}`);
      if (!r.ok) return fail("APP_ERROR", r.message || "خطا در خواندن کاربران واقعی", 502);
      return ok({ users: Array.isArray(r.data) ? r.data : [], source: "app-database" });
    }
    /* فعالیت واقعی کاربر اپ اندروید — سفرها / ایستگاه‌های نشان‌شده / مسیرهای روزمره / تیکت‌ها
       منبع: جداول AppUserTrip / AppUserFavorite / AppUserDailyRoute در دیتابیس ابری D1 */
    if (path === "users/activity" && method === "GET") {
      const ident = str(url.searchParams.get("identifier") ?? "", 120);
      const uid = str(url.searchParams.get("user") ?? "", 40);
      if (!ident && !uid) return fail("BAD_INPUT", "شناسه کاربر الزامی است");
      const qs = ident ? `identifier=${encodeURIComponent(ident)}` : `user=${encodeURIComponent(uid)}`;
      const r = await appAdminCall(`/api/admin/users/activity?${qs}`);
      if (!r.ok) return fail("APP_ERROR", r.message || "خطا در خواندن فعالیت کاربر", 502);
      return ok(r.data);
    }
    /* حذف واقعی کاربر از دیتابیس اپ (D1) — برگشت‌ناپذیر */
    if (path === "users/delete" && method === "POST") {
      const id = str(body.id, 40);
      const phone = str(body.phone, 120);
      if (!id && !phone) return fail("BAD_INPUT", "شناسه یا شماره کاربر الزامی است");
      const r = await appAdminCall("/api/admin/users/action", {
        method: "POST",
        body: JSON.stringify({ action: "delete", ...(id ? { id } : {}), ...(phone ? { phone } : {}) }),
      });
      if (!r.ok) return fail("APP_ERROR", r.message || "حذف واقعی کاربر ناموفق بود", 502);
      // پاکسازی آینه محلی پنل
      if (phone) (await run("DELETE FROM app_users WHERE phone = ?", [phone]));
      changeLog("app_user", null, "delete", admin.display_name, `حذف واقعی کاربر ${phone || id}`);
      audit(admin.id, admin.display_name, "user_delete", `حذف واقعی از دیتابیس: ${phone || id}`, ip);
      // توجه: به ورکر ابر منتشر نمی‌کنیم تا کاربر حذف‌شده دوباره در مقصد ساخته نشود
      return ok({ deleted: true, ...(r.data || {}) });
    }
    if (method === "GET") {
      if (seg[1] && !isNaN(Number(seg[1]))) {
        const u = (await q1("SELECT id, phone, display_name, status, trips_count, created_at, last_seen FROM app_users WHERE id = ?", [Number(seg[1])]));
        if (!u) return fail("NOT_FOUND", "کاربر یافت نشد", 404);
        return ok(u);
      }
      const search = str(url.searchParams.get("q") ?? "", 60);
      const status = str(url.searchParams.get("status") ?? "", 20);
      let sql = "SELECT id, phone, display_name, status, trips_count, created_at, last_seen FROM app_users WHERE 1=1";
      const args: any[] = [];
      if (search) {
        sql += " AND (display_name LIKE ? OR phone LIKE ?)";
        args.push(`%${search}%`, `%${search}%`);
      }
      if (status) {
        sql += " AND status = ?";
        args.push(status);
      }
      sql += " ORDER BY id DESC LIMIT 200";
      const localRows = (await q(sql, [...args])) as any[];

      /* ---------- کاربران ثبت‌نام‌شده از اپ اندروید (جدول User در Turso) ----------
         ثبت‌نام موبایل مستقیم در جدول User دیتابیس ابری می‌نشیند؛ اینجا با
         فهرست پنل ادغام می‌شود تا مدیر همه کاربران واقعی را ببیند. */
      const seenKeys = new Set<string>();
      for (const r of localRows) {
        const p = String(r?.phone ?? "").trim();
        if (p) seenKeys.add(p);
      }
      const isoDate = (v: any): string | null => {
        if (v == null || v === "") return null;
        const n = Number(v);
        const d = Number.isFinite(n) && n > 1e12 ? new Date(n) : new Date(String(v));
        return isNaN(d.getTime()) ? String(v) : d.toISOString();
      };
      const searchLower = search ? search.toLowerCase() : "";
      let cloudRows: any[] = [];
      try {
        cloudRows = (await q(
          `SELECT "id","name","phone","email","status","createdAt","lastLoginAt" FROM "User" ORDER BY CAST("createdAt" AS INTEGER) DESC LIMIT 300`
        )) as any[];
      } catch {
        cloudRows = []; // جدول در دسترس نیست — فهرست پنل به‌تنهایی برمی‌گردد
      }
      const cloudMapped: any[] = [];
      for (const u of cloudRows) {
        const phone = String(u?.phone ?? "").trim();
        const email = String(u?.email ?? "").trim();
        if (phone && seenKeys.has(phone)) continue;
        if (email && seenKeys.has(email)) continue;
        if (phone) seenKeys.add(phone);
        if (email) seenKeys.add(email);
        const haystack = `${String(u?.name ?? "")} ${phone} ${email}`.toLowerCase();
        if (searchLower && !haystack.includes(searchLower)) continue;
        const st = u?.status === "blocked" ? "blocked" : "active";
        if (status && st !== status) continue;
        cloudMapped.push({
          id: `u:${u.id}`,
          phone: phone || email,
          display_name: String(u?.name ?? "کاربر درمسیر").slice(0, 80),
          status: st,
          trips_count: 0,
          created_at: isoDate(u?.createdAt),
          last_seen: isoDate(u?.lastLoginAt),
        });
      }
      return ok([...localRows, ...cloudMapped]);
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    /* مسدودسازی / رفع مسدودی کاربر واقعی اپ — منبع حقیقت: اپ (Prisma) */
    if (path === "users/status" && method === "POST") {
      const phone = str(body.phone, 120);
      const status = body.status === "blocked" ? "blocked" : body.status === "active" ? "active" : null;
      if (!phone || !status) return fail("BAD_INPUT", "شماره کاربر و وضعیت (blocked/active) الزامی است");
      const r = await appAdminCall("/api/admin/users/action", {
        method: "POST",
        body: JSON.stringify({ action: status === "blocked" ? "block" : "unblock", phone }),
      });
      if (!r.ok) return fail("APP_ERROR", r.message || "عملیات در اپ ناموفق بود", 502);
      // آینه محلی
      const upd = (await run("UPDATE app_users SET status = ? WHERE phone = ?", [status, phone]));
      if (upd.changes === 0) {
        (await run("INSERT INTO app_users (phone, display_name, status, created_at, last_seen) VALUES (?,?,?,?,?)", [phone, phone, status, now(), now()]));
      }
      changeLog("app_user", null, "status", admin.display_name, `${phone} → ${status}`);
      audit(admin.id, admin.display_name, "user_status", `${phone} → ${status}`, ip);
      // انتشار به سرور ابری
      cloudPublishUser({ phone, status });
      return ok({ phone, status, sessions_revoked: status === "blocked" });
    }
    /* تنظیم/تغییر رمز عبور کاربر واقعی اپ — منبع حقیقت: اپ (Prisma) */
    if (path === "users/password" && method === "POST") {
      const phone = str(body.phone, 120);
      const password = typeof body.password === "string" ? body.password : "";
      if (!phone || password.length < 6)
        return fail("BAD_INPUT", "شماره کاربر و رمز عبور حداقل ۶ کاراکتر الزامی است");
      const r = await appAdminCall("/api/admin/users/action", {
        method: "POST",
        body: JSON.stringify({ action: "password", phone, password }),
      });
      if (!r.ok) return fail("APP_ERROR", r.message || "تغییر رمز در اپ ناموفق بود", 502);
      changeLog("app_user", null, "password", admin.display_name, `رمز کاربر ${phone} توسط مدیر تنظیم شد`);
      audit(admin.id, admin.display_name, "user_password", `${phone}`, ip);
      return ok({ phone, changed: true });
    }
    if (path === "users/bulk-status" && method === "POST") {
      const status = ["active", "limited", "disabled"].includes(body.status) ? body.status : null;
      const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
      if (!status || !ids.length) return fail("BAD_INPUT", "وضعیت و فهرست کاربران الزامی است");
      let n = 0;
      for (const id of ids) { await run("UPDATE app_users SET status = ? WHERE id = ?", [status, id]); n++; }
      changeLog("app_user", null, "bulk_status", admin.display_name, `${n} کاربر → ${status}`);
      audit(admin.id, admin.display_name, "user_bulk_status", `${n} کاربر → ${status}`, ip);
      return ok({ updated: n });
    }
    if (seg[1] === "trips" && seg[2] && method === "POST") {
      const id = Number(seg[2]);
      const u = (await q1("SELECT * FROM app_users WHERE id = ?", [id])) as any;
      if (!u) return fail("NOT_FOUND", "کاربر یافت نشد", 404);
      const delta = Math.round(Number(body.delta) || 0);
      if (!delta) return fail("BAD_INPUT", "مقدار تغییر سفر الزامی است");
      const next = Math.max(0, (u.trips_count || 0) + delta);
      (await run("UPDATE app_users SET trips_count = ? WHERE id = ?", [next, id]));
      changeLog("app_user", id, "update", admin.display_name, `سفرها: ${u.trips_count} → ${next}`);
      audit(admin.id, admin.display_name, "user_update", `سفرهای کاربر #${id} → ${next}`, ip);
      return ok({ trips_count: next });
    }
    if (method === "POST") {
      const name = str(body.display_name, 80);
      const phone = str(body.phone, 20) || null;
      const status = ["active", "limited", "disabled", "blocked"].includes(body.status) ? body.status : "active";
      if (!name) return fail("BAD_INPUT", "نام کاربر الزامی است");
      try {
        const r = (await run("INSERT INTO app_users (phone, display_name, status, created_at, last_seen) VALUES (?,?,?,?,?)", [phone, name, status, now(), now()]));
        changeLog("app_user", Number(r.lastInsertRowid), "create", admin.display_name, name);
        audit(admin.id, admin.display_name, "user_create", name, ip);
        return ok({ id: Number(r.lastInsertRowid) }, 201);
      } catch {
        return fail("DUPLICATE", "این شماره قبلاً ثبت شده است", 409);
      }
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "کاربر یافت نشد", 404);
    if (method === "PUT") {
      const patch: string[] = [];
      const args: any[] = [];
      if (body.display_name !== undefined) {
        patch.push("display_name = ?");
        args.push(str(body.display_name, 80));
      }
      if (body.phone !== undefined) {
        patch.push("phone = ?");
        args.push(str(body.phone, 20) || null);
      }
      if (body.status !== undefined) {
        if (!["active", "limited", "disabled", "blocked"].includes(body.status))
          return fail("BAD_INPUT", "وضعیت نامعتبر است");
        patch.push("status = ?");
        args.push(body.status);
      }
      if (!patch.length) return fail("BAD_INPUT", "چیزی برای بروزرسانی نیست");
      args.push(id);
      (await run(`UPDATE app_users SET ${patch.join(", ")} WHERE id = ?`, [...args]));
      changeLog("app_user", id, "update", admin.display_name, JSON.stringify(body).slice(0, 200));
      audit(admin.id, admin.display_name, "user_update", `#${id}`, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      (await run("DELETE FROM app_users WHERE id = ?", [id]));
      changeLog("app_user", id, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "user_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- lines ---------- */
  if (seg[0] === "lines") {
    if (method === "GET") {
      const mode = str(url.searchParams.get("mode") ?? "", 10);
      const cityId = Number(url.searchParams.get("city_id")) || null;
      const baseSql =
        "SELECT l.*, c.name AS city_name, (SELECT COUNT(*) FROM stations s WHERE s.line_id = l.id AND s.is_active = 1) AS station_count FROM lines l LEFT JOIN cities c ON c.id = l.city_id";
      const wh: string[] = [];
      const args: any[] = [];
      if (mode) {
        wh.push("l.mode = ?");
        args.push(mode);
      }
      if (cityId) {
        wh.push("l.city_id = ?");
        args.push(cityId);
      }
      const where = wh.length ? ` WHERE ${wh.join(" AND ")}` : "";
      return ok((await q(`${baseSql}${where} ORDER BY l.sort`, [...args])));
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (path === "lines/reorder" && method === "POST") {
      const id = Number(body.id);
      const dir = body.dir === "up" ? "up" : body.dir === "down" ? "down" : null;
      if (!id || !dir) return fail("BAD_INPUT", "شناسه خط و جهت جابه‌جایی الزامی است");
      const cur = (await q1("SELECT * FROM lines WHERE id = ?", [id])) as any;
      if (!cur) return fail("NOT_FOUND", "خط یافت نشد", 404);
      const neighbor = (
        dir === "up"
          ? (await q1("SELECT * FROM lines WHERE mode = ? AND sort < ? ORDER BY sort DESC LIMIT 1", [cur.mode, cur.sort]))
          : (await q1("SELECT * FROM lines WHERE mode = ? AND sort > ? ORDER BY sort LIMIT 1", [cur.mode, cur.sort]))
      ) as any | undefined;
      if (!neighbor) return ok({ moved: false });
      (await run("UPDATE lines SET sort = ? WHERE id = ?", [neighbor.sort, cur.id]));
      (await run("UPDATE lines SET sort = ? WHERE id = ?", [cur.sort, neighbor.id]));
      changeLog("line", id, "update", admin.display_name, `جابه‌جایی ترتیب ${cur.name}`);
      audit(admin.id, admin.display_name, "line_update", `ترتیب ${cur.name}`, ip);
      return ok({ moved: true });
    }
    if (path === "lines/duplicate" && method === "POST") {
      const id = Number(body.id);
      const cur = (await q1("SELECT * FROM lines WHERE id = ?", [id])) as any;
      if (!cur) return fail("NOT_FOUND", "خط یافت نشد", 404);
      const maxSort = ((await q1("SELECT COALESCE(MAX(sort),0) AS m FROM lines", [])) as any).m;
      const r = (await run("INSERT INTO lines (mode, number, name, color, terminals, direction, city_id, is_active, sort) VALUES (?,?,?,?,?,?,?,0,?)", [cur.mode, cur.number, `${cur.name} (کپی)`, cur.color, cur.terminals, cur.direction, cur.city_id ?? null, maxSort + 1]));
      changeLog("line", Number(r.lastInsertRowid), "create", admin.display_name, `${cur.name} (کپی)`);
      audit(admin.id, admin.display_name, "line_create", `تکثیر ${cur.name}`, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }
    if (method === "POST") {
      const name = str(body.name, 80);
      if (!name) return fail("BAD_INPUT", "نام خط الزامی است");
      const cityId = Number(body.city_id) || null;
      if (cityId && !(await q1("SELECT id FROM cities WHERE id = ?", [cityId])))
        return fail("NOT_FOUND", "شهر انتخاب‌شده یافت نشد", 404);
      const r = (await run("INSERT INTO lines (mode, number, name, color, terminals, direction, city_id, is_active, sort) VALUES (?,?,?,?,?,?,?,?,?)", [["metro", "bus", "brt"].includes(body.mode) ? body.mode : "metro", Number(body.number) || null, name, /^#[0-9a-fA-F]{6}$/.test(body.color ?? "") ? body.color : "#009640", str(body.terminals, 120) || null, str(body.direction, 60) || null, cityId, body.is_active === 0 ? 0 : 1, Number(body.sort) || 0]));
      changeLog("line", Number(r.lastInsertRowid), "create", admin.display_name, name);
      audit(admin.id, admin.display_name, "line_create", name, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "خط یافت نشد", 404);
    if (method === "PUT") {
      const cur = (await q1("SELECT * FROM lines WHERE id = ?", [id])) as any;
      if (!cur) return fail("NOT_FOUND", "خط یافت نشد", 404);
      const next = { ...cur, ...body, name: body.name !== undefined ? str(body.name, 80) || cur.name : cur.name };
      const nextCityId = body.city_id !== undefined ? Number(body.city_id) || null : cur.city_id ?? null;
      if (nextCityId && !(await q1("SELECT id FROM cities WHERE id = ?", [nextCityId])))
        return fail("NOT_FOUND", "شهر انتخاب‌شده یافت نشد", 404);
      (await run("UPDATE lines SET mode=?, number=?, name=?, color=?, terminals=?, direction=?, city_id=?, is_active=?, sort=? WHERE id=?", [["metro", "bus", "brt"].includes(next.mode) ? next.mode : "metro", Number(next.number) || null, next.name, /^#[0-9a-fA-F]{6}$/.test(next.color ?? "") ? next.color : "#009640", next.terminals, next.direction, nextCityId, next.is_active ? 1 : 0, Number(next.sort) || 0, id]));
      changeLog("line", id, "update", admin.display_name, next.name);
      audit(admin.id, admin.display_name, "line_update", next.name, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      (await run("DELETE FROM lines WHERE id = ?", [id]));
      changeLog("line", id, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "line_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- stations ---------- */
  if (seg[0] === "stations") {
    if (method === "GET") {
      const lineId = Number(url.searchParams.get("line_id")) || null;
      const cityId = Number(url.searchParams.get("city_id")) || null;
      const baseSql =
        "SELECT s.*, l.name AS line_name, l.color AS line_color, c.name AS city_name FROM stations s JOIN lines l ON l.id = s.line_id LEFT JOIN cities c ON c.id = s.city_id";
      if (lineId) {
        return ok((await q(`${baseSql} WHERE s.line_id = ? ORDER BY s.order_index`, [lineId])));
      }
      const rows = cityId
        ? (await q(`${baseSql} WHERE s.city_id = ? ORDER BY s.line_id, s.order_index LIMIT 500`, [cityId]))
        : (await q(`${baseSql} ORDER BY s.line_id, s.order_index LIMIT 500`, []));
      return ok(rows);
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (path === "stations/reorder" && method === "POST") {
      const id = Number(body.id);
      const dir = body.dir === "up" ? "up" : body.dir === "down" ? "down" : null;
      if (!id || !dir) return fail("BAD_INPUT", "شناسه ایستگاه و جهت جابه‌جایی الزامی است");
      const cur = (await q1("SELECT * FROM stations WHERE id = ?", [id])) as any;
      if (!cur) return fail("NOT_FOUND", "ایستگاه یافت نشد", 404);
      const neighbor = (
        dir === "up"
          ? (await q1("SELECT * FROM stations WHERE line_id = ? AND order_index < ? ORDER BY order_index DESC LIMIT 1", [cur.line_id, cur.order_index]))
          : (await q1("SELECT * FROM stations WHERE line_id = ? AND order_index > ? ORDER BY order_index LIMIT 1", [cur.line_id, cur.order_index]))
      ) as any | undefined;
      if (!neighbor) return ok({ moved: false });
      (await run("UPDATE stations SET order_index = ? WHERE id = ?", [neighbor.order_index, cur.id]));
      (await run("UPDATE stations SET order_index = ? WHERE id = ?", [cur.order_index, neighbor.id]));
      changeLog("station", id, "update", admin.display_name, `جابه‌جایی ${cur.name}`);
      audit(admin.id, admin.display_name, "station_update", `ترتیب ${cur.name}`, ip);
      return ok({ moved: true });
    }
    if (path === "stations/bulk" && method === "POST") {
      const lineId = Number(body.line_id);
      const namesRaw = typeof body.names === "string" ? body.names : "";
      if (!lineId) return fail("BAD_INPUT", "خط الزامی است");
      const line = (await q1("SELECT id, city_id FROM lines WHERE id = ?", [lineId])) as any;
      if (!line) return fail("NOT_FOUND", "خط یافت نشد", 404);
      const names = namesRaw
        .split(/\n|\r|،/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 200);
      if (!names.length) return fail("BAD_INPUT", "حداقل یک نام ایستگاه وارد کنید (هر خط یک نام)");
      const maxOrder = ((await q1("SELECT COALESCE(MAX(order_index), -1) AS m FROM stations WHERE line_id = ?", [lineId])) as any).m;
      let added = 0;
      for (let i = 0; i < names.length; i++) {
        const name: string = names[i];
        if (await q1("SELECT id FROM stations WHERE line_id = ? AND name = ?", [lineId, name])) continue;
        await run("INSERT INTO stations (line_id, name, order_index, is_active, city_id) VALUES (?,?,?,1,?)", [lineId, name, maxOrder + 1 + i, line.city_id ?? null]);
        added++;
      }
      changeLog("station", null, "bulk_create", admin.display_name, `${added} ایستگاه به خط #${lineId}`);
      audit(admin.id, admin.display_name, "station_bulk", `${added} ایستگاه افزوده شد`, ip);
      return ok({ added, skipped: names.length - added }, 201);
    }
    if (method === "POST") {
      const lineId = Number(body.line_id);
      const name = str(body.name, 80);
      if (!lineId) return fail("BAD_INPUT", "خط الزامی است");
      if (!name) return fail("BAD_INPUT", "نام ایستگاه الزامی است");
      const line = (await q1("SELECT id, city_id FROM lines WHERE id = ?", [lineId])) as any;
      if (!line) return fail("NOT_FOUND", "خط یافت نشد", 404);
      // شهر ایستگاه: انتخاب مدیر یا به‌طور خودکار از شهر خط مقصد
      let stationCityId = body.city_id !== undefined && body.city_id !== "" && body.city_id !== null ? Number(body.city_id) : null;
      if (stationCityId && !(await q1("SELECT id FROM cities WHERE id = ?", [stationCityId])))
        return fail("NOT_FOUND", "شهر انتخاب‌شده یافت نشد", 404);
      if (!stationCityId) stationCityId = line.city_id ?? null;
      const r = (await run("INSERT INTO stations (line_id, name, lat, lng, city_id, order_index, is_active) VALUES (?,?,?,?,?,?,?)", [lineId, name, body.lat !== undefined && body.lat !== "" ? Number(body.lat) : null, body.lng !== undefined && body.lng !== "" ? Number(body.lng) : null, stationCityId, Number(body.order_index) || 0, body.is_active === 0 ? 0 : 1]));
      changeLog("station", Number(r.lastInsertRowid), "create", admin.display_name, name);
      audit(admin.id, admin.display_name, "station_create", name, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "ایستگاه یافت نشد", 404);
    if (method === "PUT") {
      const cur = (await q1("SELECT * FROM stations WHERE id = ?", [id])) as any;
      if (!cur) return fail("NOT_FOUND", "ایستگاه یافت نشد", 404);
      const next = { ...cur, ...body, name: body.name !== undefined ? str(body.name, 80) || cur.name : cur.name };
      // اگر خط عوض شد و شهر دستی انتخاب نشده، شهر از خط جدید گرفته می‌شود
      let nextCityId = body.city_id !== undefined && body.city_id !== "" && body.city_id !== null ? Number(body.city_id) : null;
      if (nextCityId && !(await q1("SELECT id FROM cities WHERE id = ?", [nextCityId])))
        return fail("NOT_FOUND", "شهر انتخاب‌شده یافت نشد", 404);
      const newLineId = Number(next.line_id) || cur.line_id;
      if (!nextCityId) {
        if (newLineId !== cur.line_id) {
          const newLine = (await q1("SELECT city_id FROM lines WHERE id = ?", [newLineId])) as any;
          nextCityId = newLine?.city_id ?? null;
        } else {
          nextCityId = cur.city_id ?? null;
        }
      }
      (await run("UPDATE stations SET line_id=?, name=?, lat=?, lng=?, city_id=?, order_index=?, is_active=? WHERE id=?", [newLineId, next.name, next.lat === null ? null : Number(next.lat), next.lng === null ? null : Number(next.lng), nextCityId, Number(next.order_index) || 0, next.is_active ? 1 : 0, id]));
      changeLog("station", id, "update", admin.display_name, next.name);
      audit(admin.id, admin.display_name, "station_update", next.name, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      (await run("DELETE FROM stations WHERE id = ?", [id]));
      changeLog("station", id, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "station_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- revenues (درآمدها و قراردادهای سازمانی) ---------- */
  const REV_STATUS_SQL = `CASE
    WHEN (SELECT COALESCE(SUM(p.amount),0) FROM revenue_payments p WHERE p.revenue_id = r.id) >= r.amount AND r.amount > 0 THEN 'paid'
    WHEN (SELECT COALESCE(SUM(p.amount),0) FROM revenue_payments p WHERE p.revenue_id = r.id) > 0 THEN 'partial'
    ELSE 'pending' END`;
  const REV_SELECT = `SELECT r.*,
    (SELECT COALESCE(SUM(p.amount),0) FROM revenue_payments p WHERE p.revenue_id = r.id) AS paid_amount,
    (SELECT COUNT(*) FROM revenue_docs d WHERE d.revenue_id = r.id) AS docs_count,
    (SELECT COUNT(*) FROM revenue_payments p WHERE p.revenue_id = r.id) AS payments_count,
    ${REV_STATUS_SQL} AS status
    FROM revenues r`;
  const revDate = (v: any) => {
    const s = typeof v === "string" ? v.trim().slice(0, 10) : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  };

  if (seg[0] === "revenues") {
    /* صورت‌حساب دوره‌ای — پایه گزارش PDF */
    if (seg[1] === "statement" && method === "GET") {
      const from = revDate(url.searchParams.get("from")) ?? "0000-01-01";
      const to = revDate(url.searchParams.get("to")) ?? "9999-12-31";
      const toIncl = `${to}T23:59:59.999Z`;
      const payments = (await q(`SELECT p.id, p.amount, p.paid_at, p.method, p.reference, p.note,
                  r.id AS revenue_id, r.title AS rev_title, r.org_name, r.contract_no
           FROM revenue_payments p JOIN revenues r ON r.id = p.revenue_id
           WHERE p.paid_at >= ? AND p.paid_at <= ?
           ORDER BY p.paid_at`, [from, toIncl]));
      const settled = (await q(`SELECT r.id, r.title, r.org_name, r.amount, r.contract_no,
                  (SELECT COALESCE(SUM(p.amount),0) FROM revenue_payments p WHERE p.revenue_id = r.id) AS paid_amount,
                  (SELECT MAX(p.paid_at) FROM revenue_payments p WHERE p.revenue_id = r.id) AS last_payment
           FROM revenues r
           WHERE r.amount > 0
             AND (SELECT COALESCE(SUM(p.amount),0) FROM revenue_payments p WHERE p.revenue_id = r.id) >= r.amount
             AND (SELECT MAX(p.paid_at) FROM revenue_payments p WHERE p.revenue_id = r.id) >= ?
             AND (SELECT MAX(p.paid_at) FROM revenue_payments p WHERE p.revenue_id = r.id) <= ?
           ORDER BY last_payment`, [from, toIncl]));
      const paidTotal = payments.reduce((s: number, p: any) => s + p.amount, 0);
      return ok({
        from,
        to,
        payments,
        settled,
        totals: { paid: paidTotal, count: payments.length, orgs: new Set(payments.map((p: any) => p.org_name)).size, settled: settled.length },
      });
    }

    /* فهرست قراردادها */
    if (!seg[1] && method === "GET") {
      const searchQ = str(url.searchParams.get("q") ?? "", 60);
      const status = str(url.searchParams.get("status") ?? "", 10);
      let sql = REV_SELECT + " WHERE 1=1";
      const args: any[] = [];
      if (searchQ) {
        sql += " AND (r.title LIKE ? OR r.org_name LIKE ? OR IFNULL(r.contract_no,'') LIKE ?)";
        args.push(`%${searchQ}%`, `%${searchQ}%`, `%${searchQ}%`);
      }
      if (status) {
        sql += ` AND ${REV_STATUS_SQL} = ?`;
        args.push(status);
      }
      sql += " ORDER BY r.id DESC LIMIT 300";
      return ok((await q(sql, [...args])));
    }

    const revId = Number(seg[1]) || 0;

    /* جزئیات قرارداد — پرداخت‌ها و مستندات */
    if (revId && method === "GET" && !seg[2]) {
      const rev = (await q1(`${REV_SELECT} WHERE r.id = ?`, [revId])) as any;
      if (!rev) return fail("NOT_FOUND", "قرارداد یافت نشد", 404);
      rev.payments = (await q("SELECT * FROM revenue_payments WHERE revenue_id = ? ORDER BY paid_at DESC, id DESC", [revId]));
      rev.docs = (await q("SELECT id, filename, original_name, mime, size, created_at FROM revenue_docs WHERE revenue_id = ? ORDER BY id DESC", [revId]));
      return ok(rev);
    }

    const guard = requireRole(admin, "operator");
    if (guard) return guard;

    /* پرداخت‌های قرارداد */
    if (revId && seg[2] === "payments") {
      const rev = (await q1("SELECT * FROM revenues WHERE id = ?", [revId])) as any;
      if (!rev) return fail("NOT_FOUND", "قرارداد یافت نشد", 404);
      if (method === "POST") {
        const amount = Math.round(Number(body.amount) || 0);
        if (amount <= 0) return fail("BAD_INPUT", "مبلغ پرداخت باید بزرگ‌تر از صفر باشد");
        let paidAt = str(body.paid_at, 30) || now();
        if (/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) paidAt += "T12:00:00.000Z";
        const r = (await run("INSERT INTO revenue_payments (revenue_id, amount, paid_at, method, reference, note, created_at) VALUES (?,?,?,?,?,?,?)", [revId, amount, paidAt, str(body.method, 40) || null, str(body.reference, 60) || null, str(body.note, 200) || null, now()]));
        changeLog("revenue", revId, "update", admin.display_name, `پرداخت ${amount} تومان — ${rev.org_name}`);
        audit(admin.id, admin.display_name, "revenue_payment", `${amount} تومان — ${rev.org_name}`, ip);
        return ok({ id: Number(r.lastInsertRowid) }, 201);
      }
      if (method === "DELETE" && seg[3]) {
        const pay = (await q1("SELECT * FROM revenue_payments WHERE id = ? AND revenue_id = ?", [Number(seg[3]), revId])) as any;
        if (!pay) return fail("NOT_FOUND", "پرداخت یافت نشد", 404);
        (await run("DELETE FROM revenue_payments WHERE id = ?", [pay.id]));
        changeLog("revenue", revId, "update", admin.display_name, `حذف پرداخت ${pay.amount} تومان`);
        audit(admin.id, admin.display_name, "revenue_payment_delete", `${pay.amount} تومان — قرارداد #${revId}`, ip);
        return ok({ deleted: true });
      }
      return fail("NOT_FOUND", "مسیر پرداخت یافت نشد", 404);
    }

    /* مستندات قرارداد — آپلود و حذف فایل */
    if (revId && seg[2] === "docs") {
      const rev = (await q1("SELECT id FROM revenues WHERE id = ?", [revId]));
      if (!rev) return fail("NOT_FOUND", "قرارداد یافت نشد", 404);
      if (method === "POST") {
        let form: FormData;
        try {
          form = await req.formData();
        } catch {
          return fail("BAD_INPUT", "فایلی ارسال نشده است");
        }
        const file = form.get("file");
        if (!(file instanceof File) || !file.size) return fail("BAD_INPUT", "فایلی ارسال نشده است");
        if (file.size > 15 * 1024 * 1024) return fail("TOO_LARGE", "حجم فایل باید کمتر از ۱۵ مگابایت باشد", 413);
        const ext = ((file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin").slice(0, 8);
        const DOC_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "pdf", "doc", "docx", "xls", "xlsx", "txt"]);
        if (!DOC_EXTS.has(ext)) return fail("BAD_INPUT", "فرمت فایل پشتیبانی نمی‌شود (تصویر، PDF یا فایل آفیس)");
        const safeName = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        await Bun.write(join(UPLOAD_DIR, safeName), await file.arrayBuffer());
        const r = (await run("INSERT INTO revenue_docs (revenue_id, filename, original_name, mime, size, created_at) VALUES (?,?,?,?,?,?)", [revId, safeName, file.name.slice(0, 200), file.type || null, file.size, now()]));
        changeLog("revenue", revId, "update", admin.display_name, `سند: ${file.name.slice(0, 80)}`);
        audit(admin.id, admin.display_name, "revenue_doc", `${file.name.slice(0, 80)} — قرارداد #${revId}`, ip);
        return ok({ id: Number(r.lastInsertRowid), filename: safeName }, 201);
      }
      if (method === "DELETE" && seg[3]) {
        const doc = (await q1("SELECT * FROM revenue_docs WHERE id = ? AND revenue_id = ?", [Number(seg[3]), revId])) as any;
        if (!doc) return fail("NOT_FOUND", "سند یافت نشد", 404);
        try {
          const p = join(UPLOAD_DIR, doc.filename);
          if (existsSync(p)) unlinkSync(p);
        } catch {}
        (await run("DELETE FROM revenue_docs WHERE id = ?", [doc.id]));
        audit(admin.id, admin.display_name, "revenue_doc_delete", `${doc.original_name} — قرارداد #${revId}`, ip);
        return ok({ deleted: true });
      }
      return fail("NOT_FOUND", "مسیر سند یافت نشد", 404);
    }

    /* ثبت قرارداد جدید */
    if (!revId && method === "POST") {
      const title = str(body.title, 120);
      const orgName = str(body.org_name, 120);
      if (!title) return fail("BAD_INPUT", "عنوان قرارداد الزامی است");
      if (!orgName) return fail("BAD_INPUT", "نام سازمان یا شرکت الزامی است");
      const amount = Math.max(0, Math.round(Number(body.amount) || 0));
      const cs = revDate(body.contract_start);
      const ce = revDate(body.contract_end);
      if (cs && ce && ce < cs) return fail("BAD_INPUT", "تاریخ پایان قرارداد نمی‌تواند قبل از تاریخ شروع باشد");
      const r = (await run("INSERT INTO revenues (title, org_name, amount, contract_no, contract_start, contract_end, terms, contact_name, contact_phone, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [title, orgName, amount, str(body.contract_no, 60) || null, cs, ce, str(body.terms, 2000) || null, str(body.contact_name, 80) || null, str(body.contact_phone, 30) || null, str(body.notes, 1000) || null, now(), now()]));
      changeLog("revenue", Number(r.lastInsertRowid), "create", admin.display_name, `${title} — ${orgName}`);
      audit(admin.id, admin.display_name, "revenue_create", title, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }

    if (!revId) return fail("NOT_FOUND", "قرارداد یافت نشد", 404);
    if (method === "PUT") {
      const cur = (await q1("SELECT * FROM revenues WHERE id = ?", [revId])) as any;
      if (!cur) return fail("NOT_FOUND", "قرارداد یافت نشد", 404);
      const cs = body.contract_start !== undefined ? revDate(body.contract_start) : cur.contract_start;
      const ce = body.contract_end !== undefined ? revDate(body.contract_end) : cur.contract_end;
      if (cs && ce && ce < cs) return fail("BAD_INPUT", "تاریخ پایان قرارداد نمی‌تواند قبل از تاریخ شروع باشد");
      (await run("UPDATE revenues SET title=?, org_name=?, amount=?, contract_no=?, contract_start=?, contract_end=?, terms=?, contact_name=?, contact_phone=?, notes=?, updated_at=? WHERE id=?", [body.title !== undefined ? str(body.title, 120) || cur.title : cur.title, body.org_name !== undefined ? str(body.org_name, 120) || cur.org_name : cur.org_name, body.amount !== undefined ? Math.max(0, Math.round(Number(body.amount) || 0)) : cur.amount, body.contract_no !== undefined ? str(body.contract_no, 60) || null : cur.contract_no, cs, ce, body.terms !== undefined ? str(body.terms, 2000) || null : cur.terms, body.contact_name !== undefined ? str(body.contact_name, 80) || null : cur.contact_name, body.contact_phone !== undefined ? str(body.contact_phone, 30) || null : cur.contact_phone, body.notes !== undefined ? str(body.notes, 1000) || null : cur.notes, now(), revId]));
      changeLog("revenue", revId, "update", admin.display_name, cur.title);
      audit(admin.id, admin.display_name, "revenue_update", cur.title, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      const docs = (await q("SELECT filename FROM revenue_docs WHERE revenue_id = ?", [revId])) as any[];
      for (const doc of docs) {
        try {
          const p = join(UPLOAD_DIR, doc.filename);
          if (existsSync(p)) unlinkSync(p);
        } catch {}
      }
      (await run("DELETE FROM revenues WHERE id = ?", [revId]));
      changeLog("revenue", revId, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "revenue_delete", `#${revId}`, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- invoices (فاکتور تبلیغات) ---------- */
  if (seg[0] === "invoices") {
    if (!seg[1] && method === "GET") {
      const searchQ = str(url.searchParams.get("q") ?? "", 60);
      const status = str(url.searchParams.get("status") ?? "", 12);
      let sql = "SELECT * FROM invoices WHERE 1=1";
      const args: any[] = [];
      if (searchQ) {
        sql += " AND (customer_name LIKE ? OR number LIKE ? OR IFNULL(title,'') LIKE ?)";
        args.push(`%${searchQ}%`, `%${searchQ}%`, `%${searchQ}%`);
      }
      if (status) {
        sql += " AND status = ?";
        args.push(status);
      }
      sql += " ORDER BY id DESC LIMIT 300";
      return ok((await q(sql, [...args])));
    }
    const id = Number(seg[1]) || 0;
    if (id && method === "GET") {
      const row = (await q1("SELECT * FROM invoices WHERE id = ?", [id]));
      if (!row) return fail("NOT_FOUND", "فاکتور یافت نشد", 404);
      return ok(row);
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;

    const parseItems = (raw: any): { desc: string; qty: number; price: number }[] => {
      let arr: any[] = [];
      try {
        arr = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
      } catch {
        arr = [];
      }
      return arr
        .map((it) => ({
          desc: str(it?.desc, 150),
          qty: Math.max(1, Math.round(Number(it?.qty) || 1)),
          price: Math.max(0, Math.round(Number(it?.price) || 0)),
        }))
        .filter((it) => it.desc);
    };
    const invTotal = (items: any[], discount: number) =>
      Math.max(items.reduce((s: number, it: any) => s + it.qty * it.price, 0) - discount, 0);

    if (!id && method === "POST") {
      const customer = str(body.customer_name, 120);
      if (!customer) return fail("BAD_INPUT", "نام مشتری الزامی است");
      const items = parseItems(body.items);
      if (!items.length) return fail("BAD_INPUT", "حداقل یک قلم فاکتور با شرح خدمات الزامی است");
      const discount = Math.max(0, Math.round(Number(body.discount) || 0));
      const total = invTotal(items, discount);
      const status = ["issued", "paid", "cancelled"].includes(body.status) ? body.status : "issued";
      const issueDate = revDate(body.issue_date) ?? new Date().toISOString().slice(0, 10);
      /* شماره‌گذاری خودکار بر اساس سال شمسی: INV-1404-0001 */
      let jy = "";
      try {
        jy = new Intl.DateTimeFormat("en-u-ca-persian", { year: "numeric" }).format().replace(/[^0-9]/g, "");
      } catch {}
      if (!jy) jy = String(new Date().getFullYear());
      const count = ((await q1("SELECT COUNT(*) AS c FROM invoices WHERE number LIKE ?", [`INV-${jy}-%`])) as any).c;
      let inserted: any = null;
      let number = "";
      for (let t = 0; t < 20; t++) {
        number = `INV-${jy}-${String(count + 1 + t).padStart(4, "0")}`;
        try {
          inserted = (await run("INSERT INTO invoices (number, title, customer_name, customer_phone, items, discount, total, status, issue_date, due_date, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [number, str(body.title, 120) || "خدمات تبلیغات", customer, str(body.customer_phone, 30) || null, JSON.stringify(items), discount, total, status, issueDate, revDate(body.due_date), str(body.notes, 1000) || null, now(), now()]));
          break;
        } catch {
          /* شماره تکراری — با شماره بعدی ادامه می‌دهیم */
        }
      }
      if (!inserted) return fail("INTERNAL", "صدور فاکتور ناموفق بود", 500);
      changeLog("invoice", Number(inserted.lastInsertRowid), "create", admin.display_name, `${number} — ${customer}`);
      audit(admin.id, admin.display_name, "invoice_create", `${number} — ${customer}`, ip);
      return ok({ id: Number(inserted.lastInsertRowid), number }, 201);
    }
    if (!id) return fail("NOT_FOUND", "فاکتور یافت نشد", 404);
    if (method === "PUT") {
      const cur = (await q1("SELECT * FROM invoices WHERE id = ?", [id])) as any;
      if (!cur) return fail("NOT_FOUND", "فاکتور یافت نشد", 404);
      let items: any[];
      if (body.items !== undefined) {
        items = parseItems(body.items);
        if (!items.length) return fail("BAD_INPUT", "حداقل یک قلم فاکتور الزامی است");
      } else {
        try {
          items = JSON.parse(cur.items || "[]");
        } catch {
          items = [];
        }
      }
      const discount = body.discount !== undefined ? Math.max(0, Math.round(Number(body.discount) || 0)) : cur.discount;
      const total = invTotal(items, discount);
      const status = body.status !== undefined ? (["issued", "paid", "cancelled"].includes(body.status) ? body.status : cur.status) : cur.status;
      (await run("UPDATE invoices SET title=?, customer_name=?, customer_phone=?, items=?, discount=?, total=?, status=?, issue_date=?, due_date=?, notes=?, updated_at=? WHERE id=?", [body.title !== undefined ? str(body.title, 120) || cur.title : cur.title, body.customer_name !== undefined ? str(body.customer_name, 120) || cur.customer_name : cur.customer_name, body.customer_phone !== undefined ? str(body.customer_phone, 30) || null : cur.customer_phone, JSON.stringify(items), discount, total, status, body.issue_date !== undefined ? revDate(body.issue_date) || cur.issue_date : cur.issue_date, body.due_date !== undefined ? revDate(body.due_date) : cur.due_date, body.notes !== undefined ? str(body.notes, 1000) || null : cur.notes, now(), id]));
      changeLog("invoice", id, "update", admin.display_name, cur.number);
      audit(admin.id, admin.display_name, status !== cur.status ? "invoice_status" : "invoice_update", cur.number, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      const cur = (await q1("SELECT number FROM invoices WHERE id = ?", [id])) as any;
      if (!cur) return fail("NOT_FOUND", "فاکتور یافت نشد", 404);
      (await run("DELETE FROM invoices WHERE id = ?", [id]));
      changeLog("invoice", id, "delete", admin.display_name, cur.number);
      audit(admin.id, admin.display_name, "invoice_delete", cur.number, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- ads ---------- */
  const AD_PLACEMENTS = [
    "home", "home_bottom", "lines", "status", "settings", "saved",
    /* جایگاه‌های قدیمی — برای سازگاری با کمپین‌های قبلی */
    "map", "plan", "station", "line", "splash", "drawer",
  ];
  if (seg[0] === "ads") {
    // ثبت نمایش/کلیک از کلاینت — با آمار روزانه
    if (seg[1] && seg[2] === "track" && method === "POST") {
      const id = Number(seg[1]);
      const type = str(body.type, 10);
      const day = new Date().toISOString().slice(0, 10);
      if (type === "impression") {
        (await run("UPDATE ads SET impressions = impressions + 1 WHERE id = ?", [id]));
        (await run("INSERT INTO ad_stats_daily (ad_id, day, impressions, clicks) VALUES (?, ?, 1, 0) ON CONFLICT(ad_id, day) DO UPDATE SET impressions = impressions + 1", [id, day]));
      } else if (type === "click") {
        (await run("UPDATE ads SET clicks = clicks + 1 WHERE id = ?", [id]));
        (await run("INSERT INTO ad_stats_daily (ad_id, day, impressions, clicks) VALUES (?, ?, 0, 1) ON CONFLICT(ad_id, day) DO UPDATE SET clicks = clicks + 1", [id, day]));
      } else return fail("BAD_INPUT", "نوع ثبت نامعتبر است");
      return ok({ tracked: true });
    }

    // عملیات گروهی: فعال‌سازی/غیرفعال‌سازی/حذف چند کمپین
    if (path === "ads/bulk" && method === "POST") {
      const guard = requireRole(admin, "operator");
      if (guard) return guard;
      const action = str(body.action, 20);
      const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
      if (!ids.length) return fail("BAD_INPUT", "حداقل یک کمپین انتخاب کنید");
      if (!["activate", "deactivate", "delete"].includes(action)) return fail("BAD_INPUT", "عملیات نامعتبر است");
      let n = 0;
      for (const id of ids) {
        if (action === "delete") {
          (await run("DELETE FROM ad_stats_daily WHERE ad_id = ?", [id]));
          (await run("DELETE FROM ads WHERE id = ?", [id]));
        } else {
          (await run("UPDATE ads SET is_active = ?, updated_at = ? WHERE id = ?", [action === "activate" ? 1 : 0, now(), id]));
        }
        n++;
      }
      changeLog("ad", null, action === "delete" ? "bulk_delete" : "bulk_update", admin.display_name, `${n} کمپین`);
      audit(admin.id, admin.display_name, `ad_bulk_${action}`, `${n} کمپین`, ip);
      return ok({ affected: n });
    }

    // آمار تحلیلی روزانه برای نمودارها
    if (path === "ads/stats" && method === "GET") {
      const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 14, 1), 90);
      const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
      const daily = (await q("SELECT day, SUM(impressions) AS impressions, SUM(clicks) AS clicks FROM ad_stats_daily WHERE day >= ? GROUP BY day ORDER BY day", [since]));
      const perAd = (await q(`SELECT a.id, a.title, a.placement, a.is_active, a.impressions, a.clicks,
                  CASE WHEN a.impressions > 0 THEN ROUND(a.clicks * 100.0 / a.impressions, 2) ELSE 0 END AS ctr
           FROM ads a ORDER BY ctr DESC, a.impressions DESC`, []));
      const totals = (await q1("SELECT COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(clicks),0) AS clicks FROM ad_stats_daily WHERE day >= ?", [since])) as any;
      return ok({ days, daily, per_ad: perAd, totals });
    }

    if (method === "GET") {
      return ok((await q("SELECT * FROM ads ORDER BY priority DESC, id DESC", [])));
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;

    // تکثیر کمپین
    if (seg[1] && seg[2] === "duplicate" && method === "POST") {
      const cur = (await q1("SELECT * FROM ads WHERE id = ?", [Number(seg[1])])) as any;
      if (!cur) return fail("NOT_FOUND", "تبلیغ یافت نشد", 404);
      const r = (await run("INSERT INTO ads (title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, priority, starts_at, ends_at, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?)", [`${cur.title} (کپی)`, cur.subtitle, cur.badge, cur.cta_text, cur.advertiser, cur.image_url, cur.link_url, cur.placement, cur.priority, cur.starts_at, cur.ends_at, now()]));
      changeLog("ad", Number(r.lastInsertRowid), "create", admin.display_name, `${cur.title} (کپی)`);
      audit(admin.id, admin.display_name, "ad_create", `تکثیر ${cur.title}`, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }

    // بازنشانی آمار کمپین
    if (seg[1] && seg[2] === "reset-stats" && method === "POST") {
      const id = Number(seg[1]);
      const cur = (await q1("SELECT id FROM ads WHERE id = ?", [id]));
      if (!cur) return fail("NOT_FOUND", "تبلیغ یافت نشد", 404);
      (await run("UPDATE ads SET impressions = 0, clicks = 0 WHERE id = ?", [id]));
      (await run("DELETE FROM ad_stats_daily WHERE ad_id = ?", [id]));
      changeLog("ad", id, "update", admin.display_name, "بازنشانی آمار");
      audit(admin.id, admin.display_name, "ad_reset_stats", `#${id}`, ip);
      return ok({ reset: true });
    }

    if (method === "POST") {
      const title = str(body.title, 120);
      if (!title) return fail("BAD_INPUT", "عنوان تبلیغ الزامی است");
      if (body.starts_at && body.ends_at && new Date(body.starts_at) > new Date(body.ends_at))
        return fail("BAD_INPUT", "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد");
      const r = (await run("INSERT INTO ads (title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, priority, starts_at, ends_at, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [title, str(body.subtitle, 200) || null, str(body.badge, 30) || null, str(body.cta_text, 40) || null, str(body.advertiser, 80) || null, str(body.image_url, 500) || null, str(body.link_url, 500) || null, AD_PLACEMENTS.includes(body.placement) ? body.placement : "home", Math.min(Math.max(Number(body.priority) || 0, 0), 100), str(body.starts_at, 30) || null, str(body.ends_at, 30) || null, body.is_active ? 1 : 0, now()]));
      changeLog("ad", Number(r.lastInsertRowid), "create", admin.display_name, title);
      audit(admin.id, admin.display_name, "ad_create", title, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "تبلیغ یافت نشد", 404);
    if (method === "PUT") {
      const cur = (await q1("SELECT * FROM ads WHERE id = ?", [id])) as any;
      if (!cur) return fail("NOT_FOUND", "تبلیغ یافت نشد", 404);
      const next = {
        ...cur,
        ...body,
        title: body.title !== undefined ? str(body.title, 120) || cur.title : cur.title,
      };
      if (next.starts_at && next.ends_at && new Date(next.starts_at) > new Date(next.ends_at))
        return fail("BAD_INPUT", "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد");
      (await run("UPDATE ads SET title=?, subtitle=?, badge=?, cta_text=?, advertiser=?, image_url=?, link_url=?, placement=?, priority=?, starts_at=?, ends_at=?, is_active=?, updated_at=? WHERE id=?", [next.title, str(next.subtitle, 200) || null, str(next.badge, 30) || null, str(next.cta_text, 40) || null, str(next.advertiser, 80) || null, next.image_url, next.link_url, AD_PLACEMENTS.includes(next.placement) ? next.placement : "home", Math.min(Math.max(Number(next.priority) || 0, 0), 100), next.starts_at, next.ends_at, next.is_active ? 1 : 0, now(), id]));
      changeLog("ad", id, "update", admin.display_name, next.title);
      audit(admin.id, admin.display_name, "ad_update", next.title, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      (await run("DELETE FROM ad_stats_daily WHERE ad_id = ?", [id]));
      (await run("DELETE FROM ads WHERE id = ?", [id]));
      changeLog("ad", id, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "ad_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- voice lexicon ---------- */
  if (seg[0] === "voice-lexicon") {
    if (method === "GET") {
      const search = str(url.searchParams.get("q") ?? "", 60);
      const rows = search
        ? (await q("SELECT * FROM voice_lexicon WHERE spoken LIKE ? OR written LIKE ? ORDER BY priority DESC, id DESC", [`%${search}%`, `%${search}%`]))
        : (await q("SELECT * FROM voice_lexicon ORDER BY priority DESC, id DESC", []));
      return ok(rows);
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    // درون‌ریزی خودکار نام ایستگاه‌ها به فرهنگ تلفظ
    if (path === "voice-lexicon/import-stations" && method === "POST") {
      const stations = (await q("SELECT DISTINCT name FROM stations WHERE is_active = 1 ORDER BY name", [])) as any[];
      const exists = new Set(
        ((await q("SELECT spoken FROM voice_lexicon", [])) as any[]).map((r) => r.spoken)
      );
      let added = 0;
      for (const s of stations) {
        if (exists.has(s.name)) continue;
        await run("INSERT INTO voice_lexicon (spoken, written, priority) VALUES (?,?,?)", [s.name, s.name, 5]);
        added++;
      }
      changeLog("voice_lexicon", null, "bulk_create", admin.display_name, `${added} ایستگاه وارد شد`);
      audit(admin.id, admin.display_name, "lexicon_import", `${added} ایستگاه`, ip);
      return ok({ added, total_stations: stations.length });
    }
    if (method === "POST") {
      const spoken = str(body.spoken, 120);
      const written = str(body.written, 120);
      if (!spoken || !written) return fail("BAD_INPUT", "هر دو مقدار گفتاری و نوشتاری الزامی است");
      const r = (await run("INSERT INTO voice_lexicon (spoken, written, priority) VALUES (?,?,?)", [spoken, written, Number(body.priority) || 0]));
      changeLog("voice_lexicon", Number(r.lastInsertRowid), "create", admin.display_name, `${spoken} → ${written}`);
      audit(admin.id, admin.display_name, "lexicon_create", spoken, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "مدخل یافت نشد", 404);
    if (method === "PUT") {
      const cur = (await q1("SELECT * FROM voice_lexicon WHERE id = ?", [id])) as any;
      if (!cur) return fail("NOT_FOUND", "مدخل یافت نشد", 404);
      const next = { ...cur, ...body };
      (await run("UPDATE voice_lexicon SET spoken=?, written=?, priority=? WHERE id=?", [str(next.spoken, 120) || cur.spoken, str(next.written, 120) || cur.written, Number(next.priority) || 0, id]));
      changeLog("voice_lexicon", id, "update", admin.display_name, next.spoken);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      (await run("DELETE FROM voice_lexicon WHERE id = ?", [id]));
      changeLog("voice_lexicon", id, "delete", admin.display_name);
      return ok({ deleted: true });
    }
  }

  /* ---------- travel modes (کارت‌های «مقایسه مدهای سفر شهری» صفحه خانه اپ — JSON در settings) ---------- */
  if (path === "travel-modes") {
    /* دو کارت پیش‌فرض با داده واقعی موتور مسیریابی — همیشه موجود، غیرقابل حذف */
    const REAL_MODES = [
      { id: "metro", label: "مترو", icon: "directions_subway", status: "active", enabled: true, link: "", kind: "real" },
      { id: "combo", label: "ترکیبی", icon: "alt_route", status: "active", enabled: true, link: "", kind: "real" },
    ];
    const DEFAULT_TRAVEL_MODES = [
      ...REAL_MODES,
      { id: "bus", label: "اتوبوس", icon: "directions_bus", status: "soon", enabled: true, link: "", kind: "extra" },
      { id: "brt", label: "تندرو BRT", icon: "directions_bus", status: "soon", enabled: true, link: "", kind: "extra" },
      { id: "taxi", label: "تاکسی", icon: "local_taxi", status: "soon", enabled: true, link: "", kind: "extra" },
      { id: "car", label: "خودرو", icon: "directions_car", status: "soon", enabled: true, link: "", kind: "extra" },
    ];

    /** نرمال‌سازی لیست ذخیره‌شده: مترو/ترکیبی همیشه هستند و kind درست می‌شود */
    const normalizeModes = (arr: any[]): any[] => {
      const clean: any[] = [];
      const seen = new Set<string>();
      for (const m of arr) {
        const label = str(m?.label, 30).trim() || (m?.id === "metro" ? "مترو" : m?.id === "combo" ? "ترکیبی" : "");
        if (!label) continue;
        let id = str(m?.id, 24).trim() || `mode-${clean.length + 1}`;
        if (seen.has(id)) continue;
        seen.add(id);
        clean.push({
          id,
          label,
          icon: str(m?.icon, 40).trim() || "commute",
          status: m?.status === "active" ? "active" : "soon",
          enabled: m?.enabled === false ? false : true,
          link: str(m?.link, 300).trim(),
          kind: id === "metro" || id === "combo" ? "real" : "extra",
        });
      }
      /* مترو و ترکیبی نباید حذف شوند — اگر نبودند به اول لیست برگردانده می‌شوند */
      for (const real of [...REAL_MODES].reverse()) {
        if (!seen.has(real.id)) clean.unshift({ ...real });
      }
      return clean;
    };

    const getColumns = async (): Promise<number> => {
      const raw = ((await q1("SELECT value FROM settings WHERE key = 'travel_modes_columns'", [])) as any)?.value;
      const n = Number(raw);
      return n === 2 || n === 4 ? n : 3;
    };

    if (method === "GET") {
      const raw = ((await q1("SELECT value FROM settings WHERE key = 'travel_modes'", [])) as any)?.value;
      let modes = DEFAULT_TRAVEL_MODES;
      try {
        const arr = JSON.parse(String(raw ?? ""));
        if (Array.isArray(arr) && arr.length > 0) modes = normalizeModes(arr);
      } catch {
        /* مقدار ذخیره‌شده خراب است — پیش‌فرض */
      }
      return ok({ modes, columns: await getColumns() });
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (method === "PUT") {
      const list = body?.modes;
      if (!Array.isArray(list)) return fail("BAD_INPUT", "لیست مدهای سفر نامعتبر است");
      if (list.length > 14) return fail("BAD_INPUT", "حداکثر ۱۴ کارت مجاز است");
      const modes = normalizeModes(list);
      if (modes.length < 2) return fail("BAD_INPUT", "حداقل دو کارت لازم است");
      const columns = [2, 3, 4].includes(Number(body?.columns)) ? Number(body.columns) : 3;
      (await run("INSERT INTO settings (key, value, updated_at) VALUES ('travel_modes', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [JSON.stringify(modes), now()]));
      (await run("INSERT INTO settings (key, value, updated_at) VALUES ('travel_modes_columns', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [String(columns), now()]));
      changeLog("settings", null, "update", admin.display_name, `travel_modes — ${modes.length} کارت، ${columns} ستون`);
      audit(admin.id, admin.display_name, "travel_modes_update", `${modes.length} کارت — ${columns} ستون`, ip);
      return ok({ updated: true, modes, columns });
    }
  }

  /* ---------- about-page: محتوای کامل صفحه «درباره ما» اپ ---------- */
  if (path === "about-page") {
    const DEFAULT_ABOUT = {
      title: "درباره ما",
      subtitle: "معرفی سامانه هوشمند حمل‌ونقل",
      app_name: "درمسیر / درمسیر",
      description:
        "درمسیر سامانه هوشمند حمل‌ونقل ریلی است؛ ناوبری کامل مترو، نقشه تعاملی شبکه، وضعیت لحظه‌ای خطوط، مسیریابی و دستیار صوتی کامل فارسی — بدون نیاز به هیچ کلید یا سرویس خارجی.",
      rows: [
        { id: "status", label: "وضعیت سرویس", value: "آنلاین", link: "", live: true, enabled: true },
        { id: "site", label: "وب‌سایت", value: "metrojo.ir", link: "https://metrojo.ir", live: false, enabled: true },
      ],
      footer_note: "طراحی شده برای ناوبری سریع مسافران کلان‌شهرها",
      footer_copy: "تمامی حقوق برای سامانه درمسیر محفوظ است © ۱۴۰۳",
    };
    const cleanAbout = (raw: any) => {
      const text = (v: unknown, max: number, fb = "") => {
        const s = str(typeof v === "string" ? v : "", max).trim();
        return s || fb;
      };
      const rowsIn = Array.isArray(raw?.rows) ? raw.rows : DEFAULT_ABOUT.rows;
      const rows: any[] = [];
      for (const r of rowsIn.slice(0, 8)) {
        const label = str(r?.label, 40).trim();
        const value = str(r?.value, 60).trim();
        if (!label || !value) continue;
        rows.push({
          id: str(r?.id, 24).trim() || `row-${rows.length + 1}`,
          label,
          value,
          link: str(r?.link, 300).trim(),
          live: r?.live === true,
          enabled: r?.enabled !== false,
        });
      }
      return {
        title: text(raw?.title, 40, DEFAULT_ABOUT.title),
        subtitle: text(raw?.subtitle, 60, DEFAULT_ABOUT.subtitle),
        app_name: text(raw?.app_name, 60, DEFAULT_ABOUT.app_name),
        description: text(raw?.description, 600, DEFAULT_ABOUT.description),
        rows,
        footer_note: text(raw?.footer_note, 120, DEFAULT_ABOUT.footer_note),
        footer_copy: text(raw?.footer_copy, 120, DEFAULT_ABOUT.footer_copy),
      };
    };
    if (method === "GET") {
      const raw = ((await q1("SELECT value FROM settings WHERE key = 'about_page'", [])) as any)?.value;
      let content = DEFAULT_ABOUT;
      try {
        const parsed = JSON.parse(String(raw ?? ""));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) content = { ...DEFAULT_ABOUT, ...cleanAbout(parsed) };
      } catch {
        /* مقدار ذخیره‌شده خراب یا خالی — پیش‌فرض */
      }
      return ok({ content });
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (method === "PUT") {
      const content = cleanAbout(body?.content);
      (await run("INSERT INTO settings (key, value, updated_at) VALUES ('about_page', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [JSON.stringify(content), now()]));
      changeLog("settings", null, "update", admin.display_name, "about_page — محتوای صفحه درباره ما");
      audit(admin.id, admin.display_name, "about_page_update", "محتوای صفحه درباره ما اپ", ip);
      return ok({ updated: true, content });
    }
  }

  /* ---------- contact-page: بخش‌های صفحه «تماس با ما» اپ ---------- */
  if (path === "contact-page") {
    const DEFAULT_CONTACT = {
      title: "تماس با ما",
      subtitle: "ارتباط با تیم پشتیبانی درمسیر",
      methods_title: "راه‌های ارتباطی",
      methods: [
        { id: "phone", icon: "support_agent", title: "تماس با پشتیبانی ۲۴ ساعته", value: "۰۲۱-۹۱۰۰۰۰۰۰", type: "tel", link: "02191000000", enabled: true },
        { id: "site", icon: "language", title: "وب‌سایت و ایمیل پشتیبانی", value: "info@metrojo.ir | metrojo.ir", type: "url", link: "https://metrojo.ir", enabled: true },
        { id: "ads", icon: "campaign", title: "درخواست تبلیغات در برنامه", value: "", type: "mailto", link: "info@metrojo.ir", enabled: true },
        { id: "apps", icon: "apps", title: "سایر محصولات شهری ما", value: "", type: "toast", link: "", enabled: true },
      ],
      ticket_enabled: true,
      ticket_title: "ثبت تیکت پشتیبانی",
      success_message: "تیکت شما با موفقیت ثبت شد — پاسخ در بخش «تیکت‌های من» همین صفحه اعلام می‌شود.",
    };
    const TYPES = new Set(["tel", "url", "mailto", "toast"]);
    const cleanContact = (raw: any) => {
      const text = (v: unknown, max: number, fb = "") => {
        const s = str(typeof v === "string" ? v : "", max).trim();
        return s || fb;
      };
      const methodsIn = Array.isArray(raw?.methods) ? raw.methods : DEFAULT_CONTACT.methods;
      const methods: any[] = [];
      for (const m of methodsIn.slice(0, 10)) {
        const title = str(m?.title, 60).trim();
        if (!title) continue;
        methods.push({
          id: str(m?.id, 24).trim() || `method-${methods.length + 1}`,
          icon: str(m?.icon, 40).trim() || "support_agent",
          title,
          value: str(m?.value, 100).trim(),
          type: TYPES.has(m?.type) ? m.type : "url",
          link: str(m?.link, 300).trim(),
          enabled: m?.enabled !== false,
        });
      }
      return {
        title: text(raw?.title, 40, DEFAULT_CONTACT.title),
        subtitle: text(raw?.subtitle, 60, DEFAULT_CONTACT.subtitle),
        methods_title: text(raw?.methods_title, 40, DEFAULT_CONTACT.methods_title),
        methods,
        ticket_enabled: raw?.ticket_enabled !== false,
        ticket_title: text(raw?.ticket_title, 40, DEFAULT_CONTACT.ticket_title),
        success_message: text(raw?.success_message, 200, DEFAULT_CONTACT.success_message),
      };
    };
    if (method === "GET") {
      const raw = ((await q1("SELECT value FROM settings WHERE key = 'contact_page'", [])) as any)?.value;
      let content = DEFAULT_CONTACT;
      try {
        const parsed = JSON.parse(String(raw ?? ""));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) content = { ...DEFAULT_CONTACT, ...cleanContact(parsed) };
      } catch {
        /* مقدار ذخیره‌شده خراب یا خالی — پیش‌فرض */
      }
      return ok({ content });
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (method === "PUT") {
      const content = cleanContact(body?.content);
      (await run("INSERT INTO settings (key, value, updated_at) VALUES ('contact_page', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [JSON.stringify(content), now()]));
      changeLog("settings", null, "update", admin.display_name, "contact_page — بخش‌های صفحه تماس با ما");
      audit(admin.id, admin.display_name, "contact_page_update", "بخش‌های صفحه تماس با ما اپ", ip);
      return ok({ updated: true, content });
    }
  }

  /* ---------- tickets: مدیریت تیکت‌های پشتیبانی کاربران اپ ---------- */
  if (path === "tickets" && method === "GET") {
    const status = url.searchParams.get("status") || "";
    const search = str(url.searchParams.get("q") || "", 60).trim();

    /* آینه تیکت‌های ابری (وب + اپ اندروید — D1) داخل پنل؛ تیکت تکراری درج نمی‌شود */
    try {
      const cloud = await appAdminCall("/api/admin/tickets");
      const rowsC: any[] = Array.isArray(cloud.data) ? cloud.data : [];
      const hasCloudId = ((await q("PRAGMA table_info(tickets)", [])) as any[]).some((c) => c.name === "cloud_id");
      if (hasCloudId) {
        for (const t of rowsC.slice(0, 300)) {
          try {
            await run(
              `INSERT INTO tickets (name, contact, category, subject, message, status, reply, replied_at, created_at, cloud_id, cloud_status)
               SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
               WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE cloud_id = ?)`,
              [t.name || "کاربر درمسیر",
              t.contact || "",
              ["general", "bug", "idea", "ad"].includes(t.category) ? t.category : "general",
              t.subject || "بدون موضوع",
              t.message || "",
              ["open", "answered", "closed"].includes(t.status) ? t.status : "open",
              t.reply ?? null,
              t.replied_at ?? null,
              t.created_at ?? now(),
              String(t.id),
              ["open", "answered", "closed"].includes(t.status) ? t.status : "open",
              String(t.id)
            ]);
          } catch {
            /* ردیف تکراری یا نامعتبر — رد می‌شود */
          }
        }
        /* همگام نگه‌داشتن وضعیت/پاسخ ردیف‌های ابری موجود (مثلاً پاسخ از نسخه دیگر) */
        for (const t of rowsC.slice(0, 300)) {
          try {
            await run(
              `UPDATE tickets SET status = ?, reply = ?, replied_at = ? WHERE cloud_id = ? AND (status != ? OR IFNULL(reply,'') != IFNULL(?,''))`,
              [["open", "answered", "closed"].includes(t.status) ? t.status : "open",
              t.reply ?? null,
              t.replied_at ?? null,
              String(t.id),
              ["open", "answered", "closed"].includes(t.status) ? t.status : "open",
              t.reply ?? null
            ]);
          } catch {
            /* بی‌صدا */
          }
        }
      }
    } catch {
      /* اپ در دسترس نیست — فقط تیکت‌های محلی نمایش داده می‌شود */
    }

    /* آینه دوم: تیکت‌های مستقیم اپ اندروید از ورکر ابری (Turso) — این‌ها در سرور اپ نیستند */
    try {
      const cloudUrl = String(((await q1("SELECT value FROM settings WHERE key = 'cloud_api_url'", [])) as any)?.value ?? "")
        .trim()
        .replace(/\/+$/, "");
      const syncKey =
        String(((await q1("SELECT value FROM settings WHERE key = 'cloud_sync_key'", [])) as any)?.value ?? "").trim() ||
        "darmasir-sync-1404";
      if (cloudUrl) {
        const res = await fetch(`${cloudUrl}/api/v1/public/tickets/list`, {
          headers: { "X-Sync-Key": syncKey },
          signal: AbortSignal.timeout(8000),
        });
        const j: any = await res.json().catch(() => null);
        const rowsW: any[] = j?.ok && Array.isArray(j?.data?.tickets) ? j.data.tickets : [];
        const hasCloudId = ((await q("PRAGMA table_info(tickets)", [])) as any[]).some((c) => c.name === "cloud_id");
        if (hasCloudId) {
          for (const t of rowsW.slice(0, 300)) {
            try {
              await run(
                `INSERT INTO tickets (name, contact, category, subject, message, status, reply, replied_at, created_at, cloud_id, cloud_status)
                 SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                 WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE cloud_id = ?)`,
                [t.name || "کاربر درمسیر",
                t.contact || "",
                ["general", "bug", "idea", "ad"].includes(t.category) ? t.category : "general",
                t.subject || "بدون موضوع",
                t.message || "",
                ["open", "answered", "closed"].includes(t.status) ? t.status : "open",
                t.reply ?? null,
                t.repliedAt ? new Date(Number(t.repliedAt)).toISOString() : null,
                t.createdAt ? new Date(Number(t.createdAt)).toISOString() : now(),
                String(t.id),
                ["open", "answered", "closed"].includes(t.status) ? t.status : "open",
                String(t.id)
              ]);
              /* پاسخ/وضعیت تازه از ابر — اگر مدیر از جای دیگری پاسخ داده باشد */
              await run(
                `UPDATE tickets SET status = ?, reply = ?, replied_at = ? WHERE cloud_id = ? AND (status != ? OR IFNULL(reply,'') != IFNULL(?,''))`,
                [["open", "answered", "closed"].includes(t.status) ? t.status : "open",
                t.reply ?? null,
                t.repliedAt ? new Date(Number(t.repliedAt)).toISOString() : null,
                String(t.id),
                ["open", "answered", "closed"].includes(t.status) ? t.status : "open",
                t.reply ?? null
              ]);
            } catch {
              /* ردیف تکراری یا نامعتبر — رد می‌شود */
            }
          }
        }
      }
    } catch {
      /* ورکر در دسترس نیست — فقط تیکت‌های محلی/اپ */
    }

    let rows = (await q(`SELECT id, name, contact, category, subject, message, status, reply, replied_at AS repliedAt, created_at AS createdAt, cloud_id AS cloudId
         FROM tickets ORDER BY COALESCE(cloud_id, '') ASC, id DESC LIMIT 300`, [])) as any[];
    if (["open", "answered", "closed"].includes(status)) rows = rows.filter((r) => r.status === status);
    if (search) rows = rows.filter((r) => (r.subject + " " + r.name + " " + r.contact + " " + r.message).includes(search));
    const counts = {
      all: ((await q1("SELECT COUNT(*) AS c FROM tickets", [])) as any).c,
      open: ((await q1("SELECT COUNT(*) AS c FROM tickets WHERE status = 'open'", [])) as any).c,
      answered: ((await q1("SELECT COUNT(*) AS c FROM tickets WHERE status = 'answered'", [])) as any).c,
      closed: ((await q1("SELECT COUNT(*) AS c FROM tickets WHERE status = 'closed'", [])) as any).c,
    };
    return ok({ tickets: rows, counts, smtp: await smtpConfigured() });
  }

  if (seg[0] === "tickets" && seg[2] === "reply" && method === "POST") {
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    const id = Number(seg[1]);
    const row = (await q1("SELECT * FROM tickets WHERE id = ?", [id])) as any;
    if (!row) return fail("NOT_FOUND", "تیکت یافت نشد", 404);
    const reply = str(body?.reply, 4000).trim();
    const status = ["open", "answered", "closed"].includes(body?.status) ? body.status : reply ? "answered" : row.status;
    if (!reply && status === "answered") return fail("BAD_INPUT", "متن پاسخ برای وضعیت «پاسخ داده شده» الزامی است");
    (await run("UPDATE tickets SET reply = ?, status = ?, replied_at = ? WHERE id = ?", [reply || row.reply, status, reply ? now() : row.replied_at, id]));
    let emailedUser = false;
    if (reply) {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.contact);
      if (isEmail) {
        const r = await sendMail(
          row.contact,
          `پاسخ به تیکت #${row.id} — ${row.subject}`,
          mailTemplate(
            `پاسخ به تیکت #${row.id}`,
            `<p><b>موضوع تیکت:</b> ${row.subject}</p>
             <p><b>متن پیام شما:</b></p><div style="background:#f6f8f7;border-radius:10px;padding:12px;white-space:pre-wrap">${row.message}</div>
             <p><b>پاسخ پشتیبانی درمسیر:</b></p><div style="background:#eef7f3;border-radius:10px;padding:12px;white-space:pre-wrap">${reply}</div>
             <p style="color:#6b7a73">پاسخ کامل در اپ درمسیر ← تماس با ما ← «تیکت‌های من» قابل مشاهده است.</p>`
          )
        );
        emailedUser = r.sent;
      }
    }
    changeLog("tickets", id, reply ? "reply" : "status", admin.display_name, `وضعیت: ${status}`);
    audit(admin.id, admin.display_name, "ticket_reply", `تیکت #${id} — وضعیت ${status}${emailedUser ? " + ایمیل" : ""}`, ip);
    /* انتشار پاسخ به دیتابیس ابری — تا کاربر اپ اندروید پاسخ را در «تیکت‌های من» ببیند */
    if (row.cloud_id) {
      appAdminCall("/api/admin/tickets/reply", {
        method: "POST",
        body: JSON.stringify({ id: row.cloud_id, reply: reply || undefined, status }),
      }).catch(() => {
        /* اپ در دسترس نیست — پاسخ محلی می‌ماند و در همگام‌سازی بعدی می‌رود */
      });

      /* انتشار موازی به ورکر ابری (Turso) — تیکت‌های مستقیم اپ اندروید اینجا زندگی می‌کنند؛
         بدون این، پاسخ مدیر هرگز به «تیکت‌های من» اپ نمی‌رسد */
      try {
        const cloudUrl = String(((await q1("SELECT value FROM settings WHERE key = 'cloud_api_url'", [])) as any)?.value ?? "")
          .trim()
          .replace(/\/+$/, "");
        const syncKey =
          String(((await q1("SELECT value FROM settings WHERE key = 'cloud_sync_key'", [])) as any)?.value ?? "").trim() ||
          "darmasir-sync-1404";
        if (cloudUrl) {
          fetch(`${cloudUrl}/api/v1/public/tickets/reply`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Sync-Key": syncKey },
            body: JSON.stringify({ id: String(row.cloud_id), reply: reply || undefined, status }),
            signal: AbortSignal.timeout(8000),
          }).catch(() => {
            /* ورکر در دسترس نیست — در همگام‌سازی بعدی تلاش می‌شود */
          });
        }
      } catch {
        /* بی‌صدا */
      }
    }
    return ok({ updated: true, status, emailedUser });
  }

  if (seg[0] === "tickets" && seg[2] === "status" && method === "POST") {
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    const id = Number(seg[1]);
    const row = (await q1("SELECT id FROM tickets WHERE id = ?", [id])) as any;
    if (!row) return fail("NOT_FOUND", "تیکت یافت نشد", 404);
    if (!["open", "answered", "closed"].includes(body?.status)) return fail("BAD_INPUT", "وضعیت نامعتبر است");
    (await run("UPDATE tickets SET status = ? WHERE id = ?", [body.status, id]));
    changeLog("tickets", id, "status", admin.display_name, `تغییر وضعیت به ${body.status}`);
    audit(admin.id, admin.display_name, "ticket_status", `تیکت #${id} → ${body.status}`, ip);
    /* انتشار وضعیت به دیتابیس ابری برای تیکت‌های همگام‌شده */
    const crow = (await q1("SELECT cloud_id FROM tickets WHERE id = ?", [id])) as any;
    if (crow?.cloud_id) {
      appAdminCall("/api/admin/tickets/reply", {
        method: "POST",
        body: JSON.stringify({ id: crow.cloud_id, status: body.status }),
      }).catch(() => {});
    }
    return ok({ updated: true, status: body.status });
  }

  /* ---------- settings ---------- */
  if (path === "settings") {
    if (method === "GET") {
      const rows = (await q("SELECT key, value, updated_at FROM settings", []));
      return ok(Object.fromEntries(rows.map((r: any) => [r.key, r])));
    }
    const guard = requireRole(admin, "super");
    if (guard) return guard;
    if (method === "PUT") {
      const allowed = [
        "app_name",
        "app_version",
        "app_subtitle",
        "welcome_message",
        "maintenance_mode",
        "voice_enabled",
        "voice_service",
        "support_message",
        "support_phone",
        "ads_rotation_seconds",
        "max_ads_per_placement",
        "ads_enabled",
        "force_update_version",
        "store_link",
        "default_city",
        "cloud_api_url",
        "cloud_sync_key",
        "app_server_url", // نشانی عمومی سرور اپ — مقصد دوم همگام‌سازی اپ اندروید
        /* ایمیل (SMTP) — اطلاع تیکت به مدیر + پاسخ ایمیلی به کاربر */
        "smtp_host",
        "smtp_port",
        "smtp_user",
        "smtp_pass",
        "smtp_from",
        "admin_email",
      ];
      let changed = 0;
      for (const [k, v] of Object.entries(body)) {
        if (!allowed.includes(k)) continue;
        (await run("INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [k, String(v).slice(0, 300), now()]));
        changed++;
      }
      if (!changed) return fail("BAD_INPUT", "هیچ کلید مجازی ارسال نشده است");
      audit(admin.id, admin.display_name, "settings_update", JSON.stringify(Object.keys(body)), ip);
      return ok({ updated: changed });
    }
  }

  /* ---------- cloud (سرور ابری Cloudflare Workers + D1) ---------- */
  if (seg[0] === "cloud") {
    const getSetting = async (k: string) =>
      (((await q1("SELECT value FROM settings WHERE key = ?", [k])) as any)?.value ?? "").trim();
    const cloudUrl = (await getSetting("cloud_api_url")).replace(/\/+$/, "");
    const syncKey = (await getSetting("cloud_sync_key")) || "darmasir-sync-1404";

    if (seg[1] === "status" && method === "GET") {
      if (!cloudUrl) return ok({ configured: false });
      try {
        const r = await fetch(`${cloudUrl}/api/v1/health`, { signal: AbortSignal.timeout(5000) });
        const j = await r.json().catch(() => null);
        return ok({ configured: true, reachable: r.ok, status: r.status, info: (j as any)?.data ?? null });
      } catch {
        return ok({ configured: true, reachable: false });
      }
    }

    if (seg[1] === "sync" && method === "POST") {
      const guard = requireRole(admin, "operator");
      if (guard) return guard;
      if (!cloudUrl) return fail("NOT_CONFIGURED", "ابتدا آدرس سرور ابری را در تنظیمات ذخیره کنید");
      const cities = (await q("SELECT id, name, is_active, sort FROM cities ORDER BY sort, id", []));
      const lines = (await q("SELECT id, city_id, mode, number, name, color, terminals, direction, is_active, sort FROM lines ORDER BY sort, id", []));
      const stations = (await q("SELECT id, line_id, name, lat, lng, city_id, order_index, is_active FROM stations ORDER BY line_id, order_index", []));
      const ads = adsMasterOff()
        ? []
        : (await q("SELECT id, title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, starts_at, ends_at, is_active, priority FROM ads", []));
      const settingRows = (await q("SELECT key, value FROM settings WHERE key NOT LIKE 'cloud_%'", [])) as any[];
      const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
      const lexicon = (await q("SELECT spoken, written, priority FROM voice_lexicon", []));
      const started = Date.now();
      try {
        const r = await fetch(`${cloudUrl}/api/v1/public/content/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Sync-Key": syncKey },
          body: JSON.stringify({ cities, lines, stations, ads, settings, lexicon }),
          signal: AbortSignal.timeout(60000),
        });
        const j = await r.json().catch(() => null);
        const ms = Date.now() - started;
        if (r.ok && (j as any)?.ok) {
          audit(admin.id, admin.display_name, "cloud_sync", `همگام‌سازی محتوا با سرور ابری (${ms}ms)`, ip);
          changeLog("cloud", null, "sync", admin.display_name, JSON.stringify((j as any)?.data?.synced ?? {}));
          return ok({ pushed: (j as any)?.data?.synced ?? null, elapsedMs: ms });
        }
        return fail("CLOUD_ERROR", `سرور ابری پاسخ ناموفق داد (${r.status})`, 502);
      } catch {
        return fail("CLOUD_UNREACHABLE", "سرور ابری در دسترس نیست — آدرس و اتصال را بررسی کنید", 502);
      }
    }
  }

  /* ---------- reports ---------- */
  if (path === "reports" && method === "GET") {
    const range = Math.min(Math.max(Number(url.searchParams.get("days")) || 14, 7), 90);
    const since = new Date(Date.now() - (range - 1) * 86400000).toISOString().slice(0, 10);
    const stats = (await q("SELECT day, count FROM api_stats WHERE day >= ? ORDER BY day DESC LIMIT ?", [since, range]));
    const adsDaily = (await q("SELECT day, SUM(impressions) AS impressions, SUM(clicks) AS clicks FROM ad_stats_daily WHERE day >= ? GROUP BY day ORDER BY day", [since]));
    const adsRanking = (await q(`SELECT id, title, placement, is_active, impressions, clicks,
                CASE WHEN impressions > 0 THEN ROUND(clicks * 100.0 / impressions, 2) ELSE 0 END AS ctr
         FROM ads ORDER BY ctr DESC, impressions DESC`, []));
    const changes = (await q("SELECT entity, action, admin_name, details, created_at FROM change_log ORDER BY id DESC LIMIT 30", []));
    const sessions = ((await q1("SELECT COUNT(*) AS c FROM sessions WHERE expires_at > ?", [now()])) as any).c;
    const usersByStatus = (await q("SELECT status, COUNT(*) AS count FROM app_users GROUP BY status", []));
    const topStations = (await q("SELECT s.name, l.name AS line_name, l.color FROM stations s JOIN lines l ON l.id = s.line_id WHERE s.is_active = 1 LIMIT 8", []));
    const totals = ((await q1("SELECT COALESCE(SUM(impressions),0) AS imp, COALESCE(SUM(clicks),0) AS clk FROM ad_stats_daily WHERE day >= ?", [since])) as any);
    return ok({
      range,
      api_stats: stats,
      ads_daily: adsDaily,
      ads_ranking: adsRanking,
      users_by_status: usersByStatus,
      top_stations: topStations,
      ads_totals: { impressions: totals.imp, clicks: totals.clk },
      changes,
      active_sessions: sessions,
    });
  }

  /* ---------- security (فقط مدیر کل) ---------- */
  if (seg[0] === "security" && method === "GET") {
    const guard = requireRole(admin, "super");
    if (guard) return guard;
    return ok({
      admins: (await q("SELECT id, username, display_name, role, is_active, created_at, last_login FROM admins ORDER BY id", [])),
      sessions: (await q(`SELECT s.token, s.created_at, s.expires_at, s.ip, s.user_agent, a.username, a.display_name
           FROM sessions s JOIN admins a ON a.id = s.admin_id
           WHERE s.expires_at > ? ORDER BY s.created_at DESC`, [now()])),
      audit: (await q("SELECT * FROM audit_log ORDER BY id DESC LIMIT 100", [])),
    });
  }

  /* ---------- ابطال نشست (فقط مدیر کل) ---------- */
  if (seg[0] === "sessions" && seg[1] && method === "DELETE") {
    const guard = requireRole(admin, "super");
    if (guard) return guard;
    const token = seg[1];
    const row = (await q1("SELECT admin_id FROM sessions WHERE token = ?", [token])) as any;
    if (!row) return fail("NOT_FOUND", "نشست یافت نشد", 404);
    if (row.admin_id === admin.id) return fail("FORBIDDEN", "برای خروج از نشست خود از دکمه خروج استفاده کنید", 403);
    (await run("DELETE FROM sessions WHERE token = ?", [token]));
    audit(admin.id, admin.display_name, "session_revoke", "ابطال نشست مدیر", ip);
    return ok({ revoked: true });
  }

  if (seg[0] === "admins") {
    const guard = requireRole(admin, "super");
    if (guard) return guard;
    if (method === "POST") {
      const username = str(body.username, 60);
      const displayName = str(body.display_name, 80);
      const password = typeof body.password === "string" ? body.password : "";
      const role = ["super", "operator", "viewer"].includes(body.role) ? body.role : "viewer";
      if (!username || !displayName || password.length < 8)
        return fail("BAD_INPUT", "نام کاربری، نام نمایشی و گذرواژه (حداقل ۸ کاراکتر) الزامی است");
      try {
        const r = (await run("INSERT INTO admins (username, password_hash, display_name, role, created_at) VALUES (?,?,?,?,?)", [username, hashPassword(password), displayName, role, now()]));
        audit(admin.id, admin.display_name, "admin_create", username, ip);
        return ok({ id: Number(r.lastInsertRowid) }, 201);
      } catch {
        return fail("DUPLICATE", "این نام کاربری قبلاً وجود دارد", 409);
      }
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "مدیر یافت نشد", 404);
    if (method === "PUT") {
      const cur = (await q1("SELECT * FROM admins WHERE id = ?", [id])) as AdminRow | undefined;
      if (!cur) return fail("NOT_FOUND", "مدیر یافت نشد", 404);
      if (typeof body.password === "string" && body.password.length >= 8) {
        (await run("UPDATE admins SET password_hash = ? WHERE id = ?", [hashPassword(body.password), id]));
      }
      if (body.role !== undefined && ["super", "operator", "viewer"].includes(body.role))
        (await run("UPDATE admins SET role = ? WHERE id = ?", [body.role, id]));
      if (body.is_active !== undefined)
        (await run("UPDATE admins SET is_active = ? WHERE id = ?", [body.is_active ? 1 : 0, id]));
      if (body.display_name !== undefined)
        (await run("UPDATE admins SET display_name = ? WHERE id = ?", [str(body.display_name, 80) || cur.display_name, id]));
      audit(admin.id, admin.display_name, "admin_update", cur.username, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      if (id === admin.id) return fail("FORBIDDEN", "حذف حساب خودتان ممکن نیست", 403);
      const remaining = ((await q1("SELECT COUNT(*) AS c FROM admins WHERE is_active = 1", [])) as any).c;
      if (remaining <= 1) return fail("FORBIDDEN", "آخرین مدیر فعال را نمی‌توان حذف کرد", 403);
      (await run("DELETE FROM admins WHERE id = ?", [id]));
      audit(admin.id, admin.display_name, "admin_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  return fail("NOT_FOUND", "مسیر API یافت نشد", 404);
}
