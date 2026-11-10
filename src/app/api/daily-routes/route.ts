import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStation } from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/** GET /api/daily-routes — مسیرهای روزمره ذخیره‌شده */
export async function GET() {
  const routes = await db.dailyRoute.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ routes });
}

/** POST /api/daily-routes { kind, label, fromStationId, toStationId } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const from = getStation(body?.fromStationId);
  const to = getStation(body?.toStationId);
  if (!from || !to) return NextResponse.json({ error: "ایستگاه نامعتبر است" }, { status: 400 });

  const kind = ["home", "work", "custom"].includes(body.kind) ? body.kind : "custom";
  const route = await db.dailyRoute.create({
    data: {
      kind,
      label: body.label ?? (kind === "home" ? "به سمت خانه" : kind === "work" ? "به سمت محل کار" : "مسیر جدید"),
      fromStationId: from.id,
      toStationId: to.id,
      fromName: from.name,
      toName: to.name,
    },
  });
  return NextResponse.json({ route });
}

/** DELETE /api/daily-routes?id=xxx */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "شناسه لازم است" }, { status: 400 });
  await db.dailyRoute.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
