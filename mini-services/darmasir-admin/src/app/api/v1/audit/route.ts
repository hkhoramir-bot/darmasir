export const dynamic = "force-dynamic";

// گزارش رویدادهای مدیریتی — فقط SUPERADMIN (اکشن ADMIN)
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { handler, ok, num } from "@/lib/api";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  return handler(async () => {
    await requirePermission(req, "ADMIN");
    const sp = req.nextUrl.searchParams;

    const page = num(sp.get("page"), "شماره صفحه", { int: true, min: 1 }) ?? 1;
    const pageSize = num(sp.get("pageSize"), "اندازه صفحه", { int: true, min: 10, max: 100 }) ?? 50;

    const where: Prisma.AuditLogWhereInput = {};
    const action = sp.get("action");
    if (action) where.action = action;
    const adminId = sp.get("adminId");
    if (adminId) where.adminId = adminId;

    const [items, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.auditLog.count({ where }),
    ]);
    return ok({ items, total, page, pageSize });
  });
}
