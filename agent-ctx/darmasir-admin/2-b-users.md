# Task 2-b — صفحه «کاربران و مسافران» پنل درمسیر — Work Record

## Summary
Built the full "کاربران و مسافران" section of the darmasir-admin panel (mini-services/darmasir-admin), faithfully reproducing the Stitch design `/home/z/my-project/upload/stitch_extracted/_6/code.html`: top action bar, 4 KPI cards, filter card (search + city/status/pageSize), split view (users table + "کارت هوشمند مسافر انتخابی" side card), pagination footer, detail Dialog and block/unblock AlertDialog with exact Persian copy. API list + PATCH endpoints added under `/api/v1/users`.

## Files created / replaced (only my section)
- `src/app/api/v1/users/route.ts` (NEW) — GET list: q (name/phone, Persian-digit + ی/ك normalized), status, city, page, pageSize (default 12, cap 100). Output `{ok, users, total, page, pages, stats:{total, active, blocked, todayTrips, newThisMonth, growthPct}, cities}`. `todayTrips` = `_sum.tripsCount` of users with `lastSeenAt >= startOfToday`. `cities` = distinct city from records. Stats are global (unfiltered) so KPI cards stay stable while filtering.
- `src/app/api/v1/users/[id]/route.ts` (NEW) — GET single user; PATCH `{status: ACTIVE|BLOCKED}`: requireAdmin → VIEWER gets `fail("دسترسی شما فقط مشاهده است", 403)`; invalid status → 400; unknown id → 404; no-op when same status (`changed:false`); on real change updates + `logAudit(admin.id,"UPDATE","APP_USER",id,{field,from,to,displayName})` → returns `{ok, user, changed}`.
- `src/app/(panel)/users/page.tsx` (REPLACED) — server wrapper `p-4 sm:p-6 space-y-6` + `<Suspense fallback={PageSkeleton}>` around client (required for `?q=`).
- `src/app/(panel)/users/users-client.tsx` (NEW) — the whole client UI.

## UI implementation notes (design fidelity)
- Structure mirrors code.html: action bar (CSV / پیام همگانی / ثبت کاربر جدید buttons — last two show info toast "در نسخه‌های بعدی پنل فعال می‌شود"; CSV is a real client-side export of filtered results with UTF-8 BOM), 4 KPI cards (کل / فعال / مسدود / **سفرهای امروز از tripsCount** + real month-growth line), filter card with search (400ms debounce + clear button), city Select (from distinct cities) and pageSize Select (۱۲/۲۴/۴۸), segmented status tabs with live counts, table, pagination footer ("نمایش مسافر X تا Y از Z" + page buttons with `chevron_right`/`chevron_left` prev/next for RTL + ellipsis via `pageList`).
- Table columns: مشخصات مسافر (initials avatar `ع.ص`, name, phone dir=ltr) / شناسه کاربری `USR-XXXXXXXX` (last 8 chars of id) / شهر و عضویت / دستگاه / وضعیت (ACTIVE = `bg-tertiary-fixed text-on-tertiary-fixed` green tertiary, BLOCKED = `bg-error-container text-error` red) / سفرها (+صوتی) / آخرین بازدید (relative Persian "۱۲ دقیقه پیش") / عملیات (visibility → dialog, block/lock_open → AlertDialog, more_vert → dialog). Selected row gets design's `bg-primary/5 border-r-4 border-r-primary`; blocked rows get `bg-error-container/10`. Loading = 5 pulse skeleton rows; empty state = person_off card.
- Side card "کارت هوشمند مسافر انتخابی" with `MRT-PRIVACY-403` tag, gradient NAV card (uid + tripsCount + voiceCount chip), 3-stat grid (سفر/صوتی/روز عضویت), account info rows, actions "جزئیات کامل حساب" + "مسدودسازی/رفع مسدودی".
- Detail Dialog (shadcn): header avatar/name/phone/badge, 2 stat tiles (سفر/صوتی), all-fields definition list (نام، تلفن، دستگاه، شهر، سفرها، صوتی، عضویت، آخرین بازدید، شناسه رکورد id mono) + بستن / مسدودسازی|رفع مسدودی buttons.
- AlertDialog confirms with the exact effect-explaining Persian copy (block: دسترسی بلافاصله قطع می‌شود، تاریخچه حفظ می‌شود، قابل بازگشت با «رفع مسدودی»; unblock: دسترسی کامل بازیابی می‌شود). Action button `e.preventDefault()` to keep dialog open while applying; closes on success/fail.
- `?q=` read via `useSearchParams` in useState initializers (inside Suspense) — panel-header quick search lands here. No URL rewriting (only reads).
- VIEWER handling: role fetched from `/api/v1/auth/me`; mutation buttons disabled with title «دسترسی شما فقط مشاهده است» + toast guard.
- All numbers via `fa()`, dates `fa-IR`, phone/uid dir=ltr, `gw()` on every fetch, material icons verified against the local woff2 glyph set (6670 glyphs; `file_download`/`smartphone` missing → used `download`/`devices`; `trending_down` exists).
- Toasts via sonner (`toast.success/error/info`).

## Verification (curl, all on port 3030 with /tmp/admin-cookies.txt)
- `GET /users` → 200 (SSR contains title; layout+shell intact)
- `GET /users?XTransformPort=3030` → 200; `GET /users?q=یاسر` → 200
- No cookie → 307 to /login
- `GET /api/v1/users` → 200 `{ok, users[24-cap], total:24, pages, stats:{total:24,active:22,blocked:2,todayTrips:169,...}, cities:[اصفهان,تهران,مشهد,کرج]}`
- `?status=BLOCKED` → 2 rows (یاسر عبدی، پویا اسدی); `?city=کرج` → 3 rows; `?q=سعید` → 1; `?q=0911` → 1 (phone search); `?page=2&pageSize=5` → page 2/5, 5 rows
- `PATCH /api/v1/users/{سعید دوستی} {status:BLOCKED}` → 200 changed:true, reflected in list (stats.blocked:3); unblock → 200 changed:true, restored to ACTIVE
- Invalid status → 400 «مقدار وضعیت باید ACTIVE یا BLOCKED باشد»; no-auth PATCH → 401; temp VIEWER session PATCH → 403 «دسترسی شما فقط مشاهده است» (temp viewer cleaned up afterwards)
- AuditLog rows confirmed: `UPDATE/APP_USER` with detail `{field:status,from,to,displayName}` by "admin"
- `bunx tsc --noEmit` clean for my files; `bunx eslint` exit 0; dev.log — no errors from my files (a temporary window of 500s on /users came from the sibling agent's in-progress `lines-client` import, resolved once that file landed; `/users` verified 200 again after).

## Notes for next agents
- `/api/v1/users` GET returns stats with extra keys (`newThisMonth`, `growthPct`) beyond the brief's required 4 — additive only.
- PATCH is idempotent (`changed:false` when status already equals target) — UI can ignore it.
- CSV export caps at pageSize=100 (API cap) and exports the *filtered* set.
- The two decorative buttons (پیام همگانی / ثبت کاربر جدید) intentionally toast "coming in next versions" — no backend for them yet.
