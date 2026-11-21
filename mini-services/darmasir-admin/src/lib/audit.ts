// ثبت رویدادهای مدیریتی — عملیات حساس باید audit log داشته باشند
// ثبت audit هرگز جریان اصلی را نمی‌شکند (best-effort)

import { db } from "./db";
import { clientIp } from "./auth";
import type { AdminIdentity } from "./auth";

export async function audit(
  req: Request,
  admin: AdminIdentity | null,
  action: string,
  opts: { entity?: string; entityId?: string; detail?: string } = {}
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        adminId: admin?.id ?? null,
        adminName: admin?.name ?? null,
        action,
        entity: opts.entity ?? null,
        entityId: opts.entityId?.slice(0, 100) ?? null,
        detail: opts.detail?.slice(0, 500) ?? null,
        ip: clientIp(req),
      },
    });
  } catch (err) {
    console.error("[audit] ثبت ناموفق:", err);
  }
}
