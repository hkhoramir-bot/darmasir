/* ============================================================
   متروجو — ورکر صدای فارسی ابری ☁️
   Cloudflare Workers (پلن رایگان) — بدون نیاز به هیچ کلید یا دامنه

   endpoint ها:
     POST /tts        بدنه: {"text":"...", "rate":1.25, "gender":"male"}
                      خروجی: audio/mpeg (fa-IR-DilaraNeural / fa-IR-FaridNeural)
     GET  /tts?text=سلام&gender=female&rate=1.25   (برای تست راحت در مرورگر)
     GET  /health      بررسی سلامت → {"ok":true}

   نحوه کار: این ورکر مستقیماً به سرویس «خواندن با صدای بلند» خود مایکروسافت
   Edge وصل می‌شود (همان موتور رایگانی که در افزونه Edge Read Aloud استفاده
   می‌شود) — با توکن عمومی و امضای Sec-MS-GEC v2. هیچ کلید پولی وجود ندارد.
   ============================================================ */

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
// در ورکر کلودفلر، اتصال خروجی WebSocket با fetch روی آدرس https و هدر Upgrade انجام می‌شود
const WSS_URL =
  "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const GEC_VERSION = "2-143.0.3650.96";
const EDGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
const EDGE_ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const VOICE = { female: "fa-IR-DilaraNeural", male: "fa-IR-FaridNeural" };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/* ---------------- Sec-MS-GEC v2 ----------------
   "<CS64 checksum>-<SHA-256>" از خط کپی‌رایت Edge به‌همراه ورودی v1
   بر اساس تحلیل https://github.com/rany2/edge-tts/pull/492            */

const EDGE_COPYRIGHT =
  "Copyright (C) Microsoft Corporation. All rights reserved.";
const SWAP_FIRST_WORD = { swappedWord: 0xef0569fb, swappedSum: 0x76f50f34, swappedProduct: 0xc3efea97 };
const SWAP_SECOND_WORD = { swappedWord: 0xc31713db, swappedSum: 0x1881ce3c, swappedProduct: 0x35bd1ec9 };
const MIX_FIRST_WORD = [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83];
const MIX_SECOND_WORD = [0xa27416f5, 0xd38396ff, 0x7c932b89, 0xbfa49f69];

function swapHalves(value) {
  return ((value << 16) | (value >>> 16)) >>> 0;
}

function swapTerm(word, key, multipliers) {
  const sum = Math.imul(word, key) + Math.imul(swapHalves(word), multipliers.swappedWord);
  const product = Math.imul(swapHalves(sum), multipliers.swappedSum) >>> 0;
  return (Math.imul(swapHalves(product), multipliers.swappedProduct) + product) >>> 0;
}

function swapAndMultiply(value, multipliers) {
  for (const multiplier of multipliers) {
    value = Math.imul(swapHalves(value), multiplier) >>> 0;
  }
  return value;
}

function cs64(message, digest) {
  const digestView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const firstKey = (digestView.getUint32(0, true) | 1) >>> 0;
  const secondKey = (digestView.getUint32(4, true) | 1) >>> 0;
  // پیام به‌صورت جفت‌واژه ۳۲ بیتی little-endian خوانده می‌شود؛ تا جفت کامل صفرپر می‌شود
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

function toUpperHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function hashSecMsGecV2(ticksAndToken) {
  const message = new TextEncoder().encode(EDGE_COPYRIGHT + ticksAndToken);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", message));
  return `${toUpperHex(cs64(message, digest))}-${toUpperHex(digest)}`;
}

async function secMsGecToken() {
  const ticks = Math.floor(Date.now() / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = rounded * 10000000;
  return hashSecMsGecV2(`${windowsTicks}${TRUSTED_CLIENT_TOKEN}`);
}

function hex32() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------- پیام‌های پروتکل Edge ---------------- */

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildSsml(text, voice, rate) {
  const pct = Math.round((rate - 1) * 100);
  const rateStr = `${pct >= 0 ? "+" : ""}${pct}%`;
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="fa-IR">` +
    `<voice name="${voice}">` +
    `<prosody pitch="+0Hz" rate="${rateStr}" volume="+0%">${escapeXml(text)}</prosody>` +
    `</voice></speak>`
  );
}

function speechConfigMessage() {
  return (
    `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${OUTPUT_FORMAT}"}}}}`
  );
}

function ssmlMessage(text, voice, rate) {
  const ts = new Date().toString();
  return (
    `X-RequestId:${hex32()}\r\nContent-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${ts}\r\nPath:ssml\r\n\r\n${buildSsml(text, voice, rate)}`
  );
}

/* ---------------- سنتز صدا ---------------- */

async function synthesizeToMp3(text, rate, gender) {
  const token = await secMsGecToken();
  const url =
    `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${token}&Sec-MS-GEC-Version=${GEC_VERSION}&ConnectionId=${hex32()}`;

  // اتصال WebSocket خروجی در ورکر با fetch + هدر Upgrade انجام می‌شود؛
  // فقط با این روش می‌توان هدرهای Origin و User-Agent دلخواه را فرستاد.
  const upgrade = await fetch(url, {
    headers: {
      Upgrade: "websocket",
      "User-Agent": EDGE_UA,
      Origin: EDGE_ORIGIN,
    },
  });

  const ws = upgrade.webSocket;
  if (!ws) {
    throw new Error(`handshake_failed_status_${upgrade.status}`);
  }
  ws.accept();

  const chunks = [];
  let ended = false;

  const done = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("synthesis_timeout"));
      try { ws.close(1000, "timeout"); } catch {}
    }, 25000);

    ws.addEventListener("message", (ev) => {
      const raw = ev.data;

      // پیام متنی (در workerd رشته است؛ در بعضی رانتایم‌ها بایت می‌آید)
      const asText =
        typeof raw === "string"
          ? raw
          : (() => {
              try {
                return new TextDecoder().decode(new Uint8Array(raw)).slice(0, 400);
              } catch {
                return "";
              }
            })();
      if (asText.includes("Path:turn.end")) {
        if (!ended) {
          ended = true;
          clearTimeout(timeout);
          resolve();
        }
        return;
      }
      if (typeof raw === "string") return;

      // فریم باینری: [۲ بایت طول هدر][هدر][داده صوتی mp3]
      const buf = new Uint8Array(raw);
      if (buf.length < 2) return;
      const headerLen = (buf[0] << 8) | buf[1];
      if (buf.length > headerLen + 2) {
        const audio = buf.slice(headerLen + 2);
        if (audio.length) chunks.push(audio);
      }
    });

    ws.addEventListener("error", () => {
      if (!ended) {
        ended = true;
        clearTimeout(timeout);
        reject(new Error("socket_error"));
      }
    });

    ws.addEventListener("close", () => {
      if (!ended) {
        ended = true;
        clearTimeout(timeout);
        reject(new Error("socket_closed_before_audio"));
      }
    });
  });

  ws.send(speechConfigMessage());
  ws.send(ssmlMessage(text, VOICE[gender], rate));

  await done;
  try { ws.close(1000, "done"); } catch {}

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const mp3 = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    mp3.set(c, offset);
    offset += c.length;
  }
  if (!mp3.length) throw new Error("empty_audio");
  return mp3;
}

/* ---------------- حافظه نهان سبک (در هر ایزوله) ---------------- */

const cache = new Map();
const MAX_CACHE_ENTRIES = 64;

/* ---------------- پاسخ‌ها ---------------- */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

function audioResponse(mp3) {
  return new Response(mp3, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
      ...CORS_HEADERS,
    },
  });
}

/* ---------------- ورکر ---------------- */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/health" || url.pathname === "/") {
      return json({
        ok: true,
        service: "metrojo-voice",
        voices: VOICE,
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === "/tts") {
      if (request.method !== "POST" && request.method !== "GET") {
        return json({ error: "method_not_allowed", message: "فقط GET و POST" }, 405);
      }
      try {
        let text = "";
        let rate = 1;
        let gender = "female";

        if (request.method === "POST") {
          const body = (await request.json().catch(() => ({}))) ?? {};
          text = String(body.text ?? "").trim().slice(0, 800);
          rate = Number(body.rate ?? 1);
          gender = body.gender === "male" ? "male" : "female";
        } else {
          text = String(url.searchParams.get("text") ?? "").trim().slice(0, 800);
          rate = Number(url.searchParams.get("rate") ?? 1);
          gender = url.searchParams.get("gender") === "male" ? "male" : "female";
        }

        if (!Number.isFinite(rate)) rate = 1;
        rate = Math.min(1.5, Math.max(0.6, rate));
        if (!text) {
          return json({ error: "empty_text", message: "متن خالی است" }, 400);
        }

        const key = `${text}|${rate}|${gender}`;
        const hit = cache.get(key);
        if (hit) return audioResponse(hit);

        const mp3 = await synthesizeToMp3(text, rate, gender);
        if (cache.size >= MAX_CACHE_ENTRIES) {
          cache.delete(cache.keys().next().value);
        }
        cache.set(key, mp3);
        return audioResponse(mp3);
      } catch (err) {
        return json(
          { error: "tts_failed", message: String((err && err.message) || err) },
          502
        );
      }
    }

    return json(
      { error: "not_found", message: "مسیر پیدا نشد — از /tts استفاده کنید" },
      404
    );
  },
};

/* برای تست پروتکل خارج از کلودفلر (bun / node) خروجی داده می‌شود */
export const _internals = {
  hashSecMsGecV2,
  secMsGecToken,
  buildSsml,
  speechConfigMessage,
  ssmlMessage,
  synthesizeToMp3,
};
