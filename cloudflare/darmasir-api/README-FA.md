# درمسیر API — راهنمای استقرار روی Cloudflare

این پوشه یک **Cloudflare Worker** کامل است که همان قرارداد API پنل مدیریت
«درمسیر» را روی **دیتابیس رایگان D1** (SQLite روی حساب Cloudflare شما)
پیاده‌سازی می‌کند. بعد از استقرار، پنل با تنظیم یک متغیر محیطی به این API
وصل می‌شود و داده‌ها واقعاً ماندگار می‌شوند.

## پیش‌نیازها

- یک حساب Cloudflare (همان حسابی که Workerهای صوتی متروجو روی آن هستند)
- Node.js 18+ یا Bun روی سیستم محلی شما
- نصب Wrangler: `npm install -g wrangler` یا `bun add -g wrangler`

## گام‌به‌گام

### ۱) ورود به حساب

```bash
wrangler login
```

### ۲) ساخت دیتابیس D1

```bash
wrangler d1 create darmasir-db
```

شناسه‌ای که در خروجی می‌دهد (`database_id`) را در `wrangler.toml` جایگزین
`REPLACE_WITH_YOUR_D1_ID` کنید.

### ۳) ساخت جداول و بارگذاری داده شبکه مترو

```bash
wrangler d1 execute darmasir-db --remote --file schema.sql
wrangler d1 execute darmasir-db --remote --file seed.sql
```

`seed.sql` شامل ۱۱ خط و ۱۹۹ ایستگاه واقعی (همان داده اپلیکیشن) است.

### ۴) استقرار Worker

```bash
wrangler deploy
```

آدرس Worker در خروجی چاپ می‌شود، مثل:
`https://darmasir-api.<your-subdomain>.workers.dev`

### ۵) ساخت مدیر اولیه

```bash
curl -X POST https://darmasir-api.<your-subdomain>.workers.dev/api/v1/setup \
  -H "content-type: application/json" \
  -d '{"username":"admin","name":"مدیر کل","password":"گذرواژه‌ی‌قوی‌حداقل۸نویسه"}'
```

این نقطه فقط تا وقتی هیچ مدیری وجود نداشته باشد کار می‌کند.

### ۶) اتصال پنل به API ابری

در فایل `mini-services/darmasir-admin/.env.local` (یا محیط استقرار پنل):

```
NEXT_PUBLIC_API_BASE="https://darmasir-api.<your-subdomain>.workers.dev"
```

سپس پنل را دوباره build کنید. از این لحظه همه خواندن/نوشتن‌های پنل روی D1
انجام می‌شود؛ نشست ورود هم با هدر `Authorization: Bearer` (توکن در
localStorage) پشتیبانی می‌شود.

### ۷) محدودسازی CORS (مهم برای امنیت)

در `wrangler.toml` مقدار `ALLOWED_ORIGINS` را از `"*"` به دامنه‌های واقعی
پنل تغییر دهید:

```toml
[vars]
ALLOWED_ORIGINS = "https://panel.your-domain.com,https://darmasir.pages.dev"
```

و دوباره `wrangler deploy` بزنید.

## نقاط عمومی برای اپلیکیشن (بدون احراز هویت)

- `GET /api/v1/public/bootstrap` — خطوط + ایستگاه‌ها + تنظیمات + تبلیغ‌های
  فعال + آخرین نسخه (کش ۶۰ ثانیه)
- `POST /api/v1/ads/:id/event` با بدنه `{"type":"view"}` یا
  `{"type":"click"}` — ثبت نمایش/کلیک تبلیغ

## پشتیبان‌گیری

```bash
wrangler d1 export darmasir-db --remote --output backup-$(date +%F).sql
```

بازیابی: `wrangler d1 execute darmasir-db --remote --file backup-....sql`

## معماری امنیتی رعایت‌شده

- رمزها: PBKDF2-SHA256 (۱۰۰هزار تکرار) با نمک تصادفی — رمز خام ذخیره نمی‌شود
- توکن نشست: ۳۲ بایت تصادفی؛ فقط sha256 آن در D1؛ تحویل با کوکی
  HttpOnly و/یا هدر Bearer
- نقش‌ها: SUPERADMIN / OPERATOR / VIEWER — ماتریس دسترسی در سمت Worker
- Rate limit: ورود ۱۰ در ۵ دقیقه برای هر IP (جدول rate_buckets)
- Audit log برای همه عملیات مدیریتی
- هیچ Secret در کد یا wrangler.toml نیست؛ رمز مدیر اولیه فقط با setup
  یک‌بارمصرف ساخته می‌شود
- خطاها همیشه پاسخ استاندارد فارسی؛ stack trace بیرون نمی‌دهد
