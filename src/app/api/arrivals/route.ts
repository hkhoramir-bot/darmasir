import { NextRequest, NextResponse } from "next/server";
import { getStation, getLine, nextArrivalsBoth, headwayAt, toFa } from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/arrivals?station=xxx — قطارهای بعدی هر خط ایستگاه، به تفکیک جهت.
 * زمان‌ها بر اساس جدول حرکت رسمی محاسبه می‌شود (مترو تهران فید لحظه‌ای عمومی ندارد).
 * جهت‌ها با نام درستِ سرخط محاسبه می‌شوند (ایستگاه سرخط فقط یک جهت دارد).
 */
export async function GET(req: NextRequest) {
  const stationId = req.nextUrl.searchParams.get("station");
  const station = stationId ? getStation(stationId) : undefined;
  if (!station) return NextResponse.json({ error: "ایستگاه یافت نشد" }, { status: 404 });

  const now = Date.now();
  const d = new Date(now);
  const nowMin = d.getHours() * 60 + d.getMinutes();

  const arrivals = station.lines.map((ls) => {
    const line = getLine(ls.lineId);
    return {
      lineId: line.id,
      lineName: line.name,
      lineNumber: line.number,
      color: line.color,
      textOnColor: line.textOnColor,
      headwayLabel: toFa(headwayAt(line, nowMin)),
      directions: nextArrivalsBoth(ls.lineId, station.id, now).map((dir) => ({
        to: dir.to,
        nextMin: dir.minutes[0] ?? null,
        next2Min: dir.minutes[1] ?? null,
        nextAt: dir.at[0] ?? null,
        next2At: dir.at[1] ?? null,
        outOfService: dir.outOfService,
        crowd: dir.crowd,
        crowdLabel: dir.crowdLabel,
      })),
      firstTrain: line.firstTrain,
      lastTrain: line.lastTrain,
    };
  });

  return NextResponse.json({
    station: { id: station.id, name: station.name },
    arrivals,
    scheduleNote: "بر اساس جدول حرکت رسمی",
    ts: now,
  });
}
