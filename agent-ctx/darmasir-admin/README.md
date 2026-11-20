# ثبت جلسات — darmasir-admin

## جلسه بازسازی (نوامبر ۲۰۲۵) — پاک‌شدن سندباکس + زیرساخت

**اتفاق**: بین جلسات، سندباکس پاک شد. کل پنل قبلی (`mini-services/darmasir-admin/`,
کامیت‌های fix(panel) و همه چیز) از بین رفت؛ فقط سند توسعه
(`upload/darmasir_development_spec.md`) و اپ اصلی (کامیت‌شده) ماند.
کاربر پرسید: «agent-ctx/darmasir-admin/INFRA.md نیست».

**اقدامات این جلسه**:
1. بازسازی کامل پنل از اسناد: پکیج/کانفیگ‌ها، اسکیمای Prisma (۱۱ مدل،
   بدون enum چون SQLite پشتیبانی نمی‌کند)، lib (auth/api/roles/audit/
   rate-limit/path/client)، proxy.ts با قاعده «/login هرگز ریدایرکت با
   کوکی نمی‌شود»، shadcn کپی‌شده از اپ اصلی، supervisor تولیدی با
   درس‌های قبل (سقف ۳۸۴MB + source دستی .env.local)
2. API کامل `/api/v1/*` (۲۲ فایل route) — Task 2-a
3. ۸ صفحه پنل + panel-kit — Task 2-b
4. seed: `scripts/export-admin-seed.ts` → seed-data.json → ۱۱ خط/۱۹۹
   ایستگاه + مدیر اولیه admin/admin1234 + نسخه 4.8.17
5. دسترسی: rewrite `/panel/*` در next.config.ts اصلی (گارد NEXT_EXPORT —
   APK دست‌نخورده). Caddyfile واقعی ریشه‌محافظت‌شده است و غیرقابل تغییر.
6. زیرساخت ابری: `cloudflare/darmasir-api/` — Worker کامل + schema.sql +
   seed.sql + gen-seed.ts + wrangler.toml + README-FA.md
7. اسناد: INFRA.md (پاسخ به درخواست زیرساخت)، BRIEF.md، همین فایل

**درس فنی جدید**: Prisma CLI هنگام اجرای `prisma db push` از پوشه
mini-service، `.env` ریشه پروژه (متعلق به اپ اصلی!) را هم پیدا می‌کند و
DATABASE_URL اشتباه می‌گیرد → فایل `prisma/.env` با مسیر مطلق درست در
پنل؛ اسکریپت‌های db هم env را صریح می‌دهند.

**وضعیت پایانی**: پنل build شد، روی ۳۰۳۰ بالا آمد (supervisor فرزند درخت
زنده)، ورود/داشبورد/APIها با مرورگر تست شد؛ commit شد.
استقرار ابری باورراقانه (needs user wrangler login) — آماده کامل.
