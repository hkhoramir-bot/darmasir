"use client";

import { useEffect, useMemo, useState } from "react";
import { STATIONS, getLine, toFa, searchStations } from "@/lib/metro-data";
import { MI, SearchInput } from "./ui";

export interface StationPickerSheetProps {
  open: boolean;
  title: string;
  excludeId?: string;
  onClose: () => void;
  onSelect: (stationId: string, stationName: string) => void;
}

/** شیت انتخاب ایستگاه با جستجو */
export function StationPickerSheet({ open, title, excludeId, onClose, onSelect }: StationPickerSheetProps) {
  const [q, setQ] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  // الگوی مجاز React: ریست state هنگام تغییر prop در رندر
  if (open && !wasOpen) {
    setWasOpen(true);
    setQ("");
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const results = useMemo(() => {
    const list = q.trim() ? searchStations({ q }) : STATIONS;
    return list.filter((s) => s.id !== excludeId).slice(0, 60);
  }, [q, excludeId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 fade-in" onClick={onClose} />
      <div className="sheet-in relative w-full max-w-md bg-metro-card rounded-t-3xl max-h-[72vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-metro-outline-var/40">
          <span className="w-10 h-1.5 rounded-full bg-metro-c-highest absolute top-2 left-1/2 -translate-x-1/2" />
          <h3 className="text-sm font-bold text-metro-onsurface flex items-center gap-1.5">
            <MI name="location_on" size={18} className="text-metro-primary-c" />
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="بستن"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-metro-outline hover:bg-metro-c active:scale-95 transition-all"
          >
            <MI name="close" size={20} />
          </button>
        </div>
        <div className="px-4 py-2.5">
          <SearchInput value={q} onChange={setQ} placeholder="نام ایستگاه را بنویسید..." />
        </div>
        <div className="overflow-y-auto pretty-scroll px-2 pb-4 flex-1">
          {results.length === 0 && (
            <p className="text-center text-xs text-metro-outline py-8">ایستگاهی با این نام پیدا نشد</p>
          )}
          {results.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onSelect(s.id, s.name);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-metro-c-low active:bg-metro-c transition-all text-right"
            >
              <span className="flex items-center -space-x-1.5 space-x-reverse shrink-0">
                {s.lines.map((l) => {
                  const line = getLine(l.lineId);
                  return (
                    <span
                      key={l.lineId}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shadow-sm border-2 border-white"
                      style={{ backgroundColor: line.color, color: line.textOnColor }}
                    >
                      {toFa(line.number)}
                    </span>
                  );
                })}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-metro-onsurface truncate">{s.name}</p>
                {s.lines.length > 1 && (
                  <p className="text-[10px] text-metro-primary-c font-bold">ایستگاه تقاطعی</p>
                )}
              </div>
              <MI name="chevron_left" size={16} className="text-metro-outline-var" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
