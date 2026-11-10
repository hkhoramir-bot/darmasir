import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ============================================================
   POST /api/voice/asr  { audioBase64, key? }
   تبدیل گفتار فارسی به متن.
   ۱) اگر کلید Gemini موجود باشد: Gemini (مدل چندوجهی) متن فارسی را استخراج می‌کند.
   ۲) در غیر این صورت: سرویس پشتیبان داخلی.
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

  // ۱) مسیر Gemini (دقیق برای فارسی)
  if (key) {
    const text = await geminiTranscribe(audioBase64, key);
    if (text) return NextResponse.json({ text, engine: "gemini" });
  }

  // ۲) سرویس پشتیبان
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const response = await zai.audio.asr.create({ file_base64: audioBase64 });
    const text = (response.text ?? "").trim();
    if (text) return NextResponse.json({ text, engine: "fallback" });
    return NextResponse.json(
      {
        error: "no_speech",
        message: "گفتاری تشخیص داده نشد. نزدیک میکروفون صحبت کنید و دوباره تلاش کنید.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("ASR Error:", error);
    return NextResponse.json(
      {
        error: "asr_failed",
        message: "تشخیص گفتار در دسترس نیست. کلید Gemini را در تنظیمات وارد کنید تا دقت فارسی بالا برود.",
      },
      { status: 502 }
    );
  }
}
