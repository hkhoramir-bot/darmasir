import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, ok, fail, logAudit } from "@/lib/api";

// ============================================================
// تنظیمات دستیار صوتی — پیام خوش‌آمد، عبارت‌های ثابت راهنما،
// فرهنگ تلفظ و محدودیت‌های سرویس
// ============================================================

const VOICE_KEYS = [
  "voiceGreeting",
  "voiceGuidePhrases",
  "pronunciationDict",
  "asrMaxSeconds",
  "ttsSpeed",
] as const;

const GUIDE_KEYS = ["start", "nextStation", "transfer", "arrive"];

/** parse امن JSON — در صورت خطا مقدار پیش‌فرض */
function safeParse<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v as T;
  } catch {
    return fallback;
  }
}

/** GET — کلیدهای دستیار صوتی با parse امن JSON */
export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;

  const rows = await db.setting.findMany({
    where: { key: { in: [...VOICE_KEYS] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const guideRaw = byKey.get("voiceGuidePhrases");
  const guideObj = safeParse<Record<string, string>>(guideRaw, {});
  const guide: Record<string, string> = {};
  for (const k of GUIDE_KEYS) {
    guide[k] = typeof guideObj[k] === "string" ? guideObj[k] : "";
  }

  const dict = safeParse<Record<string, string>>(byKey.get("pronunciationDict"), {});
  const pronunciation: { word: string; say: string }[] = Object.entries(dict)
    .filter(([w, s]) => typeof w === "string" && typeof s === "string")
    .map(([w, s]) => ({ word: w, say: s }));

  return ok({
    voice: {
      voiceGreeting: byKey.get("voiceGreeting") ?? "",
      guide,
      pronunciation,
      asrMaxSeconds: Number(byKey.get("asrMaxSeconds")) || 15,
      ttsSpeed: Number(byKey.get("ttsSpeed")) || 1,
    },
  });
}

/** PUT — ذخیره تنظیمات صوتی (VIEWER فقط مشاهده) */
export async function PUT(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ("response" in guard) return guard.response;
  const admin = guard.admin;

  if (admin.role === "VIEWER") {
    return fail("دسترسی شما فقط مشاهده است", 403);
  }

  let body: {
    voiceGreeting?: string;
    guide?: Record<string, string>;
    pronunciation?: { word?: string; say?: string }[];
    asrMaxSeconds?: number;
    ttsSpeed?: number;
  };
  try {
    body = await req.json();
  } catch {
    return fail("درخواست نامعتبر است");
  }

  const upserts: { key: string; value: string }[] = [];

  if (body.voiceGreeting !== undefined) {
    const g = String(body.voiceGreeting);
    if (g.trim().length === 0) return fail("پیام خوش‌آمد نمی‌تواند خالی باشد");
    if (g.length > 300) return fail("پیام خوش‌آمد بیش از حد طولانی است");
    upserts.push({ key: "voiceGreeting", value: g });
  }

  if (body.guide !== undefined) {
    const guide: Record<string, string> = {};
    for (const k of GUIDE_KEYS) {
      const v = body.guide[k];
      if (typeof v !== "string" || v.trim().length === 0) {
        return fail("همه عبارت‌های راهنما باید پر باشند");
      }
      if (v.length > 200) {
        return fail("متن عبارت‌های راهنما بیش از حد طولانی است");
      }
      guide[k] = v;
    }
    upserts.push({ key: "voiceGuidePhrases", value: JSON.stringify(guide) });
  }

  if (body.pronunciation !== undefined) {
    if (!Array.isArray(body.pronunciation)) {
      return fail("فرهنگ تلفظ باید فهرست جفت‌ها باشد");
    }
    if (body.pronunciation.length > 50) {
      return fail("حداکثر ۵۰ جفت در فرهنگ تلفظ مجاز است");
    }
    const dict: Record<string, string> = {};
    for (const item of body.pronunciation) {
      const word = String(item?.word ?? "").trim();
      const say = String(item?.say ?? "").trim();
      if (!word || !say) {
        return fail("کلمه و تلفظ هر دو باید پر باشند");
      }
      if (word.length > 60 || say.length > 60) {
        return fail("کلمه یا تلفظ بیش از حد طولانی است");
      }
      dict[word] = say;
    }
    upserts.push({ key: "pronunciationDict", value: JSON.stringify(dict) });
  }

  if (body.asrMaxSeconds !== undefined) {
    const n = Number(body.asrMaxSeconds);
    if (!Number.isFinite(n) || n < 5 || n > 30) {
      return fail("حداکثر ثانیه‌های ورودی صوتی باید عددی بین ۵ تا ۳۰ باشد");
    }
    upserts.push({ key: "asrMaxSeconds", value: String(Math.round(n)) });
  }

  if (body.ttsSpeed !== undefined) {
    const n = Number(body.ttsSpeed);
    if (!Number.isFinite(n) || n < 0.5 || n > 2) {
      return fail("سرعت گوینده باید عددی بین ۰٫۵ تا ۲ باشد");
    }
    upserts.push({ key: "ttsSpeed", value: String(Math.round(n * 10) / 10) });
  }

  if (upserts.length === 0) {
    return fail("هیچ تنظیمی برای ذخیره ارسال نشده است");
  }

  for (const { key, value } of upserts) {
    await db.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  await logAudit(admin.id, "UPDATE", "VOICE_SETTING", undefined, {
    keys: upserts.map((u) => u.key),
  });
  return ok({ saved: upserts.map((u) => u.key) });
}
