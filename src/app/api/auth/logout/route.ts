/* ============================================================
   POST /api/auth/logout — ابطال نشست فعلی
   Header: Authorization: Bearer <token>
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (token) {
      await db.session.deleteMany({ where: { token } });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[auth/logout]", e);
    return NextResponse.json({ ok: true });
  }
}
