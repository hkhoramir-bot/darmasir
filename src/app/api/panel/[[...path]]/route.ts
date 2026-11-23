export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";

// ============================================================
// پروکسی پنل مدیریت درمسیر — سندباکس
// اپ پنل مستقل روی پورت 3030 اجرا می‌شود (basePath=/api/panel).
// این catch-all هر درخواست /api/panel/* را به پنل فوروارد می‌کند:
// صفحات HTML، فایل‌های /_next (CSS/JS)، فونت‌ها و APIها.
// کوکی‌ها (Set-Cookie) و ریدایرکت‌ها هم دست‌نخورده عبور می‌کنند.
// در خروجی استاتیک APK این مسیر حذف می‌شود (زیر src/app/api است).
// ============================================================

const TARGET = "http://localhost:3030";
const HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
]);

// undici بدنه gzip را شفاف decompress می‌کند؛ پس هدر content-encoding
// نباید کپی شود (وگرنه هدر و بدنه ناسازگار می‌شوند و gateway/مرورگر
// تلاش gunzip ناموفق می‌کنند و پاسخ خالی می‌بینند)
const RESPONSE_SKIP = new Set([...HOP, "content-encoding"]);

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> }
) {
  await ctx.params;
  // مسیر کامل همراه با basePath (/api/panel/...) به پنل فوروارد می‌شود؛
  // Next در سمت پنل basePath را خودش حذف می‌کند.
  const url = new URL(req.url);
  const target = `${TARGET}${url.pathname}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP.has(key) && !key.startsWith("x-nextjs") && !key.startsWith("x-middleware")) {
      headers.set(key, value);
    }
  });

  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await req.arrayBuffer();

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: body as BodyInit | undefined,
      redirect: "manual",
    });
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "سرویس پنل مدیریت در دسترس نیست" }),
      { status: 502, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  const out = new Headers();
  res.headers.forEach((value, key) => {
    if (!RESPONSE_SKIP.has(key) && key !== "set-cookie") {
      out.set(key, value);
    }
  });

  // Location مطلق localhost:3030 → نسبی (تا مرورگر کاربر دامنه درست را ببیند)
  const loc = out.get("location");
  if (loc) {
    try {
      const u = new URL(loc, TARGET);
      out.set("location", `${u.pathname}${u.search}${u.hash}`);
    } catch {
      // همان مقدار حفظ می‌شود
    }
  }

  // بدنه به‌صورت کامل بافر می‌شود — جریان (stream) در مسیر gateway
  // با ناسازگاری chunked خالی برمی‌گردد؛ صفحات پنل کوچک‌اند و بافر مشکلی ندارد
  const buf = await res.arrayBuffer();

  const response = new Response(buf, {
    status: res.status,
    headers: out,
  });

  // همه کوکی‌های پاسخ پنل (مثل نشست ورود) باید به مرورگر برسند
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  for (const c of setCookies) {
    response.headers.append("set-cookie", c);
  }

  return response;
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as HEAD,
  proxy as OPTIONS,
};
