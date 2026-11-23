/* ============================================================
   درمسیر — ماژول صدای فارسی (TTS عصبی مایکروسافت Edge)
   ------------------------------------------------------------
   خروجی: MP3 صدای عصبی فارسی مایکروسافت
     زن: fa-IR-DilaraNeural (دلاورا)
     مرد: fa-IR-FaridNeural (فرید)
   نحوه کار: پروتکل رسمی Edge Read Aloud مایکروسافت روی
   WebSocket خروجی ورکر (fetch + Upgrade) پیاده شده است.
   توکن Sec-MS-GEC نسخه ۲ (SHA-256 + checksum اختصاصی) با
   WebCrypto ساخته می‌شود — کاملاً سازگار با محیط Workers.
   هیچ کلید یا حساب مایکروسافت لازم نیست.
   ادغام‌شده در ورکر اصلی darmasir-api (مسیر /tts روی dataid.hurremmed.ir)
   ============================================================ */

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SYNTH_URL = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const GEC_VERSION = "2-143.0.3650.96";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
const EXT_ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";

const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const AUDIO_DELIM = "Path:audio\r\n";
const headerDecoder = new TextDecoder("utf-8");

const VOICES: Record<string, string> = {
  female: "fa-IR-DilaraNeural",
  male: "fa-IR-FaridNeural",
};

/* ---------------- توکن Sec-MS-GEC نسخه ۲ ---------------- */

const EDGE_COPYRIGHT = "Copyright (C) Microsoft Corporation. All rights reserved.";
const SWAP_FIRST_WORD = { swappedWord: 0xef0569fb, swappedSum: 0x76f50f34, swappedProduct: 0xc3efea97 };
const SWAP_SECOND_WORD = { swappedWord: 0xc31713db, swappedSum: 0x1881ce3c, swappedProduct: 0x35bd1ec9 };
const MIX_FIRST_WORD = [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83];
const MIX_SECOND_WORD = [0xa27416f5, 0xd38396ff, 0x7c932b89, 0xbfa49f69];

function toUpperHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function swapHalves(value: number): number {
  return ((value << 16) | (value >>> 16)) >>> 0;
}

function swapTerm(word: number, key: number, multipliers: { swappedWord: number; swappedSum: number; swappedProduct: number }): number {
  const sum = Math.imul(word, key) + Math.imul(swapHalves(word), multipliers.swappedWord);
  const product = Math.imul(swapHalves(sum), multipliers.swappedSum) >>> 0;
  return (Math.imul(swapHalves(product), multipliers.swappedProduct) + product) >>> 0;
}

function swapAndMultiply(value: number, multipliers: number[]): number {
  for (const multiplier of multipliers) {
    value = Math.imul(swapHalves(value), multiplier) >>> 0;
  }
  return value;
}

function cs64(message: Uint8Array, digest: Uint8Array): Uint8Array {
  const digestView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const firstKey = (digestView.getUint32(0, true) | 1) >>> 0;
  const secondKey = (digestView.getUint32(4, true) | 1) >>> 0;
  // پیام به‌صورت جفت‌واژه ۳۲بیتی little-endian خوانده می‌شود، صفرپرشده تا مضرب ۸
  const padded = new Uint8Array(Math.ceil(message.length / 8) * 8);
  padded.set(message);
  const words = new DataView(padded.buffer);
  let swapSum = 0;
  let lastSwap = 0;
  let mix = 0;
  let mixSum = 0;
  for (let offset = 0; offset < padded.length; offset += 8) {
    const firstWord = words.getUint32(offset, true);
    const secondWord = words.getUint32(offset + 4, true);
    const firstSwap = swapTerm(firstWord, firstKey, SWAP_FIRST_WORD);
    lastSwap = swapTerm(secondWord, secondKey, SWAP_SECOND_WORD);
    swapSum = (swapSum + firstSwap + lastSwap) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + firstWord, firstKey), MIX_FIRST_WORD);
    mixSum = (mixSum + mix) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + secondWord, secondKey), MIX_SECOND_WORD);
    mixSum = (mixSum + mix) >>> 0;
  }
  const checksum = new Uint8Array(8);
  const checksumView = new DataView(checksum.buffer);
  checksumView.setUint32(0, lastSwap ^ mix, true);
  checksumView.setUint32(4, swapSum ^ mixSum, true);
  return checksum;
}

/** "<CS64 checksum>-<SHA-256>" از خط کپی‌رایت Edge به‌علاوه ورودی نسخه ۱ */
async function hashSecMsGecV2(ticksAndToken: string): Promise<string> {
  const message = new TextEncoder().encode(EDGE_COPYRIGHT + ticksAndToken);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", message));
  return `${toUpperHex(cs64(message, digest))}-${toUpperHex(digest)}`;
}

/* جبران اختلاف ساعت سرور مایکروسافت — در صورت 403 به‌روزرسانی می‌شود */
let clockOffsetMs = 0;

async function generateSecMsGec(offsetMs = clockOffsetMs): Promise<string> {
  const ticks = Math.floor((Date.now() + offsetMs) / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = rounded * 10000000;
  return hashSecMsGecV2(`${windowsTicks}${TRUSTED_CLIENT_TOKEN}`);
}

/* ---------------- ابزارهای کوچک ---------------- */

function generateUUID(): string {
  return "xxxxxxxx-xxxx-xxxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSsml(text: string, rate: number, voice: string, locale: string): string {
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${locale}">` +
    `<voice name="${voice}">` +
    `<prosody pitch="+0Hz" rate="${rate}" volume="100">${escapeXml(text)}</prosody>` +
    `</voice></speak>`
  );
}

const ts = () => new Date().toUTCString();

const speechConfigMsg = () =>
  `X-Timestamp:${ts()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
  JSON.stringify({
    context: {
      synthesis: {
        audio: {
          metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
          outputFormat: OUTPUT_FORMAT,
        },
      },
    },
  });

const ssmlMsg = (requestId: string, ssml: string) =>
  `X-RequestId:${requestId}\r\nX-Timestamp:${ts()}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` + ssml.trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function concatAudio(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/* ---------------- اتصال WebSocket به مایکروسافت ---------------- */

/** ارسال پیام با چند تلاش — تا آماده شدن کامل سوکت */
async function wsSend(ws: WebSocket, data: string) {
  for (let i = 0; i < 20; i++) {
    try {
      ws.send(data);
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("ارسال روی سوکت ممکن نشد");
}

async function doSynthesis(ssml: string, offsetMs: number): Promise<Uint8Array> {
  const requestId = randomHex(16);
  const connectionId = generateUUID();
  const secMsGec = await generateSecMsGec(offsetMs);
  const params = new URLSearchParams({
    TrustedClientToken: TRUSTED_CLIENT_TOKEN,
    "Sec-MS-GEC": secMsGec,
    "Sec-MS-GEC-Version": GEC_VERSION,
    ConnectionId: connectionId,
  });

  // WebSocket خروجی در Workers: fetch با هدر Upgrade — می‌توانیم Origin دلخواه بگذاریم
  const resp = await fetch(`${SYNTH_URL}?${params}`, {
    headers: {
      Upgrade: "websocket",
      "User-Agent": USER_AGENT,
      Origin: EXT_ORIGIN,
    },
  }) as unknown as Response & { webSocket?: WebSocket };

  if (!resp.webSocket) {
    const err = new Error(`خطای دست‌دادن WebSocket: ${resp.status}`) as Error & { status?: number; serverDate?: string | null };
    err.status = resp.status;
    err.serverDate = resp.headers.get("date");
    throw err;
  }

  const ws = resp.webSocket;
  ws.accept();
  // چند میلی‌ثانیه صبر تا سوکت کاملاً باز شود — وگرنه پیام‌های اول در بعضی
  // رانتایم‌ها بی‌صدا می‌افتند و مایکروسافت هیچ صدایی برنمی‌گرداند (empty_audio)
  await sleep(120);

  const chunks: Uint8Array[] = [];
  let settled = false;

  /* تشخیص — در پاسخ خطا برمی‌گردد تا اگر در پروداکشن هم مشکل بود، دقیق بدانیم */
  const diag: { frames: number; kinds: Record<string, number>; audioFrames: number; bytes: number; firstHeaderLen: number | null } = {
    frames: 0,
    kinds: {},
    audioFrames: 0,
    bytes: 0,
    firstHeaderLen: null,
  };

  const done = new Promise<Uint8Array>((resolve, reject) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        ws.close(1000, "done");
      } catch {}
      const audio = concatAudio(chunks);
      if (!audio.length) {
        const err = new Error("هیچ داده صدایی دریافت نشد") as Error & { diag?: unknown };
        err.diag = diag;
        reject(err);
      } else resolve(audio);
    };
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      try {
        ws.close(1000, "error");
      } catch {}
      reject(new Error(msg));
    };

    // پیام‌ها به‌ترتیب صف می‌شوند تا فریم‌های صوتی همیشه قبل از turn.end
    // پردازش شوند (تبدیل Blob به ArrayBuffer ناهمزمان است)
    let chain = Promise.resolve();
    const enqueue = (task: () => Promise<void>) => {
      chain = chain.then(task, task);
    };

    ws.addEventListener("message", (ev: MessageEvent) => {
      if (settled) return;
      enqueue(async () => {
        if (settled) return;
        try {
          const data = ev.data as unknown;

          /* پیام متنی — پایان همگام‌سازی */
          if (typeof data === "string") {
            if (data.includes("Path:turn.end")) finish();
            return;
          }

          /* فریم باینری — در رانتایم‌های مختلف انواع متفاوتی دارد:
             ArrayBuffer / TypedArray / Blob — همه پشتیبانی می‌شوند */
          let u8: Uint8Array | null = null;
          if (data instanceof ArrayBuffer) u8 = new Uint8Array(data);
          else if (ArrayBuffer.isView(data))
            u8 = new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength);
          else if (data && typeof (data as Blob).arrayBuffer === "function")
            u8 = new Uint8Array(await (data as Blob).arrayBuffer()); // Blob و مشابه
          if (!u8 || u8.length < 2) return;

          diag.frames++;
          diag.bytes += u8.length;
          const kind = data instanceof ArrayBuffer ? "arraybuffer" : ArrayBuffer.isView(data) ? "typedarray" : "blob";
          diag.kinds[kind] = (diag.kinds[kind] ?? 0) + 1;

          // قالب رسمی فریم باینری Edge: [۲ بایت طول هدر][هدر][داده]
          const headerLen = (u8[0] << 8) | u8[1];
          if (diag.firstHeaderLen === null) diag.firstHeaderLen = headerLen;
          if (headerLen >= 2 && headerLen <= 2048 && u8.length > headerLen + 2) {
            const hdr = headerDecoder.decode(u8.subarray(2, headerLen + 2));
            if (hdr.includes("Path:audio\r\n")) {
              diag.audioFrames++;
              chunks.push(u8.subarray(headerLen + 2));
            }
            return;
          }

          // مسیر پشتیبان: جستجوی جداکننده Path:audio در سرپیچ
          const head = headerDecoder.decode(u8.subarray(0, Math.min(u8.length, 2048)));
          const idx = head.indexOf(AUDIO_DELIM);
          if (idx >= 0 && u8.length > idx + AUDIO_DELIM.length) {
            diag.audioFrames++;
            chunks.push(u8.subarray(idx + AUDIO_DELIM.length));
          }
        } catch {
          /* فریم ناقص — نادیده گرفته می‌شود */
        }
      });
    });
    ws.addEventListener("close", () => fail("اتصال پیش از پایان همگام‌سازی بسته شد"));
    ws.addEventListener("error", () => fail("خطای سوکت صدا"));
    setTimeout(() => fail("مهلت تولید صدا تمام شد"), 25000);
  });

  await wsSend(ws, speechConfigMsg());
  await wsSend(ws, ssmlMsg(requestId, ssml));
  return done;
}

/** همگام‌سازی با دو تلاش — 403: اصلاح اختلاف ساعت، خطای دیگر: یک اتصال تازه */
async function synthesize(text: string, rate: number, gender: string): Promise<Uint8Array> {
  const voice = VOICES[gender] ?? VOICES.female;
  const locale = "fa-IR";
  const ssml = buildSsml(text, rate, voice, locale);
  try {
    return await doSynthesis(ssml, clockOffsetMs);
  } catch (e) {
    const err = e as Error & { status?: number; serverDate?: string | null };
    if (err.status === 403 && typeof err.serverDate === "string") {
      const serverTime = Date.parse(err.serverDate);
      if (Number.isFinite(serverTime)) {
        clockOffsetMs = serverTime - Date.now();
        return doSynthesis(ssml, clockOffsetMs);
      }
    }
    // تلاش دوم با اتصال کاملاً تازه — برای خطاهای گذرا/سوکت
    await sleep(300);
    return doSynthesis(ssml, clockOffsetMs);
  }
}

/* ---------------- کش کوچک درون ایزوله ---------------- */

const cache = new Map<string, Uint8Array>();
const CACHE_MAX = 40;

function cacheGet(key: string): Uint8Array | undefined {
  const v = cache.get(key);
  if (v !== undefined) {
    // تازه‌سازی ترتیب LRU
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}

function cacheSet(key: string, audio: Uint8Array) {
  if (audio.length > 2_000_000) return;
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, audio);
}

/* ---------------- هندلر عمومی ماژول صدا ---------------- */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
  });

function parseRequest(url: URL, body: any) {
  const text = String(body?.text ?? url.searchParams.get("text") ?? "")
    .trim()
    .slice(0, 800);
  const rateRaw = Number(body?.rate ?? url.searchParams.get("rate") ?? 1);
  const rate = Number.isFinite(rateRaw) ? Math.min(1.5, Math.max(0.6, rateRaw)) : 1;
  const gender = String(body?.gender ?? url.searchParams.get("gender") ?? "female") === "male" ? "male" : "female";
  return { text, rate, gender };
}

/** وضعیت سرویس صدا — برای صفحه وضعیت ورکر اصلی */
export function voiceStatus() {
  return {
    service: "darmasir-voice",
    version: "2.1-integrated",
    voices: { female: VOICES.female, male: VOICES.male },
    usage: 'POST /tts  {"text":"سلام","rate":1,"gender":"female"}',
  };
}

/**
 * هندلر درخواست TTS — از ورکر اصلی روی مسیر /tts صدا زده می‌شود.
 * GET  /tts?text=...  → تست سریع در مرورگر
 * POST /tts           → {"text":"...","rate":1.25,"gender":"male"|"female"}
 */
export async function handleVoice(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let body: any = null;
  if (request.method === "POST") {
    body = await request.json().catch(() => null);
    if (body === null) return json({ error: "bad_request", message: "بدنه JSON نامعتبر است" }, 400);
  } else if (request.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const { text, rate, gender } = parseRequest(url, body);
  if (!text) {
    return json({ error: "empty_text", message: "متن خالی است" }, 400);
  }

  const key = `${text}|${rate}|${gender}`;
  const cachedAudio = cacheGet(key);
  if (cachedAudio) {
    return new Response(cachedAudio as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        "X-Cache": "hit",
        ...corsHeaders,
      },
    });
  }

  try {
    const audio = await synthesize(text, rate, gender);
    cacheSet(key, audio);
    return new Response(audio as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        ...corsHeaders,
      },
    });
  } catch (e) {
    return json(
      {
        error: "tts_failed",
        message: "تولید صدای فارسی با خطا مواجه شد. چند لحظه بعد دوباره تلاش کنید.",
        detail: String((e as Error)?.message ?? e),
        diag: (e as any)?.diag ?? null,
      },
      502
    );
  }
}
