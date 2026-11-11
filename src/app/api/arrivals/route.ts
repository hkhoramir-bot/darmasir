import { NextRequest, NextResponse } from "next/server";
import { getStation, getLine, nextArrivalsBoth, toFa } from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/arrivals?station=xxx — قطارهای بعدی هر خط ایستگاه، به تفکیک جهت.
 * جهت‌ها با نام درستِ سرخط محاسبه می‌شوند (ایستگاه سرخط فقط یک جهت دارد).
 */
export async function GET(req: NextRequest) {
  const stationId = req.nextUrl.searchParams.get("station");
  const station = stationId ? getStation(stationId) : undefined;
  if (!station) return NextResponse.json({ error: "ایستگاه یافت نشد" }, { status: 404 });

  const now = Date.now();
  const arrivals = station.lines.map((ls) => {
    const line = getLine(ls.lineId);
    return {
      lineId: line.id,
      lineName: line.name,
      lineNumber: line.number,
      color: line.color,
      textOnColor: line.textOnColor,
      headwayLabel: toFa(line.headway),
      directions: nextArrivalsBoth(ls.lineId, station.id, now).map((d) => ({
        to: d.to,
        nextMin: Math.max(1, Math.ceil(d.minutes[0] / 60)),
        next2Min: Math.max(2, Math.ceil(d.minutes[1] / 60)),
        crowd: d.crowd,
        crowdLabel: d.crowdLabel,
      })),
      firstTrain: line.firstTrain,
      lastTrain: line.lastTrain,
    };
  });

  return NextResponse.json({ station: { id: station.id, name: station.name }, arrivals, ts: now });
}
