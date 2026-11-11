/* بررسی نحوه رسیدن پیام‌های متنی و باینری در shim های ws در bun */
import { appendFileSync } from "fs";
import { createRequire } from "module";
const req = createRequire("/home/z/my-project/package.json");
const WebSocket = req("ws");
const m = await import("/home/z/my-project/cloudflare/metrojo-voice-worker.js");
const I = m._internals;
const LOG = "/home/z/my-project/tool-results/ws-debug.log";
const log = (s) => appendFileSync(LOG, s + "\n");
appendFileSync(LOG, "=== start ===\n");

const gec = await I.secMsGecToken();
const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
const url =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&Sec-MS-GEC=" +
  gec +
  "&Sec-MS-GEC-Version=2-143.0.3650.96&ConnectionId=" + id;

const ws = new WebSocket(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
    Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  },
});
ws.binaryType = "arraybuffer";
ws.on("open", () => {
  log("OPEN ✓");
  ws.send(I.speechConfigMessage());
  ws.send(I.ssmlMessage("سلام", "fa-IR-DilaraNeural", 1));
});
let n = 0;
ws.on("message", (data, isBinary) => {
  n++;
  if (n <= 40) {
    const t = typeof data;
    const isArr = data instanceof ArrayBuffer;
    const isBuf = typeof Buffer !== "undefined" && data instanceof Buffer;
    let head = "";
    try {
      if (t === "string") head = JSON.stringify(data.slice(0, 120));
      else {
        const u = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer ?? data);
        head = "bin[" + u.length + "] " + Array.from(u.slice(0, 24)).map((x) => x.toString(16).padStart(2, "0")).join(" ");
        const asText = new TextDecoder().decode(u.slice(0, 120));
        head += " | asText=" + JSON.stringify(asText);
      }
    } catch {}
    log(`#${n} isBinary=${isBinary} type=${t} ArrayBuffer=${isArr} Buffer=${isBuf} :: ${head}`);
  }
  if (typeof data === "string" && data.includes("Path:turn.end")) {
    log("TURN.END DETECTED (string) ✓");
    ws.close();
    setTimeout(() => process.exit(0), 300);
  }
  // تست جستجوی متن داخل باینری هم
  try {
    const u = data instanceof Uint8Array ? data : new Uint8Array(data);
    const asText = new TextDecoder().decode(u);
    if (asText.includes("Path:turn.end")) {
      log("TURN.END DETECTED (inside binary frame) ✓");
      ws.close();
      setTimeout(() => process.exit(0), 300);
    }
  } catch {}
});
ws.on("error", (e) => log("ERROR: " + e.message));
setTimeout(() => { log("TIMEOUT"); process.exit(5); }, 15000).unref();
