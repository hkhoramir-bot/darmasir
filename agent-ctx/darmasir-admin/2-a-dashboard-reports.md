# 2-a — داشبورد و گزارش‌ها (داشبورد صفحه اصلی + صفحه گزارش‌ها)

## وضعیت: انجام شد (تست نهایی در انتها — نکته هم‌زمانی زیر را ببینید)

## فایل‌های ساخته‌شده / ویرایش‌شده
- `src/app/api/v1/dashboard/route.ts` — جدید؛ GET همه داده‌های داشبورد در یک فراخوانی
- `src/app/api/v1/reports/route.ts` — جدید؛ GET با پارامتر `range` (7|30|90، پیش‌فرض 30)
- `src/app/(panel)/page.tsx` — بازنویسی کامل (داشبورد، client component)
- `src/app/(panel)/reports/page.tsx` — بازنویسی کامل (گزارش‌ها، client component + خروجی CSV)

## endpointها
- `GET /api/v1/dashboard` (requireAdmin) → `{ok, data:{counters, weeklyTrend[7], modeShare[], recentActivity[8], serviceHealth[4], activeAd}}`
  - counters: users/active/blocked، lines+linesActive+تفکیک kind، stations/active، tickets open/pending/closed، ads total/active/impressions/clicks/ctr، voice
  - weeklyTrend: گروه‌بندی روزی ۷ روز اخیر از AppUser.createdAt و Ticket.createdAt (در JS)
  - recentActivity: آخرین ۸ AuditLog با نام مدیر (include admin)
  - serviceHealth: api (latency واقعی همین درخواست)، db، network (خطوط/ایستگاه فعال)، voice — با progress
- `GET /api/v1/reports?range=7|30|90` (requireAdmin) → `{ok, data:{range, from, to, kpis, weeklyUsage(7 روز هفته), weeklySeries, topLines(6), adsStats(impressions/clicks/ctr/activeAds/byPlacement), ticketCategories}}`
  - مقایسه با دوره قبل برای کاربران جدید و تیکت‌ها (درصد تغییر)
  - range نامعتبر → 400 با پیام فارسی
- `GET /api/v1/stats` — دست نخورد.

## نکات فنی
- هر دو صفحه client component با loading skeleton / حالت خطا + دکمه «تلاش مجدد» / حالت خالی فارسی.
- همه fetch و Link با `gw()`؛ اعداد و تاریخ فارسی؛ بدون emoji؛ فقط توکن‌های طراحی Stitch.
- نمودارها با div/width% (CSS خالص): روند هفتگی داشبورد (stacked users+tickets) و نمودار استفاده هفتگی گزارش‌ها با دو حالت گروه‌بندی «روزهای هفته / سری هفتگی».
- خروجی CSV سمت کلاینت با Blob و BOM (\uFEFF) در هر دو صفحه (داشبورد: لاگ فعالیت؛ گزارش‌ها: گزارش کامل چندبخشی).
- دکمه فیلتر جدول لاگ داشبورد بین «همه / فقط تغییرات / فقط ورود-خروج» می‌چرخد (بدون API اضافه).

## نکته هم‌زمانی مهم برای عامل‌های دیگر
در زمان تست، دو صفحه دیگر (tickets و users) توسط عامل‌های موازی در حال بازنویسی بودند و فایل‌های `tickets-client.tsx` و `users-client.tsx` هنوز نوشته نشده بودند؛ نبود این ماژول‌ها کل کامپایل dev را می‌شکند و همه routeها (از جمله داشبورد و گزارش‌ها) 500 می‌دهند. این خطا مربوط به فایل‌های این مأموریت نیست — بعد از تکمیل آن عامل‌ها باید curl مجدد گرفته شود.

## تست‌ها (نتایج نهایی)
- `GET /` → 200 (داشبورد، skeleton + فچ کلاینت)
- `GET /reports` → 200
- `GET /api/v1/dashboard` → 200 با JSON کامل (counters: users=24, lines=11, stations=199, ticketsOpen=3, impressions=43000, ctr=6؛ ۷ روز روند؛ ۸ رویداد؛ ۴ سرویس)
- `GET /api/v1/reports` بدون range → 200 (پیش‌فرض ۳۰)
- `GET /api/v1/reports?range=7|30|90` → هر سه 200 با شکل داده کامل (kpis/weeklyUsage/weeklySeries/topLines/adsStats/ticketCategories)
- `GET /api/v1/reports?range=5` → 400 با پیام فارسی
- درخواست بدون کوکی به dashboard → 401 (requireAdmin)
- eslint روی هر ۴ فایل → بدون خطا؛ dev.log بدون خطای کامپایل/سرور در routeهای این مأموریت
- نکته هم‌زمانی بالا (tickets-client/users-client) برطرف شد و کامپایل کل پنل سالم است.
