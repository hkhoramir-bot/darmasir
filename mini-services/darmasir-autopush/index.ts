/* ============================================================
   درمسیر — سرویس پوش خودکار (نگهبان نسخه جدید)
   هر ساعت: کامیت + force-push وضعیت فعلی به origin/main
   تا ریست‌های روزانه همیشه «آخرین نسخه با آخرین تغییرات» را
   نمایش دهند — نه نسخه قدیمی.
   اجرا: bun index.ts
   ============================================================ */

const REPO = "/home/z/my-project";
const INTERVAL_MS = 60 * 60 * 1000; // هر ساعت

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function pushOnce() {
  try {
    Bun.spawnSync(["git", "add", "-A"], { cwd: REPO });
    const st = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: REPO });
    const dirty = st.stdout.toString().trim().length > 0;
    if (dirty) {
      Bun.spawnSync(
        ["git", "commit", "-m", `auto: snapshot ${new Date().toISOString().slice(0, 16)}`],
        { cwd: REPO }
      );
      log("changes committed");
    }
    const p = Bun.spawnSync(
      ["git", "push", "--force", "origin", "HEAD:main"],
      { cwd: REPO }
    );
    const out = (p.stdout.toString() + p.stderr.toString()).trim();
    log(`push: ${out.slice(0, 160)}`);
  } catch (e) {
    log(`error: ${e}`);
  }
}

log("darmasir-autopush started — interval 1h");
pushOnce();
setInterval(pushOnce, INTERVAL_MS);
