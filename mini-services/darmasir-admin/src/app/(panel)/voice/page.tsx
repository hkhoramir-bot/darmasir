"use client";

import { useCallback, useEffect, useState } from "react";
import { gw } from "@/lib/gw";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";

// ============================================================
// دستیار صوتی و آواشناسی — هم‌سبک با توکن‌های مشترک پنل
// پیام خوش‌آمد، عبارت‌های ثابت راهنما، فرهنگ تلفظ، محدودیت‌ها
// ============================================================

const fa = (n: number | string) =>
  String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

const faDecimal = (n: number) => fa(String(n).replace(".", "٫"));

type GuidePhrases = {
  start: string;
  nextStation: string;
  transfer: string;
  arrive: string;
};

type DictItem = { word: string; say: string };

type ServiceRow = { key: string; name: string; status: string };

const GUIDE_FIELDS: { key: keyof GuidePhrases; label: string; hint: string }[] = [
  {
    key: "start",
    label: "شروع سفر",
    hint: "با آغاز مسیریابی صوتی پخش می‌شود",
  },
  {
    key: "nextStation",
    label: "اعلام ایستگاه بعدی",
    hint: "جای‌نگهدار {station} با نام ایستگاه جایگزین می‌شود",
  },
  {
    key: "transfer",
    label: "اعلام خط‌کشی و انتقال",
    hint: "جای‌نگهدار {line} با نام خط مقصد جایگزین می‌شود",
  },
  {
    key: "arrive",
    label: "رسیدن به مقصد",
    hint: "در پایان سفر پخش می‌شود",
  },
];

const STATUS_LABEL: Record<string, { text: string; cls: string; dot: string }> = {
  HEALTHY: { text: "برخط", cls: "bg-tertiary-fixed text-on-tertiary-fixed-variant", dot: "bg-tertiary" },
  DEGRADED: { text: "اختلال جزئی", cls: "bg-secondary-fixed text-on-secondary-fixed", dot: "bg-secondary" },
  DOWN: { text: "قطع", cls: "bg-error-container text-error", dot: "bg-error" },
};

export default function VoicePage() {
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [greeting, setGreeting] = useState("");
  const [guide, setGuide] = useState<GuidePhrases>({
    start: "", nextStation: "", transfer: "", arrive: "",
  });
  const [dict, setDict] = useState<DictItem[]>([]);
  const [newWord, setNewWord] = useState("");
  const [newSay, setNewSay] = useState("");
  const [asr, setAsr] = useState(15);
  const [tts, setTts] = useState(1);
  const [services, setServices] = useState<ServiceRow[]>([]);

  const isViewer = role === "VIEWER";

  const loadVoice = useCallback(async () => {
    try {
      const r = await fetch(gw("/api/v1/voice"));
      const d = await r.json();
      if (d.ok) {
        setGreeting(d.voice.voiceGreeting);
        setGuide({
          start: d.voice.guide.start ?? "",
          nextStation: d.voice.guide.nextStation ?? "",
          transfer: d.voice.guide.transfer ?? "",
          arrive: d.voice.guide.arrive ?? "",
        });
        setDict(d.voice.pronunciation);
        setAsr(d.voice.asrMaxSeconds);
        setTts(d.voice.ttsSpeed);
      }
    } catch { /* شبکه — بی‌صدا */ }
  }, []);

  useEffect(() => {
    (async () => {
      const r = await fetch(gw("/api/v1/auth/me"));
      const d = await r.json();
      if (d.ok) setRole(d.admin.role);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([
        loadVoice(),
        fetch(gw("/api/v1/stats"))
          .then((r) => r.json())
          .then((d) => {
            if (d.ok && Array.isArray(d.services)) setServices(d.services);
          })
          .catch(() => {}),
      ]);
      setLoading(false);
    })();
  }, [loadVoice]);

  async function savePhrases() {
    if (!greeting.trim()) {
      toast.error("پیام خوش‌آمد نمی‌تواند خالی باشد");
      return;
    }
    for (const f of GUIDE_FIELDS) {
      if (!guide[f.key].trim()) {
        toast.error(`متن «${f.label}» باید پر باشد`);
        return;
      }
    }
    setSaving(true);
    try {
      const r = await fetch(gw("/api/v1/voice"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceGreeting: greeting, guide }),
      });
      const d = await r.json();
      if (d.ok) toast.success("عبارت‌های صوتی ذخیره شد");
      else toast.error(d.error || "ذخیره ناموفق بود");
    } finally {
      setSaving(false);
    }
  }

  async function saveDict(next: DictItem[]) {
    if (next.length > 50) {
      toast.error("حداکثر ۵۰ جفت در فرهنگ تلفظ مجاز است");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(gw("/api/v1/voice"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pronunciation: next }),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success("فرهنگ تلفظ ذخیره شد");
        setDict(next);
      } else {
        toast.error(d.error || "ذخیره ناموفق بود");
      }
    } finally {
      setSaving(false);
    }
  }

  function addDictItem() {
    const word = newWord.trim();
    const say = newSay.trim();
    if (!word || !say) {
      toast.error("کلمه و تلفظ هر دو باید پر باشند");
      return;
    }
    if (dict.some((d) => d.word === word)) {
      toast.error("این کلمه قبلاً در فرهنگ ثبت شده است");
      return;
    }
    const next = [...dict, { word, say }];
    setNewWord("");
    setNewSay("");
    saveDict(next);
  }

  function removeDictItem(word: string) {
    saveDict(dict.filter((d) => d.word !== word));
  }

  async function saveLimits() {
    setSaving(true);
    try {
      const r = await fetch(gw("/api/v1/voice"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asrMaxSeconds: asr, ttsSpeed: tts }),
      });
      const d = await r.json();
      if (d.ok) toast.success("محدودیت‌های سرویس صوتی ذخیره شد");
      else toast.error(d.error || "ذخیره ناموفق بود");
    } finally {
      setSaving(false);
    }
  }

  const voiceService = services.find((s) => s.key === "voice");

  return (
    <main className="p-4 sm:p-6 space-y-6">
      {/* ===== توضیح سند: اجرای فرمان‌های ثابت بدون مدل زبانی ===== */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-4 sm:p-5 shadow-sm flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary shrink-0">
          <span className="material-symbols-outlined text-title-lg">record_voice_over</span>
        </div>
        <div>
          <h1 className="text-title-lg font-title-lg text-on-surface font-bold">دستیار صوتی و آواشناسی</h1>
          <p className="text-body-sm font-body-sm text-on-surface-variant leading-relaxed mt-1">
            فرمان‌های ثابت صوتی مسافر — شروع سفر، اعلام ایستگاه بعدی، خط‌کشی و رسیدن به مقصد — بدون مدل زبانی و به‌صورت قطعی (قاعده‌محور) اجرا می‌شوند. متن‌های زیر و فرهنگ تلفظ فارسی، خروجی گفتاری اپلیکیشن را شکل می‌دهند و بدون نیاز به انتشار نسخه جدید قابل ویرایش‌اند.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== کارت ۱: پیام خوش‌آمد و عبارت‌های ثابت ===== */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden lg:row-span-2">
          <div className="px-6 py-5 border-b border-surface-container-high flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-xl">waving_hand</span>
            </div>
            <div>
              <h2 className="text-title-lg font-title-lg text-on-surface font-bold">پیام خوش‌آمد و عبارت‌های ثابت راهنما</h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant">متن‌های گفته‌شده در نقاط ثابت هر سفر</p>
            </div>
          </div>
          <div className="p-4 sm:p-6 space-y-5">
            <div>
              <label className="block text-label-lg font-label-lg text-on-surface mb-2">پیام خوش‌آمد (voiceGreeting)</label>
              <input
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                disabled={isViewer}
                className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface text-on-surface text-body-md font-body-md focus:outline-none focus:border-primary disabled:opacity-60"
              />
              <p className="text-label-sm font-label-sm text-outline mt-1.5">
                در شروع نشست صوتی به مسافر پخش می‌شود
              </p>
            </div>
            <div className="pt-2 border-t border-surface-container space-y-4">
              <span className="text-label-md font-label-md text-outline font-bold">عبارت‌های ثابت راهنما (voiceGuidePhrases)</span>
              {GUIDE_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="block text-label-lg font-label-lg text-on-surface mb-2">{f.label}</label>
                  <textarea
                    value={guide[f.key]}
                    onChange={(e) => setGuide({ ...guide, [f.key]: e.target.value })}
                    rows={2}
                    disabled={isViewer}
                    className="w-full p-3 rounded-xl border border-outline-variant bg-surface text-on-surface text-body-md font-body-md focus:outline-none focus:border-primary disabled:opacity-60"
                  />
                  <p className="text-label-sm font-label-sm text-outline mt-1.5">
                    {f.hint}
                    {(f.key === "nextStation" || f.key === "transfer") && (
                      <span className="text-label-sm font-label-sm bg-surface-container px-2 py-0.5 rounded text-primary font-mono mr-1" dir="ltr">
                        {f.key === "nextStation" ? "{station}" : "{line}"}
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
            <button
              onClick={savePhrases}
              disabled={isViewer || saving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container transition-all active:scale-[0.98] text-label-md font-label-md font-bold shadow-sm disabled:opacity-50 disabled:pointer-events-none"
            >
              <span className="material-symbols-outlined text-title-md">check_circle</span>
              <span>{saving ? "در حال ذخیره..." : "ذخیره عبارت‌ها"}</span>
            </button>
          </div>
        </div>

        {/* ===== کارت ۲: فرهنگ تلفظ فارسی ===== */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-surface-container-high flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-xl">translate</span>
              </div>
              <div>
                <h2 className="text-title-lg font-title-lg text-on-surface font-bold">فرهنگ تلفظ فارسی</h2>
                <p className="text-body-sm font-body-sm text-on-surface-variant">اصلاح آوای نام ایستگاه‌ها و کلمات دشوار</p>
              </div>
            </div>
            <span className="text-label-sm font-label-sm bg-surface-container px-3 py-1 rounded-md text-primary font-semibold">
              {fa(dict.length)} جفت از ۵۰
            </span>
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            {/* افزودن جفت جدید */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                disabled={isViewer}
                placeholder="کلمه (مثل نام ایستگاه)"
                className="flex-1 px-4 py-2.5 rounded-xl border border-outline-variant bg-surface text-on-surface text-body-md focus:outline-none focus:border-primary disabled:opacity-60"
              />
              <input
                value={newSay}
                onChange={(e) => setNewSay(e.target.value)}
                disabled={isViewer}
                placeholder="تلفظ صحیح"
                className="flex-1 px-4 py-2.5 rounded-xl border border-outline-variant bg-surface text-on-surface text-body-md focus:outline-none focus:border-primary disabled:opacity-60"
              />
              <button
                onClick={addDictItem}
                disabled={isViewer || saving}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container transition-all active:scale-[0.98] text-label-md font-label-md font-bold shadow-sm disabled:opacity-50 disabled:pointer-events-none shrink-0"
              >
                <span className="material-symbols-outlined text-title-md">add</span>
                <span>افزودن</span>
              </button>
            </div>
            {/* فهرست جفت‌ها */}
            {loading && (
              <p className="py-6 text-center text-body-md text-on-surface-variant">در حال بارگذاری فرهنگ تلفظ...</p>
            )}
            {!loading && dict.length === 0 && (
              <p className="py-6 text-center text-body-md text-on-surface-variant">
                هنوز جفتی ثبت نشده است — اولین کلمه را اضافه کنید
              </p>
            )}
            {dict.length > 0 && (
              <div className="max-h-72 overflow-y-auto custom-scrollbar rounded-xl border border-outline-variant divide-y divide-surface-container">
                {dict.map((d) => (
                  <div key={d.word} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low/60 transition-colors">
                    <span className="material-symbols-outlined text-lg text-outline shrink-0">graphic_eq</span>
                    <span className="text-body-md font-body-md font-bold text-on-surface min-w-24">{d.word}</span>
                    <span className="material-symbols-outlined text-base text-outline shrink-0">arrow_left</span>
                    <span className="text-body-md font-body-md text-primary flex-1">{d.say}</span>
                    <button
                      onClick={() => removeDictItem(d.word)}
                      disabled={isViewer || saving}
                      aria-label={`حذف ${d.word}`}
                      className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error-container/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <span className="material-symbols-outlined text-title-md">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-label-sm font-label-sm text-outline">
              تغییرات با دکمه افزودن یا حذف، بلافاصله ذخیره می‌شود
            </p>
          </div>
        </div>

        {/* ===== کارت ۳: محدودیت‌های سرویس ===== */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-surface-container-high flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-xl">speed</span>
            </div>
            <div>
              <h2 className="text-title-lg font-title-lg text-on-surface font-bold">محدودیت‌های سرویس صوتی</h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant">سقف ورودی گفتار و سرعت خروجی گوینده</p>
            </div>
          </div>
          <div className="p-4 sm:p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-label-lg font-label-lg text-on-surface">حداکثر طول ورودی گفتار (ASR)</label>
                <span className="text-label-md font-label-md bg-surface-container text-primary font-bold px-2.5 py-1 rounded-lg">
                  {fa(asr)} ثانیه
                </span>
              </div>
              <Slider
                value={[asr]}
                min={5}
                max={30}
                step={1}
                disabled={isViewer}
                onValueChange={(v) => setAsr(v[0] ?? asr)}
                aria-label="حداکثر ثانیه ورودی صوتی"
              />
              <div className="flex justify-between mt-2 text-label-sm font-label-sm text-outline">
                <span>۵ ثانیه</span>
                <span>۳۰ ثانیه</span>
              </div>
              <p className="text-label-sm font-label-sm text-outline mt-1.5">
                پیام صوتی مسافر پس از این مدت، خودکار قطع و پردازش می‌شود
              </p>
            </div>
            <div className="pt-2 border-t border-surface-container">
              <div className="flex items-center justify-between mb-3">
                <label className="text-label-lg font-label-lg text-on-surface">سرعت گوینده (TTS)</label>
                <span className="text-label-md font-label-md bg-surface-container text-primary font-bold px-2.5 py-1 rounded-lg font-mono" dir="ltr">
                  {faDecimal(tts)}x
                </span>
              </div>
              <Slider
                value={[tts]}
                min={0.5}
                max={2}
                step={0.1}
                disabled={isViewer}
                onValueChange={(v) => setTts(Math.round((v[0] ?? tts) * 10) / 10)}
                aria-label="سرعت گوینده"
              />
              <div className="flex justify-between mt-2 text-label-sm font-label-sm text-outline font-mono" dir="ltr">
                <span>0.5x</span>
                <span>2.0x</span>
              </div>
              <p className="text-label-sm font-label-sm text-outline mt-1.5">
                سرعت پخش اعلان‌های ایستگاه؛ مقدار پیشنهادی برای فضای پرجزئیات ۱x است
              </p>
            </div>
            <button
              onClick={saveLimits}
              disabled={isViewer || saving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container transition-all active:scale-[0.98] text-label-md font-label-md font-bold shadow-sm disabled:opacity-50 disabled:pointer-events-none"
            >
              <span className="material-symbols-outlined text-title-md">check_circle</span>
              <span>{saving ? "در حال ذخیره..." : "ذخیره محدودیت‌ها"}</span>
            </button>
          </div>
        </div>

        {/* ===== کارت ۴: وضعیت سرویس صوتی ===== */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-surface-container-high flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-xl">monitor_heart</span>
            </div>
            <div>
              <h2 className="text-title-lg font-title-lg text-on-surface font-bold">وضعیت سرویس صوتی</h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant">سلامت سرویس‌های زیرساختی از داشبورد نظارت</p>
            </div>
          </div>
          <div className="p-4 sm:p-6 space-y-3">
            {loading && (
              <p className="py-4 text-center text-body-md text-on-surface-variant">در حال دریافت وضعیت سرویس‌ها...</p>
            )}
            {!loading && services.length === 0 && (
              <p className="py-4 text-center text-body-md text-on-surface-variant">وضعیتی دریافت نشد</p>
            )}
            {services.map((s) => {
              const st = STATUS_LABEL[s.status] ?? STATUS_LABEL.HEALTHY;
              const isVoice = s.key === "voice";
              return (
                <div
                  key={s.key}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                    isVoice ? "border-primary bg-primary-fixed/20" : "border-outline-variant bg-surface"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-title-md ${isVoice ? "text-primary" : "text-outline"}`}>
                      {isVoice ? "record_voice_over" : s.key === "api" ? "dns" : "storage"}
                    </span>
                    <span className={`text-body-md font-body-md font-bold ${isVoice ? "text-primary" : "text-on-surface"}`}>
                      {s.name}
                    </span>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label-sm font-label-sm font-bold ${st.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    {st.text}
                  </span>
                </div>
              );
            })}
            <div className="pt-2 mt-1 border-t border-surface-container flex flex-wrap items-center justify-between gap-2 text-body-sm font-body-sm text-on-surface-variant">
              <span>مقادیر جاری پیکربندی صوتی:</span>
              <span className="flex items-center gap-2">
                <span className="bg-surface-container text-primary font-bold text-label-md px-2 py-0.5 rounded">
                  ورودی: {fa(asr)} ثانیه
                </span>
                <span className="bg-surface-container text-primary font-bold text-label-md px-2 py-0.5 rounded font-mono" dir="ltr">
                  {faDecimal(tts)}x
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
