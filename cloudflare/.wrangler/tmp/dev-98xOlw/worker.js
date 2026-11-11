var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
var WSS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
var EDGE_COPYRIGHT = "Copyright (C) Microsoft Corporation. All rights reserved.";
var OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
var SWAP_FIRST_WORD = { swappedWord: 4010109435, swappedSum: 1995771700, swappedProduct: 3287280279 };
var SWAP_SECOND_WORD = { swappedWord: 3273069531, swappedSum: 411160124, swappedProduct: 901586633 };
var MIX_FIRST_WORD = [3482890513, 2265471903, 315537773, 629022083];
var MIX_SECOND_WORD = [2725517045, 3548616447, 2090019721, 3215236969];
function swapHalves(v) {
  return (v << 16 | v >>> 16) >>> 0;
}
__name(swapHalves, "swapHalves");
function swapTerm(word, key, m) {
  const sum = Math.imul(word, key) + Math.imul(swapHalves(word), m.swappedWord);
  const product = Math.imul(swapHalves(sum), m.swappedSum) >>> 0;
  return Math.imul(swapHalves(product), m.swappedProduct) + product >>> 0;
}
__name(swapTerm, "swapTerm");
function swapAndMultiply(value, multipliers) {
  for (const multiplier of multipliers) {
    value = Math.imul(swapHalves(value), multiplier) >>> 0;
  }
  return value;
}
__name(swapAndMultiply, "swapAndMultiply");
function toUpperHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
__name(toUpperHex, "toUpperHex");
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
    swapSum = swapSum + firstSwap + lastSwap >>> 0;
    mix = swapAndMultiply(Math.imul(mix + firstWord, firstKey), MIX_FIRST_WORD);
    mixSum = mixSum + mix >>> 0;
    mix = swapAndMultiply(Math.imul(mix + secondWord, secondKey), MIX_SECOND_WORD);
    mixSum = mixSum + mix >>> 0;
  }
  const checksum = new Uint8Array(8);
  const checksumView = new DataView(checksum.buffer);
  checksumView.setUint32(0, lastSwap ^ mix, true);
  checksumView.setUint32(4, swapSum ^ mixSum, true);
  return checksum;
}
__name(cs64, "cs64");
async function generateSecMsGec() {
  const ticks = Math.floor(Date.now() / 1e3) + 11644473600;
  const rounded = ticks - ticks % 300;
  const windowsTicks = rounded * 1e7;
  const ticksAndToken = `${windowsTicks}${TRUSTED_CLIENT_TOKEN}`;
  const message = new TextEncoder().encode(EDGE_COPYRIGHT + ticksAndToken);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", message));
  return `${toUpperHex(cs64(message, digest))}-${toUpperHex(digest)}`;
}
__name(generateSecMsGec, "generateSecMsGec");
function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randomHex, "randomHex");
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escapeXml, "escapeXml");
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
__name(concat, "concat");
async function edgeTts(text, voice, rate) {
  const secMsGec = await generateSecMsGec();
  const connectionId = crypto.randomUUID();
  const url = `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=2-143.0.3650.96&ConnectionId=${connectionId}`;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="fa-IR"><voice name="${voice}"><prosody pitch="+0Hz" rate="${rate}" volume="100">${escapeXml(text)}</prosody></voice></speak>`;
  const resp = await fetch(url, {
    headers: {
      Upgrade: "websocket",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0"
    }
  });
  const ws = resp.webSocket;
  if (!ws) throw new Error("edge tts: no websocket (HTTP " + resp.status + ")");
  ws.accept();
  const chunks = [];
  const requestId = randomHex(16);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        ws.close(1e3);
      } catch {
      }
      reject(new Error("edge tts timeout"));
    }, 25e3);
    ws.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? new TextEncoder().encode(event.data) : new Uint8Array(event.data);
      const head = new TextDecoder("latin1").decode(data);
      if (head.includes("Path:turn.end")) {
        clearTimeout(timeout);
        try {
          ws.close(1e3);
        } catch {
        }
        const audio = concat(chunks);
        if (audio.length > 1e3) resolve(audio);
        else reject(new Error("edge tts: empty audio"));
        return;
      }
      if (head.includes("Path:audio\r\n")) {
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
      `Content-Type:application/json; charset=utf-8\r
Path:speech.config\r
\r
{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${OUTPUT_FORMAT}"}}}}`
    );
    ws.send(
      `X-RequestId:${requestId}\r
Content-Type:application/ssml+xml\r
Path:ssml\r
\r
` + ssml
    );
  });
}
__name(edgeTts, "edgeTts");
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
__name(splitText, "splitText");
async function googleTts(text) {
  const parts = splitText(text, 190);
  const buffers = [];
  for (const part of parts) {
    const url = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=fa&q=" + encodeURIComponent(part);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Referer: "https://translate.google.com/"
      }
    });
    if (!res.ok) throw new Error("google tts: HTTP " + res.status);
    buffers.push(new Uint8Array(await res.arrayBuffer()));
  }
  const audio = concat(buffers);
  if (audio.length < 500) throw new Error("google tts: empty audio");
  return audio;
}
__name(googleTts, "googleTts");
function mp3Response(audio) {
  return new Response(audio, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400"
    }
  });
}
__name(mp3Response, "mp3Response");
function jsonError(message, status = 502) {
  return new Response(JSON.stringify({ error: "tts_failed", message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}
__name(jsonError, "jsonError");
var worker_default = {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>\u0645\u062A\u0631\u0648\u062C\u0648 TTS</title>
        <style>body{font-family:Tahoma,sans-serif;background:#f9f9ff;color:#111c2d;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{text-align:center;padding:2rem}h1{color:#00417f;font-size:1.4rem}</style></head>
        <body><main><h1>\u{1F687} \u0648\u0631\u06A9\u0631 \u0635\u062F\u0627\u06CC \u0645\u062A\u0631\u0648\u062C\u0648 \u0641\u0639\u0627\u0644 \u0627\u0633\u062A</h1><p>POST /tts \u0628\u0627 \u0645\u062A\u0646 \u0641\u0627\u0631\u0633\u06CC \u2014 \u0635\u062F\u0627\u06CC \u062F\u0644\u0627\u0648\u0631\u0627 \u0648 \u0641\u0631\u06CC\u062F</p></main></body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
    if (request.method === "POST" && url.pathname === "/tts") {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonError("\u0645\u062A\u0646 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A", 400);
      }
      const text = String(body?.text ?? "").trim().slice(0, 800);
      const rateRaw = Number(body?.rate ?? 1);
      const rate = Number.isFinite(rateRaw) ? Math.min(1.5, Math.max(0.6, rateRaw)) : 1;
      const voice = body?.gender === "male" ? "fa-IR-FaridNeural" : "fa-IR-DilaraNeural";
      if (!text) return jsonError("\u0645\u062A\u0646 \u062E\u0627\u0644\u06CC \u0627\u0633\u062A", 400);
      try {
        const audio = await edgeTts(text, voice, rate);
        return mp3Response(audio);
      } catch {
        try {
          const audio = await googleTts(text);
          return mp3Response(audio);
        } catch {
          return jsonError("\u062A\u0648\u0644\u06CC\u062F \u0635\u062F\u0627 \u0645\u0645\u06A9\u0646 \u0646\u0634\u062F \u2014 \u0686\u0646\u062F \u0644\u062D\u0638\u0647 \u0628\u0639\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F");
        }
      }
    }
    return jsonError("\u0645\u0633\u06CC\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F", 404);
  }
};

// ../../../../tmp/bunx-1001-wrangler@latest/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../tmp/bunx-1001-wrangler@latest/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError2;

// .wrangler/tmp/bundle-wqvq29/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../tmp/bunx-1001-wrangler@latest/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-wqvq29/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
