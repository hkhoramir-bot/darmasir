/* ============================================================
   GET /api/auth/me — اطلاعات کاربر از روی توکن نشست
   Header: Authorization: Bearer <token>
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, publicUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "نشست نامعتبر یا منقضی است" }, { status: 401 });
    }
    return NextResponse.json({ user: publicUser(user) });
  } catch (e) {
    console.error("[auth/me]", e);
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}
