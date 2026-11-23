/* ============================================================
   /api/v1/public/users/activity — فعالیت واقعی کاربر اپ اندروید
   (سفر / ایستگاه نشان‌شده / مسیر روزمره / تیکت) — مستقیم در Turso
   قراردادِ هم‌شکل ورکر ابری؛ هدر لازم: X-Sync-Key
   POST { identifier, kind, data } | GET ?identifier=...
   ============================================================ */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function checkKey(req: NextRequest): boolean {
  const key = req.headers.get("X-Sync-Key") || "";
  return !!key && key === (process.env.DARMASIR_SYNC_KEY || "darmasir-sync-1404");
}

const rid = () => "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  if (!checkKey(req)) return fail("FORBIDDEN", "کلید همگام‌سازی نامعتبر است", 403);
  const body = await req.json().catch(() => ({}));
  const identifier = String(body?.identifier ?? "").trim().slice(0, 120);
  const kind = String(body?.kind ?? "").trim();
  const data: Record<string, unknown> = body?.data ?? {};
  if (!identifier) return fail("BAD_INPUT", "شناسه کاربر الزامی است", 400);

  try {
    const anyDb = db as unknown as {
      appUserTrip: {
        findFirst: (o: unknown) => Promise<Record<string, unknown> | null>;
        create: (o: unknown) => Promise<unknown>;
        updateMany: (o: unknown) => Promise<unknown>;
        deleteMany: (o: unknown) => Promise<unknown>;
      };
      appUserFavorite: {
        findFirst: (o: unknown) => Promise<Record<string, unknown> | null>;
        create: (o: unknown) => Promise<unknown>;
        deleteMany: (o: unknown) => Promise<unknown>;
      };
      appUserDailyRoute: {
        findFirst: (o: unknown) => Promise<Record<string, unknown> | null>;
        create: (o: unknown) => Promise<unknown>;
        deleteMany: (o: unknown) => Promise<unknown>;
      };
      supportTicket: { create: (o: unknown) => Promise<unknown> };
    };

    switch (kind) {
      case "trip_add": {
        const id = String(data?.id ?? "").trim().slice(0, 40) || rid();
        const dup = await anyDb.appUserTrip.findFirst({ where: { id } });
        if (!dup) {
          await anyDb.appUserTrip.create({
            data: {
              id,
              identifier,
              fromName: String(data?.fromName ?? "").slice(0, 80),
              toName: String(data?.toName ?? "").slice(0, 80),
              minutes: Number(data?.minutes) || 0,
              transfers: Number(data?.transfers) || 0,
              fare: Number(data?.fare) || 0,
            },
          });
        }
        return NextResponse.json({ ok: true, data: { synced: true, kind, id } });
      }
      case "trip_del": {
        await anyDb.appUserTrip.deleteMany({ where: { id: String(data?.id ?? ""), identifier } });
        return NextResponse.json({ ok: true, data: { synced: true, kind } });
      }
      case "trip_del_all": {
        await anyDb.appUserTrip.deleteMany({ where: { identifier } });
        return NextResponse.json({ ok: true, data: { synced: true, kind } });
      }
      case "fav_add": {
        const stationId = String(data?.stationId ?? "").trim().slice(0, 60);
        if (!stationId) return fail("BAD_INPUT", "شناسه ایستگاه الزامی است", 400);
        const dup = await anyDb.appUserFavorite.findFirst({ where: { identifier, stationId } });
        if (!dup) {
          await anyDb.appUserFavorite.create({
            data: {
              identifier,
              stationId,
              stationName: String(data?.stationName ?? "").slice(0, 80),
            },
          });
        }
        return NextResponse.json({ ok: true, data: { synced: true, kind } });
      }
      case "fav_del": {
        await anyDb.appUserFavorite.deleteMany({
          where: { identifier, stationId: String(data?.stationId ?? "") },
        });
        return NextResponse.json({ ok: true, data: { synced: true, kind } });
      }
      case "daily_add": {
        const id = String(data?.id ?? "").trim().slice(0, 40) || rid();
        const dup = await anyDb.appUserDailyRoute.findFirst({ where: { id } });
        if (!dup) {
          await anyDb.appUserDailyRoute.create({
            data: {
              id,
              identifier,
              kind: String(data?.kind ?? "custom").slice(0, 20),
              label: String(data?.label ?? "").slice(0, 80),
              fromName: String(data?.fromName ?? "").slice(0, 80),
              toName: String(data?.toName ?? "").slice(0, 80),
            },
          });
        }
        return NextResponse.json({ ok: true, data: { synced: true, kind, id } });
      }
      case "daily_del": {
        await anyDb.appUserDailyRoute.deleteMany({
          where: { id: String(data?.id ?? ""), identifier },
        });
        return NextResponse.json({ ok: true, data: { synced: true, kind } });
      }
      case "daily_del_all": {
        await anyDb.appUserDailyRoute.deleteMany({ where: { identifier } });
        return NextResponse.json({ ok: true, data: { synced: true, kind } });
      }
      case "ticket": {
        const name = String(data?.name ?? "").trim().slice(0, 80) || "کاربر درمسیر";
        const contact = String(data?.contact ?? "").trim().slice(0, 120) || identifier;
        const message = String(data?.message ?? "").trim().slice(0, 4000);
        const subject = String(data?.subject ?? "").trim().slice(0, 200);
        if (message.length < 5) return fail("BAD_INPUT", "متن تیکت کوتاه است", 400);
        const category = ["general", "bug", "idea", "ad"].includes(String(data?.category))
          ? String(data?.category)
          : "general";
        await anyDb.supportTicket.create({
          data: {
            name,
            contact,
            category,
            subject: subject || "بدون موضوع",
            message,
            status: "open",
          },
        });
        return NextResponse.json({ ok: true, data: { synced: true, kind } });
      }
      default:
        return fail("BAD_INPUT", "نوع فعالیت نامعتبر است", 400);
    }
  } catch (e) {
    console.error("[v1/users/activity]", e);
    return fail("DB_ERROR", "خطا در ثبت فعالیت در دیتابیس", 502);
  }
}

export async function GET(req: NextRequest) {
  if (!checkKey(req)) return fail("FORBIDDEN", "کلید همگام‌سازی نامعتبر است", 403);
  const identifier = (req.nextUrl.searchParams.get("identifier") || "").trim().slice(0, 120);
  if (!identifier) return fail("BAD_INPUT", "شناسه کاربر الزامی است", 400);
  try {
    const anyDb = db as unknown as {
      appUserTrip: { findMany: (o: unknown) => Promise<Record<string, unknown>[]> };
      appUserFavorite: { findMany: (o: unknown) => Promise<Record<string, unknown>[]> };
      appUserDailyRoute: { findMany: (o: unknown) => Promise<Record<string, unknown>[]> };
    };
    const [trips, favorites, daily] = await Promise.all([
      anyDb.appUserTrip.findMany({
        where: { identifier },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      anyDb.appUserFavorite.findMany({
        where: { identifier },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      anyDb.appUserDailyRoute.findMany({
        where: { identifier },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    return NextResponse.json({ ok: true, data: { identifier, trips, favorites, daily } });
  } catch (e) {
    console.error("[v1/users/activity:read]", e);
    return fail("DB_ERROR", "خطا در خواندن فعالیت", 502);
  }
}
