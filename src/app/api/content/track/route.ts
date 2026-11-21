/* ============================================================
   POST /api/content/track — ثبت نمایش/کلیک بنر در پنل
   { id, type: "impression" | "click" } → آمار واقعی بنر در پنل
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { trackAdEvent } from "@/lib/panel";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id) || 0;
  const type = String(body?.type ?? "");
  if (!id || (type !== "impression" && type !== "click")) {
    return NextResponse.json({ ok: false, error: "پارامتر نامعتبر" }, { status: 400 });
  }
  const tracked = await trackAdEvent(id, type);
  return NextResponse.json({ ok: tracked }, { headers: { "Cache-Control": "no-store" } });
}
