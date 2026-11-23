# ============================================================
# سرپرست تولید پنل درمسیر — حلقه تضمین زنده‌ماندن سرویس
#  - سقف حافظه ۳۸۴ مگابایت (جلوگیری از OOM در سندباکس ۴GB)
#  - next start به‌طور خودکار .env.local را نمی‌خواند → دستی source می‌کنیم
#  - اگر سرویس سالم باشد کاری نمی‌کند؛ اگر پورت مرده باشد rebuild/start می‌کند
# ============================================================

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

export NODE_OPTIONS="--max-old-space-size=384"
export PORT=3030

# next start فایل‌های env را خودش نمی‌خواند (bun می‌خواند)
if [ -f "$DIR/.env.local" ]; then
  set -a
  . "$DIR/.env.local"
  set +a
fi

LOG="$DIR/panel-server.log"
HEALTH_URL="http://localhost:3030/panel/login"

while true; do
  # سالم؟ تا ۱۵ ثانیه آرام باش
  if curl -s -o /dev/null --max-time 4 "$HEALTH_URL"; then
    sleep 15
    continue
  fi

  # پورت باز است ولی پاسخ نمی‌دهد؟ کمی صبر (شاید در حال build باشد)
  if (exec 3<>/dev/tcp/localhost/3030) 2>/dev/null; then
    sleep 5
    continue
  fi

  # بیلد موجود نیست؟ بساز
  if [ ! -f .next/BUILD_ID ]; then
    echo "[supervisor] building panel..." >> "$LOG"
    bun run build >> "$LOG" 2>&1
  fi

  echo "[supervisor] starting panel at $(date '+%F %T')" >> "$LOG"
  node_modules/.bin/next start -p 3030 >> "$LOG" 2>&1
  echo "[supervisor] panel exited at $(date '+%F %T') — retry in 3s" >> "$LOG"
  sleep 3
done
