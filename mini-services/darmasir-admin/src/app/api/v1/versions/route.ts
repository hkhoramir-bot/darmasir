export const dynamic = "force-dynamic";

// نسخه‌های اپلیکیشن — فهرست و انتشار نسخه جدید
import { NextRequest } from "next/server";
import { ApiError, handler, ok, bool, num, str } from "@/lib/api";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

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

/** نشانی فایل APK — یا آدرس مطلق https یا مسیر نسبی با / */
function checkApkUrl(s: string): void {
  if (!s.startsWith("/") && !/^https:\/\/.+/i.test(s)) {
    throw new ApiError(400, "VALIDATION", "نشانی فایل باید آدرس https یا مسیری با / باشد.");
  }
}

export async function GET(req: NextRequest) {
  return handler(async () => {
    await requireAdmin(req);
    const rows = await db.appVersion.findMany({ orderBy: { versionCode: "desc" } });
    return ok(rows);
  });
}

export async function POST(req: NextRequest) {
  return handler(async () => {
    const admin = await requirePermission(req, "CREATE");
    const v = await parseBody(req);

    const versionName = reqStr(v.versionName, "نام نسخه", { min: 5, max: 20 });
    if (!/^\d+\.\d+\.\d+$/.test(versionName)) {
      throw new ApiError(400, "VALIDATION", "قالب نسخه باید مثل 4.8.17 باشد.");
    }

    const versionCode = num(v.versionCode, "کد نسخه", { int: true, min: 1, max: 999999, optional: false }) as number;
    if (await db.appVersion.findUnique({ where: { versionCode } })) {
      throw new ApiError(409, "CONFLICT", "کد نسخه تکراری است.");
    }

    const apkUrl = str(v.apkUrl, "نشانی فایل", { optional: true, max: 300 });
    if (apkUrl) checkApkUrl(apkUrl);

    const notes = str(v.notes, "یادداشت‌ها", { optional: true, max: 1000 });

    const row = await db.appVersion.create({
      data: {
        versionName,
        versionCode,
        apkUrl: apkUrl ?? null,
        notes: notes ?? null,
        mandatory: bool(v.mandatory, "اجباری", false),
        active: bool(v.active, "فعال", true),
      },
    });

    await audit(req, admin, "CREATE_VERSION", { entity: "AppVersion", entityId: row.id, detail: versionName });
    return ok(row);
  });
}
