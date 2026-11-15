/* ============================================================
   اسکلتون بارگذاری صفحات — نمایش قبل از آماده‌شدن محتوا
   ============================================================ */

export function PageSkeleton() {
  return (
    <div className="flex-1 w-full px-4 pt-4 pb-28 space-y-3" aria-busy="true" aria-live="polite">
      {/* هدر صفحه */}
      <div className="h-10 flex items-center justify-center gap-2">
        <div className="h-4 w-40 rounded-full bg-surface-container-high animate-pulse" />
      </div>
      {/* کارت‌ها */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-sm p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-surface-container-high animate-pulse" />
            <div className="h-3.5 w-1/3 rounded-full bg-surface-container-high animate-pulse" />
          </div>
          <div className="h-11 rounded-xl bg-surface-container-low animate-pulse" />
          <div
            className="h-11 rounded-xl bg-surface-container-low animate-pulse"
            style={{ animationDelay: "150ms" }}
          />
          <div
            className="h-3 w-2/3 rounded-full bg-surface-container animate-pulse"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      ))}
    </div>
  );
}
