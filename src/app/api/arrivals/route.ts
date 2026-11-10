import { NextRequest, NextResponse } from "next/server";
import { getStation, getLine, nextArrivals, toFa, crowdingNow, CROWD_LABEL } from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/** GET /api/arrivals?station=xxx — قطارهای بعدی هر خط ایستگاه */
export async function GET(req: NextRequest) {
  const stationId = req.nextUrl.searchParams.get("station");
  const station = stationId ? getStation(stationId) : undefined;
  if (!station) return NextResponse.json({ error: "ایستگاه یافت نشد" }, { status: 404 });

  const now = Date.now();
  const arrivals = station.lines.map((ls) => {
    const line = getLine(ls.lineId);
    const [a1, a2] = nextArrivals(ls.lineId, station.id, now);
    return {
      lineId: line.id,
      lineName: line.name,
      lineNumber: line.number,
      color: line.color,
      textOnColor: line.textOnColor,
      headwayLabel: toFa(line.headway),
      to: line.terminals[1],
      toBack: line.terminals[0],
      nextMin: Math.max(1, Math.ceil(a1 / 60)),
      next2Min: Math.max(2, Math.ceil(a2 / 60)),
      crowd: crowdingNow(ls.lineId),
      crowdLabel: CROWD_LABEL[crowdingNow(ls.lineId)],
      firstTrain: line.firstTrain,
      lastTrain: line.lastTrain,
    };
  });

  return NextResponse.json({ station: { id: station.id, name: station.name }, arrivals, ts: now });
}
