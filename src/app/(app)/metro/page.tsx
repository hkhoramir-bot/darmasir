"use client";

import { useRouter } from "next/navigation";
import { MI, PageHeader } from "@/components/metro/shell";

/* ============================================================
   مترو — هاب دسترسی به بخش‌های مترو
   (خطوط مترو، ایستگاه‌ها، وضعیت خطوط و اطلاعیه‌ها)
   ============================================================ */

const METRO_SECTIONS: {
  href: string;
  icon: string;
  title: string;
  desc: string;
  color: string;
}[] = [
  {
    href: "/lines",
    icon: "route",
    title: "خطوط مترو",
    desc: "مشاهده همه خطوط، ایستگاه‌ها و ساعت حرکت هر خط",
    color: "bg-primary/10 text-primary",
  },
  {
    href: "/stations",
    icon: "directions_subway",
    title: "ایستگاه‌ها",
    desc: "جستجوی ایستگاه، امکانات و اطلاعات کامل هر ایستگاه",
    color: "bg-tertiary-fixed/40 text-tertiary",
  },
  {
    href: "/status",
    icon: "campaign",
    title: "وضعیت خطوط و اطلاعیه‌ها",
    desc: "وضعیت لحظه‌ای خطوط، تاخیرها و اطلاعیه‌های رسمی",
    color: "bg-secondary/15 text-secondary",
  },
];

export default function MetroPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="مترو"
        subtitle="دسترسی سریع به بخش‌های شبکه مترو"
        actions={
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <MI name="directions_subway" size={20} />
          </div>
        }
      />

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-28 space-y-3">
        {METRO_SECTIONS.map((s) => (
          <button
            key={s.href}
            type="button"
            onClick={() => router.push(s.href)}
            className="w-full bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4 shadow-sm hover:shadow-md active:scale-[0.98] transition-all flex items-center gap-3.5 text-right"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${s.color}`}>
              <MI name={s.icon} size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-on-surface">{s.title}</h2>
              <p className="text-body-sm text-outline mt-0.5 leading-relaxed">{s.desc}</p>
            </div>
            <MI name="chevron_left" size={22} className="text-outline-variant shrink-0" />
          </button>
        ))}
      </main>
    </>
  );
}
