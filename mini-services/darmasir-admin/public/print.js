/* ============================================================
   درمسیر — سند چاپی (فاکتور تبلیغات + صورت‌حساب دوره‌ای درآمد)
   دریافت داده از API پنل و رندر قالب A4 آماده چاپ / PDF
   ============================================================ */
"use strict";

const TOKEN_KEY = "darmasir_admin_token";
const API_BASE = location.pathname.includes("/admin/") ? "/admin/api/v1/" : "/api/v1/";

async function api(path) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error("ابتدا در پنل مدیریت وارد شوید، سپس سند را از داخل پنل باز کنید.");
  const res = await fetch(API_BASE + path, { headers: { Authorization: "Bearer " + token } });
  const json = await res.json().catch(() => null);
  if (!json || !json.ok) throw new Error((json && json.error && json.error.message) || "خطای دریافت اطلاعات سند");
  return json.data;
}

/* ---------------- ابزارها ---------------- */

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function faNum(n) {
  return Number(n || 0).toLocaleString("fa-IR");
}
function money(n) {
  return faNum(n) + " تومان";
}
function faDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("fa-IR"); } catch { return "—"; }
}
function faDateTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }); } catch { return "—"; }
}
function localDate(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/* مبلغ به حروف فارسی — برای فاکتور رسمی */
function numToFaWords(input) {
  const num = Math.floor(Math.abs(Number(input) || 0));
  const ones = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"];
  const tens = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
  const hundreds = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
  const scales = ["", " هزار", " میلیون", " میلیارد", " هزار میلیارد"];
  const three = (n) => {
    const parts = [];
    if (n >= 100) { parts.push(hundreds[Math.floor(n / 100)]); n %= 100; }
    if (n >= 20) { parts.push(tens[Math.floor(n / 10)]); n %= 10; if (n) parts.push(ones[n]); }
    else if (n > 0) parts.push(ones[n]);
    return parts.join(" و ");
  };
  if (num === 0) return "صفر تومان";
  let n = num, si = 0;
  const chunks = [];
  while (n > 0 && si < scales.length) {
    if (n % 1000) chunks.push(three(n % 1000) + scales[si]);
    n = Math.floor(n / 1000);
    si++;
  }
  return chunks.reverse().join(" و ").trim() + " تومان";
}

/* ---------------- قالب سربرگ ---------------- */

function docHead(title, subtitleLines, stampHtml = "") {
  return `
  <div class="doc-head">
    <div class="brand">
      <div class="brand-logo">د</div>
      <div><b>درمسیر</b><span>سامانه ناوبری شهری متروجو — ir.metrojo.app</span></div>
    </div>
    <div class="doc-title">
      <h1>${esc(title)}</h1>
      ${subtitleLines.map((l) => `<p>${l}</p>`).join("")}
      ${stampHtml}
    </div>
  </div>`;
}
function docFoot(note) {
  return `
  <div class="doc-foot">
    <span>${esc(note)}</span>
    <span>سند صادرشده به‌صورت الکترونیکی — درمسیر ${faDate(new Date().toISOString())}</span>
  </div>`;
}

/* ---------------- فاکتور تبلیغات ---------------- */

async function renderInvoice(id) {
  const v = await api(`invoices/${id}`);
  let items = [];
  try { items = JSON.parse(v.items || "[]"); } catch {}
  const sum = items.reduce((s, it) => s + (it.qty || 1) * (it.price || 0), 0);
  const total = v.total ?? Math.max(sum - (v.discount || 0), 0);
  const stamp =
    v.status === "paid"
      ? '<span class="stamp ok">پرداخت شده</span>'
      : v.status === "cancelled"
        ? '<span class="stamp warn">لغو شده</span>'
        : "";
  const rows = items.map((it, i) => `
    <tr>
      <td>${faNum(i + 1)}</td>
      <td class="r">${esc(it.desc)}</td>
      <td>${faNum(it.qty || 1)}</td>
      <td>${faNum(it.price || 0)}</td>
      <td>${faNum((it.qty || 1) * (it.price || 0))}</td>
    </tr>`).join("");
  document.getElementById("sheet").innerHTML = `
    ${docHead("فاکتور فروش خدمات تبلیغات", [
      `شماره فاکتور: <b>${esc(v.number)}</b>`,
      `تاریخ صدور: ${faDate(v.issue_date)}`,
    ], stamp)}
    <div class="meta-grid">
      <div class="meta-row"><span>مشتری / خریدار</span><b>${esc(v.customer_name)}</b></div>
      <div class="meta-row"><span>تلفن مشتری</span><b>${esc(v.customer_phone || "—")}</b></div>
      <div class="meta-row"><span>موضوع</span><b>${esc(v.title || "خدمات تبلیغات")}</b></div>
      <div class="meta-row"><span>سررسید پرداخت</span><b>${faDate(v.due_date)}</b></div>
    </div>
    <table class="items">
      <thead><tr><th style="width:34px">ردیف</th><th style="width:46%">شرح خدمت تبلیغاتی</th><th>تعداد</th><th>مبلغ واحد (تومان)</th><th>مبلغ کل (تومان)</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">قلمی ثبت نشده است</td></tr>'}</tbody>
      <tfoot><tr><td colspan="4">جمع کل اقلام</td><td>${faNum(sum)}</td></tr></tfoot>
    </table>
    <div class="totals">
      <div class="totals-box">
        <div class="trow"><span>جمع کل</span><b>${money(sum)}</b></div>
        <div class="trow"><span>تخفیف</span><b>${money(v.discount || 0)}</b></div>
        <div class="trow"><span>مبلغ قابل پرداخت</span><b>${money(total)}</b></div>
      </div>
    </div>
    <div class="words"><b>مبلغ به حروف:</b> ${numToFaWords(total)}</div>
    ${v.notes ? `<div class="notes"><b>یادداشت:</b> ${esc(v.notes)}</div>` : ""}
    <div class="signs"><div>امضای و مهر فروشنده (درمسیر)</div><div>امضای مشتری</div></div>
    ${docFoot("این فاکتور به‌صورت الکترونیکی از پنل مدیریت درمسیر صادر شده است.")}`;
}

/* ---------------- صورت‌حساب دوره‌ای درآمد ---------------- */

async function renderStatement(from, to) {
  const d = await api(`revenues/statement?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const payRows = d.payments.map((p) => `
    <tr>
      <td>${faDate(p.paid_at)}</td>
      <td class="r">${esc(p.rev_title)}${p.contract_no ? ` <small style="color:var(--ink3)">(قرارداد ${esc(p.contract_no)})</small>` : ""}</td>
      <td class="r">${esc(p.org_name)}</td>
      <td>${esc(p.method || "—")}</td>
      <td>${esc(p.reference || "—")}</td>
      <td><b>${faNum(p.amount)}</b></td>
    </tr>`).join("");
  const settledRows = d.settled.map((r) => `
    <tr>
      <td class="r">${esc(r.title)}</td>
      <td class="r">${esc(r.org_name)}</td>
      <td>${faDate(r.last_payment)}</td>
      <td><b>${faNum(r.amount)}</b></td>
    </tr>`).join("");
  document.getElementById("sheet").innerHTML = `
    ${docHead("صورت‌حساب درآمد دوره‌ای", [
      `بازه گزارش: از ${faDate(from)} تا ${faDate(to)}`,
      `تاریخ تهیه: ${faDate(new Date().toISOString())}`,
    ])}
    <div class="sum-cards">
      <div class="sum-card"><b>${money(d.totals.paid)}</b><span>مجموع وجوه وصول‌شده در این بازه</span></div>
      <div class="sum-card"><b>${faNum(d.totals.count)}</b><span>تعداد پرداخت ثبت‌شده</span></div>
      <div class="sum-card"><b>${faNum(d.totals.orgs)}</b><span>تعداد سازمان‌ها / شرکت‌ها</span></div>
    </div>
    <table class="items">
      <thead><tr><th style="width:90px">تاریخ</th><th style="width:30%">قرارداد</th><th style="width:20%">سازمان</th><th>نحوه پرداخت</th><th>شماره پیگیری</th><th>مبلغ (تومان)</th></tr></thead>
      <tbody>${payRows || '<tr><td colspan="6">در این بازه پرداختی ثبت نشده است</td></tr>'}</tbody>
      <tfoot><tr><td colspan="5">مجموع وصولی بازه</td><td>${faNum(d.totals.paid)}</td></tr></tfoot>
    </table>
    ${d.settled.length ? `
      <h3 style="font-size:14px; color:var(--primary); margin:18px 0 6px">قراردادهای تسویه‌شده در این بازه (${faNum(d.totals.settled)} قرارداد)</h3>
      <table class="items">
        <thead><tr><th style="width:38%">قرارداد</th><th style="width:26%">سازمان</th><th>تاریخ تسویه</th><th>مبلغ کل قرارداد (تومان)</th></tr></thead>
        <tbody>${settledRows}</tbody>
      </table>` : ""}
    <div class="words"><b>جمع وصولی به حروف:</b> ${numToFaWords(d.totals.paid)}</div>
    ${docFoot("این صورت‌حساب به‌صورت الکترونیکی از پنل مدیریت درمسیر تهیه شده است.")}`;
}

/* ---------------- شروع ---------------- */

(async () => {
  const sheet = document.getElementById("sheet");
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") || "";
  try {
    if (mode === "invoice") {
      const id = Number(params.get("id")) || 0;
      if (!id) throw new Error("شناسه فاکتور مشخص نیست");
      await renderInvoice(id);
    } else if (mode === "statement") {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(params.get("from") || "") ? params.get("from") : "0000-01-01";
      const to = /^\d{4}-\d{2}-\d{2}$/.test(params.get("to") || "") ? params.get("to") : localDate(new Date());
      await renderStatement(from, to);
    } else {
      throw new Error("نوع سند مشخص نیست — از داخل پنل استفاده کنید");
    }
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    /* پارامتر noprint=1 برای پیش‌نمایش بدون باز شدن پنجره چاپ */
    if (!params.has("noprint")) setTimeout(() => window.print(), 400);
  } catch (ex) {
    sheet.innerHTML = `<div class="loading">${esc(ex.message)}</div>`;
  }
})();
