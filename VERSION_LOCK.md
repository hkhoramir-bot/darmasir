# VERSION_LOCK.md — قفل نسخه مرجع درمسیر / متروجو

**وضعیت: 🔒 LOCKED — 4.8.23 / versionCode 503 — انتشار قانونی طبق GUARDIAN بخش ۶ با درخواست صریح کاربر («نسخه apk جدید بده»)**

## مشخصات مرجع

| فیلد | مقدار |
|---|---|
| versionName | `4.8.23` |
| versionCode | `503` |
| package | `ir.metrojo.app` |
| APK md5 | `70abf2f04856e76786aff5d8b50da780` |
| تگ | `v4.8.23-locked` |

## نقاط الزامی تطبیق (هر کدام باید = 4.8.23 / 503 باشد)

1. `android/app/build.gradle` → `versionCode 503` و `versionName "4.8.23"`
2. `public/metrojo-4.8.23.apk` → md5 یکسان با مرجع (تنها APK در public — قدیمی‌ها حذف شده‌اند)
3. `cloudflare-worker/assets/metrojo-4.8.23.apk` → md5 یکسان با مرجع
4. `src/components/metro/panel-banners.tsx` → `FALLBACK_APP_VERSION = "4.8.23"`
5. `src/components/metro/apk-download.tsx` و `src/app/(app)/settings/page.tsx` → لینک دانلود `/metrojo-4.8.23.apk`
6. DB پنل `mini-services/darmasir-admin/data/admin.db` → `settings.app_version = "4.8.23"`
7. ابر `https://dataid.hurremmed.ir/api/v1/public/content` → `data.settings.app_version = "4.8.23"`
8. نشانگرهای UI صحیح در سورس: «مقایسه مدهای سفر شهری» در `src/app/(app)/page.tsx` و «بخش تبلیغ» در `src/components/ad-banner.tsx`

## ابزارهای تضمین

- **بازرسی + ترمیم خودکار:** `bash scripts/protect-version.sh`
- **پوش محتوا/نسخه به ابر:** `bun scripts/cloud-sync.ts`
- **راهنمای نگهبان:** `GUARDIAN.md`
- **نظارت دوره‌ای:** کرون ثبت‌شده در سیستم (اجرای protect-version.sh)

## تاریخچه قفل

- `7b71588` → APK 4.8.22/502 ساخته شد اما **با تأیید کاربر رد شد** (versionCode 502 سوزانده شد)
- `db841b8` → بازگشت به 4.8.21/501 (تگ `v4.8.21-locked` — مرجع تاریخی حفظ شده)
- `2e25b70` → فیکس کامل ورود با کد پیامکی (OTP) — بن‌بست «حذف شده/ثبت‌نام کنید» از بین رفت
- انتشار 4.8.23/503 → با درخواست صریح کاربر؛ versionCode از 502 (سوزانده) عبور کرد؛
  همه APKهای قدیمی‌تر از `public/` طبق GUARDIAN بخش ۶ حذف شدند و تنها
  `metrojo-4.8.23.apk` قابل دانلود است. آرشیو نسخه‌های قبلی در
  `cloudflare-worker/assets/metrojo-4.8.18..4.8.21.apk` باقی مانده است.

## محتوای 4.8.23 نسبت به 4.8.21

- فیکس کامل ورود با کد پیامکی (OTP) — کاربرِ موجود روی سرور دیگر به «ثبت‌نام کنید» نمی‌افتد
- فیکس بن‌بست ورود — حساب روی سرور بدون رمز (ساخته‌شده با OTP) با پیام درست راهنمایی می‌شود
- ورکر ابری: NO_PASSWORD / بازیابی حساب بدون رمز با ثبت‌نام / پاک‌سازی هش scrypt پس از ورود OTP
- اپ اندروید: ترمیم نشان همگام‌سازی، پیام دقیق خطاها، دکمه اقدام سریع در صفحه ورود
- فیکس بخش اطلاعیه‌ها — فقط نوتیف واقعی
- فیکس رفرش کادر تیکت در تماس با ما
