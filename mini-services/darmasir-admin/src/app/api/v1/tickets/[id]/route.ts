export const dynamic = "force-dynamic";

// جزئیات، ویرایش و حذف تیکت — پیام‌ها به‌ترتیب زمانی برمی‌گردند
import { NextRequest } from "next/server";
import type { Prisma, Ticket } from "@prisma/client";
import { ApiError, handler, ok } from "@/lib/api";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ["OPEN", "PENDING", "CLOSED"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
const CATEGORIES = ["BUG", "SUGGESTION", "BILLING", "OTHER"] as const;

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
    return j as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "بدنه درخواست معتبر نیست.");
  }
}

async function findOrThrow(id: string): Promise<Ticket> {
  const row = await db.ticket.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  return row;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    await requireAdmin(req);
    const { id } = await ctx.params;
    await findOrThrow(id);
    const ticket = await db.ticket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        user: { select: { name: true, deviceId: true } },
      },
    });
    return ok(ticket);
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "UPDATE");
    const { id } = await ctx.params;
    await findOrThrow(id);

    const v = await parseBody(req);
    const data: Prisma.TicketUpdateInput = {};

    if (v.status !== undefined) {
      const s = String(v.status);
      if (!(STATUSES as readonly string[]).includes(s)) {
        throw new ApiError(400, "VALIDATION", "وضعیت تیکت معتبر نیست.");
      }
      data.status = s;
    }
    if (v.priority !== undefined) {
      const s = String(v.priority);
      if (!(PRIORITIES as readonly string[]).includes(s)) {
        throw new ApiError(400, "VALIDATION", "اولویت تیکت معتبر نیست.");
      }
      data.priority = s;
    }
    if (v.category === null) data.category = null;
    else if (v.category !== undefined) {
      const s = String(v.category);
      if (!(CATEGORIES as readonly string[]).includes(s)) {
        throw new ApiError(400, "VALIDATION", "دسته‌بندی تیکت معتبر نیست.");
      }
      data.category = s;
    }

    const row = await db.ticket.update({ where: { id }, data });
    await audit(req, admin, "UPDATE_TICKET", {
      entity: "Ticket",
      entityId: id,
      detail: `${row.subject} (وضعیت: ${row.status})`,
    });
    return ok(row);
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "DELETE");
    const { id } = await ctx.params;
    const existing = await findOrThrow(id);
    // پیام‌ها با Cascade حذف می‌شوند
    await db.ticket.delete({ where: { id } });
    await audit(req, admin, "DELETE_TICKET", { entity: "Ticket", entityId: id, detail: existing.subject });
    return ok({});
  });
}
