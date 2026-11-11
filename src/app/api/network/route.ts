import { NextRequest, NextResponse } from "next/server";
import { CITIES, CityId, getCity, LINES, lineInterchanges, stationsOfLine, crowdingNow, toFa } from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/** GET /api/network?city=tehran — خطوط یک شهر به‌همراه شمار ایستگاه‌ها و تقاطع‌ها */
export async function GET(req: NextRequest) {
  const cityId = (req.nextUrl.searchParams.get("city") ?? "tehran") as CityId;
  const city = getCity(cityId);

  const lines = city.lineIds.map((lid) => {
    const line = LINES.find((l) => l.id === lid)!;
    const stations = stationsOfLine(lid);
    const interchanges = lineInterchanges(lid);
    return {
      id: line.id,
      number: line.number,
      name: line.name,
      color: line.color,
      textOnColor: line.textOnColor,
      terminals: line.terminals,
      direction: line.direction,
      headway: line.headway,
      headwayLabel: toFa(line.headway),
      stationCount: stations.length,
      interchangeCount: interchanges.length,
      badges: line.badges ?? [],
      status: line.status ?? "normal",
      statusNote: line.statusNote,
      crowd: crowdingNow(lid),
    };
  });

  return NextResponse.json({
    city: { id: city.id, name: city.name, subtitle: city.subtitle, lines: city.lineIds.length },
    cities: CITIES.map((c) => ({ id: c.id, name: c.name, subtitle: c.subtitle, lines: c.lineIds.length })),
    lines,
  });
}
