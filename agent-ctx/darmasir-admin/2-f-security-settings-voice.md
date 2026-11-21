# Task 2-f — صفحه‌های امنیت، تنظیمات/نسخه‌گذاری و دستیار صوتی + APIها

**Agent:** 2-f (Security / Settings / Voice) — پنل مدیریت درمسیر (mini-services/darmasir-admin)
**Status:** ✅ Complete — tsc clean (فایل‌های خودم)، eslint clean، همه صفحات و APIها 200/رفتار درست
**Date:** جلسه موازی — پس از 5-a/5-b و هم‌زمان با ایجنت‌های 1-a/1-b/3-x (لاگ‌های LINE/STATION/TICKET در audit از آن‌هاست)

## فایل‌های ساخته‌شده / جایگزین‌شده

صفحات (client component، توکن‌های Stitch، RTL، اعداد و تاریخ فارسی، بدون emoji):
1. `src/app/(panel)/security/page.tsx` — بازتولید وفادار `upload/stitch_extracted/_4/code.html`
2. `src/app/(panel)/settings/page.tsx` — بازتولید وفادار ساختار `upload/stitch_extracted/_1/code.html`
3. `src/app/(panel)/voice/page.tsx` — بدون طراحی Stitch؛ هم‌سبک با توکن‌های مشترک

APIها:
4. `src/app/api/v1/security/admins/route.ts` — GET / POST
5. `src/app/api/v1/security/admins/[id]/route.ts` — PATCH
6. `src/app/api/v1/security/admins/[id]/password/route.ts` — POST
7. `src/app/api/v1/security/sessions/route.ts` — GET (با flag `current`)
8. `src/app/api/v1/security/sessions/[id]/route.ts` — PATCH {revoked:true}
9. `src/app/api/v1/security/audit/route.ts` — GET (action/entity/page/pageSize=15)
10. `src/app/api/v1/settings/route.ts` — GET / PUT
11. `src/app/api/v1/versions/route.ts` — GET / POST
12. `src/app/api/v1/versions/[id]/route.ts` — PATCH
13. `src/app/api/v1/voice/route.ts` — GET / PUT

هیچ فایل ممنوعه (globals.css/layout/shell/lib/schema/package.json) دست نخورده؛ هیچ فایل بخش دیگر تغییر نکرد.

## ساختار صفحات

### /security (سه تب با نوار تب به سبک Stitch: border-b-2 border-primary)
- ۴ کارت KPI بالای صفحه با نوار رنگی top-strip (primary/secondary/tertiary/primary-container):
  نشست‌های فعال (زنده از API + تفکیک نقش) / حساب‌های مدیریتی / رویدادهای ممیزی (total) / RBAC سه‌سطحی.
- تب «مدیران»: جدول (آواتار initials + نام + username، badge نقش رنگی، Switch فعال/غیرفعال، آخرین ورود fa-IR، دکمه تغییر گذرواژه)، Select نقش inline (فقط SUPERADMIN و نه آخرین SUPERADMIN فعال)، Dialog افزودن مدیر (نام، username انگلیسی lowercase، گذرواژه ≥8، Select نقش)، Dialog تغییر گذرواژه. دکمه‌ها برای غیر-SUPERADMIN disable.
- تب «نشست‌های فعال»: جدول مطابق طرح (مدیر + pill «نشست جاری شما»، IP با dir=ltr، دستگاه/مرورگر خلاصه‌شده از UA، آغاز نشست + relative، badge معتبر، دکمه قطع نشست؛ برای نشست جاری دکمه disabled «غیرفعال برای نشست خود» همانند طرح). flag `current` را سرور با مقایسه tokenHash می‌فرستد.
- تب «لاگ ممیزی»: فیلتر Select عملیات و دسته + مجموع، جدول (LOG-#xxxxxx از آخر id، زمان fa-IR + نسبی، مدیر، عملیات آیکون‌دار رنگی، دسته، detail با try/parse JSON → چیپ‌های key:value)، فوتر صفحه‌بندی همانند طرح (قبلی/بعدی + شماره صفحات، پیش‌فرض 15).

### /settings
- سربرگ breadcrumb + h1 مطابق طرح؛ ۴ کارت KPI (آخرین نسخه پایدار + build code، تعداد نسخه‌ها، تعداد کلید تنظیمات، آخرین به‌روزرسانی).
- «بخش ۱: اطلاعات هویتی و ارتباطی» — گرید فرم (appName، appTagline، supportPhone، supportEmail، announcement textarea) با کلاس‌های طرح؛ نوار پایین فرم: info + «انصراف و بازنشانی فرم» + «ذخیره نهایی تنظیمات» (PUT).
- «بخش ۲: مدیریت نسخه‌ها» — ردیف هر نسخه (versionName mono، badge code، notes، تاریخ انتشار fa-IR، badge «جدیدترین» برای latest، دکمه «علامت‌گذاری به‌عنوان جدیدترین») + Dialog افزودن نسخه (regex قالب x.y.z، versionCode عددی، apkUrl اختیاری، notes).
- جدول «لاگ وقایع و ردگیری تغییرات پیکربندی» از audit (entity ∈ SETTING/VERSION/VOICE_SETTING).

### /voice
- بنر توضیح سند بند ۷: فرمان‌های ثابت بدون مدل زبانی و قاعده‌محور اجرا می‌شوند.
- کارت ۱: voiceGreeting + ویرایشگر فیلدبه‌فیلد voiceGuidePhrases (start/nextStation/transfer/arrive با نمایش جای‌نگهدار {station}/{line}) + ذخیره.
- کارت ۲: فرهنگ تلفظ (ردیف کلمه→تلفظ با شمارنده «n جفت از ۵۰»، افزودن دو فیلد + افزودن، حذف ردیف) — ذخیره بلافاصله.
- کارت ۳: Slider asrMaxSeconds 5..30 و ttsSpeed 0.5..2 گام 0.1 با لیبل مقدار فارسی (۱٫۲x) + ذخیره.
- کارت ۴: وضعیت سرویس‌ها از /api/v1/stats (سرویس voice برجسته) + خلاصه مقادیر جاری.
- VIEWER: همه ورودی‌ها/دکمه‌ها disabled.

## APIها و قوانین (همه با requireAdmin + fail/ok فارسی + logAudit)
- admins POST: فقط SUPERADMIN (403)؛ username `^[a-z0-9_]{3,32}$` lowercase؛ گذرواژه ≥8؛ bcrypt.hash(pw,10)؛ عدم تکرار username (409)؛ logAudit CREATE/ADMIN.
- admins/[id] PATCH: فقط SUPERADMIN؛ {active?, role?, name?}؛ ممنوع غیرفعال‌سازی خود (400)؛ ممنوع demote/deactivate آخرین SUPERADMIN فعال (شمارش بقیه active SUPERADMIN=0 → 400)؛ logAudit UPDATE/ADMIN {changes}.
- password POST: فقط SUPERADMIN؛ ≥8؛ bcrypt 10 rounds؛ logAudit PASSWORD_RESET/ADMIN {username}.
- sessions GET: فقط revoked=false و expiresAt>now، take 100، include admin{name,username,role}، flag current.
- sessions/[id] PATCH: فقط {revoked:true}؛ VIEWER→403؛ ابطال دوباره→400؛ logAudit REVOKE/SESSION {adminId,ip}.
- audit GET: فیلتر action/entity + page/pageSize (1..100، پیش‌فرض 15) + include admin + total.
- settings GET: همه Settingها آبجکت؛ PUT: فقط کلیدهای مجاز appName/appTagline/supportPhone/supportEmail/announcement (بقیه نادیده)، appName/appTagline غیرخالی، ≤500 char؛ upsert؛ logAudit UPDATE/SETTING {changes}.
- versions GET: مرتب بر اساس versionCode نزولی؛ POST: regex `^\d+\.\d+\.\d+$`، versionCode Int مثبت، یکتا بودن نام و کد (findFirst چون ستون‌ها unique نیستند)، VIEWER→403؛ logAudit CREATE/VERSION.
- versions/[id] PATCH: {latest:true} → `$transaction([updateMany latest:false, update latest:true])`؛ همچنین PATCH {notes,apkUrl}؛ VIEWER→403؛ logAudit PUBLISH یا UPDATE/VERSION.
- voice GET: parse امن JSON برای voiceGuidePhrases و pronunciationDict؛ PUT: dict حداکثر ۵۰ جفت، همه فیلدهای guide پر، asrMaxSeconds عدد 5..30، ttsSpeed 0.5..2 (رُند 0.1)، upsert چندکلیدی؛ logAudit UPDATE/VOICE_SETTING {keys}.

## نتایج تست (curl با /tmp/admin-cookies.txt)
صفحات: `/security`,`/settings`,`/voice` → همه **200** (مارکرهای متن تیترها در HTML تأیید شد).
- admins: GET 200؛ POST ایجاد 201→**ok**؛ username نامعتبر/گذرواژه کوتاه/تکراری → پیام فارسی خطا (400/409).
- admins/[id] PATCH: تغییر نام/غیرفعال/فعال ok؛ demote آخرین SUPERADMIN → «حداقل یک مدیر ارشد فعال باید در سامانه باقی بماند»؛ self-deactivate → «نمی‌توانید حساب خودتان را غیرفعال کنید».
- password: POST ok؛ کوتاه → 400.
- sessions: GET ok با `current:true`؛ PATCH revoke نشست دوم ok و پس از آن کوکی همان مدیر → 401 در auth/me؛ revoke دوباره → 400.
- audit: GET فیلتر action=UPDATE&entity=ADMIN → total و items درست.
- settings: GET آبجکت کامل؛ PUT تغییر announcement ok (سپس بازگردانی به مقدار اصلی)؛ کلید غیرمجاز نادیده؛ appName خالی → 400.
- versions: POST نام بد/کد منفی/کد تکراری → 400/409؛ POST 9.9.9 ok؛ PATCH latest:true → انحصار latest تأیید (بقیه false)؛ بازگردانی latest به 4.9.0 انجام شد؛ PATCH id نامعلوم → 404.
- voice: GET ok؛ PUT افزودن جفت dict + asr=20 + tts=1.2 ok؛ مقادیر نامعتبر (asr=40، tts=3، ۵۱ جفت، guide خالی) → همه 400؛ بازگردانی به مقادیر seed انجام شد.
- VIEWER: ایجاد admin نقش VIEWER + login با کوکی جدا → PUT settings/voice، POST versions، PATCH session همه «دسترسی شما فقط مشاهده است» (403)؛ GET settings → 200.
- پاک‌سازی داده تست: نسخه 9.9.9 و دو admin آزمایشی (agent_test_tmp، agent_test_viewer) با اسکریپت موقت از DB حذف شدند؛ لاگ‌های audit آن‌ها به‌عنوان تاریخچه باقی است.
- `bunx tsc --noEmit` (فیلتر روی فایل‌های خودم): 0 خطا (سه خطای اولیه null/undefined در logAudit و notes اصلاح شد). `bunx eslint` روی همه فایل‌های خودم: 0 مشکل.
- dev.log: همه درخواست‌های نهایی 200؛ 500های میانی فقط به‌خاطر فایل‌های ناتمام ایجنت‌های موازی بود (`tickets-client` و سپس `lines-client` Module not found) که با تکمیل کار آن‌ها رفع شد — هیچ خطایی از فایل‌های من نیست.

## نکات برای ایجنت‌های بعدی
- flag `current` در GET sessions با مقایسه sha256 توکن کوکی درخواست محاسبه می‌شود؛ برای «قطع همه نشست‌ها به‌جز خودم» قابل استفاده است.
- ستون‌های versionName/versionCode در اسکیمای Prisma unique نیستند؛ یکتایی فقط در API چک می‌شود (findFirst) — اگر schema push کسی کرد می‌تواند @unique اضافه کند (فایل ممنوعه بود برای من).
- audit detail از اکشن‌های من: {changes}/{username}/{keys}/{versionName...} — DetailCell با try/parse نمایش چیپ می‌دهد.
- DELETE نسخه/مدیر در بریف نبود و پیاده‌سازی نشد؛ پاک‌سازی داده تست مستقیم از طریق Prisma انجام شد.
- در طول توسعه سرور چند بار به‌خاطر فایل‌های ناتمام ایجنت‌های موازی 500 داد؛ اگر این اتفاق افتاد قبل از دیباگ، یک فایل دیگر را چک کنید.
