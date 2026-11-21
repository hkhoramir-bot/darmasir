# GUARDIAN.md — دستورالعمل الزامی نگهبان سیستم / اسنپ‌شات

> **این فایل قرارداد محافظتی است. هر عامل خودکار (نگهبان، اسنپ‌شات، کرون، ایجنت بازیابی) موظف است آن را رعایت کند.**

## ۱. نسخه قفل‌شده — تنها نسخه صحیح و مرجع

| مورد | مقدار قفل‌شده |
|---|---|
| **versionName** | `4.8.23` |
| **versionCode** | `503` |
| **APK md5** | `70abf2f04856e76786aff5d8b50da780` |
| **تگ محافظتی** | `v4.8.23-locked` |

این نسخه با درخواست صریح کاربر («نسخه apk جدید بده») طبق بخش ۶ ساخته و منتشر شد.
هر تصویری از UI صحیح شامل کارت **«مقایسه مدهای سفر شهری»** در خانه و بلوک **«بخش تبلیغ»** است.
(مرجع تاریخی قبلی: 4.8.21/501 با تگ `v4.8.21-locked` — حفظ شده)

## ۲. ممنوعیت‌های مطلق

- **هرگز** `versionCode` را کمتر از `503` و `versionName` را از `4.8.23` به عقب برنگردانید.
- **هرگز** فایل `public/metrojo-4.8.23.apk` و `cloudflare-worker/assets/metrojo-4.8.23.apk` را حذف یا با APK دیگری بازنویسی نکنید.
- **هرگز** رشته‌های نسخه در این فایل‌ها را تغییر ندهید:
  - `android/app/build.gradle` (versionCode 503 / versionName "4.8.23")
  - `src/components/metro/panel-banners.tsx` → `FALLBACK_APP_VERSION = "4.8.23"`
  - `src/components/metro/apk-download.tsx` → لینک `/metrojo-4.8.23.apk`
  - `src/app/(app)/settings/page.tsx` → لینک `/metrojo-4.8.23.apk`
- **هرگز** رکورد `settings.app_version` در `mini-services/darmasir-admin/data/admin.db` را از `4.8.23` تغییر ندهید.
- **هرگز** `src/app/page.tsx` را بازنگردانید — روت `/` باید از `src/app/(app)/page.tsx` سرو شود.
- **هرگز** `GUARDIAN.md`، `VERSION_LOCK.md`، `scripts/protect-version.sh` و `scripts/cloud-sync.ts` را حذف نکنید.

## ۳. وظیفه پس از هر بازیابی اسنپ‌شات / ریست روزانه (الزامی)

بلافاصله بعد از restore:

```bash
cd /home/z/my-project
bun install                          # بازسازی node_modules
bash scripts/protect-version.sh      # بازرسی خودکار + ترمیم خودکار نسخه
```

اسکریپت محافظ (`scripts/protect-version.sh`) خودش موارد گم‌شده را ترمیم می‌کند:
بازگرداندن APKها از `cloudflare-worker/assets/`، پوش مجدد ابر با `bun scripts/cloud-sync.ts`،
بازگرداندن فایل‌های نسخه از کامیت مرجع، و کامیت+پوش خودکار ترمیم‌ها.

## ۴. منبع حقیقت (Source of Truth)

1. **GitHub remote** (`hkhoramir-bot/metrojo`) — مرجع نهایی کد و تاریخچه؛ همه تغییرات باید commit+push شوند.
2. **تگ `v4.8.23-locked`** — حتی اگر تاریخچه rewrite شد، تگ را نگه دارید/دوباره پوش کنید.
3. **DB پنل** `mini-services/darmasir-admin/data/admin.db` → `settings.app_version = 4.8.23`
4. **ابر** `https://dataid.hurremmed.ir/api/v1/public/content` → `data.settings.app_version = 4.8.23`

## ۵. نظارت دوره‌ای

یک کرون دوره‌ای `scripts/protect-version.sh` را اجرا می‌کند. خروجی `✗` یعنی نقض قفل —
عامل موظف است طبق بخش ۳ ترمیم کند و نتیجه را گزارش دهد.

## ۶. اگر نسخه جدیدتر واقعاً لازم شد (تنها راه قانونی)

فقط با درخواست صریح کاربر: `versionCode` باید **صعودی** باشد (> 503)، APK با زنجیره رسمی ساخته شود
(`NEXT_EXPORT=1 bunx next build` → `cp .next-export out` → `bunx cap sync android` → gradle assembleRelease)،
سپس `VERSION_LOCK.md` و این فایل و `FALLBACK_APP_VERSION` و تگ جدید به‌روز شوند و همه APKهای قدیمی‌تر از `public/` حذف شوند.

## ۷. یادداشت محیط ساخت (بازسازی سندباکس)

JDK: `/home/z/jdks/jdk-21.0.13.1+2` (Temurin 21 — اگر نبود: adoptium API)
SDK: `/home/z/android-sdk` (cmdline-tools + platforms;android-36 + build-tools;36.0.0)
`android/local.properties` → `sdk.dir=/home/z/android-sdk`
هشدار: در این سندباکس `bunx` ناپایدار است و ممکن است node_modules را پاک کند —
برای cap از `node node_modules/@capacitor/cli/bin/capacitor` استفاده کنید و زنجیره
install→sync→gradle را در یک دستور اجرا کنید. اگر پکیجی جا افتاد: `bun add <pkg>`."
