import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStation } from "@/lib/metro-data";

export const dynamic = "force-dynamic";

/** GET /api/reports?station=xxx — گزارش‌های یک ایستگاه */
export async function GET(req: NextRequest) {
  const stationId = req.nextUrl.searchParams.get("station");
  const where = stationId ? { stationId } : {};
  const reports = await db.stationReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ reports });
}

const TYPE_LABEL: Record<string, string> = {
  escalator: "پله‌برقی",
  elevator: "آسانسور",
  ramp: "رمپ متحرک",
};
const STATUS_LABEL: Record<string, string> = {
  working: "فعال و روان",
  malfunction: "متوقف و خاموش",
  under_maintenance: "در حال سرویس فنی",
};

/** POST /api/reports { stationId, equipmentType, exitLabel, status, note } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.stationId || !getStation(body.stationId)) {
    return NextResponse.json({ error: "ایستگاه نامعتبر است" }, { status: 400 });
  }
  if (!TYPE_LABEL[body.equipmentType] || !STATUS_LABEL[body.status]) {
    return NextResponse.json({ error: "نوع تجهیزات یا وضعیت نامعتبر است" }, { status: 400 });
  }
  const report = await db.stationReport.create({
    data: {
      stationId: body.stationId,
      equipmentType: body.equipmentType,
      exitLabel: body.exitLabel ?? "ورودی اصلی",
      status: body.status,
      note: body.note ?? null,
    },
  });
  return NextResponse.json({
    ok: true,
    report: { ...report, equipmentLabel: TYPE_LABEL[report.equipmentType], statusLabel: STATUS_LABEL[report.status] },
  });
}
