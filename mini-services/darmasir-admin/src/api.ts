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

  if (path === "auth/change-password" && method === "POST") {
    const current = typeof body.current_password === "string" ? body.current_password : "";
    const next = typeof body.new_password === "string" ? body.new_password : "";
    if (!verifyPassword(current, admin.password_hash))
      return fail("INVALID_LOGIN", "گذرواژه فعلی نادرست است", 401);
    if (next.length < 8) return fail("BAD_INPUT", "گذرواژه جدید باید حداقل ۸ کاراکتر باشد");
    db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(hashPassword(next), admin.id);
    audit(admin.id, admin.display_name, "password_change", "تغییر گذرواژه شخصی", ip);
    return ok({ changed: true });
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
      if (seg[1] && !isNaN(Number(seg[1]))) {
        const u = db
          .query("SELECT id, phone, display_name, status, trips_count, created_at, last_seen FROM app_users WHERE id = ?")
          .get(Number(seg[1]));
        if (!u) return fail("NOT_FOUND", "کاربر یافت نشد", 404);
        return ok(u);
      }
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
    if (path === "users/bulk-status" && method === "POST") {
      const status = ["active", "limited", "disabled"].includes(body.status) ? body.status : null;
      const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
      if (!status || !ids.length) return fail("BAD_INPUT", "وضعیت و فهرست کاربران الزامی است");
      const stmt = db.prepare("UPDATE app_users SET status = ? WHERE id = ?");
      let n = 0;
      for (const id of ids) { stmt.run(status, id); n++; }
      changeLog("app_user", null, "bulk_status", admin.display_name, `${n} کاربر → ${status}`);
      audit(admin.id, admin.display_name, "user_bulk_status", `${n} کاربر → ${status}`, ip);
      return ok({ updated: n });
    }
    if (seg[1] === "trips" && seg[2] && method === "POST") {
      const id = Number(seg[2]);
      const u = db.prepare("SELECT * FROM app_users WHERE id = ?").get(id) as any;
      if (!u) return fail("NOT_FOUND", "کاربر یافت نشد", 404);
      const delta = Math.round(Number(body.delta) || 0);
      if (!delta) return fail("BAD_INPUT", "مقدار تغییر سفر الزامی است");
      const next = Math.max(0, (u.trips_count || 0) + delta);
      db.prepare("UPDATE app_users SET trips_count = ? WHERE id = ?").run(next, id);
      changeLog("app_user", id, "update", admin.display_name, `سفرها: ${u.trips_count} → ${next}`);
      audit(admin.id, admin.display_name, "user_update", `سفرهای کاربر #${id} → ${next}`, ip);
      return ok({ trips_count: next });
    }
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
      const baseSql =
        "SELECT l.*, (SELECT COUNT(*) FROM stations s WHERE s.line_id = l.id AND s.is_active = 1) AS station_count FROM lines l";
      const rows = mode
        ? db.prepare(`${baseSql} WHERE l.mode = ? ORDER BY l.sort`).all(mode)
        : db.prepare(`${baseSql} ORDER BY l.sort`).all();
      return ok(rows);
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (path === "lines/reorder" && method === "POST") {
      const id = Number(body.id);
      const dir = body.dir === "up" ? "up" : body.dir === "down" ? "down" : null;
      if (!id || !dir) return fail("BAD_INPUT", "شناسه خط و جهت جابه‌جایی الزامی است");
      const cur = db.prepare("SELECT * FROM lines WHERE id = ?").get(id) as any;
      if (!cur) return fail("NOT_FOUND", "خط یافت نشد", 404);
      const neighbor = (
        dir === "up"
          ? db.query("SELECT * FROM lines WHERE mode = ? AND sort < ? ORDER BY sort DESC LIMIT 1").get(cur.mode, cur.sort)
          : db.query("SELECT * FROM lines WHERE mode = ? AND sort > ? ORDER BY sort LIMIT 1").get(cur.mode, cur.sort)
      ) as any | undefined;
      if (!neighbor) return ok({ moved: false });
      db.prepare("UPDATE lines SET sort = ? WHERE id = ?").run(neighbor.sort, cur.id);
      db.prepare("UPDATE lines SET sort = ? WHERE id = ?").run(cur.sort, neighbor.id);
      changeLog("line", id, "update", admin.display_name, `جابه‌جایی ترتیب ${cur.name}`);
      audit(admin.id, admin.display_name, "line_update", `ترتیب ${cur.name}`, ip);
      return ok({ moved: true });
    }
    if (path === "lines/duplicate" && method === "POST") {
      const id = Number(body.id);
      const cur = db.prepare("SELECT * FROM lines WHERE id = ?").get(id) as any;
      if (!cur) return fail("NOT_FOUND", "خط یافت نشد", 404);
      const maxSort = (db.query("SELECT COALESCE(MAX(sort),0) AS m FROM lines").get() as any).m;
      const r = db
        .prepare(
          "INSERT INTO lines (mode, number, name, color, terminals, direction, is_active, sort) VALUES (?,?,?,?,?,?,0,?)"
        )
        .run(cur.mode, cur.number, `${cur.name} (کپی)`, cur.color, cur.terminals, cur.direction, maxSort + 1);
      changeLog("line", Number(r.lastInsertRowid), "create", admin.display_name, `${cur.name} (کپی)`);
      audit(admin.id, admin.display_name, "line_create", `تکثیر ${cur.name}`, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }
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
    if (path === "stations/reorder" && method === "POST") {
      const id = Number(body.id);
      const dir = body.dir === "up" ? "up" : body.dir === "down" ? "down" : null;
      if (!id || !dir) return fail("BAD_INPUT", "شناسه ایستگاه و جهت جابه‌جایی الزامی است");
      const cur = db.prepare("SELECT * FROM stations WHERE id = ?").get(id) as any;
      if (!cur) return fail("NOT_FOUND", "ایستگاه یافت نشد", 404);
      const neighbor = (
        dir === "up"
          ? db.query("SELECT * FROM stations WHERE line_id = ? AND order_index < ? ORDER BY order_index DESC LIMIT 1").get(cur.line_id, cur.order_index)
          : db.query("SELECT * FROM stations WHERE line_id = ? AND order_index > ? ORDER BY order_index LIMIT 1").get(cur.line_id, cur.order_index)
      ) as any | undefined;
      if (!neighbor) return ok({ moved: false });
      db.prepare("UPDATE stations SET order_index = ? WHERE id = ?").run(neighbor.order_index, cur.id);
      db.prepare("UPDATE stations SET order_index = ? WHERE id = ?").run(cur.order_index, neighbor.id);
      changeLog("station", id, "update", admin.display_name, `جابه‌جایی ${cur.name}`);
      audit(admin.id, admin.display_name, "station_update", `ترتیب ${cur.name}`, ip);
      return ok({ moved: true });
    }
    if (path === "stations/bulk" && method === "POST") {
      const lineId = Number(body.line_id);
      const namesRaw = typeof body.names === "string" ? body.names : "";
      if (!lineId) return fail("BAD_INPUT", "خط الزامی است");
      const line = db.prepare("SELECT id FROM lines WHERE id = ?").get(lineId);
      if (!line) return fail("NOT_FOUND", "خط یافت نشد", 404);
      const names = namesRaw
        .split(/\n|\r|،/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 200);
      if (!names.length) return fail("BAD_INPUT", "حداقل یک نام ایستگاه وارد کنید (هر خط یک نام)");
      const maxOrder = (db.query("SELECT COALESCE(MAX(order_index), -1) AS m FROM stations WHERE line_id = ?").get(lineId) as any).m;
      const ins = db.prepare("INSERT INTO stations (line_id, name, order_index, is_active) VALUES (?,?,?,1)");
      let added = 0;
      const dup = db.prepare("SELECT id FROM stations WHERE line_id = ? AND name = ?");
      names.forEach((name: string, i: number) => {
        if (dup.get(lineId, name)) return;
        ins.run(lineId, name, maxOrder + 1 + i);
        added++;
      });
      changeLog("station", null, "bulk_create", admin.display_name, `${added} ایستگاه به خط #${lineId}`);
      audit(admin.id, admin.display_name, "station_bulk", `${added} ایستگاه افزوده شد`, ip);
      return ok({ added, skipped: names.length - added }, 201);
    }
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
  const AD_PLACEMENTS = ["home", "map", "plan", "station", "line", "splash", "drawer"];
  if (seg[0] === "ads") {
    // ثبت نمایش/کلیک از کلاینت — با آمار روزانه
    if (seg[1] && seg[2] === "track" && method === "POST") {
      const id = Number(seg[1]);
      const type = str(body.type, 10);
      const day = new Date().toISOString().slice(0, 10);
      if (type === "impression") {
        db.prepare("UPDATE ads SET impressions = impressions + 1 WHERE id = ?").run(id);
        db.prepare(
          "INSERT INTO ad_stats_daily (ad_id, day, impressions, clicks) VALUES (?, ?, 1, 0) ON CONFLICT(ad_id, day) DO UPDATE SET impressions = impressions + 1"
        ).run(id, day);
      } else if (type === "click") {
        db.prepare("UPDATE ads SET clicks = clicks + 1 WHERE id = ?").run(id);
        db.prepare(
          "INSERT INTO ad_stats_daily (ad_id, day, impressions, clicks) VALUES (?, ?, 0, 1) ON CONFLICT(ad_id, day) DO UPDATE SET clicks = clicks + 1"
        ).run(id, day);
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
          db.prepare("DELETE FROM ad_stats_daily WHERE ad_id = ?").run(id);
          db.prepare("DELETE FROM ads WHERE id = ?").run(id);
        } else {
          db.prepare("UPDATE ads SET is_active = ?, updated_at = ? WHERE id = ?").run(action === "activate" ? 1 : 0, now(), id);
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
      const daily = db
        .query(
          "SELECT day, SUM(impressions) AS impressions, SUM(clicks) AS clicks FROM ad_stats_daily WHERE day >= ? GROUP BY day ORDER BY day"
        )
        .all(since);
      const perAd = db
        .query(
          `SELECT a.id, a.title, a.placement, a.is_active, a.impressions, a.clicks,
                  CASE WHEN a.impressions > 0 THEN ROUND(a.clicks * 100.0 / a.impressions, 2) ELSE 0 END AS ctr
           FROM ads a ORDER BY ctr DESC, a.impressions DESC`
        )
        .all();
      const totals = db
        .query("SELECT COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(clicks),0) AS clicks FROM ad_stats_daily WHERE day >= ?")
        .get(since) as any;
      return ok({ days, daily, per_ad: perAd, totals });
    }

    if (method === "GET") {
      return ok(db.prepare("SELECT * FROM ads ORDER BY priority DESC, id DESC").all());
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;

    // تکثیر کمپین
    if (seg[1] && seg[2] === "duplicate" && method === "POST") {
      const cur = db.prepare("SELECT * FROM ads WHERE id = ?").get(Number(seg[1])) as any;
      if (!cur) return fail("NOT_FOUND", "تبلیغ یافت نشد", 404);
      const r = db
        .prepare(
          "INSERT INTO ads (title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, priority, starts_at, ends_at, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?)"
        )
        .run(
          `${cur.title} (کپی)`,
          cur.subtitle,
          cur.badge,
          cur.cta_text,
          cur.advertiser,
          cur.image_url,
          cur.link_url,
          cur.placement,
          cur.priority,
          cur.starts_at,
          cur.ends_at,
          now()
        );
      changeLog("ad", Number(r.lastInsertRowid), "create", admin.display_name, `${cur.title} (کپی)`);
      audit(admin.id, admin.display_name, "ad_create", `تکثیر ${cur.title}`, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }

    // بازنشانی آمار کمپین
    if (seg[1] && seg[2] === "reset-stats" && method === "POST") {
      const id = Number(seg[1]);
      const cur = db.prepare("SELECT id FROM ads WHERE id = ?").get(id);
      if (!cur) return fail("NOT_FOUND", "تبلیغ یافت نشد", 404);
      db.prepare("UPDATE ads SET impressions = 0, clicks = 0 WHERE id = ?").run(id);
      db.prepare("DELETE FROM ad_stats_daily WHERE ad_id = ?").run(id);
      changeLog("ad", id, "update", admin.display_name, "بازنشانی آمار");
      audit(admin.id, admin.display_name, "ad_reset_stats", `#${id}`, ip);
      return ok({ reset: true });
    }

    if (method === "POST") {
      const title = str(body.title, 120);
      if (!title) return fail("BAD_INPUT", "عنوان تبلیغ الزامی است");
      if (body.starts_at && body.ends_at && new Date(body.starts_at) > new Date(body.ends_at))
        return fail("BAD_INPUT", "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد");
      const r = db
        .prepare(
          "INSERT INTO ads (title, subtitle, badge, cta_text, advertiser, image_url, link_url, placement, priority, starts_at, ends_at, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
        )
        .run(
          title,
          str(body.subtitle, 200) || null,
          str(body.badge, 30) || null,
          str(body.cta_text, 40) || null,
          str(body.advertiser, 80) || null,
          str(body.image_url, 500) || null,
          str(body.link_url, 500) || null,
          AD_PLACEMENTS.includes(body.placement) ? body.placement : "home",
          Math.min(Math.max(Number(body.priority) || 0, 0), 100),
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
      const next = {
        ...cur,
        ...body,
        title: body.title !== undefined ? str(body.title, 120) || cur.title : cur.title,
      };
      if (next.starts_at && next.ends_at && new Date(next.starts_at) > new Date(next.ends_at))
        return fail("BAD_INPUT", "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد");
      db.prepare(
        "UPDATE ads SET title=?, subtitle=?, badge=?, cta_text=?, advertiser=?, image_url=?, link_url=?, placement=?, priority=?, starts_at=?, ends_at=?, is_active=?, updated_at=? WHERE id=?"
      ).run(
        next.title,
        str(next.subtitle, 200) || null,
        str(next.badge, 30) || null,
        str(next.cta_text, 40) || null,
        str(next.advertiser, 80) || null,
        next.image_url,
        next.link_url,
        AD_PLACEMENTS.includes(next.placement) ? next.placement : "home",
        Math.min(Math.max(Number(next.priority) || 0, 0), 100),
        next.starts_at,
        next.ends_at,
        next.is_active ? 1 : 0,
        now(),
        id
      );
      changeLog("ad", id, "update", admin.display_name, next.title);
      audit(admin.id, admin.display_name, "ad_update", next.title, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      db.prepare("DELETE FROM ad_stats_daily WHERE ad_id = ?").run(id);
      db.prepare("DELETE FROM ads WHERE id = ?").run(id);
      changeLog("ad", id, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "ad_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
  }

  /* ---------- voice lexicon ---------- */
  if (seg[0] === "voice-lexicon") {
    if (method === "GET") {
      const q = str(url.searchParams.get("q") ?? "", 60);
      const rows = q
        ? db
            .prepare("SELECT * FROM voice_lexicon WHERE spoken LIKE ? OR written LIKE ? ORDER BY priority DESC, id DESC")
            .all(`%${q}%`, `%${q}%`)
        : db.prepare("SELECT * FROM voice_lexicon ORDER BY priority DESC, id DESC").all();
      return ok(rows);
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    // درون‌ریزی خودکار نام ایستگاه‌ها به فرهنگ تلفظ
    if (path === "voice-lexicon/import-stations" && method === "POST") {
      const stations = db.query("SELECT DISTINCT name FROM stations WHERE is_active = 1 ORDER BY name").all() as any[];
      const exists = new Set(
        (db.query("SELECT spoken FROM voice_lexicon").all() as any[]).map((r) => r.spoken)
      );
      const ins = db.prepare("INSERT INTO voice_lexicon (spoken, written, priority) VALUES (?,?,?)");
      let added = 0;
      for (const s of stations) {
        if (exists.has(s.name)) continue;
        ins.run(s.name, s.name, 5);
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
        "support_phone",
        "ads_rotation_seconds",
        "max_ads_per_placement",
        "force_update_version",
        "store_link",
        "default_city",
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
    const range = Math.min(Math.max(Number(url.searchParams.get("days")) || 14, 7), 90);
    const since = new Date(Date.now() - (range - 1) * 86400000).toISOString().slice(0, 10);
    const stats = db.query("SELECT day, count FROM api_stats WHERE day >= ? ORDER BY day DESC LIMIT ?").all(since, range);
    const adsDaily = db
      .query(
        "SELECT day, SUM(impressions) AS impressions, SUM(clicks) AS clicks FROM ad_stats_daily WHERE day >= ? GROUP BY day ORDER BY day"
      )
      .all(since);
    const adsRanking = db
      .query(
        `SELECT id, title, placement, is_active, impressions, clicks,
                CASE WHEN impressions > 0 THEN ROUND(clicks * 100.0 / impressions, 2) ELSE 0 END AS ctr
         FROM ads ORDER BY ctr DESC, impressions DESC`
      )
      .all();
    const changes = db.query("SELECT entity, action, admin_name, details, created_at FROM change_log ORDER BY id DESC LIMIT 30").all();
    const sessions = (db.query("SELECT COUNT(*) AS c FROM sessions WHERE expires_at > ?").get(now()) as any).c;
    const usersByStatus = db.query("SELECT status, COUNT(*) AS count FROM app_users GROUP BY status").all();
    const topStations = db
      .query("SELECT s.name, l.name AS line_name, l.color FROM stations s JOIN lines l ON l.id = s.line_id WHERE s.is_active = 1 LIMIT 8")
      .all();
    const totals = (db.query("SELECT COALESCE(SUM(impressions),0) AS imp, COALESCE(SUM(clicks),0) AS clk FROM ad_stats_daily WHERE day >= ?").get(since) as any);
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
      admins: db
        .query("SELECT id, username, display_name, role, is_active, created_at, last_login FROM admins ORDER BY id")
        .all(),
      sessions: db
        .query(
          `SELECT s.token, s.created_at, s.expires_at, s.ip, s.user_agent, a.username, a.display_name
           FROM sessions s JOIN admins a ON a.id = s.admin_id
           WHERE s.expires_at > ? ORDER BY s.created_at DESC`
        )
        .all(now()),
      audit: db.query("SELECT * FROM audit_log ORDER BY id DESC LIMIT 100").all(),
    });
  }

  /* ---------- ابطال نشست (فقط مدیر کل) ---------- */
  if (seg[0] === "sessions" && seg[1] && method === "DELETE") {
    const guard = requireRole(admin, "super");
    if (guard) return guard;
    const token = seg[1];
    const row = db.query("SELECT admin_id FROM sessions WHERE token = ?").get(token) as any;
    if (!row) return fail("NOT_FOUND", "نشست یافت نشد", 404);
    if (row.admin_id === admin.id) return fail("FORBIDDEN", "برای خروج از نشست خود از دکمه خروج استفاده کنید", 403);
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
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
