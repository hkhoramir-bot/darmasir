import { NextRequest, NextResponse } from "next/server";
import {
  searchStations,
  getLine,
  CityId,
  AmenityKey,
  getStation,
} from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/** GET /api/search?q=&line=&facility=&city=&ids=a,b */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ids = sp.get("ids");
  const q = sp.get("q") ?? undefined;
  const lineId = sp.get("line") ?? undefined;
  const facility = (sp.get("facility") as AmenityKey | null) ?? undefined;
  const cityId = (sp.get("city") as CityId | null) ?? undefined;

  if (ids) {
    const list = ids
      .split(",")
      .map((i) => getStation(i.trim()))
      .filter(Boolean)
      .map((s) => summarize(s!));
    return NextResponse.json({ stations: list });
  }

  const results = searchStations({ q, lineId, facility, cityId }).map(summarize);
  return NextResponse.json({ count: results.length, stations: results });
}

function summarize(s: NonNullable<ReturnType<typeof getStation>>) {
  return {
    id: s.id,
    name: s.name,
    cityId: s.cityId,
    isInterchange: s.lines.length > 1,
    lines: s.lines.map((l) => {
      const line = getLine(l.lineId);
      return { id: line.id, number: line.number, name: line.name, color: line.color, textOnColor: line.textOnColor };
    }),
    amenities: s.amenities,
    featured: !!s.featured,
  };
}
