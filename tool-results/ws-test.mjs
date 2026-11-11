/* آزمایش دست‌دادن Edge TTS — نوشتن نتیجه در فایل (به‌دلیل بافر شدن stdout) */
import { appendFileSync } from "fs";
import { createRequire } from "module";
const req = createRequire("/home/z/my-project/package.json");
const WebSocket = req("ws");
const m = await import("/home/z/my-project/cloudflare/metrojo-voice-worker.js");
const I = m._internals;
const LOG = "/home/z/my-project/tool-results/ws-test.log";

const log = (s) => appendFileSync(LOG, s + "\n");
appendFileSync(LOG, "=== start " + new Date().toISOString() + " ===\n");

try {
  const gec = await I.secMsGecToken();
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
  const url =
    "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&Sec-MS-GEC=" +
    gec +
    "&Sec-MS-GEC-Version=2-143.0.3650.96&ConnectionId=" +
    id;

  let bytes = 0;
  let frames = 0;
  const ws = new WebSocket(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    },
  });
  ws.binaryType = "arraybuffer";
  ws.on("open", () => {
    log("handshake OPEN (101) ✓");
    ws.send(I.speechConfigMessage());
    ws.send(I.ssmlMessage("سلام، این یک آزمایش صدای فارسی متروجو است.", "fa-IR-DilaraNeural", 1.25));
  });
  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      if (data.toString().includes("Path:turn.end")) {
        log(`turn.end ✓  mp3=${bytes} bytes / ${frames} frames`);
        log(bytes > 2000 ? "RESULT: PROTOCOL OK ✓" : "RESULT: TOO FEW BYTES ✗");
        ws.close();
        setTimeout(() => process.exit(bytes > 2000 ? 0 : 2), 300);
      }
      return;
    }
    const buf = new Uint8Array(data);
    if (buf.length < 2) return;
    const hlen = (buf[0] << 8) | buf[1];
    bytes += Math.max(0, buf.length - hlen - 2);
    frames++;
  });
  ws.on("error", (e) => log("WS ERROR: " + e.message));
  ws.on("close", (c, r) => log(`closed code=${c} reason=${r?.toString?.() ?? ""}`));
  setTimeout(() => {
    log(`TIMEOUT bytes=${bytes} frames=${frames}`);
    process.exit(5);
  }, 20000).unref();
} catch (e) {
  log("FATAL: " + e.message);
  process.exit(1);
}
