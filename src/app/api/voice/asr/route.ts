import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/voice/asr { audioBase64 } — تبدیل گفتار به متن برای جستجوی صوتی */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const audioBase64: string = body?.audioBase64 ?? "";
  if (!audioBase64) {
    return NextResponse.json({ error: "فایل صوتی ارسال نشده است" }, { status: 400 });
  }

  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const response = await zai.audio.asr.create({
      file_base64: audioBase64.replace(/^data:[^;]+;base64,/, ""),
    });

    const text = (response.text ?? "").trim();
    return NextResponse.json({ text });
  } catch (error) {
    console.error("ASR Error:", error);
    return NextResponse.json({ error: "خطا در تشخیص گفتار" }, { status: 500 });
  }
}
