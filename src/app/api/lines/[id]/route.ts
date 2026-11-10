import { NextRequest, NextResponse } from "next/server";
import {
  getLine,
  stationsOfLine,
  lineInterchanges,
  timetableFor,
  toFa,
  crowdingNow,
  nextArrivals,
  CROWD_LABEL,
  LINES,
} from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/** GET /api/lines/[id] — جزئیات کامل خط به‌همراه ایستگاه‌ها */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const line = LINES.find((l) => l.id === id);
  if (!line) return NextResponse.json({ error: "خط یافت نشد" }, { status: 404 });

  const stations = stationsOfLine(id).map((s, idx, arr) => {
    const linesOfStation = s.lines.map((l) => l.lineId).filter((lid) => lid !== id);
    const arrivals = nextArrivals(id, s.id);
    return {
      id: s.id,
      name: s.name,
      order: s.lines.find((l) => l.lineId === id)!.order,
      amenities: s.amenities,
      isInterchange: linesOfStation.length > 0,
      otherLines: linesOfStation.map((lid) => {
        const ol = getLine(lid);
        return { id: ol.id, number: ol.number, name: ol.name, color: ol.color };
      }),
      arrival: Math.ceil(arrivals[0] / 60),
      position: idx,
      isFirst: idx === 0,
      isLast: idx === arr.length - 1,
    };
  });

  return NextResponse.json({
    line: { ...line, badges: line.badges ?? [] },
    stats: {
      stationCount: stations.length,
      interchangeCount: lineInterchanges(id).length,
      totalMinutes: Math.round(stations.length * line.segmentMinutes),
      headwayLabel: toFa(line.headway),
      crowd: crowdingNow(id),
      crowdLabel: CROWD_LABEL[crowdingNow(id)],
    },
    timetable: timetableFor(id),
    stations,
  });
}
