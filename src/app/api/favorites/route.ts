import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStation, getLine } from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/** GET /api/favorites — لیست ایستگاه‌های نشان‌شده */
export async function GET() {
  const favs = await db.favorite.findMany({ orderBy: { createdAt: "desc" } });
  const stations = favs
    .map((f) => {
      const s = getStation(f.stationId);
      if (!s) return null;
      return {
        id: s.id,
        name: s.name,
        isInterchange: s.lines.length > 1,
        lines: s.lines.map((l) => {
          const line = getLine(l.lineId);
          return { id: line.id, number: line.number, name: line.name, color: line.color, textOnColor: line.textOnColor };
        }),
        amenities: s.amenities,
        favoritedAt: f.createdAt,
      };
    })
    .filter(Boolean);
  return NextResponse.json({ favorites: stations, ids: favs.map((f) => f.stationId) });
}

/** POST /api/favorites { stationId } */
export async function POST(req: NextRequest) {
  const { stationId } = await req.json().catch(() => ({}));
  if (!stationId || !getStation(stationId)) {
    return NextResponse.json({ error: "ایستگاه نامعتبر است" }, { status: 400 });
  }
  await db.favorite.upsert({
    where: { stationId },
    update: {},
    create: { stationId },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/favorites?stationId=xxx */
export async function DELETE(req: NextRequest) {
  const stationId = req.nextUrl.searchParams.get("stationId");
  if (!stationId) return NextResponse.json({ error: "شناسه لازم است" }, { status: 400 });
  await db.favorite.deleteMany({ where: { stationId } });
  return NextResponse.json({ ok: true });
}
