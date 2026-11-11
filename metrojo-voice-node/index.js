#!/usr/bin/env node
"use strict";
/* ============================================================
   متروجو — سرور صدای فارسی برای سرورهای ایرانی (بدون وابستگی)
   ============================================================
   این فایل یک سرویس مستقل Node.js است:
     • هیچ npm install لازم ندارد — فقط Node 16 به بالا
     • اجرا:        node index.js          (پورت پیش‌فرض 8787)
     • تغییر پورت:  METROJO_VOICE_PORT=8080 node index.js
     • API دقیقاً مثل ورکر کلودفلر:
         GET  /              → وضعیت سرویس
         POST /tts           → {"text":"سلام","rate":1.25,"gender":"male"}
         GET  /tts?text=...  → برای تست سریع در مرورگر
     • زن: fa-IR-DilaraNeural (دلاورا) — مرد: fa-IR-FaridNeural (فرید)

   ─── استقرار سریع روی سرور ایرانی (اوبونتو) ───────────────
   1) نصب Node 22:
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs

   2) فایل را در /opt/metrojo-voice/index.js بگذارید و سرویس systemd
      بسازید — /etc/systemd/system/metrojo-voice.service :
        [Unit]
        Description=Metrojo Voice Server
        After=network.target
        [Service]
        ExecStart=/usr/bin/node /opt/metrojo-voice/index.js
        Restart=always
        [Install]
        WantedBy=multi-user.target
      سپس:  sudo systemctl enable --now metrojo-voice

   3) مهم — اپ اندروید فقط به https وصل می‌شود؛ جلوی این سرویس
      یک Caddy بگذارید (گواهی TLS خودکار و رایگان) — /etc/caddy/Caddyfile :
        voice.yourdomain.ir {
            reverse_proxy 127.0.0.1:8787
        }
      سپس:  sudo systemctl reload caddy

   4) تست:  curl "https://voice.yourdomain.ir/tts?text=سلام"
   ============================================================ */

const http = require("node:http");
const tls = require("node:tls");
const crypto = require("node:crypto");

/* ---------------- ثابت‌های پروتکل Edge TTS مایکروسافت ---------------- */

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SYNTH_URL =
  "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const GEC_VERSION = "2-143.0.3650.96";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
const EXT_ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";

const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const AUDIO_DELIM = "Path:audio\r\n";

const VOICES = {
  female: "fa-IR-DilaraNeural",
  male: "fa-IR-FaridNeural",
};

/* ---------------- توکن Sec-MS-GEC نسخه ۲ (SHA-256 + cs64) ---------------- */

const EDGE_COPYRIGHT = "Copyright (C) Microsoft Corporation. All rights reserved.";
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
  const firstKey = (digest.readUInt32LE(0) | 1) >>> 0;
  const secondKey = (digest.readUInt32LE(4) | 1) >>> 0;
  // پیام به‌صورت جفت‌واژه ۳۲بیتی little-endian خوانده می‌شود، صفرپرشده تا مضرب ۸
  const padded = Buffer.alloc(Math.ceil(message.length / 8) * 8);
  message.copy(padded);
  let swapSum = 0;
  let lastSwap = 0;
  let mix = 0;
  let mixSum = 0;
  for (let offset = 0; offset < padded.length; offset += 8) {
    const firstWord = padded.readUInt32LE(offset);
    const secondWord = padded.readUInt32LE(offset + 4);
    const firstSwap = swapTerm(firstWord, firstKey, SWAP_FIRST_WORD);
    lastSwap = swapTerm(secondWord, secondKey, SWAP_SECOND_WORD);
    swapSum = (swapSum + firstSwap + lastSwap) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + firstWord, firstKey), MIX_FIRST_WORD);
    mixSum = (mixSum + mix) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + secondWord, secondKey), MIX_SECOND_WORD);
    mixSum = (mixSum + mix) >>> 0;
  }
  const checksum = Buffer.alloc(8);
  checksum.writeUInt32LE((lastSwap ^ mix) >>> 0, 0);
  checksum.writeUInt32LE((swapSum ^ mixSum) >>> 0, 4);
  return checksum;
}

/** "<CS64 checksum>-<SHA-256>" از خط کپی‌رایت Edge به‌علاوه ورودی نسخه ۱ */
function hashSecMsGecV2(ticksAndToken) {
  const message = Buffer.from(EDGE_COPYRIGHT + ticksAndToken, "utf8");
  const digest = crypto.createHash("sha256").update(message).digest();
  const checksum = cs64(message, digest);
  return `${checksum.toString("hex").toUpperCase()}-${digest.toString("hex").toUpperCase()}`;
}

/* جبران اختلاف ساعت سرور مایکروسافت — در صورت 403 به‌روزرسانی می‌شود */
let clockOffsetMs = 0;

function generateSecMsGec(offsetMs = clockOffsetMs) {
  const ticks = Math.floor((Date.now() + offsetMs) / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const windowsTicks = rounded * 10000000;
  return hashSecMsGecV2(`${windowsTicks}${TRUSTED_CLIENT_TOKEN}`);
}

/* ---------------- ابزارهای کوچک ---------------- */

function generateUUID() {
  return "xxxxxxxx-xxxx-xxxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const randomHex = (bytes) => crypto.randomBytes(bytes).toString("hex");

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSsml(text, rate, voice, locale) {
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

const ssmlMsg = (requestId, ssml) =>
  `X-RequestId:${requestId}\r\nX-Timestamp:${ts()}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` + ssml.trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- کلاینت WebSocket مینیمال (بدون وابستگی) ---------------- */

/**
 * اتصال WSS به مایکروسافت با هدرهای دلخواه (User-Agent و Origin).
 * در صورت موفقیت یک client برمی‌گرداند با:
 *   send(text)   ارسال پیام متنی
 *   close()      بستن اتصال
 *   onmessage({text}|{binary})  پیام کامل دریافت‌شده
 *   onclose()    onerror(err)
 */
function wsConnect(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const wsKey = crypto.randomBytes(16).toString("base64");
    const request =
      `GET ${url.pathname}${url.search} HTTP/1.1\r\n` +
      `Host: ${url.host}\r\n` +
      `Upgrade: websocket\r\n` +
      `Connection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${wsKey}\r\n` +
      `Sec-WebSocket-Version: 13\r\n` +
      `User-Agent: ${USER_AGENT}\r\n` +
      `Origin: ${EXT_ORIGIN}\r\n` +
      `Pragma: no-cache\r\n` +
      `Cache-Control: no-cache\r\n` +
      `\r\n`;

    let settled = false;
    let upgraded = false;
    let buf = Buffer.alloc(0);
    let pending = null; // پیام متنی/باینری در حال سرهم‌شدن

    const sock = tls.connect(
      { host: url.hostname, port: 443, servername: url.hostname, ALPNProtocols: ["http/1.1"] },
      () => sock.write(request)
    );
    sock.setNoDelay(true);

    const client = {
      sock,
      send: (text) => sendTextFrame(sock, text),
      close: () => {
        try {
          sendControlFrame(sock, 0x8, Buffer.alloc(0));
        } catch {
          /* سوکت مرده */
        }
        try {
          sock.destroy();
        } catch {
          /* بسته شده */
        }
      },
      onmessage: null,
      onclose: null,
      onerror: null,
    };

    const failHandshake = (err) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        /* بسته شده */
      }
      reject(err);
    };

    sock.on("error", (err) => {
      if (!upgraded) {
        failHandshake(new Error(`اتصال TLS ناموفق: ${err.message}`));
      } else {
        if (client.onerror) client.onerror(err);
        if (client.onclose) client.onclose();
      }
    });

    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const idx = buf.indexOf("\r\n\r\n");
        if (idx < 0) {
          if (buf.length > 16384) failHandshake(new Error("پاسخ دست‌دادن ناقص بود"));
          return;
        }
        const head = buf.subarray(0, idx).toString("utf8");
        const lines = head.split("\r\n");
        const m = /^HTTP\/1\.[01]\s+(\d+)/.exec(lines[0] || "");
        const status = m ? Number(m[1]) : 0;
        let serverDate = null;
        for (const line of lines.slice(1)) {
          const c = line.indexOf(":");
          if (c > 0 && line.slice(0, c).trim().toLowerCase() === "date") {
            serverDate = line.slice(c + 1).trim();
          }
        }
        buf = buf.subarray(idx + 4);
        if (status !== 101) {
          const err = new Error(`خطای دست‌دادن WebSocket: ${status}`);
          err.status = status;
          err.serverDate = serverDate;
          failHandshake(err);
          return;
        }
        upgraded = true;
        settled = true;
        resolve(client);
      }
      if (buf.length) buf = consumeFrames(client, buf);
    });

    sock.on("close", () => {
      if (upgraded && client.onclose) client.onclose();
    });

    /* --- تشخیص فریم‌ها --- */
    function consumeFrames(cl, input) {
      let off = 0;
      while (true) {
        if (input.length - off < 2) break;
        const b0 = input[off];
        const b1 = input[off + 1];
        const fin = (b0 & 0x80) !== 0;
        const opcode = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let len = b1 & 0x7f;
        let pos = off + 2;
        if (len === 126) {
          if (input.length - pos < 2) break;
          len = input.readUInt16BE(pos);
          pos += 2;
        } else if (len === 127) {
          if (input.length - pos < 8) break;
          len = Number(input.readBigUInt64BE(pos));
          pos += 8;
        }
        let maskKey = null;
        if (masked) {
          if (input.length - pos < 4) break;
          maskKey = input.subarray(pos, pos + 4);
          pos += 4;
        }
        if (input.length - pos < len) break;
        let payload = input.subarray(pos, pos + len);
        if (maskKey) {
          payload = Buffer.from(payload);
          for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3];
        }
        off = pos + len;

        if (opcode === 0x8) {
          // close — پاسخ می‌دهیم و می‌بندیم
          try {
            sendControlFrame(cl.sock, 0x8, Buffer.alloc(0));
          } catch {
            /* سوکت مرده */
          }
          try {
            cl.sock.destroy();
          } catch {
            /* بسته شده */
          }
          if (cl.onclose) cl.onclose();
          break;
        }
        if (opcode === 0x9) {
          // ping → pong
          try {
            sendControlFrame(cl.sock, 0xa, payload);
          } catch {
            /* سوکت مرده */
          }
          continue;
        }
        if (opcode === 0xa) continue; // pong

        if (opcode === 0x1 || opcode === 0x2) {
          if (fin) {
            deliver(cl, opcode, payload);
          } else {
            pending = { opcode, chunks: [payload] };
          }
          continue;
        }
        if (opcode === 0x0 && pending) {
          pending.chunks.push(payload);
          if (fin) {
            const p = pending;
            pending = null;
            deliver(cl, p.opcode, Buffer.concat(p.chunks));
          }
        }
      }
      return input.subarray(off);
    }

    function deliver(cl, opcode, data) {
      if (!cl.onmessage) return;
      if (opcode === 0x1) cl.onmessage({ text: data.toString("utf8") });
      else cl.onmessage({ binary: data });
    }
  });
}

function frameHeader(opcode, len) {
  const first = 0x80 | opcode; // FIN=1
  if (len < 126) return Buffer.from([first, 0x80 | len]);
  if (len < 65536) {
    const h = Buffer.alloc(4);
    h[0] = first;
    h[1] = 0x80 | 126;
    h.writeUInt16BE(len, 2);
    return h;
  }
  const h = Buffer.alloc(10);
  h[0] = first;
  h[1] = 0x80 | 127;
  h.writeBigUInt64BE(BigInt(len), 2);
  return h;
}

/** ارسال فریم متنی ماسک‌شده (کلاینت موظف به ماسک است) */
function sendTextFrame(sock, text) {
  const payload = Buffer.from(text, "utf8");
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
  sock.write(Buffer.concat([frameHeader(0x1, payload.length), mask, masked]));
}

/** ارسال فریم کنترلی (ping/pong/close) */
function sendControlFrame(sock, opcode, payload) {
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
  sock.write(Buffer.concat([frameHeader(opcode, payload.length), mask, masked]));
}

/* ---------------- همگام‌سازی ---------------- */

async function doSynthesis(ssml, offsetMs) {
  const requestId = randomHex(16);
  const connectionId = generateUUID();
  const secMsGec = await generateSecMsGec(offsetMs);
  const params = new URLSearchParams({
    TrustedClientToken: TRUSTED_CLIENT_TOKEN,
    "Sec-MS-GEC": secMsGec,
    "Sec-MS-GEC-Version": GEC_VERSION,
    ConnectionId: connectionId,
  });

  const client = await wsConnect(`${SYNTH_URL}?${params.toString()}`);

  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try {
        client.sock.destroy();
      } catch {
        /* بسته شده */
      }
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const audio = Buffer.concat(chunks);
      if (!audio.length) reject(new Error("هیچ داده صدایی دریافت نشد"));
      else resolve(audio);
    };
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(msg));
    };

    client.onmessage = (msg) => {
      if (settled) return;
      /* پیام متنی — پایان همگام‌سازی */
      if (msg.text !== undefined) {
        if (msg.text.includes("Path:turn.end")) finish();
        return;
      }
      /* فریم باینری — قالب رسمی Edge: [۲ بایت طول هدر][هدر][داده] */
      const u8 = msg.binary;
      if (!u8 || u8.length < 2) return;
      const headerLen = (u8[0] << 8) | u8[1];
      if (headerLen >= 2 && headerLen <= 2048 && u8.length > headerLen + 2) {
        const hdr = u8.subarray(2, headerLen + 2).toString("utf8");
        if (hdr.includes("Path:audio\r\n")) {
          chunks.push(u8.subarray(headerLen + 2));
        }
        return;
      }
      /* مسیر پشتیبان: جستجوی جداکننده Path:audio در سرپیچ */
      const head = u8.subarray(0, Math.min(u8.length, 2048)).toString("utf8");
      const idx = head.indexOf(AUDIO_DELIM);
      if (idx >= 0 && u8.length > idx + AUDIO_DELIM.length) {
        chunks.push(u8.subarray(idx + AUDIO_DELIM.length));
      }
    };
    client.onclose = () => fail("اتصال پیش از پایان همگام‌سازی بسته شد");
    client.onerror = () => fail("خطای سوکت صدا");

    timer = setTimeout(() => fail("مهلت تولید صدا تمام شد"), 25000);

    /* ارسال پیکربندی و متن — بلافاصله پس از دست‌دادن (ترتیب مهم است) */
    client.send(speechConfigMsg());
    client.send(ssmlMsg(requestId, ssml));
  });
}

/** همگام‌سازی با دو تلاش — 403: اصلاح اختلاف ساعت، خطای دیگر: یک اتصال تازه */
async function synthesize(text, rate, gender) {
  const voice = VOICES[gender] ?? VOICES.female;
  const locale = "fa-IR";
  const ssml = buildSsml(text, rate, voice, locale);
  try {
    return await doSynthesis(ssml, clockOffsetMs);
  } catch (e) {
    if (e.status === 403 && typeof e.serverDate === "string") {
      const serverTime = Date.parse(e.serverDate);
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

/* ---------------- کش کوچک LRU ---------------- */

const cache = new Map();
const CACHE_MAX = 40;

function cacheGet(key) {
  const v = cache.get(key);
  if (v !== undefined) {
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}

function cacheSet(key, audio) {
  if (audio.length > 2_000_000) return;
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, audio);
}

/* ---------------- سرور HTTP ---------------- */

const PORT = Number(process.env.METROJO_VOICE_PORT) || 8787;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders,
  });
  res.end(body);
}

function parseParams(url, body) {
  const text = String(body?.text ?? url.searchParams.get("text") ?? "")
    .trim()
    .slice(0, 800);
  const rateRaw = Number(body?.rate ?? url.searchParams.get("rate") ?? 1);
  const rate = Number.isFinite(rateRaw) ? Math.min(1.5, Math.max(0.6, rateRaw)) : 1;
  const gender =
    String(body?.gender ?? url.searchParams.get("gender") ?? "female") === "male" ? "male" : "female";
  return { text, rate, gender };
}

async function readBody(req) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 131072) return undefined; // بیش از حد بزرگ
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString("utf8");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  /* صفحه وضعیت — برای تست استقرار */
  if (url.pathname === "/" || url.pathname === "") {
    json(res, {
      ok: true,
      service: "metrojo-voice-node",
      version: "2.1",
      voices: { female: "fa-IR-DilaraNeural", male: "fa-IR-FaridNeural" },
      usage: 'POST /tts  {"text":"سلام","rate":1,"gender":"female"}',
      time: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === "/tts") {
    let body = null;
    if (req.method === "POST") {
      const raw = await readBody(req);
      if (raw === undefined) {
        json(res, { error: "too_large", message: "بدنه درخواست بیش از حد بزرگ است" }, 413);
        return;
      }
      try {
        body = JSON.parse(raw || "null");
      } catch {
        json(res, { error: "bad_request", message: "بدنه JSON نامعتبر است" }, 400);
        return;
      }
      if (body === null) {
        json(res, { error: "bad_request", message: "بدنه JSON نامعتبر است" }, 400);
        return;
      }
    } else if (req.method !== "GET") {
      json(res, { error: "method_not_allowed" }, 405);
      return;
    }

    const { text, rate, gender } = parseParams(url, body);
    if (!text) {
      json(res, { error: "empty_text", message: "متن خالی است" }, 400);
      return;
    }

    const key = `${text}|${rate}|${gender}`;
    const cachedAudio = cacheGet(key);
    if (cachedAudio) {
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": cachedAudio.length,
        "Cache-Control": "public, max-age=86400",
        "X-Cache": "hit",
        ...corsHeaders,
      });
      res.end(cachedAudio);
      return;
    }

    try {
      const audio = await synthesize(text, rate, gender);
      cacheSet(key, audio);
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": audio.length,
        "Cache-Control": "public, max-age=86400",
        "X-Cache": "miss",
        ...corsHeaders,
      });
      res.end(audio);
    } catch (e) {
      json(
        res,
        {
          error: "tts_failed",
          message: "تولید صدای فارسی با خطا مواجه شد. چند لحظه بعد دوباره تلاش کنید.",
          detail: String(e?.message ?? e),
        },
        502
      );
    }
    return;
  }

  json(res, { error: "not_found" }, 404);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ متروجو — سرور صدای فارسی روی پورت ${PORT} آماده است`);
  console.log(`   تست: curl "http://127.0.0.1:${PORT}/tts?text=سلام"`);
});
