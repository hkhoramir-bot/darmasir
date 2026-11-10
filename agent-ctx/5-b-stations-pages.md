# Task 5-b — Stations Pages (search/list + detail) — Work Record

## Summary
Built the two "ایستگاه‌ها" pages for the Metrojo app, following the approved design contract (M3-style tokens, Persian RTL, mobile canvas). Only the two page files were created; no shell/layout/data files touched.

## Files created
- `src/app/(app)/stations/page.tsx` — top-level tab page: AppBar + search card (text input + mic via `useVoiceSearch` → sets query), filter chip row (همه / city lines with colored dots / 5 facility chips from AMENITIES: escalator, elevator, wc, parking, bus), results list card (`searchStations({q, lineId, facility, cityId})` with crowd pill via `crowdingNow`+`CROWD_LABEL`, تقاطعی chip, deterministic distance tag `(hash%9+2)*100` m, featured star), favorites strip (GET /api/favorites, empty state text), and "پرترددترین ایستگاه‌ها" live teaser (3 featured stations, `nextArrivals` first value → "قطار بعدی: X دقیقه", 30s refresh, gated behind post-hydration `now` tick to avoid SSR mismatch).
- `src/app/(app)/stations/[id]/page.tsx` — client detail page using `useParams<{id:string}>()`. Unknown id → graceful "ایستگاه یافت نشد" card (separate `NotFound` component so hook order stays stable). PageHeader with subtitle `تقاطع ۱ و ۴`/`خط ۲` + favorite star (optimistic POST/DELETE /api/favorites + toast). Hero card: colored line badges (inline style color/textOnColor), live arrivals board from GET /api/arrivals (45s auto-refresh, skeleton + error state), per-line "به سمت {to}" + nextMin/next2Min chips + crowd pill (CROWD_COLOR), TTS `volume_up` button → `ایستگاه X. قطار بعدی N دقیقه`. 4-segment tab bar (امکانات / خروجی‌ها / هشدار مقصد / گزارش):
  - امکانات: grid-cols-4 amenity tiles (amenitiesLabels icons) + "نقاط شاخص اطراف" (landmarksFor, empty-state guarded).
  - خروجی‌ها: exit cards (label, direction chip, accessibility text-[10px] text-outline, landmarks joined "•").
  - هشدار مقصد: "بیدارباش هوشمند" — 2/3/4 station pills, custom switch (right-0.5 ↔ right-[22px], no RTL translate ambiguity), persists localStorage `metrojo-alert` JSON {stationId, stationName, beforeStations}, toast "هشدار مقصد فعال شد" + TTS announce; re-picking N while active re-saves storage.
  - گزارش: equipment type pills, status pills (سالم/خراب/در حال تعمیر), optional note textarea, POST /api/reports → toast "گزارش شما ثبت شد. سپاس از همکاری" + form reset + report list refresh; below: official `equipmentFor` rows (colored dot by active/total, note) + recent passenger reports (GET /api/reports) with local label maps.

## API contracts actually used (verified by reading route files)
- `GET /api/arrivals?station=` → `{station, arrivals:[{lineId,lineName,lineNumber,color,textOnColor,headwayLabel,to,toBack,nextMin,next2Min,crowd,crowdLabel,firstTrain,lastTrain}], ts}` — NOTE: differs from the task brief's `lineColor/destination/minutes/carCount`; coded against the real route.
- `GET /api/favorites` → `{favorites:[{id,name,isInterchange,lines:[{id,number,name,color,textOnColor}],amenities,favoritedAt}], ids:string[]}`; `POST {stationId}`; `DELETE ?stationId=` — NOTE: delete param is `stationId`, not `station` as the brief said.
- `GET /api/reports?station=` → raw Prisma rows `{reports:[{id,stationId,equipmentType,exitLabel,status,note,createdAt}]}`; `POST {stationId,equipmentType,exitLabel?,status,note?}`.
- `equipmentFor()` real shape is `{type,typeLabel,exits,total,active,note?}` (not `{type,status,note}` as briefed) — status dot derived from active vs total.
- `useToast` is exported from `@/hooks/use-toast` (toaster.tsx only exports `Toaster`); imported from there. `useVoiceSearch`/`useAnnouncer` live in `@/components/metro/voice` (voice.ts).

## Verification
- `bunx tsc --noEmit` (filtered) — clean.
- `bunx eslint "src/app/(app)/stations"` — clean (fixed initial `react-hooks/set-state-in-effect` on the live-clock tick by moving first update into a setTimeout callback, and removed an unused `useCallback` import).
- Dev server smoke test: `GET /stations` 200, `GET /stations/tajrish` 200, `GET /stations/__unknown__` 200 (graceful not-found), `GET /api/arrivals?station=tajrish` 200 — no compile errors in dev.log.

## Notes for next agents
- Both pages are self-contained; no shared components were added.
- Favorite star state on detail page initializes from `/api/favorites` `ids`.
- `metrojo-alert` localStorage shape: `{stationId, stationName, beforeStations}` — any global "wake-up alarm" feature can consume this key.
