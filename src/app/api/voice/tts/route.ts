import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ============================================================
   POST /api/voice/tts  { text, key? }
   تولید گفتار فارسی با Gemini TTS (صدای Kore).
   کلید: بدنه درخواست (تنظیمات دستگاه کاربر) یا GEMINI_API_KEY سرور.
   خروجی: audio/wav (PCM 16bit مونو)
   ============================================================ */

const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const GEMINI_VOICE = "Kore"; // صدای ثابت و شفاف — مناسب اعلام ایستگاه

let cached: { key: string; buf: Buffer } | null = null;

function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1): Buffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function wavResponse(buf: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(buf.length),
      "Cache-Control": "no-cache",
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text: string = (body?.text ?? "").toString().trim().slice(0, 800);
  const key = (
    body?.key ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ""
  )
    .toString()
    .trim();

  if (!text) {
    return NextResponse.json({ error: "متن خالی است" }, { status: 400 });
  }

  if (!key) {
    return NextResponse.json(
      {
        error: "no_persian_voice",
        message:
          "صدای ابری فعال نیست. کلید Gemini را در تنظیمات برنامه وارد کنید تا اعلام صوتی فارسی فعال شود.",
      },
      { status: 503 }
    );
  }

  const cacheKey = `${text}|${GEMINI_VOICE}`;
  if (cached && cached.key === cacheKey) {
    return wavResponse(cached.buf);
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } },
            },
          },
        }),
        signal: AbortSignal.timeout(45_000),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Gemini TTS error:", res.status, errText.slice(0, 500));
      const message =
        res.status === 400 || res.status === 401 || res.status === 403
          ? "کلید Gemini نامعتبر است یا مدل TTS برای آن فعال نیست."
          : "خطا در تولید صدای ابری. کمی بعد دوباره تلاش کنید.";
      return NextResponse.json(
        { error: "gemini_tts_failed", message },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      candidates?: {
        content?: {
          parts?: { inlineData?: { mimeType?: string; data?: string } }[];
        };
      }[];
    };

    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    const b64 = part?.inlineData?.data;
    const mime = part?.inlineData?.mimeType ?? "audio/L16;codec=pcm;rate=24000";

    if (!b64) {
      return NextResponse.json(
        { error: "empty_audio", message: "صدایی تولید نشد. دوباره تلاش کنید." },
        { status: 502 }
      );
    }

    const rateMatch = /rate=(\d+)/.exec(mime);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const pcm = Buffer.from(b64, "base64");
    const wav = pcmToWav(pcm, sampleRate);

    cached = { key: cacheKey, buf: wav };
    return wavResponse(wav);
  } catch (error) {
    console.error("TTS Error:", error);
    return NextResponse.json(
      {
        error: "network",
        message: "اتصال به سرویس صدای ابری برقرار نشد. اینترنت را بررسی کنید.",
      },
      { status: 502 }
    );
  }
}
