#!/usr/bin/env bash
# ============================================================
# نگهبان پنل مدیریت درمسیر — بازگردانی خودکار از snapshot
# استفاده: bash admin-guard/restore-admin.sh
# اگر پوشه mini-services/darmasir-admin غایب یا ناقص بود،
# از نسخه فشرده admin-guard/darmasir-admin-snapshot.tar.gz
# بازگردانده و سرویس روی پورت ۳۰۳۵ استارت می‌شود.
# ============================================================
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT/mini-services/darmasir-admin"
SNAP="$ROOT/admin-guard/darmasir-admin-snapshot.tar.gz"
LOG="$ROOT/darmasir-admin.log"

echo "[guard] بررسی پنل مدیریت درمسیر…"

need_restore=0
if [ ! -f "$TARGET/index.ts" ] || [ ! -f "$TARGET/package.json" ] || [ ! -f "$TARGET/public/app.js" ] || [ ! -f "$TARGET/src/api.ts" ]; then
  need_restore=1
fi

if [ "$need_restore" = "1" ]; then
  echo "[guard] ⚠️  پوشه پنل ناقص یا حذف شده است — بازگردانی از snapshot…"
  if [ ! -f "$SNAP" ]; then
    echo "[guard] ✗ snapshot یافت نشد: $SNAP"
    echo "[guard] بازیابی از گیت را امتحان کنید: git checkout HEAD -- mini-services/darmasir-admin"
    exit 1
  fi
  mkdir -p "$ROOT/mini-services"
  tar -xzf "$SNAP" -C "$ROOT/mini-services/"
  echo "[guard] ✓ پنل از snapshot بازگردانی شد"
else
  echo "[guard] ✓ پوشه پنل کامل است"
fi

# سرویس در حال اجرا است؟
if curl -s -o /dev/null --max-time 2 "http://localhost:3035/"; then
  echo "[guard] ✓ سرویس روی پورت ۳۰۳۵ فعال است"
else
  echo "[guard] استارت سرویس…"
  (cd "$TARGET" && nohup bun run dev > "$LOG" 2>&1 &)
  sleep 2
  if curl -s -o /dev/null --max-time 2 "http://localhost:3035/"; then
    echo "[guard] ✓ سرویس استارت شد (پورت ۳۰۳۵)"
  else
    echo "[guard] ✗ استارت ناموفق — لاگ: $LOG"
    exit 1
  fi
fi

echo "[guard] دسترسی پنل: /?XTransformPort=3035 (کاربر admin)"
