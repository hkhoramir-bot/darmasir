// کمکی‌های پاسخ استاندارد API — پیام‌ها فارسی، ساختار یکسان
// { ok: true, data } | { ok: false, error: { code, message } }

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data }, init);
}

export function fail(status: number, code: string, message: string) {
  return Response.json(
    { ok: false, error: { code, message } },
    { status }
  );
}

/** بسته‌بندی هندلرهای route — همه خطاها به پاسخ استاندارد تبدیل می‌شوند */
export function handler(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((err: unknown) => {
    if (err instanceof ApiError) {
      return fail(err.status, err.code, err.message);
    }
    console.error("[api] unhandled:", err);
    // stack trace و جزئیات داخلی هرگز به کلاینت نشت نکند
    return fail(500, "INTERNAL", "خطای داخلی سرور. بعداً دوباره تلاش کنید.");
  });
}

// ------------------------- اعتبارسنجی سبک -------------------------

export function str(
  v: unknown,
  field: string,
  opts: { min?: number; max?: number; optional?: boolean } = {}
): string | undefined {
  if (v === undefined || v === null || v === "") {
    if (opts.optional) return undefined;
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» الزامی است.`);
  }
  if (typeof v !== "string") {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید متن باشد.`);
  }
  const t = v.trim();
  if (!opts.optional && t.length === 0) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» الزامی است.`);
  }
  if (opts.min && t.length < opts.min) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» حداقل ${opts.min} نویسه است.`);
  }
  if (opts.max && t.length > opts.max) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» حداکثر ${opts.max} نویسه است.`);
  }
  return t;
}

export function num(v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean; int?: boolean } = {}): number | undefined {
  if (v === undefined || v === null || v === "") {
    if (opts.optional) return undefined;
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» الزامی است.`);
  }
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید عدد باشد.`);
  }
  if (opts.int && !Number.isInteger(n)) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید عدد صحیح باشد.`);
  }
  if (opts.min !== undefined && n < opts.min) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید حداقل ${opts.min} باشد.`);
  }
  if (opts.max !== undefined && n > opts.max) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید حداکثر ${opts.max} باشد.`);
  }
  return n;
}

export function bool(v: unknown, field: string, def = false): boolean {
  if (v === undefined || v === null) return def;
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید درست/نادرست باشد.`);
}

/** آرایه رشته‌ای (مثل امکانات ایستگاه) — با سقف طول برای جلوگیری از سوءاستفاده */
export function strArray(v: unknown, field: string, maxItems = 30, optional = true): string[] | undefined {
  if (v === undefined || v === null) {
    if (optional) return undefined;
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» الزامی است.`);
  }
  if (!Array.isArray(v)) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید آرایه باشد.`);
  }
  if (v.length > maxItems) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» حداکثر ${maxItems} عضو دارد.`);
  }
  return v.map((x) => String(x).trim()).filter(Boolean);
}

export function isUrl(v: unknown, field: string, optional = true): string | undefined {
  const s = str(v, field, { optional });
  if (!s) return undefined;
  if (!/^https?:\/\/.+/i.test(s)) {
    throw new ApiError(400, "VALIDATION", `فیلد «${field}» باید نشانی اینترنتی معتبر باشد.`);
  }
  return s;
}
