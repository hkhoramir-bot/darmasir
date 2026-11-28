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
import { CLOUD_CONTENT_BASES, CLOUD_CONTENT_TIMEOUT_MS } from "@/lib/cloud-config";

type Json = Record<string, unknown>;

const LS = {
  trips: "metrojo-native-trips",
  daily: "metrojo-native-daily",
  favs: "metrojo-native-favs",
  users: "metrojo-native-users", // حساب‌های آفلاین روی دستگاه
  sessions: "metrojo-native-sessions", // توکن → userId
  otps: "metrojo-native-otps", // کد پیامکی شبیه‌سازی‌شده
  syncQueue: "metrojo-native-sync-queue", // تغییرات ثبت‌نشده در ابر (آفلاین) — همیشه ارسال می‌شود
  userSyncPending: "metrojo-native-user-sync-pending", // حساب‌هایی که ثبت ابری‌شان موقتاً شکست خورده — با اولین اتصال دوباره ارسال می‌شوند
  appServerUrl: "metrojo-app-server-url", // نشانی سرور اپ (تنظیم پنل: app_server_url) — مقصد دوم همگام‌سازی
  deviceId: "metrojo-native-device-id", // شناسه دستگاه برای کاربر بدون حساب
  tickets: "metrojo-native-tickets", // تیکت‌های ثبت‌شده روی دستگاه (پشتیبان آفلاین)
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

/* ------------------- حساب کاربری (حالت آفلاین اندروید) ------------------- */

type NativeUser = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  passwordHash: string | null; // salt:sha256
  createdAt: string;
  lastLoginAt: string | null;
  synced?: boolean; // در دیتابیس ابری ثبت شده (پنل مدیریت می‌بیند و می‌تواند مسدود/حذف کند)
};

function normalizePhoneLocal(raw: string): string | null {
  if (!raw) return null;
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  let s = String(raw).trim();
  s = s.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)));
  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("98") && s.length >= 12) s = "0" + s.slice(2);
  if (/^9\d{9}$/.test(s)) s = "0" + s;
  if (/^09\d{9}$/.test(s)) return s;
  return null;
}

function normalizeEmailLocal(raw: string): string | null {
  if (!raw) return null;
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return null;
  return s;
}

async function sha256Hex(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // WebView بسیار قدیمی — هش ساده جایگزین
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    return `weak${(h >>> 0).toString(16)}`;
  }
}

async function hashPasswordLocal(password: string): Promise<string> {
  const salt = uid().replace(/-/g, "").slice(0, 16);
  return `${salt}:${await sha256Hex(salt + password)}`;
}

async function verifyPasswordLocal(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return (await sha256Hex(salt + password)) === hash;
}

function publicUserLocal(u: NativeUser) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

function bearerToken(headers: Headers): string {
  const auth = headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function authRegister(body: Json): Promise<Response> {
  return (async () => {
    const providedName = String(body?.name ?? "").trim();
    const password = String(body?.password ?? "");
    const phone = body?.phone ? normalizePhoneLocal(String(body.phone)) : null;
    const email = body?.email ? normalizeEmailLocal(String(body.email)) : null;
    /* فرم جدید نام نمی‌گیرد — نام نمایشی خودکار (مطابق قرارداد ورود با کد پیامکی)؛
       نام واقعی فقط از کلاینت‌های قدیمی پذیرفته می‌شود */
    const name =
      providedName.length >= 2 ? providedName : phone ? `کاربر ${phone.slice(-4)}` : "کاربر درمسیر";
    if (password.length < 6) return json({ error: "رمز عبور باید حداقل ۶ کاراکتر باشد" }, 400);
    if (!phone && !email) return json({ error: "شماره موبایل یا ایمیل را وارد کنید" }, 400);

    const users = lsGet<NativeUser[]>(LS.users, []);
    const dupIdx = users.findIndex((u) => (phone && u.phone === phone) || (email && u.email === email));
    /* حسابی با همین شماره/ایمیل روی دستگاه هست:
       ثبت‌نام = ادعای همان حساب (بازیابی) و تنظیم رمز — نه خطای تکراری؛
       بن‌بست کامل «ثبت‌نام کنید ← قبلاً ثبت شده ← رمز ندارم ← از پیامکی استفاده کنید»
       کامل رفع می‌شود. تنها وقتی خطای تکراری داده می‌شود که ابر با قطعیت بگوید
       رمز دیگری برای این حساب تنظیم شده است */
    if (dupIdx >= 0) {
      const ex = users[dupIdx];
      const nowIso0 = new Date().toISOString();
      const openSessionFor = (u: NativeUser, extra: Json = {}): Response => {
        const token = uid() + uid();
        const sessions = lsGet<Record<string, string>>(LS.sessions, {});
        sessions[token] = u.id;
        lsSet(LS.sessions, sessions);
        return json({ token, user: publicUserLocal(u), ...extra });
      };
      /* ۱) رمز واردشده با رمز همین حساب محلی یکی است → ورود مستقیم (بروزرسانی نام) */
      if (ex.passwordHash && (await verifyPasswordLocal(password, ex.passwordHash))) {
        if (providedName.length >= 2 && ex.name !== providedName) ex.name = providedName;
        ex.lastLoginAt = nowIso0;
        lsSet(LS.users, users);
        void syncNow();
        return openSessionFor(ex);
      }
      const ident0 = phone || email || "";
      const cloudOnline = ident0 !== "" && Date.now() - cloudLastSeen < 10 * 60 * 1000;
      if (cloudOnline) {
        const cloud = await cloudLogin(ident0, password);
        if (cloud.ok && cloud.token) {
          /* رمز ابری درست است → همین حساب محلی با مشخصات ابری بازیابی می‌شود */
          ex.passwordHash = await hashPasswordLocal(password);
          ex.name = String(cloud.user?.name ?? "").trim() || ex.name;
          ex.synced = true;
          ex.lastLoginAt = nowIso0;
          lsSet(LS.users, users);
          markSynced(ident0);
          void syncNow();
          return openSessionFor(ex, { reclaimed: true });
        }
        if (cloud.reachable && cloud.code === "BAD_PASSWORD") {
          /* ابر با قطعیت می‌گوید رمز دیگری دارد — ادعای حساب مجاز نیست */
          return json(
            { error: "این شماره/ایمیل قبلاً روی سرور درمسیر ثبت شده است — با رمز خود وارد شوید یا از کد پیامکی استفاده کنید" },
            409
          );
        }
        if (cloud.reachable && cloud.code === "FORBIDDEN") {
          return json({ error: "حساب شما مسدود شده است — با پشتیبانی درمسیر تماس بگیرید" }, 403);
        }
        /* حساب روی ابر بدون رمز است؟ (حساب ساخته‌شده با کد پیامکی)
           نسخه قدیم سرور برای حساب‌های بدون رمز NOT_FOUND می‌دهد — با بررسی مستقل وضعیت جدا می‌شود */
        let noPasswordAccount =
          cloud.reachable && (cloud.code === "NO_PASSWORD" || cloud.code === "USE_APP_OR_OTP");
        if (!noPasswordAccount && cloud.reachable && cloud.code === "NOT_FOUND") {
          const st0 = await cloudUserStatus(ident0);
          noPasswordAccount = st0.reachable && st0.exists;
        }
        if (noPasswordAccount) {
          /* بازیابی همان حساب اصلی و تنظیم رمز روی سرور — نه حساب موازی */
          const claimed = await cloudRegister(name, phone, email, password);
          if (claimed.ok && claimed.token) {
            ex.passwordHash = await hashPasswordLocal(password);
            ex.name = String(claimed.user?.name ?? name).trim() || name;
            ex.synced = true;
            ex.lastLoginAt = nowIso0;
            lsSet(LS.users, users);
            markSynced(ident0);
            void syncNow();
            return openSessionFor(ex, { reclaimed: true });
          }
        }
        /* خطای موقت ابری (DB_ERROR) یا ناموفق بودن ادعا → ادعای محلی ادامه می‌یابد */
      }
      /* ۲) ادعای محلی همین حساب — رمز جدید روی حساب محلی تنظیم می‌شود؛
            اگر حساب در ابر نبود یا همگام نشده بود، با اولین اتصال ثبت/ترمیم می‌شود */
      ex.passwordHash = await hashPasswordLocal(password);
      if (providedName.length >= 2) ex.name = providedName;
      ex.lastLoginAt = nowIso0;
      lsSet(LS.users, users);
      if (ident0 && !ex.synced) enqueueUserSync(ident0, ex.name);
      void syncNow();
      return openSessionFor(ex, { reclaimed: true });
    }
    /* دستگاه جدید — اگر همین شماره/ایمیل قبلاً روی سرور ثبت شده باشد، با رمز واردشده
       ورود ابری امتحان می‌شود تا همان حساب اصلی بازیابی شود (نه ساختن حساب موازی);
       فقط وقتی که اینترنت به‌تازگی در دسترس بوده — آفلاین بدون تأخیر ثبت‌نام می‌کند */
    const ident0 = phone || email || "";
    if (ident0 && Date.now() - cloudLastSeen < 10 * 60 * 1000) {
      const cloud = await cloudLogin(ident0, password);
      if (cloud.ok && cloud.token) {
        const nowIso0 = new Date().toISOString();
        const restored: NativeUser = {
          id: uid(),
          name,
          phone,
          email,
          passwordHash: await hashPasswordLocal(password),
          createdAt: String(cloud.user?.createdAt ?? "") || nowIso0,
          lastLoginAt: nowIso0,
          synced: true,
        };
        users.push(restored);
        lsSet(LS.users, users);
        const token = uid() + uid();
        const sessions = lsGet<Record<string, string>>(LS.sessions, {});
        sessions[token] = restored.id;
        lsSet(LS.sessions, sessions);
        markSynced(ident0);
        void syncNow();
        return json({ token, user: publicUserLocal(restored), reclaimed: true });
      }
      /* حساب روی سرور بدون رمز است؟ — مستقل از نسخه سرور:
         نسخه قدیم سرور برای حساب‌های پیامکیِ بدون رمز هم NOT_FOUND می‌دهد؛
         با بررسی مستقل وضعیت حساب، «حساب هست ولی رمز ندارد» از «حساب اصلاً نیست» جدا می‌شود */
      let noPasswordAccount = cloud.reachable && cloud.code === "NO_PASSWORD";
      if (!noPasswordAccount && cloud.reachable && cloud.code === "NOT_FOUND") {
        const st0 = await cloudUserStatus(ident0);
        noPasswordAccount = st0.reachable && st0.exists;
      }
      if (noPasswordAccount) {
        /* ثبت‌نام = بازیابی همان حساب اصلی و تنظیم رمز روی سرور
           (نه حساب موازی، نه خطای تکراری — حلقه «ثبت‌نام کنید ← قبلاً ثبت شده» رفع می‌شود) */
        const claimed = await cloudRegister(name, phone, email, password);
        if (claimed.ok && claimed.token) {
          const nowIso0 = new Date().toISOString();
          const restored: NativeUser = {
            id: uid(),
            name: String(claimed.user?.name ?? name).trim() || name,
            phone,
            email,
            passwordHash: await hashPasswordLocal(password),
            createdAt: String(claimed.user?.createdAt ?? "") || nowIso0,
            lastLoginAt: nowIso0,
            synced: true,
          };
          users.push(restored);
          lsSet(LS.users, users);
          const token = uid() + uid();
          const sessions = lsGet<Record<string, string>>(LS.sessions, {});
          sessions[token] = restored.id;
          lsSet(LS.sessions, sessions);
          markSynced(ident0);
          void syncNow();
          return json({ token, user: publicUserLocal(restored), reclaimed: true });
        }
        /* ادعای ابری ناموفق (قطعی/خطا) — ثبت‌نام محلی مثل قبل ادامه می‌یابد */
      } else if (cloud.reachable && cloud.code && cloud.code !== "NOT_FOUND" && cloud.code !== "DB_ERROR") {
        return json(
          {
            error:
              cloud.code === "BAD_PASSWORD"
                ? "این شماره/ایمیل قبلاً روی سرور درمسیر ثبت شده است — با رمز خود وارد شوید یا از کد پیامکی استفاده کنید"
                : cloud.code === "FORBIDDEN"
                  ? "حساب شما مسدود شده است — با پشتیبانی درمسیر تماس بگیرید"
                  : "ورود با رمز برای این حساب فعال نیست — از ورود با کد پیامکی استفاده کنید",
          },
          409
        );
      }
      /* NOT_FOUND / DB_ERROR / آفلاین → ثبت‌نام تازه مثل قبل ادامه می‌یابد */
    }
    const nowIso = new Date().toISOString();
    const user: NativeUser = {
      id: uid(),
      name,
      phone,
      email,
      passwordHash: await hashPasswordLocal(password),
      createdAt: nowIso,
      lastLoginAt: nowIso,
    };
    users.push(user);
    lsSet(LS.users, users);
    const token = uid() + uid();
    const sessions = lsGet<Record<string, string>>(LS.sessions, {});
    sessions[token] = user.id;
    lsSet(LS.sessions, sessions);
    /* ثبت در دیتابیس ابری — تا ثبت‌نام موبایل در پنل مدیریت دیده شود + ادغام فعالیت‌های ابری */
    cloudSyncUser(phone || email || "", name);
    void syncNow();
    return json({ token, user: publicUserLocal(user) });
  })();
}

function authLogin(body: Json): Promise<Response> {
  return (async () => {
    const identifier = String(body?.identifier ?? "").trim();
    const password = String(body?.password ?? "");
    if (!identifier || !password) return json({ error: "اطلاعات ورود را کامل وارد کنید" }, 400);

    let phone: string | null = null;
    let email: string | null = null;
    if (identifier.includes("@")) {
      email = normalizeEmailLocal(identifier);
      if (!email) return json({ error: "ایمیل معتبر نیست" }, 400);
    } else {
      phone = normalizePhoneLocal(identifier);
      if (!phone) return json({ error: "شماره موبایل معتبر نیست" }, 400);
    }

    const users = lsGet<NativeUser[]>(LS.users, []);
    const user = users.find((u) => (phone && u.phone === phone) || (email && u.email === email));
    if (!user) {
      /* حساب روی این دستگاه نیست (دستگاه جدید/کش پاک‌شده) — ورود مستقیم ابری:
         رمز مستقیم با سرور (Turso) بررسی می‌شود و در موفقیت، همان حساب
         همراه با سفرها/نشان‌ها/مسیرهای ابری روی همین دستگاه بازیابی می‌شود */
      const ident = phone || email || "";
      const cloud = await cloudLogin(ident, password);
      if (cloud.ok && cloud.token) {
        const nowIso = new Date().toISOString();
        const restored: NativeUser = {
          id: uid(),
          name: String(cloud.user?.name ?? "").trim() || "کاربر درمسیر",
          phone,
          email,
          passwordHash: await hashPasswordLocal(password), /* ورود بعدی حتی آفلاین روی همین دستگاه کار می‌کند */
          createdAt: String(cloud.user?.createdAt ?? "") || nowIso,
          lastLoginAt: nowIso,
          synced: true,
        };
        users.push(restored);
        lsSet(LS.users, users);
        const token = uid() + uid();
        const sessions = lsGet<Record<string, string>>(LS.sessions, {});
        sessions[token] = restored.id;
        lsSet(LS.sessions, sessions);
        markSynced(ident);
        void syncNow(); /* ادغام سفرها/نشان‌ها/مسیرهای ابری روی دستگاه جدید */
        return json({ token, user: publicUserLocal(restored), viaCloud: true });
      }
      if (cloud.reachable) {
        /* سرور پاسخ داد اما ورود ابری انجام نشد — پیام دقیق بر اساس کد خطای سرور */
        if (cloud.code === "BAD_PASSWORD") return json({ error: "رمز عبور اشتباه است" }, 401);
        if (cloud.code === "FORBIDDEN")
          return json({ error: "حساب شما مسدود شده است — با پشتیبانی درمسیر تماس بگیرید" }, 403);
        if (cloud.code === "USE_APP_OR_OTP" || cloud.code === "NO_PASSWORD")
          return json(
            { error: "برای این حساب رمز عبور تنظیم نشده است — از ورود با کد پیامکی استفاده کنید یا ثبت‌نام را با همین شماره کامل کنید" },
            400
          );
        if (cloud.code === "NOT_FOUND") {
          /* نسخه قدیم سرور برای حساب‌های پیامکیِ بدون رمز هم NOT_FOUND می‌دهد —
             با بررسی مستقل وضعیت، پیام درست نمایش داده می‌شود: حساب هست ولی رمز ندارد */
          const st = await cloudUserStatus(ident);
          if (st.reachable && st.exists) {
            return json(
              { error: "برای این حساب رمز عبور تنظیم نشده است — از ورود با کد پیامکی استفاده کنید یا ثبت‌نام را با همین شماره کامل کنید" },
              400
            );
          }
          return json({ error: "حسابی با این مشخصات پیدا نشد — ابتدا ثبت‌نام کنید" }, 404);
        }
        return json({ error: cloud.error || "خطا در ورود — دوباره تلاش کنید" }, 502);
      }
      return json(
        {
          error:
            "حسابی روی این دستگاه پیدا نشد و سرور ابری هم در دسترس نیست — اینترنت را بررسی و دوباره تلاش کنید، یا از «ورود با کد پیامکی» استفاده کنید (کد پیامکی حتی بدون اینترنت روی همین دستگاه کار می‌کند)",
        },
        404
      );
    }
    if (!user.passwordHash) return json({ error: "برای این حساب رمز عبور تنظیم نشده — از کد پیامکی استفاده کنید" }, 400);
    if (!(await verifyPasswordLocal(password, user.passwordHash))) {
      return json({ error: "رمز عبور اشتباه است" }, 401);
    }
    /* بررسی وضعیت واقعی در دیتابیس ابری — فقط مسدود بودن قطعی رد می‌شود.
       نبودن رکورد در ابر (!exists) نشانه قطعی «حذف» نیست — ناسازگاری همگام‌سازی
       هم همین را می‌سازد؛ نشان همگام‌سازی ترمیم و حساب پایین‌تر دوباره ثبت می‌شود */
    const ident = phone || email || "";
    const st = await cloudUserStatus(ident);
    if (st.reachable && st.status === "blocked") {
      revokeUserSessions(user.id);
      return json({ error: "حساب شما مسدود شده است — با پشتیبانی درمسیر تماس بگیرید" }, 403);
    }
    if (st.reachable && user.synced && !st.exists) {
      user.synced = false; /* ترمیم — با cloudSyncUser پایین‌تر دوباره ثبت می‌شود */
      lsSet(LS.users, users);
    }
    user.lastLoginAt = new Date().toISOString();
    lsSet(LS.users, users);
    const token = uid() + uid();
    const sessions = lsGet<Record<string, string>>(LS.sessions, {});
    sessions[token] = user.id;
    lsSet(LS.sessions, sessions);
    if (st.reachable) cloudSyncUser(ident, user.name);
    void syncNow();
    return json({ token, user: publicUserLocal(user) });
  })();
}

function authOtpRequest(body: Json): Promise<Response> {
  return (async () => {
    const phone = normalizePhoneLocal(String(body?.phone ?? ""));
    if (!phone) return json({ error: "شماره موبایل معتبر نیست" }, 400);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const otps = lsGet<Record<string, { code: string; expires: number }>>(LS.otps, {});
    otps[phone] = { code, expires: Date.now() + 3 * 60 * 1000 };
    lsSet(LS.otps, otps);
    console.log(`[SMS-DEVICE] کد ورود ${phone}: ${code}`);
    // روی دستگاه سرویس پیامک واقعی وجود ندارد — کد در پاسخ برگردانده می‌شود
    return json({ ok: true, delivered: false, expiresInSeconds: 180, devCode: code });
  })();
}

function authOtpVerify(body: Json): Promise<Response> {
  return (async () => {
    const phone = normalizePhoneLocal(String(body?.phone ?? ""));
    const code = String(body?.code ?? "").replace(/\D/g, "");
    if (!phone) return json({ error: "شماره موبایل معتبر نیست" }, 400);
    if (code.length !== 6) return json({ error: "کد ۶ رقمی را کامل وارد کنید" }, 400);

    const otps = lsGet<Record<string, { code: string; expires: number }>>(LS.otps, {});
    const otp = otps[phone];
    if (!otp) return json({ error: "کدی برای این شماره یافت نشد — دوباره درخواست کنید" }, 400);
    if (otp.expires < Date.now()) {
      delete otps[phone];
      lsSet(LS.otps, otps);
      return json({ error: "کد منقضی شده است — کد جدید بگیرید" }, 400);
    }
    if (otp.code !== code) return json({ error: "کد اشتباه است" }, 400);
    delete otps[phone];
    lsSet(LS.otps, otps);

    const users = lsGet<NativeUser[]>(LS.users, []);
    let user = users.find((u) => u.phone === phone);
    const isNew = !user;
    let cloudKnown = false; // حساب از قبل روی ابر هست — نام واقعی ابر نباید بازنویسی شود
    const nowIso = new Date().toISOString();
    if (!user) {
      user = {
        id: uid(),
        name: `کاربر ${phone.slice(-4)}`,
        phone,
        email: null,
        passwordHash: null,
        createdAt: nowIso,
        lastLoginAt: nowIso,
      };
      users.push(user);
      lsSet(LS.users, users);
      /* دستگاه جدید — اگر حساب از قبل روی سرور باشد، نام پیش‌فرض محلی به Turso
         فرستاده نمی‌شود تا نام واقعی کاربر در پنل مدیریت حفظ شود */
      if (Date.now() - cloudLastSeen < 10 * 60 * 1000) {
        const cst = await cloudUserStatus(phone);
        cloudKnown = cst.reachable && cst.exists;
        if (cloudKnown) markSynced(phone);
      }
    } else {
      /* بررسی وضعیت واقعی در دیتابیس ابری — فقط مسدود بودن قطعی رد می‌شود.
         مهم: نبودن رکورد در ابر (!exists) به‌تنهایی نشانه «حذف توسط پشتیبانی» نیست —
         ناسازگاری همگام‌سازی (ریست دیتابیس ابری / خطای موقت ثبت) همین حالت را می‌سازد
         و قبلاً باعث بن‌بست کامل ورود می‌شد («حذف شده ← ثبت‌نام کنید ← قبلاً ثبت شده»).
         تأیید کد پیامکی = اثبات مالکیت شماره؛ حساب دوباره در ابر ثبت می‌شود و ورود ادامه می‌یابد.
         مسدودسازی واقعی همچنان از طریق status=blocked اعمال می‌شود */
      const st = await cloudUserStatus(phone);
      if (st.reachable && st.status === "blocked") {
        revokeUserSessions(user.id);
        return json({ error: "حساب شما مسدود شده است — با پشتیبانی درمسیر تماس بگیرید" }, 403);
      }
      if (st.reachable && user.synced && !st.exists) {
        user.synced = false; /* ترمیم نشان همگام‌سازی — با cloudSyncUser پایین‌تر دوباره ثبت می‌شود */
      }
      user.lastLoginAt = nowIso;
      lsSet(LS.users, users);
    }
    const token = uid() + uid();
    const sessions = lsGet<Record<string, string>>(LS.sessions, {});
    sessions[token] = user.id;
    lsSet(LS.sessions, sessions);
    /* ثبت/بروزرسانی در دیتابیس ابری — پنل مدیریت ثبت‌نام موبایل را می‌بیند
       (حساب ابری موجود روی دستگاه جدید: نام واقعی ابر حفظ می‌شود) */
    if (!cloudKnown) cloudSyncUser(phone, user.name);
    void syncNow();
    return json({ token, user: publicUserLocal(user), isNew });
  })();
}

function authMe(headers: Headers): Response {
  const token = bearerToken(headers);
  if (!token) return json({ error: "نشست نامعتبر است" }, 401);
  const sessions = lsGet<Record<string, string>>(LS.sessions, {});
  const userId = sessions[token];
  if (!userId) return json({ error: "نشست نامعتبر یا منقضی است" }, 401);
  const users = lsGet<NativeUser[]>(LS.users, []);
  const user = users.find((u) => u.id === userId);
  if (!user) return json({ error: "کاربر یافت نشد" }, 401);
  /* بررسی پس‌زمینه وضعیت ابری — کاربر مسدودشده از پنل، خودکار خارج می‌شود */
  const identifier = user.phone || user.email;
  if (identifier) {
    cloudUserStatus(identifier)
      .then((st) => {
        if (st.reachable && st.status === "blocked") revokeUserSessions(user.id);
      })
      .catch(() => {});
  }
  return json({ user: publicUserLocal(user) });
}

function authLogout(headers: Headers): Response {
  const token = bearerToken(headers);
  if (token) {
    const sessions = lsGet<Record<string, string>>(LS.sessions, {});
    delete sessions[token];
    lsSet(LS.sessions, sessions);
  }
  return json({ ok: true });
}

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
  /* ثبت واقعی سفر در دیتابیس ابری — مدیر در پنل می‌بیند (آفلاین: در صف ارسال) */
  queueActivity("trip_add", trip);
  return json({ trip });
}

function deleteHistory(id: string | null, all: boolean): Response {
  if (all) {
    lsSet(LS.trips, []);
    queueActivity("trip_del_all", {});
    return json({ ok: true });
  }
  if (!id) return json({ error: "شناسه لازم است" }, 400);
  lsSet(
    LS.trips,
    lsGet<Json[]>(LS.trips, []).filter((t) => t.id !== id)
  );
  queueActivity("trip_del", { id });
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
  /* ثبت واقعی مسیر روزمره در دیتابیس ابری (آفلاین: در صف ارسال) */
  queueActivity("daily_add", route);
  return json({ route });
}

function deleteDailyRoute(id: string | null): Response {
  if (!id) return json({ error: "شناسه لازم است" }, 400);
  lsSet(
    LS.daily,
    lsGet<Json[]>(LS.daily, []).filter((r) => r.id !== id)
  );
  queueActivity("daily_del", { id });
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
  const station = getStation(stationId);
  if (!stationId || !station) {
    return json({ error: "ایستگاه نامعتبر است" }, 400);
  }
  const favs = lsGet<string[]>(LS.favs, []);
  if (!favs.includes(stationId)) {
    favs.unshift(stationId);
    lsSet(LS.favs, favs);
  }
  /* ثبت واقعی علاقه‌مندی در دیتابیس ابری (آفلاین: در صف ارسال) */
  queueActivity("fav_add", { stationId, stationName: station.name });
  return json({ ok: true });
}

function deleteFavorite(stationId: string | null): Response {
  if (!stationId) return json({ error: "شناسه لازم است" }, 400);
  lsSet(
    LS.favs,
    lsGet<string[]>(LS.favs, []).filter((s) => s !== stationId)
  );
  queueActivity("fav_del", { stationId });
  return json({ ok: true });
}

/* ---------------- تیکت پشتیبانی در اپ اندروید — ثبت واقعی در سرور ---------------- */

type NativeTicket = {
  id: string;
  name: string;
  contact: string;
  category: string;
  subject: string;
  message: string;
  status: string; // open | answered | closed
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
};

/** POST /api/tickets — تیکت کاربر: همزمان محلی + دیتابیس ابری (D1) */
function postTicket(body: Json): Response {
  const name = String(body?.name ?? "").trim();
  const contact = String(body?.contact ?? "").trim();
  const category = ["general", "bug", "idea", "ad"].includes(String(body?.category))
    ? String(body.category)
    : "general";
  const subject = String(body?.subject ?? "").trim();
  const message = String(body?.message ?? "").trim();
  if (name.length < 2) return json({ error: "نام و نام خانوادگی را وارد کنید" }, 400);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const isPhone = /^0?\d{9,11}$/.test(contact.replace(/[\s-]/g, ""));
  if (!isEmail && !isPhone) return json({ error: "ایمیل یا شماره تماس معتبر وارد کنید" }, 400);
  if (subject.length < 3) return json({ error: "موضوع تیکت باید حداقل ۳ نویسه باشد" }, 400);
  if (message.length < 10) return json({ error: "متن پیام باید حداقل ۱۰ نویسه باشد" }, 400);

  const ticket: NativeTicket = {
    id: uid(),
    name,
    contact,
    category,
    subject,
    message,
    status: "open",
    reply: null,
    repliedAt: null,
    createdAt: new Date().toISOString(),
  };
  const tickets = lsGet<NativeTicket[]>(LS.tickets, []);
  tickets.unshift(ticket);
  lsSet(LS.tickets, tickets.slice(0, 20));
  /* ثبت واقعی در دیتابیس ابری — پاسخ مدیر در پنل، در «تیکت‌های من» دیده می‌شود (آفلاین: صف) */
  queueActivity("ticket", { ...ticket });
  return json({ ok: true, id: ticket.id, forwarded: true });
}

/** GET /api/tickets/replies?contacts=a,b — تیکت‌ها و پاسخ‌های مدیر؛ ابر اول، حافظه دستگاه همیشه ادغام می‌شود
 *  تیکت‌های محلی حتی اگر هنوز به ابر نرسیده‌اند (آفلاین/خطا) همیشه در «تیکت‌های من» دیده می‌شوند */
async function getTicketReplies(contactsParam: string): Promise<Response> {
  const contacts = Array.from(
    new Set(
      String(contactsParam ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 6)
    )
  );
  if (contacts.length === 0) return json({ error: "راه تماس الزامی است" }, 400);

  type CloudTicket = {
    id: string | number;
    subject: string;
    category: string;
    message: string;
    status: string;
    reply: string | null;
    repliedAt: string | null;
    createdAt: string;
  };
  const merged = new Map<string, CloudTicket>();
  /* کلید ادغام: موضوع+متن — نسخه ابر (دارای پاسخ مدیر) بر نسخه محلی ترجیح دارد */
  const keyOf = (t: CloudTicket) => `${t.subject}|${String(t.message ?? "").slice(0, 100)}`;
  const betterOf = (a: CloudTicket, b: CloudTicket) => (b.reply && !a.reply ? b : a);

  /* ۱) ابر — برای هر راه تماس یک lookup */
  await Promise.all(
    contacts.map(async (c) => {
      for (const base of cloudBases()) {
        try {
          const res = await (deviceFetch ?? fetch)(
            `${base}/api/v1/public/tickets/lookup?contact=${encodeURIComponent(c)}`,
            { headers: { "X-Sync-Key": CLOUD_SYNC_KEY }, signal: AbortSignal.timeout(6000) }
          );
          if (!res.ok) continue;
          const j = (await res.json().catch(() => null)) as { ok?: boolean; data?: { tickets?: unknown[] } } | null;
          if (!j?.ok || !j.data) continue;
          for (const t of (j.data.tickets ?? []) as CloudTicket[]) {
            const k = keyOf(t);
            const prev = merged.get(k);
            merged.set(k, prev ? betterOf(prev, t) : t);
          }
          break;
        } catch {
          /* سرور بعدی امتحان می‌شود */
        }
      }
    })
  );

  /* ۲) حافظه دستگاه — تیکت‌های محلیِ همه راه‌های تماسِ خواسته‌شده؛ حتی اگر در ابر نیستند */
  const local = lsGet<NativeTicket[]>(LS.tickets, []).filter((t) => contacts.includes(t.contact));
  for (const t of local) {
    const item: CloudTicket = {
      id: t.id,
      subject: t.subject,
      category: t.category,
      message: t.message,
      status: t.status,
      reply: t.reply,
      repliedAt: t.repliedAt,
      createdAt: t.createdAt,
    };
    const k = keyOf(item);
    const prev = merged.get(k);
    merged.set(k, prev ? betterOf(prev, item) : item);
  }

  const tickets = Array.from(merged.values()).sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
  );
  return json({ ok: true, source: merged.size > 0 ? (local.length ? "cloud+device" : "cloud") : "device", contacts, tickets });
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

/* ------------------- محتوای زنده پنل (/api/content در اندروید) ------------------- */

/** fetch اصلی دستگاه — پیش از نصب پل ذخیره می‌شود تا واکشی ابری به دام افتاد پل نیفتد */
let deviceFetch: typeof fetch | null = null;

/**
 * واکشی محتوای زنده پنل از سرور ابری برای اپ اندروید
 * (شهر/خط/ایستگاه/تبلیغ/تنظیمات/واژگان تلفظ — مثل شوش → شوُش)
 * خروجی با شکل /api/content نسخه وب یکسان است.
 */
async function fetchLiveContent(): Promise<Response> {
  const bases = cloudBases();
  for (const base of bases) {
    try {
      const res = await (deviceFetch ?? fetch)(`${base}/api/v1/public/content`, {
        signal: AbortSignal.timeout(CLOUD_CONTENT_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as {
        ok?: boolean;
        data?: { settings?: Record<string, string> };
      } | null;
      if (!j?.ok || !j.data) continue;
      /* نشانی سرور اپ (تنظیم پنل) — مقصد دوم همگام‌سازی کاربر/فعالیت */
      const srv = String(j.data.settings?.app_server_url ?? "").trim();
      try {
        if (srv && /^https?:\/\//.test(srv)) localStorage.setItem(LS.appServerUrl, srv);
        else if (!srv) localStorage.removeItem(LS.appServerUrl);
      } catch {
        /* حافظه در دسترس نیست */
      }
      /* ابر در دسترس است — صف تغییرات آفلاین ارسال و فعالیت‌های ابری ادغام می‌شود */
      cloudLastSeen = Date.now();
      void syncNow();
      return json({ ok: true, connected: true, source: "cloud", content: j.data });
    } catch {
      /* سرور بعدی امتحان می‌شود */
    }
  }
  return json({ ok: true, connected: false, source: "local-fallback", content: null });
}

/* ---------------- اتصال به دیتابیس ابری (D1) — واقعی‌شدن کاربران موبایل ---------------- */

const CLOUD_SYNC_KEY = "darmasir-sync-1404";

/** آخرین زمانی که سرور ابری پاسخ داد — جلوگیری از درخواست‌های بی‌فایده در آفلاین */
let cloudLastSeen = 0;

/** ابطال همه نشست‌های فعال یک کاربر روی دستگاه (مسدودسازی از پنل) */
function revokeUserSessions(userId: string): void {
  const sessions = lsGet<Record<string, string>>(LS.sessions, {});
  let changed = false;
  for (const [tok, uid2] of Object.entries(sessions)) {
    if (uid2 === userId) {
      delete sessions[tok];
      changed = true;
    }
  }
  if (changed) lsSet(LS.sessions, sessions);
}

/** شناسه فعلی کاربر روی دستگاه — شماره/ایمیل حساب ورودکرده؛
    در نبود حساب: شناسه پایدار دستگاه تا تغییرات کاربر گم نشوند */
function currentIdentifier(): string {
  const sessions = lsGet<Record<string, string>>(LS.sessions, {});
  const token = Object.keys(sessions).pop();
  if (token) {
    const users = lsGet<NativeUser[]>(LS.users, []);
    const u = users.find((x) => x.id === sessions[token]);
    if (u) return u.phone || u.email || "";
  }
  let dev = "";
  try {
    dev = localStorage.getItem(LS.deviceId) || "";
    if (!dev) {
      dev = `device:${uid()}`;
      localStorage.setItem(LS.deviceId, dev);
    }
  } catch {
    dev = "device:unknown";
  }
  return dev;
}

/* ---------------- صف همگام‌سازی فعالیت کاربر (سفر/نشان/مسیر/تیکت) ----------------
   هر تغییری که کاربر در اپ می‌دهد ابتدا محلی ذخیره می‌شود و بلافاصله
   به دیتابیس ابری (D1) فرستاده می‌شود؛ اگر شبکه در دسترس نبود در همین
   صف می‌ماند و با اولین اتصال (واکشی محتوا/ورود) خودکار ارسال می‌شود.
   نتیجه: هر کاری کاربر بکند واقعاً به سرور می‌رسد و مدیر در پنل می‌بیند. */

type SyncItem = { identifier: string; kind: string; data: Json; at: number };
let syncInFlight = false;

function queueActivity(kind: string, data: Json): void {
  const q = lsGet<SyncItem[]>(LS.syncQueue, []);
  q.push({ identifier: currentIdentifier(), kind, data, at: Date.now() });
  /* صف حداکثر ۳۰۰ مورد — قدیمی‌ترها حذف می‌شوند */
  lsSet(LS.syncQueue, q.slice(-300));
  void flushSyncQueue();
}

function cloudBases(): string[] {
  /* مقصدهای همگام‌سازی: ورکر ابری (اصلی) + سرور اپ (تنظیم پنل: app_server_url —
     وقتی مدیر نشانی عمومی سرور اپ را در پنل ثبت کند، ثبت‌نام‌ها و فعالیت‌ها
     مستقیم هم به Turso می‌رسند و پنل همان لحظه می‌بیند) */
  const bases = CLOUD_CONTENT_BASES.map((b) => b.trim().replace(/\/+$/, "")).filter(Boolean);
  try {
    const app = (localStorage.getItem(LS.appServerUrl) || "").trim().replace(/\/+$/, "");
    if (app && /^https?:\/\//.test(app) && !bases.includes(app)) bases.push(app);
  } catch {
    /* حافظه در دسترس نیست */
  }
  return bases;
}

/** ارسال یک مورد فعالیت به دیتابیس ابری — true یعنی واقعاً ثبت شد */
async function cloudActivityPost(item: SyncItem): Promise<boolean> {
  for (const base of cloudBases()) {
    try {
      const res = await (deviceFetch ?? fetch)(`${base}/api/v1/public/users/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sync-Key": CLOUD_SYNC_KEY },
        body: JSON.stringify({ identifier: item.identifier, kind: item.kind, data: item.data }),
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (j?.ok) return true;
    } catch {
      /* سرور بعدی امتحان می‌شود */
    }
  }
  return false;
}

const syncItemKey = (x: SyncItem) => `${x.at}|${x.kind}|${JSON.stringify(x.data)}`;

/** تلاش دوباره ثبت ابری حساب‌هایی که موقتاً شکست خورده بود (آفلاین/خطا) */
async function flushPendingUserSyncs(): Promise<void> {
  const pend = lsGet<Record<string, string>>(LS.userSyncPending, {});
  const entries = Object.entries(pend);
  if (!entries.length) return;
  for (const [identifier, name] of entries.slice(0, 20)) {
    const trips = lsGet<Json[]>(LS.trips, []).length;
    for (const base of cloudBases()) {
      try {
        const res = await (deviceFetch ?? fetch)(`${base}/api/v1/public/users/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Sync-Key": CLOUD_SYNC_KEY },
          body: JSON.stringify({ user: { phone: identifier, name, trips } }),
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          markSynced(identifier);
          break;
        }
      } catch {
        /* مقصد بعدی / دفعه بعد */
      }
    }
  }
}

/** خالی‌کردن صف فعالیت‌ها به دیتابیس ابری — با اولین اتصال موفق؛
    موردهای ناموفق در صف می‌مانند و موارد جدیدِ حین ارسال حفظ می‌شوند */
async function flushSyncQueue(): Promise<void> {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    void flushPendingUserSyncs();
    const q = lsGet<SyncItem[]>(LS.syncQueue, []);
    if (!q.length) return;
    const keep: SyncItem[] = [];
    let sentCount = 0;
    for (const item of q) {
      /* موردهای خیلی قدیمی (بیش از ۷ روز) کنار گذاشته می‌شوند */
      if (Date.now() - item.at > 7 * 864e5) {
        sentCount++;
        continue;
      }
      const okSent = await cloudActivityPost(item);
      if (okSent) sentCount++;
      else keep.push(item);
    }
    if (sentCount > 0) {
      /* فقط موردهای پردازش‌شده حذف می‌شوند — موارد تازه حین ارسال دست‌نخورده می‌مانند */
      const nowQ = lsGet<SyncItem[]>(LS.syncQueue, []);
      const origKeys = new Set(q.map(syncItemKey));
      const fresh = nowQ.filter((x) => !origKeys.has(syncItemKey(x)));
      lsSet(LS.syncQueue, [...keep, ...fresh]);
    }
  } finally {
    syncInFlight = false;
  }
}

/** خواندن فعالیت کاربر از ابر و ادغام در حافظه دستگاه — همگام‌سازی چنددستگاهه */
async function pullActivity(): Promise<void> {
  const identifier = currentIdentifier();
  if (!identifier || identifier.startsWith("device:")) return;
  for (const base of cloudBases()) {
    try {
      const res = await (deviceFetch ?? fetch)(
        `${base}/api/v1/public/users/activity?identifier=${encodeURIComponent(identifier)}`,
        { headers: { "X-Sync-Key": CLOUD_SYNC_KEY }, signal: AbortSignal.timeout(7000) }
      );
      if (!res.ok) continue;
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: { trips?: Json[]; favorites?: { stationId?: string }[]; daily?: Json[] };
      } | null;
      if (!j?.ok || !j.data) continue;
      /* سفرها — اتحاد بر اساس شناسه */
      const trips = lsGet<Json[]>(LS.trips, []);
      const tripIds = new Set(trips.map((t) => String(t.id)));
      let tripsChanged = false;
      for (const t of j.data.trips ?? []) {
        if (!t?.id || tripIds.has(String(t.id))) continue;
        trips.push({ ...t, syncedAt: new Date().toISOString() });
        tripsChanged = true;
      }
      if (tripsChanged) lsSet(LS.trips, trips.slice(0, 40));
      /* علاقه‌مندی‌ها */
      const favs = lsGet<string[]>(LS.favs, []);
      let favsChanged = false;
      for (const f of j.data.favorites ?? []) {
        const sid = String(f?.stationId ?? "");
        if (!sid || favs.includes(sid)) continue;
        favs.push(sid);
        favsChanged = true;
      }
      if (favsChanged) lsSet(LS.favs, favs);
      /* مسیرهای روزمره */
      const daily = lsGet<Json[]>(LS.daily, []);
      const dailyIds = new Set(daily.map((d) => String(d.id)));
      let dailyChanged = false;
      for (const d of j.data.daily ?? []) {
        if (!d?.id || dailyIds.has(String(d.id))) continue;
        daily.push({ ...d });
        dailyChanged = true;
      }
      if (dailyChanged) lsSet(LS.daily, daily.slice(0, 50));
      return;
    } catch {
      /* سرور بعدی امتحان می‌شود */
    }
  }
}

/** علامت‌گذاری «ثبت‌شده در ابر» روی حساب محلی */
function markSynced(identifier: string): void {
  if (!identifier) return;
  const users = lsGet<NativeUser[]>(LS.users, []);
  const u = users.find((x) => x.phone === identifier || x.email === identifier);
  if (u && !u.synced) {
    u.synced = true;
    lsSet(LS.users, users);
  }
  /* از صف «در انتظار ثبت ابری» حذف می‌شود */
  const pend = lsGet<Record<string, string>>(LS.userSyncPending, {});
  if (pend[identifier] !== undefined) {
    delete pend[identifier];
    lsSet(LS.userSyncPending, pend);
  }
}

/** حساب‌هایی که ثبت ابری‌شان موقتاً شکست خورده (آفلاین/خطا) — با اولین اتصال دوباره ارسال می‌شوند */
function enqueueUserSync(identifier: string, name: string): void {
  if (!identifier) return;
  const pend = lsGet<Record<string, string>>(LS.userSyncPending, {});
  if (pend[identifier] === name) return;
  pend[identifier] = name;
  lsSet(LS.userSyncPending, pend);
}

/** ثبت/بروزرسانی کاربر موبایل در دیتابیس ابری (fire-and-forget) —
    ثبت‌نام‌های اپ اندروید در پنل مدیریت دیده می‌شوند و مسدودسازی/حذف واقعاً اعمال می‌شود.
    شکست (آفلاین/خطا) در صف «در انتظار ثبت» می‌ماند و با اولین اتصال دوباره ارسال می‌شود. */
function cloudSyncUser(identifier: string, name: string): void {
  if (!identifier) return;
  const trips = lsGet<Json[]>(LS.trips, []).length;
  const payload = { user: { phone: identifier, name, trips } };
  const bases = cloudBases();
  if (!bases.length) {
    enqueueUserSync(identifier, name);
    return;
  }
  let settled = 0;
  for (const base of bases) {
    (deviceFetch ?? fetch)(`${base}/api/v1/public/users/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sync-Key": CLOUD_SYNC_KEY },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    })
      .then((res) => {
        if (res?.ok) {
          settled++;
          markSynced(identifier);
        } else if (settled === 0 && settled + 1 >= bases.length) {
          enqueueUserSync(identifier, name);
        }
      })
      .catch(() => {
        /* آفلاین/خطا — در صف می‌ماند تا دوباره تلاش شود */
        enqueueUserSync(identifier, name);
      });
  }
}

type CloudUserState = { reachable: boolean; exists: boolean; status: string | null };

/** بررسی وضعیت واقعی کاربر در دیتابیس ابری (مسدود/حذف‌شده) — آفلاین: reachable=false */
async function cloudUserStatus(identifier: string): Promise<CloudUserState> {
  if (!identifier) return { reachable: false, exists: false, status: null };
  const bases = CLOUD_CONTENT_BASES.map((b) => b.trim().replace(/\/+$/, "")).filter(Boolean);
  for (const base of bases) {
    try {
      const res = await (deviceFetch ?? fetch)(
        `${base}/api/v1/public/users/status?identifier=${encodeURIComponent(identifier)}`,
        { headers: { "X-Sync-Key": CLOUD_SYNC_KEY }, signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) continue;
      const j = (await res.json()) as { ok?: boolean; data?: { exists?: boolean; status?: string | null } };
      if (!j?.ok || !j.data) continue;
      cloudLastSeen = Date.now();
      return { reachable: true, exists: !!j.data.exists, status: j.data.status ?? null };
    } catch {
      /* سرور بعدی امتحان می‌شود */
    }
  }
  return { reachable: false, exists: false, status: null };
}

type CloudLoginResult = {
  reachable: boolean; // حداقل یک سرور ابری پاسخ داد
  ok: boolean; // ورود ابری با رمز موفق بود
  code?: string;
  error?: string;
  token?: string;
  user?: { id?: string; name?: string; phone?: string | null; email?: string | null; createdAt?: string | null };
};

/** ورود مستقیم با سرور ابری (Turso) — برای دستگاه جدید/کش پاک‌شده:
    رمز مستقیم روی سرور بررسی می‌شود؛ در موفقیت، پروفایل ابری برمی‌گردد و
    سفرها/نشان‌ها/مسیرها با syncNow روی همین دستگاه بازیابی می‌شوند.
    هر دو سرور به‌صورت موازی صدا زده می‌شوند — سریع‌ترین پاسخ معتبر ملاک است؛
    آفلاین: حداکثر یک بازه timeout (نه به‌ازای هر سرور).
    مقاوم‌سازی ورود: timeout طولانی‌تر (شبکه موبایل ایران کند است) + یک تلاش دوباره
    کامل وقتی هیچ سروری پاسخ نداد (قطعی لحظه‌ای/تغییر سلولی شبکه) */
const CLOUD_LOGIN_TIMEOUT_MS = 10000;

async function cloudLogin(identifier: string, password: string): Promise<CloudLoginResult> {
  const bases = CLOUD_CONTENT_BASES.map((b) => b.trim().replace(/\/+$/, "")).filter(Boolean);
  if (!bases.length) return { reachable: false, ok: false };
  const attempt = async (base: string): Promise<CloudLoginResult> => {
    try {
      const res = await (deviceFetch ?? fetch)(`${base}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, device: "android" }),
        signal: AbortSignal.timeout(CLOUD_LOGIN_TIMEOUT_MS),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: { token?: string; user?: CloudLoginResult["user"] };
        error?: { code?: string; message?: string };
      } | null;
      if (!j) return { reachable: false, ok: false };
      cloudLastSeen = Date.now();
      if (j.ok && j.data?.token) {
        return { reachable: true, ok: true, token: j.data.token, user: j.data.user };
      }
      const code = String(j.error?.code ?? "");
      /* خطای دیتابیس سروری — نتیجه قطعی نیست، سرور بعدی/فالبک ملاک می‌شود */
      if (code === "DB_ERROR") return { reachable: true, ok: false, code };
      return { reachable: true, ok: false, code, error: String(j.error?.message ?? "") };
    } catch {
      /* آفلاین/timeout — این سرور پاسخ نداد */
      return { reachable: false, ok: false };
    }
  };
  const runPass = async (): Promise<CloudLoginResult[]> =>
    (
      await Promise.allSettled(bases.map(attempt))
    ).map((r) => (r.status === "fulfilled" ? r.value : ({ reachable: false, ok: false } as CloudLoginResult)));
  const pick = (results: CloudLoginResult[]): CloudLoginResult | null => {
    const okHit = results.find((r) => r.ok);
    if (okHit) return okHit;
    /* خطای قطعی (رمز اشتباه/مسدود/نبودن حساب) مقدم بر خطای سروری است */
    const definitive = results.find((r) => r.reachable && r.code && r.code !== "DB_ERROR");
    if (definitive) return definitive;
    if (results.some((r) => r.reachable)) {
      return { reachable: true, ok: false, code: "DB_ERROR", error: "خطا در ورود — دوباره تلاش کنید" };
    }
    return null;
  };
  const first = await runPass();
  const firstHit = pick(first);
  if (firstHit) return firstHit;
  /* هیچ سروری پاسخ نداد — یک تلاش دوباره (قطعی لحظه‌ای شبکه موبایل رایج است) */
  await new Promise((r) => setTimeout(r, 900));
  const second = await runPass();
  const secondHit = pick(second);
  return secondHit ?? { reachable: false, ok: false };
}

type CloudRegisterResult = {
  ok: boolean;
  token?: string;
  user?: CloudLoginResult["user"];
  code?: string;
};

/** ثبت‌نام ابری — برای بازیابی حساب پیامکیِ بدون رمز (تنظیم رمز روی همان حساب اصلی سرور).
    ترتیبی (نه موازی) چون عملیات نوشتنی است؛ هر سرور فقط یک‌بار صدا زده می‌شود */
async function cloudRegister(
  name: string,
  phone: string | null,
  email: string | null,
  password: string
): Promise<CloudRegisterResult> {
  const bases = CLOUD_CONTENT_BASES.map((b) => b.trim().replace(/\/+$/, "")).filter(Boolean);
  for (const base of bases) {
    try {
      const res = await (deviceFetch ?? fetch)(`${base}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
          password,
          device: "android",
        }),
        signal: AbortSignal.timeout(6000),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: { token?: string; user?: CloudLoginResult["user"] };
        error?: { code?: string; message?: string };
      } | null;
      if (!j) continue;
      cloudLastSeen = Date.now();
      if (j.ok && j.data?.token) {
        return { ok: true, token: j.data.token, user: j.data.user };
      }
      return { ok: false, code: String(j.error?.code ?? "") };
    } catch {
      /* سرور بعدی امتحان می‌شود */
    }
  }
  return { ok: false };
}

/* ---------------------------- dispatcher ---------------------------- */

async function handle(
  pathname: string,
  search: URLSearchParams,
  method: string,
  body: Json | null,
  headers: Headers
): Promise<Response | null> {
  switch (pathname) {
    case "/api/content": {
      if (method === "GET") return await fetchLiveContent();
      return null;
    }
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
    case "/api/arrivals": {
      if (method === "GET") return getArrivals(search.get("station"));
      return null;
    }
    case "/api/tickets": {
      if (method === "POST") return postTicket(body ?? {});
      return null;
    }
    case "/api/tickets/replies": {
      if (method === "GET")
        return await getTicketReplies(search.get("contacts") ?? search.get("contact") ?? "");
      return null;
    }
    case "/api/auth/register": {
      if (method === "POST") return await authRegister(body ?? {});
      return null;
    }
    case "/api/auth/login": {
      if (method === "POST") return await authLogin(body ?? {});
      return null;
    }
    case "/api/auth/otp/request": {
      if (method === "POST") return await authOtpRequest(body ?? {});
      return null;
    }
    case "/api/auth/otp/verify": {
      if (method === "POST") return await authOtpVerify(body ?? {});
      return null;
    }
    case "/api/auth/me": {
      if (method === "GET") return authMe(headers);
      return null;
    }
    case "/api/auth/logout": {
      if (method === "POST") return authLogout(headers);
      return null;
    }
    default:
      return null;
  }
}

/** همگام‌سازی کامل با سرور — در هر بار باز شدن اپ، بازگشت آنلاین و ورود/ثبت‌نام:
    ۱) صف فعالیت‌های آفلاین (سفر/نشان/مسیر/تیکت) به سرور ارسال می‌شود
    ۲) حساب‌های در انتظار ثبت ابری دوباره تلاش می‌شوند
    ۳) فعالیت‌های ثبت‌شده در سرور (دستگاه دیگر) به دستگاه ادغام می‌شود */
async function syncNow(): Promise<void> {
  await flushSyncQueue();
  await pullActivity();
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
  deviceFetch = originalFetch;
  win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        window.location.origin
      );
      // فقط درخواست‌های «همین اپ» رهگیری می‌شوند؛ آدرس‌های مطلق
      // سرورهای ابری (صدا/محتوا) مستقیم به مقصد می‌روند
      if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
        const method = (init?.method ?? "GET").toUpperCase();
        let body: Json | null = null;
        if (init?.body && typeof init.body === "string") {
          try {
            body = JSON.parse(init.body) as Json;
          } catch {
            body = null;
          }
        }
        let res: Response | null = null;
        try {
          res = await handle(url.pathname, url.searchParams, method, body, new Headers(init?.headers ?? undefined));
        } catch {
          /* هرگز به fetch اصلی برنمی‌گردیم — در WebView اندروید سروری وجود ندارد و
             خطای شبکه با پیام غلط «اتصال به سرور برقرار نشد — اینترنت را بررسی کنید»
             نمایش داده می‌شد در حالی که اینترنت روشن است. پاسخ کنترل‌شده داده می‌شود */
          return json({ error: "خطای غیرمنتظره در پردازش درخواست — دوباره تلاش کنید" }, 500);
        }
        if (res) return res;
        // مسیرهای صوتی و سایر مسیرها → پاسخ خطای کنترل‌شده
        return json({ message: "در حالت آفلاین در دسترس نیست" }, 503);
      }
    } catch {
      /* ادامه با fetch اصلی */
    }
    return originalFetch(input, init);
  };

  /* ---------- همگام‌سازی خودکار با سرور ----------
     هر بار باز شدن اپ + لحظه بازگشت اینترنت + بازگشت به اپ از پس‌زمینه */
  setTimeout(() => void syncNow(), 1500);
  window.addEventListener("online", () => void syncNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow();
  });
}
