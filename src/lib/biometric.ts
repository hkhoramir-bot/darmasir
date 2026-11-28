"use client";

/* ============================================================
   اثر انگشت / بیومتریک — سه حالت:
   1. native  → افزونه Capacitor NativeBiometric (در اپ اندروید)
   2. webauthn → تأیید بیومتریک مرورگر (WebAuthn platform authenticator)
   3. demo    → حالت نمایشی وب (بدون سنسور واقعی — در اپ اندروید
                افزونه نصب می‌شود و سنسور واقعی استفاده خواهد شد)
   ============================================================ */

export type BioSupport = "native" | "webauthn" | "demo";

type NativeBiometricPlugin = {
  authenticate: (opts: {
    reason?: string;
    title?: string;
    subtitle?: string;
    useFallback?: boolean;
    maxAttempts?: number;
  }) => Promise<void>;
  isAvailable?: () => Promise<{ isAvailable: boolean; biometryType?: string | number }>;
};

function getNativePlugin(): NativeBiometricPlugin | null {
  try {
    const w = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, NativeBiometricPlugin> };
    };
    if (w.Capacitor?.isNativePlatform?.() && w.Capacitor.Plugins?.NativeBiometric) {
      return w.Capacitor.Plugins.NativeBiometric;
    }
    return null;
  } catch {
    return null;
  }
}

/** تشخیص پشتیبانی اثر انگشت روی دستگاه فعلی */
export async function detectBiometricSupport(): Promise<BioSupport> {
  if (getNativePlugin()) return "native";
  try {
    const pc = (window as unknown as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } })
      .PublicKeyCredential;
    if (pc?.isUserVerifyingPlatformAuthenticatorAvailable) {
      const ok = await pc.isUserVerifyingPlatformAuthenticatorAvailable();
      if (ok) return "webauthn";
    }
  } catch {}
  return "demo";
}

/** اجرای احراز هویت بیومتریک — در حالت نمایشی پس از یک اسکن کوتاه موفق می‌شود */
export async function authenticateBiometric(
  reason: string
): Promise<{ ok: boolean; method: BioSupport; error?: string }> {
  // ابتدا پشتیبانی واقعی دستگاه را تشخیص می‌دهیم؛ فقط با سنسور واقعی
  // فراخوانی بیومتریک انجام می‌شود (وگرنه تجربه به حالت نمایشی می‌رود)
  const support = await detectBiometricSupport();

  if (support === "native") {
    const plugin = getNativePlugin();
    try {
      await plugin!.authenticate({
        reason,
        title: "درمسیر",
        subtitle: reason,
        useFallback: true,
        maxAttempts: 3,
      });
      return { ok: true, method: "native" };
    } catch (e) {
      return { ok: false, method: "native", error: "اثر انگشت تأیید نشد" };
    }
  }

  if (support === "webauthn") {
    // WebAuthn مرورگر — سنسور واقعی (Touch ID / Windows Hello / ...)
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({
        publicKey: {
          challenge,
          userVerification: "required",
          timeout: 30000,
          rpId: window.location.hostname,
        } as PublicKeyCredentialRequestOptions,
      });
      return { ok: true, method: "webauthn" };
    } catch {
      return { ok: false, method: "webauthn", error: "بیومتریک مرورگر تأیید نشد" };
    }
  }

  // حالت نمایشی وب — اسکن شبیه‌سازی‌شده
  await new Promise((r) => setTimeout(r, 1100));
  return { ok: true, method: "demo" };
}
