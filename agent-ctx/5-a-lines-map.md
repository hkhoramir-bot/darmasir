# Task 5-a — Lines, Line Detail & Interactive Map Pages

**Agent:** 5-a (Lines & Map) — Metrojo Next.js 16 App Router
**Date:** 2025 (session task)
**Status:** ✅ Complete — tsc clean, eslint clean, all routes 200

## Files Created
1. `src/app/(app)/lines/page.tsx` — top-level "خطوط و نقشه" tab page
2. `src/app/(app)/lines/[id]/page.tsx` — line detail page
3. `src/app/(app)/map/page.tsx` — interactive map page

## Implementation Summary

### /lines
- `<AppBar />` + standard `main` (px-4 pt-3 pb-28 space-y-4). `useInitCity()` + `city` from `useShell`.
- Line cards filtered by selected city (`LINES.filter(l => l.cityId === city)`), one card per line:
  colored badge (w-11 h-11, `خط` + Persian number), terminals with `sync_alt`, headway
  `قطار هر {toFa(headway)} دقیقه`, service hours (dir="ltr" wrapper so times read correctly),
  live crowd pill (`crowdingNow` + `CROWD_LABEL`, dots emerald-500/amber-500/red-500),
  `chevron_left`, and `bg-error-container text-on-error-container` banner for
  `delay` ("تاخیر در سرویس") / `closed` ("خط مسدود است"). Click → `/lines/{id}`.
- "همه ایستگاه‌های تقاطعی" section: `STATIONS.filter(s => s.lines.length > 1 && s.cityId === city)`,
  scrollable (`max-h-72 overflow-y-auto pretty-scroll`), rows with cyan chip
  `تقاطع ۱ و ۴` (numbers via `getLine().number` + toFa), per-line mini color chips → `/stations/{id}`.
- Quick link card to `/map` (`bg-primary/5 border-primary/20`).

### /lines/[id]
- Client component reading `useParams<{ id: string }>()` (Next 16 style, NOT props params).
- `PageHeader` with title/subtitle + crowd pill as `actions`.
- Hero card: big badge, direction, headway/first-last/service-status 3-col stats
  (`isWithinService` → "در حال سرویس"/"خارج از سرویس"), **live arrivals** from
  `nextArrivals(line.id, firstStation.id)` — ⚠️ returns **seconds**, converted with
  `Math.max(1, Math.ceil(sec / 60))`, first two shown ("بعدی/سپس: X دقیقه").
- Station timeline: `stationsOfLine` ordered by `order`; normal dots `ring-2 ring-surface-container-lowest`,
  interchanges = white dot + 2px colored border + "تقاطعی" chip + 14px other-line color squares;
  dashed connectors via existing `.line-dashed` with
  `style={{ "--tw-line-color": line.color } as React.CSSProperties}`; rows → `/stations/{id}`;
  `max-h-96 overflow-y-auto pretty-scroll`.
- Timetable card: `timetableFor()` rows (direction, first/last, peak/off headway).
  ⚠️ `timetableFor` already returns Persian-formatted strings — do NOT re-apply `toFa`.
- Bottom CTA "مسیریابی از این خط" → `/stations?line={id}` + TTS button (`useAnnouncer`):
  announces `{name} از {t0} تا {t1}. قطار بعدی {X} دقیقه`; button toggles stop state while speaking.

### /map
- `PageHeader` + `<main className="flex-1 w-full pb-28 pt-3">` (no horizontal padding).
- Map card `mx-4` wrapping `<MetroMap className="h-[560px] w-full" onStationSelect={id → /stations/{id}} />`
  (MetroMap root is `relative overflow-hidden rounded-2xl` and needs explicit height — passed via className).
- Legend card (Tehran lines, colored dots, rows link to `/lines/{id}`) + gesture tips card
  (one-finger pan / two-finger zoom / tap station).

## Verification
- `bunx tsc --noEmit` (filtered examples/skills): **0 errors**
- `bunx eslint "src/app/(app)/lines" "src/app/(app)/map"`: **0 problems**
- Runtime: `/lines`, `/lines/l1`, `/lines/l5`, `/map` all **HTTP 200**, content markers verified in HTML,
  dev.log shows clean compiles (no runtime errors).

## Conventions Followed
- Design tokens only (bg-surface-*, text-on-surface*, border-outline-variant/*, bg-primary/*, bg-tertiary-fixed/40).
- Standard card recipe, section-header pattern with live badge, primary CTA recipe,
  `active:scale-*` + hover on all interactive elements, Persian digits everywhere via `toFa`,
  `MI` icons from `@/components/metro/shell`, no `any`, no unused imports,
  no dark mode, no layout files touched, metro-map.tsx untouched.

## Deviations (minor)
- Status banner for `crowded` lines intentionally not shown (crowd pill already conveys it);
  spec only required banners for delay/closed.
- Added tiny count badges ({n} ایستگاه / {n} خط فعال) and a footer caption line for polish —
  within the approved token system.

## Notes for next agents
- `/stations?line={id}` query param is emitted by the line-detail CTA — the stations page
  (task 5-b?) can read it via `useSearchParams()` to prefilter by line.
- `nextArrivals` returns seconds not minutes; `timetableFor` returns pre-formatted Persian strings.
- `LineDef.status` may also be `"crowded"` (undefined-safe via optional field).
