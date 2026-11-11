/* ============================================================
   ورکر کلودفلر متروجو — صدای فارسی ابری رایگان و بدون کلید
   مسیرها:
     POST /tts   { text, rate?, gender? }  →  audio/mpeg
     GET  /      صفحه وضعیت
   موتور: Edge TTS (دلاورا/فرید) + پشتیبان گوگل ترنسلیت
   deploy: فایل را در داشبورد کلودفلر Workers کپی کنید.
   ============================================================ */

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL =
  "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const EDGE_COPYRIGHT =
  "Copyright (C) Microsoft Corporation. All rights reserved.";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/* ---------------- توکن Sec-MS-GEC (نسخه ۲) ---------------- */

const SWAP_FIRST_WORD = { swappedWord: 0xef0569fb, swappedSum: 0x76f50f34, swappedProduct: 0xc3efea97 };
const SWAP_SECOND_WORD = { swappedWord: 0xc31713db, swappedSum: 0x1881ce3c, swappedProduct: 0x35bd1ec9 };
const MIX_FIRST_WORD = [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83];
const MIX_SECOND_WORD = [0xa27416f5, 0xd38396ff, 0x7c932b89, 0xbfa49f69];

function swapHalves(v) {
  return ((v << 16) | (v >>> 16)) >>> 0;
}
function swapTerm(word, key, m) {
  const sum = Math.imul(word, key) + Math.imul(swapHalves(word), m.swappedWord);
  const product = Math.imul(swapHalves(sum), m.swappedSum) >>> 0;
  return (Math.imul(swapHalves(product), m.swappedProduct) + product) >>> 0;
}
function swapAndMultiply(value, multipliers) {
  for (const multiplier of multipliers) {
    value = Math.imul(swapHalves(value), multiplier) >>> 0;
  }
  return value;
}
function toUpperHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
function cs64(message, digest) {
  const digestView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const firstKey = (digestView.getUint32(0, true) | 1) >>> 0;
  const secondKey = (digestView.getUint32(4, true) | 1) >>> 0;
  const padded = new Uint8Array(Math.ceil(message.length / 8) * 8);
  padded.set(message);
  const words = new DataView(padded.buffer);
  let swapSum = 0, lastSwap = 0, mix = 0, mixSum = 0;
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

async function generateSecMsGec() {
  const ticks = Math.floor(Date.now() / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = rounded * 10000000;
  const ticksAndToken = `${windowsTicks}${TRUSTED_CLIENT_TOKEN}`;
  const message = new TextEncoder().encode(EDGE_COPYRIGHT + ticksAndToken);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", message));
  return `${toUpperHex(cs64(message, digest))}-${toUpperHex(digest)}`;
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function concat(parts) {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/* ---------------- موتور ۱: Edge TTS (دلاورا/فرید) ---------------- */

async function edgeTts(text, voice, rate) {
  const secMsGec = await generateSecMsGec();
  const connectionId = crypto.randomUUID();
  const url = `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=2-143.0.3650.96&ConnectionId=${connectionId}`;

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="fa-IR"><voice name="${voice}"><prosody pitch="+0Hz" rate="${rate}" volume="100">${escapeXml(text)}</prosody></voice></speak>`;

  // اتصال خروجی WebSocket در Workers — با هدر Origin خاص Edge
  const resp = await fetch(url, {
    headers: {
      Upgrade: "websocket",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
    },
  });

  const ws = resp.webSocket;
  if (!ws) throw new Error("edge tts: no websocket (HTTP " + resp.status + ")");
  ws.accept();

  const chunks = [];
  const requestId = randomHex(16);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { ws.close(1000); } catch {}
      reject(new Error("edge tts timeout"));
    }, 25000);

    ws.addEventListener("message", (event) => {
      const data =
        typeof event.data === "string"
          ? new TextEncoder().encode(event.data)
          : new Uint8Array(event.data);
      const head = new TextDecoder("latin1").decode(data);

      if (head.includes("Path:turn.end")) {
        clearTimeout(timeout);
        try { ws.close(1000); } catch {}
        const audio = concat(chunks);
        if (audio.length > 1000) resolve(audio);
        else reject(new Error("edge tts: empty audio"));
        return;
      }
      if (head.includes("Path:audio\r\n")) {
        // پیدا کردن مرز هدر در بایت‌ها
        const delim = new TextEncoder().encode("Path:audio\r\n");
        outer: for (let i = 0; i <= data.length - delim.length; i++) {
          for (let j = 0; j < delim.length; j++) {
            if (data[i + j] !== delim[j]) continue outer;
          }
          if (i + delim.length < data.length) {
            chunks.push(data.subarray(i + delim.length));
          }
          break;
        }
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("edge tts socket error"));
    });

    ws.send(
      `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${OUTPUT_FORMAT}"}}}}`
    );
    ws.send(
      `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
        ssml
    );
  });
}

/* ---------------- موتور ۲: پشتیبان گوگل ترنسلیت ---------------- */

function splitText(text, max) {
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.6) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

async function googleTts(text) {
  const parts = splitText(text, 190);
  const buffers = [];
  for (const part of parts) {
    const url =
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=fa&q=" +
      encodeURIComponent(part);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });
    if (!res.ok) throw new Error("google tts: HTTP " + res.status);
    buffers.push(new Uint8Array(await res.arrayBuffer()));
  }
  const audio = concat(buffers);
  if (audio.length < 500) throw new Error("google tts: empty audio");
  return audio;
}

/* ---------------- هندلر اصلی ---------------- */

function mp3Response(audio) {
  return new Response(audio, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

function jsonError(message, status = 502) {
  return new Response(JSON.stringify({ error: "tts_failed", message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // صفحه وضعیت
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>متروجو TTS</title>
        <style>body{font-family:Tahoma,sans-serif;background:#f9f9ff;color:#111c2d;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{text-align:center;padding:2rem}h1{color:#00417f;font-size:1.4rem}</style></head>
        <body><main><h1>🚇 ورکر صدای متروجو فعال است</h1><p>POST /tts با متن فارسی — صدای دلاورا و فرید</p></main></body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // سنتز صدا
    if (request.method === "POST" && url.pathname === "/tts") {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonError("متن خالی است", 400);
      }
      const text = String(body?.text ?? "").trim().slice(0, 800);
      const rateRaw = Number(body?.rate ?? 1);
      const rate = Number.isFinite(rateRaw) ? Math.min(1.5, Math.max(0.6, rateRaw)) : 1;
      const voice = body?.gender === "male" ? "fa-IR-FaridNeural" : "fa-IR-DilaraNeural";

      if (!text) return jsonError("متن خالی است", 400);

      // اول موتور اصلی (دلاورا/فرید)، بعد پشتیبان گوگل
      try {
        const audio = await edgeTts(text, voice, rate);
        return mp3Response(audio);
      } catch (edgeError) {
        try {
          const audio = await googleTts(text);
          return mp3Response(audio);
        } catch {
          return jsonError("تولید صدا ممکن نشد — چند لحظه بعد دوباره تلاش کنید");
        }
      }
    }

    return jsonError("مسیر یافت نشد", 404);
  },
};
