/* ============================================================
   GET /api/content — محتوای زنده از پنل مدیریت درمسیر
   تک منبع حقیقت: شهرها/خطوط/ایستگاه‌ها/بنرها/تنظیمات/واژگان صوتی
   در قطعی پنل: آخرین نسخه سالم از کش + connected=false
   ============================================================ */

import { NextResponse } from "next/server";
import { getPanelContent, panelCacheInfo } from "@/lib/panel";

export const dynamic = "force-dynamic";

export async function GET() {
  const content = await getPanelContent();
  if (!content) {
    return NextResponse.json(
      { ok: true, connected: false, source: "local-fallback", content: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  const info = panelCacheInfo();
  return NextResponse.json(
    {
      ok: true,
      connected: true,
      source: info.source,
      fetchedAgoMs: info.ageMs,
      content,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
