# Task 2-a — Admin Panel API Routes (darmasir-admin)

**Agent:** 2-a (API routes)
**Scope:** Only files under `mini-services/darmasir-admin/src/app/api/v1/` — no other file touched, no install/build/dev run.

## Files Written (22)

| # | File | Methods |
|---|------|---------|
| 1 | `auth/login/route.ts` | POST — rateLimit 10/5min, bcrypt verify, createSession, audit LOGIN/LOGIN_FAILED, cookie set |
| 2 | `auth/logout/route.ts` | POST — token from cookie/Bearer, destroySession, best-effort identity, cookie cleared (maxAge 0) |
| 3 | `auth/me/route.ts` | GET — requireAdmin → `{ admin }` |
| 4 | `stats/route.ts` | GET — 14 parallel queries: counts, ad agg, tickets by status, 7d user trends, recentAudit(12), topAds(5) |
| 5 | `lines/route.ts` | GET (city filter, JSON fields parsed back), POST (id regex, 409 conflict, terminals===2, defaults) |
| 6 | `lines/[id]/route.ts` | GET / PUT (all optional, v.id ignored, null clears nullable fields) / DELETE — audited |
| 7 | `stations/route.ts` | GET (city/q/lineId — lineId filtered in JS), POST (line refs validated against Line table, amenities whitelist) |
| 8 | `stations/[id]/route.ts` | GET / PUT (re-validates lineIds if provided) / DELETE — audited |
| 9 | `users/route.ts` | GET — q (name OR deviceId contains), banned filter, page/take 200 → `{ items, total }` |
| 10 | `users/[id]/route.ts` | GET (+ticketCount via `_count`) / PUT (name/active/banned/banReason/city) / DELETE — audited |
| 11 | `ads/route.ts` | GET (placement/active filters), POST (isUrl, ISO dates, endsAt > startsAt check) |
| 12 | `ads/[id]/route.ts` | GET / PUT (dates merged with existing for range check) / DELETE — audited |
| 13 | `ads/[id]/event/route.ts` | POST — PUBLIC, rateLimit 120/min, `{type:"view"|"click"}`, increments counters |
| 14 | `tickets/route.ts` | GET (status/priority/q filters + user + `_count.messages`), POST (ticket + first ADMIN message, deviceId→AppUser link) |
| 15 | `tickets/[id]/route.ts` | GET (messages asc + user) / PUT (status/priority/category) / DELETE — audited |
| 16 | `tickets/[id]/messages/route.ts` | POST — ADMIN reply; OPEN → PENDING; audit REPLY_TICKET |
| 17 | `admins/route.ts` | GET (ADMIN perm, `_count.sessions`), POST (username regex, 409 dup, role enum, password ≥8 hashed) |
| 18 | `admins/[id]/route.ts` | PUT/DELETE (ADMIN perm) — guards: no self demote/deactivate, no self delete, last active SUPERADMIN protected; sessions wiped on deactivate/delete |
| 19 | `settings/route.ts` | GET (Record<string,string>), PUT (plain object, ≤40 keys, key regex, value ≤500, upsert each) |
| 20 | `versions/route.ts` | GET (versionCode desc), POST (semver regex, unique code, apkUrl https-or-/ check) |
| 21 | `versions/[id]/route.ts` | GET / PUT (versionCode conflict excludes self) / DELETE — audited |
| 22 | `audit/route.ts` | GET (ADMIN perm) — page 1.., pageSize 10..100, action/adminId filters → `{ items, total, page, pageSize }` |

## Contract Compliance
- All responses `{ ok: true, data }` via `ok()` / `NextResponse.json`; errors via `handler()` → `{ ok:false, error:{code,message} }` (Persian).
- `export const dynamic = "force-dynamic"` first line of every file; Next 16 `params: Promise<{id}>` signatures.
- `parseBody` helper per file: invalid JSON → `ApiError(400,"INVALID_JSON","بدنه درخواست معتبر نیست.")`.
- No `passwordHash`/`tokenHash` ever returned (explicit `select` whitelists on AdminUser).
- `audit()` always called after successful DB writes; public ad-event route has no auth/audit by design.
- Required str/num via local `reqStr`/`reqNum` wrappers over `str()`/`num()` (cast-safe); optional updates use `!== undefined` narrowing.

## Verification
- `bunx tsc --noEmit -p tsconfig.json` → only **1 pre-existing error outside my scope**: `next.config.ts(14,3) TS2353 'eslint' does not exist in type 'NextConfig'`.
- Zero errors in `src/app/api/v1/**`.

## Notes for next agents
- Session auth: cookie `darmasir_admin_session` (7d, httpOnly, lax) OR `Authorization: Bearer` — both accepted by `requireAdmin`.
- Roles: VIEWER read-only; OPERATOR create/update; SUPERADMIN delete + ADMIN (admins mgmt, audit log).
- `stats` keys: `lines, stations, appUsers, admins, activeAds, adViews, adClicks, ticketsOpen, ticketsPending, ticketsClosed, versions, usersNew7d, usersActive7d, recentAudit, topAds` — ready for dashboard page.
- Lines/stations return JSON-string fields parsed to real arrays (`terminals`, `badges`, `lines`, `amenities`).
- `users` list is paginated client-side-ish: take 200/page, `total` included.
