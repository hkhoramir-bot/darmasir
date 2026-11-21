import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLOUD_API_BASE =
  process.env.CLOUD_API_BASE?.trim() || "https://darmasir-api.hkhoramir.workers.dev/api/v1";

/**
 * POST /api/ads/track — ثبت نمایش/کلیک بنر
 * آمار همزمان در سرور ابری (منبع اصلی) و پنل مدیریت ثبت می‌شود.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: number; type?: string } | null;
  const id = Number(body?.id) || 0;
  const type = String(body?.type ?? "");
  if (!id || (type !== "impression" && type !== "click")) {
    return NextResponse.json({ ok: false, error: "BAD_INPUT" }, { status: 400 });
  }

  const payload = JSON.stringify({ id, type });

  // ابر — منبع اصلی آمار
  const cloud = fetch(`${CLOUD_API_BASE}/public/ads/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  }).catch(() => null);

  // پنل — آمار محلی برای گزارش‌های مدیریتی
  const panel = fetch("http://localhost:3035/api/v1/public/ads/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  }).catch(() => null);

  const results = await Promise.allSettled([cloud, panel]);
  const cloudOk = results[0].status === "fulfilled" && results[0].value?.ok === true;

  return NextResponse.json(
    { ok: true, tracked: true, cloud: cloudOk },
    { headers: { "Cache-Control": "no-store" } }
  );
}
