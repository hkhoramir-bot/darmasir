import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const PANEL_BASE = (process.env.PANEL_API_BASE || "http://localhost:3035").replace(/\/+$/, "");

export interface TicketReplyItem {
  id: string | number;
  subject: string;
  category: string;
  message: string;
  status: string;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

const dedupeKey = (t: TicketReplyItem) => `${t.subject}|${String(t.message ?? "").slice(0, 100)}`;

/* نسخه دارای پاسخ (پنل) بر نسخه بدون پاسخ (محلی) ترجیح دارد */
const betterOf = (a: TicketReplyItem, b: TicketReplyItem) => (b.reply && !a.reply ? b : a);

/** GET /api/tickets/replies?contact=... یا ?contacts=a,b,c — تیکت‌ها و پاسخ‌های مدیر
 *  برای یک یا چند راه تماس (حساب کاربر + راه‌های تماسی که کاربر با آنها تیکت زده)
 *  ۱) پنل مدیریت — منبع پاسخ‌ها؛ ۲) تیکت‌های محلی — در قطعی پنل.
 *  نتایج همه راه‌های تماس ادغام و بدون تکرار برمی‌گردد. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("contacts") || req.nextUrl.searchParams.get("contact") || "";
  const contacts = Array.from(
    new Set(
      raw
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 6)
    )
  );
  if (contacts.length === 0) {
    return NextResponse.json({ error: "راه تماس الزامی است" }, { status: 400 });
  }

  const merged = new Map<string, TicketReplyItem>();

  /* ۱) پنل مدیریت — برای هر راه تماس یک lookup؛ پاسخ‌ها همین‌جا هستند */
  await Promise.all(
    contacts.map(async (contact) => {
      try {
        const res = await fetch(`${PANEL_BASE}/api/v1/public/tickets/lookup?contact=${encodeURIComponent(contact)}`, {
          signal: AbortSignal.timeout(4000),
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; data?: { tickets?: TicketReplyItem[] } }
          | null;
        if (res.ok && json?.ok && Array.isArray(json.data?.tickets)) {
          for (const t of json.data!.tickets) {
            const k = dedupeKey(t);
            const prev = merged.get(k);
            merged.set(k, prev ? betterOf(prev, t) : t);
          }
        }
      } catch {
        /* پنل در دسترس نیست — نسخه محلی */
      }
    })
  );

  /* ۲) تیکت‌های محلی — برای راه‌های تماسی که هنوز در پنل آینه نشده‌اند */
  try {
    const rows = await db.supportTicket.findMany({
      where: { contact: { in: contacts } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        subject: true,
        category: true,
        message: true,
        status: true,
        reply: true,
        repliedAt: true,
        createdAt: true,
      },
    });
    for (const r of rows) {
      const item: TicketReplyItem = {
        id: r.id,
        subject: r.subject,
        category: r.category,
        message: r.message,
        status: r.status,
        reply: r.reply ?? null,
        repliedAt: r.repliedAt ? new Date(r.repliedAt).toISOString() : null,
        createdAt: new Date(r.createdAt).toISOString(),
      };
      if (!merged.has(dedupeKey(item))) merged.set(dedupeKey(item), item);
      else merged.set(dedupeKey(item), betterOf(merged.get(dedupeKey(item))!, item));
    }
  } catch {
    /* خطای دیتابیس محلی — بی‌صدا */
  }

  const tickets = Array.from(merged.values()).sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
  );
  return NextResponse.json({ ok: true, source: merged.size > 0 ? "panel+local" : "none", contacts, tickets });
}
