import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let cached: { text: string; voice: string; buf: Buffer } | null = null;

/** POST /api/voice/tts { text, voice, speed } — تبدیل متن اعلام به گفتار (audio/wav) */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text: string = (body?.text ?? "").toString().trim().slice(0, 1000);
  const voice: string = ["tongtong", "xiaochen", "chuichui"].includes(body?.voice)
    ? body.voice
    : "tongtong";
  const speed = Math.min(2, Math.max(0.5, Number(body?.speed) || 1));

  if (!text) {
    return NextResponse.json({ error: "متن خالی است" }, { status: 400 });
  }

  try {
    if (cached && cached.text === text && cached.voice === voice) {
      return new NextResponse(new Uint8Array(cached.buf), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": String(cached.buf.length),
          "Cache-Control": "no-cache",
        },
      });
    }

    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const response = await zai.audio.tts.create({
      input: text,
      voice,
      speed,
      response_format: "wav",
      stream: false,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));
    cached = { text, voice, buf: buffer };

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("TTS Error:", error);
    return NextResponse.json({ error: "خطا در تولید گفتار" }, { status: 500 });
  }
}
