"use client";

import { useCallback, useRef, useState } from "react";
import { getVoicePrefs, type VoiceGender } from "@/lib/voice-settings";

/* ============================================================
   دستیار صوتی متروجو — کاملاً فارسی و بدون نیاز به هیچ کلید/API
   دو گوینده فارسی:
   • زن  — دلاورا (fa-IR-DilaraNeural) یا صدای فارسی دستگاه
   • مرد — فرید  (fa-IR-FaridNeural)  یا صدای دستگاه بم‌شده
   ASR:  تشخیص گفتار فارسی مرورگر/اندروید (fa-IR)
   ============================================================ */

export const VOICE_ERRORS = {
  playbackFail: "پخش صدا ممکن نشد — اتصال اینترنت یا صدای دستگاه را بررسی کنید و دوباره تلاش کنید",
  cloudFail: "اتصال به سرویس صدای فارسی برقرار نشد. اینترنت را بررسی کنید.",
  asrFail: "صدا واضح نبود، دوباره تلاش کنید",
  asrUnsupported: "جستجوی صوتی در این مرورگر پشتیبانی نمی‌شود — لطفاً عبارت را تایپ کنید",
  micDenied: "دسترسی به میکروفون داده نشد",
};

/** آیا اپ داخل WebView اندروید (Capacitor) اجرا می‌شود؟ */
function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return w.Capacitor?.isNativePlatform?.() === true;
}

/* ---------------- موتور گفتار فارسی دستگاه ---------------- */

/** پخش با موتور گفتار نیتیو اندروید (پلاگین) — true یعنی پخش شد */
async function nativeSpeak(text: string, rate: number, gender: VoiceGender): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
    await TextToSpeech.speak({
      text,
      lang: "fa-IR",
      rate,
      pitch: gender === "male" ? 0.65 : 1.05,
      volume: 1.0,
      category: "assistant",
    });
    return true;
  } catch {
    return false;
  }
}

/** توقف صدای نیتیو */
async function nativeStop(): Promise<void> {
  if (!isNative()) return;
  try {
    const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
    await TextToSpeech.stop();
  } catch {
    /* فعال نبود */
  }
}

let faVoices: SpeechSynthesisVoice[] | null | undefined; // undefined = هنوز بررسی نشده

/** همه صداهای فارسی دستگاه (fa / fa-IR) */
export function findFaVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  if (faVoices !== null && faVoices !== undefined) return faVoices;
  const voices = window.speechSynthesis.getVoices();
  faVoices = voices.filter((v) =>
    v.lang?.toLowerCase().replace("_", "-").startsWith("fa")
  );
  return faVoices;
}

/** یافتن صدای فارسی دستگاه متناسب با جنسیت انتخابی */
export function findFaVoice(gender: VoiceGender = "female"): SpeechSynthesisVoice | null {
  const list = findFaVoices();
  if (!list.length) return null;
  if (list.length === 1) return list[0];

  const isFemaleName = (n: string) => /female|dilara|zan|زن|woman/i.test(n);
  const isMaleName = (n: string) =>
    !isFemaleName(n) && (/male|hamed|farid|dariush|mard|مرد/i.test(n));

  const wanted = gender === "male" ? isMaleName : isFemaleName;
  return list.find((v) => wanted(v.name)) ?? list[0];
}

/** بازنشانی کش صدای دستگاه (پس از نصب صدای جدید) */
export function resetFaVoiceCache() {
  faVoices = undefined;
}

/** پخش با موتور گفتار دستگاه — true یعنی شروع شد */
function deviceSpeak(
  text: string,
  rate: number,
  gender: VoiceGender,
  onEnd?: () => void
): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve(false);
      return;
    }
    const synth = window.speechSynthesis;

    const trySpeak = (): boolean => {
      const voice = findFaVoice(gender);
      if (!voice) return false;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang || "fa-IR";
      u.rate = Math.min(1.5, Math.max(0.6, rate));
      // صدای مرد: زیرتر و بم‌تر — وقتی فقط یک صدای فارسی نصب باشد هم تفاوت محسوس است
      u.pitch = gender === "male" ? 0.65 : 1.05;
      u.onend = () => onEnd?.();
      u.onerror = () => onEnd?.();
      synth.speak(u);
      resolve(true);
      return true;
    };

    if (trySpeak()) return;

    // صداها ممکن است با تأخیر بارگذاری شوند — تا ۱.۶ ثانیه منتظر می‌مانیم
    let waited = 0;
    const timer = window.setInterval(() => {
      waited += 200;
      if (trySpeak()) {
        window.clearInterval(timer);
        return;
      }
      if (waited >= 1600) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 200);
  });
}

/** پخش با صدای فارسی سرور (بدون کلید) — زن: دلاورا، مرد: فرید */
async function serverSpeak(
  text: string,
  rate: number,
  gender: VoiceGender,
  audio: HTMLAudioElement
): Promise<void> {
  // اگر آدرس ورکر کلودفلر ذخیره شده باشد از آن استفاده می‌شود (نسخه اندروید)
  const serverUrl = (getVoicePrefs().serverUrl ?? "").trim().replace(/\/+$/, "");
  const endpoint = serverUrl ? `${serverUrl}/tts` : "/api/voice/tts";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, rate, gender }),
  });
  if (!res.ok) {
    throw new Error(VOICE_ERRORS.cloudFail);
  }
  // پاسخ خطای JSON از ورکر → مسیر پشتیبان
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    throw new Error(VOICE_ERRORS.cloudFail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  audio.src = url;
  const cleanup = () => URL.revokeObjectURL(url);
  audio.onended = () => cleanup();
  await audio.play();
}

/* ---------------- هوک اعلام صوتی فارسی ---------------- */

export function useAnnouncer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    void nativeStop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setSpeaking(false);
  }, []);

  const announce = useCallback(
    async (text: string) => {
      setError(null);
      stop();
      setSpeaking(true);
      const finish = () => setSpeaking(false);
      const prefs = getVoicePrefs();

      // اندروید: اول موتور نیتیو، بعد موتور مرورگر
      const playOnDevice = async (): Promise<boolean> => {
        if (await nativeSpeak(text, prefs.rate, prefs.gender)) {
          finish();
          return true;
        }
        return deviceSpeak(text, prefs.rate, prefs.gender, finish);
      };

      const playInCloud = async () => {
        if (!audioRef.current) audioRef.current = new Audio();
        const a = audioRef.current;
        a.onended = finish;
        a.onerror = finish;
        await serverSpeak(text, prefs.rate, prefs.gender, a);
      };

      try {
        // هر مسیری که شکست خورد، مسیر دیگر خودکار امتحان می‌شود؛
        // خطا فقط وقتی نمایش داده می‌شود که هر دو مسیر در دسترس نباشند.

        if (prefs.engine === "device") {
          const ok = await playOnDevice();
          if (ok) return;
          try {
            await playInCloud();
            return;
          } catch {
            /* اینترنت نبود */
          }
          setSpeaking(false);
          setError(VOICE_ERRORS.playbackFail);
          return;
        }

        if (prefs.engine === "cloud") {
          try {
            await playInCloud();
            return;
          } catch {
            /* اینترنت نبود — ادامه با صدای دستگاه */
          }
          const ok = await playOnDevice();
          if (ok) return;
          setSpeaking(false);
          setError(VOICE_ERRORS.playbackFail);
          return;
        }

        // auto — ترتیب بر اساس جنسیت انتخابی تا هر دو صدا واقعی و متمایز باشند:
        //   زن: اول صدای فارسی دستگاه (معمولاً زن)، در نبودش دلاورا (آنلاین)
        //   مرد: اول فرید (آنلاین — گوینده واقعی مرد)، در نبود اینترنت صدای دستگاه بم‌شده
        if (prefs.gender === "male") {
          try {
            await playInCloud();
            return;
          } catch {
            /* اینترنت نبود — ادامه با صدای دستگاه */
          }
          const ok = await playOnDevice();
          if (ok) return;
        } else {
          const ok = await playOnDevice();
          if (ok) return;
          try {
            await playInCloud();
            return;
          } catch {
            /* اینترنت نبود */
          }
        }
        setSpeaking(false);
        setError(VOICE_ERRORS.playbackFail);
      } catch {
        setSpeaking(false);
        setError(VOICE_ERRORS.playbackFail);
      }
    },
    [stop]
  );

  return { announce, stop, speaking, error };
}

/* ---------------- تشخیص گفتار فارسی ---------------- */

interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [index: number]: SRAlternative;
}
interface SREvent {
  results: { length: number; [index: number]: SRResult };
}
interface SRErrorEvent {
  error?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** هوک جستجوی صوتی فارسی — اول موتور مرورگر، بعد ضبط و سرور */
export function useVoiceSearch(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStopRef = useRef(false);
  const gotRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  /** مسیر پشتیبان: ضبط و ارسال به سرور */
  const startRecorder = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(VOICE_ERRORS.asrUnsupported);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy(true);
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const base64 = bufToBase64(await blob.arrayBuffer());
          const res = await fetch("/api/voice/asr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: base64 }),
          });
          const data = (await res.json().catch(() => null)) as
            | { text?: string; message?: string }
            | null;
          if (data?.text) onResultRef.current(data.text);
          else setError(data?.message || VOICE_ERRORS.asrFail);
        } catch {
          setError(VOICE_ERRORS.asrFail);
        } finally {
          setBusy(false);
          setListening(false);
        }
      };
      rec.start();
      mediaRef.current = rec;
      setListening(true);
      // حداکثر ۷ ثانیه ضبط
      window.setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 7000);
    } catch {
      setError(VOICE_ERRORS.micDenied);
      setListening(false);
    }
  }, []);

  /** موتور تشخیص گفتار مرورگر (اندروید/کروم — fa-IR) */
  const startNative = useCallback((): boolean => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return false;
    try {
      const rec = new SR();
      recRef.current = rec;
      rec.lang = "fa-IR";
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      gotRef.current = false;
      manualStopRef.current = false;

      rec.onresult = (e) => {
        let final = "";
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) final += r[0].transcript;
        }
        if (final.trim()) {
          gotRef.current = true;
          setError(null);
          setListening(false);
          onResultRef.current(final.trim());
          try {
            rec.abort();
          } catch {
            /* قبلاً متوقف شده */
          }
        }
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setError(VOICE_ERRORS.micDenied);
          setListening(false);
        }
        // خطاهای دیگر (no-speech و...) در onend به مسیر سرور می‌روند
      };
      rec.onend = () => {
        if (gotRef.current || manualStopRef.current) {
          setListening(false);
          return;
        }
        // نتیجه‌ای نگرفتیم → مسیر ضبط و سرور
        void startRecorder();
      };

      rec.start();
      setListening(true);
      window.setTimeout(() => {
        try {
          if (!gotRef.current) rec.stop();
        } catch {
          /* تمام شده */
        }
      }, 7000);
      return true;
    } catch {
      return false;
    }
  }, [startRecorder]);

  /** موتور تشخیص گفتار نیتیو اندروید (پلاگین — fa-IR) */
  const startNativePlugin = useCallback(async () => {
    try {
      const SR = (
        await import("@capacitor-community/speech-recognition")
      ).SpeechRecognition;
      await SR.requestPermissions();
      setListening(true);
      const timeout = window.setTimeout(() => {
        void SR.stop();
      }, 7000);
      const { matches } = await SR.start({
        language: "fa-IR",
        maxResults: 1,
        partialResults: false,
        popup: false,
      });
      window.clearTimeout(timeout);
      const text = (matches?.[0] ?? "").trim();
      if (text) {
        gotRef.current = true;
        setError(null);
        onResultRef.current(text);
      } else {
        setError(VOICE_ERRORS.asrFail);
      }
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? "");
      if (/denied|permission/i.test(msg)) setError(VOICE_ERRORS.micDenied);
      else setError(VOICE_ERRORS.asrFail);
    } finally {
      setListening(false);
    }
  }, []);

  const start = useCallback(() => {
    setError(null);
    manualStopRef.current = false;
    gotRef.current = false;
    if (isNative()) {
      void startNativePlugin();
      return;
    }
    if (!startNative()) {
      void startRecorder();
    }
  }, [startNativePlugin, startNative, startRecorder]);

  const stop = useCallback(() => {
    manualStopRef.current = true;
    try {
      recRef.current?.abort();
    } catch {
      /* فعال نبود */
    }
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    setListening(false);
  }, []);

  return { start, stop, listening, busy, error, clearError: () => setError(null) };
}
