import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ============================================================
   POST /api/voice/tts  { text, rate? }
   صدای نورال فارسی مایکروسافت — fa-IR-DilaraNeural
   رایگان و بدون نیاز به هیچ کلید/API (توکن عمومی خود Edge).
   خروجی: audio/mpeg
   ============================================================ */

const FA_VOICE = "fa-IR-DilaraNeural";

let cached: { key: string; buf: Buffer } | null = null;

function mp3Response(buf: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(buf.length),
      "Cache-Control": "no-cache",
    },
  });
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text: string = (body?.text ?? "").toString().trim().slice(0, 800);
  const rateRaw = Number(body?.rate ?? 1);
  // نرخ نسبی SSML — محدوده مجاز 0.5 تا 1.5
  const rate = Number.isFinite(rateRaw) ? Math.min(1.5, Math.max(0.6, rateRaw)) : 1;

  if (!text) {
    return NextResponse.json({ error: "متن خالی است" }, { status: 400 });
  }

  const cacheKey = `${text}|${rate}`;
  if (cached && cached.key === cacheKey) {
    return mp3Response(cached.buf);
  }

  try {
    // هر بار اتصال تازه — ساده و مطمئن، بدون تداخل درخواست‌ها
    const tts = new MsEdgeTTS();
    await tts.setMetadata(FA_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text, { rate });
    const buf = await streamToBuffer(audioStream);
    tts.close();

    if (!buf.length) {
      throw new Error("empty audio stream");
    }

    cached = { key: cacheKey, buf };
    return mp3Response(buf);
  } catch (error) {
    console.error("Persian TTS (Edge) error:", error);
    return NextResponse.json(
      {
        error: "tts_failed",
        message: "تولید صدای فارسی با خطا مواجه شد. چند لحظه بعد دوباره تلاش کنید.",
      },
      { status: 502 }
    );
  }
}
