# 2-e — صفحه «تیکت‌ها و پشتیبانی کاربران» — گزارش کار

## فایل‌های ساخته/ویرایش‌شده (فقط بخش خودم)

| فایل | نوع | توضیح |
|---|---|---|
| `src/app/api/v1/tickets/route.ts` | جدید | GET فهرست + فیلتر + جستجو + صفحه‌بندی + stats |
| `src/app/api/v1/tickets/[id]/route.ts` | جدید | GET جزئیات (تیکت + پیام‌ها قدیم→جدید) و PATCH وضعیت/اولویت |
| `src/app/api/v1/tickets/[id]/messages/route.ts` | جدید | POST پاسخ مدیر (OPEN → PENDING خودکار) |
| `src/app/(panel)/tickets/page.tsx` | جایگزین | Server component؛ role از getSessionAdmin به کلاینت پاس می‌شود |
| `src/app/(panel)/tickets/tickets-client.tsx` | جدید | کامپوننت کلاینت اصلی صفحه |

هیچ فایل مشترک (globals.css / layout / shell / lib / schema / package.json / stats) دست نخورده است.

## API ها

### GET `/api/v1/tickets`
- گارد `requireAdmin` (401 بدون نشست).
- Query: `status` (OPEN|PENDING|CLOSED)، `priority` (LOW|NORMAL|HIGH|URGENT)، `category` (GENERAL|GPS|VOICE|ROUTE|PAYMENT|OTHER)، `q` (contains روی subject/userName/code)، `page`، `pageSize` (پیش‌فرض 8، حداکثر 50).
- پاسخ: `{ ok, data: { tickets (با اولین پیام برای snippet), stats: {open,pending,closed,urgent,total}, total, page, pageSize } }`
- مرتب‌سازی: updatedAt desc.

### GET `/api/v1/tickets/[id]`
- `id` هم cuid قبول می‌کند هم کد تیکت (`TK-1001`)؛ 404 اگر نباشد.
- پیام‌ها با `orderBy: createdAt asc`.

### PATCH `/api/v1/tickets/[id]`
- body: `{ status?, priority? }` — اعتبارسنجی دستی enum ها؛ `updatedAt = new Date()` صریح.
- VIEWER → `fail("دسترسی شما فقط مشاهده است", 403)`.
- `logAudit(admin.id, "UPDATE", "TICKET", id, {status?, priority?})`.

### POST `/api/v1/tickets/[id]/messages`
- body: `{ body }` — خالی/بیش از ۴۰۰۰ کاراکتر ممنوع؛ VIEWER → 403؛ rateLimit 30 پیام در دقیقه.
- پس از درج پیام ADMIN، اگر وضعیت OPEN بود → PENDING و updatedAt=now.
- `logAudit(admin.id, "REPLY", "TICKET", id, { chars, statusAfter })` — پاسخ 201 با `{message, status}`.

## UI (وفادار به `upload/stitch_extracted/_12/code.html`)
- عنوان صفحه + بج «درخواست‌های درون‌برنامه‌ای مسافران» + دکمه‌های «خروجی اکسل گزارش» (دانلود CSV واقعی با BOM از نتایج فعلی) و «ثبت تیکت مسافر حضوری» (toast اطلاع — endpoint ساخت تیکت در بریف تعریف نشده).
- ۴ کارت KPI کلیک‌پذیر (باز/در حال پیگیری/بسته/فوری) که فیلتر اعمال می‌کنند — آمار از stats API.
- تب‌های وضعیت با شمارش + جستجوی دیبانس‌شده ۳۵۰ms + Select دسته و اولویت (shadcn) مطابق ظاهر طرح.
- نمای دوستونه RTL: ستون راست لیست (کارت با badge اولویت طبق بریف: URGENT قرمز secondary-container، HIGH روی secondary-fixed با متن error، NORMAL خنثی، LOW outline؛ badge وضعیت: OPEN قرمز error-container، PENDING روی primary-fixed، CLOSED سبز tertiary-fixed؛ دسته فارسی؛ زمان نسبی فارسی؛ آواتار حروف اول؛ کد TK-…) + صفحه‌بندی با chevron های طرح. ستون چپ: هدر تیکت (کد درشت، بج اولویت/وضعیت، Select وضعیت و اولویت، دکمه «حل‌شده و بستن تیکت»)، نوار متادیتا ۴ ستونه (مسافر/دسته/تاریخ ثبت/آخرین به‌روزرسانی)، خط زمان گفتگو (حباب کاربر `bg-surface-container-high` و حباب مدیر `bg-primary-container text-on-primary-container` سمت مقابل)، قالب‌های پاسخ سریع، جعبه پاسخ با تولبار طرح، دکمه ارسال و «ذخیره پیش‌نویس» (localStorage بر اساس id تیکت).
- موبایل (<lg): لیست تمام‌عرض و جزئیات در Dialog بزرگ (همان DetailBody)؛ پس از رفع overflow، اندازه‌گیری JS نشان داد حباب‌ها کامل داخل کادرند.
- VIEWER: Select ها و دکمه‌های اقدام جایگزین «حالت مشاهده» شده و جعبه پاسخ با کادر قفل جایگزین می‌شود.

## نتایج تست

| تست | نتیجه |
|---|---|
| GET لیست + فیلتر status/priority/category/q + صفحه‌بندی | 200 و داده صحیح (TK-1001..TK-1006) |
| GET جزئیات با کد `TK-1001` | 200، پیام‌ها قدیم→جدید |
| POST پاسخ آزمایشی به TK-1001 | 201؛ وضعیت OPEN→PENDING خودکار |
| PATCH بازگرداندن وضعیت TK-1001 به OPEN | 200 |
| PATCH مقدار نامعتبر (`status:"WEIRD"`) | 400 با پیام فارسی |
| POST متن خالی | 400 |
| GET تیکت ناموجود | 404 |
| درخواست بدون کوکی | 401 |
| نقش VIEWER (با نشست موقت آزمایشی): GET لیست/جزئیات | 200 |
| نقش VIEWER: PATCH و POST | 403 «دسترسی شما فقط مشاهده است» |
| AuditLog | رکوردهای REPLY و UPDATE ثبت شد (بررسی مستقیم sqlite) |
| صفحه وب `/tickets` | 200 |
| مرورگر واقعی (agent-browser) | لیست/تب‌ها/KPI/انتخاب تیکت/ارسال پاسخ از UI/Dialog موبایل همه صحیح؛ بدون خطای کنسول |
| dev.log | در پایان بدون خطا (500های میانی لاگ ناشی از رکورد نشست آزمایشی موقت خودم بود که حذف شد) |

### تغییر وضعیت داده پس از تست
- روی TK-1001 یک پیام پاسخ آزمایشی با متن مناسب پشتیبانی باقی مانده (API حذف پیام ندارد)؛ وضعیت به OPEN برگردانده شد.
- روی TK-1003 نیز حین تست UI یک پاسخ ارسال و وضعیت دوباره OPEN شد (پیام آزمایشی دوم باقی است).
- AdminUser و Session موقت VIEWER پس از تست حذف شدند.

## نکات/محدودیت‌ها
- آیکون `file_download` در فونت لوکال موجود نبود؛ از `download` (هم‌خانواده) استفاده شد. بقیه آیکون‌ها با fontTools اعتبارسنجی شدند.
- در حین کار، یک agent دیگر فایل `lines/page.tsx` را با import ناقص گذاشته بود که موقتاً کل پنل را 500 می‌کرد؛ بدون دخالت در فایل او صبر شد و خودش رفع کرد.
- «ثبت تیکت مسافر حضوری» و «ارجاع به واحد مالی» طرح بدون endpoint در بریف بودند؛ اولی toast اطلاع می‌دهد، دومی به Select وضعیت تبدیل شد.
- جستجوی `contains` روی SQLite حساس به حروف بزرگ/کوچک لاتین است (مثل TK-1001 فقط با همان حالت).
