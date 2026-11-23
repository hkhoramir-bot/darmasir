export const dynamic = "force-dynamic";

// جزئیات، ویرایش و حذف خط — شناسه خط قابل تغییر نیست (v.id نادیده گرفته می‌شود)
import { NextRequest } from "next/server";
import type { Line, Prisma } from "@prisma/client";
import { ApiError, handler, ok, num, str, strArray } from "@/lib/api";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const CITIES = ["tehran", "karaj", "mashhad", "isfahan"] as const;
const STATUSES = ["normal", "crowded", "delay", "closed"] as const;
const CITY_MSG = "شهر باید یکی از tehran، karaj، mashhad، isfahan باشد.";

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

function cityOf(v: unknown): string {
  const s = reqStr(v, "شهر", { min: 2, max: 20 });
  if (!(CITIES as readonly string[]).includes(s)) throw new ApiError(400, "VALIDATION", CITY_MSG);
  return s;
}

function hexOpt(v: unknown, field: string): string | undefined {
  const s = str(v, field, { optional: true, max: 20 });
  if (s === undefined) return undefined;
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید کد رنگ معتبر مثل #d81a3d باشد.`);
  }
  return s;
}

function hhmmOpt(v: unknown, field: string): string | undefined {
  const s = str(v, field, { optional: true, max: 5 });
  if (s === undefined) return undefined;
  if (!/^\d{2}:\d{2}$/.test(s)) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید در قالب HH:MM باشد.`);
  }
  return s;
}

function statusOf(v: unknown): string {
  if (v === undefined || v === null || v === "") return "normal";
  const s = String(v);
  if (!(STATUSES as readonly string[]).includes(s)) {
    throw new ApiError(400, "VALIDATION", "وضعیت باید یکی از normal، crowded، delay، closed باشد.");
  }
  return s;
}

function safeArr(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

function shape(row: Line) {
  return {
    ...row,
    terminals: safeArr(row.terminals),
    badges: row.badges ? safeArr(row.badges) : [],
  };
}

async function findOrThrow(id: string): Promise<Line> {
  const row = await db.line.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  return row;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    await requireAdmin(req);
    const { id } = await ctx.params;
    return ok(shape(await findOrThrow(id)));
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "UPDATE");
    const { id } = await ctx.params;
    await findOrThrow(id);

    const v = await parseBody(req);
    const data: Prisma.LineUpdateInput = {};

    if (v.cityId !== undefined) data.cityId = cityOf(v.cityId);
    if (v.number !== undefined) {
      const n = num(v.number, "شماره خط", { int: true, min: 1, max: 99 });
      if (n !== undefined) data.number = n;
    }
    if (v.name !== undefined) {
      const s = str(v.name, "نام خط", { min: 2, max: 60 });
      if (s !== undefined) data.name = s;
    }
    const color = hexOpt(v.color, "رنگ خط");
    if (color !== undefined) data.color = color;
    const textOnColor = hexOpt(v.textOnColor, "رنگ متن");
    if (textOnColor !== undefined) data.textOnColor = textOnColor;

    if (v.terminals !== undefined) {
      const terminals = strArray(v.terminals, "ترمینال‌ها", 4, false);
      if (!terminals || terminals.length !== 2) {
        throw new ApiError(400, "VALIDATION", "دو ترمینال لازم است.");
      }
      data.terminals = JSON.stringify(terminals);
    }
    if (v.direction !== undefined) {
      const s = str(v.direction, "جهت خط", { min: 2, max: 60 });
      if (s !== undefined) data.direction = s;
    }
    if (v.headway !== undefined) {
      const n = num(v.headway, "فاصله حرکت", { int: true, min: 1, max: 120 });
      if (n !== undefined) data.headway = n;
    }
    if (v.headwayPeak === null) data.headwayPeak = null;
    else if (v.headwayPeak !== undefined) {
      const n = num(v.headwayPeak, "فاصله حرکت در ساعت اوج", { int: true, min: 1, max: 120 });
      if (n !== undefined) data.headwayPeak = n;
    }
    if (v.headwayOff === null) data.headwayOff = null;
    else if (v.headwayOff !== undefined) {
      const n = num(v.headwayOff, "فاصله حرکت در ساعت غیراوج", { int: true, min: 1, max: 120 });
      if (n !== undefined) data.headwayOff = n;
    }
    const firstTrain = hhmmOpt(v.firstTrain, "ساعت شروع");
    if (firstTrain !== undefined) data.firstTrain = firstTrain;
    const lastTrain = hhmmOpt(v.lastTrain, "ساعت پایان");
    if (lastTrain !== undefined) data.lastTrain = lastTrain;
    if (v.segmentMinutes !== undefined) {
      const n = num(v.segmentMinutes, "زمان بین ایستگاه‌ها", { min: 0.5, max: 30 });
      if (n !== undefined) data.segmentMinutes = n;
    }
    if (v.badges === null) data.badges = null;
    else if (v.badges !== undefined) {
      const badges = strArray(v.badges, "برچسب‌ها", 6) ?? [];
      data.badges = badges.length ? JSON.stringify(badges) : null;
    }
    if (v.status !== undefined) data.status = statusOf(v.status);
    if (v.statusNote === null) data.statusNote = null;
    else if (v.statusNote !== undefined) {
      const s = str(v.statusNote, "توضیح وضعیت", { optional: true, max: 200 });
      if (s !== undefined) data.statusNote = s;
    }

    const row = await db.line.update({ where: { id }, data });
    await audit(req, admin, "UPDATE_LINE", { entity: "Line", entityId: id, detail: row.name });
    return ok(shape(row));
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "DELETE");
    const { id } = await ctx.params;
    const existing = await findOrThrow(id);
    await db.line.delete({ where: { id } });
    await audit(req, admin, "DELETE_LINE", { entity: "Line", entityId: id, detail: existing.name });
    return ok({});
  });
}
