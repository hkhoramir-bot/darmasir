"use client";

/* آخرین لایه دفاع — اگر خود مرز خطا هم بشکند، این صفحه رندر می‌شود */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f6fa",
          fontFamily: "Vazirmatn, sans-serif",
          padding: "1rem",
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: "22rem",
            width: "100%",
            background: "#fff",
            borderRadius: "1.25rem",
            border: "1px solid #e2e8f0",
            padding: "1.5rem",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <h1 style={{ fontSize: "0.9rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
            خطای غیرمنتظره در درمسیر
          </h1>
          <p style={{ fontSize: "0.72rem", color: "#64748b", lineHeight: 1.8, margin: 0 }}>
            متأسفیم — مشکلی در نمایش برنامه پیش آمد. لطفاً دوباره تلاش کنید.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: "2.5rem",
              borderRadius: "0.75rem",
              background: "#07805f",
              color: "#fff",
              fontSize: "0.75rem",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            تلاش دوباره
          </button>
        </div>
      </body>
    </html>
  );
}
