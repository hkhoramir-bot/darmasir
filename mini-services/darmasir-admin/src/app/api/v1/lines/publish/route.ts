import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, ok, fail, logAudit } from "@/lib/api";

// ============================================================
// انتشار تغییرات به اپلیکیشن / اعمال همگانی سرفاصله
// GET : آخرین انتشار ثبت‌شده (برای نمایش در هدر صفحه)
// POST: ثبت رویداد انتشار یا اعمال همگانی سرفاصله با یادداشت Audit Log
// ============================================================

const SETTING_KEY = "lines_last_publish";

type PublishInfo = {
  kind: "PUBLISH" | "HEADWAY";
  at: string;
  byName: string;
  note?: string;
  lineCode?: string;
};

export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const setting = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!setting) return ok({ lastPublish: null });

  try {
    return ok({ lastPublish: JSON.parse(setting.value) as PublishInfo });
  } catch {
    return ok({ lastPublish: null });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const { admin } = guard;
  if (admin.role === "VIEWER") return fail("دسترسی شما فقط مشاهده است", 403);

  let body: { kind?: string; note?: string; lineId?: string; config?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("درخواست نامعتبر است");
  }

  const kind = body.kind === "HEADWAY" ? "HEADWAY" : "PUBLISH";

  let lineCode: string | undefined;
  if (body.lineId) {
    const line = await db.line.findUnique({ where: { id: body.lineId } });
    if (!line) return fail("خط مورد نظر یافت نشد", 404);
    lineCode = line.code;
  }

  const info: PublishInfo = {
    kind,
    at: new Date().toISOString(),
    byName: admin.name,
    note: body.note?.trim() || undefined,
    lineCode,
  };

  await db.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(info) },
    update: { value: JSON.stringify(info) },
  });

  await logAudit(admin.id, kind === "HEADWAY" ? "UPDATE" : "PUBLISH", "LINE", body.lineId ?? undefined, {
    action: kind,
    note: info.note,
    config: body.config ?? null,
  });

  return ok({ lastPublish: info });
}
