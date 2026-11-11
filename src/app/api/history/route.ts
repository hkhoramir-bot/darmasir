import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStation } from "@/lib/metro-data";
import { computeRoute } from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/** GET /api/history — تاریخچه سفرها */
export async function GET() {
  const trips = await db.tripHistory.findMany({ orderBy: { createdAt: "desc" }, take: 40 });
  const stats = {
    count: trips.length,
    minutes: trips.reduce((a, t) => a + t.minutes, 0),
    fare: trips.reduce((a, t) => a + t.fare, 0),
    topFrom: trips.length ? trips[0].fromName : null,
  };
  return NextResponse.json({ trips, stats });
}

/** POST /api/history { fromStationId, toStationId, pref } — ثبت سفر تازه */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const from = getStation(body?.fromStationId);
  const to = getStation(body?.toStationId);
  if (!from || !to) return NextResponse.json({ error: "ایستگاه نامعتبر است" }, { status: 400 });

  const plan = computeRoute(from.id, to.id, body?.pref ?? "fastest");
  if (!plan) return NextResponse.json({ error: "مسیری یافت نشد" }, { status: 404 });

  const trip = await db.tripHistory.create({
    data: {
      fromStationId: from.id,
      fromName: from.name,
      toStationId: to.id,
      toName: to.name,
      minutes: plan.totalMinutes,
      transfers: plan.transfers,
      fare: plan.fare,
      pref: plan.pref,
    },
  });
  return NextResponse.json({ trip });
}

/** DELETE /api/history?id=xxx  |  ?all=1 */
export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("all")) {
    await db.tripHistory.deleteMany({});
    return NextResponse.json({ ok: true });
  }
  const id = sp.get("id");
  if (!id) return NextResponse.json({ error: "شناسه لازم است" }, { status: 400 });
  await db.tripHistory.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
