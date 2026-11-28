export const dynamic = "force-dynamic";

// مدیریت مدیران — فقط SUPERADMIN (اکشن ADMIN)
import { NextRequest } from "next/server";
import { ApiError, handler, ok, str } from "@/lib/api";
import { requirePermission, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

const ROLES = ["SUPERADMIN", "OPERATOR", "VIEWER"] as const;

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
    return j as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "بدنه درخواست معتبر نیست.");
  }
}

/** رشته الزامی — str با تضمین مقدار */
function reqStr(v: unknown, field: string, o: { min?: number; max?: number } = {}): string {
  const s = str(v, field, { ...o, optional: false });
  return s as string;
}

const ADMIN_SELECT = {
  id: true,
  username: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export async function GET(req: NextRequest) {
  return handler(async () => {
    await requirePermission(req, "ADMIN");
    const rows = await db.adminUser.findMany({
      orderBy: { createdAt: "asc" },
      select: { ...ADMIN_SELECT, _count: { select: { sessions: true } } },
    });
    return ok(rows);
  });
}

export async function POST(req: NextRequest) {
  return handler(async () => {
    const admin = await requirePermission(req, "ADMIN");
    const v = await parseBody(req);

    const username = reqStr(v.username, "نام کاربری", { min: 3, max: 30 });
    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
      throw new ApiError(400, "VALIDATION", "نام کاربری فقط حروف لاتین کوچک، عدد، نقطه، خط تیره و زیرخط");
    }
    if (await db.adminUser.findUnique({ where: { username } })) {
      throw new ApiError(409, "CONFLICT", "نام کاربری تکراری است.");
    }

    const name = reqStr(v.name, "نام", { min: 2, max: 60 });
    const role = String(v.role ?? "VIEWER");
    if (!(ROLES as readonly string[]).includes(role)) {
      throw new ApiError(400, "VALIDATION", "نقش باید یکی از SUPERADMIN، OPERATOR، VIEWER باشد.");
    }

    const password = reqStr(v.password, "گذرواژه", { max: 72 });
    if (password.length < 8) {
      throw new ApiError(400, "VALIDATION", "گذرواژه باید حداقل ۸ نویسه باشد.");
    }

    const row = await db.adminUser.create({
      data: { username, name, role, passwordHash: hashPassword(password), active: true },
      select: ADMIN_SELECT,
    });

    await audit(req, admin, "CREATE_ADMIN", { entity: "AdminUser", entityId: row.id, detail: username });
    return ok(row);
  });
}
