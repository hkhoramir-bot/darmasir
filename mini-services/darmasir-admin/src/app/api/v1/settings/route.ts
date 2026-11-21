export const dynamic = "force-dynamic";

// تنظیمات سیستم — ذخیره کلید/مقدار ساده
import { NextRequest } from "next/server";
import { ApiError, handler, ok } from "@/lib/api";
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

export async function GET(req: NextRequest) {
  return handler(async () => {
    await requireAdmin(req);
    const rows = await db.setting.findMany({ orderBy: { key: "asc" } });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return ok(out);
  });
}

export async function PUT(req: NextRequest) {
  return handler(async () => {
    const admin = await requirePermission(req, "UPDATE");

    const v = await parseBody(req);
    const keys = Object.keys(v);
    if (keys.length === 0) {
      throw new ApiError(400, "VALIDATION", "هیچ تنظیمی برای ذخیره ارسال نشده است.");
    }
    if (keys.length > 40) {
      throw new ApiError(400, "VALIDATION", "حداکثر ۴۰ کلید در هر درخواست مجاز است.");
    }

    for (const k of keys) {
      if (!/^[a-z0-9_.-]{2,60}$/.test(k)) {
        throw new ApiError(400, "VALIDATION", `کلید «${k}» معتبر نیست.`);
      }
      const value = String(v[k] ?? "");
      if (value.length > 500) {
        throw new ApiError(400, "VALIDATION", `مقدار کلید «${k}» حداکثر ۵۰۰ نویسه است.`);
      }
      await db.setting.upsert({ where: { key: k }, update: { value }, create: { key: k, value } });
    }

    await audit(req, admin, "UPDATE_SETTINGS", { entity: "Setting", detail: keys.join(", ") });
    return ok({ updated: keys });
  });
}
