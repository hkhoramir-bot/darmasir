export const dynamic = "force-dynamic";

// تیکت‌های پشتیبانی — فهرست و ایجاد (با پیام نخست از طرف مدیر)
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { ApiError, handler, ok, str } from "@/lib/api";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

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

/** رشته الزامی — str با تضمین مقدار */
function reqStr(v: unknown, field: string, o: { min?: number; max?: number } = {}): string {
  const s = str(v, field, { ...o, optional: false });
  return s as string;
}

/** مقدار enum اختیاری — با مقدار پیش‌فرض اختیاری */
function enumOpt<T extends string>(v: unknown, field: string, allowed: readonly T[], def?: T): T | undefined {
  if (v === undefined || v === null || v === "") {
    return def;
  }
  const s = String(v);
  if (!(allowed as readonly string[]).includes(s)) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» مقدار مجاز ندارد.`);
  }
  return s as T;
}

export async function GET(req: NextRequest) {
  return handler(async () => {
    await requireAdmin(req);
    const sp = req.nextUrl.searchParams;

    const where: Prisma.TicketWhereInput = {};
    const status = sp.get("status");
    if (status) {
      if (!(STATUSES as readonly string[]).includes(status)) {
        throw new ApiError(400, "VALIDATION", "وضعیت تیکت معتبر نیست.");
      }
      where.status = status;
    }
    const priority = sp.get("priority");
    if (priority) {
      if (!(PRIORITIES as readonly string[]).includes(priority)) {
        throw new ApiError(400, "VALIDATION", "اولویت تیکت معتبر نیست.");
      }
      where.priority = priority;
    }
    const q = sp.get("q");
    if (q) where.subject = { contains: q };

    const rows = await db.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, deviceId: true } },
        _count: { select: { messages: true } },
      },
    });
    return ok(rows);
  });
}

export async function POST(req: NextRequest) {
  return handler(async () => {
    const admin = await requirePermission(req, "CREATE");
    const v = await parseBody(req);

    const subject = reqStr(v.subject, "موضوع تیکت", { min: 3, max: 150 });
    const body = reqStr(v.body, "متن پیام", { min: 3, max: 1000 });
    const category = enumOpt(v.category, "دسته‌بندی", CATEGORIES);
    const priority = enumOpt(v.priority, "اولویت", PRIORITIES, "NORMAL") as string;
    const deviceId = str(v.deviceId, "شناسه دستگاه", { optional: true, max: 100 }) ?? null;

    // اگر دستگاه در سامانه ثبت شده باشد، تیکت به کاربر متصل می‌شود
    const appUser = deviceId ? await db.appUser.findUnique({ where: { deviceId } }) : null;

    const ticket = await db.ticket.create({
      data: {
        userId: appUser?.id ?? null,
        deviceId,
        subject,
        category: category ?? null,
        priority,
        status: "OPEN",
        messages: { create: { author: "ADMIN", authorName: admin.name, body } },
      },
      include: { messages: true },
    });

    await audit(req, admin, "CREATE_TICKET", { entity: "Ticket", entityId: ticket.id, detail: subject });
    return ok(ticket);
  });
}
