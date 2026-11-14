# 🔒 این پوشه قفل‌شده است — DELETE NA-SHAV (حذف نکنید)

## darmasir-admin — پنل مدیریت مستقل «درمسیر»

این پوشه زیرساخت حیاتی پروژه است و طبق درخواست صریح کاربر **نباید هیچ‌گاه حذف شود**.

### سه لایه محافظت (در صورت حذف تصادفی، همه قابل بازیابی‌اند):

1. **Git**: این پوشه به‌صورت اجباری در گیت کامیت شده است (`git add -f`).
   بازیابی: `git checkout HEAD -- mini-services/darmasir-admin`
2. **Snapshot فشرده**: `admin-guard/darmasir-admin-snapshot.tar.gz` در ریشه پروژه (نیز در گیت).
   بازیابی: `bash admin-guard/restore-admin.sh`
3. **اسکریپت نگهبان**: `admin-guard/restore-admin.sh` — اگر پوشه غایب باشد، خودکار از snapshot برمی‌گرداند و سرویس را استارت می‌زند.

### مشخصات
- پورت ثابت: **3035**
- اجرا: `cd mini-services/darmasir-admin && bun run dev` (در پس‌زمینه)
- دسترسی از دروازه: `/?XTransformPort=3035` (و همه فراخوانی‌های API با `?XTransformPort=3035`)
- دیتابیس: SQLite محلی در `data/admin.db` — بدون هیچ وابستگی خارجی
- ورودی پیش‌فرض: `admin / darmasir1404` (مدیر کل) — پس از اولین ورود تغییر دهید

### مشخصات سازنده
ساخت بر اساس سند `upload/darmasir_development_spec.md` (بخش ۹: پنل مدیریت مستقل).
هرگونه بازسازی باید با حفظ معماری همین پوشه انجام شود، نه حذف و ساخت از صفر.
