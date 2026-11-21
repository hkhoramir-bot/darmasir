"use client";

import MetroMap from "../metro-map";

export default function MapScreen({
  highlight,
  onStationSelect,
}: {
  highlight?: string[];
  onStationSelect?: (id: string) => void;
}) {
  return (
    <main className="w-full max-w-md mx-auto px-3 pt-3 pb-36">
      <div className="h-[calc(100dvh-190px)] min-h-[480px]">
        <MetroMap className="h-full shadow-sm border border-metro-outline-var/30" onStationSelect={onStationSelect} highlightStations={highlight} />
      </div>
      <p className="text-center text-[10px] text-metro-outline mt-2">
        برای دیدن جزئیات هر ایستگاه روی دایره آن بزنید • با دو انگشت یا دکمه‌ها بزرگ‌نمایی کنید
      </p>
    </main>
  );
}
