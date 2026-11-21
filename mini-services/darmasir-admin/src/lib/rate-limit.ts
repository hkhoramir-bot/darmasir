// محدودسازی نرخ درخواست در حافظه — ساده و کافی برای تک‌نمونه بودن سرور
// (در استقرار چندنمونه‌ای باید به KV/D1 منتقل شود — در INFRA.md آمده)

import { ApiError } from "./api";

type Bucket = { count: number; reset: number };

const globalForRl = globalThis as unknown as {
  __darmasirRateBuckets?: Map<string, Bucket>;
};
const buckets: Map<string, Bucket> =
  globalForRl.__darmasirRateBuckets ?? new Map();
globalForRl.__darmasirRateBuckets = buckets;

/**
 * سهمیه درخواست را می‌سنجد؛ اگر پر شده باشد ApiError 429 می‌دهد.
 * @param key کلید یکتا (معمولاً ip + مسیر)
 * @param limit سهمیه در پنجره
 * @param windowMs طول پنجره به میلی‌ثانیه
 */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }

  b.count += 1;
  if (b.count > limit) {
    const waitSec = Math.ceil((b.reset - now) / 1000);
    throw new ApiError(
      429,
      "RATE_LIMIT",
      `درخواست‌های شما بیش از حد مجاز است. ${waitSec} ثانیه دیگر تلاش کنید.`
    );
  }

  // پاک‌سازی دوره‌ای برای جلوگیری از رشد بی‌حد نقشه
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.reset <= now) buckets.delete(k);
    }
  }
}
