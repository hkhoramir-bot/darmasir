/* راستی‌آزمایی پروتکل ورکر صدا: توکن Sec-MS-GEC v2 + دست‌دادن کامل WebSocket */
import { _internals } from "/home/z/my-project/cloudflare/metrojo-voice-worker.js";
import { hashSecMsGecV2 as refHash } from "/home/z/my-project/node_modules/msedge-tts/dist/SecMsGec.js";
import { createRequire } from "module";
const require = createRequire("/home/z/my-project/package.json");
const WebSocket = require("ws");

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

/* ۱) مقایسه توکن با پیاده‌سازی مرجع msedge-tts */
const sample = "1338900000000000" + TOKEN;
const mine = await _internals.hashSecMsGecV2(sample);
const ref = await refHash(sample);
console.log("1) token v2:", mine === ref ? "MATCH ✓" : `MISMATCH ✗\n mine=${mine}\n ref=${ref}`);
if (mine !== ref) throw new Error("token mismatch");

/* ۲) جریان کامل: دست‌دادن + پیکربندی + SSML + دریافت mp3 */
const gec = await _internals.secMsGecToken();
const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
  b.toString(16).padStart(2, "0")
).join("");
const url = `${WSS}?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=2-143.0.3650.96&ConnectionId=${id}`;

const ws = new WebSocket(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
    Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  },
});
ws.binaryType = "arraybuffer";

let bytes = 0;
let frames = 0;
ws.on("open", () => {
  console.log("2) handshake: OPEN (101) ✓");
  ws.send(_internals.speechConfigMessage());
  ws.send(_internals.ssmlMessage("سلام، این یک آزمایش صدای فارسی متروجو است.", "fa-IR-DilaraNeural", 1.25));
});
let done = false;
ws.on("message", (data, isBinary) => {
  if (!isBinary) {
    const s = data.toString();
    if (s.includes("Path:turn.end")) {
      console.log(`3) turn.end ✓  mp3=${bytes} bytes در ${frames} فریم`);
      console.log(bytes > 2000 ? "RESULT: PROTOCOL OK ✓" : "RESULT: TOO FEW BYTES ✗");
      process.exitCode = bytes > 2000 ? 0 : 2;
      done = true;
      ws.close();
    }
    return;
  }
  const buf = new Uint8Array(data);
  if (buf.length < 2) return;
  const hlen = (buf[0] << 8) | buf[1];
  bytes += Math.max(0, buf.length - hlen - 2);
  frames++;
});
ws.on("unexpected-response", (_req, res) => {
  console.log("UNEXPECTED RESPONSE:", res.statusCode);
  process.exitCode = 3;
  done = true;
});
ws.on("error", (e) => {
  console.log("WS ERROR:", e.message);
  process.exitCode = 4;
  done = true;
});
const guard = setTimeout(() => {
  if (!done) {
    console.log("TIMEOUT — bytes:", bytes, "frames:", frames);
    process.exitCode = 5;
  }
}, 20000);
guard.unref?.();
