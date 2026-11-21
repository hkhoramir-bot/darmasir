# BRIEF — پنل مدیریت «درمسیر» (darmasir-admin)

> سند زمینه برای هر جلسه آینده. قبل از هر تغییر این فایل و `INFRA.md` را بخوان.

## چیست

پنل مدیریت وب مستقل برای اپ متروجو/درمسیر — طبق بخش ۹ سند توسعه
(`upload/darmasir_development_spec.md`). فارسی، RTL، واکنش‌گرا، سبک shadcn.

## معماری

- **سرویس مستقل** در `mini-services/darmasir-admin/` — Next.js 16، پورت ۳۰۳۰،
  basePath `/panel`، اشتراک کد صفر با APK
- **دسترسی از پیش‌نمایش**: مسیر `/panel/*` با rewrite در `next.config.ts`
  پروژه اصلی به پورت ۳۰۳۰ پروکسی می‌شود (در حالت APK export هیچ rewrite
  وجود ندارد؛ گارد `NEXT_EXPORT=1`)
- **دیتابیس توسعه**: Prisma + SQLite در `db/admin.db` (۱۱ مدل معادل
  `prisma/schema.prisma`)
- **دیتابیس تولید (هدف)**: Cloudflare D1 از طریق `cloudflare/darmasir-api/`
  — قرارداد API یکسان؛ پنل با `NEXT_PUBLIC_API_BASE` به ابر وصل می‌شود
  (جزئیات: `INFRA.md`)

## مدل‌های داده (۱۱)

AdminUser, Session, AuditLog, Line, Station, AppUser, Ad, Ticket,
TicketMessage, Setting, AppVersion — داده واقعی شبکه: ۱۱ خط، ۱۹۹ ایستگاه
(از `src/lib/metro-data.ts` + `station-geo.ts` با `scripts/export-admin-seed.ts`).

## احراز هویت (درس‌های سختِ جلسه‌های قبل — دست نزن)

1. **bcryptjs + کوکی HttpOnly** (`darmasir_admin_session`)؛ در DB فقط
   sha256 توکن؛ نشست ۷ روز؛ نقش‌ها SUPERADMIN/OPERATOR/VIEWER
2. **توکن در body هم برمی‌گردد** و کلاینت با `document.cookie` هم می‌نویسد —
   چون تونل پیش‌نمایش گاهی Set-Cookie را می‌اندازد (۶ ورود موفقِ بی‌نشست!)
3. **proxy.ts (`/login` هرگز بر اساس «وجود کوکی» ریدایرکت نمی‌شود)** —
   کوکی ماندگِ نشست حذف‌شده = حلقه ریدایرکت = صفحه سفید
4. اعتبارسنجی کامل در `(panel)/layout.tsx` (getServerAdmin) و API؛ proxy
   فقط گِردِ اول است
5. خروج: پاک‌سازی نشست سمت سرور + `document.cookie` پاک‌سازی کلاینت
6. API هم کوکی و هم `Authorization: Bearer` را می‌پذیرد (حالت ابری)

## نقشه فایل‌های حساس

| فایل | نقش |
|---|---|
| `src/proxy.ts` | گارد کوکی سطح اول (بدون ریدایرکت روی /login) |
| `src/lib/auth.ts` | نشست/رمز/requireAdmin/requirePermission |
| `src/lib/api.ts` | پاکت پاسخ `{ok,data}` + اعتبارسنج فارسی + handler() |
| `src/lib/roles.ts` | ماتریس نقش (READ/CREATE/UPDATE/DELETE/ADMIN) |
| `src/lib/path.ts` | gw()/gwNav() و NEXT_PUBLIC_API_BASE |
| `src/lib/client.ts` | apiFetch کلاینت + storeToken |
| `scripts/supervisor.sh` | تولید: سقف ۳۸۴MB، source دستی .env.local (next start نمی‌خواند)، حلقه سلامت |
| `prisma/.env` | DATABASE_URL مطلق — در غیر این صورت `.env` ریشه پروژه نشت می‌کند! |

## اجرا

```bash
cd mini-services/darmasir-admin
bun run setup      # نصب + generate + db push + seed + build (اولین بار)
bun run dev        # supervisor تولیدی (از طریق /start.sh خودکار بالا می‌آید)
bun run db:push && bun run db:seed   # بازنشانی داده
```

مدیر پیش‌فرض توسعه: `admin` / `admin1234` — در اولین ورود عوضش کنید.

## خطوط قرمز

- UI اپ اصلی (متروجو) با git پایه `501a2a3` یکی است — پنل به اپ اصلی
  چیزی اضافه نمی‌کند جز rewrite های گارد‌دار در next.config.ts و
  `src/app/api/panel-supervisor/route.ts` (زیرساخت سندباکس، در APK خنثی)
- داده ساختگی به‌عنوان واقعی نمایش داده نمی‌شود؛ seed فقط داده واقعی مترو
- هیچ Secret در کد/APK؛ کلیدها سمت سرور (Secret های Worker)
