# VERSION_LOCK.md — قفل نسخه مرجع درمسیر / متروجو

**وضعیت: 🔒 LOCKED — 4.8.21 / versionCode 501 — با تأیید کاربر (APK ارسالی = مرجع صحیح)**

## مشخصات مرجع

| فیلد | مقدار |
|---|---|
| versionName | `4.8.21` |
| versionCode | `501` |
| package | `ir.metrojo.app` |
| APK md5 | `32d8efa4c2147aaad29aabcc0f9bb3f0` |
| کامیت مرجع | `db841b8` |
| تگ | `v4.8.21-locked` |

## نقاط الزامی تطبیق (هر کدام باید = 4.8.21 / 501 باشد)

1. `android/app/build.gradle` → `versionCode 501` و `versionName "4.8.21"`
2. `public/metrojo-4.8.21.apk` (+ نام‌های سازگار `4.8.20`، `4.8.17`، `4.9.0`) → همه md5 یکسان با مرجع
3. `cloudflare-worker/assets/metrojo-4.8.21.apk` → md5 یکسان با مرجع
4. `src/components/metro/panel-banners.tsx` → `FALLBACK_APP_VERSION = "4.8.21"`
5. `src/components/metro/apk-download.tsx` و `src/app/(app)/settings/page.tsx` → لینک دانلود `/metrojo-4.8.21.apk`
6. DB پنل `mini-services/darmasir-admin/data/admin.db` → `settings.app_version = "4.8.21"`
7. ابر `https://dataid.hurremmed.ir/api/v1/public/content` → `data.settings.app_version = "4.8.21"`
8. نشانگرهای UI صحیح در سورس: «مقایسه مدهای سفر شهری» در `src/app/(app)/page.tsx` و «بخش تبلیغ» در `src/components/ad-banner.tsx`

## ابزارهای تضمین

- **بازرسی + ترمیم خودکار:** `bash scripts/protect-version.sh`
- **پوش محتوا/نسخه به ابر:** `bun scripts/cloud-sync.ts`
- **راهنمای نگهبان:** `GUARDIAN.md`
- **نظارت دوره‌ای:** کرون ثبت‌شده در سیستم (اجرای protect-version.sh)

## تاریخچه قفل

- `7b71588` → APK 4.8.22/502 ساخته شد اما **با تأیید کاربر رد شد** (نسخه مرجع 4.8.21 است)
- `db841b8` → بازگشت کامل به 4.8.21/501، همه APKها با محتوای مرجع هم‌سان شدند
- این قفل جایگزین «آخرین build» است: **تا اطلاع بعدی کاربر، 4.8.21 تنها نسخه قابل نمایش/دانلود است.**
