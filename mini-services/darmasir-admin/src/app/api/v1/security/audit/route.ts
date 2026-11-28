import { db } from "@/lib/db";
import { requireAdmin, ok } from "@/lib/api";

// ============================================================
// لاگ‌های ممیزی — فیلتر action/entity + صفحه‌بندی (پیش‌فرض ۱۵)
// ============================================================

export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const action = url.searchParams.get("action")?.trim() || "";
  const entity = url.searchParams.get("entity")?.trim() || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSizeRaw = Number(url.searchParams.get("pageSize") || 15) || 15;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));

  const where: { action?: string; entity?: string } = {};
  if (action) where.action = action;
  if (entity) where.entity = entity;

  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        admin: { select: { id: true, name: true, username: true, role: true } },
      },
    }),
  ]);

  return ok({ items, total, page, pageSize });
}
