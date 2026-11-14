/* ============================================================
   درمسیر — پنل مدیریت | مسیریاب API نسخه‌دار /api/v1
   استاندارد: ورودی معتبر، خطای استاندارد، نقش‌ها، لاگ عملیات
   ============================================================ */
import { db, now, bumpApiStats, audit, changeLog, UPLOAD_DIR } from "./db";
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
  const ctype = req.headers.get("content-type") || "";
  if ((method === "POST" || method === "PUT" || method === "PATCH") && ctype.includes("application/json")) {
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

  /* ---------- cities (شهرها) ---------- */
  if (seg[0] === "cities") {
    if (method === "GET") {
      const rows = db
        .query(
          `SELECT c.*,
                  (SELECT COUNT(*) FROM lines l WHERE l.city_id = c.id) AS lines_count,
                  (SELECT COUNT(*) FROM stations s WHERE s.city_id = c.id) AS stations_count
           FROM cities c ORDER BY c.sort, c.id`
        )
        .all();
      return ok(rows);
    }
    const guard = requireRole(admin, "operator");
    if (guard) return guard;
    if (method === "POST") {
      const name = str(body.name, 60);
      if (!name) return fail("BAD_INPUT", "نام شهر الزامی است");
      const maxSort = (db.query("SELECT COALESCE(MAX(sort),0) AS m FROM cities").get() as any).m;
      try {
        const r = db
          .prepare("INSERT INTO cities (name, sort, created_at) VALUES (?,?,?)")
          .run(name, Number(body.sort) || maxSort + 1, now());
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
      const cur = db.prepare("SELECT * FROM cities WHERE id = ?").get(id) as any;
      if (!cur) return fail("NOT_FOUND", "شهر یافت نشد", 404);
      const name = body.name !== undefined ? str(body.name, 60) || cur.name : cur.name;
      try {
        db.prepare("UPDATE cities SET name = ?, is_active = ?, sort = ? WHERE id = ?").run(
          name,
          body.is_active === undefined ? cur.is_active : body.is_active ? 1 : 0,
          body.sort !== undefined ? Number(body.sort) || cur.sort : cur.sort,
          id
        );
        changeLog("city", id, "update", admin.display_name, name);
        audit(admin.id, admin.display_name, "city_update", name, ip);
        return ok({ updated: true });
      } catch {
        return fail("DUPLICATE", "شهر دیگری با همین نام وجود دارد", 409);
      }
    }
    if (method === "DELETE") {
      const usedLines = (db.query("SELECT COUNT(*) AS c FROM lines WHERE city_id = ?").get(id) as any).c;
      const usedStations = (db.query("SELECT COUNT(*) AS c FROM stations WHERE city_id = ?").get(id) as any).c;
      if (usedLines > 0 || usedStations > 0)
        return fail(
          "IN_USE",
          `این شهر به ${usedLines} خط و ${usedStations} ایستگاه متصل است؛ ابتدا آن‌ها را به شهر دیگر منتقل کنید`,
          409
        );
      db.prepare("DELETE FROM cities WHERE id = ?").run(id);
      changeLog("city", id, "delete", admin.display_name);
      audit(admin.id, admin.display_name, "city_delete", `#${id}`, ip);
      return ok({ deleted: true });
    }
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
      cities_total: q("SELECT COUNT(*) AS c FROM cities WHERE is_active = 1"),
      revenues_count: q("SELECT COUNT(*) AS c FROM revenues"),
      revenues_settled: q(
        "SELECT COUNT(*) AS c FROM revenues WHERE amount > 0 AND (SELECT COALESCE(SUM(p.amount),0) FROM revenue_payments p WHERE p.revenue_id = revenues.id) >= amount"
      ),
      revenues_total: q("SELECT COALESCE(SUM(amount),0) AS c FROM revenues"),
      revenues_paid: q("SELECT COALESCE(SUM(amount),0) AS c FROM revenue_payments"),
      invoices_count: q("SELECT COUNT(*) AS c FROM invoices WHERE status != 'cancelled'"),
      invoices_paid: q("SELECT COUNT(*) AS c FROM invoices WHERE status = 'paid'"),
      invoices_total: q("SELECT COALESCE(SUM(total),0) AS c FROM invoices WHERE status != 'cancelled'"),
      recent_payments: db
        .query(
          "SELECT p.amount, p.paid_at, p.method, r.title, r.org_name FROM revenue_payments p JOIN revenues r ON r.id = p.revenue_id ORDER BY p.id DESC LIMIT 6"
        )
        .all(),
      lines_by_city: db
        .query(
          `SELECT c.name AS city, COUNT(l.id) AS lines,
                  (SELECT COUNT(*) FROM stations s JOIN lines l2 ON l2.id = s.line_id
                    WHERE l2.city_id = c.id AND s.is_active = 1) AS stations
           FROM cities c LEFT JOIN lines l ON l.city_id = c.id AND l.is_active = 1
           WHERE c.is_active = 1 GROUP BY c.id ORDER BY c.sort, c.id`
        )
        .all(),
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
      return ok(db.prepare(`${baseSql}${where} ORDER BY l.sort`).all(...args));
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
          "INSERT INTO lines (mode, number, name, color, terminals, direction, city_id, is_active, sort) VALUES (?,?,?,?,?,?,?,0,?)"
        )
        .run(cur.mode, cur.number, `${cur.name} (کپی)`, cur.color, cur.terminals, cur.direction, cur.city_id ?? null, maxSort + 1);
      changeLog("line", Number(r.lastInsertRowid), "create", admin.display_name, `${cur.name} (کپی)`);
      audit(admin.id, admin.display_name, "line_create", `تکثیر ${cur.name}`, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }
    if (method === "POST") {
      const name = str(body.name, 80);
      if (!name) return fail("BAD_INPUT", "نام خط الزامی است");
      const cityId = Number(body.city_id) || null;
      if (cityId && !db.query("SELECT id FROM cities WHERE id = ?").get(cityId))
        return fail("NOT_FOUND", "شهر انتخاب‌شده یافت نشد", 404);
      const r = db
        .prepare(
          "INSERT INTO lines (mode, number, name, color, terminals, direction, city_id, is_active, sort) VALUES (?,?,?,?,?,?,?,?,?)"
        )
        .run(
          ["metro", "bus", "brt"].includes(body.mode) ? body.mode : "metro",
          Number(body.number) || null,
          name,
          /^#[0-9a-fA-F]{6}$/.test(body.color ?? "") ? body.color : "#009640",
          str(body.terminals, 120) || null,
          str(body.direction, 60) || null,
          cityId,
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
      const nextCityId = body.city_id !== undefined ? Number(body.city_id) || null : cur.city_id ?? null;
      if (nextCityId && !db.query("SELECT id FROM cities WHERE id = ?").get(nextCityId))
        return fail("NOT_FOUND", "شهر انتخاب‌شده یافت نشد", 404);
      db.prepare(
        "UPDATE lines SET mode=?, number=?, name=?, color=?, terminals=?, direction=?, city_id=?, is_active=?, sort=? WHERE id=?"
      ).run(
        ["metro", "bus", "brt"].includes(next.mode) ? next.mode : "metro",
        Number(next.number) || null,
        next.name,
        /^#[0-9a-fA-F]{6}$/.test(next.color ?? "") ? next.color : "#009640",
        next.terminals,
        next.direction,
        nextCityId,
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
      const lineId = Number(url.searchParams.get("line_id")) || null;
      const cityId = Number(url.searchParams.get("city_id")) || null;
      const baseSql =
        "SELECT s.*, l.name AS line_name, l.color AS line_color, c.name AS city_name FROM stations s JOIN lines l ON l.id = s.line_id LEFT JOIN cities c ON c.id = s.city_id";
      if (lineId) {
        return ok(db.prepare(`${baseSql} WHERE s.line_id = ? ORDER BY s.order_index`).all(lineId));
      }
      const rows = cityId
        ? db.prepare(`${baseSql} WHERE s.city_id = ? ORDER BY s.line_id, s.order_index LIMIT 500`).all(cityId)
        : db.prepare(`${baseSql} ORDER BY s.line_id, s.order_index LIMIT 500`).all();
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
      const line = db.prepare("SELECT id, city_id FROM lines WHERE id = ?").get(lineId) as any;
      if (!line) return fail("NOT_FOUND", "خط یافت نشد", 404);
      const names = namesRaw
        .split(/\n|\r|،/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 200);
      if (!names.length) return fail("BAD_INPUT", "حداقل یک نام ایستگاه وارد کنید (هر خط یک نام)");
      const maxOrder = (db.query("SELECT COALESCE(MAX(order_index), -1) AS m FROM stations WHERE line_id = ?").get(lineId) as any).m;
      const ins = db.prepare("INSERT INTO stations (line_id, name, order_index, is_active, city_id) VALUES (?,?,?,1,?)");
      const dup = db.prepare("SELECT id FROM stations WHERE line_id = ? AND name = ?");
      let added = 0;
      names.forEach((name: string, i: number) => {
        if (dup.get(lineId, name)) return;
        ins.run(lineId, name, maxOrder + 1 + i, line.city_id ?? null);
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
      const line = db.prepare("SELECT id, city_id FROM lines WHERE id = ?").get(lineId) as any;
      if (!line) return fail("NOT_FOUND", "خط یافت نشد", 404);
      // شهر ایستگاه: انتخاب مدیر یا به‌طور خودکار از شهر خط مقصد
      let stationCityId = body.city_id !== undefined && body.city_id !== "" && body.city_id !== null ? Number(body.city_id) : null;
      if (stationCityId && !db.query("SELECT id FROM cities WHERE id = ?").get(stationCityId))
        return fail("NOT_FOUND", "شهر انتخاب‌شده یافت نشد", 404);
      if (!stationCityId) stationCityId = line.city_id ?? null;
      const r = db
        .prepare(
          "INSERT INTO stations (line_id, name, lat, lng, city_id, order_index, is_active) VALUES (?,?,?,?,?,?,?)"
        )
        .run(
          lineId,
          name,
          body.lat !== undefined && body.lat !== "" ? Number(body.lat) : null,
          body.lng !== undefined && body.lng !== "" ? Number(body.lng) : null,
          stationCityId,
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
      // اگر خط عوض شد و شهر دستی انتخاب نشده، شهر از خط جدید گرفته می‌شود
      let nextCityId = body.city_id !== undefined && body.city_id !== "" && body.city_id !== null ? Number(body.city_id) : null;
      if (nextCityId && !db.query("SELECT id FROM cities WHERE id = ?").get(nextCityId))
        return fail("NOT_FOUND", "شهر انتخاب‌شده یافت نشد", 404);
      const newLineId = Number(next.line_id) || cur.line_id;
      if (!nextCityId) {
        if (newLineId !== cur.line_id) {
          const newLine = db.prepare("SELECT city_id FROM lines WHERE id = ?").get(newLineId) as any;
          nextCityId = newLine?.city_id ?? null;
        } else {
          nextCityId = cur.city_id ?? null;
        }
      }
      db.prepare(
        "UPDATE stations SET line_id=?, name=?, lat=?, lng=?, city_id=?, order_index=?, is_active=? WHERE id=?"
      ).run(
        newLineId,
        next.name,
        next.lat === null ? null : Number(next.lat),
        next.lng === null ? null : Number(next.lng),
        nextCityId,
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
      const payments = db
        .query(
          `SELECT p.id, p.amount, p.paid_at, p.method, p.reference, p.note,
                  r.id AS revenue_id, r.title AS rev_title, r.org_name, r.contract_no
           FROM revenue_payments p JOIN revenues r ON r.id = p.revenue_id
           WHERE p.paid_at >= ? AND p.paid_at <= ?
           ORDER BY p.paid_at`
        )
        .all(from, toIncl);
      const settled = db
        .query(
          `SELECT r.id, r.title, r.org_name, r.amount, r.contract_no,
                  (SELECT COALESCE(SUM(p.amount),0) FROM revenue_payments p WHERE p.revenue_id = r.id) AS paid_amount,
                  (SELECT MAX(p.paid_at) FROM revenue_payments p WHERE p.revenue_id = r.id) AS last_payment
           FROM revenues r
           WHERE r.amount > 0
             AND (SELECT COALESCE(SUM(p.amount),0) FROM revenue_payments p WHERE p.revenue_id = r.id) >= r.amount
             AND (SELECT MAX(p.paid_at) FROM revenue_payments p WHERE p.revenue_id = r.id) >= ?
             AND (SELECT MAX(p.paid_at) FROM revenue_payments p WHERE p.revenue_id = r.id) <= ?
           ORDER BY last_payment`
        )
        .all(from, toIncl);
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
      return ok(db.prepare(sql).all(...args));
    }

    const revId = Number(seg[1]) || 0;

    /* جزئیات قرارداد — پرداخت‌ها و مستندات */
    if (revId && method === "GET" && !seg[2]) {
      const rev = db.prepare(`${REV_SELECT} WHERE r.id = ?`).get(revId) as any;
      if (!rev) return fail("NOT_FOUND", "قرارداد یافت نشد", 404);
      rev.payments = db
        .query("SELECT * FROM revenue_payments WHERE revenue_id = ? ORDER BY paid_at DESC, id DESC")
        .all(revId);
      rev.docs = db
        .query("SELECT id, filename, original_name, mime, size, created_at FROM revenue_docs WHERE revenue_id = ? ORDER BY id DESC")
        .all(revId);
      return ok(rev);
    }

    const guard = requireRole(admin, "operator");
    if (guard) return guard;

    /* پرداخت‌های قرارداد */
    if (revId && seg[2] === "payments") {
      const rev = db.query("SELECT * FROM revenues WHERE id = ?").get(revId) as any;
      if (!rev) return fail("NOT_FOUND", "قرارداد یافت نشد", 404);
      if (method === "POST") {
        const amount = Math.round(Number(body.amount) || 0);
        if (amount <= 0) return fail("BAD_INPUT", "مبلغ پرداخت باید بزرگ‌تر از صفر باشد");
        let paidAt = str(body.paid_at, 30) || now();
        if (/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) paidAt += "T12:00:00.000Z";
        const r = db
          .prepare(
            "INSERT INTO revenue_payments (revenue_id, amount, paid_at, method, reference, note, created_at) VALUES (?,?,?,?,?,?,?)"
          )
          .run(revId, amount, paidAt, str(body.method, 40) || null, str(body.reference, 60) || null, str(body.note, 200) || null, now());
        changeLog("revenue", revId, "update", admin.display_name, `پرداخت ${amount} تومان — ${rev.org_name}`);
        audit(admin.id, admin.display_name, "revenue_payment", `${amount} تومان — ${rev.org_name}`, ip);
        return ok({ id: Number(r.lastInsertRowid) }, 201);
      }
      if (method === "DELETE" && seg[3]) {
        const pay = db.query("SELECT * FROM revenue_payments WHERE id = ? AND revenue_id = ?").get(Number(seg[3]), revId) as any;
        if (!pay) return fail("NOT_FOUND", "پرداخت یافت نشد", 404);
        db.prepare("DELETE FROM revenue_payments WHERE id = ?").run(pay.id);
        changeLog("revenue", revId, "update", admin.display_name, `حذف پرداخت ${pay.amount} تومان`);
        audit(admin.id, admin.display_name, "revenue_payment_delete", `${pay.amount} تومان — قرارداد #${revId}`, ip);
        return ok({ deleted: true });
      }
      return fail("NOT_FOUND", "مسیر پرداخت یافت نشد", 404);
    }

    /* مستندات قرارداد — آپلود و حذف فایل */
    if (revId && seg[2] === "docs") {
      const rev = db.query("SELECT id FROM revenues WHERE id = ?").get(revId);
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
        const r = db
          .prepare("INSERT INTO revenue_docs (revenue_id, filename, original_name, mime, size, created_at) VALUES (?,?,?,?,?,?)")
          .run(revId, safeName, file.name.slice(0, 200), file.type || null, file.size, now());
        changeLog("revenue", revId, "update", admin.display_name, `سند: ${file.name.slice(0, 80)}`);
        audit(admin.id, admin.display_name, "revenue_doc", `${file.name.slice(0, 80)} — قرارداد #${revId}`, ip);
        return ok({ id: Number(r.lastInsertRowid), filename: safeName }, 201);
      }
      if (method === "DELETE" && seg[3]) {
        const doc = db.query("SELECT * FROM revenue_docs WHERE id = ? AND revenue_id = ?").get(Number(seg[3]), revId) as any;
        if (!doc) return fail("NOT_FOUND", "سند یافت نشد", 404);
        try {
          const p = join(UPLOAD_DIR, doc.filename);
          if (existsSync(p)) unlinkSync(p);
        } catch {}
        db.prepare("DELETE FROM revenue_docs WHERE id = ?").run(doc.id);
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
      const r = db
        .prepare(
          "INSERT INTO revenues (title, org_name, amount, contract_no, contract_start, contract_end, terms, contact_name, contact_phone, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
        )
        .run(
          title,
          orgName,
          amount,
          str(body.contract_no, 60) || null,
          cs,
          ce,
          str(body.terms, 2000) || null,
          str(body.contact_name, 80) || null,
          str(body.contact_phone, 30) || null,
          str(body.notes, 1000) || null,
          now(),
          now()
        );
      changeLog("revenue", Number(r.lastInsertRowid), "create", admin.display_name, `${title} — ${orgName}`);
      audit(admin.id, admin.display_name, "revenue_create", title, ip);
      return ok({ id: Number(r.lastInsertRowid) }, 201);
    }

    if (!revId) return fail("NOT_FOUND", "قرارداد یافت نشد", 404);
    if (method === "PUT") {
      const cur = db.query("SELECT * FROM revenues WHERE id = ?").get(revId) as any;
      if (!cur) return fail("NOT_FOUND", "قرارداد یافت نشد", 404);
      const cs = body.contract_start !== undefined ? revDate(body.contract_start) : cur.contract_start;
      const ce = body.contract_end !== undefined ? revDate(body.contract_end) : cur.contract_end;
      if (cs && ce && ce < cs) return fail("BAD_INPUT", "تاریخ پایان قرارداد نمی‌تواند قبل از تاریخ شروع باشد");
      db.prepare(
        "UPDATE revenues SET title=?, org_name=?, amount=?, contract_no=?, contract_start=?, contract_end=?, terms=?, contact_name=?, contact_phone=?, notes=?, updated_at=? WHERE id=?"
      ).run(
        body.title !== undefined ? str(body.title, 120) || cur.title : cur.title,
        body.org_name !== undefined ? str(body.org_name, 120) || cur.org_name : cur.org_name,
        body.amount !== undefined ? Math.max(0, Math.round(Number(body.amount) || 0)) : cur.amount,
        body.contract_no !== undefined ? str(body.contract_no, 60) || null : cur.contract_no,
        cs,
        ce,
        body.terms !== undefined ? str(body.terms, 2000) || null : cur.terms,
        body.contact_name !== undefined ? str(body.contact_name, 80) || null : cur.contact_name,
        body.contact_phone !== undefined ? str(body.contact_phone, 30) || null : cur.contact_phone,
        body.notes !== undefined ? str(body.notes, 1000) || null : cur.notes,
        now(),
        revId
      );
      changeLog("revenue", revId, "update", admin.display_name, cur.title);
      audit(admin.id, admin.display_name, "revenue_update", cur.title, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      const docs = db.query("SELECT filename FROM revenue_docs WHERE revenue_id = ?").all(revId) as any[];
      for (const doc of docs) {
        try {
          const p = join(UPLOAD_DIR, doc.filename);
          if (existsSync(p)) unlinkSync(p);
        } catch {}
      }
      db.prepare("DELETE FROM revenues WHERE id = ?").run(revId);
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
      return ok(db.prepare(sql).all(...args));
    }
    const id = Number(seg[1]) || 0;
    if (id && method === "GET") {
      const row = db.query("SELECT * FROM invoices WHERE id = ?").get(id);
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
      const count = (db.query("SELECT COUNT(*) AS c FROM invoices WHERE number LIKE ?").get(`INV-${jy}-%`) as any).c;
      let inserted: any = null;
      let number = "";
      for (let t = 0; t < 20; t++) {
        number = `INV-${jy}-${String(count + 1 + t).padStart(4, "0")}`;
        try {
          inserted = db
            .prepare(
              "INSERT INTO invoices (number, title, customer_name, customer_phone, items, discount, total, status, issue_date, due_date, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
            )
            .run(
              number,
              str(body.title, 120) || "خدمات تبلیغات",
              customer,
              str(body.customer_phone, 30) || null,
              JSON.stringify(items),
              discount,
              total,
              status,
              issueDate,
              revDate(body.due_date),
              str(body.notes, 1000) || null,
              now(),
              now()
            );
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
      const cur = db.query("SELECT * FROM invoices WHERE id = ?").get(id) as any;
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
      db.prepare(
        "UPDATE invoices SET title=?, customer_name=?, customer_phone=?, items=?, discount=?, total=?, status=?, issue_date=?, due_date=?, notes=?, updated_at=? WHERE id=?"
      ).run(
        body.title !== undefined ? str(body.title, 120) || cur.title : cur.title,
        body.customer_name !== undefined ? str(body.customer_name, 120) || cur.customer_name : cur.customer_name,
        body.customer_phone !== undefined ? str(body.customer_phone, 30) || null : cur.customer_phone,
        JSON.stringify(items),
        discount,
        total,
        status,
        body.issue_date !== undefined ? revDate(body.issue_date) || cur.issue_date : cur.issue_date,
        body.due_date !== undefined ? revDate(body.due_date) : cur.due_date,
        body.notes !== undefined ? str(body.notes, 1000) || null : cur.notes,
        now(),
        id
      );
      changeLog("invoice", id, "update", admin.display_name, cur.number);
      audit(admin.id, admin.display_name, status !== cur.status ? "invoice_status" : "invoice_update", cur.number, ip);
      return ok({ updated: true });
    }
    if (method === "DELETE") {
      const cur = db.query("SELECT number FROM invoices WHERE id = ?").get(id) as any;
      if (!cur) return fail("NOT_FOUND", "فاکتور یافت نشد", 404);
      db.prepare("DELETE FROM invoices WHERE id = ?").run(id);
      changeLog("invoice", id, "delete", admin.display_name, cur.number);
      audit(admin.id, admin.display_name, "invoice_delete", cur.number, ip);
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
