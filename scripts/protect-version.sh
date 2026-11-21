#!/usr/bin/env bash
###############################################################################
# protect-version.sh — بازرسی و ترمیم خودکار قفل نسخه 4.8.23 (versionCode 503)
#
# طبق GUARDIAN.md و VERSION_LOCK.md — این اسکریپت را بعد از هر restore
# اسنپ‌شات، ریست روزانه یا هرگاه مشکوک به تغییر نسخه هستید اجرا کنید:
#     bash scripts/protect-version.sh
#
# قابلیت‌ها:
#   - بازرسی هر ۸ نقطه الزامی قفل نسخه
#   - ترمیم خودکار: APKها، رشته‌های سورس، build.gradle، DB پنل، پوش ابری
#   - کامیت + پوش خودکار ترمیم‌ها با پیام واضح
#   - بدون وابستگی خارجی (bun داخلی + curl + python3)
###############################################################################
set -u

cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"

CANONICAL_VERSION="4.8.23"
CANONICAL_CODE="503"
CANONICAL_MD5="70abf2f04856e76786aff5d8b50da780"
APK_PRIMARY="public/metrojo-4.8.23.apk"
APK_MASTER="cloudflare-worker/assets/metrojo-4.8.23.apk"
AAPT="/home/z/android-sdk/build-tools/36.0.0/aapt"
UI_MARKER="مقایسه مدهای سفر شهری"
AD_MARKER="بخش تبلیغ"

OK=0; FAIL=0; REPAIRED=0
log()  { echo "[protect] $*"; }
ok()   { echo "[protect]   ✓ $*"; OK=$((OK+1)); }
bad()  { echo "[protect]   ✗ $*"; FAIL=$((FAIL+1)); }
fixed(){ echo "[protect]   🔧 ترمیم شد: $*"; REPAIRED=$((REPAIRED+1)); }

# ---------- رفرنس مرجع (تگ یا کامیت) ----------
CANONICAL_REF=""
if git rev-parse -q --verify "v4.8.23-locked^{commit}" >/dev/null 2>&1; then
  CANONICAL_REF="v4.8.23-locked"
fi
if [ -z "$CANONICAL_REF" ]; then
  log "⚠ هشدار: تگ v4.8.23-locked در تاریخچه نیست — ترمیم git غیرفعال"
fi

md5_of() { md5sum "$1" 2>/dev/null | cut -d' ' -f1; }

log "بازرسی قفل نسخه $CANONICAL_VERSION (versionCode $CANONICAL_CODE) — مرجع: $CANONICAL_REF"
log "---------------------------------------------------------------"

# ---------- 1) APK مرجع عمومی ----------
log "[1/8] فایل APK قابل دانلود"
FIRST_MD5="$(md5_of "$APK_PRIMARY")"
if [ "$FIRST_MD5" = "$CANONICAL_MD5" ]; then
  ok "$APK_PRIMARY md5 صحیح"
else
  bad "$APK_PRIMARY گم‌شده یا خراب (md5=${FIRST_MD5:-none})"
  if [ -f "$APK_MASTER" ] && [ "$(md5_of "$APK_MASTER")" = "$CANONICAL_MD5" ]; then
    cp -f "$APK_MASTER" "$APK_PRIMARY" && fixed "بازگردانی از $APK_MASTER"
  fi
fi
if [ -f "$APK_MASTER" ]; then
  if [ "$(md5_of "$APK_MASTER")" = "$CANONICAL_MD5" ]; then
    ok "$APK_MASTER md5 صحیح"
  else
    bad "$APK_MASTER ناهمسان با مرجع — بازنویسی از نسخه عمومی صحیح"
    [ -f "$APK_PRIMARY" ] && cp -f "$APK_PRIMARY" "$APK_MASTER" && fixed "$APK_MASTER"
  fi
else
  bad "$APK_MASTER وجود ندارد — بازگردانی از نسخه عمومی"
  [ -f "$APK_PRIMARY" ] && cp -f "$APK_PRIMARY" "$APK_MASTER" && fixed "$APK_MASTER"
fi
# APKهای قدیمی‌تر طبق GUARDIAN بخش ۶ نباید در public/ باشند — همه به‌جز نسخه جاری حذف می‌شوند
for old in public/metrojo-*.apk; do
  [ -e "$old" ] || continue
  case "$old" in
    "$APK_PRIMARY") continue ;;
  esac
  bad "$old قدیمی است — طبق GUARDIAN بخش ۶ حذف می‌شود"
  rm -f "$old" && fixed "$old حذف شد"
done

# ---------- 2) aapt (در صورت موجود بودن) ----------
log "[2/8] متادیتای APK (aapt)"
if [ -x "$AAPT" ] && [ -f "$APK_PRIMARY" ]; then
  BADGE="$("$AAPT" dump badging "$APK_PRIMARY" 2>/dev/null | grep '^package:' | head -1)"
  if echo "$BADGE" | grep -q "versionCode='$CANONICAL_CODE'" && echo "$BADGE" | grep -q "versionName='$CANONICAL_VERSION'"; then
    ok "aapt: versionCode=$CANONICAL_CODE versionName=$CANONICAL_VERSION"
  else
    bad "aapt: $BADGE"
  fi
else
  log "  - aapt در دسترس نیست؛ از md5 استفاده شد (کافی است)"
fi

# ---------- 3) build.gradle ----------
log "[3/8] android/app/build.gradle"
GRC="$(grep -E 'versionCode\s+[0-9]+' android/app/build.gradle | grep -oE '[0-9]+' | head -1)"
GRN="$(grep -E 'versionName\s+"' android/app/build.gradle | grep -oE '"[^"]+"' | tr -d '"')"
if [ "$GRC" = "$CANONICAL_CODE" ] && [ "$GRN" = "$CANONICAL_VERSION" ]; then
  ok "gradle: versionCode=$GRC versionName=$GRN"
else
  bad "gradle: versionCode=$GRC versionName=$GRN (باید $CANONICAL_CODE / $CANONICAL_VERSION)"
fi

# ---------- 4) رشته‌های سورس ----------
log "[4/8] رشته‌های نسخه در src"
if grep -q 'FALLBACK_APP_VERSION = "4.8.23"' src/components/metro/panel-banners.tsx; then
  ok "FALLBACK_APP_VERSION = 4.8.23"
else
  bad "FALLBACK_APP_VERSION در panel-banners.tsx ناهمسان"
fi
if grep -q '/metrojo-4.8.23.apk' src/components/metro/apk-download.tsx && grep -q '/metrojo-4.8.23.apk' 'src/app/(app)/settings/page.tsx'; then
  ok "لینک دانلود /metrojo-4.8.23.apk صحیح"
else
  bad "لینک دانلود در apk-download.tsx یا settings/page.tsx ناهمسان"
fi

# ---------- 5) نشانگرهای UI صحیح ----------
log "[5/8] نشانگرهای UI نسخه صحیح در سورس"
grep -rq "$UI_MARKER" 'src/app/(app)/page.tsx' && ok "«$UI_MARKER» در خانه موجود" || bad "«$UI_MARKER» از خانه حذف شده!"
grep -rq "$AD_MARKER" src/components/metro/ad-banner.tsx && ok "«$AD_MARKER» موجود" || bad "«$AD_MARKER» حذف شده!"
if [ -f src/app/page.tsx ]; then
  bad "src/app/page.tsx نباید وجود داشته باشد (روت / باید از (app)/page.tsx سرو شود) — حذف می‌شود"
  rm -f src/app/page.tsx && fixed "src/app/page.tsx حذف شد"
fi

# ---------- 6) DB پنل ----------
log "[6/8] DB پنل (mini-services/darmasir-admin/data/admin.db)"
DB_VER="$(bun -e "
const { Database } = require('bun:sqlite');
try {
  const db = new Database('mini-services/darmasir-admin/data/admin.db', { readonly: true });
  const r = db.query(\"SELECT value FROM settings WHERE key='app_version'\").get();
  console.log(r?.value ?? '');
  db.close();
} catch(e) { console.log(''); }
" 2>/dev/null)"
if [ "$DB_VER" = "$CANONICAL_VERSION" ]; then
  ok "DB پنل app_version=$DB_VER"
else
  bad "DB پنل app_version='$DB_VER' — بازگردانی به $CANONICAL_VERSION"
  bun -e "
const { Database } = require('bun:sqlite');
const db = new Database('mini-services/darmasir-admin/data/admin.db');
db.query(\"INSERT INTO settings (key, value) VALUES ('app_version', '$CANONICAL_VERSION') ON CONFLICT(key) DO UPDATE SET value = excluded.value\").run();
db.close(); console.log('done');
" 2>/dev/null && fixed "DB پنل app_version=$CANONICAL_VERSION"
fi

# بج صفحه درباره-ما هم باید همان نسخه قفل‌شده را نشان دهد
DB_BADGE="$(bun -e "
const { Database } = require('bun:sqlite');
try {
  const db = new Database('mini-services/darmasir-admin/data/admin.db', { readonly: true });
  const r = db.query(\"SELECT value FROM settings WHERE key='about_page'\").get();
  console.log(JSON.parse(r?.value ?? '{}')?.version_badge ?? '');
  db.close();
} catch(e) { console.log(''); }
" 2>/dev/null)"
if [ "$DB_BADGE" = "نسخه $CANONICAL_VERSION" ]; then
  ok "DB پنل version_badge='$DB_BADGE'"
else
  bad "DB پنل version_badge='$DB_BADGE' — بازگردانی به نسخه $CANONICAL_VERSION"
  bun -e "
const { Database } = require('bun:sqlite');
const db = new Database('mini-services/darmasir-admin/data/admin.db');
const row = db.query(\"SELECT value FROM settings WHERE key='about_page'\").get();
const j = JSON.parse(row?.value ?? '{}');
j.version_badge = 'نسخه $CANONICAL_VERSION';
db.query(\"UPDATE settings SET value = ? WHERE key = 'about_page'\").run(JSON.stringify(j));
db.close(); console.log('done');
" 2>/dev/null && fixed "DB پنل version_badge=نسخه $CANONICAL_VERSION" && bun scripts/cloud-sync.ts >/dev/null 2>&1 && fixed "پوش ابری بعد از ترمیم بج"
fi

# ---------- 7) ابر (KV ورکر) ----------
log "[7/8] ابر dataid.hurremmed.ir (KV)"
CLOUD_VER="$(curl -s --max-time 15 "https://dataid.hurremmed.ir/api/v1/public/content" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print(d.get('data',d).get('settings',{}).get('app_version') or '')
except Exception: print('')
" 2>/dev/null)"
if [ "$CLOUD_VER" = "$CANONICAL_VERSION" ]; then
  ok "ابر app_version=$CLOUD_VER"
else
  bad "ابر app_version='$CLOUD_VER' — پوش مجدد از DB پنل"
  if bun scripts/cloud-sync.ts; then
    fixed "ابر با app_version=$CANONICAL_VERSION پوش و تایید شد"
  else
    bad "پوش ابری ناموفق — دستی اجرا کنید: bun scripts/cloud-sync.ts"
  fi
fi

# ---------- 8) خروجی استاتیک (هشدار) ----------
log "[8/8] خروجی استاتیک out/ (فقط هشدار)"
if grep -rlq "$UI_MARKER" out/_next/static/chunks/ 2>/dev/null; then
  ok "out/ شامل UI نسخه صحیح است"
else
  log "  ⚠ out/ قدیمی است (فقط روی ساخت APK بعدی اثر دارد):"
  log "    NEXT_EXPORT=1 bunx next build && rm -rf out && cp -r .next-export out && bunx cap sync android"
fi

# ---------- ترمیم git در صورت ناهمسانی ----------
NEED_GIT_REPAIR=0
if [ "$GRN" != "$CANONICAL_VERSION" ] || [ "$GRC" != "$CANONICAL_CODE" ] \
   || ! grep -q 'FALLBACK_APP_VERSION = "4.8.23"' src/components/metro/panel-banners.tsx 2>/dev/null \
   || [ -f src/app/page.tsx ]; then
  NEED_GIT_REPAIR=1
fi
if [ "$NEED_GIT_REPAIR" = "1" ]; then
  if [ -n "$CANONICAL_REF" ]; then
    log "بازگرداندن فایل‌های نسخه از $CANONICAL_REF ..."
    git checkout "$CANONICAL_REF" -- android/app/build.gradle src/components/metro/panel-banners.tsx src/components/metro/apk-download.tsx 'src/app/(app)/settings/page.tsx' 2>/dev/null \
      && fixed "فایل‌های نسخه از $CANONICAL_REF بازگردانده شد" \
      || bad "git checkout از مرجع ناموفق بود"
  else
    bad "ترمیم git ممکن نیست — رفرنس مرجع موجود نیست. طبق GUARDIAN.md دستی بازگردانی کنید"
  fi
fi

# ---------- کامیت + پوش ترمیم‌ها ----------
if git status --porcelain -- android/app/build.gradle src/components/metro/panel-banners.tsx src/components/metro/apk-download.tsx 'src/app/(app)/settings/page.tsx' src/app/page.tsx public/*.apk "$APK_MASTER" 2>/dev/null | grep -q .; then
  git add android/app/build.gradle src/components/metro/panel-banners.tsx src/components/metro/apk-download.tsx 'src/app/(app)/settings/page.tsx' src/app/page.tsx "$APK_PRIMARY" "$APK_MASTER" 2>/dev/null
  git commit -m "guard: enforce locked version ${CANONICAL_VERSION} (versionCode ${CANONICAL_CODE}) — ترمیم خودکار طبق GUARDIAN.md" >/dev/null 2>&1 \
    && { log "[protect] ترمیم‌ها کامیت شد — در حال push ..."; git push origin HEAD 2>&1 | tail -1; } \
    || bad "کامیت/پوش ترمیم ناموفق"
fi

# ---------- تضمین تگ محافظتی ----------
if ! git rev-parse -q --verify "refs/tags/v4.8.23-locked" >/dev/null 2>&1; then
  log "⚠ تگ v4.8.23-locked هنوز ساخته نشده — پس از انتشار نسخه جدید ساخته و پوش شود"
fi

log "---------------------------------------------------------------"
log "خلاصه: ✓موفق=$OK 🔧ترمیم=$REPAIRED ✗نقض=$FAIL"
if [ "$FAIL" -gt 0 ]; then
  log "⚠ نقض قفل نسخه باقی است — طبق GUARDIAN.md اقدام کنید"
  exit 1
fi
log "🔒 قفل نسخه $CANONICAL_VERSION برقرار است"
exit 0
