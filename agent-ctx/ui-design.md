# ادامه طراحی UI موبایل — فایل‌های طراحی کاربر (ui.zip + Metrojo.zip)

## منابع طراحی
- `upload/ui_extracted/ui/_1.._32/code.html` — جدیدترین ست مترویار (Stitch، Tailwind CDN). اسکرین‌شات‌های مرجع: `tool-results/ui-audit/des-ui-*.png`
- `upload/Metrojo_extracted/_1.._33` — ست قدیمی‌تر؛ `metro_yar_design_system/DESIGN.md` = منبع توکن‌ها (هم‌اکنون در `src/app/globals.css` پیاده شده)
- `upload/stitch_extracted/` — طرح‌های پنل درمسیر (ربطی به موبایل ندارد)
- استخراج رشته‌های دقیق فارسی هر طرح: python + regex روی `>text<` (الگوی استفاده‌شده در این جلسه موجود در تاریخچه)

## نقشه صفحه‌ها → پیاده‌سازی (وضعیت پایان این جلسه)
| طرح | صفحه اپ | وضعیت |
|---|---|---|
| ui_2 / Metrojo_6 | `/lines/[id]` | ✅ بازسازی دقیق این جلسه |
| ui_17 / ui_27 / Metrojo_9 | `/stations/interchanges` | ✅ ساخته‌شده این جلسه (تنها صفحه‌ای که نبود) |
| ui_4 / Metrojo_28 | راهنمای طبقات | ✅ از قبل (سکشن ایستگاه تقاطعی در stations/[id]) |
| ui_9 / ui_14 / Metrojo_4 | جدول اعزام | ✅ از قبل (سکشن جدول اعزام) |
| ui_6 / ui_30 | راهنمای تعویض خط | ✅ از قبل (سکشن تقاطعی stations/[id]) |
| ui_8 / ui_15 / ui_19 / ui_20 | جزئیات/خروجی‌ها | ✅ از قبل |
| ui_23 / ui_29 | خطوط و نقشه | ✅ از قبل |
| ui_24 / ui_25 / ui_12 | نقشه/مسیر | ✅ از قبل |
| ui_3 / ui_26 / ui_18 | وضعیت/اطلاعیه | ✅ از قبل |
| ui_5 / ui_10 / ui_21 | مسیریاب | ✅ از قبل |
| ui_7 / Metrojo_2 | ذخیره‌ها | ✅ از قبل |
| ui_11 / Metrojo_7 | تاریخچه | ✅ از قبل |
| ui_1 / Metrojo_27 | تنظیمات | ✅ از قبل |
| ui_22 / Metrojo_21 | بیدارباش | ✅ از قبل (plan + journey-monitor) |
| ui_28 / ui_32 | خط ۲/۴ | همان قالب خطوط |

## کاری که این جلسه انجام شد
1. **`/stations/interchanges` (جدید)** — ui_17+ui_27: جستجو (نام/خطوط متقاطع)، ۵ چیپ فیلتر (همه/پرتردد هسته‌ای/خط ۱/خط ۴/۳خطه)، کارت‌ها با نشان رنگی خط اصلی، نام انگلیسی، چیپ پیاده‌روی، چیپ‌های «خط N: ترمینال ⇄ ترمینال»، ردیف نکته (icon: layers/storefront/stairs/accessible/foundation/directions_bus/swap_calls) + تگ/پیل، اکشن‌ها [پلان طبقات/زمان‌بندی → stations/[id]] [مسیریابی → /plan?from=id]، AdBanner، کارت راهنمای تعویض خط با dismiss → localStorage `mq-interchange-guide`. داده واقعی: ۱۷ تقاطع تهران از STATIONS؛ RICH فقط برای ۸ هسته‌ای، بقیه FALLBACK.
2. **`/lines/[id]/client.tsx` بازنویسی** — ui_2: نوار رنگ بالای کارت، عنوان «خط N مترو» + چیپ‌های ترمینال ⇄ + دکمه‌های info/map، آمار طرح (زمان کل سفر = (n-1)×segmentMinutes | تعداد | تقاطع‌ها)، ردیف «انتخاب خط مترو» با چیپ‌های رنگی (navigate)، کلید جهت «به سمت تجریش/به سمت کهریزک» (شمال/جنوب icon، پیش‌فرض سر دوم = جنوب→شمال)، نوار «وضعیت سرویس‌دهی» + چیپ ساعت، برچسب «ترتیب از جنوب به شمال» (AXIS map برای خطوط تهران)، دقیقه تجمعی سمت چپ ردیف‌ها + آیکون‌های امکانات، «نمایش N ایستگاه باقیمانده» (PREVIEW_COUNT=8)، AdBanner. جدول زمان‌بندی/CTA/اعلام صوتی از قبل حفظ شد.
3. **ورودی‌ها**: ابزار «راهنمای تقاطع‌ها» در /lines → interchanges؛ لینک «تقاطعی‌ها» در سربرگ فیلتر خطِ /stations.
4. **فونت آیکون**: `python3 scripts/build-icon-subset.py` → ۱۴۰ آیکون؛ **نکته حیاتی**: اسکنر فقط `name="..."` و `icon:"..."` را می‌بیند — رکورد داده‌ای حتماً کلید `icon:` داشته باشد (باگ storefront به همین دلیل بود). ?v=14 در globals.css.
5. **پچ dev-time**: کامپایلر Next دیو CSS را از دست داد → آدرس فونت در `.next/dev/static/chunks/src_app_globals_91e4631d.css` دستی v=14 شد (دست‌نخورده بماند؛ سرچشمه src/globals.css خودش v=14 است).

## باگ‌های شناخته‌شده/تله‌ها
- click agent-browser روی دکمه‌های زیر sticky header می‌افتد (intercept خاموش) → برای تست، `.click()` با eval.
- dark mode تست: `localStorage.setItem('theme','dark')` + navigation (کلید next-themes پیش‌فرض).
- `headwayAt(line, nowMin)` زنده است؛ رندر اول با `line.headway` برای هیدریشن یکسان.

## تست‌های انجام‌شده (agent-browser)
- interchanges: ۱۷ کارت → فیلتر هسته‌ای=۸، جستجوی «دولت» و «خط ۶» درست، dismiss راهنما + localStorage، مسیریابی → /plan?from=dowlat، ورودی از هر دو صفحه.
- lines/l1: toggle جهت (aria-pressed + معکوس فهرست + برچسب ترتیب)، دکمه «۲۱ ایستگاه باقیمانده تا کهریزک».
- دارک هر دو صفحه اسکرین‌شات و بررسی شد؛ lint تمیز؛ بدون خطای runtime در dev.log.
