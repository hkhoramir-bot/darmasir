export const dynamic = "force-dynamic";

// اطلاعات مدیر جاری بر اساس نشست فعال
import { NextRequest } from "next/server";
import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return handler(async () => {
    const admin = await requireAdmin(req);
    return ok({ admin });
  });
}
