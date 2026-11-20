import { db } from "@/lib/db";
import { hashToken, SESSION_COOKIE } from "@/lib/auth";
import { requireAdmin, ok } from "@/lib/api";

// ============================================================
// نشست‌های فعال (revoked=false و expiresAt>now)
// نشست جاری درخواست‌دهنده با current مشخص می‌شود
// ============================================================

export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const currentToken = match
    ? decodeURIComponent(match.split("=").slice(1).join("="))
    : null;
  const currentHash = currentToken ? hashToken(currentToken) : null;

  const now = new Date();
  const sessions = await db.session.findMany({
    where: { revoked: false, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      tokenHash: true,
      ip: true,
      userAgent: true,
      createdAt: true,
      expiresAt: true,
      admin: {
        select: { id: true, name: true, username: true, role: true },
      },
    },
  });

  return ok({
    sessions: sessions.map((s) => {
      const { tokenHash, ...rest } = s;
      return { ...rest, current: currentHash ? tokenHash === currentHash : false };
    }),
  });
}
