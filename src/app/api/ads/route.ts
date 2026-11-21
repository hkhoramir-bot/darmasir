import { NextResponse } from "next/server";
import { getContent, type CloudAd } from "@/lib/panel-content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/ads?placement=home — بنرهای فعال فقط از پنل مدیریت
 * (از راه سرور ابری؛ پشتیبان: دیتابیس پنل). فیلتر فعال/بازه زمانی
 * پیش‌تر روی منبع انجام شده است — اینجا فقط جایگاه و سقف اعمال می‌شود.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const placement = (url.searchParams.get("placement") ?? "home").trim() || "home";
  const limit = Math.min(6, Math.max(1, Number(url.searchParams.get("limit") ?? 3) || 3));

  const content = await getContent();
  const ads = (content.ads ?? [])
    .filter((a: CloudAd) => (a.placement ?? "home") === placement)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id - b.id)
    .slice(0, limit);

  return NextResponse.json(
    {
      ok: true,
      source: content.source,
      ads,
      rotationSeconds: Number(content.settings?.ads_rotation_seconds ?? 6) || 6,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
