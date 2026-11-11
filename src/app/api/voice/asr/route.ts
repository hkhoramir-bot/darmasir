import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ============================================================
   POST /api/voice/asr  { audioBase64, key? }
   تبدیل گفتار فارسی به متن — فقط موتور Gemini (دقت بالا برای فارسی).
   تضمین: هیچ سرویس دیگری به‌عنوان fallback استفاده نمی‌شود تا
   خروجی همیشه فارسی بماند.
   کلید: بدنه درخواست (تنظیمات دستگاه کاربر) یا GEMINI_API_KEY سرور.
   ============================================================ */

const GEMINI_ASR_MODEL = "gemini-2.5-flash";

async function geminiTranscribe(audioBase64: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_ASR_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "این فایل صوتی به زبان فارسی است (نام ایستگاه یا فرمان کاربر اپ مترو). " +
                    "دقیقاً آن را به متن فارسی تبدیل کن. فقط متن نهایی را بنویس، بدون هیچ توضیح اضافه.",
                },
                {
                  inlineData: { mimeType: "audio/webm", data: audioBase64 },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      }
    );
    if (!res.ok) {
      console.error("Gemini ASR error:", res.status, (await res.text().catch(() => "")).slice(0, 400));
      return null;
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join(" ")
      .trim();
    return text || null;
  } catch (error) {
    console.error("Gemini ASR exception:", error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const audioBase64: string = (body?.audioBase64 ?? "").toString().replace(/^data:[^;]+;base64,/, "");
  const key = (body?.key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "")
    .toString()
    .trim();

  if (!audioBase64) {
    return NextResponse.json({ error: "فایل صوتی ارسال نشده است" }, { status: 400 });
  }

  // مسیرGemini — تنها وقتی کلید سرور موجود باشد (اختیاری؛ برای کاربر لازم نیست)
  if (!key) {
    return NextResponse.json(
      {
        error: "no_key",
        message:
          "جستجوی صوتی در این مرورگر در دسترس نیست — لطفاً عبارت را تایپ کنید. (روی کروم اندروید جستجوی صوتی فارسی مستقیماً کار می‌کند)",
      },
      { status: 503 }
    );
  }

  const text = await geminiTranscribe(audioBase64, key);
  if (text) return NextResponse.json({ text, engine: "gemini" });

  return NextResponse.json(
    {
      error: "asr_failed",
      message: "گفتاری تشخیص داده نشد. نزدیک میکروفون و واضح صحبت کنید.",
    },
    { status: 502 }
  );
}
