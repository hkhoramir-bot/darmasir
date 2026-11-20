export const dynamic = "force-dynamic";

// خطوط حمل‌ونقل — فهرست و ایجاد
import { NextRequest } from "next/server";
import type { Line, Prisma } from "@prisma/client";
import { ApiError, handler, ok, num, str, strArray } from "@/lib/api";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

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

function hexColor(v: unknown, field: string): string {
  const s = reqStr(v, field, { max: 20 });
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید کد رنگ معتبر مثل #d81a3d باشد.`);
  }
  return s;
}

function hexColorOpt(v: unknown, field: string, def: string): string {
  const s = str(v, field, { optional: true, max: 20 });
  if (s === undefined) return def;
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید کد رنگ معتبر مثل #d81a3d باشد.`);
  }
  return s;
}

function hhmm(v: unknown, field: string, def: string): string {
  const s = str(v, field, { optional: true, max: 5 });
  if (s === undefined) return def;
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

/** بازخوانی فیلد JSON ذخیره‌شده به‌صورت رشته */
function safeArr(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

/** فیلدهای JSON رشته‌ای به آرایه بازگردانده می‌شوند */
function shape(row: Line) {
  return {
    ...row,
    terminals: safeArr(row.terminals),
    badges: row.badges ? safeArr(row.badges) : [],
  };
}

export async function GET(req: NextRequest) {
  return handler(async () => {
    await requireAdmin(req);
    const city = req.nextUrl.searchParams.get("city");
    const where: Prisma.LineWhereInput = {};
    if (city) {
      if (!(CITIES as readonly string[]).includes(city)) {
        throw new ApiError(400, "VALIDATION", CITY_MSG);
      }
      where.cityId = city;
    }
    const rows = await db.line.findMany({
      where,
      orderBy: [{ cityId: "asc" }, { number: "asc" }],
    });
    return ok(rows.map(shape));
  });
}

export async function POST(req: NextRequest) {
  return handler(async () => {
    const admin = await requirePermission(req, "CREATE");
    const v = await parseBody(req);

    const id = reqStr(v.id, "شناسه خط", { min: 2, max: 24 });
    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new ApiError(400, "VALIDATION", "شناسه خط فقط حروف لاتین کوچک، عدد و خط تیره.");
    }
    if (await db.line.findUnique({ where: { id } })) {
      throw new ApiError(409, "CONFLICT", "خطی با این شناسه وجود دارد.");
    }

    const terminals = strArray(v.terminals, "ترمینال‌ها", 4, false);
    if (!terminals || terminals.length !== 2) {
      throw new ApiError(400, "VALIDATION", "دو ترمینال لازم است.");
    }
    const badges = strArray(v.badges, "برچسب‌ها", 6) ?? [];

    const row = await db.line.create({
      data: {
        id,
        cityId: cityOf(v.cityId),
        number: num(v.number, "شماره خط", { int: true, min: 1, max: 99, optional: false }) as number,
        name: reqStr(v.name, "نام خط", { min: 2, max: 60 }),
        color: hexColor(v.color, "رنگ خط"),
        textOnColor: hexColorOpt(v.textOnColor, "رنگ متن", "#ffffff"),
        terminals: JSON.stringify(terminals),
        direction: reqStr(v.direction, "جهت خط", { min: 2, max: 60 }),
        headway: num(v.headway, "فاصله حرکت", { int: true, min: 1, max: 120 }) ?? 10,
        headwayPeak:
          num(v.headwayPeak, "فاصله حرکت در ساعت اوج", { int: true, min: 1, max: 120, optional: true }) ?? null,
        headwayOff:
          num(v.headwayOff, "فاصله حرکت در ساعت غیراوج", { int: true, min: 1, max: 120, optional: true }) ?? null,
        firstTrain: hhmm(v.firstTrain, "ساعت شروع", "04:30"),
        lastTrain: hhmm(v.lastTrain, "ساعت پایان", "22:30"),
        segmentMinutes: num(v.segmentMinutes, "زمان بین ایستگاه‌ها", { min: 0.5, max: 30 }) ?? 2.5,
        badges: badges.length ? JSON.stringify(badges) : null,
        status: statusOf(v.status),
        statusNote: str(v.statusNote, "توضیح وضعیت", { optional: true, max: 200 }) ?? null,
      },
    });

    await audit(req, admin, "CREATE_LINE", { entity: "Line", entityId: row.id, detail: row.name });
    return ok(shape(row));
  });
}
