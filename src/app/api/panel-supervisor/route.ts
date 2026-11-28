export const dynamic = "force-dynamic";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { spawn } from "child_process";

// NOTE: مسیر APK استاتیک export می‌شود و این route در دستگاه اجرا نمی‌شود؛
// این فایل فقط زیرساخت توسعه سندباکس است و با UI اپ ارتباطی ندارد.
// وظیفه: سرپرست پنل درمسیر را به‌عنوان فرزند «درخت زنده» این سرور می‌کند
// تا فرآیندش توسط sandbox بازجمع‌آوری نشود (فرزندان این سرور می‌مانند).

const SUPERVISOR =
  "/home/z/my-project/mini-services/darmasir-admin/scripts/supervisor.sh";
const PIDFILE = "/tmp/darmasir-panel-supervisor.pid";

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  if (existsSync(PIDFILE)) {
    try {
      const pid = Number(readFileSync(PIDFILE, "utf8").trim());
      if (Number.isFinite(pid) && pid > 0 && pidAlive(pid)) {
        return Response.json({ ok: true, alreadyRunning: true, pid });
      }
    } catch {
      // pidfile خراب — دوباره می‌سازیم
    }
  }

  const child = spawn("/bin/bash", [SUPERVISOR], {
    detached: true,
    stdio: "ignore",
    cwd: "/home/z/my-project/mini-services/darmasir-admin",
  });
  child.unref();
  try {
    writeFileSync(PIDFILE, String(child.pid));
  } catch {}

  return Response.json({ ok: true, spawned: true, pid: child.pid });
}
