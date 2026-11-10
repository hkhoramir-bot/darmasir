"use client";

import { useCallback, useRef, useState } from "react";

/* ============================================================
   دستیار صوتی متروجو — TTS (اعلام) و ASR (جستجوی صوتی)
   ============================================================ */

/** پخش اعلام صوتی فارسی با TTS سمت سرور */
export function useAnnouncer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const announce = useCallback(async (text: string, voice: string = "tongtong") => {
    setError(null);
    setSpeaking(true);
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) throw new Error("tts failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      await audioRef.current.play();
    } catch {
      setSpeaking(false);
      setError("پخش صوتی در دسترس نیست");
    }
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setSpeaking(false);
  }, []);

  return { announce, stop, speaking, error };
}

/** ضبط صدا و تشخیص گفتار با ASR سمت سرور */
export function useVoiceSearch(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    setError(null);
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
          const buf = await blob.arrayBuffer();
          const base64 = btoa(
            Array.from(new Uint8Array(buf))
              .map((b) => String.fromCharCode(b))
              .join("")
          );
          const res = await fetch("/api/voice/asr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: base64 }),
          });
          const data = await res.json();
          if (data.text) onResult(data.text);
          else setError("صدا واضح نبود، دوباره تلاش کنید");
        } catch {
          setError("تشخیص گفتار در دسترس نیست");
        } finally {
          setBusy(false);
          setListening(false);
        }
      };
      rec.start();
      mediaRef.current = rec;
      setListening(true);
      // حداکثر ۶ ثانیه ضبط
      setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 6000);
    } catch {
      setError("دسترسی به میکروفون داده نشد");
      setListening(false);
    }
  }, [onResult]);

  const stop = useCallback(() => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
  }, []);

  return { start, stop, listening, busy, error, clearError: () => setError(null) };
}
