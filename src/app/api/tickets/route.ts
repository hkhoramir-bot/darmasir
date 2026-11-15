import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const CATEGORIES = ["general", "bug", "idea", "ad"];

/** POST /api/tickets — ثبت تیکت پشتیبانی از بخش «تماس با ما» */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const contact = typeof body?.contact === "string" ? body.contact.trim() : "";
  const category = CATEGORIES.includes(body?.category) ? body.category : "general";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (name.length < 2) {
    return NextResponse.json({ error: "نام و نام خانوادگی را وارد کنید" }, { status: 400 });
  }
  // ایمیل یا شماره تماس — یکی از این دو کافی است
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const isPhone = /^0?\d{9,11}$/.test(contact.replace(/[\s-]/g, ""));
  if (!isEmail && !isPhone) {
    return NextResponse.json({ error: "ایمیل یا شماره تماس معتبر وارد کنید" }, { status: 400 });
  }
  if (subject.length < 3) {
    return NextResponse.json({ error: "موضوع تیکت باید حداقل ۳ نویسه باشد" }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ error: "متن پیام باید حداقل ۱۰ نویسه باشد" }, { status: 400 });
  }

  try {
    const ticket = await db.supportTicket.create({
      data: { name, contact, category, subject, message },
    });
    return NextResponse.json({ ok: true, id: ticket.id });
  } catch (e) {
    console.error("[tickets] create failed:", e);
    return NextResponse.json({ error: "خطا در ثبت تیکت — دوباره تلاش کنید" }, { status: 500 });
  }
}

/** GET /api/tickets — شمارش تیکت‌های باز */
export async function GET() {
  const count = await db.supportTicket.count({ where: { status: "open" } });
  return NextResponse.json({ openTickets: count });
}
