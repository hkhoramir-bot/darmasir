import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdmin, ok, fail, logAudit } from "@/lib/api";

// ============================================================
// مدیریت مدیران پنل — فقط SUPERADMIN اجازه ایجاد دارد
// ============================================================

const ROLES = ["SUPERADMIN", "OPERATOR", "VIEWER"];
const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

/** GET — فهرست مدیران (بدون hash گذرواژه) */
export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const admins = await db.adminUser.findMany({
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });
  return ok({ admins });
}

/** POST — افزودن مدیر جدید (فقط SUPERADMIN) */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const admin = guard.admin;

  if (admin.role !== "SUPERADMIN") {
    return fail("مدیریت مدیران فقط توسط مدیر ارشد سامانه امکان‌پذیر است", 403);
  }

  let body: { name?: string; username?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return fail("درخواست نامعتبر است");
  }

  const name = (body.name || "").trim();
  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";
  const role = body.role || "OPERATOR";

  if (!name || name.length < 2 || name.length > 80) {
    return fail("نام مدیر الزامی است (۲ تا ۸۰ کاراکتر)");
  }
  if (!USERNAME_RE.test(username)) {
    return fail("نام کاربری باید انگلیسی و بین ۳ تا ۳۲ کاراکتر (حروف کوچک، عدد یا _) باشد");
  }
  if (password.length < 8) {
    return fail("گذرواژه باید حداقل ۸ کاراکتر باشد");
  }
  if (!ROLES.includes(role)) {
    return fail("نقش انتخاب‌شده معتبر نیست");
  }

  const exists = await db.adminUser.findUnique({ where: { username } });
  if (exists) {
    return fail("این نام کاربری قبلاً ثبت شده است", 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await db.adminUser.create({
    data: { name, username, passwordHash, role, active: true },
    select: { id: true, username: true, name: true, role: true, active: true },
  });

  await logAudit(admin.id, "CREATE", "ADMIN", created.id, {
    username: created.username,
    role: created.role,
  });
  return ok({ admin: created }, { status: 201 });
}
