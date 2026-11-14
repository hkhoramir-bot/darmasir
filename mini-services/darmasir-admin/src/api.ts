/* ============================================================
   درمسیر — پنل مدیریت | مسیریاب API نسخه‌دار /api/v1
   استاندارد: ورودی معتبر، خطای استاندارد، نقش‌ها، لاگ عملیات
   ============================================================ */
import { db, now, bumpApiStats, audit, changeLog } from "./db";
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

const ok = (data: any, status = 200) =>
  new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const fail = (code: string, message: string, status = 400) =>
  new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const str = (v: any, max = 300) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const clientIp = (req: Request) =>
  req.headers.get("X-Real-IP") || req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "local";

function getSession(req: Request): AdminRow | null {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const row = db
    .query(
      `SELECT a.* FROM sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token = ? AND s.expires_at > ? AND a.is_active = 1`
    )
    .get(token, now()) as AdminRow | undefined;
  return row ?? null;
}

function requireRole(admin: AdminRow, role: Role): Response | null {
  if (RANK[admin.role] < RANK[role]) {
    return fail("FORBIDDEN", "سطح دسترسی شما برای این عملیات کافی نیست", 403);
  }
  return null;
}

function touchSession(adminId: number, token: string, req: Request) {
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  db.prepare(
    "INSERT INTO sessions (token, admin_id, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?) ON CONFLICT(token) DO UPDATE SET expires_at = excluded.expires_at"
  ).run(token, adminId, now(), expires, clientIp(req), req.headers.get("User-Agent") ?? "");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
}

/* --------------------------------------------------------------- */

export async function handleApi(req: Request, url: URL): Promise<Response> {
  bumpApiStats();
  const path = url.pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");
  const method = req.method.toUpperCase();
  const ip = clientIp(req);

  let body: any = {};
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  try {
    return await route(path, method, url, req, body, ip);
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
  const admin = getSession(req);
  const seg = path.split("/");

  /* ---------- auth ---------- */
  if (path === "auth/login" && method === "POST") {
    if (!loginAllowed(ip))
      return fail("RATE_LIMIT", "تلاش‌های ناموفق زیاد است؛ چند دقیقه بعد دوباره امتحان کنید", 429);
    const username = str(body.username, 60);
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password)
      return fail("BAD_INPUT", "نام کاربری و گذرواژه الزامی است");
    const row = db.query("SELECT * FROM admins WHERE username = ?").get(username) as AdminRow | undefined;
    if (!row || !verifyPassword(password, row.password_hash) || !row.is_active) {
      registerFailedLogin(ip);
      audit(null, username || "ناشناس", "login_failed", `نام کاربری: ${username}`, ip);
      return fail("INVALID_LOGIN", "نام کاربری یا گذرواژه نادرست است", 401);
    }
    clearLoginAttempts(ip);
    const token = newToken();
    touchSession(row.id, token, req);
    db.prepare("UPDATE admins SET last_login = ? WHERE id = ?").run(now(), row.id);
    audit(row.id, row.display_name, "login", "ورود موفق", ip);
    return ok({
      token,
      admin: { id: row.id, username: row.username, display_name: row.display_name, role: row.role },
    });
  }

  if (!admin) return fail("UNAUTHORIZED", "ابتدا وارد پنل شوید", 401);

  if (path === "auth/me" && method === "GET") {
    return ok({ id: admin.id, username: admin.username, display_name: admin.display_name, role: admin.role });
  }

  if (path === "auth/logout" && method === "POST") {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    audit(admin.id, admin.display_name, "logout", "خروج از پنل", ip);
    return ok({ logged_out: true });
  }

  /* ---------- dashboard ---------- */
  if (path === "dashboard" && method === "GET") {
    const q = (sql: string) => (db.query(sql).get() as any).c ?? 0;
    const days: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push({ day: d, count: 0 });
    }
    (db.query("SELECT day, count FROM api_stats WHERE day >= ?").all(
      new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
    ) as any[]).forEach((r) => {
      const f = days.find((x) => x.day === r.day);
      if (f) f.count = r.count;
    });
    return ok({
      users_total: q("SELECT COUNT(*) AS c FROM app_users"),
      users_active: q("SELECT COUNT(*) AS c FROM app_users WHERE status = 'active'"),
      trips_total: q("SELECT COALESCE(SUM(trips_count),0) AS c FROM app_users"),
      lines_active: q("SELECT COUNT(*) AS c FROM lines WHERE is_active = 1"),
      stations_total: q("SELECT COUNT(*) AS c FROM stations"),
      ads_active: (
        db
          .query("SELECT COUNT(*) AS c FROM ads WHERE is_active = 1 AND (ends_at IS NULL OR ends_at > ?)")
          .get(now()) as any
      ).c,
      api_last7: days,
      audit_recent: db
        .query("SELECT action, admin_name, details, created_at FROM audit_log ORDER BY id DESC LIMIT 8")
        .all(),
      services: [
        { name: "دیتابیس پنل", status: "ok", note: "SQLite محلی فعال" },
        {
          name: "سرویس صوتی",
          status: (db.query("SELECT value FROM settings WHERE key = 'voice_enabled'").get() as any)?.value === "on" ? "ok" : "off",
          note: (db.query("SELECT value FROM settings WHERE key = 'voice_service'").get() as any)?.value ?? "-",
        },
        { name: "دروازه API پنل", status: "ok", note: "پورت ۳۰۳۵" },
      ],
    });
  }

  /* ---------- users (کاربران اپ) ---------- */
  if (seg[0] === "users") {
    if (method === "GET") {
      const q = str(url.searchParams.get("q") ?? "", 60);
      const status = str(url.searchParams.get("status") ?? "", 20);
      let sql = "SELECT id, phone, display_name, status, trips_count, created_at, last_seen FROM app_users WHERE 1=1";
      const args: any[] = [];
      if (q) {
        sql += " AND (display_name LIKE ? OR phone LIKE ?)";
        args.push(`%${q}%`, `%${q}%`);
      }
      if (status) {
        sql += " AND status = ?";
        args.push(status);
      }
      sql += " ORDER BY id DESC LIMIT 200";
      return ok(db.prepare(sql).all(...args));
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (method === "POST") {
      const name = str(body.display_name, 80);
      const phone = str(body.phone, 20) || null;
      const status = ["active", "limited", "disabled"].includes(body.status) ? body.status : "active";
      if (!name) return fail("BAD_INPUT", "نام کاربر الزامی است");
      try {
        const r = db
          .prepare("INSERT INTO app_users (phone, display_name, status, created_at, last_seen) VALUES (?,?,?,?,?)")
          .run(phone, name, status, now(), now());
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
        if (!["active", "limited", "disabled"].includes(body.status))
          return fail("BAD_INPUT", "وضعیت نامعتبر است");
        patch.push("status = ?");
        args.push(body.status);
      }
      if (!patch.length) return fail("BAD_INPUT", "چیزی برای بروزرسانی نیست");
      args.push(id);
      db.prepare(`UPDATE app_users SET ${patch.join(", ")} WHERE id = ?`).run(...args);
      changeLog("app_user", id, "update", admin.display_name, JSON.stringify(body).slice(0, 200));
      audit(admin.id, admin.display_name, "user_update", `#${id}`, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      db.prepare("DELETE FROM app_users WHERE id = ?").run(id);
      changeLog("app_user", id, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "user_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- lines ---------- */
  if (seg[0] === "lines") {
    if (method === "GET") {
      const mode = str(url.searchParams.get("mode") ?? "", 10);
      const rows = mode
        ? db.prepare("SELECT * FROM lines WHERE mode = ? ORDER BY sort").all(mode)
        : db.prepare("SELECT * FROM lines ORDER BY sort").all();
      return ok(rows);
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (method === "POST") {
      const name = str(body.name, 80);
      if (!name) return fail("BAD_INPUT", "نام خط الزامی است");
      const r = db
        .prepare(
          "INSERT INTO lines (mode, number, name, color, terminals, direction, is_active, sort) VALUES (?,?,?,?,?,?,?,?)"
        )
        .run(
          ["metro", "bus", "brt"].includes(body.mode) ? body.mode : "metro",
          Number(body.number) || null,
          name,
          /^#[0-9a-fA-F]{6}$/.test(body.color ?? "") ? body.color : "#009640",
          str(body.terminals, 120) || null,
          str(body.direction, 60) || null,
          body.is_active === 0 ? 0 : 1,
          Number(body.sort) || 0
        );
      changeLog("line", Number(r.lastInsertRowid), "create", admin.display_name, name);
      audit(admin.id, admin.display_name, "line_create", name, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "خط یافت نشد", 404);
    if (method === "PUT") {
      const cur = db.prepare("SELECT * FROM lines WHERE id = ?").get(id) as any;
      if (!cur) return fail("NOT_FOUND", "خط یافت نشد", 404);
      const next = { ...cur, ...body, name: body.name !== undefined ? str(body.name, 80) || cur.name : cur.name };
      db.prepare(
        "UPDATE lines SET mode=?, number=?, name=?, color=?, terminals=?, direction=?, is_active=?, sort=? WHERE id=?"
      ).run(
        ["metro", "bus", "brt"].includes(next.mode) ? next.mode : "metro",
        Number(next.number) || null,
        next.name,
        /^#[0-9a-fA-F]{6}$/.test(next.color ?? "") ? next.color : "#009640",
        next.terminals,
        next.direction,
        next.is_active ? 1 : 0,
        Number(next.sort) || 0,
        id
      );
      changeLog("line", id, "update", admin.display_name, next.name);
      audit(admin.id, admin.display_name, "line_update", next.name, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      db.prepare("DELETE FROM lines WHERE id = ?").run(id);
      changeLog("line", id, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "line_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- stations ---------- */
  if (seg[0] === "stations") {
    if (method === "GET") {
      const lineId = Number(url.searchParams.get("line_id"));
      const rows = lineId
        ? db.prepare("SELECT * FROM stations WHERE line_id = ? ORDER BY order_index").all(lineId)
        : db.prepare("SELECT * FROM stations ORDER BY line_id, order_index LIMIT 500").all();
      return ok(rows);
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (method === "POST") {
      const lineId = Number(body.line_id);
      const name = str(body.name, 80);
      if (!lineId) return fail("BAD_INPUT", "خط الزامی است");
      if (!name) return fail("BAD_INPUT", "نام ایستگاه الزامی است");
      const line = db.prepare("SELECT id FROM lines WHERE id = ?").get(lineId);
      if (!line) return fail("NOT_FOUND", "خط یافت نشد", 404);
      const r = db
        .prepare(
          "INSERT INTO stations (line_id, name, lat, lng, order_index, is_active) VALUES (?,?,?,?,?,?)"
        )
        .run(
          lineId,
          name,
          body.lat !== undefined && body.lat !== "" ? Number(body.lat) : null,
          body.lng !== undefined && body.lng !== "" ? Number(body.lng) : null,
          Number(body.order_index) || 0,
          body.is_active === 0 ? 0 : 1
        );
      changeLog("station", Number(r.lastInsertRowid), "create", admin.display_name, name);
      audit(admin.id, admin.display_name, "station_create", name, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "ایستگاه یافت نشد", 404);
    if (method === "PUT") {
      const cur = db.prepare("SELECT * FROM stations WHERE id = ?").get(id) as any;
      if (!cur) return fail("NOT_FOUND", "ایستگاه یافت نشد", 404);
      const next = { ...cur, ...body, name: body.name !== undefined ? str(body.name, 80) || cur.name : cur.name };
      db.prepare(
        "UPDATE stations SET line_id=?, name=?, lat=?, lng=?, order_index=?, is_active=? WHERE id=?"
      ).run(
        Number(next.line_id) || cur.line_id,
        next.name,
        next.lat === null ? null : Number(next.lat),
        next.lng === null ? null : Number(next.lng),
        Number(next.order_index) || 0,
        next.is_active ? 1 : 0,
        id
      );
      changeLog("station", id, "update", admin.display_name, next.name);
      audit(admin.id, admin.display_name, "station_update", next.name, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      db.prepare("DELETE FROM stations WHERE id = ?").run(id);
      changeLog("station", id, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "station_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- ads ---------- */
  if (seg[0] === "ads") {
    if (seg[1] && seg[2] === "track" && method === "POST") {
      const id = Number(seg[1]);
      const type = str(body.type, 10);
      if (type === "impression") db.prepare("UPDATE ads SET impressions = impressions + 1 WHERE id = ?").run(id);
      else if (type === "click") db.prepare("UPDATE ads SET clicks = clicks + 1 WHERE id = ?").run(id);
      else return fail("BAD_INPUT", "نوع ثبت نامعتبر است");
      return ok({ tracked: true });
    }
    if (method === "GET") {
      return ok(db.prepare("SELECT * FROM ads ORDER BY id DESC").all());
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (method === "POST") {
      const title = str(body.title, 120);
      if (!title) return fail("BAD_INPUT", "عنوان تبلیغ الزامی است");
      const r = db
        .prepare(
          "INSERT INTO ads (title, image_url, link_url, placement, starts_at, ends_at, is_active, created_at) VALUES (?,?,?,?,?,?,?,?)"
        )
        .run(
          title,
          str(body.image_url, 500) || null,
          str(body.link_url, 500) || null,
          ["home", "map", "plan"].includes(body.placement) ? body.placement : "home",
          str(body.starts_at, 30) || null,
          str(body.ends_at, 30) || null,
          body.is_active ? 1 : 0,
          now()
        );
      changeLog("ad", Number(r.lastInsertRowid), "create", admin.display_name, title);
      audit(admin.id, admin.display_name, "ad_create", title, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "تبلیغ یافت نشد", 404);
    if (method === "PUT") {
      const cur = db.prepare("SELECT * FROM ads WHERE id = ?").get(id) as any;
      if (!cur) return fail("NOT_FOUND", "تبلیغ یافت نشد", 404);
      const next = { ...cur, ...body, title: body.title !== undefined ? str(body.title, 120) || cur.title : cur.title };
      db.prepare(
        "UPDATE ads SET title=?, image_url=?, link_url=?, placement=?, starts_at=?, ends_at=?, is_active=? WHERE id=?"
      ).run(
        next.title,
        next.image_url,
        next.link_url,
        ["home", "map", "plan"].includes(next.placement) ? next.placement : "home",
        next.starts_at,
        next.ends_at,
        next.is_active ? 1 : 0,
        id
      );
      changeLog("ad", id, "update", admin.display_name, next.title);
      audit(admin.id, admin.display_name, "ad_update", next.title, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      db.prepare("DELETE FROM ads WHERE id = ?").run(id);
      changeLog("ad", id, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "ad_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- voice lexicon ---------- */
  if (seg[0] === "voice-lexicon") {
    if (method === "GET") {
      return ok(db.prepare("SELECT * FROM voice_lexicon ORDER BY priority DESC, id DESC").all());
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (method === "POST") {
      const spoken = str(body.spoken, 120);
      const written = str(body.written, 120);
      if (!spoken || !written) return fail("BAD_INPUT", "هر دو مقدار گفتاری و نوشتاری الزامی است");
      const r = db
        .prepare("INSERT INTO voice_lexicon (spoken, written, priority) VALUES (?,?,?)")
        .run(spoken, written, Number(body.priority) || 0);
      changeLog("voice_lexicon", Number(r.lastInsertRowid), "create", admin.display_name, `${spoken} → ${written}`);
      audit(admin.id, admin.display_name, "lexicon_create", spoken, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "مدخل یافت نشد", 404);
    if (method === "PUT") {
      const cur = db.prepare("SELECT * FROM voice_lexicon WHERE id = ?").get(id) as any;
      if (!cur) return fail("NOT_FOUND", "مدخل یافت نشد", 404);
      const next = { ...cur, ...body };
      db.prepare("UPDATE voice_lexicon SET spoken=?, written=?, priority=? WHERE id=?").run(
        str(next.spoken, 120) || cur.spoken,
        str(next.written, 120) || cur.written,
        Number(next.priority) || 0,
        id
      );
      changeLog("voice_lexicon", id, "update", admin.display_name, next.spoken);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      db.prepare("DELETE FROM voice_lexicon WHERE id = ?").run(id);
      changeLog("voice_lexicon", id, "delete", admin.display_name);
      return ok({ deleted: true });
    }
  }

  /* ---------- settings ---------- */
  if (path === "settings") {
    if (method === "GET") {
      const rows = db.query("SELECT key, value, updated_at FROM settings").all();
      return ok(Object.fromEntries(rows.map((r: any) => [r.key, r])));
    }
    const guard = requireRole(admin, "super");
    if (guard) return guard;
    if (method === "PUT") {
      const allowed = [
        "app_name",
        "app_version",
        "welcome_message",
        "maintenance_mode",
        "voice_enabled",
        "voice_service",
        "support_message",
      ];
      let changed = 0;
      for (const [k, v] of Object.entries(body)) {
        if (!allowed.includes(k)) continue;
        db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
          k,
          String(v).slice(0, 300),
          now()
        );
        changed++;
      }
      if (!changed) return fail("BAD_INPUT", "هیچ کلید مجازی ارسال نشده است");
      audit(admin.id, admin.display_name, "settings_update", JSON.stringify(Object.keys(body)), ip);
      return ok({ updated: changed });
    }
  }

  /* ---------- reports ---------- */
  if (path === "reports" && method === "GET") {
    const stats = db.query("SELECT day, count FROM api_stats ORDER BY day DESC LIMIT 14").all();
    const ads = db.query("SELECT title, impressions, clicks, is_active FROM ads").all();
    const changes = db.query("SELECT entity, action, admin_name, details, created_at FROM change_log ORDER BY id DESC LIMIT 30").all();
    const sessions = (db.query("SELECT COUNT(*) AS c FROM sessions WHERE expires_at > ?").get(now()) as any).c;
    return ok({ api_stats: stats, ads, changes, active_sessions: sessions });
  }

  /* ---------- security (فقط مدیر کل) ---------- */
  if (seg[0] === "security" && method === "GET") {
    const guard = requireRole(admin, "super");
    if (guard) return guard;
    return ok({
      admins: db
        .query("SELECT id, username, display_name, role, is_active, created_at, last_login FROM admins ORDER BY id")
        .all(),
      sessions: db
        .query(
          `SELECT s.token, s.created_at, s.expires_at, s.ip, a.username, a.display_name
           FROM sessions s JOIN admins a ON a.id = s.admin_id
           WHERE s.expires_at > ? ORDER BY s.created_at DESC`
        )
        .all(now()),
      audit: db.query("SELECT * FROM audit_log ORDER BY id DESC LIMIT 100").all(),
    });
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
        const r = db
          .prepare("INSERT INTO admins (username, password_hash, display_name, role, created_at) VALUES (?,?,?,?,?)")
          .run(username, hashPassword(password), displayName, role, now());
        audit(admin.id, admin.display_name, "admin_create", username, ip);
        return ok({ id: Number(r.lastInsertRowid) }, 201);
      } catch {
        return fail("DUPLICATE", "این نام کاربری قبلاً وجود دارد", 409);
      }
    }
    const id = Number(seg[1]);
    if (!id) return fail("NOT_FOUND", "مدیر یافت نشد", 404);
    if (method === "PUT") {
      const cur = db.prepare("SELECT * FROM admins WHERE id = ?").get(id) as AdminRow | undefined;
      if (!cur) return fail("NOT_FOUND", "مدیر یافت نشد", 404);
      if (typeof body.password === "string" && body.password.length >= 8) {
        db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(hashPassword(body.password), id);
      }
      if (body.role !== undefined && ["super", "operator", "viewer"].includes(body.role))
        db.prepare("UPDATE admins SET role = ? WHERE id = ?").run(body.role, id);
      if (body.is_active !== undefined)
        db.prepare("UPDATE admins SET is_active = ? WHERE id = ?").run(body.is_active ? 1 : 0, id);
      if (body.display_name !== undefined)
        db.prepare("UPDATE admins SET display_name = ? WHERE id = ?").run(str(body.display_name, 80) || cur.display_name, id);
      audit(admin.id, admin.display_name, "admin_update", cur.username, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      if (id === admin.id) return fail("FORBIDDEN", "حذف حساب خودتان ممکن نیست", 403);
      const remaining = (db.query("SELECT COUNT(*) AS c FROM admins WHERE is_active = 1").get() as any).c;
      if (remaining <= 1) return fail("FORBIDDEN", "آخرین مدیر فعال را نمی‌توان حذف کرد", 403);
      db.prepare("DELETE FROM admins WHERE id = ?").run(id);
      audit(admin.id, admin.display_name, "admin_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  return fail("NOT_FOUND", "مسیر API یافت نشد", 404);
}
