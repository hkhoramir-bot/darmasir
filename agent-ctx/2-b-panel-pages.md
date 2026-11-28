# Task 2-b — darmasir-admin: Panel Pages + Shared Kit (Work Record)

Agent: 2-b
Scope: ONLY page files under `src/app/(panel)/` + one shared kit `src/components/panel-kit.tsx` in the independent Next.js 16 app at `mini-services/darmasir-admin/` (basePath `/panel`). No other files touched. No install/build/dev server runs.

## Files written (all verified with `bunx tsc --noEmit`)

1. `src/components/panel-kit.tsx` — "use client" shared kit:
   - `faDate(iso)` via `Intl.DateTimeFormat("fa-IR", { dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Tehran" })`, «—» on null/invalid.
   - Labels: `CITY_LABEL`, `AMENITY_LABEL` (+ `AMENITY_KEYS`), `STATUS_LABEL` (lines), `TICKET_STATUS_LABEL`, `TICKET_PRIORITY_LABEL`, `PLACEMENT_LABEL`, `ACTION_LABEL` (full map incl. DELETE_USER/UPDATE_USER; fallback = raw action via `?? a.action` at usage sites).
   - `ROLE_LABEL` re-exported from `@/lib/roles` (single source of truth).
   - Badge style helpers: `lineStatusVariant` (normal=default, crowded=amber, delay=orange, closed=destructive), `ticketStatusVariant` (OPEN=default, PENDING=amber, CLOSED=outline muted), `auditIcon(action)` icon-per-group.
   - `useAdmin()` — module-level cache + memoized promise, fetches `/api/v1/auth/me` once per session, returns `{ admin, loading }`.
   - Components: `PageHeader`, `StatCard` (LucideIcon in rounded bg-accent), `EmptyState`, `ErrorBanner` (retry), `ConfirmDialog` (لغو / تایید و حذف|تایید, destructive default), `Spinner`, `LoadingBlock` (skeleton grid), `Field` (flex flex-col gap-1.5 + hint).
   - Typed contracts: StatsT, AuditItemT, TopAdT, LineT, StationT, StationLineRefT, AppUserT, AdT, TicketListItemT, TicketDetailT, TicketMessageT, AdminUserT, AppVersionT, SettingsMap, AdminMe.

2. `src/app/(panel)/page.tsx` — داشبورد: GET /api/v1/stats; 9 StatCards (خطوط، ایستگاه‌ها، کاربران اپ، ثبت‌نام ۷ روز، فعال ۷ روز، تبلیغات فعال، بازدید، کلیک، تیکت باز + hint در بررسی); «رویدادهای اخیر» Card max-h-80 overflow-y-auto with auditIcon/ACTION_LABEL/adminName/faDate/detail; «تبلیغ‌های فعال» topAds rows (Eye views + MousePointerClick clicks + placement Badge); honest green-dot pill «وضعیت API: محلی» shown only after successful load.

3. `src/app/(panel)/lines/page.tsx` — خطوط: client-side search (name/id) + city Select; «خط جدید» hidden for VIEWER; full table (dot+number, نام, شهر, ترمینال‌ها " ↔ ", فاصله حرکت with اوج/غیراوج hint, ساعت کار dir-ltr, وضعیت Badge + statusNote, actions). Create/Edit Dialog sm:max-w-2xl max-h-[90vh] overflow-y-auto with all contract fields: id (disabled in edit), cityId, number, name, color (input type=color + hex pair), textOnColor pair, two terminals, direction, headway/headwayPeak/headwayOff, firstTrain/lastTrain (dir ltr type=time), segmentMinutes step 0.1, badges comma-separated, status Select, statusNote. Payload: ints/floats parsed, headwayPeak/Off → null when empty, badges split/trim/filter → omitted when empty, statusNote → null when empty. DELETE via ConfirmDialog (SUPERADMIN only).

4. `src/app/(panel)/stations/page.tsx` — ایستگاه‌ها: search + city + line filter (lines fetched once via GET /api/v1/lines, also used for color lookup); Table inside max-h-[520px] overflow-y-auto with sticky header (large list); columns نام/شناسه (ltr mono)/خطوط chips (dot by line color + خط n, sorted by order)/شهر/امکانات (first 3 + «+n»)/مختصات toFixed(3) ltr mono/ویژه Star fill-amber-400. Dialog: id (disabled edit), name, cityId, featured Switch, lat/lng (ltr, number, step any), amenities toggle-chip grid (h-9 pills, aria-pressed), lines editor rows (lineId Select + order Input + remove X) + «افزودن خط»; payload lines=[{lineId, order:Number}], amenities array. ConfirmDialog delete.

5. `src/app/(panel)/users/page.tsx` — کاربران اپ: server query q (300ms debounce), banned filter (همه/فعال/مسدود), page state, PAGE_SIZE=200, قبلی/بعدی + مجموع count; Table: کاربر (name||«بدون نام» + deviceId ltr mono), پلتفرم, نسخه, وضعیت (فعال default/غیرفعال secondary/مسدود destructive with title=دلیل), آخرین بازدید/عضویت faDate; مسدودسازی via Dialog+Textarea (PUT banned:true + banReason), رفع مسدودی immediate PUT {banned:false, banReason:null}; حذف SUPERADMIN + ConfirmDialog; EmptyState «هنوز کاربری ثبت نشده».

6. `src/app/(panel)/ads/page.tsx` — تبلیغات: placement/active filters (server query) + «تبلیغ جدید»; Card grid sm:2 xl:3 with plain `<img>` h-36 object-cover, title, placement+active Badges, body line-clamp-2, بازه (faDate or «همیشه»), Eye/MousePointerClick stats, linkUrl ltr truncated; Dialog: title/body/imageUrl/linkUrl(ltr)/placement/active Switch/startsAt-endsAt datetime-local with proper local↔ISO converters (empty → omitted from payload). ConfirmDialog delete.

7. `src/app/(panel)/tickets/page.tsx` — پشتیبانی: `grid lg:grid-cols-[340px_1fr]`, list first in DOM (right in RTL); filters status Select + q (debounced); rows: subject truncate, status Badge (PENDING amber), فوری chip for HIGH, messages count, user, faDate; selected row border-primary bg-accent/50. Detail: subject h2 + meta (user, deviceId ltr mono, category map BUG/SUGGESTION/BILLING/OTHER, faDate), status/priority Selects (PUT → refetch detail+list), delete SUPERADMIN+ConfirmDialog; messages thread max-h-96 overflow-y-auto, ADMIN bubbles self-end bg-primary text-primary-foreground, USER self-start bg-muted, whitespace-pre-wrap, authorName + faDate; reply Textarea+Button (disabled empty, POST messages, refetch). Mobile: selection-driven show/hide + ArrowRight back button (lg:hidden). Empty states both columns.

8. `src/app/(panel)/admins/page.tsx` — مدیران: useAdmin gate → non-SUPERADMIN sees EmptyState (ShieldOff, «دسترسی محدود»); SUPERADMIN gets GET /api/v1/admins table (نام+username, ROLE_LABEL Badge default/secondary/outline, نشست‌های فعال _count.sessions, Switch وضعیت disabled for self, عضویت faDate, edit/delete; delete disabled for self + ConfirmDialog). Create dialog: username ltr, name, role Select default VIEWER, password ltr (client min-8 validation); Edit dialog: name/role/password optional («در صورت خالی بودن، گذرواژه تغییر نمی‌کند»). «رویدادهای امنیتی» GET /api/v1/audit?page=1&pageSize=15 compact table (ACTION_LABEL, adminName, entity, ip ltr mono, faDate) with independent error state.

9. `src/app/(panel)/settings/page.tsx` — تنظیمات: Tabs عمومی/نسخه‌ها. General: GET /api/v1/settings → controlled fields app.name/app.tagline/app.minVersion(ltr)/app.supportMessage(textarea)/app.notice(textarea)/ads.enabled Switch(value==="true")/api.publicBaseUrl(ltr); Save → PUT merged map `{...original, ...}` so unknown keys preserved; VIEWER sees read-only fields (no save). Versions: GET /api/v1/versions table (versionName bold + versionCode ltr mono, apkUrl truncated external link, اجباری destructive Badge, فعال Badge, faDate, edit/delete — delete SUPERADMIN); Dialog versionName(ltr 4.8.18 placeholder)/versionCode(number)/apkUrl(ltr)/notes/mandatory Switch/active Switch.

## Verification
- `bunx tsc --noEmit` → 0 errors in my 9 files.
- Remaining pre-existing/foreign errors (NOT mine, reported only):
  - `next.config.ts(14,3) TS2353` — `eslint` key not in `NextConfig` type (pre-existing config file).
  - `src/app/api/v1/tickets/[id]/route.ts(45,21) TS2304` — `Cannot find name 'parseBody'` (backend route owned by the API agent — needs its own import/helper).

## Contract notes / minor deviations
- Used only allowed imports (`@/components/ui/*`, `@/components/panel-kit`, `@/lib/client`, `@/lib/roles`, `lucide-react`, `sonner`, `react`); `cn` not imported (used template literals) since `@/lib/utils` was not on the allowed list.
- `STATUS_LABEL` for lines named `STATUS_LABEL` (per spec) and exported helper `lineStatusVariant` for the Badge color mapping; no blue/indigo classes anywhere (amber/orange for crowded/delay, emerald only for the honest API-status dot).
- Ads PUT: body/imageUrl/linkUrl sent as `null` when cleared (allows un-setting), startsAt/endsAt omitted when empty per spec; dates converted local↔ISO properly.
- Users pagination assumes server page size 200 (PAGE_SIZE=200 sent implicitly via `page` param; قبلی/بعدی computed from returned `total`).
- VIEWER hides all create/edit/delete/save controls; SUPERADMIN-only deletes (plus 403 still toasted via ApiClientError catch as backstop).
- Stations: did NOT pass ?city= server filter — fetches full list once and filters client-side (list is ~199 rows; keeps filters instant and avoids refetch on every filter change).
- Next 16 client pages: `"use client"` first line, no metadata exports.
