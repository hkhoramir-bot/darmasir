import { NextResponse } from "next/server";
import { CityId, getCity, LINES, crowdingNow, CROWD_LABEL, CROWD_COLOR, toFa, STATIONS, stationsOfLine } from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/** GET /api/status — وضعیت شلوغی و تاخیر خطوط */
export async function GET() {
  const city: CityId = "tehran";
  const c = getCity(city);

  const lines = c.lineIds.map((lid) => {
    const line = LINES.find((l) => l.id === lid)!;
    const crowd = crowdingNow(lid);
    return {
      id: line.id,
      name: line.name,
      number: line.number,
      color: line.color,
      textOnColor: line.textOnColor,
      terminals: line.terminals,
      headwayLabel: toFa(line.headway),
      stationCount: stationsOfLine(lid).length,
      status: line.status ?? "normal",
      statusNote: line.statusNote ?? "سرویس‌دهی عادی و روان",
      crowd,
      crowdLabel: CROWD_LABEL[crowd],
      crowdColor: CROWD_COLOR[crowd],
    };
  });

  const alerts = lines
    .filter((l) => l.status !== "normal")
    .map((l) => ({
      lineId: l.id,
      lineName: l.name,
      color: l.color,
      severity: l.status === "delay" ? "high" : "medium",
      title: l.status === "delay" ? `تاخیر در ${l.name}` : `ازدحام در ${l.name}`,
      body: l.statusNote ?? "",
      time: toFa(new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })),
    }));

  return NextResponse.json({
    city: { id: c.id, name: c.name },
    totalStations: STATIONS.filter((s) => s.cityId === city).length,
    lines,
    alerts,
  });
}
