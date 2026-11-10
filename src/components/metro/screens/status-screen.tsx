"use client";

import { useEffect, useState } from "react";
import { MI, LineBadgeBig, CrowdPill } from "../ui";
import { toFa } from "@/lib/metro-data";

interface LineStatus {
  id: string;
  name: string;
  number: number;
  color: string;
  textOnColor: string;
  terminals: [string, string];
  headwayLabel: string;
  stationCount: number;
  status: string;
  statusNote: string;
  crowd: "quiet" | "moderate" | "busy";
  crowdLabel: string;
  crowdColor: string;
}

interface Alert {
  lineId: string;
  lineName: string;
  color: string;
  severity: string;
  title: string;
  body: string;
  time: string;
}

export default function StatusScreen() {
  const [lines, setLines] = useState<LineStatus[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => {
        setLines(d.lines ?? []);
        setAlerts(d.alerts ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="w-full max-w-md mx-auto px-4 pt-3 pb-36 space-y-3">
      {/* خلاصه شبکه */}
      <section className="bg-gradient-to-l from-metro-primary-c to-metro-primary text-white rounded-2xl p-4 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <MI name="speed" size={22} fill />
            </div>
            <div>
              <h2 className="text-sm font-bold">وضعیت لحظه‌ای شبکه متروی تهران</h2>
              <p className="text-[11px] text-metro-onprimary-c mt-0.5">
                {loading ? "در حال بررسی..." : `${toFa(lines.filter((l) => l.status === "normal").length)} از ${toFa(lines.length)} خط در حالت عادی`}
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-white/15 px-2 py-1 rounded-full">
            {new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </section>

      {/* هشدارها */}
      {alerts.length > 0 && (
        <section className="space-y-2" aria-label="هشدارهای فعال">
          {alerts.map((a) => (
            <div
              key={a.lineId}
              className={`rounded-2xl p-3.5 border flex items-start gap-3 ${
                a.severity === "high" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${a.severity === "high" ? "bg-red-100" : "bg-amber-100"}`}>
                <MI name={a.severity === "high" ? "priority_high" : "groups"} size={20} className={a.severity === "high" ? "text-metro-error" : "text-amber-600"} fill />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className={`text-xs font-bold ${a.severity === "high" ? "text-metro-error" : "text-amber-700"}`}>{a.title}</h3>
                  <span className="text-[10px] text-metro-outline shrink-0">{a.time}</span>
                </div>
                <p className="text-[11px] text-metro-onvar mt-1">{a.body}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* وضعیت خطوط */}
      <section className="space-y-2.5" aria-label="وضعیت خطوط">
        {loading && [0, 1, 2, 3].map((i) => <div key={i} className="h-24 shimmer rounded-2xl" />)}
        {!loading &&
          lines.map((l) => (
            <article key={l.id} className="bg-white rounded-2xl border border-metro-outline-var/40 p-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <LineBadgeBig number={l.number} color={l.color} textOn={l.textOnColor} />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-metro-onsurface truncate">
                      {l.terminals[0]} ↔ {l.terminals[1]}
                    </h3>
                    <p className="text-[10px] text-metro-onvar mt-0.5">
                      {toFa(l.stationCount)} ایستگاه • سرفاصله {l.headwayLabel} دقیقه
                    </p>
                  </div>
                </div>
                <CrowdPill level={l.crowd} label={l.crowdLabel} />
              </div>
              <div className="mt-2.5 pt-2 border-t border-metro-outline-var/20 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full pulse-dot ${l.status === "normal" ? "bg-emerald-600" : l.status === "delay" ? "bg-metro-error" : "bg-amber-500"}`} />
                <p className="text-[11px] text-metro-onvar">{l.statusNote}</p>
              </div>
            </article>
          ))}
      </section>
    </main>
  );
}
