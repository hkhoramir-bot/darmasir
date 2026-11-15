#!/usr/bin/env bash
# ============================================================
# بروزرسانی snapshot پنل مدیریت درمسیر
# بعد از هر تغییر معتبر در mini-services/darmasir-admin اجرا کنید:
#   bash admin-guard/snapshot-admin.sh
# سپس snapshot جدید را کامیت کنید: git add -f admin-guard && git commit
# ============================================================
set -eu
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="darmasir-admin"
SNAP="$ROOT/admin-guard/darmasir-admin-snapshot.tar.gz"

cd "$ROOT/mini-services"
tar -czf "$SNAP" \
  --exclude="darmasir-admin/data/*.db-wal" \
  --exclude="darmasir-admin/data/*.db-shm" \
  --exclude="darmasir-admin/node_modules" \
  "$TARGET"
echo "OK snapshot updated: $SNAP ($(du -h "$SNAP" | cut -f1))"
