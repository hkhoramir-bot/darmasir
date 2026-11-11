import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStation } from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/** GET /api/lost-items?stationId=xxx&kind=lost|found — فهرست اشیای گمشده و پیدا شده */
export async function GET(req: NextRequest) {
  const stationId = req.nextUrl.searchParams.get("stationId") ?? undefined;
  const kind = req.nextUrl.searchParams.get("kind") ?? undefined;

  const items = await db.lostItem.findMany({
    where: {
      ...(stationId ? { stationId } : {}),
      ...(kind === "lost" || kind === "found" ? { kind } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ items });
}

/** POST /api/lost-items { kind, title, stationId, description?, contact? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const kind = body?.kind === "found" ? "found" : body?.kind === "lost" ? "lost" : null;
  const station = body?.stationId ? getStation(body.stationId) : undefined;
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!kind) return NextResponse.json({ error: "نوع (گمشده/پیدا‌شده) نامعتبر است" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "عنوان شیء لازم است" }, { status: 400 });
  if (!station) return NextResponse.json({ error: "ایستگاه نامعتبر است" }, { status: 400 });

  const item = await db.lostItem.create({
    data: {
      kind,
      title: title.slice(0, 120),
      description: typeof body?.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 500)
        : null,
      stationId: station.id,
      contact:
        typeof body?.contact === "string" && body.contact.trim()
          ? body.contact.trim().slice(0, 60)
          : null,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}

/** DELETE /api/lost-items?id=xxx */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "شناسه لازم است" }, { status: 400 });
  await db.lostItem.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
