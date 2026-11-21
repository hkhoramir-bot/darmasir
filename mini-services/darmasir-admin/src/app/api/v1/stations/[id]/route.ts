export const dynamic = "force-dynamic";

// جزئیات، ویرایش و حذف ایستگاه — شناسه قابل تغییر نیست (v.id نادیده گرفته می‌شود)
import { NextRequest } from "next/server";
import type { Prisma, Station } from "@prisma/client";
import { ApiError, handler, ok, bool, num, str, strArray } from "@/lib/api";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };
type LineRef = { lineId: string; order: number };

const CITIES = ["tehran", "karaj", "mashhad", "isfahan"] as const;
const CITY_MSG = "شهر باید یکی از tehran، karaj، mashhad، isfahan باشد.";
const AMENITIES = ["elevator", "escalator", "wc", "atm", "baby", "parking", "bus", "taxi", "bike", "wifi"] as const;

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

function parseJson<T>(s: string, def: T): T {
  try {
    const v = JSON.parse(s);
    return (v === undefined ? def : v) as T;
  } catch {
    return def;
  }
}

function shapeStation(row: Station) {
  return {
    ...row,
    lines: parseJson<LineRef[]>(row.lines, []),
    amenities: parseJson<string[]>(row.amenities, []),
  };
}

function validateLineRefs(v: unknown): LineRef[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new ApiError(400, "VALIDATION", "فیلد «خطوط» باید آرایه غیرخالی از {lineId, order} باشد.");
  }
  const out: LineRef[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiError(400, "VALIDATION", "هر عضو «خطوط» باید شیء با lineId و order باشد.");
    }
    const o = item as Record<string, unknown>;
    const lineId = reqStr(o.lineId, "شناسه خط", { min: 1, max: 40 });
    const order = num(o.order, "ترتیب خط", { int: true, min: 0 });
    if (order === undefined) throw new ApiError(400, "VALIDATION", "فیلد «ترتیب خط» الزامی است.");
    out.push({ lineId, order });
  }
  return out;
}

async function assertLinesExist(refs: LineRef[]): Promise<void> {
  const all = await db.line.findMany({ select: { id: true } });
  const known = new Set(all.map((l) => l.id));
  for (const ref of refs) {
    if (!known.has(ref.lineId)) {
      throw new ApiError(400, "VALIDATION", `خط «${ref.lineId}» وجود ندارد.`);
    }
  }
}

async function findOrThrow(id: string): Promise<Station> {
  const row = await db.station.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "NOT_FOUND", "مورد موردنظر یافت نشد.");
  return row;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    await requireAdmin(req);
    const { id } = await ctx.params;
    return ok(shapeStation(await findOrThrow(id)));
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "UPDATE");
    const { id } = await ctx.params;
    await findOrThrow(id);

    const v = await parseBody(req);
    const data: Prisma.StationUpdateInput = {};

    if (v.name !== undefined) {
      const s = str(v.name, "نام ایستگاه", { min: 1, max: 80 });
      if (s !== undefined) data.name = s;
    }
    if (v.cityId !== undefined) data.cityId = cityOf(v.cityId);
    if (v.lines !== undefined) {
      // اگر خطوط ارسال شود، همه lineIdها دوباره اعتبارسنجی می‌شوند
      const refs = validateLineRefs(v.lines);
      await assertLinesExist(refs);
      data.lines = JSON.stringify(refs);
    }
    if (v.amenities !== undefined) {
      const amenities = strArray(v.amenities, "امکانات", 10, false) ?? [];
      for (const a of amenities) {
        if (!(AMENITIES as readonly string[]).includes(a)) {
          throw new ApiError(400, "VALIDATION", `امکان «${a}» در فهرست امکانات مجاز نیست.`);
        }
      }
      data.amenities = JSON.stringify(amenities);
    }
    if (v.featured !== undefined) data.featured = bool(v.featured, "ویژه");
    if (v.lat === null) data.lat = null;
    else if (v.lat !== undefined) {
      const n = num(v.lat, "عرض جغرافیایی", { min: -90, max: 90 });
      if (n !== undefined) data.lat = n;
    }
    if (v.lng === null) data.lng = null;
    else if (v.lng !== undefined) {
      const n = num(v.lng, "طول جغرافیایی", { min: -180, max: 180 });
      if (n !== undefined) data.lng = n;
    }

    const row = await db.station.update({ where: { id }, data });
    await audit(req, admin, "UPDATE_STATION", { entity: "Station", entityId: id, detail: row.name });
    return ok(shapeStation(row));
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const admin = await requirePermission(req, "DELETE");
    const { id } = await ctx.params;
    const existing = await findOrThrow(id);
    await db.station.delete({ where: { id } });
    await audit(req, admin, "DELETE_STATION", { entity: "Station", entityId: id, detail: existing.name });
    return ok({});
  });
}
