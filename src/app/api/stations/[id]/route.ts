import { NextRequest, NextResponse } from "next/server";
import {
  getLine,
  getStation,
  stationsOfLine,
  amenitiesLabels,
  exitsFor,
  equipmentFor,
  timetableFor,
  landmarksFor,
  nextArrivals,
  crowdingNow,
  CROWD_LABEL,
} from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/** GET /api/stations/[id] — جزئیات کامل ایستگاه */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const station = getStation(id);
  if (!station) return NextResponse.json({ error: "ایستگاه یافت نشد" }, { status: 404 });

  const lines = station.lines.map((ls) => {
    const line = getLine(ls.lineId);
    const arrivals = nextArrivals(ls.lineId, id);
    return {
      id: line.id,
      number: line.number,
      name: line.name,
      color: line.color,
      textOnColor: line.textOnColor,
      terminals: line.terminals,
      order: ls.order,
      headway: line.headway,
      arrivalsMin: arrivals.map((a) => Math.max(1, Math.ceil(a / 60))),
      firstLast: timetableFor(ls.lineId),
      crowd: crowdingNow(ls.lineId),
      crowdLabel: CROWD_LABEL[crowdingNow(ls.lineId)],
      neighborStations: stationsOfLine(ls.lineId)
        .filter((s) => Math.abs(s.lines.find((x) => x.lineId === ls.lineId)!.order - ls.order) === 1)
        .map((s) => s.name),
    };
  });

  return NextResponse.json({
    id: station.id,
    name: station.name,
    cityId: station.cityId,
    isInterchange: station.lines.length > 1,
    depthLabel: `${20 + (station.id.length % 18)} متر`,
    lines,
    amenities: amenitiesLabels(station.amenities),
    exits: exitsFor(id),
    equipment: equipmentFor(id),
    landmarks: landmarksFor(id),
  });
}
