# Task 2-c — صفحه «خطوط و ایستگاه‌های ناوگان شهری» پنل درمسیر — Work Record

**Agent:** 2-c (Lines & Stations Admin)
**Status:** Complete — tsc clean, همه تست‌های curl موفق، دیتابیس دست‌نخورده (۱۱ خط / ۱۹۹ ایستگاه)

## Files Created
1. `src/app/(panel)/lines/page.tsx` — server component (جایگزین placeholder)؛ role را از `getSessionAdmin()` می‌خواند و به کلاینت می‌دهد؛ metadata عنوان صفحه.
2. `src/components/panel/lines-client.tsx` — کل UI صفحه (بازتولید وفادار `_10/code.html`).
3. `src/app/api/v1/lines/route.ts` — GET خطوط با `_count.stations` واقعی + meta تجمیعی؛ POST خط جدید.
4. `src/app/api/v1/lines/[id]/route.ts` — PATCH {name?, status?, color?} + GET تک‌خط؛ هر دو requireAdmin + logAudit.
5. `src/app/api/v1/lines/publish/route.ts` — GET آخرین انتشار (Setting `lines_last_publish`)؛ POST ثبت انتشار/سرفاصله + logAudit.
6. `src/app/api/v1/stations/route.ts` — GET (q, lineId, status?, page, pageSize=15 با `line {code,name,color,kind}`)؛ POST ایجاد با اعتبارسنجی + sync stationCount.
7. `src/app/api/v1/stations/[id]/route.ts` — PATCH همه فیلدها + DELETE فقط SUPERADMIN؛ هر دو logAudit + sync stationCount خطوط قبل/بعد از جابجایی.

## UI (وفادار به Stitch code.html)
- **سکشن ۱**: سربرگ با آیکون `fork_right` در `bg-primary/10` + سه دکمه طرح (افزودن خط → دیالوگ POST؛ سرفاصله پیک → مودال؛ انتشار به اپلیکیشن → POST publish + نمایش «آخرین انتشار» واقعی).
- **سکشن ۲**: ۴ کارت KPI با همان ساختار/کلاس‌های طرح (circle تزئینی absolute) ولی داده واقعی: خطوط فعال، میانگین ایستگاه هر خط، ایستگاه‌های عملیاتی، درصد پوشش خطوط فعال.
- **کارت اصلی ۸ ستونه**: شادcn Tabs دو تب «خطوط / ایستگاه‌ها» با استایل سگمنت طرح (bg-surface-container-low، active سفید + متن primary).
  - تب خطوط: سگمنت فیلتر نوع (همه/METRO/BRT/اتوبوس)، جدول با نشان رنگ خط (`backgroundColor: line.color` + انتخاب متن سیاه/سفید با luminance)، کد badge (l1→۱، brt→BRT ۱، k1→K1)، نام، نوع، تعداد ایستگاه واقعی، وضعیت (ACTIVE سبز tertiary-fixed / MAINTENANCE زرد secondary-fixed با هایلایت ردیف / INACTIVE خاکستری)، عملیات: list_alt (پرش به تب ایستگاه‌ها با فیلتر همان خط)، tune (ویرایش: نام/وضعیت/رنگ با `input type=color`)، bolt (تاگل سریع ACTIVE↔MAINTENANCE). فوتر جدول مثل طرح.
  - تب ایستگاه‌ها: جستجوی نام (debounce 350ms سمت API)، Select فیلتر خط (با دات رنگ)، دکمه افزودن ایستگاه، جدول: نام، خط (pill رنگی)، ترتیب (فارسی)، مختصات `dir="ltr"` با ۵ رقم اعشار، وضعیت، عملیات (ویرایش + حذف فقط SUPERADMIN). صفحه‌بندی ۱۵تایی با chevron_right/left (RTL) و «نمایش ۱ تا ۱۵ از ۱۹۹». سربرگ ستون‌ها sticky در اسکرول عمودی `max-h-[38rem]`.
- **پنل ۴ ستونه**: «پایش ایستگاه‌های تحت تعمیر و شاخص» (داده واقعی MAINTENANCE با مختصات/ترتیب/pill خط، empty-state همه عملیاتی) + بنر تبلیغات طرح عیناً.
- **دیالوگ‌ها** با هدر `bg-primary-container` و فوتر `bg-surface-container-low/40` مطابق مودال طرح: ویرایش خط، افزودن خط (کد یکتا/نوع/نام/رنگ)، افزودن+ویرایش ایستگاه (نام/خط/Lat/Lng/ترتیب/وضعیت)، مودال سرفاصله پیک (سه input عددی، Switch قطار کمکی، textarea یادداشت Audit)، حذف ایستگاه با AlertDialog و متن صریح «حذف قطعی از دیتابیس واقعی پنل».
- **رول‌ها**: VIEWER همه دکمه‌های mutation مخفی (فقط مشاهده)؛ OPERATOR بدون دکمه حذف؛ DELETE در API هم فقط SUPERADMIN (تست با کوکی operator → 403).
- اعداد فارسی با `fa()`، تاریخ‌ها `toLocaleString("fa-IR")`، همه fetch ها با `gw()` و مسیر نسبی، toast با sonner، skeleton برای loading، بدون هیچ پکیج/CDN جدید.

## API Contract
- `GET /api/v1/lines` → `{ok, lines:[{id,code,name,kind,color,status,stationCount(واقعی _count),stationCountStored,...}], meta:{totalLines, linesByKind, linesByStatus, stations:{total,active,maintenance}}}`
- `POST /api/v1/lines` → {code(لاتین یکتا), name, kind, color(hex)} → 201؛ VIEWER→403؛ کد تکراری→409
- `PATCH /api/v1/lines/[id]` → {name?, status?, color?} + logAudit UPDATE/LINE با before/after
- `GET/POST /api/v1/lines/publish` → آخرین انتشار / ثبت PUBLISH یا HEADWAY در Setting + logAudit
- `GET /api/v1/stations` → `?q&lineId&status&page&pageSize(default 15)` → `{stations(with line), total, page, pageSize, totalPages}`؛ ترتیب: lineId, order, name
- `POST /api/v1/stations` → {name, lineId, lat(25..40), lng(44..64), order?(پیش‌فرض=ادامه خط), kind?(پیش‌فرض=نوع خط)} → 201 + sync stationCount + logAudit
- `PATCH /api/v1/stations/[id]` → {name?, lat?, lng?, order?, status?, kind?, lineId?} + sync شمارنده خط قدیم/جدید + logAudit
- `DELETE /api/v1/stations/[id]` → فقط SUPERADMIN + sync + logAudit
- اعتبارسنجی دستی (بدون zod)، خطاها فارسی، VIEWER روی همه mutation ها → 403 «دسترسی شما فقط مشاهده است»

## Test Results (curl + browser)
| تست | نتیجه |
|---|---|
| `GET /lines` (صفحه وب) | 200 — عنوان و محتوا رندر شده |
| `GET /api/v1/lines` | 200 — ۱۱ خط، stationCount واقعی از `_count` |
| `GET /api/v1/stations?lineId=l1` | 200 — total:29، همه ردیف‌ها خط l1، totalPages:2 |
| `POST /api/v1/stations` با lat=50 | 400 (اعتبارسنجی) |
| `POST /api/v1/stations` معتبر | 201 + order خودکار=29 + l1→30 |
| `PATCH /api/v1/stations/[id]` | 200 (نام/وضعیت) + Audit |
| PATCH ایستگاه نمونه کهریزک order 0→1 و برگردان | 200/200 — نهایتاً order=0 |
| `DELETE /api/v1/stations/[test]` SUPERADMIN | 200 + l1 برگشت به 29 |
| `DELETE` با اکانت operator | 403 «فقط مدیر ارشد» |
| `PATCH /api/v1/lines/[id]` | 200 + Audit (before/after)؛ رنگ نامعتبر → 400 |
| `POST/GET /api/v1/lines/publish` | 200 + رکورد Setting + Audit |
| AuditLog | رکوردهای CREATE/UPDATE/DELETE/PUBLISH با detail JSON ثبت شدند |
| Browser (agent-browser ایزوله) | 4 کارت KPI، ۲ تب، ۱۱ ردیف خط، تب ایستگاه‌ها ۱۵ ردیف + coords با ۵ اعشار، جستجو→۱ ردیف، صفحه ۲ «۱۶ تا ۳۰»، هر ۴ دیالوگ باز/بسته، AlertDialog حذف با متن هشدار، RTL/Vazirmatn/فارسی اعداد/بدون اسکرول افقی |
| tsc --noEmit | clean |
| dev.log | بدون خطا؛ همه route های من 200 |

## DB Integrity (داده seed دست‌نخورده)
- lines: 11 / stations: 199 (تست‌ها با ایجاد+حذف ایستگاه موقت انجام شد و cleanup شد)
- کهریزک: order=0, status=ACTIVE / l1.stationCount=29
- Setting تستی `lines_last_publish` بعد از تست حذف شد (حالت اولیه تمیز)

## Notes / Limitations
- فیلدهای سرفاصله/ناوگان جدول طرح در اسکیما وجود ندارند و `prisma/schema.prisma` قابل ویرایش نبود؛ ستون‌ها به «نوع ناوگان» و داده واقعی تعدیل شد و مودال سرفاصله فقط Audit/Setting ثبت می‌کند (بدون نگهداری per-line headway).
- طرح Stitch «ایستگاه‌های تبادلی» با داده آسانسور/تراکم داشت که در دیتابیس نیست؛ پنل کنار به «پایش ایستگاه‌های تحت تعمیر» با داده واقعی MAINTENANCE تبدیل شد (ساختار کارت وفادار ماند).
- stationCount ذخیره‌شده seed (۲۱۷ جمع) با ردیف‌های واقعی ایستگاه (۱۹۹) یکی نیست — از قبل در seed موجود بود؛ نمایش صفحه از شمارش واقعی `_count` استفاده می‌کند و بعد از هر mutation همگام می‌شود.
- `GET /api/v1/stations` علاوه بر پارامترهای بریف، `status` اختیاری هم می‌گیرد (برای پنل پایش تعمیرات).
- حین تست، براوزر اشتراکی توسط ایجنت همزمان (تیکت‌ها) در حال استفاده بود؛ تست UI در session ایزوله انجام شد.
