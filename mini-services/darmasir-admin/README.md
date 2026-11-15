# پنل مدیریت «درمسیر» (darmasir-admin)

پنل مدیریت مستقل وب برای دستیار سفر شهری «درمسیر». فارسی، راست‌چین، واکنش‌گرا.

## اجرا

```bash
cd mini-services/darmasir-admin
bun run dev        # با reload خودکار — پورت 3035
```

دسترسی از طریق دروازه: آدرس پنل + `?XTransformPort=3035`

## حساب‌های پیش‌فرض

| نام کاربری | گذرواژه | نقش |
|---|---|---|
| admin | darmasir1404 | مدیر کل |
| operator | darmasir1404 | اپراتور |
| viewer | darmasir1404 | ناظر |

⚠️ پس از راه‌اندازی واقعی، گذرواژه‌ها را از بخش «امنیت» تغییر دهید.

## معماری

```
mini-services/darmasir-admin/
├── index.ts          سرویس Bun — استاتیک + API (پورت 3035، ثابت)
├── src/
│   ├── db.ts         دیتابیس SQLite (bun:sqlite) + اسکیم + seed
│   ├── auth.ts       هش scrypt، نشست، Rate-Limit ورود
│   └── api.ts        مسیریاب /api/v1/ — نقش‌ها، لاگ، اعتبارسنجی
├── public/
│   ├── index.html    پوسته SPA
│   ├── app.js        منطق پنل (۱۰ صفحه)
│   └── style.css     تم روشن RTL با فونت وزیرمتن
├── data/admin.db     دیتابیس (رunttime ساخته می‌شود)
├── LOCK.md           ⚠️ قفل — حذف نکنید
└── package.json
```

## بخش‌های پنل (مطابق سند توسعه، بخش ۹)

داشبورد، کاربران، خطوط، ایستگاه‌ها، تبلیغات، دستیار صوتی، تنظیمات عمومی، گزارش‌ها، امنیت (مدیران، نشست‌ها، لاگ رویدادها)

## API نسخه‌دار `/api/v1/`

- `POST /auth/login` · `GET /auth/me` · `POST /auth/logout`
- `GET|POST|PUT|DELETE /users[/:id]`
- `GET|POST|PUT|DELETE /lines[/:id]` · `/stations[/:id]`
- `GET|POST|PUT|DELETE /ads[/:id]` · `POST /ads/:id/track`
- `GET|PUT /settings` (PUT فقط مدیر کل)
- `GET|POST|PUT|DELETE /voice-lexicon[/:id]`
- `GET /reports` · `GET /security` · `GET|POST|PUT|DELETE /admins[/:id]` (فقط مدیر کل)

نقش‌ها: `viewer < operator < super` — همه تغییرات در `change_log` و `audit_log` ثبت می‌شوند.

## بازیابی در صورت حذف

```bash
bash admin-guard/restore-admin.sh   # از snapshot در ریشه پروژه
# یا از گیت:
git checkout HEAD -- mini-services/darmasir-admin
```
