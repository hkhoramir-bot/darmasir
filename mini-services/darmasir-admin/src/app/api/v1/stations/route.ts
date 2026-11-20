export const dynamic = "force-dynamic";

// ایستگاه‌ها — فهرست با فیلتر شهر/جست‌وجو/خط و ایجاد
import { NextRequest } from "next/server";
import type { Prisma, Station } from "@prisma/client";
import { ApiError, handler, ok, bool, num, str, strArray } from "@/lib/api";
import { requireAdmin, requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

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

/** بازخوانی فیلد JSON ذخیره‌شده به‌صورت رشته */
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

/** اعتبارسنجی آرایه خطوط ایستگاه — هر عضو {lineId, order} */
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

/** همه شناسه‌های خط باید در جدول خطوط موجود باشند */
async function assertLinesExist(refs: LineRef[]): Promise<void> {
  const all = await db.line.findMany({ select: { id: true } });
  const known = new Set(all.map((l) => l.id));
  for (const ref of refs) {
    if (!known.has(ref.lineId)) {
      throw new ApiError(400, "VALIDATION", `خط «${ref.lineId}» وجود ندارد.`);
    }
  }
}

export async function GET(req: NextRequest) {
  return handler(async () => {
    await requireAdmin(req);
    const sp = req.nextUrl.searchParams;
    const city = sp.get("city");
    const q = sp.get("q");
    const lineId = sp.get("lineId");

    const where: Prisma.StationWhereInput = {};
    if (city) {
      if (!(CITIES as readonly string[]).includes(city)) {
        throw new ApiError(400, "VALIDATION", CITY_MSG);
      }
      where.cityId = city;
    }
    if (q) where.name = { contains: q };

    let rows = await db.station.findMany({ where, orderBy: { name: "asc" } });
    // فیلتر بر اساس خط در حافظه انجام می‌شود (تعداد ایستگاه‌ها محدود است)
    if (lineId) {
      rows = rows.filter((r) => {
        const refs = parseJson<unknown>(r.lines, []);
        return Array.isArray(refs) && refs.some((l) => (l as LineRef)?.lineId === lineId);
      });
    }
    return ok(rows.map(shapeStation));
  });
}

export async function POST(req: NextRequest) {
  return handler(async () => {
    const admin = await requirePermission(req, "CREATE");
    const v = await parseBody(req);

    const id = reqStr(v.id, "شناسه ایستگاه", { min: 2, max: 40 });
    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new ApiError(400, "VALIDATION", "شناسه ایستگاه فقط حروف لاتین کوچک، عدد و خط تیره.");
    }
    if (await db.station.findUnique({ where: { id } })) {
      throw new ApiError(409, "CONFLICT", "ایستگاهی با این شناسه وجود دارد.");
    }

    const refs = validateLineRefs(v.lines);
    await assertLinesExist(refs);

    const amenities = strArray(v.amenities, "امکانات", 10) ?? [];
    for (const a of amenities) {
      if (!(AMENITIES as readonly string[]).includes(a)) {
        throw new ApiError(400, "VALIDATION", `امکان «${a}» در فهرست امکانات مجاز نیست.`);
      }
    }

    const row = await db.station.create({
      data: {
        id,
        name: reqStr(v.name, "نام ایستگاه", { min: 1, max: 80 }),
        cityId: cityOf(v.cityId),
        lines: JSON.stringify(refs),
        amenities: JSON.stringify(amenities),
        featured: bool(v.featured, "ویژه", false),
        lat: num(v.lat, "عرض جغرافیایی", { min: -90, max: 90, optional: true }) ?? null,
        lng: num(v.lng, "طول جغرافیایی", { min: -180, max: 180, optional: true }) ?? null,
      },
    });

    await audit(req, admin, "CREATE_STATION", { entity: "Station", entityId: row.id, detail: row.name });
    return ok(shapeStation(row));
  });
}
