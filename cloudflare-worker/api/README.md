# درمسیر API — ورکر API عمومی اپ (جدا از ورکر صوتی)

> ⚠️ پوشه والد (`cloudflare-worker/`) ورکر صدای فارسی شما (metrojo-voice) است و
> **دست نخورده** باقی مانده. این زیرپوشه یک ورکر **جداگانه** برای API عمومی اپ است.

## معماری

```
اپ اندروید  ──►  Cloudflare Worker «darmasir-api» (این پوشه)  ──►  Turso (libSQL رایگان)
                                                                     ▲
پنل مدیریت (Next.js)  ──────────────────────────────────────────────┘
محتوا/تبلیغات/نسخه را از پنل تغییر می‌دهید؛ اپ همان را از ورکر می‌خواند.
ورکر صوتی شما (metrojo-voice) هم چون قبل جداگانه کار می‌کند.
```

## endpoint ها

| مسیر | متد | توضیح |
|---|---|---|
| `/` | GET | سلامت سرویس |
| `/v1/config` | GET | تنظیمات عمومی اپ (اعلان، راهنمای صوتی و...) — کش لبه ۶۰ ثانیه |
| `/v1/ads?placement=HOME_BANNER` | GET | بنرهای فعال (بند ۹ سند — بدون انتشار نسخه) |
| `/v1/version` | GET | آخرین نسخه برای بررسی آپدیت درون‌اپ |
| `/v1/lines` | GET | خطوط و ایستگاه‌ها (به‌روزرسانی داده نقشه بدون APK) |
| `/v1/tickets` | POST | ثبت تیکت از اپ — هدر `X-Device-Id` الزامی |
| `/v1/tickets/:code` | GET | پیگیری تیکت — فقط توسط همان دستگاه |

پاسخ‌ها: `{ "ok": true, "data": ... }` یا `{ "ok": false, "error": "..." }`

## استقرار راه ۱ (پیشنهادی — wrangler)

```bash
cd cloudflare-worker/api
bun install
bunx wrangler login
bunx wrangler secret put TURSO_DATABASE_URL   # libsql://darmasir-<org>.turso.io
bunx wrangler secret put TURSO_AUTH_TOKEN     # توکن Turso
bun run deploy
# آدرس: https://darmasir-api.<subdomain>.workers.dev
```

## استقرار راه ۲ (بدون ابزار — کپی در داشبورد، مثل ورکر صوتی)

فایل آماده `api-worker.js` در همین پوشه **باندل‌شده** است (بدون وابستگی):

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**
2. نام: `darmasir-api` → Deploy
3. **Edit Code** → کل کد فایل `api-worker.js` را کپی و جایگزین کنید → Deploy
4. از منوی **Settings → Variables and Secrets** دو متغیر Secret بسازید:
   - `TURSO_DATABASE_URL` = آدرس دیتابیس Turso
   - `TURSO_AUTH_TOKEN` = توکن Turso
5. آدرس بالای ادیتور را کپی کنید — برای اپ و مستندات.

اگر `src/index.ts` را تغییر دادید، باندل تازه بسازید:

```bash
bun run bundle   # esbuild → api-worker.js
```

## توسعه محلی

```bash
cp .dev.vars.example .dev.vars   # مقدار واقعی بگذارید
bun run dev                      # http://localhost:8787
```

نکته: در ورکر واقعی فقط URL های `libsql://` / `https://` پشتیبانی می‌شوند (ساخت وب کتابخانه).
