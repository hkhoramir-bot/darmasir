import { NextRequest, NextResponse } from "next/server";
import { computeRoute, getStation } from "@/lib/metro-data";

export const dynamic = "force-dynamic";

export type RoutePref = "fastest" | "least_transfers" | "quietest";

/** POST /api/route-plan — محاسبه مسیر { fromId, toId, pref } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.fromId || !body?.toId) {
    return NextResponse.json({ error: "مبدأ و مقصد را انتخاب کنید" }, { status: 400 });
  }
  const from = getStation(body.fromId);
  const to = getStation(body.toId);
  if (!from || !to) return NextResponse.json({ error: "ایستگاه یافت نشد" }, { status: 404 });
  if (from.id === to.id) {
    return NextResponse.json({ error: "مبدأ و مقصد یکسان هستند" }, { status: 400 });
  }

  const pref: RoutePref = ["fastest", "least_transfers", "quietest"].includes(body.pref)
    ? body.pref
    : "fastest";

  const plan = computeRoute(from.id, to.id, pref);
  if (!plan) return NextResponse.json({ error: "مسیری یافت نشد" }, { status: 404 });

  return NextResponse.json({ plan });
}

/** GET /api/route-plan?from=&to=&pref= */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to) return NextResponse.json({ error: "مبدأ و مقصد را انتخاب کنید" }, { status: 400 });
  const pref = (sp.get("pref") as RoutePref) ?? "fastest";
  const plan = computeRoute(from, to, pref);
  if (!plan) return NextResponse.json({ error: "مسیری یافت نشد" }, { status: 404 });
  return NextResponse.json({ plan });
}
