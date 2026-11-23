/* ============================================================
   پنل مدیریت درمسیر — اپلیکیشن تک‌صفحه‌ای فارسی RTL
   نسخه ۲.۹.۱ — محافظ ضد ناپدیدشدن ردیف‌ها + هم‌اندازه‌سازی ستون‌های صفحه امنیت + جلوگیری از پنهان‌شدن لیست مدیران (جستجوی باقی‌مانده/autofill)
   ============================================================ */
"use strict";

const PORT = 3035;
const TOKEN_KEY = "darmasir_admin_token";
const ADMIN_KEY = "darmasir_admin_me";

/* دسترسی از مسیر تمیز /admin/ یا مستقیم با ?XTransformPort=3035 */
const ASSET_P = location.pathname.indexOf("/admin") === 0 ? "/admin/" : "";
const API_BASE = ASSET_P ? "/admin/api/v1/" : "/api/v1/";
const API_Q = window.__ASSET_Q || "";

function apiPath(path) {
  if (!API_Q) return API_BASE + path;
  return API_BASE + path + (path.includes("?") ? API_Q.replace("?", "&") : API_Q);
}

/* ---------------- ابزار پایه ---------------- */

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function faTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
  } catch { return "—"; }
}

function faNum(n) {
  return Number(n || 0).toLocaleString("fa-IR");
}

function faDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("fa-IR"); } catch { return "—"; }
}

function faMoney(n) {
  return faNum(n) + " تومان";
}

/* نمایش خلاصه مبلغ برای شاخص‌ها — میلیارد / میلیون / هزار */
function faMoneyShort(n) {
  n = Number(n || 0);
  if (n >= 1e9) return (n / 1e9).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + " میلیارد تومان";
  if (n >= 1e6) return (n / 1e6).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + " میلیون تومان";
  if (n >= 1e3) return (n / 1e3).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + " هزار تومان";
  return faNum(n) + " تومان";
}

function localDate(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function todayLocal() {
  return localDate(new Date());
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiPath(path), {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  /* حالت raw: پاسخ باینری (مثلاً mp3 تست صدا) مستقیم برمی‌گردد */
  if (opts.raw) {
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error(j?.error?.message || "خطای ناشناخته");
    }
    return res;
  }
  const json = await res.json().catch(() => ({ ok: false, error: { code: "PARSE", message: "پاسخ نامعتبر سرور" } }));
  if (!json.ok) {
    if (res.status === 401 && !path.startsWith("auth/")) { logoutLocal(); throw new Error(json.error?.message || "نشست منقضی شده"); }
    throw new Error(json.error?.message || "خطای ناشناخته");
  }
  return json.data;
}

function toast(msg, type = "") {
  const host = document.getElementById("toast-host");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 2600);
}

function modal(title, bodyHtml, footHtml) {
  const host = document.getElementById("modal-host");
  host.innerHTML = `
    <div class="modal-back" id="modal-back">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="modal-x" id="modal-x" aria-label="بستن">×</button></div>
        <div class="modal-body">${bodyHtml}</div>
        ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ""}
      </div>
    </div>`;
  const close = () => { host.innerHTML = ""; };
  document.getElementById("modal-x").onclick = close;
  document.getElementById("modal-back").onclick = (e) => { if (e.target.id === "modal-back") close(); };
  return close;
}

function confirmDialog(msg, onYes) {
  const close = modal("تأیید عملیات", `<p style="margin:0">${esc(msg)}</p>`,
    `<button class="btn" id="c-no">انصراف</button><button class="btn btn-danger" id="c-yes">تأیید و ادامه</button>`);
  document.getElementById("c-no").onclick = close;
  document.getElementById("c-yes").onclick = async () => { close(); await onYes(); };
}

function closeModal() { document.getElementById("modal-host").innerHTML = ""; }

function logoutLocal() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADMIN_KEY);
  location.hash = "#/login";
  render();
}

/* خروجی CSV با BOM برای سازگاری اکسل فارسی */
function csvExport(filename, headers, rows) {
  const line = (arr) => arr.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
  const csv = "\uFEFF" + line(headers) + "\r\n" + rows.map(line).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv; charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("فایل CSV دانلود شد", "ok2");
}

/* ---------------- وضعیت ---------------- */

let me = null;
try { me = JSON.parse(localStorage.getItem(ADMIN_KEY) || "null"); } catch {}

const ROLE_LABEL = { super: "مدیر کل", operator: "اپراتور", viewer: "ناظر" };
const STATUS_LABEL = { active: ["فعال", "ok"], limited: ["محدود", "warn"], disabled: ["غیرفعال", "bad"], blocked: ["مسدود", "bad"] };
const MODE_LABEL = { metro: "مترو", bus: "اتوبوس", brt: "اتوبوس تندرو" };
const PLACE_LABEL = { home: "خانه — بالای صفحه", home_bottom: "خانه — پایین صفحه", lines: "صفحه خطوط", status: "صفحه وضعیت", settings: "صفحه تنظیمات", saved: "صفحه ذخیره‌ها", map: "نقشه", plan: "مسیریابی", station: "جزئیات ایستگاه", line: "جزئیات خط", splash: "صفحه اسپلش", drawer: "منوی کناری" };

const can = (role) => me && ({ viewer: 1, operator: 2, super: 3 }[me.role] ?? 0) >= ({ viewer: 1, operator: 2, super: 3 }[role] ?? 9);

/* ---------------- اجزای مشترک طراحی مترویار ---------------- */

function pageHead(title, desc, actionsHtml = "") {
  return `
  <div class="page-head">
    <div class="page-head-txt">
      <div class="page-head-row">
        <h1>${esc(title)}</h1>
        <span class="chip-live"><span class="dot-live"></span>سامانه فعال و همگام با کلاینت</span>
      </div>
      ${desc ? `<p>${esc(desc)}</p>` : ""}
    </div>
    ${actionsHtml ? `<div class="page-head-actions">${actionsHtml}</div>` : ""}
  </div>`;
}

function kpi(label, icon, num, sub, tone = "t-primary") {
  const isNum = typeof num === "number" || /^\d+$/.test(String(num ?? ""));
  const numHtml = isNum ? Number(num || 0).toLocaleString("fa-IR") : esc(String(num ?? "—"));
  return `
  <div class="card kpi">
    <div class="kpi-top"><span class="kpi-lbl">${esc(label)}</span><div class="kpi-icon ${tone}"><span class="material">${icon}</span></div></div>
    <div class="kpi-num">${numHtml}</div>
    <div class="kpi-sub"><span class="material">trending_up</span><span>${esc(sub)}</span></div>
  </div>`;
}

function filterTables(q) {
  document.querySelectorAll("table.tbl tbody").forEach((tb) => {
    let any = false;
    tb.querySelectorAll("tr").forEach((tr) => {
      if (tr.dataset.emptyHint) return;
      const show = !q || tr.textContent.includes(q);
      tr.style.display = show ? "" : "none";
      if (show) any = true;
    });
    /* وقتی جستجو همه‌ی ردیف‌ها را پنهان می‌کند، پیام روشن نمایش داده می‌شود
       تا «ناپدید شدن» لیست‌ها گمراه‌کننده نباشد */
    let hint = tb.querySelector("tr[data-empty-hint]");
    if (!any && q) {
      if (!hint) {
        hint = document.createElement("tr");
        hint.dataset.emptyHint = "1";
        hint.innerHTML = '<td colspan="9" class="empty" style="text-align:center;color:var(--ink-2);padding:14px">موردی مطابق جستجو یافت نشد — عبارت جستجو را پاک کنید</td>';
        tb.appendChild(hint);
      }
      hint.style.display = "";
    } else if (hint) {
      hint.style.display = "none";
    }
  });
}

/* ---------- محافظ ردیف‌های جدول — ضد «ناپدید شدن» لیست‌ها ----------
   هر مکانیزمی (autofill مرورگر، افزونه‌ها، مقدار باقی‌مانده جستجو،
   هر کد ناشناخته) که ردیف‌ها را وقتی جستجو خالی است پنهان کند،
   بلافاصله خنثی می‌شود: در هر کلیک، بعد از هر رندر، روی هر تغییر DOM
   و به‌صورت دوره‌ای هر ۱.۵ ثانیه. */
function guardTables() {
  const ts = document.getElementById("top-search");
  if (ts && ts.value.trim()) return; /* جستجوی فعال — فیلتر قانونی است */
  document.querySelectorAll("table.tbl tbody tr").forEach((tr) => {
    if (tr.dataset.emptyHint) return; /* ردیف راهنمای «یافت نشد» از محافظ مستثناست */
    if (tr.style.display === "none") tr.style.display = "";
  });
}
let __tblObs = null;
function armTableGuard() {
  if (__tblObs) __tblObs.disconnect();
  try {
    __tblObs = new MutationObserver(() => guardTables());
    document.querySelectorAll("table.tbl tbody").forEach((tb) =>
      __tblObs.observe(tb, { attributes: true, attributeFilter: ["style"], subtree: true, childList: true })
    );
  } catch {}
}
setInterval(guardTables, 1500);

/* ---------------- مسیریابی ---------------- */

const PAGES = [
  { id: "dashboard", title: "داشبورد مدیریتی", icon: "dashboard" },
  { id: "users", title: "کاربران", icon: "group" },
  { id: "cities", title: "شهرها", icon: "location_city" },
  { id: "lines", title: "خطوط", icon: "alt_route" },
  { id: "stations", title: "ایستگاه‌ها", icon: "location_on" },
  { id: "ads", title: "تبلیغات و بنرها", icon: "campaign" },
  { id: "travel", title: "مدهای سفر", icon: "commute" },
  { id: "tickets", title: "تیکت‌ها", icon: "confirmation_number" },
  { id: "about-content", title: "درباره ما (اپ)", icon: "info" },
  { id: "contact-content", title: "تماس با ما (اپ)", icon: "support_agent" },
  { id: "revenues", title: "درآمدها و قراردادها", icon: "payments" },
  { id: "invoices", title: "فاکتور تبلیغات", icon: "receipt_long" },
  { id: "voice", title: "دستیار صوتی", icon: "record_voice_over" },
  { id: "settings", title: "تنظیمات سامانه", icon: "settings", super: true },
  { id: "reports", title: "گزارش‌ها و تحلیل داده", icon: "monitoring" },
  { id: "security", title: "امنیت و وقایع‌نگاری", icon: "security", super: true },
];

function currentPage() {
  const h = location.hash.replace(/^#\//, "") || "dashboard";
  return PAGES.find((p) => p.id === h)?.id ?? "dashboard";
}

/* ---------------- رندر ---------------- */

function render() {
  const app = document.getElementById("app");
  if (!location.hash.startsWith("#/")) location.hash = "#/login";
  const page = location.hash.replace(/^#\//, "") || "login";
  if (!localStorage.getItem(TOKEN_KEY) || page === "login") {
    if (me && localStorage.getItem(TOKEN_KEY) && page === "login") { location.hash = "#/dashboard"; }
    app.innerHTML = loginView();
    bindLogin();
    return;
  }
  if (!me) { logoutLocal(); return; }
  const cur = PAGES.find((p) => p.id === currentPage()) ?? PAGES[0];
  if (cur.super && me.role !== "super") { location.hash = "#/dashboard"; return; }
  app.innerHTML = layout(cur);
  /* آیتم فعال منو همیشه کامل در دید باشد (سایدبار در نمایش‌های کوتاه اسکرول می‌خورد) */
  document.querySelector(".nav a.active")?.scrollIntoView({ block: "nearest" });
  document.getElementById("logout-btn").onclick = async () => {
    try { await api("auth/logout", { method: "POST" }); } catch {}
    logoutLocal();
  };
  const burger = document.getElementById("burger");
  const sidebar = document.getElementById("sidebar");
  burger.onclick = () => {
    const open = sidebar.classList.toggle("open");
    document.querySelectorAll(".sidebar-back").forEach((x) => x.remove());
    if (open) {
      const back = document.createElement("div");
      back.className = "sidebar-back";
      document.body.appendChild(back);
    }
  };
  /* شنونده کلیک سطح سند — فقط یک‌بار بسته می‌شود و همیشه سایدبارِ جاری را
     می‌گیرد (قبلاً روی هر رندر یک شنونده‌ی تازه اضافه می‌شد که انباشت می‌کرد) */
  if (!document.documentElement.dataset.sidebarBound) {
    document.documentElement.dataset.sidebarBound = "1";
    document.addEventListener("click", function (e) {
      const sb = document.getElementById("sidebar");
      const bg = document.getElementById("burger");
      if (sb && sb.classList.contains("open") && !sb.contains(e.target) && !(bg && (bg === e.target || bg.contains(e.target)))) {
        sb.classList.remove("open");
        document.querySelectorAll(".sidebar-back").forEach((x) => x.remove());
      }
      guardTables(); /* هر کلیک — ردیف‌های پنهانِ بدون فیلتر برگردانده می‌شوند */
    });
  }
  const ts = document.getElementById("top-search");
  if (ts) {
    /* جستجو در هر ورود به صفحه تازه می‌شود — مقدار باقی‌مانده‌ی مرورگر
       (autofill/restore) هرگز نباید ردیف‌های جدول‌ها را پنهان کند */
    ts.value = "";
    ts.oninput = () => filterTables(ts.value.trim());
    ts.onkeydown = (e) => { if (e.key === "Escape") { ts.value = ""; filterTables(""); } };
  }
  renderPage(cur.id);
}

function loginView() {
  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-logo"><img src="${ASSET_P}metrojo-logo.svg${API_Q}" alt="لوگوی درمسیر" /></div>
      <h1>پنل مدیریت درمسیر</h1>
      <p class="sub">دستیار هوشمند سفر شهری — ورود مدیران</p>
      <div class="login-err" id="login-err"></div>
      <form id="login-form">
        <div class="field"><label for="u">نام کاربری</label><input id="u" name="username" autocomplete="username" required placeholder="admin" /></div>
        <div class="field"><label for="p">گذرواژه</label><input id="p" name="password" type="password" autocomplete="current-password" required placeholder="••••••••" /></div>
        <button class="btn btn-primary" style="width:100%; min-height:44px" type="submit"><span class="material">login</span><span>ورود به پنل</span></button>
      </form>
    </div>
  </div>`;
}

function bindLogin() {
  const form = document.getElementById("login-form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById("login-err");
    err.style.display = "none";
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "در حال ورود…";
    try {
      const data = await api("auth/login", {
        method: "POST",
        body: { username: form.username.value.trim(), password: form.password.value },
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(ADMIN_KEY, JSON.stringify(data.admin));
      me = data.admin;
      toast("خوش آمدید، " + data.admin.display_name, "ok2");
      location.hash = "#/dashboard";
      render();
    } catch (ex) {
      err.textContent = ex.message;
      err.style.display = "block";
    } finally {
      btn.disabled = false; btn.textContent = "ورود به پنل";
    }
  };
}

function layout(cur) {
  const nav = PAGES.filter((p) => !p.super || me.role === "super")
    .map((p) => `<a href="#/${p.id}" class="${p.id === cur.id ? "active" : ""}"><span class="material ${p.id === cur.id ? "fill" : ""}">${p.icon}</span><span class="nav-lbl">${p.title}</span>${p.id === cur.id ? '<span class="nav-live"></span>' : ""}</a>`)
    .join("");
  return `
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="side-scroll">
        <div class="brand">
          <div class="brand-logo"><img src="${ASSET_P}metrojo-logo.svg${API_Q}" alt="لوگوی درمسیر" /></div>
          <div class="brand-txt">
            <div class="brand-title-row"><b>درمسیر</b><span class="ver-chip">نسخه ۲.۹.۱</span></div>
            <span class="brand-sub">پنل مدیریت سامانه ناوبری شهری</span>
          </div>
        </div>
        <nav class="nav" aria-label="ناوبری پنل">${nav}</nav>
      </div>
      <div class="side-foot">
        <div class="side-user">
          <div class="avatar" aria-hidden="true">${esc((me.display_name || "?").slice(0, 1))}</div>
          <div class="who"><b>${esc(me.display_name)}</b><span>${ROLE_LABEL[me.role] || me.role} — ${esc(me.username || "")}</span></div>
        </div>
        <div class="side-meta"><span class="material">database</span><span>پایگاه داده محلی فعال</span></div>
        <button class="logout-btn" id="logout-btn"><span class="material">logout</span><span>خروج از حساب</span></button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="burger" id="burger" aria-label="منو"><span class="material">menu</span></button>
        <div class="top-search">
          <span class="material">search</span>
          <input id="top-search" type="search" autocomplete="off" placeholder="جستجو در جدول‌های این صفحه…" aria-label="جستجو در صفحه" />
        </div>
        <span class="spacer"></span>
        <div class="db-chip"><span class="pulse"></span><span>اتصال پایگاه داده فعال</span></div>
      </header>
      <main class="content" id="page-content"><div class="empty"><span class="material">hourglass_empty</span>در حال بارگذاری…</div></main>
    </div>
  </div>`;
}

async function renderPage(id) {
  const host = document.getElementById("page-content");
  try {
    if (id === "dashboard") await pageDashboard(host);
    else if (id === "users") await pageUsers(host);
    else if (id === "cities") await pageCities(host);
    else if (id === "lines") await pageLines(host);
    else if (id === "stations") await pageStations(host);
    else if (id === "ads") await pageAds(host);
    else if (id === "travel") await pageTravel(host);
    else if (id === "tickets") await pageTickets(host);
    else if (id === "about-content") await pageAboutContent(host);
    else if (id === "contact-content") await pageContactContent(host);
    else if (id === "revenues") await pageRevenues(host);
    else if (id === "invoices") await pageInvoices(host);
    else if (id === "voice") await pageVoice(host);
    else if (id === "settings") await pageSettings(host);
    else if (id === "reports") await pageReports(host);
    else if (id === "security") await pageSecurity(host);
  } catch (ex) {
    host.innerHTML = `<div class="card"><div class="empty">${esc(ex.message)}</div></div>`;
  }
  armTableGuard();
}

/* ---------------- صفحات ---------------- */

async function pageDashboard(host) {
  const d = await api("dashboard");
  const maxApi = Math.max(...d.api_last7.map((x) => x.count), 1);
  host.innerHTML = `
    ${pageHead("داشبورد مدیریتی", "نمای کلی آمار کاربران، سفرها، تبلیغات و وضعیت سرویس‌های درمسیر")}
    <div class="kpi-grid kpi-grid-5">
      ${kpi("کل کاربران", "group", d.users_total, "کاربر ثبت‌شده در سامانه", "t-primary")}
      ${kpi("کاربران فعال", "trending_up", d.users_active, "کاربر با نشست اخیر", "t-tertiary")}
      ${kpi("سفرهای ثبت‌شده", "route", d.trips_total, "از ابتدا تا امروز", "t-surface")}
      ${kpi("تبلیغ فعال", "campaign", d.ads_active, "کمپین در حال نمایش", "t-dim")}
      ${kpi("شهرهای تحت پوشش", "location_city", d.cities_total ?? 0, "شهر با شبکه فعال", "t-primary")}
    </div>
    <div class="kpi-grid kpi-grid-4">
      ${kpi("درآمد قراردادها", "payments", faMoneyShort(d.revenues_total ?? 0), `${faNum(d.revenues_count ?? 0)} قرارداد سازمانی`, "t-primary")}
      ${kpi("وصول‌شده", "savings", faMoneyShort(d.revenues_paid ?? 0), "مجموع پرداخت‌های ثبت‌شده", "t-tertiary")}
      ${kpi("در انتظار وصول", "hourglass_top", faMoneyShort((d.revenues_total ?? 0) - (d.revenues_paid ?? 0)), "مانده قراردادها", "t-dim")}
      ${kpi("فاکتور تبلیغات", "receipt_long", faNum(d.invoices_count ?? 0), `${faNum(d.invoices_paid ?? 0)} فاکتور پرداخت‌شده`, "t-surface")}
    </div>
    <div class="kpi-grid kpi-grid-3">
      ${kpi("خط فعال", "alt_route", d.lines_active, "خط در حال سرویس‌دهی", "t-primary")}
      ${kpi("ایستگاه", "location_on", d.stations_total, "ایستگاه ثبت‌شده در پایگاه داده", "t-surface")}
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">dns</span>وضعیت سرویس‌ها</h3>
        ${d.services.map((s) => `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:7px 0; border-bottom:1px solid rgba(192,212,203,.35)">
            <div><b style="font-size:13px">${esc(s.name)}</b><div style="font-size:11px;color:var(--ink-3)">${esc(s.note || "")}</div></div>
            <span class="badge ${s.status === "ok" ? "ok" : "off"}">${s.status === "ok" ? "برقرار" : "غیرفعال"}</span>
          </div>`).join("")}
      </div>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">monitoring</span>درخواست‌های API — ۷ روز اخیر</h3>
        <div class="bars">
          ${d.api_last7.map((x) => `
            <div class="bar-col">
              <span class="bar-val">${x.count || ""}</span>
              <div class="bar" style="height:${Math.round((x.count / maxApi) * 100)}%"></div>
              <span class="bar-day">${x.day.slice(5).replace("-", "/")}</span>
            </div>`).join("")}
        </div>
      </div>
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">history</span>آخرین فعالیت مدیران</h3>
        <div class="feed">
          ${d.audit_recent.length ? d.audit_recent.map((a) => `
            <div class="feed-item">
              <span class="fi-dot"></span>
              <div class="fi-body"><b>${esc(actionLabel(a.action))}</b><p>${esc(a.admin_name)}${a.details ? " — " + esc(a.details) : ""}</p></div>
              <span class="fi-time">${faTime(a.created_at)}</span>
            </div>`).join("") : `<div class="empty"><span class="material">inbox</span>فعالیتی ثبت نشده است</div>`}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3><span class="material" style="color:var(--primary)">payments</span>پرداخت‌های اخیر درآمد</h3>
      <div class="feed">
        ${(d.recent_payments || []).length ? (d.recent_payments || []).map((p) => `
          <div class="feed-item">
            <span class="fi-dot" style="background:var(--tertiary-container)"></span>
            <div class="fi-body"><b>${esc(p.org_name)}</b><p>${esc(p.title)} — ${faMoney(p.amount)}${p.method ? " · " + esc(p.method) : ""}</p></div>
            <span class="fi-time">${faTime(p.paid_at)}</span>
          </div>`).join("") : `<div class="empty"><span class="material">payments</span>هنوز پرداختی از قراردادها ثبت نشده است</div>`}
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3><span class="material" style="color:var(--primary)">location_city</span>پوشش شهرها — خطوط و ایستگاه‌های فعال به تفکیک شهر</h3>
      ${(d.lines_by_city || []).length ? (() => {
        const maxSt = Math.max(...(d.lines_by_city || []).map((c) => c.stations || 0), 1);
        return `
        <div class="city-coverage">
          ${(d.lines_by_city || []).map((c) => `
            <div class="cc-row">
              <div class="cc-head">
                <span class="cc-city"><span class="material">location_city</span>${esc(c.city)}</span>
                <span class="cc-nums"><span class="badge info">${faNum(c.lines)} خط فعال</span><span class="badge ok">${faNum(c.stations)} ایستگاه</span></span>
              </div>
              <div class="meter"><div class="meter-fill" style="width:${Math.max(Math.round(((c.stations || 0) / maxSt) * 100), 3)}%"></div></div>
            </div>`).join("")}
        </div>`;
      })() : `<div class="empty"><span class="material">location_city</span>هنوز شهری ثبت نشده است</div>`}
    </div>`;
}

function actionLabel(a) {
  return {
    login: "ورود به پنل", login_failed: "ورود ناموفق", logout: "خروج",
    password_change: "تغییر گذرواژه", session_revoke: "ابطال نشست",
    user_create: "ایجاد کاربر", user_update: "ویرایش کاربر", user_delete: "حذف کاربر", user_bulk_status: "تغییر گروهی وضعیت کاربران",
    line_create: "ایجاد خط", line_update: "ویرایش خط", line_delete: "حذف خط",
    city_create: "ایجاد شهر", city_update: "ویرایش شهر", city_delete: "حذف شهر",
    station_create: "ایجاد ایستگاه", station_update: "ویرایش ایستگاه", station_delete: "حذف ایستگاه", station_bulk: "افزودن گروهی ایستگاه",
    ad_create: "ایجاد تبلیغ", ad_update: "ویرایش تبلیغ", ad_delete: "حذف تبلیغ",
    ad_bulk_activate: "فعال‌سازی گروهی تبلیغات", ad_bulk_deactivate: "غیرفعال‌سازی گروهی تبلیغات", ad_bulk_delete: "حذف گروهی تبلیغات",
    ad_reset_stats: "بازنشانی آمار تبلیغ",
    lexicon_create: "افزودن مدخل تلفظ", lexicon_import: "درون‌ریزی ایستگاه‌ها به فرهنگ",
    settings_update: "بروزرسانی تنظیمات",
    revenue_create: "ثبت قرارداد درآمد", revenue_update: "ویرایش قرارداد درآمد", revenue_delete: "حذف قرارداد درآمد",
    revenue_payment: "ثبت پرداخت درآمد", revenue_payment_delete: "حذف پرداخت درآمد",
    revenue_doc: "آپلود مستند قرارداد", revenue_doc_delete: "حذف مستند قرارداد",
    invoice_create: "صدور فاکتور", invoice_update: "ویرایش فاکتور", invoice_delete: "حذف فاکتور", invoice_status: "تغییر وضعیت فاکتور",
    admin_create: "ایجاد مدیر", admin_update: "ویرایش مدیر", admin_delete: "حذف مدیر",
  }[a] || a;
}

/* ---------- کاربران ---------- */

async function pageUsers(host) {
  const writable = can("operator");
  host.innerHTML = `
    ${pageHead("کاربران", "کاربران واقعی اپ درمسیر — مستقیم از دیتابیس ابری اپ (Cloudflare D1). مسدودسازی، تنظیم رمز و حذف واقعی همین‌جا روی دیتابیس انجام می‌شود.",
      `<button class="btn" id="u-refresh"><span class="material">refresh</span><span>بروزرسانی</span></button>
       <button class="btn" id="u-csv"><span class="material">download</span><span>خروجی CSV</span></button>`)}
    <div class="toolbar">
      <input id="u-q" placeholder="جست‌وجوی نام، شماره یا ایمیل…" style="min-width:240px" />
      <select id="u-status">
        <option value="">همه وضعیت‌ها</option>
        <option value="active">فعال</option>
        <option value="blocked">مسدود</option>
      </select>
      <span class="hint" id="u-src">منبع: دیتابیس واقعی اپ</span>
    </div>
    <div id="u-table"></div>`;
  let lastRows = [];
  const load = async () => {
    const qEl = document.getElementById("u-q");
    if (!qEl) return;
    const q = qEl.value.trim();
    const stEl = document.getElementById("u-status");
    const st = stEl ? stEl.value : "";
    const table = document.getElementById("u-table");
    const src = document.getElementById("u-src");
    try {
      const d = await api(`users/cloud?q=${encodeURIComponent(q)}`);
      let rows = d.users || [];
      if (st) rows = rows.filter((u) => u.status === st);
      lastRows = rows;
      if (src) src.textContent = `${faNum(rows.length)} کاربر واقعی — دیتابیس Turso اپ`;
      if (!table) return;
      table.innerHTML = rows.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>نام</th><th>تماس</th><th>وضعیت</th><th>فعالیت واقعی</th><th>نشست فعال</th><th>رمز</th><th>عضویت</th><th>آخرین ورود</th><th>عملیات</th></tr></thead>
        <tbody>
          ${rows.map((u) => {
            const [lbl, cls] = STATUS_LABEL[u.status] || [u.status, "off"];
            const isBlocked = u.status === "blocked";
            const ident = u.phone || u.email || "";
            const act = (u.trips || 0) + (u.favorites || 0) + (u.daily_routes || 0);
            return `<tr>
              <td><b>${esc(u.name)}</b></td>
              <td>${esc(u.phone || u.email || "—")}</td>
              <td><span class="badge ${cls}">${lbl}</span></td>
              <td>${act > 0 ? `<button class="icon-btn" data-act="${esc(u.id)}" title="مشاهده سفرها، علاقه‌مندی‌ها و مسیرهای روزمره این کاربر"><span class="badge ok">سفر ${faNum(u.trips || 0)}</span> <span class="badge ok">نشان ${faNum(u.favorites || 0)}</span> <span class="badge ok">مسیر ${faNum(u.daily_routes || 0)}</span></button>` : `<span class="hint">بدون فعالیت ثبت‌شده</span>`}</td>
              <td>${faNum(u.sessions)}</td>
              <td>${u.has_password ? `<span class="badge ok">دارد</span>` : `<span class="badge off">ندارد</span>`}</td>
              <td>${faTime(u.created_at)}</td>
              <td>${u.last_login_at ? faTime(u.last_login_at) : "—"}</td>
              <td><div class="acts">
                ${writable && u.phone ? `<button class="icon-btn" data-otp="${esc(u.id)}" title="کد پیامکی ارسالی"><span class="material">sms</span></button>` : ""}
                ${ident ? `<button class="icon-btn" data-act="${esc(u.id)}" title="سفرها، علاقه‌مندی‌ها و مسیرهای روزمره کاربر"><span class="material">insights</span></button>` : ""}
                ${writable && ident ? `<button class="icon-btn" data-pass="${esc(u.id)}" title="تنظیم رمز عبور کاربر"><span class="material">key</span></button>
                <button class="icon-btn ${isBlocked ? "" : "danger"}" data-block="${esc(u.id)}" title="${isBlocked ? "رفع مسدودی کاربر (واقعی)" : "مسدودسازی کاربر (واقعی)"}"><span class="material">${isBlocked ? "lock_open" : "block"}</span></button>` : ""}
                ${writable ? `<button class="icon-btn danger" data-del="${esc(u.id)}" data-name="${esc(u.name)}" title="حذف واقعی از دیتابیس — برگشت‌ناپذیر"><span class="material">delete</span></button>` : ""}
              </div></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>
      <p class="hint" style="margin-top:10px">مسدودسازی = تغییر وضعیت در دیتابیس + ابطال همه نشست‌های فعال (خروج اجباری فوری). حذف = پاک شدن واقعی رکورد کاربر، نشست‌ها و کدهای پیامکی از دیتابیس — برگشت‌ناپذیر. ستون «فعالیت واقعی» از جداول سفر/علاقه‌مندی/مسیر روزمره همان دیتابیس ابری می‌آید — هر کاری کاربر در اپ اندروید انجام دهد اینجا دیده می‌شود.</p>`
        : `<div class="card"><div class="empty"><span class="material">group_off</span>کاربری در دیتابیس اپ یافت نشد${q ? " — عبارت جست‌وجو را تغییر دهید" : ""}</div></div>`;
      /* مشاهده فعالیت کاربر — برای همه نقش‌ها (فقط خواندنی) */
      document.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => openUserActivity(lastRows.find((x) => x.id === b.dataset.act))));
      if (writable) {
        document.querySelectorAll("[data-otp]").forEach((b) => (b.onclick = () => openUserOtp(lastRows.find((x) => x.id === b.dataset.otp))));
        document.querySelectorAll("[data-pass]").forEach((b) => (b.onclick = () => openUserPassword(lastRows.find((x) => x.id === b.dataset.pass), load)));
        document.querySelectorAll("[data-block]").forEach((b) => (b.onclick = () => {
          const u = lastRows.find((x) => x.id === b.dataset.block);
          if (!u) return;
          const isBlocked = u.status === "blocked";
          const ident = u.phone || u.email;
          if (!ident) { toast("این کاربر شماره یا ایمیل ندارد", "err"); return; }
          confirmDialog(
            isBlocked
              ? `مسدودی کاربر «${u.name}» از دیتابیس برداشته شود؟ کاربر می‌تواند دوباره وارد اپ شود.`
              : `کاربر «${u.name}» در دیتابیس مسدود شود؟ همه نشست‌های فعال او بلافاصله باطل و ورود با رمز یا کد پیامکی رد می‌شود.`,
            async () => {
              try {
                await api("users/status", { method: "POST", body: { phone: ident, status: isBlocked ? "active" : "blocked" } });
                toast(isBlocked ? "مسدودی کاربر برداشته شد" : "کاربر در دیتابیس مسدود شد و نشست‌هایش باطل شد", isBlocked ? "ok2" : "warn");
                load();
              } catch (ex) { toast(ex.message, "err"); }
            }
          );
        }));
        document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
          const u = lastRows.find((x) => x.id === b.dataset.del);
          if (!u) return;
          confirmDialog(
            `حذف واقعی کاربر «${u.name}» از دیتابیس اپ؟ رکورد کاربر، همه نشست‌های فعال و کدهای پیامکی او واقعاً از دیتابیس ابری پاک می‌شود و ورود با این اطلاعات دیگر ممکن نیست. این عمل برگشت‌ناپذیر است.`,
            async () => {
              try {
                const r = await api("users/delete", { method: "POST", body: { id: u.id, phone: u.phone || "" } });
                toast(`کاربر واقعاً از دیتابیس حذف شد${r.sessions_revoked ? ` — ${faNum(r.sessions_revoked)} نشست باطل شد` : ""}`, "ok2");
                load();
              } catch (ex) { toast(ex.message, "err"); }
            }
          );
        }));
      }
    } catch (ex) {
      if (table) table.innerHTML = `<div class="card"><div class="empty"><span class="material">cloud_off</span>${esc(ex.message)}</div></div>`;
      if (src) src.textContent = "اتصال به دیتابیس اپ ناموفق بود";
    }
  };
  document.getElementById("u-q").oninput = load;
  document.getElementById("u-status").onchange = load;
  document.getElementById("u-refresh").onclick = load;
  document.getElementById("u-csv").onclick = () => {
    csvExport("darmasir-users.csv", ["نام", "تماس", "وضعیت", "نشست فعال", "رمز دارد", "عضویت", "آخرین ورود"],
      lastRows.map((u) => [u.name, u.phone || u.email || "", STATUS_LABEL[u.status]?.[0] || u.status, u.sessions, u.has_password ? "دارد" : "ندارد", faTime(u.created_at), u.last_login_at ? faTime(u.last_login_at) : "—"]));
  };
  await load();
}

/* نمایش کدهای پیامکی ارسالی به کاربر — بروزرسانی خودکار هر ۴ ثانیه */
function openUserOtp(user) {
  if (!user) return;
  if (!user.phone) { toast("این کاربر شماره موبایل ندارد", "err"); return; }
  let timer = null;
  const rawClose = modal(
    `کدهای پیامکی — ${user.display_name}`,
    `<div class="detail-row" style="border-bottom:none"><span>شماره</span><b style="direction:ltr">${esc(user.phone)}</b></div>
     <div id="otp-list" style="margin-top:10px"><div class="empty"><span class="material">hourglass_top</span>در حال دریافت کدها…</div></div>
     <span class="hint" style="display:block;margin-top:10px">کدهای اخیر ارسالی به این شماره — کد فعال با برچسب سبز و اعتبار ۳ دقیقه مشخص شده است. این پنجره هر ۴ ثانیه خودکار بروزرسانی می‌شود.</span>`,
    `<button class="btn" id="otp-refresh"><span class="material">refresh</span><span>بروزرسانی</span></button>
     <button class="btn" id="f-cancel">بستن</button>`
  );
  const close = () => { if (timer) { clearInterval(timer); timer = null; } rawClose(); };
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("modal-x").onclick = close;
  document.getElementById("modal-back").onclick = (e) => { if (e.target.id === "modal-back") close(); };
  const load = async () => {
    const host = document.getElementById("otp-list");
    if (!host) { if (timer) { clearInterval(timer); timer = null; } return; }
    try {
      const d = await api(`users/otp?phone=${encodeURIComponent(user.phone)}`);
      const codes = d.codes || [];
      if (!host) return;
      host.innerHTML = codes.length
        ? `<div class="detail-grid">${codes.map((c) => {
            const active = c.valid;
            return `<div class="detail-row" style="align-items:center">
              <span style="direction:ltr;font-family:monospace;font-size:20px;font-weight:800;letter-spacing:4px;color:var(--primary)">${esc(c.code)}</span>
              <span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                ${active ? `<span class="badge ok">فعال — تا ${faTime(c.expires_at)}</span>` : c.used ? `<span class="badge off">مصرف‌شده</span>` : `<span class="badge bad">منقضی</span>`}
                <span class="hint">${faTime(c.created_at)}${c.attempts ? ` — ${faNum(c.attempts)} تلاش ناموفق` : ""}</span>
              </span>
            </div>`;
          }).join("")}</div>`
        : `<div class="empty"><span class="material">sms_failed</span>هنوز کدی برای این شماره ارسال نشده است</div>`;
    } catch (ex) {
      host.innerHTML = `<div class="empty"><span class="material">error</span>${esc(ex.message)}</div>`;
    }
  };
  document.getElementById("otp-refresh").onclick = load;
  timer = setInterval(load, 4000);
  load();
}

/* فعالیت واقعی کاربر اپ اندروید — سفرها / ایستگاه‌های نشان‌شده / مسیرهای روزمره / تیکت‌ها
   منبع: دیتابیس ابری (D1) — همان جایی که اپ اندروید هر تغییر کاربر را با ورکر ثبت می‌کند */
function openUserActivity(user) {
  if (!user) return;
  const ident = user.phone || user.email || "";
  if (!ident) { toast("این کاربر شماره یا ایمیل ندارد", "err"); return; }
  const rawClose = modal(
    `فعالیت واقعی — ${user.display_name || user.name || ident}`,
    `<div class="detail-row" style="border-bottom:none"><span>شناسه</span><b style="direction:ltr">${esc(ident)}</b></div>
     <div id="uact-body" style="margin-top:10px"><div class="empty"><span class="material">hourglass_top</span>در حال خواندن از دیتابیس ابری…</div></div>
     <span class="hint" style="display:block;margin-top:10px">این داده‌ها مستقیماً از دیتابیس ابری می‌آید — هر سفر، نشان‌شدن ایستگاه یا مسیر روزمره که کاربر در اپ اندروید انجام داده باشد اینجا واقعاً ثبت شده است.</span>`,
    `<button class="btn" id="uact-refresh"><span class="material">refresh</span><span>بروزرسانی</span></button>
     <button class="btn" id="f-cancel">بستن</button>`
  );
  const close = () => rawClose();
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("modal-x").onclick = close;
  document.getElementById("modal-back").onclick = (e) => { if (e.target.id === "modal-back") close(); };
  const load = async () => {
    const host = document.getElementById("uact-body");
    if (!host) return;
    host.innerHTML = `<div class="empty"><span class="material">hourglass_top</span>در حال خواندن از دیتابیس ابری…</div>`;
    try {
      const d = await api(`users/activity?identifier=${encodeURIComponent(ident)}`);
      const trips = d.trips || [];
      const favs = d.favorites || [];
      const daily = d.daily_routes || [];
      const tickets = d.tickets || [];
      const sec = (title, icon, emptyText, rowsHtml) => `
        <div class="card" style="margin-top:10px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span class="material" style="color:var(--primary)">${icon}</span><b>${title}</b>
          </div>
          ${rowsHtml || `<div class="empty" style="padding:10px"><span class="material">${icon}</span>${emptyText}</div>`}
        </div>`;
      let html = "";
      html += sec("سفرهای ثبت‌شده (" + faNum(trips.length) + ")", "luggage",
        "کاربر هنوز سفری ثبت نکرده است",
        trips.length ? `<div class="detail-grid" style="max-height:240px;overflow-y:auto;pretty-scroll">${trips.map((t) => `
          <div class="detail-row">
            <span><b>${esc(t.from_name)}</b> ← <b>${esc(t.to_name)}</b></span>
            <span style="display:flex;gap:6px;align-items:center">
              <span class="badge ok">${faNum(t.minutes)} دقیقه</span>
              <span class="hint">${faTime(t.created_at)}</span>
            </span>
          </div>`).join("")}</div>` : "");
      html += sec("ایستگاه‌های نشان‌شده (" + faNum(favs.length) + ")", "bookmark",
        "ایستگاه نشان‌شده‌ای ندارد",
        favs.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${favs.map((f) => `
          <span class="badge ok">${esc(f.station_name || f.station_id)}</span>`).join("")}</div>` : "");
      html += sec("مسیرهای روزمره (" + faNum(daily.length) + ")", "alt_route",
        "مسیر روزمره‌ای ثبت نکرده است",
        daily.length ? `<div class="detail-grid">${daily.map((r) => `
          <div class="detail-row">
            <span><b>${esc(r.label)}</b> — ${esc(r.from_name)} ← ${esc(r.to_name)}</span>
            <span class="hint">${faTime(r.created_at)}</span>
          </div>`).join("")}</div>` : "");
      html += sec("تیکت‌های پشتیبانی (" + faNum(tickets.length) + ")", "support_agent",
        "تیکتی ثبت نکرده است",
        tickets.length ? `<div class="detail-grid">${tickets.map((t) => `
          <div class="detail-row">
            <span>${esc(t.subject || "—")}</span>
            <span class="badge ${t.status === "open" ? "warn" : "off"}">${t.status === "open" ? "باز" : t.status === "answered" ? "پاسخ داده شد" : "بسته"}</span>
          </div>`).join("")}</div>` : "");
      host.innerHTML = html;
    } catch (ex) {
      host.innerHTML = `<div class="empty"><span class="material">error</span>${esc(ex.message)}</div>`;
    }
  };
  document.getElementById("uact-refresh").onclick = load;
  load();
}

/* تنظیم/تغییر رمز عبور کاربر واقعی اپ توسط مدیر */
function openUserPassword(user, after) {
  if (!user) return;
  if (!user.phone) { toast("این کاربر شماره موبایل ندارد", "err"); return; }
  const genRandom = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    const buf = new Uint32Array(8);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 8; i++) out += chars[buf[i] % chars.length];
    return out;
  };
  const close = modal(
    `تنظیم رمز عبور — ${user.display_name}`,
    `<div class="detail-row" style="border-bottom:none"><span>شماره</span><b style="direction:ltr">${esc(user.phone)}</b></div>
     <div class="field" style="margin-top:10px"><label>رمز عبور جدید (حداقل ۶ کاراکتر)</label>
       <div style="display:flex;gap:8px">
         <input id="f-newpass" style="direction:ltr;flex:1" placeholder="مثلاً Metro1404" autocomplete="new-password" />
         <button class="btn btn-sm" id="f-genpass" type="button" title="تولید رمز تصادفی"><span class="material">casino</span><span>تصادفی</span></button>
       </div>
       <span class="hint">با این رمز، کاربر می‌تواند با شماره یا ایمیل خود از بخش ورود با رمز وارد اپ شود.</span>
     </div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-savepass"><span class="material">save</span><span>ذخیره رمز</span></button>`
  );
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-genpass").onclick = () => {
    document.getElementById("f-newpass").value = genRandom();
  };
  document.getElementById("f-savepass").onclick = async () => {
    const password = document.getElementById("f-newpass").value;
    if (password.length < 6) { toast("رمز عبور باید حداقل ۶ کاراکتر باشد", "err"); return; }
    try {
      await api("users/password", { method: "POST", body: { phone: user.phone, password } });
      toast("رمز عبور کاربر بروزرسانی شد", "ok2");
      close();
      if (after) after();
    } catch (ex) { toast(ex.message, "err"); }
  };
}

/* ---------- شهرها ---------- */

async function pageCities(host) {
  const writable = can("operator");
  let lastRows = [];
  host.innerHTML = `
    ${pageHead("شهرها", "تعریف شهرهای تحت پوشش؛ هر خط و ایستگاه به یک شهر متصل می‌شود و در کل پنل بر اساس شهر فیلتر می‌گردد.",
      writable ? `<button class="btn btn-primary" id="c-add"><span class="material">add</span><span>شهر جدید</span></button>` : "")}
    <div class="toolbar">
      <input id="c-q" placeholder="جست‌وجوی نام شهر…" style="min-width:220px" />
      <span class="toolbar-note" id="c-count"></span>
    </div>
    <div id="c-table"></div>`;
  const load = async () => {
    const rows = await api("cities");
    lastRows = rows;
    const q = document.getElementById("c-q").value.trim();
    const shown = q ? rows.filter((c) => c.name.includes(q)) : rows;
    document.getElementById("c-count").textContent = `${faNum(rows.length)} شهر ثبت‌شده`;
    document.getElementById("c-table").innerHTML = shown.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>نام شهر</th><th class="cell-center">خطوط متصل</th><th class="cell-center">ایستگاه‌ها</th><th>تاریخ ثبت</th><th>وضعیت</th>${writable ? "<th>عملیات</th>" : ""}</tr></thead>
        <tbody>
          ${shown.map((c) => `
            <tr>
              <td><div class="cell-media"><div class="thumb thumb-empty city-thumb"><span class="material">location_city</span></div><b>${esc(c.name)}</b></div></td>
              <td class="cell-center"><span class="badge info">${faNum(c.lines_count)}</span></td>
              <td class="cell-center"><span class="badge ok">${faNum(c.stations_count)}</span></td>
              <td>${faTime(c.created_at)}</td>
              <td><span class="badge ${c.is_active ? "ok" : "off"}">${c.is_active ? "فعال" : "غیرفعال"}</span></td>
              ${writable ? `<td><div class="acts">
                <button class="icon-btn" data-edit="${c.id}" title="ویرایش شهر"><span class="material">edit</span></button>
                <button class="icon-btn danger" data-del="${c.id}" data-name="${esc(c.name)}" title="حذف شهر"><span class="material">delete</span></button>
              </div></td>` : ""}
            </tr>`).join("")}
        </tbody>
      </table></div>` : `<div class="card"><div class="empty"><span class="material">location_city</span>شهری یافت نشد</div></div>`;
    if (writable) {
      document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openCityForm(rows.find((x) => x.id === Number(b.dataset.edit)), load)));
      document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog(`شهر «${b.dataset.name}» حذف شود؟ (فقط اگر خط یا ایستگاهی به آن متصل نباشد)`, async () => {
          try {
            await api(`cities/${b.dataset.del}`, { method: "DELETE" });
            toast("شهر حذف شد", "ok2"); load();
          } catch (ex) { toast(ex.message, "err"); }
        })));
    }
  };
  document.getElementById("c-q").oninput = load;
  const addBtn = document.getElementById("c-add");
  if (addBtn) addBtn.onclick = () => openCityForm(null, load);
  await load();
}

function openCityForm(city, after) {
  const isEdit = !!city;
  const close = modal(isEdit ? "ویرایش شهر" : "شهر جدید", `
    <div class="field"><label>نام شهر</label><input id="f-cityname" value="${esc(city?.name || "")}" placeholder="مثلاً شیراز" /></div>
    <div class="field"><label>وضعیت</label>
      <select id="f-cityactive"><option value="1" ${!city || city.is_active ? "selected" : ""}>فعال</option><option value="0" ${city && !city.is_active ? "selected" : ""}>غیرفعال</option></select></div>
    ${isEdit ? '<span class="hint">با تغییر نام شهر، اتصال خطوط و ایستگاه‌های این شهر حفظ می‌شود.</span>' : '<span class="hint">پس از ثبت، شهر در فرم خطوط، ایستگاه‌ها و فیلترها قابل انتخاب است.</span>'}`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "افزودن"}</button>`);
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const name = document.getElementById("f-cityname").value.trim();
    if (!name) { toast("نام شهر الزامی است", "err"); return; }
    try {
      await api(isEdit ? `cities/${city.id}` : "cities", {
        method: isEdit ? "PUT" : "POST",
        body: { name, is_active: Number(document.getElementById("f-cityactive").value) },
      });
      toast(isEdit ? "شهر بروزرسانی شد" : "شهر اضافه شد", "ok2");
      close(); after ? after() : renderPage("cities");
    } catch (ex) { toast(ex.message, "err"); }
  };
}

/* ---------- خطوط ---------- */

async function pageLines(host) {
  const writable = can("operator");
  let mode = "metro";
  let cityId = "";
  const cities = await api("cities");
  host.innerHTML = `
    ${pageHead("خطوط", "مدیریت خطوط مترو، اتوبوس و اتوبوس تندرو؛ هر خط به یک شهر متصل است و می‌توانید بر اساس شهر فیلتر کنید.",
      writable ? `<button class="btn btn-primary" id="l-add"><span class="material">add</span><span>خط جدید</span></button>` : "")}
    <div class="toolbar">
      <select id="l-city" aria-label="فیلتر شهر">
        <option value="">همه شهرها</option>
        ${cities.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}
      </select>
      <select id="l-mode">
        <option value="metro">مترو</option>
        <option value="bus">اتوبوس</option>
        <option value="brt">اتوبوس تندرو</option>
      </select>
      <span class="toolbar-note" id="l-count"></span>
    </div>
    <div id="l-table"></div>`;
  const load = async () => {
    const rows = await api(`lines?mode=${mode}&city_id=${cityId}`);
    document.getElementById("l-count").textContent = `${faNum(rows.length)} خط${cityId ? " در " + esc((cities.find((c) => String(c.id) === String(cityId)) || {}).name || "") : ""}`;
    document.getElementById("l-table").innerHTML = rows.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th></th><th>نام خط</th><th>شهر</th><th>شماره</th><th>سرخط‌ها</th><th>جهت</th><th>ایستگاه‌ها</th><th>وضعیت</th>${writable ? "<th>عملیات</th>" : ""}</tr></thead>
        <tbody>
          ${rows.map((l) => `
            <tr>
              <td><span class="dot" style="background:${esc(l.color)}"></span></td>
              <td><b>${esc(l.name)}</b></td>
              <td>${l.city_name ? `<span class="placement-chip"><span class="material">location_city</span>${esc(l.city_name)}</span>` : '<span class="badge off">بدون شهر</span>'}</td>
              <td>${l.number ?? "—"}</td>
              <td>${esc((l.terminals || "").split("|").filter(Boolean).join(" ← ")) || "—"}</td>
              <td>${esc(l.direction || "—")}</td>
              <td><span class="badge info">${faNum(l.station_count ?? 0)} ایستگاه</span></td>
              <td><span class="badge ${l.is_active ? "ok" : "off"}">${l.is_active ? "فعال" : "غیرفعال"}</span></td>
              ${writable ? `<td><div class="acts">
                <button class="icon-btn" data-up="${l.id}" title="انتقال به بالا"><span class="material">arrow_upward</span></button>
                <button class="icon-btn" data-down="${l.id}" title="انتقال به پایین"><span class="material">arrow_downward</span></button>
                <button class="icon-btn" data-dup="${l.id}" data-name="${esc(l.name)}" title="تکثیر خط"><span class="material">content_copy</span></button>
                <button class="icon-btn" data-edit="${l.id}" title="ویرایش خط"><span class="material">edit</span></button>
                <button class="icon-btn danger" data-del="${l.id}" data-name="${esc(l.name)}" title="حذف خط"><span class="material">delete</span></button>
              </div></td>` : ""}
            </tr>`).join("")}
        </tbody>
      </table></div>` : `<div class="card"><div class="empty"><span class="material">alt_route</span>خطی در این دسته ثبت نشده است</div></div>`;
    if (writable) {
      document.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => reorderLine(Number(b.dataset.up), "up")));
      document.querySelectorAll("[data-down]").forEach((b) => (b.onclick = () => reorderLine(Number(b.dataset.down), "down")));
      document.querySelectorAll("[data-dup]").forEach((b) => (b.onclick = async () => {
        await api("lines/duplicate", { method: "POST", body: { id: Number(b.dataset.dup) } });
        toast(`خط «${b.dataset.name}» تکثیر شد (غیرفعال)`, "ok2"); load();
      }));
      document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openLineForm(rows.find((x) => x.id === Number(b.dataset.edit)), load, cities)));
      document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog(`خط «${b.dataset.name}» و ایستگاه‌هایش حذف شوند؟`, async () => {
          await api(`lines/${b.dataset.del}`, { method: "DELETE" });
          toast("خط حذف شد", "ok2"); load();
        })));
    }
  };
  const reorderLine = async (id, dir) => {
    const r = await api("lines/reorder", { method: "POST", body: { id, dir } });
    if (!r.moved) { toast("جابه‌جایی ممکن نیست — به انتهای فهرست است", "err"); return; }
    load();
  };
  document.getElementById("l-mode").onchange = (e) => { mode = e.target.value; load(); };
  document.getElementById("l-city").onchange = (e) => { cityId = e.target.value; load(); };
  const addBtn = document.getElementById("l-add");
  if (addBtn) addBtn.onclick = () => openLineForm(null, load, cities);
  await load();
}

function openLineForm(line, after, cities = []) {
  const isEdit = !!line;
  const close = modal(isEdit ? "ویرایش خط" : "خط جدید", `
    <div class="field"><label>نام خط</label><input id="f-name" value="${esc(line?.name || "")}" placeholder="مثلاً خط ۱" /></div>
    <div class="field"><label>شهر</label>
      <select id="f-city">
        <option value="">— انتخاب شهر —</option>
        ${cities.map((c) => `<option value="${c.id}" ${String(line?.city_id ?? "") === String(c.id) ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
      <span class="hint">خط به شهر متصل می‌شود و در اپلیکیشن و فیلترهای پنل بر اساس آن دسته‌بندی می‌گردد.</span></div>
    <div class="field"><label>دسته</label>
      <select id="f-mode">
        <option value="metro" ${line?.mode === "metro" ? "selected" : ""}>مترو</option>
        <option value="bus" ${line?.mode === "bus" ? "selected" : ""}>اتوبوس</option>
        <option value="brt" ${line?.mode === "brt" ? "selected" : ""}>اتوبوس تندرو</option>
      </select></div>
    <div class="grid cols-2">
      <div class="field"><label>شماره</label><input id="f-number" type="number" value="${line?.number ?? ""}" /></div>
      <div class="field"><label>رنگ (hex)</label><input id="f-color" value="${esc(line?.color || "#009640")}" placeholder="#009640" /></div>
    </div>
    <div class="field"><label>سرخط‌ها</label><input id="f-terminals" value="${esc(line?.terminals || "")}" placeholder="مبدأ|مقصد" /><span class="hint">دو سرخط را با «|» جدا کنید</span></div>
    <div class="field"><label>جهت</label><input id="f-direction" value="${esc(line?.direction || "")}" placeholder="مثلاً شمال - جنوب" /></div>
    <div class="field"><label>وضعیت</label>
      <select id="f-active"><option value="1" ${!line || line.is_active ? "selected" : ""}>فعال</option><option value="0" ${line && !line.is_active ? "selected" : ""}>غیرفعال</option></select></div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "افزودن"}</button>`);
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const body = {
      name: document.getElementById("f-name").value.trim(),
      city_id: document.getElementById("f-city").value,
      mode: document.getElementById("f-mode").value,
      number: document.getElementById("f-number").value,
      color: document.getElementById("f-color").value.trim(),
      terminals: document.getElementById("f-terminals").value.trim(),
      direction: document.getElementById("f-direction").value.trim(),
      is_active: Number(document.getElementById("f-active").value),
    };
    if (!body.name) { toast("نام خط الزامی است", "err"); return; }
    if (!body.city_id) { toast("تعیین شهر خط الزامی است", "err"); return; }
    try {
      await api(isEdit ? `lines/${line.id}` : "lines", { method: isEdit ? "PUT" : "POST", body });
      toast(isEdit ? "خط بروزرسانی شد" : "خط اضافه شد", "ok2");
      close(); after ? after() : renderPage("lines");
    } catch (ex) { toast(ex.message, "err"); }
  };
}

/* ---------- ایستگاه‌ها ---------- */

async function pageStations(host) {
  const writable = can("operator");
  const [lines, cities] = await Promise.all([api("lines"), api("cities")]);
  if (!lines.length) { host.innerHTML = `${pageHead("ایستگاه‌ها", "مدیریت ایستگاه‌های هر خط و مختصات جغرافیایی.")}<div class="card"><div class="empty"><span class="material">location_off</span>ابتدا یک خط ثبت کنید</div></div>`; return; }
  host.innerHTML = `
    ${pageHead("ایستگاه‌ها", "مدیریت ایستگاه‌های هر خط، ترتیب قرارگیری و مختصات جغرافیایی؛ ایستگاه‌ها به شهر خط خود متصل می‌شوند.",
      `${writable ? `<button class="btn" id="s-bulk"><span class="material">playlist_add</span><span>افزودن گروهی</span></button>
      <button class="btn btn-primary" id="s-add"><span class="material">add</span><span>ایستگاه جدید</span></button>` : ""}`)}
    <div class="toolbar">
      <select id="s-city" aria-label="فیلتر شهر">
        <option value="">همه شهرها</option>
        ${cities.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}
      </select>
      <select id="s-line" aria-label="فیلتر خط"></select>
      <span class="toolbar-note" id="s-count"></span>
    </div>
    <div id="s-table"></div>`;

  const fillLineOptions = () => {
    const cityId = document.getElementById("s-city").value;
    const shown = cityId ? lines.filter((l) => String(l.city_id) === cityId) : lines;
    const prev = document.getElementById("s-line").value;
    document.getElementById("s-line").innerHTML =
      `<option value="">همه خط‌ها${cityId ? " این شهر" : ""}</option>` +
      shown.map((l) => `<option value="${l.id}">${esc(l.name)}${l.city_name ? " — " + esc(l.city_name) : ""}</option>`).join("");
    // اگر خط قبلی در شهر جدید نیست، به «همه خط‌ها» برگرد
    if (prev && !shown.some((l) => String(l.id) === prev)) document.getElementById("s-line").value = "";
    else document.getElementById("s-line").value = prev;
  };
  fillLineOptions();

  const load = async () => {
    const cityId = document.getElementById("s-city").value;
    const lineId = document.getElementById("s-line").value;
    const rows = lineId ? await api(`stations?line_id=${lineId}`) : cityId ? await api(`stations?city_id=${cityId}`) : await api("stations");
    const showLineCol = !lineId;
    const showCityCol = !cityId;
    document.getElementById("s-count").textContent = lineId
      ? `${faNum(rows.length)} ایستگاه در این خط`
      : cityId
        ? `${faNum(rows.length)} ایستگاه در شهر ${esc((cities.find((c) => c.id === Number(cityId)) || {}).name || "")}`
        : `${faNum(rows.length)} ایستگاه در همه شهرها`;
    document.getElementById("s-table").innerHTML = rows.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>ترتیب</th><th>نام ایستگاه</th>${showLineCol ? "<th>خط</th>" : ""}${showCityCol ? "<th>شهر</th>" : ""}<th>عرض جغرافیایی</th><th>طول جغرافیایی</th><th>وضعیت</th>${writable ? "<th>عملیات</th>" : ""}</tr></thead>
        <tbody>
          ${rows.map((s) => `
            <tr>
              <td><span class="order-chip">${faNum(s.order_index)}</span></td>
              <td><b>${esc(s.name)}</b></td>
              ${showLineCol ? `<td><span class="dot" style="background:${esc(s.line_color || "#009640")}"></span> ${esc(s.line_name || "—")}</td>` : ""}
              ${showCityCol ? `<td>${s.city_name ? `<span class="placement-chip"><span class="material">location_city</span>${esc(s.city_name)}</span>` : '<span class="badge off">بدون شهر</span>'}</td>` : ""}
              <td>${s.lat ?? "—"}</td>
              <td>${s.lng ?? "—"}</td>
              <td><span class="badge ${s.is_active ? "ok" : "off"}">${s.is_active ? "فعال" : "غیرفعال"}</span></td>
              ${writable ? `<td><div class="acts">
                <button class="icon-btn" data-up="${s.id}" title="انتقال به بالا"><span class="material">arrow_upward</span></button>
                <button class="icon-btn" data-down="${s.id}" title="انتقال به پایین"><span class="material">arrow_downward</span></button>
                <button class="icon-btn" data-edit="${s.id}" title="ویرایش / انتقال به خط دیگر"><span class="material">edit</span></button>
                <button class="icon-btn danger" data-del="${s.id}" data-name="${esc(s.name)}" title="حذف ایستگاه"><span class="material">delete</span></button>
              </div></td>` : ""}
            </tr>`).join("")}
        </tbody>
      </table></div>` : `<div class="card"><div class="empty"><span class="material">location_off</span>ایستگاهی در این محدوده ثبت نشده است</div></div>`;
    if (writable) {
      document.querySelectorAll("[data-up]").forEach((b) => (b.onclick = async () => {
        const r = await api("stations/reorder", { method: "POST", body: { id: Number(b.dataset.up), dir: "up" } });
        if (!r.moved) { toast("به بالای فهرست رسیده است", "err"); return; }
        load();
      }));
      document.querySelectorAll("[data-down]").forEach((b) => (b.onclick = async () => {
        const r = await api("stations/reorder", { method: "POST", body: { id: Number(b.dataset.down), dir: "down" } });
        if (!r.moved) { toast("به پایین فهرست رسیده است", "err"); return; }
        load();
      }));
      document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openStationForm(rows.find((x) => x.id === Number(b.dataset.edit)), load, lines, cities)));
      document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog(`ایستگاه «${b.dataset.name}» حذف شود؟`, async () => {
          await api(`stations/${b.dataset.del}`, { method: "DELETE" });
          toast("ایستگاه حذف شد", "ok2"); load();
        })));
    }
  };
  document.getElementById("s-line").onchange = load;
  document.getElementById("s-city").onchange = () => { fillLineOptions(); load(); };
  if (writable) {
    document.getElementById("s-add").onclick = () => openStationForm(null, load, lines, cities);
    document.getElementById("s-bulk").onclick = () => openStationBulk(load, lines, cities);
  }
  await load();
}

/* افزودن گروهی ایستگاه — هر خط یک نام */
function openStationBulk(after, lines, cities = []) {
  const cityId = document.getElementById("s-city")?.value || "";
  const lineId = document.getElementById("s-line")?.value || "";
  const shownLines = cityId ? lines.filter((l) => String(l.city_id) === cityId) : lines;
  const close = modal("افزودن گروهی ایستگاه", `
    <div class="field"><label>شهر مقصد</label>
      <select id="b-city" disabled>
        ${cities.map((c) => `<option value="${c.id}" ${String(c.id) === String(cityId) ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
      <span class="hint">شهر ایستگاه‌های جدید به‌طور خودکار از شهر خط مقصد گرفته می‌شود.</span></div>
    <div class="field"><label>خط مقصد</label>
      <select id="b-line">${shownLines.map((l) => `<option value="${l.id}" ${String(l.id) === String(lineId) ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select></div>
    <div class="field"><label>نام ایستگاه‌ها (هر خط یک نام — به ترتیب مسیر)</label>
      <textarea id="b-names" rows="8" placeholder="مثلاً:
کهریزک
حرم مطهر
شهید بهشتی"></textarea>
      <span class="hint">نام‌های تکراری در همان خط به‌صورت خودکار رد می‌شوند. ترتیب به‌طور خودکار ادامه پیدا می‌کند.</span></div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">افزودن همه</button>`);
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const names = document.getElementById("b-names").value.trim();
    if (!names) { toast("حداقل یک نام وارد کنید", "err"); return; }
    try {
      const r = await api("stations/bulk", { method: "POST", body: { line_id: Number(document.getElementById("b-line").value), names } });
      toast(`${faNum(r.added)} ایستگاه افزوده شد${r.skipped ? ` — ${faNum(r.skipped)} تکراری رد شد` : ""}`, "ok2");
      close(); after();
    } catch (ex) { toast(ex.message, "err"); }
  };
}

function openStationForm(station, after, lines, cities = []) {
  const isEdit = !!station;
  const curLine = isEdit ? station.line_id : Number(document.getElementById("s-line")?.value) || (lines[0] ? lines[0].id : null);
  const cityOfLine = (lineId) => (lines.find((l) => l.id === Number(lineId)) || {}).city_id ?? "";
  let curCity = isEdit ? (station.city_id ?? cityOfLine(curLine)) : cityOfLine(curLine);
  const close = modal(isEdit ? "ویرایش ایستگاه" : "ایستگاه جدید", `
    <div class="field"><label>شهر</label>
      <select id="f-city">
        <option value="">— هماهنگ با شهر خط —</option>
        ${cities.map((c) => `<option value="${c.id}" ${String(curCity ?? "") === String(c.id) ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
      <span class="hint">به‌طور پیش‌فرض شهر ایستگاه از شهر خط مقصد گرفته می‌شود؛ در صورت نیاز شهر دیگر را انتخاب کنید.</span></div>
    <div class="field"><label>خط</label>
      <select id="f-line">${lines.map((l) => `<option value="${l.id}" ${l.id === curLine ? "selected" : ""}>${esc(l.name)}${l.city_name ? " — " + esc(l.city_name) : ""}</option>`).join("")}</select>
      ${isEdit ? '<span class="hint">با تغییر خط، ایستگاه به خط مقصد منتقل می‌شود.</span>' : ""}</div>
    <div class="field"><label>نام ایستگاه</label><input id="f-name" value="${esc(station?.name || "")}" placeholder="مثلاً تجریش" /></div>
    <div class="grid cols-2">
      <div class="field"><label>عرض جغرافیایی (اختیاری)</label><input id="f-lat" value="${station?.lat ?? ""}" style="direction:ltr" placeholder="35.7999" /></div>
      <div class="field"><label>طول جغرافیایی (اختیاری)</label><input id="f-lng" value="${station?.lng ?? ""}" style="direction:ltr" placeholder="51.4343" /></div>
    </div>
    <div class="field"><label>ترتیب</label><input id="f-order" type="number" value="${station?.order_index ?? 0}" /></div>
    <div class="field"><label>وضعیت</label>
      <select id="f-active"><option value="1" ${!station || station.is_active ? "selected" : ""}>فعال</option><option value="0" ${station && !station.is_active ? "selected" : ""}>غیرفعال</option></select></div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "افزودن"}</button>`);
  // هماهنگی خودکار شهر با خط انتخاب‌شده (تا وقتی مدیر شهر را دستی عوض نکرده)
  document.getElementById("f-line").onchange = (e) => {
    const cid = cityOfLine(e.target.value);
    if (cid) document.getElementById("f-city").value = String(cid);
  };
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const body = {
      city_id: document.getElementById("f-city").value,
      line_id: Number(document.getElementById("f-line").value),
      name: document.getElementById("f-name").value.trim(),
      lat: document.getElementById("f-lat").value,
      lng: document.getElementById("f-lng").value,
      order_index: document.getElementById("f-order").value,
      is_active: Number(document.getElementById("f-active").value),
    };
    if (!body.name) { toast("نام ایستگاه الزامی است", "err"); return; }
    try {
      await api(isEdit ? `stations/${station.id}` : "stations", { method: isEdit ? "PUT" : "POST", body });
      toast(isEdit ? "ایستگاه بروزرسانی شد" : "ایستگاه اضافه شد", "ok2");
      close(); after();
    } catch (ex) { toast(ex.message, "err"); }
  };
}

/* ---------- تبلیغات ---------- */

const AD_PLACE_META = {
  home: { icon: "view_carousel", cls: "" },
  home_bottom: { icon: "vertical_align_bottom", cls: "warn2" },
  lines: { icon: "view_list", cls: "alt" },
  status: { icon: "info", cls: "warn2" },
  settings: { icon: "tune", cls: "alt" },
  saved: { icon: "bookmarks", cls: "" },
  /* جایگاه‌های قدیمی — برای سازگاری */
  map: { icon: "map", cls: "alt" },
  plan: { icon: "alt_route", cls: "warn2" },
  station: { icon: "location_on", cls: "alt" },
  line: { icon: "route", cls: "" },
  splash: { icon: "launch", cls: "warn2" },
  drawer: { icon: "menu", cls: "alt" },
};

async function pageAds(host) {
  const writable = can("operator");
  const [rows, stats] = await Promise.all([api("ads"), api("ads/stats?days=14")]);
  const isLive = (a) => a.is_active && (!a.ends_at || new Date(a.ends_at) > Date.now()) && (!a.starts_at || new Date(a.starts_at) <= Date.now());
  const isScheduled = (a) => a.is_active && a.starts_at && new Date(a.starts_at) > Date.now();
  const isExpired = (a) => !isLive(a) && !isScheduled(a);
  const TABS = [
    ["all", "همه کمپین‌ها", () => true],
    ["live", "در حال نمایش", isLive],
    ["scheduled", "زمان‌بندی‌شده", isScheduled],
    ["expired", "منقضی / بایگانی", isExpired],
  ];
  let tab = "all";
  let placeFilter = "";
  let searchQ = "";
  const selected = new Set();

  const totalImp = rows.reduce((s, a) => s + (a.impressions || 0), 0);
  const totalClk = rows.reduce((s, a) => s + (a.clicks || 0), 0);
  const avgCtr = totalImp ? ((totalClk / totalImp) * 100) : 0;
  const liveCount = rows.filter(isLive).length;

  host.innerHTML = `
    ${pageHead("تبلیغات و بنرها", "پیکربندی کمپین‌های درون‌برنامه‌ای، اولویت‌بندی نمایش، زمان‌بندی و تحلیل عملکرد؛ خاموش‌کردن تبلیغ بدون انتشار نسخه جدید اپلیکیشن.",
      writable ? `<button class="btn btn-primary" id="a-add"><span class="material">add</span><span>ایجاد کمپین / بنر جدید</span></button>` : "")}
    <div class="kpi-grid kpi-grid-5">
      ${kpi("کل کمپین‌ها", "campaign", rows.length, "کمپین ثبت‌شده در پایگاه داده", "t-primary")}
      ${kpi("در حال نمایش", "play_circle", liveCount, "کمپین فعال در اپ", "t-tertiary")}
      ${kpi("نمایش‌ها", "visibility", totalImp, "مجموع نمایش در همه کمپین‌ها", "t-surface")}
      ${kpi("کلیک‌ها", "ads_click", totalClk, "مجموع کلیک ثبت‌شده", "t-dim")}
      ${kpi("میانگین CTR", "query_stats", avgCtr.toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + "٪", "نسبت کلیک به نمایش", "t-primary")}
    </div>
    <div class="tbl-card">
      <div class="tabbar" id="a-tabs">
        ${TABS.map(([id, lbl, fn]) => `<button class="tab ${id === tab ? "active" : ""}" data-tab="${id}">${lbl} (${faNum(rows.filter(fn).length)})</button>`).join("")}
      </div>
      <div class="tbl-toolbar">
        <input id="a-q" placeholder="جست‌وجوی عنوان یا تبلیغ‌دهنده…" style="min-width:200px" />
        <select id="a-place">
          <option value="">همه جایگاه‌ها</option>
          ${Object.keys(AD_PLACE_META).map((p) => `<option value="${p}">${PLACE_LABEL[p]}</option>`).join("")}
        </select>
        <span class="spacer"></span>
        <button class="btn btn-sm" id="a-csv"><span class="material">download</span><span>خروجی CSV</span></button>
      </div>
      <div class="bulkbar" id="a-bulkbar" hidden>
        <span class="bulkbar-count" id="a-selcount">۰ انتخاب شده</span>
        ${writable ? `
        <button class="btn btn-sm" id="b-activate"><span class="material">play_circle</span><span>فعال‌سازی</span></button>
        <button class="btn btn-sm" id="b-deactivate"><span class="material">pause_circle</span><span>غیرفعال‌سازی</span></button>
        <button class="btn btn-sm btn-danger" id="b-delete"><span class="material">delete</span><span>حذف</span></button>` : ""}
        <button class="btn btn-sm" id="b-clear">لغو انتخاب</button>
      </div>
      <div id="a-table"></div>
      <div class="tbl-foot" id="a-foot"></div>
    </div>`;

  const renderTable = () => {
    const fn = (TABS.find((t) => t[0] === tab) || TABS[0])[2];
    let filtered = rows.filter(fn);
    if (placeFilter) filtered = filtered.filter((a) => a.placement === placeFilter);
    if (searchQ) filtered = filtered.filter((a) => (a.title + " " + (a.advertiser || "")).includes(searchQ));
    const bulkbar = document.getElementById("a-bulkbar");
    bulkbar.hidden = selected.size === 0;
    document.getElementById("a-selcount").textContent = `${faNum(selected.size)} انتخاب شده`;
    document.getElementById("a-table").innerHTML = filtered.length ? `
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr>
        ${writable ? '<th class="cell-center"><input type="checkbox" id="a-selall" aria-label="انتخاب همه" /></th>' : ""}
        <th>عنوان و تصویر بنر</th><th>جایگاه نمایش در اپ</th><th>بازه زمانی</th><th class="cell-center">اولویت</th><th class="cell-center">وضعیت زنده</th><th>آمار کلیک / نمایش</th>${writable ? '<th class="cell-center">عملیات</th>' : ""}
      </tr></thead>
      <tbody>
        ${filtered.map((a) => {
          const live = isLive(a);
          const ctr = a.impressions ? (a.clicks / a.impressions) * 100 : 0;
          const fill = Math.min(Math.max(ctr * 20, 4), 100);
          const meta = AD_PLACE_META[a.placement] || { icon: "info", cls: "" };
          return `<tr>
            ${writable ? `<td class="cell-center"><input type="checkbox" class="row-sel" data-sel="${a.id}" ${selected.has(a.id) ? "checked" : ""} aria-label="انتخاب ${esc(a.title)}" /></td>` : ""}
            <td>
              <div class="cell-media">
                ${a.image_url ? `<img class="thumb" src="${esc(a.image_url)}" alt="تصویر بنر ${esc(a.title)}" onerror="this.style.display='none'" />` : `<div class="thumb thumb-empty"><span class="material">campaign</span></div>`}
                <div>
                  <b>${esc(a.title)}</b>
                  ${a.badge ? `<span class="badge info" style="margin-inline-start:4px">${esc(a.badge)}</span>` : ""}
                  <span class="cell-sub">شناسه: #AD-${String(a.id).padStart(4, "0")}${a.advertiser ? " — تبلیغ‌دهنده: " + esc(a.advertiser) : ""}</span>
                </div>
              </div>
            </td>
            <td><span class="placement-chip ${meta.cls}"><span class="material">${meta.icon}</span>${PLACE_LABEL[a.placement] || a.placement}</span></td>
            <td class="cell-range">
              <span>${a.starts_at ? faTime(a.starts_at) : "بدون شروع"}</span>
              <span class="m-live" style="display:block">تا ${a.ends_at ? faTime(a.ends_at) : "پایان نامحدود"}</span>
            </td>
            <td class="cell-center"><span class="order-chip">${faNum(a.priority || 0)}</span></td>
            <td class="cell-center">
              ${writable ? `<label class="switch"><input type="checkbox" data-toggle="${a.id}" ${a.is_active ? "checked" : ""} aria-label="وضعیت ${esc(a.title)}" /><span class="knob"></span></label>` : `<span class="badge ${live ? "ok" : "off"}">${live ? "در حال نمایش" : "خاموش"}</span>`}
            </td>
            <td>
              <div class="cell-meter">
                <div class="meter-row"><span class="m-imp">${faNum(a.impressions)} نمایش</span><span class="m-ctr">${faNum(a.clicks)} کلیک (${ctr.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪)</span></div>
                <div class="meter"><div class="meter-fill ${ctr >= 4 ? "good" : ctr < 1 ? "low" : ""}" style="width:${fill}%"></div></div>
              </div>
            </td>
            ${writable ? `<td class="cell-center"><div class="acts" style="justify-content:center">
              <button class="icon-btn" data-imp="${a.id}" title="ثبت نمایش آزمایشی"><span class="material">visibility</span></button>
              <button class="icon-btn" data-clk="${a.id}" title="ثبت کلیک آزمایشی"><span class="material">ads_click</span></button>
              <button class="icon-btn" data-dup="${a.id}" title="تکثیر کمپین"><span class="material">content_copy</span></button>
              <button class="icon-btn" data-reset="${a.id}" title="بازنشانی آمار"><span class="material">restart_alt</span></button>
              <button class="icon-btn" data-edit="${a.id}" title="ویرایش بنر"><span class="material">edit</span></button>
              <button class="icon-btn danger" data-del="${a.id}" data-name="${esc(a.title)}" title="حذف بنر"><span class="material">delete</span></button>
            </div></td>` : ""}
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>` : `<div class="empty"><span class="material">campaign</span>در این دسته کمپینی ثبت نشده است</div>`;
    document.getElementById("a-foot").textContent = `نمایش ${faNum(filtered.length)} از مجموع ${faNum(rows.length)} کمپین ثبت‌شده در پایگاه داده`;

    document.querySelectorAll(".row-sel").forEach((el) => (el.onchange = () => {
      const id = Number(el.dataset.sel);
      if (el.checked) selected.add(id); else selected.delete(id);
      bulkbar.hidden = selected.size === 0;
      document.getElementById("a-selcount").textContent = `${faNum(selected.size)} انتخاب شده`;
    }));
    const selAll = document.getElementById("a-selall");
    if (selAll) selAll.onchange = () => {
      filtered.forEach((a) => (selAll.checked ? selected.add(a.id) : selected.delete(a.id)));
      document.querySelectorAll(".row-sel").forEach((el) => (el.checked = selAll.checked));
      bulkbar.hidden = selected.size === 0;
      document.getElementById("a-selcount").textContent = `${faNum(selected.size)} انتخاب شده`;
    };

    if (writable) {
      document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openAdForm(rows.find((x) => x.id === Number(b.dataset.edit)))));
      document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog(`تبلیغ «${b.dataset.name}» حذف شود؟`, async () => {
          await api(`ads/${b.dataset.del}`, { method: "DELETE" });
          toast("تبلیغ حذف شد", "ok2"); renderPage("ads");
        })));
      document.querySelectorAll("[data-dup]").forEach((b) => (b.onclick = async () => {
        await api(`ads/${b.dataset.dup}/duplicate`, { method: "POST" });
        toast("کمپین تکثیر شد (خاموش) — عنوان با پسوند «کپی»", "ok2"); renderPage("ads");
      }));
      document.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = () =>
        confirmDialog("آمار نمایش و کلیک این کمپین به صفر بازنشانی شود؟", async () => {
          await api(`ads/${b.dataset.reset}/reset-stats`, { method: "POST" });
          toast("آمار کمپین بازنشانی شد", "ok2"); renderPage("ads");
        })));
      document.querySelectorAll("[data-imp]").forEach((b) => (b.onclick = async () => {
        await api(`ads/${b.dataset.imp}/track`, { method: "POST", body: { type: "impression" } });
        toast("نمایش ثبت شد", "ok2"); renderPage("ads");
      }));
      document.querySelectorAll("[data-clk]").forEach((b) => (b.onclick = async () => {
        await api(`ads/${b.dataset.clk}/track`, { method: "POST", body: { type: "click" } });
        toast("کلیک ثبت شد", "ok2"); renderPage("ads");
      }));
      document.querySelectorAll("[data-toggle]").forEach((el) => (el.onchange = async () => {
        const ad = rows.find((x) => x.id === Number(el.dataset.toggle));
        try {
          await api(`ads/${el.dataset.toggle}`, { method: "PUT", body: { is_active: el.checked ? 1 : 0 } });
          toast(el.checked ? "تبلیغ فعال شد" : "تبلیغ خاموش شد", "ok2");
        } catch (ex) {
          toast(ex.message, "err");
        }
        if (ad) ad.is_active = el.checked ? 1 : 0;
        renderTable();
      }));
    }
  };

  document.getElementById("a-tabs").querySelectorAll(".tab").forEach((b) => (b.onclick = () => {
    tab = b.dataset.tab;
    document.querySelectorAll("#a-tabs .tab").forEach((x) => x.classList.toggle("active", x === b));
    renderTable();
  }));
  document.getElementById("a-q").oninput = (e) => { searchQ = e.target.value.trim(); renderTable(); };
  document.getElementById("a-place").onchange = (e) => { placeFilter = e.target.value; renderTable(); };
  document.getElementById("a-csv").onclick = () => {
    csvExport("darmasir-ads.csv", ["شناسه", "عنوان", "تبلیغ‌دهنده", "جایگاه", "اولویت", "نمایش", "کلیک", "CTR٪", "فعال", "شروع", "پایان"],
      rows.map((a) => [
        `AD-${String(a.id).padStart(4, "0")}`, a.title, a.advertiser || "", PLACE_LABEL[a.placement] || a.placement,
        a.priority || 0, a.impressions, a.clicks, a.impressions ? ((a.clicks / a.impressions) * 100).toFixed(2) : "0",
        a.is_active ? "بله" : "خیر", faTime(a.starts_at), faTime(a.ends_at),
      ]));
  };
  document.getElementById("b-clear").onclick = () => { selected.clear(); renderTable(); };
  if (writable) {
    document.getElementById("b-activate").onclick = () => bulkAds("activate", selected, rows);
    document.getElementById("b-deactivate").onclick = () => bulkAds("deactivate", selected, rows);
    document.getElementById("b-delete").onclick = () =>
      confirmDialog(`${faNum(selected.size)} کمپین انتخاب‌شده حذف شود؟ این عملیات بازگشت‌پذیر نیست.`, () => bulkAds("delete", selected, rows));
    document.getElementById("a-add").onclick = () => openAdForm(null);
  }
  renderTable();
}

async function bulkAds(action, selected, rows) {
  const ids = [...selected];
  if (!ids.length) { toast("کمپینی انتخاب نشده است", "err"); return; }
  try {
    const r = await api("ads/bulk", { method: "POST", body: { action, ids } });
    toast(`${faNum(r.affected)} کمپین ${action === "activate" ? "فعال" : action === "deactivate" ? "غیرفعال" : "حذف"} شد`, "ok2");
    selected.clear();
    renderPage("ads");
  } catch (ex) { toast(ex.message, "err"); }
}

/* پیش‌نمایش زنده بنر داخل فرم */
function adPreviewHtml(a) {
  const meta = AD_PLACE_META[a.placement] || { icon: "info" };
  return `
  <div class="preview-banner">
    ${a.image_url ? `<img src="${esc(a.image_url)}" alt="تصویر بنر ${esc(a.title || "")}" onerror="this.style.display='none'" />` : ""}
    <div class="pb-body">
      <div class="pb-row">
        ${a.badge ? `<span class="pb-badge">${esc(a.badge)}</span>` : ""}
        <span class="pb-place"><span class="material">${meta.icon}</span>${PLACE_LABEL[a.placement] || ""}</span>
      </div>
      <b class="pb-title">${esc(a.title || "عنوان بنر تبلیغ")}</b>
      ${a.subtitle ? `<span class="pb-sub">${esc(a.subtitle)}</span>` : ""}
      ${a.cta_text ? `<span class="pb-cta">${esc(a.cta_text)}<span class="material">chevron_left</span></span>` : ""}
    </div>
  </div>`;
}

function openAdForm(ad) {
  const isEdit = !!ad;
  const dt = (v) => v ? new Date(v).toISOString().slice(0, 16) : "";
  const close = modal(isEdit ? "ویرایش تبلیغ" : "تبلیغ جدید", `
    <div class="field"><label>عنوان</label><input id="f-title" value="${esc(ad?.title || "")}" placeholder="مثلاً بنر فروشگاه X" /></div>
    <div class="field"><label>متن کوتاه بنر (اختیاری)</label><input id="f-subtitle" value="${esc(ad?.subtitle || "")}" placeholder="یک جمله معرفی کوتاه" /></div>
    <div class="grid cols-2">
      <div class="field"><label>برچسب (اختیاری)</label><input id="f-badge" value="${esc(ad?.badge || "")}" placeholder="مثلاً پیشنهاد ویژه" /></div>
      <div class="field"><label>تبلیغ‌دهنده (اختیاری)</label><input id="f-advertiser" value="${esc(ad?.advertiser || "")}" placeholder="نام کسب‌وکار" /></div>
    </div>
    <div class="field"><label>آدرس تصویر</label><input id="f-img" value="${esc(ad?.image_url || "")}" placeholder="https://…" style="direction:ltr" /></div>
    <div class="grid cols-2">
      <div class="field"><label>لینک مقصد</label><input id="f-link" value="${esc(ad?.link_url || "")}" placeholder="https://…" style="direction:ltr" /></div>
      <div class="field"><label>متن دکمه فراخوان (اختیاری)</label><input id="f-cta" value="${esc(ad?.cta_text || "")}" placeholder="مثلاً مشاهده" /></div>
    </div>
    <div class="field"><label>محل نمایش</label>
      <select id="f-place">
        ${Object.keys(AD_PLACE_META).map((p) => `<option value="${p}" ${(ad?.placement || "home") === p ? "selected" : ""}>${PLACE_LABEL[p]}</option>`).join("")}
      </select></div>
    <div class="field"><label>اولویت نمایش (۰ تا ۱۰۰ — بالاتر = زودتر)</label>
      <input id="f-priority" type="number" min="0" max="100" value="${ad?.priority ?? 10}" /></div>
    <div class="field"><label>بازه نمایش</label>
      <div class="grid cols-2">
        <input id="f-start" type="datetime-local" value="${dt(ad?.starts_at)}" aria-label="شروع نمایش" />
        <input id="f-end" type="datetime-local" value="${dt(ad?.ends_at)}" aria-label="پایان نمایش" />
      </div>
      <div class="presets">
        <button type="button" class="btn btn-sm" data-preset="now">شروع: همین حالا</button>
        <button type="button" class="btn btn-sm" data-preset="7d">تا ۷ روز بعد</button>
        <button type="button" class="btn btn-sm" data-preset="30d">تا ۳۰ روز بعد</button>
        <button type="button" class="btn btn-sm" data-preset="today">تا پایان امروز</button>
        <button type="button" class="btn btn-sm" data-preset="clear">پاک‌کردن بازه</button>
      </div></div>
    <div class="field"><label>وضعیت</label>
      <select id="f-active"><option value="1" ${ad?.is_active ? "selected" : ""}>فعال</option><option value="0" ${!ad || !ad.is_active ? "selected" : ""}>خاموش</option></select></div>
    <div class="field"><label>پیش‌نمایش بنر در اپلیکیشن</label><div id="f-preview">${adPreviewHtml(ad || {})}</div></div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "افزودن"}</button>`);

  const readForm = () => ({
    title: document.getElementById("f-title").value.trim(),
    subtitle: document.getElementById("f-subtitle").value.trim(),
    badge: document.getElementById("f-badge").value.trim(),
    advertiser: document.getElementById("f-advertiser").value.trim(),
    image_url: document.getElementById("f-img").value.trim(),
    link_url: document.getElementById("f-link").value.trim(),
    cta_text: document.getElementById("f-cta").value.trim(),
    placement: document.getElementById("f-place").value,
    is_active: Number(document.getElementById("f-active").value),
  });
  const refreshPreview = () => { document.getElementById("f-preview").innerHTML = adPreviewHtml(readForm()); };
  ["f-title", "f-subtitle", "f-badge", "f-advertiser", "f-img", "f-cta", "f-place"].forEach((id) => {
    document.getElementById(id).addEventListener("input", refreshPreview);
  });

  document.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => {
    const now = new Date();
    const start = document.getElementById("f-start");
    const end = document.getElementById("f-end");
    const set = (el, d) => { el.value = d ? new Date(d).toISOString().slice(0, 16) : ""; };
    const fmtLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    switch (b.dataset.preset) {
      case "now": start.value = fmtLocal(now); break;
      case "7d": { if (!start.value) start.value = fmtLocal(now); const e2 = new Date(now.getTime() + 7 * 86400000); end.value = fmtLocal(e2); break; }
      case "30d": { if (!start.value) start.value = fmtLocal(now); const e2 = new Date(now.getTime() + 30 * 86400000); end.value = fmtLocal(e2); break; }
      case "today": { if (!start.value) start.value = fmtLocal(now); const e2 = new Date(now); e2.setHours(23, 59, 0, 0); end.value = fmtLocal(e2); break; }
      case "clear": start.value = ""; end.value = ""; break;
    }
  }));

  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const body = readForm();
    body.priority = document.getElementById("f-priority").value;
    body.starts_at = document.getElementById("f-start").value ? new Date(document.getElementById("f-start").value).toISOString() : null;
    body.ends_at = document.getElementById("f-end").value ? new Date(document.getElementById("f-end").value).toISOString() : null;
    if (!body.title) { toast("عنوان الزامی است", "err"); return; }
    if (body.starts_at && body.ends_at && new Date(body.starts_at) > new Date(body.ends_at)) {
      toast("تاریخ پایان نمی‌تواند قبل از شروع باشد", "err"); return;
    }
    try {
      await api(isEdit ? `ads/${ad.id}` : "ads", { method: isEdit ? "PUT" : "POST", body });
      toast(isEdit ? "تبلیغ بروزرسانی شد" : "تبلیغ اضافه شد", "ok2");
      close(); renderPage("ads");
    } catch (ex) { toast(ex.message, "err"); }
  };
}

/* ---------- درآمدها و قراردادها ---------- */

const REV_STATUS = {
  pending: ["در انتظار وصول", "warn"],
  partial: ["پرداخت ناقص", "info"],
  paid: ["تسویه‌شده", "ok"],
};
const PAY_METHODS = ["واریز بانکی", "کارت به کارت", "نقدی", "چک", "درگاه آنلاین"];

async function pageRevenues(host) {
  const writable = can("operator");
  let lastRows = [];
  host.innerHTML = `
    ${pageHead("درآمدها و قراردادها", "ثبت قراردادهای درآمدی با سازمان‌ها و شرکت‌ها همراه با مستندات، شرایط و بازه قرارداد؛ پیگیری پرداخت‌ها و دریافت صورت‌حساب دوره‌ای PDF.",
      `${writable ? `<button class="btn btn-primary" id="rv-add"><span class="material">add</span><span>قرارداد درآمد جدید</span></button>` : ""}
       <button class="btn" id="rv-stmt"><span class="material">receipt</span><span>صورت‌حساب دوره‌ای (PDF)</span></button>`)}
    <div id="rv-kpis"></div>
    <div class="toolbar">
      <input id="rv-q" placeholder="جست‌وجوی عنوان، سازمان یا شماره قرارداد…" style="min-width:240px" />
      <select id="rv-status" aria-label="فیلتر وضعیت">
        <option value="">همه وضعیت‌ها</option>
        <option value="pending">در انتظار وصول</option>
        <option value="partial">پرداخت ناقص</option>
        <option value="paid">تسویه‌شده</option>
      </select>
      <span class="toolbar-note" id="rv-count"></span>
    </div>
    <div id="rv-table"></div>`;

  const load = async () => {
    const q = document.getElementById("rv-q").value.trim();
    const st = document.getElementById("rv-status").value;
    const rows = await api(`revenues?q=${encodeURIComponent(q)}&status=${st}`);
    lastRows = rows;
    const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
    const paid = rows.reduce((s, r) => s + (r.paid_amount || 0), 0);
    const settled = rows.filter((r) => r.status === "paid").length;
    document.getElementById("rv-kpis").innerHTML = `
      <div class="kpi-grid kpi-grid-5">
        ${kpi("قراردادها", "handshake", rows.length, "قرارداد در این نما", "t-primary")}
        ${kpi("مبلغ کل قراردادها", "payments", faMoneyShort(total), "مجموع ارزش قراردادها", "t-surface")}
        ${kpi("وصول‌شده", "savings", faMoneyShort(paid), total ? faNum(Math.round((paid / total) * 100)) + "٪ از مبلغ کل" : "بدون پرداخت", "t-tertiary")}
        ${kpi("مانده وصول", "hourglass_top", faMoneyShort(total - paid), "در انتظار پرداخت", "t-dim")}
        ${kpi("تسویه‌شده", "task_alt", settled, "قرارداد با پرداخت کامل", "t-primary")}
      </div>`;
    document.getElementById("rv-count").textContent = `${faNum(rows.length)} قرارداد`;
    document.getElementById("rv-table").innerHTML = rows.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>قرارداد / سازمان</th><th>مبلغ کل</th><th>وضعیت وصول</th><th>بازه قرارداد</th><th class="cell-center">مستندات</th><th>ثبت</th>${writable ? "<th>عملیات</th>" : ""}</tr></thead>
        <tbody>
          ${rows.map((r) => {
            const [lbl, cls] = REV_STATUS[r.status] || [r.status, "off"];
            const pct = r.amount ? Math.min(Math.round((r.paid_amount / r.amount) * 100), 100) : 0;
            const left = r.contract_end ? Math.ceil((new Date(r.contract_end + "T23:59:59") - Date.now()) / 86400000) : null;
            return `<tr>
              <td><b>${esc(r.title)}</b><span class="cell-sub">${esc(r.org_name)}${r.contract_no ? " — قرارداد شماره " + esc(r.contract_no) : ""}</span></td>
              <td><b>${faMoney(r.amount)}</b></td>
              <td>
                <div class="cell-meter">
                  <div class="meter-row"><span class="m-imp">${faMoney(r.paid_amount)}</span><span class="m-ctr">${faNum(pct)}٪</span></div>
                  <div class="meter wide"><div class="meter-fill ${pct >= 100 ? "good" : ""}" style="width:${Math.max(pct, 3)}%"></div></div>
                </div>
                <span class="badge ${cls}" style="margin-top:6px">${lbl}</span>
              </td>
              <td class="cell-range">
                <span>${faDate(r.contract_start)}</span>
                <span class="m-live" style="display:block">تا ${faDate(r.contract_end)}</span>
                ${left !== null ? `<span class="day-chip ${left < 0 ? "bad" : ""}">${left < 0 ? "قرارداد منقضی شده" : faNum(left) + " روز مانده"}</span>` : '<span class="cell-sub">بدون بازه</span>'}
              </td>
              <td class="cell-center"><span class="badge ${r.docs_count ? "info" : "off"}">${faNum(r.docs_count)} سند</span></td>
              <td>${faDate(r.created_at)}</td>
              <td><div class="acts">
                <button class="icon-btn" data-detail="${r.id}" title="جزئیات، پرداخت‌ها و مستندات"><span class="material">folder_open</span></button>
                ${writable ? `<button class="icon-btn" data-edit="${r.id}" title="ویرایش قرارداد"><span class="material">edit</span></button>
                <button class="icon-btn danger" data-del="${r.id}" data-name="${esc(r.title)}" title="حذف قرارداد"><span class="material">delete</span></button>` : ""}
              </div></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>` : `<div class="card"><div class="empty"><span class="material">handshake</span>قراردادی ثبت نشده است — با دکمه «قرارداد درآمد جدید» شروع کنید</div></div>`;
    document.querySelectorAll("[data-detail]").forEach((b) => (b.onclick = () => openRevenueDetail(lastRows.find((x) => x.id === Number(b.dataset.detail)))));
    if (writable) {
      document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openRevenueForm(rows.find((x) => x.id === Number(b.dataset.edit)), load)));
      document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog(`قرارداد «${b.dataset.name}» و همه پرداخت‌ها و مستنداتش حذف شود؟ این عملیات بازگشت‌پذیر نیست.`, async () => {
          await api(`revenues/${b.dataset.del}`, { method: "DELETE" });
          toast("قرارداد حذف شد", "ok2"); load();
        })));
    }
  };
  document.getElementById("rv-q").oninput = load;
  document.getElementById("rv-status").onchange = load;
  const addBtn = document.getElementById("rv-add");
  if (addBtn) addBtn.onclick = () => openRevenueForm(null, load);
  document.getElementById("rv-stmt").onclick = () => openStatementModal();
  await load();
}

/* آپلود چند فایل مستندات برای قرارداد */
async function uploadRevenueDocs(rid, files) {
  const token = localStorage.getItem(TOKEN_KEY);
  for (const f of files) {
    const fd = new FormData();
    fd.append("file", f, f.name);
    const res = await fetch(apiPath(`revenues/${rid}/docs`), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const json = await res.json().catch(() => null);
    if (!json || !json.ok) throw new Error((json && json.error && json.error.message) || `آپلود «${f.name}» ناموفق بود`);
  }
}

function openRevenueForm(rev, after) {
  const isEdit = !!rev;
  const close = modal(isEdit ? "ویرایش قرارداد درآمد" : "قرارداد درآمد جدید", `
    <div class="field"><label>عنوان قرارداد *</label><input id="f-rtitle" value="${esc(rev?.title || "")}" placeholder="مثلاً تبلیغات بنری یک‌ساله" /></div>
    <div class="grid cols-2">
      <div class="field"><label>سازمان / شرکت *</label><input id="f-rorg" value="${esc(rev?.org_name || "")}" placeholder="نام سازمان یا شرکت" /></div>
      <div class="field"><label>شماره قرارداد (اختیاری)</label><input id="f-rno" value="${esc(rev?.contract_no || "")}" placeholder="مثلاً ۱۴۰۴/۱۲۳" /></div>
    </div>
    <div class="grid cols-2">
      <div class="field"><label>مبلغ کل قرارداد (تومان) *</label><input id="f-ramount" type="number" min="0" value="${rev?.amount ?? ""}" placeholder="مثلاً ۵۰۰۰۰۰۰۰۰" /></div>
      <div class="field"><label>وضعیت وصول</label><div class="order-chip" style="font-size:12px; padding:8px 14px; display:inline-block">${(REV_STATUS[isEdit && rev.status ? rev.status : "pending"] || ["—"])[0]} — با ثبت پرداخت‌ها بروزرسانی می‌شود</div></div>
    </div>
    <div class="grid cols-2">
      <div class="field"><label>تاریخ شروع قرارداد</label><input id="f-rstart" type="date" value="${esc(rev?.contract_start || "")}" /></div>
      <div class="field"><label>تاریخ پایان قرارداد</label><input id="f-rend" type="date" value="${esc(rev?.contract_end || "")}" /></div>
    </div>
    <div class="field"><label>شرایط قرارداد</label><textarea id="f-rterms" rows="3" placeholder="شرایط، تعهدات و جزئیات توافق با سازمان…">${esc(rev?.terms || "")}</textarea></div>
    <div class="grid cols-2">
      <div class="field"><label>نام رابط سازمان (اختیاری)</label><input id="f-rcontact" value="${esc(rev?.contact_name || "")}" /></div>
      <div class="field"><label>تلفن رابط (اختیاری)</label><input id="f-rphone" value="${esc(rev?.contact_phone || "")}" style="direction:ltr" /></div>
    </div>
    <div class="field"><label>یادداشت (اختیاری)</label><input id="f-rnotes" value="${esc(rev?.notes || "")}" /></div>
    <div class="field"><label>مستندات قرارداد (تصویر / PDF — چند فایل)</label><input id="f-rdocs" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
      <span class="hint">${isEdit ? "فایل‌های انتخابی به مستندات فعلی اضافه می‌شوند." : "پس از ثبت قرارداد، فایل‌ها به‌طور خودکار آپلود می‌شوند. سقف هر فایل ۱۵ مگابایت."}</span></div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "ثبت قرارداد"}</button>`);
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const body = {
      title: document.getElementById("f-rtitle").value.trim(),
      org_name: document.getElementById("f-rorg").value.trim(),
      contract_no: document.getElementById("f-rno").value.trim(),
      amount: Number(document.getElementById("f-ramount").value) || 0,
      contract_start: document.getElementById("f-rstart").value,
      contract_end: document.getElementById("f-rend").value,
      terms: document.getElementById("f-rterms").value.trim(),
      contact_name: document.getElementById("f-rcontact").value.trim(),
      contact_phone: document.getElementById("f-rphone").value.trim(),
      notes: document.getElementById("f-rnotes").value.trim(),
    };
    if (!body.title) { toast("عنوان قرارداد الزامی است", "err"); return; }
    if (!body.org_name) { toast("نام سازمان یا شرکت الزامی است", "err"); return; }
    if (body.contract_start && body.contract_end && body.contract_end < body.contract_start) {
      toast("تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد", "err"); return;
    }
    const files = Array.from(document.getElementById("f-rdocs").files || []);
    const saveBtn = document.getElementById("f-save");
    saveBtn.disabled = true;
    try {
      const r = await api(isEdit ? `revenues/${rev.id}` : "revenues", { method: isEdit ? "PUT" : "POST", body });
      const rid = isEdit ? rev.id : r.id;
      if (files.length) {
        toast(`در حال آپلود ${faNum(files.length)} سند…`, "ok2");
        await uploadRevenueDocs(rid, files);
        toast(`${faNum(files.length)} سند آپلود شد`, "ok2");
      }
      toast(isEdit ? "قرارداد بروزرسانی شد" : "قرارداد ثبت شد", "ok2");
      close();
      after ? after() : renderPage("revenues");
    } catch (ex) { toast(ex.message, "err"); }
    saveBtn.disabled = false;
  };
}

async function openRevenueDetail(rev) {
  if (!rev) return;
  const writable = can("operator");
  const close0 = modal("در حال بارگذاری…", '<div class="empty"><span class="material">hourglass_empty</span>در حال دریافت جزئیات…</div>', "");
  try {
    const r = await api(`revenues/${rev.id}`);
    const [lbl, cls] = REV_STATUS[r.status] || [r.status, "off"];
    const pct = r.amount ? Math.min(Math.round((r.paid_amount / r.amount) * 100), 100) : 0;
    const remaining = Math.max((r.amount || 0) - (r.paid_amount || 0), 0);
    const qp = new URLSearchParams(location.search).get("XTransformPort");
    const docUrl = (f) => `uploads/${f}${qp ? "?XTransformPort=" + encodeURIComponent(qp) : ""}`;
    const sizeFmt = (s) => s >= 1048576 ? (s / 1048576).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + " مگابایت" : Math.max(1, Math.round(s / 1024)) + " کیلوبایت";
    const docIcon = (d) => (d.mime && d.mime.startsWith("image")) || /\.(png|jpe?g|webp|gif)$/i.test(d.filename) ? "image" : /\.pdf$/i.test(d.filename) ? "picture_as_pdf" : "description";
    const close = modal(`قرارداد — ${r.title}`, `
      <div class="detail-grid">
        <div class="detail-row"><span>سازمان / شرکت</span><b>${esc(r.org_name)}</b></div>
        ${r.contract_no ? `<div class="detail-row"><span>شماره قرارداد</span><b>${esc(r.contract_no)}</b></div>` : ""}
        <div class="detail-row"><span>مبلغ کل</span><b>${faMoney(r.amount)}</b></div>
        <div class="detail-row"><span>وصول‌شده</span><b>${faMoney(r.paid_amount)} (${faNum(pct)}٪)</b></div>
        <div class="detail-row"><span>مانده</span><b>${faMoney(remaining)}</b></div>
        <div class="detail-row"><span>وضعیت</span><span class="badge ${cls}">${lbl}</span></div>
        <div class="detail-row"><span>بازه قرارداد</span><b>${faDate(r.contract_start)} تا ${faDate(r.contract_end)}</b></div>
        ${r.contact_name ? `<div class="detail-row"><span>رابط سازمان</span><b>${esc(r.contact_name)}${r.contact_phone ? " — " + esc(r.contact_phone) : ""}</b></div>` : ""}
      </div>
      ${r.terms ? `<div class="field"><label>شرایط قرارداد</label><div class="terms-box">${esc(r.terms)}</div></div>` : ""}
      ${r.notes ? `<p class="card-sub" style="margin-top:8px">یادداشت: ${esc(r.notes)}</p>` : ""}
      <h4 style="margin:18px 0 0; font-size:13px"><span class="material" style="vertical-align:middle; font-size:16px; color:var(--primary)">payments</span> پرداخت‌ها (${faNum(r.payments.length)})</h4>
      <div class="pay-list">
        ${r.payments.length ? r.payments.map((p) => `
          <div class="pay-item">
            <span class="material" style="color:var(--tertiary-container)">check_circle</span>
            <div style="flex:1"><b>${faMoney(p.amount)}</b><div class="p-meta">${faTime(p.paid_at)}${p.method ? " · " + esc(p.method) : ""}${p.reference ? " · پیگیری: " + esc(p.reference) : ""}${p.note ? " · " + esc(p.note) : ""}</div></div>
            ${writable ? `<button class="icon-btn danger" data-paydel="${p.id}" title="حذف پرداخت"><span class="material">delete</span></button>` : ""}
          </div>`).join("") : '<p class="card-sub">هنوز پرداختی ثبت نشده است.</p>'}
      </div>
      ${writable ? `
      <div style="margin-top:10px; padding:12px; background:var(--surface-low); border-radius:10px">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px; padding:9px 12px; background:#fff; border:1px dashed var(--primary); border-radius:10px">
          <div style="display:flex; align-items:center; gap:8px; font-size:13px">
            <span class="material" style="font-size:18px; color:var(--primary)">account_balance_wallet</span>
            <span>مانده باقی‌مانده قرارداد:</span>
            <b style="color:var(--primary); font-size:15px">${faMoney(remaining)}</b>
            ${remaining > 0 ? `<span class="hint">${faNum(pct)}٪ پرداخت شده</span>` : ""}
          </div>
          ${remaining > 0
            ? `<button class="btn btn-sm" id="f-payfill" title="درج خودکار مبلغ مانده در فیلد پرداخت"><span class="material">bolt</span><span>انتخاب مانده و پرداخت</span></button>`
            : `<span class="badge ok">تسویه کامل — مانده‌ای باقی نمانده</span>`}
        </div>
        <div class="grid cols-2">
          <div class="field"><label>مبلغ پرداخت (تومان)</label><input id="f-pamount" type="number" min="1" placeholder="مثلاً ۱۰۰۰۰۰۰۰۰" /></div>
          <div class="field"><label>تاریخ پرداخت</label><input id="f-pdate" type="date" value="${todayLocal()}" /></div>
        </div>
        <div class="grid cols-2" style="margin-top:8px">
          <div class="field"><label>نحوه پرداخت</label><select id="f-pmethod">${PAY_METHODS.map((m) => `<option>${m}</option>`).join("")}</select></div>
          <div class="field"><label>شماره پیگیری (اختیاری)</label><input id="f-pref" /></div>
        </div>
        <button class="btn btn-primary btn-sm" id="f-payadd" style="margin-top:6px"><span class="material">add</span><span>ثبت پرداخت</span></button>
      </div>` : ""}
      <h4 style="margin:18px 0 0; font-size:13px"><span class="material" style="vertical-align:middle; font-size:16px; color:var(--primary)">folder</span> مستندات (${faNum(r.docs.length)})</h4>
      <div class="doc-list">
        ${r.docs.length ? r.docs.map((d) => `
          <div class="doc-item">
            <span class="material">${docIcon(d)}</span>
            <b title="${esc(d.original_name)}">${esc(d.original_name)}</b>
            <small>${sizeFmt(d.size)} — ${faDate(d.created_at)}</small>
            <a class="icon-btn" href="${docUrl(d.filename)}" target="_blank" rel="noopener" title="مشاهده / دانلود"><span class="material">download</span></a>
            ${writable ? `<button class="icon-btn danger" data-docdel="${d.id}" title="حذف سند"><span class="material">delete</span></button>` : ""}
          </div>`).join("") : '<p class="card-sub">سندی آپلود نشده است.</p>'}
      </div>
      ${writable ? `
      <div class="field" style="margin-top:10px"><label>افزودن مستند جدید</label><input id="f-docfile" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
        <button class="btn btn-sm" id="f-docadd" style="margin-top:8px"><span class="material">upload</span><span>آپلود مستندات</span></button></div>` : ""}`,
      `<button class="btn" id="f-cancel">بستن</button>`);
    /* مودال اصلی جای مودال بارگذاری را می‌گیرد — نیازی به بستن جداگانه نیست */
    document.getElementById("f-cancel").onclick = close;
    if (writable) {
      /* انتخاب سریع مانده — درج خودکار مبلغ باقی‌مانده در فیلد پرداخت */
      const fillBtn = document.getElementById("f-payfill");
      if (fillBtn) fillBtn.onclick = () => {
        const inp = document.getElementById("f-pamount");
        inp.value = remaining;
        inp.focus();
        toast("مبلغ مانده در فیلد پرداخت قرار گرفت — «ثبت پرداخت» را بزنید", "ok2");
      };
      document.getElementById("f-payadd").onclick = async () => {
        const amount = Number(document.getElementById("f-pamount").value) || 0;
        if (amount <= 0) { toast("مبلغ پرداخت را وارد کنید", "err"); return; }
        const submit = async () => {
          try {
            await api(`revenues/${r.id}/payments`, {
              method: "POST",
              body: {
                amount,
                paid_at: document.getElementById("f-pdate").value,
                method: document.getElementById("f-pmethod").value,
                reference: document.getElementById("f-pref").value.trim(),
              },
            });
            toast("پرداخت ثبت شد", "ok2");
            renderPage("revenues");
            openRevenueDetail(rev);
          } catch (ex) { toast(ex.message, "err"); }
        };
        if (remaining > 0 && amount > remaining) {
          confirmDialog(`مبلغ پرداخت (${faMoney(amount)}) از مانده قرارداد (${faMoney(remaining)}) بیشتر است؛ مبلغ اضافه به‌عنوان اضافه‌پرداخت ثبت می‌شود. ادامه می‌دهید؟`, submit);
        } else await submit();
      };
      document.querySelectorAll("[data-paydel]").forEach((b) => (b.onclick = () =>
        confirmDialog("این پرداخت حذف شود؟", async () => {
          await api(`revenues/${r.id}/payments/${b.dataset.paydel}`, { method: "DELETE" });
          toast("پرداخت حذف شد", "ok2");
          renderPage("revenues");
          openRevenueDetail(rev);
        })));
      document.getElementById("f-docadd").onclick = async () => {
        const files = Array.from(document.getElementById("f-docfile").files || []);
        if (!files.length) { toast("ابتدا فایل را انتخاب کنید", "err"); return; }
        try {
          await uploadRevenueDocs(r.id, files);
          toast(`${faNum(files.length)} سند آپلود شد`, "ok2");
          renderPage("revenues");
          openRevenueDetail(rev);
        } catch (ex) { toast(ex.message, "err"); }
      };
      document.querySelectorAll("[data-docdel]").forEach((b) => (b.onclick = () =>
        confirmDialog("این سند حذف شود؟", async () => {
          await api(`revenues/${r.id}/docs/${b.dataset.docdel}`, { method: "DELETE" });
          toast("سند حذف شد", "ok2");
          renderPage("revenues");
          openRevenueDetail(rev);
        })));
    }
  } catch (ex) {
    close0();
    toast(ex.message, "err");
  }
}

/* صورت‌حساب دوره‌ای — انتخاب بازه و دریافت PDF */
function openStatementModal() {
  const close = modal("صورت‌حساب دوره‌ای درآمد", `
    <p class="card-sub" style="margin-top:0">بازه زمانی را انتخاب کنید؛ سند PDF صورت‌حساب در پنجره جدید باز می‌شود و می‌توانید آن را چاپ یا به‌صورت PDF ذخیره کنید.</p>
    <div class="presets">
      <button type="button" class="btn btn-sm" data-range="this-month">ماه جاری</button>
      <button type="button" class="btn btn-sm" data-range="last-month">ماه گذشته</button>
      <button type="button" class="btn btn-sm" data-range="this-year">از ابتدای سال</button>
      <button type="button" class="btn btn-sm" data-range="last-year">سال گذشته</button>
      <button type="button" class="btn btn-sm" data-range="all">همه زمان‌ها</button>
    </div>
    <div class="grid cols-2">
      <div class="field"><label>از تاریخ</label><input id="st-from" type="date" /></div>
      <div class="field"><label>تا تاریخ</label><input id="st-to" type="date" /></div>
    </div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-print"><span class="material">picture_as_pdf</span><span>دریافت PDF</span></button>`);
  const setRange = (k) => {
    const t = new Date();
    let from, to;
    if (k === "this-month") { from = new Date(t.getFullYear(), t.getMonth(), 1); to = t; }
    else if (k === "last-month") { from = new Date(t.getFullYear(), t.getMonth() - 1, 1); to = new Date(t.getFullYear(), t.getMonth(), 0); }
    else if (k === "this-year") { from = new Date(t.getFullYear(), 0, 1); to = t; }
    else if (k === "last-year") { from = new Date(t.getFullYear() - 1, 0, 1); to = new Date(t.getFullYear() - 1, 11, 31); }
    else { from = new Date(2000, 0, 1); to = t; }
    document.getElementById("st-from").value = localDate(from);
    document.getElementById("st-to").value = localDate(to);
  };
  document.querySelectorAll("[data-range]").forEach((b) => (b.onclick = () => setRange(b.dataset.range)));
  setRange("this-month");
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-print").onclick = () => {
    const from = document.getElementById("st-from").value;
    const to = document.getElementById("st-to").value;
    if (!from || !to) { toast("هر دو تاریخ را مشخص کنید", "err"); return; }
    printOpen(`mode=statement&from=${from}&to=${to}`);
    close();
  };
}

/* بازکردن سند چاپی — سازگار با دروازه XTransformPort و مسیر تمیز /admin */
function printOpen(query) {
  const qp = new URLSearchParams(location.search).get("XTransformPort");
  window.open(`${ASSET_P}print.html?${query}${qp ? `&XTransformPort=${encodeURIComponent(qp)}` : ""}`, "_blank", "noopener");
}

/* ---------- فاکتور تبلیغات ---------- */

const INV_STATUS = {
  issued: ["صادرشده", "info"],
  paid: ["پرداخت‌شده", "ok"],
  cancelled: ["لغوشده", "off"],
};

async function pageInvoices(host) {
  const writable = can("operator");
  let lastRows = [];
  host.innerHTML = `
    ${pageHead("فاکتور تبلیغات", "صدور فاکتور خدمات تبلیغاتی برای مشتریان با اقلام و تخفیف، شماره‌گذاری خودکار شمسی، پیگیری وضعیت پرداخت و چاپ PDF تمیز برای ارسال به مشتری.",
      writable ? `<button class="btn btn-primary" id="iv-add"><span class="material">add</span><span>فاکتور جدید</span></button>` : "")}
    <div id="iv-kpis"></div>
    <div class="toolbar">
      <input id="iv-q" placeholder="جست‌وجوی شماره فاکتور یا نام مشتری…" style="min-width:240px" />
      <select id="iv-status" aria-label="فیلتر وضعیت">
        <option value="">همه وضعیت‌ها</option>
        <option value="issued">صادرشده</option>
        <option value="paid">پرداخت‌شده</option>
        <option value="cancelled">لغوشده</option>
      </select>
      <span class="toolbar-note" id="iv-count"></span>
    </div>
    <div id="iv-table"></div>`;

  const load = async () => {
    const q = document.getElementById("iv-q").value.trim();
    const st = document.getElementById("iv-status").value;
    const rows = (await api(`invoices?q=${encodeURIComponent(q)}&status=${st}`)).map((v) => {
      let items = [];
      try { items = JSON.parse(v.items || "[]"); } catch {}
      return { ...v, items };
    });
    lastRows = rows;
    const valid = rows.filter((v) => v.status !== "cancelled");
    const total = valid.reduce((s, v) => s + (v.total || 0), 0);
    const paid = valid.filter((v) => v.status === "paid").reduce((s, v) => s + (v.total || 0), 0);
    const overdue = valid.filter((v) => v.status === "issued" && v.due_date && v.due_date < todayLocal()).length;
    document.getElementById("iv-kpis").innerHTML = `
      <div class="kpi-grid kpi-grid-5">
        ${kpi("فاکتورها", "receipt_long", rows.length, "فاکتور صادرشده", "t-primary")}
        ${kpi("مبلغ صادرشده", "payments", faMoneyShort(total), "مجموع فاکتورهای معتبر", "t-surface")}
        ${kpi("پرداخت‌شده", "savings", faMoneyShort(paid), "فاکتورهای تسویه‌شده", "t-tertiary")}
        ${kpi("مانده", "hourglass_top", faMoneyShort(total - paid), "در انتظار پرداخت مشتری", "t-dim")}
        ${kpi("سررسید گذشته", "event_busy", overdue, "پرداخت‌نشده با سررسید گذشته", overdue ? "t-tertiary" : "t-surface")}
      </div>`;
    document.getElementById("iv-count").textContent = `${faNum(rows.length)} فاکتور`;
    document.getElementById("iv-table").innerHTML = rows.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>شماره فاکتور</th><th>مشتری</th><th>موضوع</th><th>مبلغ نهایی</th><th>وضعیت</th><th>صدور</th><th>سررسید</th><th>عملیات</th></tr></thead>
        <tbody>
          ${rows.map((v) => {
            const [lbl, cls] = INV_STATUS[v.status] || [v.status, "off"];
            const isOverdue = v.status === "issued" && v.due_date && v.due_date < todayLocal();
            return `<tr>
              <td><b>${esc(v.number)}</b><span class="cell-sub">${faNum(v.items.length)} قلم خدمت</span></td>
              <td><b>${esc(v.customer_name)}</b>${v.customer_phone ? `<span class="cell-sub" style="direction:ltr; display:block">${esc(v.customer_phone)}</span>` : ""}</td>
              <td>${esc(v.title || "خدمات تبلیغات")}</td>
              <td><b>${faMoney(v.total)}</b>${v.discount ? `<span class="cell-sub">تخفیف: ${faMoney(v.discount)}</span>` : ""}</td>
              <td><div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start"><span class="badge ${cls}">${lbl}</span>${isOverdue ? '<span class="badge warn">سررسید گذشته</span>' : ""}</div></td>
              <td>${faDate(v.issue_date)}</td>
              <td>${faDate(v.due_date)}</td>
              <td><div class="acts">
                <button class="icon-btn" data-print="${v.id}" title="چاپ / PDF فاکتور"><span class="material">picture_as_pdf</span></button>
                ${writable ? `<button class="icon-btn" data-edit="${v.id}" title="ویرایش فاکتور"><span class="material">edit</span></button>
                <button class="icon-btn danger" data-del="${v.id}" data-name="${esc(v.number)}" title="حذف فاکتور"><span class="material">delete</span></button>` : ""}
              </div></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>` : `<div class="card"><div class="empty"><span class="material">receipt_long</span>فاکتوری صادر نشده است — با دکمه «فاکتور جدید» اولین فاکتور را بسازید</div></div>`;
    document.querySelectorAll("[data-print]").forEach((b) => (b.onclick = () => printOpen(`mode=invoice&id=${b.dataset.print}`)));
    if (writable) {
      document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openInvoiceForm(lastRows.find((x) => x.id === Number(b.dataset.edit)), load)));
      document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog(`فاکتور «${b.dataset.name}» حذف شود؟`, async () => {
          await api(`invoices/${b.dataset.del}`, { method: "DELETE" });
          toast("فاکتور حذف شد", "ok2"); load();
        })));
    }
  };
  document.getElementById("iv-q").oninput = load;
  document.getElementById("iv-status").onchange = load;
  const addBtn = document.getElementById("iv-add");
  if (addBtn) addBtn.onclick = () => openInvoiceForm(null, load);
  await load();
}

/* سازنده فاکتور با اقلام پویا */
function openInvoiceForm(inv, after) {
  const isEdit = !!inv;
  const items = isEdit && Array.isArray(inv.items) ? inv.items.map((it) => ({ ...it })) : [{ desc: "", qty: 1, price: "" }];
  const close = modal(isEdit ? "ویرایش فاکتور" : "فاکتور جدید تبلیغات", `
    <div class="grid cols-2">
      <div class="field"><label>نام مشتری / کسب‌وکار *</label><input id="f-cust" value="${esc(inv?.customer_name || "")}" placeholder="نام مشتری" /></div>
      <div class="field"><label>تلفن مشتری (اختیاری)</label><input id="f-custphone" value="${esc(inv?.customer_phone || "")}" style="direction:ltr" /></div>
    </div>
    <div class="field"><label>موضوع فاکتور</label><input id="f-ititle" value="${esc(inv?.title || "خدمات تبلیغات")}" /></div>
    <div class="field"><label>اقلام فاکتور</label>
      <div id="iv-items"></div>
      <button type="button" class="btn btn-sm" id="iv-additem"><span class="material">add</span><span>افزودن ردیف</span></button>
    </div>
    <div class="grid cols-2">
      <div class="field"><label>تخفیف (تومان)</label><input id="f-disc" type="number" min="0" value="${inv?.discount ?? 0}" /></div>
      <div class="field"><label>مبلغ نهایی</label><div id="iv-total" style="font-weight:800; font-size:15px; color:var(--primary); padding:8px 0">—</div></div>
    </div>
    <div class="grid cols-2">
      <div class="field"><label>تاریخ صدور</label><input id="f-issue" type="date" value="${esc(inv?.issue_date || todayLocal())}" /></div>
      <div class="field"><label>سررسید پرداخت (اختیاری)</label><input id="f-due" type="date" value="${esc(inv?.due_date || "")}" /></div>
    </div>
    <div class="field"><label>وضعیت فاکتور</label>
      <select id="f-istatus">
        <option value="issued" ${(inv?.status || "issued") === "issued" ? "selected" : ""}>صادرشده</option>
        <option value="paid" ${inv?.status === "paid" ? "selected" : ""}>پرداخت‌شده</option>
        <option value="cancelled" ${inv?.status === "cancelled" ? "selected" : ""}>لغوشده</option>
      </select></div>
    <div class="field"><label>یادداشت برای مشتری (اختیاری)</label><textarea id="f-inotes" rows="2" placeholder="در پایین فاکتور چاپی درج می‌شود…">${esc(inv?.notes || "")}</textarea></div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "صدور فاکتور"}</button>`);

  const updTotal = () => {
    const sum = items.reduce((s, it) => s + (Number(it.qty) || 1) * (Number(it.price) || 0), 0);
    const disc = Number(document.getElementById("f-disc").value) || 0;
    document.getElementById("iv-total").textContent = faMoney(Math.max(sum - disc, 0));
  };
  const renderItems = () => {
    const box = document.getElementById("iv-items");
    box.innerHTML = items.map((it, i) => `
      <div class="iv-row">
        <input class="iv-desc" data-i="${i}" value="${esc(it.desc)}" placeholder="شرح خدمت (مثلاً بنر صفحه اصلی — یک ماه)" />
        <input class="iv-qty" data-i="${i}" type="number" min="1" value="${it.qty ?? 1}" aria-label="تعداد" />
        <input class="iv-price" data-i="${i}" type="number" min="0" value="${it.price ?? ""}" placeholder="مبلغ واحد" aria-label="مبلغ واحد (تومان)" />
        <button type="button" class="icon-btn danger" data-rm="${i}" title="حذف ردیف" ${items.length === 1 ? "disabled" : ""}><span class="material">close</span></button>
      </div>`).join("");
    box.querySelectorAll(".iv-desc").forEach((el) => (el.oninput = () => { items[+el.dataset.i].desc = el.value; }));
    box.querySelectorAll(".iv-qty").forEach((el) => (el.oninput = () => { items[+el.dataset.i].qty = Number(el.value) || 1; updTotal(); }));
    box.querySelectorAll(".iv-price").forEach((el) => (el.oninput = () => { items[+el.dataset.i].price = Number(el.value) || 0; updTotal(); }));
    box.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { items.splice(+b.dataset.rm, 1); renderItems(); }));
    updTotal();
  };
  renderItems();
  document.getElementById("iv-additem").onclick = () => { items.push({ desc: "", qty: 1, price: "" }); renderItems(); };
  document.getElementById("f-disc").oninput = updTotal;
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const body = {
      customer_name: document.getElementById("f-cust").value.trim(),
      customer_phone: document.getElementById("f-custphone").value.trim(),
      title: document.getElementById("f-ititle").value.trim() || "خدمات تبلیغات",
      items: items.filter((it) => it.desc.trim()),
      discount: Number(document.getElementById("f-disc").value) || 0,
      issue_date: document.getElementById("f-issue").value,
      due_date: document.getElementById("f-due").value,
      status: document.getElementById("f-istatus").value,
      notes: document.getElementById("f-inotes").value.trim(),
    };
    if (!body.customer_name) { toast("نام مشتری الزامی است", "err"); return; }
    if (!body.items.length) { toast("حداقل یک قلم با شرح خدمت وارد کنید", "err"); return; }
    try {
      const r = await api(isEdit ? `invoices/${inv.id}` : "invoices", { method: isEdit ? "PUT" : "POST", body });
      toast(isEdit ? "فاکتور بروزرسانی شد" : `فاکتور ${r.number} صادر شد`, "ok2");
      close();
      after ? after() : renderPage("invoices");
    } catch (ex) { toast(ex.message, "err"); }
  };
}

/* ---------- دستیار صوتی ---------- */

async function pageVoice(host) {
  const writable = can("operator");
  const [lex, settings] = await Promise.all([api("voice-lexicon"), api("settings")]);
  let lexRows = lex;
  host.innerHTML = `
    ${pageHead("دستیار صوتی", "تنظیم متن‌های ثابت، فرهنگ تلفظ و تنظیمات مجاز سرویس صوتی.")}
    <div class="grid cols-2">
      <div>
        <div class="card" style="margin-bottom:16px">
          <h3><span class="material" style="color:var(--primary)">translate</span>آزمایش نگاشت گفتار به نوشتار</h3>
          <p class="card-sub" style="margin-top:0">متنی که کاربر به دستیار می‌گوید را وارد کنید و نتیجه نگاشت را ببینید.</p>
          <div class="lex-test">
            <input id="v-test-input" placeholder="مثلاً میلاد یا تجریش…" />
            <button class="btn btn-primary btn-sm" id="v-test-btn"><span class="material">play_arrow</span><span>آزمایش</span></button>
            <button class="btn btn-primary btn-sm" id="v-speak-btn"><span class="material">volume_up</span><span>تست صدا</span></button>
          </div>
          <div id="v-test-result"></div>
        </div>
        <div class="card">
          <h3><span class="material" style="color:var(--primary)">record_voice_over</span>تنظیمات سرویس صوتی</h3>
          <div class="field"><label>سرویس پردازش صوت</label>
            <select id="v-service" ${me.role !== "super" ? "disabled" : ""}>
              <option value="cloudflare-worker" ${settings.voice_service?.value === "cloudflare-worker" ? "selected" : ""}>Cloudflare Worker (فعلی)</option>
              <option value="native" ${settings.voice_service?.value === "native" ? "selected" : ""}>موتور نیتیو دستگاه</option>
              <option value="off" ${settings.voice_service?.value === "off" ? "selected" : ""}>غیرفعال</option>
            </select></div>
          <div class="field"><label>وضعیت دستیار صوتی</label>
            <select id="v-enabled" ${me.role !== "super" ? "disabled" : ""}>
              <option value="on" ${settings.voice_enabled?.value === "on" ? "selected" : ""}>فعال</option>
              <option value="off" ${settings.voice_enabled?.value === "off" ? "selected" : ""}>غیرفعال</option>
            </select></div>
          ${me.role === "super" ? `<button class="btn btn-primary" id="v-save">ذخیره تنظیمات صوتی</button>` : `<p class="card-sub">تغییر تنظیمات صوتی فقط برای مدیر کل مجاز است.</p>`}
          <p class="card-sub">فرمان‌های ثابت («شروع سفر»، «توقف»، «تکرار») بدون فراخوانی مدل زبانی پردازش می‌شوند.</p>
        </div>
      </div>
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">translate</span>فرهنگ تلفظ (${faNum(lexRows.length)} مدخل)</h3>
        <p class="card-sub" style="margin-top:0">نگاشت گفتار به نوشتار — برای تشخیص صحیح نام ایستگاه‌ها و مکان‌ها</p>
        <div class="lex-toolbar">
          <input id="v-q" placeholder="جست‌وجو در فرهنگ…" />
          ${writable ? `<button class="btn btn-sm" id="v-import"><span class="material">playlist_add</span><span>درون‌ریزی نام ایستگاه‌ها</span></button>` : ""}
        </div>
        <div id="v-lex"></div>
      </div>
    </div>`;
  const renderLex = (rows) => {
    document.getElementById("v-lex").innerHTML = rows.length ? `
      <div class="tbl-wrap" style="max-height:340px"><table class="tbl">
        <thead><tr><th>گفتاری</th><th>نوشتاری</th><th>اولویت</th>${writable ? "<th></th>" : ""}</tr></thead>
        <tbody>${rows.map((l) => `
          <tr><td>${esc(l.spoken)}</td><td>${esc(l.written)}</td><td>${l.priority}</td>
          ${writable ? `<td><div class="acts">
            <button class="icon-btn" data-edit="${l.id}" title="ویرایش مدخل"><span class="material">edit</span></button>
            <button class="icon-btn danger" data-del="${l.id}" title="حذف مدخل"><span class="material">delete</span></button>
          </div></td>` : ""}</tr>`).join("")}</tbody>
      </table></div>` : `<div class="empty"><span class="material">record_voice_over</span>مدخلی یافت نشد</div>`;
    if (writable) {
      document.querySelectorAll("#v-lex [data-edit]").forEach((b) => (b.onclick = () => openLexForm(rows.find((x) => x.id === Number(b.dataset.edit)))));
      document.querySelectorAll("#v-lex [data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog("این مدخل تلفظ حذف شود؟", async () => {
          await api(`voice-lexicon/${b.dataset.del}`, { method: "DELETE" });
          toast("مدخل حذف شد", "ok2"); renderPage("voice");
        })));
    }
  };
  renderLex(lexRows);
  document.getElementById("v-q").oninput = async (e) => {
    const q = e.target.value.trim();
    lexRows = await api(`voice-lexicon${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    renderLex(lexRows);
    document.querySelector("#v-lex").parentElement.querySelector("h3").innerHTML =
      `<span class="material" style="color:var(--primary)">translate</span>فرهنگ تلفظ (${faNum(lexRows.length)} مدخل)`;
  };
  const testBtn = document.getElementById("v-test-btn");
  const runTest = () => {
    const text = document.getElementById("v-test-input").value.trim();
    const out = document.getElementById("v-test-result");
    if (!text) { out.innerHTML = ""; return; }
    const hit = lex.find((l) => text.includes(l.spoken));
    out.innerHTML = `
      <div class="lex-result">
        <span class="material">${hit ? "check_circle" : "info"}</span>
        <div><b>ورودی:</b> ${esc(text)}</div>
        <div>${hit ? `<b>خروجی نگاشت:</b> ${esc(hit.written)} <span class="badge ok">یافت شد — اولویت ${hit.priority}</span>` : '<span class="badge off">نگاشتی یافت نشد — به مدل زبانی ارسال می‌شود</span>'}</div>
      </div>`;
  };
  testBtn.onclick = runTest;
  document.getElementById("v-test-input").addEventListener("keydown", (e) => { if (e.key === "Enter") runTest(); });

  /* ---- تست صدا: پخش واقعی تلفظ از سرویس ابری (پروکسی سمت سرور پنل) ---- */
  const speakBtn = document.getElementById("v-speak-btn");
  if (speakBtn) {
    let speakAudio = null;
    speakBtn.onclick = async () => {
      const text = document.getElementById("v-test-input").value.trim();
      const out = document.getElementById("v-test-result");
      if (!text) { toast("ابتدا متنی برای آزمایش وارد کنید", "err"); return; }
      speakBtn.disabled = true;
      speakBtn.innerHTML = '<span class="material">hourglass_top</span><span>در حال بارگذاری…</span>';
      try {
        const res = await api("tts", { method: "POST", raw: true, body: { text, gender: "female" } });
        const blob = await res.blob();
        if (!res.ok || !String(blob.type).includes("audio")) throw new Error("سرویس صدا پاسخ نامعتبر داد");
        if (speakAudio) { speakAudio.pause(); speakAudio = null; }
        speakAudio = new Audio(URL.createObjectURL(blob));
        await speakAudio.play();
        toast("پخش صدا آغاز شد", "ok2");
      } catch (ex) {
        toast(ex.message || "پخش صدا ممکن نشد", "err");
      } finally {
        speakBtn.disabled = false;
        speakBtn.innerHTML = '<span class="material">volume_up</span><span>تست صدا</span>';
      }
    };
  }
  document.getElementById("v-import")?.addEventListener("click", () =>
    confirmDialog("نام همه ایستگاه‌های فعال به‌عنوان مدخل تلفظ (اولویت ۵) وارد فرهنگ شود؟ مدخل‌های موجود رد می‌شوند.", async () => {
      try {
        const r = await api("voice-lexicon/import-stations", { method: "POST" });
        toast(`${faNum(r.added)} ایستگاه به فرهنگ تلفظ اضافه شد`, "ok2");
        renderPage("voice");
      } catch (ex) { toast(ex.message, "err"); }
    }));
  document.getElementById("v-save")?.addEventListener("click", async () => {
    try {
      await api("settings", { method: "PUT", body: { voice_service: document.getElementById("v-service").value, voice_enabled: document.getElementById("v-enabled").value } });
      toast("تنظیمات صوتی ذخیره شد", "ok2");
    } catch (ex) { toast(ex.message, "err"); }
  });
  function openLexForm(l) {
    const isEdit = !!l;
    const closeM = modal(isEdit ? "ویرایش مدخل" : "مدخل جدید", `
      <div class="field"><label>متن گفتاری (طوری که کاربر می‌گوید)</label><input id="f-spoken" value="${esc(l?.spoken || "")}" placeholder="مثلاً تجریش" /></div>
      <div class="field"><label>متن نوشتاری (نام رسمی)</label><input id="f-written" value="${esc(l?.written || "")}" placeholder="مثلاً تجریش" /></div>
      <div class="field"><label>اولویت</label><input id="f-prio" type="number" value="${l?.priority ?? 0}" /></div>`,
      `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "افزودن"}</button>`);
    document.getElementById("f-cancel").onclick = closeM;
    document.getElementById("f-save").onclick = async () => {
      const body = {
        spoken: document.getElementById("f-spoken").value.trim(),
        written: document.getElementById("f-written").value.trim(),
        priority: document.getElementById("f-prio").value,
      };
      if (!body.spoken || !body.written) { toast("هر دو مقدار الزامی است", "err"); return; }
      try {
        await api(isEdit ? `voice-lexicon/${l.id}` : "voice-lexicon", { method: isEdit ? "PUT" : "POST", body });
        toast("ذخیره شد", "ok2"); closeM(); renderPage("voice");
      } catch (ex) { toast(ex.message, "err"); }
    };
  }
  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-sm btn-primary";
  addBtn.textContent = "+ مدخل جدید";
  addBtn.onclick = () => openLexForm(null);
  document.querySelector("#v-lex").parentElement.querySelector("h3").appendChild(addBtn);
}

/* ---------- تنظیمات عمومی ---------- */

async function pageSettings(host) {
  const s = await api("settings");
  const readOnly = me.role !== "super";
  const F = (key, label, type = "text", hint = "") => `
    <div class="field"><label>${label}</label>
      <input id="st-${key}" value="${esc(s[key]?.value || "")}" ${readOnly ? "disabled" : ""} ${type === "number" ? 'type="number"' : ""} />
      ${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  host.innerHTML = `
    ${pageHead("تنظیمات سامانه", "نام، پیام‌ها، نسخه، تنظیمات تبلیغات و پارامترهای عمومی برنامه — فقط برای مدیر کل.")}
    <div class="grid cols-2">
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">app_shortcut</span>هویت برنامه</h3>
        ${F("app_name", "نام برنامه")}
        ${F("app_version", "نسخه فعلی")}
        ${F("app_subtitle", "زیرنویس لوگو", "text", "متن کوچک زیر عنوان «درمسیر» در هدر اپ و صفحه ورود — پیش‌فرض: دستیار هوشمند سفر شهری. خالی بگذارید = پیش‌فرض نمایش داده می‌شود.")}
        ${F("welcome_message", "پیام خوش‌آمد")}
        ${F("support_message", "پیام پشتیبانی")}
        ${F("support_phone", "تلفن پشتیبانی")}
        ${F("default_city", "شهر پیش‌فرض")}
      </div>
      <div>
        <div class="card" style="margin-bottom:16px">
          <h3><span class="material" style="color:var(--primary)">engineering</span>وضعیت عملیاتی</h3>
          <div class="field"><label>حالت نگهداری</label>
            <select id="st-maintenance_mode" ${readOnly ? "disabled" : ""}>
              <option value="off" ${s.maintenance_mode?.value !== "on" ? "selected" : ""}>خاموش (عادی)</option>
              <option value="on" ${s.maintenance_mode?.value === "on" ? "selected" : ""}>روشن (کاربران پیام نگهداری می‌بینند)</option>
            </select></div>
          ${F("force_update_version", "اجبار بروزرسانی تا نسخه (خالی = بدون اجبار)", "text", "اگر نسخه اپ کاربر از این عدد کمتر باشد، اپ بروزرسانی را اجباری می‌کند.")}
          ${F("store_link", "لینک فروشگاه (کافه‌بازار / مایکت)", "text", "برای دکمه «دریافت بروزرسانی» در اپ.")}
        </div>
        <div class="card">
          <h3><span class="material" style="color:var(--primary)">campaign</span>پارامترهای تبلیغات</h3>
          <div class="field"><label>کلید اصلی تبلیغات در اپ</label>
            <select id="st-ads_enabled" ${readOnly ? "disabled" : ""}>
              <option value="on" ${s.ads_enabled?.value !== "off" ? "selected" : ""}>روشن — تبلیغ‌ها در اپ نمایش داده می‌شوند</option>
              <option value="off" ${s.ads_enabled?.value === "off" ? "selected" : ""}>خاموش — همه جایگاه‌های آگهی اپ خالی می‌شوند</option>
            </select>
            <p class="hint">با خاموش‌کردن این کلید، همه تبلیغ‌ها (همه جایگاه‌ها) در اپ و ابر حذف می‌شوند؛ کمپین‌ها حذف نمی‌شوند و با روشن‌کردن دوباره فعال می‌مانند.</p>
          </div>
          ${F("ads_rotation_seconds", "فاصله چرخش بنرها (ثانیه)", "number", "هر چند ثانیه بنر بعدی در یک جایگاه نمایش داده می‌شود.")}
          ${F("max_ads_per_placement", "حداکثر بنر در هر جایگاه", "number", "سقف کمپین‌های هم‌زمان فعال در یک جایگاه نمایش.")}
        </div>
        <div class="card" style="margin-top:16px">
          <h3><span class="material" style="color:var(--primary)">cloud</span>سرور ابری (Cloudflare)</h3>
          ${F("cloud_api_url", "آدرس سرور ابری (Worker)", "text", "مثلاً https://darmasir-api.hkhoramir.workers.dev — پس از wrangler deploy")}
          ${F("cloud_sync_key", "کلید همگام‌سازی ابر", "text", "همان مقدار DARMASIR_SYNC_KEY در wrangler.toml ورکر")}
          ${F("app_server_url", "نشانی عمومی سرور اپ (همگام‌سازی مستقیم کاربران)", "text", "مثلاً https://app.example.ir — اپ اندروید ثبت‌نام و فعالیت کاربران را به این آدرس هم می‌فرستد تا مستقیم در Turso بنشیند؛ خالی = فقط ورکر ابری")}
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            ${!readOnly ? `<button class="btn" id="cloud-test">تست اتصال ابر</button>` : ""}
            ${!readOnly ? `<button class="btn btn-primary" id="cloud-sync">همگام‌سازی محتوا با ابر</button>` : ""}
          </div>
          <p class="hint" id="cloud-status">محتوا (شهرها/خطوط/ایستگاه‌ها/بنرها/تنظیمات/واژگان) به دیتابیس رایگان D1 کپی می‌شود.</p>
        </div>
        <div class="card" style="margin-top:16px">
          <h3><span class="material" style="color:var(--primary)">mail</span>ایمیل (SMTP) — اطلاع تیکت‌ها</h3>
          <p class="card-sub">با تنظیم ایمیل، هر تیکت جدید به «ایمیل مدیر» اطلاع داده می‌شود و پاسخ تیکت به کاربر (اگر با ایمیل ثبت کرده باشد) ارسال می‌شود. بدون SMTP هم تیکت‌ها در بخش «تیکت‌ها» ثبت و پاسخ داده می‌شوند.</p>
          ${F("admin_email", "ایمیل مدیر (دریافت اطلاع تیکت جدید)", "text", "مثلاً support@metrojo.ir — خالی = اطلاع ایمیلی ارسال نمی‌شود.")}
          ${F("smtp_host", "SMTP سرور", "text", "مثلاً smtp.gmail.com یا mail.metrojo.ir")}
          ${F("smtp_port", "پورت SMTP", "number", "۵۸۷ برای STARTTLS / ۴۶۵ برای SSL")}
          ${F("smtp_user", "نام کاربری SMTP")}
          ${F("smtp_pass", "رمز SMTP", "text", "برای Gmail از App Password استفاده کنید.")}
          ${F("smtp_from", "فرستنده نمایشی", "text", "مثلاً درمسیر <support@metrojo.ir> — خالی = از نام کاربری SMTP")}
        </div>
        ${!readOnly ? `<button class="btn btn-primary" id="st-save" style="margin-top:16px">ذخیره همه تنظیمات</button>` : `<p class="card-sub">ذخیره تنظیمات فقط برای مدیر کل مجاز است.</p>`}
      </div>
    </div>`;
  document.getElementById("st-save")?.addEventListener("click", async () => {
    const g = (k) => document.getElementById(`st-${k}`).value.trim();
    const body = {
      app_name: g("app_name"),
      app_version: g("app_version"),
      app_subtitle: g("app_subtitle"),
      welcome_message: g("welcome_message"),
      support_message: g("support_message"),
      support_phone: g("support_phone"),
      default_city: g("default_city"),
      maintenance_mode: document.getElementById("st-maintenance_mode").value,
      force_update_version: g("force_update_version"),
      store_link: g("store_link"),
      ads_rotation_seconds: g("ads_rotation_seconds"),
      max_ads_per_placement: g("max_ads_per_placement"),
      ads_enabled: document.getElementById("st-ads_enabled").value,
      cloud_api_url: g("cloud_api_url"),
      cloud_sync_key: g("cloud_sync_key"),
      app_server_url: g("app_server_url"),
      admin_email: g("admin_email"),
      smtp_host: g("smtp_host"),
      smtp_port: g("smtp_port"),
      smtp_user: g("smtp_user"),
      smtp_pass: g("smtp_pass"),
      smtp_from: g("smtp_from"),
    };
    try {
      await api("settings", { method: "PUT", body });
      toast("تنظیمات ذخیره شد", "ok2");
    } catch (ex) { toast(ex.message, "err"); }
  });

  /* --- سرور ابری: تست اتصال و همگام‌سازی محتوا --- */
  const saveCloudSettings = async () => {
    const g = (k) => document.getElementById(`st-${k}`).value.trim();
    await api("settings", { method: "PUT", body: { cloud_api_url: g("cloud_api_url"), cloud_sync_key: g("cloud_sync_key") } });
  };
  document.getElementById("cloud-test")?.addEventListener("click", async () => {
    const out = document.getElementById("cloud-status");
    try {
      out.textContent = "در حال تست اتصال...";
      await saveCloudSettings();
      const r = await api("cloud/status");
      if (!r.configured) out.textContent = "ابتدا آدرس سرور ابری را وارد و ذخیره کنید.";
      else if (r.reachable) out.textContent = `اتصال برقرار است — سرویس: ${r.info?.service ?? "?"} | دیتابیس: ${r.info?.db ?? "?"}`;
      else out.textContent = "سرور ابری در دسترس نیست — آدرس را بررسی کنید یا wrangler deploy را اجرا کنید.";
    } catch (ex) { out.textContent = "خطا در تست اتصال: " + ex.message; }
  });
  document.getElementById("cloud-sync")?.addEventListener("click", async () => {
    const out = document.getElementById("cloud-status");
    try {
      out.textContent = "در حال ارسال محتوا به سرور ابری...";
      await saveCloudSettings();
      const r = await api("cloud/sync", { method: "POST" });
      const p = r.pushed || {};
      out.textContent = `همگام‌سازی انجام شد در ${r.elapsedMs}ms — شهرها: ${p.cities ?? 0}، خطوط: ${p.lines ?? 0}، ایستگاه‌ها: ${p.stations ?? 0}، بنرها: ${p.ads ?? 0}، واژگان: ${p.lexicon ?? 0}`;
      toast("محتوا با سرور ابری همگام شد", "ok2");
    } catch (ex) { out.textContent = "خطا در همگام‌سازی: " + ex.message; toast(ex.message, "err"); }
  });
}

/* ---------- مدهای سفر شهری — کارت‌های «مقایسه مدهای سفر» در صفحه خانه اپ ---------- */

const TRAVEL_ICONS = [
  ["directions_subway", "مترو"], ["alt_route", "ترکیبی"], ["directions_bus", "اتوبوس"],
  ["directions_bus_filled", "اتوبوس (پر)"], ["local_taxi", "تاکسی"], ["directions_car", "خودرو"],
  ["two_wheeler", "موتور"], ["electric_rickshaw", "برقی/ترو"], ["tram", "ترام"], ["train", "قطار"],
  ["directions_boat", "شناور"], ["pedal_bike", "دوچرخه"], ["scooter", "اسکوتر"],
  ["commute", "سفر شهری"], ["subway", "متروی زیرزمینی"],
];

async function pageTravel(host) {
  let modes = [];
  let columns = 3;
  try {
    const r = await api("travel-modes");
    modes = Array.isArray(r.modes) ? r.modes : [];
    columns = [2, 3, 4].includes(Number(r.columns)) ? Number(r.columns) : 3;
  } catch (ex) {
    host.innerHTML = `<div class="card"><div class="empty">${esc(ex.message)}</div></div>`;
    return;
  }
  const readOnly = !(me.role === "super" || me.role === "operator");

  const iconOptions = (sel) => TRAVEL_ICONS.map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${l} — ${v}</option>`).join("");

  host.innerHTML = `
    ${pageHead("مدهای سفر شهری", "کارت‌های بخش «مقایسه مدهای سفر شهری» در صفحه خانه اپ — نمایش/عدم نمایش، افزودن/حذف، ترتیب، وضعیت (فعال یا بزودی)، لینک هر کارت و تعداد ستون‌های نمایش.")}
    <div class="card">
      <h3><span class="material" style="color:var(--primary)">commute</span>کارت‌های مدهای سفر</h3>
      <p class="card-sub">دو کارت «مترو» و «ترکیبی» داده واقعی موتور مسیریابی دارند و حذف‌شدنی نیستند (می‌توانید ترتیب، نمایش، وضعیت و لینک آن‌ها را تغییر دهید). کارت‌های «بزودی» با ساعت شنی نمایش داده می‌شوند. با «تعداد ستون‌ها»، چیدمان گرید کارت‌ها را کنترل کنید تا خانه خالی نماند.</p>
      <div class="field" style="max-width:260px">
        <label>تعداد ستون‌های نمایش کارت‌ها</label>
        <select id="tm-columns" ${readOnly ? "disabled" : ""}>
          <option value="2" ${columns === 2 ? "selected" : ""}>۲ ستون</option>
          <option value="3" ${columns === 3 ? "selected" : ""}>۳ ستون</option>
          <option value="4" ${columns === 4 ? "selected" : ""}>۴ ستون</option>
        </select>
        <span class="hint">مثلاً با ۴ کارت، «۲ ستون» یا «۴ ستون» چیدمان بدون خانه خالی می‌دهد.</span>
      </div>
      <div id="tm-rows" style="display:flex;flex-direction:column;gap:10px;margin-top:12px"></div>
      ${readOnly ? "" : `<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn" id="tm-add"><span class="material">add</span><span>افزودن کارت جدید</span></button>
        <button class="btn btn-primary" id="tm-save"><span class="material">save</span><span>ذخیره کارت‌ها</span></button>
        <button class="btn" id="tm-sync"><span class="material">cloud_sync</span><span>همگام‌سازی با ابر</span></button>
        <button class="btn" id="tm-reset"><span class="material">restart_alt</span><span>بازگرداندن پیش‌فرض</span></button>
      </div>`}
      ${readOnly ? `<p class="card-sub">ویرایش فقط برای مدیر کل و اپراتور مجاز است.</p>` : `<p class="hint" id="tm-status" style="margin-top:10px">لینک می‌تواند مسیر داخلی اپ (مثل /lines) یا آدرس کامل اینترنتی باشد؛ کارت فعال با لینک، کاربر را به همان‌جا می‌برد. پس از ذخیره، برای اعمال در اپ «همگام‌سازی با ابر» را بزنید (تغییرات بدون sync هم تا ۱۰ ثانیه در اپ می‌افتد).</p>`}
    </div>`;

  const rowsHost = document.getElementById("tm-rows");
  const canEdit = !readOnly;

  function harvest() {
    document.querySelectorAll("#tm-rows .tm-row").forEach((row) => {
      const i = Number(row.dataset.idx);
      if (!modes[i]) return;
      modes[i].label = (row.querySelector(".tm-label")?.value || "").trim();
      modes[i].icon = row.querySelector(".tm-icon")?.value || "commute";
      modes[i].status = row.querySelector(".tm-status")?.value === "active" ? "active" : "soon";
      modes[i].enabled = row.querySelector(".tm-enabled")?.checked !== false;
      modes[i].link = (row.querySelector(".tm-link")?.value || "").trim();
    });
  }

  function renderRows() {
    rowsHost.innerHTML = modes.map((m, i) => {
      const isReal = m.kind === "real" || m.id === "metro" || m.id === "combo";
      return `
      <div class="tm-row" data-idx="${i}" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--surface-1,rgba(0,0,0,.03));border:1px solid var(--border,#e2e8e5);border-radius:12px;padding:10px 12px">
        <span class="material" style="color:var(--primary)">${esc(m.icon || "commute")}</span>
        ${isReal ? `<span style="font-size:10px;font-weight:700;color:var(--primary);background:color-mix(in srgb,var(--primary) 12%,transparent);padding:3px 8px;border-radius:99px;white-space:nowrap">داده واقعی</span>` : ""}
        <input class="tm-label" placeholder="نام روش (مثلاً اتوبوس)" value="${esc(m.label || "")}" maxlength="30" ${canEdit ? "" : "disabled"} style="flex:1;min-width:120px" />
        <input class="tm-link" placeholder="لینک / مسیر اپ (اختیاری — مثل /lines)" value="${esc(m.link || "")}" maxlength="300" dir="ltr" ${canEdit ? "" : "disabled"} style="flex:1.2;min-width:170px" />
        <select class="tm-icon" ${canEdit ? "" : "disabled"} style="min-width:150px">${iconOptions(m.icon || "commute")}</select>
        <select class="tm-status" ${canEdit ? "" : "disabled"} style="min-width:110px">
          <option value="active" ${m.status === "active" ? "selected" : ""}>فعال</option>
          <option value="soon" ${m.status !== "active" ? "selected" : ""}>بزودی</option>
        </select>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap">
          <input type="checkbox" class="tm-enabled" ${m.enabled !== false ? "checked" : ""} ${canEdit ? "" : "disabled"} /> نمایش
        </label>
        ${canEdit ? `
        <button class="btn btn-sm" data-tm-up="${i}" title="بالا" ${i === 0 ? "disabled" : ""}><span class="material">arrow_upward</span></button>
        <button class="btn btn-sm" data-tm-down="${i}" title="پایین" ${i === modes.length - 1 ? "disabled" : ""}><span class="material">arrow_downward</span></button>
        ${isReal ? "" : `<button class="btn btn-sm" data-tm-del="${i}" title="حذف"><span class="material">delete</span></button>`}` : ""}
      </div>`;
    }).join("") || `<div class="empty">هیچ کارتی تعریف نشده — «افزودن کارت جدید» را بزنید.</div>`;

    rowsHost.querySelectorAll("[data-tm-del]").forEach((b) => (b.onclick = () => { harvest(); modes.splice(Number(b.dataset.tmDel), 1); renderRows(); }));
    rowsHost.querySelectorAll("[data-tm-up]").forEach((b) => (b.onclick = () => {
      harvest();
      const i = Number(b.dataset.tmUp);
      if (i > 0) { [modes[i - 1], modes[i]] = [modes[i], modes[i - 1]]; renderRows(); }
    }));
    rowsHost.querySelectorAll("[data-tm-down]").forEach((b) => (b.onclick = () => {
      harvest();
      const i = Number(b.dataset.tmDown);
      if (i < modes.length - 1) { [modes[i + 1], modes[i]] = [modes[i], modes[i + 1]]; renderRows(); }
    }));
  }
  renderRows();

  document.getElementById("tm-add")?.addEventListener("click", () => {
    harvest();
    modes.push({ id: `mode-${Date.now().toString(36)}`, label: "", icon: "commute", status: "soon", enabled: true, link: "", kind: "extra" });
    renderRows();
    const last = rowsHost.querySelector(".tm-row:last-of-type .tm-label");
    last?.focus();
  });
  document.getElementById("tm-reset")?.addEventListener("click", async () => {
    try {
      const r = await api("travel-modes");
      modes = Array.isArray(r.modes) ? r.modes : [];
      renderRows();
      toast("پیش‌فرض بازگردانده شد (هنوز ذخیره نشده)", "ok2");
    } catch (ex) { toast(ex.message, "err"); }
  });
  document.getElementById("tm-save")?.addEventListener("click", async () => {
    harvest();
    const payload = modes.filter((m) => (m.label || "").trim());
    if (payload.length < 2) { toast("حداقل دو کارت با نام معتبر لازم است", "err"); return; }
    try {
      const r = await api("travel-modes", { method: "PUT", body: { modes: payload, columns: Number(document.getElementById("tm-columns").value) } });
      modes = r.modes || payload;
      columns = r.columns || columns;
      renderRows();
      toast("کارت‌های مدهای سفر ذخیره شد", "ok2");
    } catch (ex) { toast(ex.message, "err"); }
  });
  document.getElementById("tm-sync")?.addEventListener("click", async () => {
    const out = document.getElementById("tm-status");
    try {
      out.textContent = "در حال ارسال محتوا به سرور ابری...";
      const r = await api("cloud/sync", { method: "POST" });
      out.textContent = `همگام‌سازی انجام شد در ${r.elapsedMs}ms — اپ تا حداکثر ۱۰ ثانیه بعد کارت‌های جدید را می‌بیند.`;
      toast("محتوا با سرور ابری همگام شد", "ok2");
    } catch (ex) { out.textContent = "خطا در همگام‌سازی: " + ex.message; toast(ex.message, "err"); }
  });
}

/* ---------- صفحه «درباره ما» اپ — همه متن‌ها و ردیف‌ها ---------- */

async function pageAboutContent(host) {
  let content;
  try {
    content = (await api("about-page")).content;
  } catch (ex) {
    host.innerHTML = `<div class="card"><div class="empty">${esc(ex.message)}</div></div>`;
    return;
  }
  const readOnly = !(me.role === "super" || me.role === "operator");

  host.innerHTML = `
    ${pageHead("درباره ما (اپ)", "همه متن‌های صفحه «درباره ما» در اپ — عنوان، معرفی، ردیف‌های مشخصات، پانوشت. هر ردیف می‌تواند نمایش/عدم نمایش، لینک یا نشانگر زنده داشته باشد.")}
    <div class="card">
      <h3><span class="material" style="color:var(--primary)">info</span>متن‌های اصلی</h3>
      <div class="grid cols-2">
        <div class="field"><label>عنوان صفحه</label><input id="ab-title" value="${esc(content.title)}" maxlength="40" ${readOnly ? "disabled" : ""} /></div>
        <div class="field"><label>زیرعنوان صفحه</label><input id="ab-subtitle" value="${esc(content.subtitle)}" maxlength="60" ${readOnly ? "disabled" : ""} /></div>
        <div class="field"><label>نام اپ در معرفی</label><input id="ab-appname" value="${esc(content.app_name)}" maxlength="60" ${readOnly ? "disabled" : ""} /></div>
      </div>
      <div class="field"><label>متن معرفی</label><textarea id="ab-desc" rows="4" maxlength="600" ${readOnly ? "disabled" : ""}>${esc(content.description)}</textarea></div>
    </div>
    <div class="card">
      <h3><span class="material" style="color:var(--primary)">table_rows</span>ردیف‌های مشخصات</h3>
      <p class="card-sub">هر ردیف یک «عنوان + مقدار» است (مثل وضعیت سرویس / وب‌سایت). با لینک، مقدار قابل کلیک می‌شود؛ با «نشانگر زنده» یک دات سبز چشمک‌زن کنار مقدار می‌آید. بخش «طراح» و «پشتیبانی» حذف شد — هر ردیف که نخواهید را غیرفعال یا حذف کنید.</p>
      <div id="ab-rows" style="display:flex;flex-direction:column;gap:10px;margin-top:10px"></div>
      ${readOnly ? "" : `<button class="btn" id="ab-row-add" style="margin-top:12px"><span class="material">add</span><span>افزودن ردیف</span></button>`}
    </div>
    <div class="card">
      <h3><span class="material" style="color:var(--primary)">notes</span>پانوشت</h3>
      <div class="field"><label>خط اول پانوشت</label><input id="ab-fnote" value="${esc(content.footer_note)}" maxlength="120" ${readOnly ? "disabled" : ""} /></div>
      <div class="field"><label>خط حقوق (کپی‌رایت)</label><input id="ab-fcopy" value="${esc(content.footer_copy)}" maxlength="120" ${readOnly ? "disabled" : ""} /></div>
      ${readOnly ? "" : `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-primary" id="ab-save"><span class="material">save</span><span>ذخیره تغییرات</span></button>
        <button class="btn" id="ab-sync"><span class="material">cloud_sync</span><span>همگام‌سازی با ابر</span></button>
      </div>
      <p class="hint" id="ab-status" style="margin-top:10px">پس از ذخیره، اپ تا حداکثر ۱۰ ثانیه بعد (یا با بازکردن دوباره صفحه) متن‌های جدید را می‌بیند.</p>`}
      ${readOnly ? `<p class="card-sub">ویرایش فقط برای مدیر کل و اپراتور مجاز است.</p>` : ""}
    </div>`;

  const rowsHost = document.getElementById("ab-rows");
  const canEdit = !readOnly;

  function harvest() {
    document.querySelectorAll("#ab-rows .ab-row").forEach((row) => {
      const i = Number(row.dataset.idx);
      if (!content.rows[i]) return;
      content.rows[i].label = (row.querySelector(".ab-label")?.value || "").trim();
      content.rows[i].value = (row.querySelector(".ab-value")?.value || "").trim();
      content.rows[i].link = (row.querySelector(".ab-link")?.value || "").trim();
      content.rows[i].live = row.querySelector(".ab-live")?.checked === true;
      content.rows[i].enabled = row.querySelector(".ab-enabled")?.checked !== false;
    });
  }

  function renderRows() {
    rowsHost.innerHTML = (content.rows || []).map((r, i) => `
      <div class="ab-row" data-idx="${i}" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--surface-1,rgba(0,0,0,.03));border:1px solid var(--border,#e2e8e5);border-radius:12px;padding:10px 12px">
        <input class="ab-label" placeholder="عنوان (مثلاً وضعیت سرویس)" value="${esc(r.label || "")}" maxlength="40" ${canEdit ? "" : "disabled"} style="flex:1;min-width:130px" />
        <input class="ab-value" placeholder="مقدار (مثلاً آنلاین)" value="${esc(r.value || "")}" maxlength="60" ${canEdit ? "" : "disabled"} style="flex:1;min-width:120px" />
        <input class="ab-link" placeholder="لینک (اختیاری)" value="${esc(r.link || "")}" maxlength="300" dir="ltr" ${canEdit ? "" : "disabled"} style="flex:1.2;min-width:150px" />
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap"><input type="checkbox" class="ab-live" ${r.live ? "checked" : ""} ${canEdit ? "" : "disabled"} /> دات زنده</label>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap"><input type="checkbox" class="ab-enabled" ${r.enabled !== false ? "checked" : ""} ${canEdit ? "" : "disabled"} /> نمایش</label>
        ${canEdit ? `
        <button class="btn btn-sm" data-ab-up="${i}" ${i === 0 ? "disabled" : ""}><span class="material">arrow_upward</span></button>
        <button class="btn btn-sm" data-ab-down="${i}" ${i === content.rows.length - 1 ? "disabled" : ""}><span class="material">arrow_downward</span></button>
        <button class="btn btn-sm" data-ab-del="${i}"><span class="material">delete</span></button>` : ""}
      </div>`).join("") || `<div class="empty">ردیفی نیست — «افزودن ردیف» را بزنید.</div>`;

    rowsHost.querySelectorAll("[data-ab-del]").forEach((b) => (b.onclick = () => { harvest(); content.rows.splice(Number(b.dataset.abDel), 1); renderRows(); }));
    rowsHost.querySelectorAll("[data-ab-up]").forEach((b) => (b.onclick = () => {
      harvest(); const i = Number(b.dataset.abUp);
      if (i > 0) { [content.rows[i - 1], content.rows[i]] = [content.rows[i], content.rows[i - 1]]; renderRows(); }
    }));
    rowsHost.querySelectorAll("[data-ab-down]").forEach((b) => (b.onclick = () => {
      harvest(); const i = Number(b.dataset.abDown);
      if (i < content.rows.length - 1) { [content.rows[i + 1], content.rows[i]] = [content.rows[i], content.rows[i + 1]]; renderRows(); }
    }));
  }
  renderRows();

  document.getElementById("ab-row-add")?.addEventListener("click", () => {
    harvest();
    content.rows.push({ id: `row-${Date.now().toString(36)}`, label: "", value: "", link: "", live: false, enabled: true });
    renderRows();
  });
  document.getElementById("ab-save")?.addEventListener("click", async () => {
    harvest();
    const body = {
      title: document.getElementById("ab-title").value.trim(),
      subtitle: document.getElementById("ab-subtitle").value.trim(),
      app_name: document.getElementById("ab-appname").value.trim(),
      description: document.getElementById("ab-desc").value.trim(),
      rows: content.rows,
      footer_note: document.getElementById("ab-fnote").value.trim(),
      footer_copy: document.getElementById("ab-fcopy").value.trim(),
    };
    try {
      const r = await api("about-page", { method: "PUT", body: { content: body } });
      content = r.content || content;
      renderRows();
      toast("محتوای «درباره ما» ذخیره شد", "ok2");
    } catch (ex) { toast(ex.message, "err"); }
  });
  document.getElementById("ab-sync")?.addEventListener("click", async () => {
    const out = document.getElementById("ab-status");
    try {
      out.textContent = "در حال ارسال محتوا به سرور ابری...";
      const r = await api("cloud/sync", { method: "POST" });
      out.textContent = `همگام‌سازی انجام شد در ${r.elapsedMs}ms.`;
      toast("محتوا با سرور ابری همگام شد", "ok2");
    } catch (ex) { out.textContent = "خطا در همگام‌سازی: " + ex.message; toast(ex.message, "err"); }
  });
}

/* ---------- صفحه «تماس با ما» اپ — بخش‌ها و راه‌های ارتباطی ---------- */

const CONTACT_ICONS = [
  ["support_agent", "پشتیبانی"], ["call", "تماس تلفنی"], ["sms", "پیامک"], ["email", "ایمیل"],
  ["alternate_email", "آدرس ایمیل"], ["chat", "گفتگو"], ["forum", "انجمن"], ["send", "تلگرام / ارسال"],
  ["language", "وب‌سایت"], ["campaign", "تبلیغات"], ["apps", "محصولات"], ["public", "شبکه اجتماعی"],
  ["location_on", "آدرس"], ["schedule", "ساعات کاری"], ["help_outline", "پرسش متداول"],
];

async function pageContactContent(host) {
  let content;
  try {
    content = (await api("contact-page")).content;
  } catch (ex) {
    host.innerHTML = `<div class="card"><div class="empty">${esc(ex.message)}</div></div>`;
    return;
  }
  const readOnly = !(me.role === "super" || me.role === "operator");
  const canEdit = !readOnly;
  const iconOptions = (sel) => CONTACT_ICONS.map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${l} — ${v}</option>`).join("");

  host.innerHTML = `
    ${pageHead("تماس با ما (اپ)", "همه بخش‌های صفحه «تماس با ما» در اپ — راه‌های ارتباطی (افزودن/حذف/ترتیب/نمایش) و بخش ثبت تیکت.")}
    <div class="card">
      <h3><span class="material" style="color:var(--primary)">support_agent</span>متن‌های اصلی</h3>
      <div class="grid cols-2">
        <div class="field"><label>عنوان صفحه</label><input id="ct-title" value="${esc(content.title)}" maxlength="40" ${canEdit ? "" : "disabled"} /></div>
        <div class="field"><label>زیرعنوان صفحه</label><input id="ct-subtitle" value="${esc(content.subtitle)}" maxlength="60" ${canEdit ? "" : "disabled"} /></div>
      </div>
      <div class="field"><label>عنوان بخش راه‌های ارتباطی</label><input id="ct-methodstitle" value="${esc(content.methods_title)}" maxlength="40" ${canEdit ? "" : "disabled"} /></div>
    </div>
    <div class="card">
      <h3><span class="material" style="color:var(--primary)">call</span>راه‌های ارتباطی</h3>
      <p class="card-sub">نوع رفتار هر مورد: «تماس» شماره را شمارش می‌کند، «لینک» صفحه را باز می‌کند، «ایمیل» برنامه ایمیل را باز می‌کند، «بزودی» پیام به‌زودی می‌دهد. موارد غیرفعال در اپ نمایش داده نمی‌شوند.</p>
      <div id="ct-rows" style="display:flex;flex-direction:column;gap:10px;margin-top:10px"></div>
      ${canEdit ? `<button class="btn" id="ct-add" style="margin-top:12px"><span class="material">add</span><span>افزودن مورد جدید</span></button>` : ""}
    </div>
    <div class="card">
      <h3><span class="material" style="color:var(--primary)">confirmation_number</span>بخش ثبت تیکت</h3>
      <div class="field"><label>نمایش فرم ثبت تیکت در اپ</label>
        <select id="ct-ticketenabled" ${canEdit ? "" : "disabled"}>
          <option value="1" ${content.ticket_enabled !== false ? "selected" : ""}>نمایش داده شود</option>
          <option value="0" ${content.ticket_enabled === false ? "selected" : ""}>نمایش داده نشود</option>
        </select></div>
      <div class="field"><label>عنوان بخش تیکت</label><input id="ct-tickettitle" value="${esc(content.ticket_title)}" maxlength="40" ${canEdit ? "" : "disabled"} /></div>
      <div class="field"><label>پیام موفقیت پس از ثبت تیکت</label><input id="ct-success" value="${esc(content.success_message)}" maxlength="200" ${canEdit ? "" : "disabled"} /></div>
      ${canEdit ? `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-primary" id="ct-save"><span class="material">save</span><span>ذخیره تغییرات</span></button>
        <button class="btn" id="ct-sync"><span class="material">cloud_sync</span><span>همگام‌سازی با ابر</span></button>
      </div>
      <p class="hint" id="ct-status" style="margin-top:10px">پس از ذخیره، اپ تا حداکثر ۱۰ ثانیه بعد تغییرات را می‌بیند. تیکت‌های کاربران در بخش «تیکت‌ها» همین پنل بررسی و پاسخ داده می‌شوند.</p>` : `<p class="card-sub">ویرایش فقط برای مدیر کل و اپراتور مجاز است.</p>`}
    </div>`;

  const rowsHost = document.getElementById("ct-rows");

  function harvest() {
    document.querySelectorAll("#ct-rows .ct-row").forEach((row) => {
      const i = Number(row.dataset.idx);
      if (!content.methods[i]) return;
      content.methods[i].icon = row.querySelector(".ct-icon")?.value || "support_agent";
      content.methods[i].title = (row.querySelector(".ct-title")?.value || "").trim();
      content.methods[i].value = (row.querySelector(".ct-value")?.value || "").trim();
      content.methods[i].type = row.querySelector(".ct-type")?.value || "url";
      content.methods[i].link = (row.querySelector(".ct-link")?.value || "").trim();
      content.methods[i].enabled = row.querySelector(".ct-enabled")?.checked !== false;
    });
  }

  function renderRows() {
    rowsHost.innerHTML = (content.methods || []).map((m, i) => `
      <div class="ct-row" data-idx="${i}" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--surface-1,rgba(0,0,0,.03));border:1px solid var(--border,#e2e8e5);border-radius:12px;padding:10px 12px">
        <span class="material" style="color:var(--primary)">${esc(m.icon || "support_agent")}</span>
        <select class="ct-icon" ${canEdit ? "" : "disabled"} style="min-width:150px">${iconOptions(m.icon || "support_agent")}</select>
        <input class="ct-title" placeholder="عنوان مورد" value="${esc(m.title || "")}" maxlength="60" ${canEdit ? "" : "disabled"} style="flex:1.3;min-width:150px" />
        <input class="ct-value" placeholder="مقدار نمایشی (اختیاری — مثل شماره)" value="${esc(m.value || "")}" maxlength="100" ${canEdit ? "" : "disabled"} style="flex:1;min-width:140px" />
        <select class="ct-type" ${canEdit ? "" : "disabled"} style="min-width:110px">
          <option value="tel" ${m.type === "tel" ? "selected" : ""}>تماس</option>
          <option value="url" ${m.type === "url" ? "selected" : ""}>لینک</option>
          <option value="mailto" ${m.type === "mailto" ? "selected" : ""}>ایمیل</option>
          <option value="toast" ${m.type === "toast" ? "selected" : ""}>بزودی</option>
        </select>
        <input class="ct-link" placeholder="مقصد (شماره/لینک/ایمیل)" value="${esc(m.link || "")}" maxlength="300" dir="ltr" ${canEdit ? "" : "disabled"} style="flex:1.2;min-width:150px" />
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap"><input type="checkbox" class="ct-enabled" ${m.enabled !== false ? "checked" : ""} ${canEdit ? "" : "disabled"} /> نمایش</label>
        ${canEdit ? `
        <button class="btn btn-sm" data-ct-up="${i}" ${i === 0 ? "disabled" : ""}><span class="material">arrow_upward</span></button>
        <button class="btn btn-sm" data-ct-down="${i}" ${i === content.methods.length - 1 ? "disabled" : ""}><span class="material">arrow_downward</span></button>
        <button class="btn btn-sm" data-ct-del="${i}"><span class="material">delete</span></button>` : ""}
      </div>`).join("") || `<div class="empty">موردی نیست — «افزودن مورد جدید» را بزنید.</div>`;

    rowsHost.querySelectorAll("[data-ct-del]").forEach((b) => (b.onclick = () => { harvest(); content.methods.splice(Number(b.dataset.ctDel), 1); renderRows(); }));
    rowsHost.querySelectorAll("[data-ct-up]").forEach((b) => (b.onclick = () => {
      harvest(); const i = Number(b.dataset.ctUp);
      if (i > 0) { [content.methods[i - 1], content.methods[i]] = [content.methods[i], content.methods[i - 1]]; renderRows(); }
    }));
    rowsHost.querySelectorAll("[data-ct-down]").forEach((b) => (b.onclick = () => {
      harvest(); const i = Number(b.dataset.ctDown);
      if (i < content.methods.length - 1) { [content.methods[i + 1], content.methods[i]] = [content.methods[i], content.methods[i + 1]]; renderRows(); }
    }));
  }
  renderRows();

  document.getElementById("ct-add")?.addEventListener("click", () => {
    harvest();
    content.methods.push({ id: `method-${Date.now().toString(36)}`, icon: "support_agent", title: "", value: "", type: "url", link: "", enabled: true });
    renderRows();
    const last = rowsHost.querySelector(".ct-row:last-of-type .ct-title");
    last?.focus();
  });
  document.getElementById("ct-save")?.addEventListener("click", async () => {
    harvest();
    const body = {
      title: document.getElementById("ct-title").value.trim(),
      subtitle: document.getElementById("ct-subtitle").value.trim(),
      methods_title: document.getElementById("ct-methodstitle").value.trim(),
      methods: content.methods,
      ticket_enabled: document.getElementById("ct-ticketenabled").value === "1",
      ticket_title: document.getElementById("ct-tickettitle").value.trim(),
      success_message: document.getElementById("ct-success").value.trim(),
    };
    try {
      const r = await api("contact-page", { method: "PUT", body: { content: body } });
      content = r.content || content;
      renderRows();
      toast("بخش‌های «تماس با ما» ذخیره شد", "ok2");
    } catch (ex) { toast(ex.message, "err"); }
  });
  document.getElementById("ct-sync")?.addEventListener("click", async () => {
    const out = document.getElementById("ct-status");
    try {
      out.textContent = "در حال ارسال محتوا به سرور ابری...";
      const r = await api("cloud/sync", { method: "POST" });
      out.textContent = `همگام‌سازی انجام شد در ${r.elapsedMs}ms.`;
      toast("محتوا با سرور ابری همگام شد", "ok2");
    } catch (ex) { out.textContent = "خطا در همگام‌سازی: " + ex.message; toast(ex.message, "err"); }
  });
}

/* ---------- تیکت‌ها — بررسی و پاسخ تیکت‌های کاربران اپ ---------- */

const TICKET_CATS = { general: "پرسش عمومی", bug: "گزارش خطا", idea: "پیشنهاد", ad: "تبلیغات" };
const TICKET_STATUS = {
  open: ["در انتظار بررسی", "warn"],
  answered: ["پاسخ داده شده", "ok"],
  closed: ["بسته شده", "off"],
};

async function pageTickets(host) {
  const writable = can("operator");
  let filterStatus = "";
  let lastRows = [];
  let smtpOk = false;

  host.innerHTML = `
    ${pageHead("تیکت‌ها", "تیکت‌های ثبت‌شده در اپ (بخش تماس با ما) — پاسخ بدهید؛ پاسخ بلافاصله در اپ کاربر و (در صورت تنظیم ایمیل) در صندوق ایمیل او می‌رسد.")}
    <div class="toolbar">
      <input id="tk-q" placeholder="جست‌وجو در موضوع/نام/متن…" style="min-width:220px" />
      <select id="tk-status">
        <option value="">همه وضعیت‌ها</option>
        <option value="open">در انتظار بررسی</option>
        <option value="answered">پاسخ داده شده</option>
        <option value="closed">بسته شده</option>
      </select>
      <span class="toolbar-note" id="tk-count"></span>
    </div>
    <div id="tk-table"></div>
    <p class="toolbar-note" id="tk-smtp" style="margin-top:8px"></p>`;

  const load = async () => {
    const r = await api(`tickets?status=${encodeURIComponent(filterStatus)}&q=${encodeURIComponent(document.getElementById("tk-q").value.trim())}`);
    lastRows = r.tickets || [];
    smtpOk = !!r.smtp;
    const c = r.counts || {};
    document.getElementById("tk-count").textContent = `${faNum(lastRows.length)} تیکت — باز: ${faNum(c.open ?? 0)} • پاسخ‌داده: ${faNum(c.answered ?? 0)} • بسته: ${faNum(c.closed ?? 0)}`;
    document.getElementById("tk-smtp").textContent = smtpOk
      ? "ایمیل فعال است — اطلاع تیکت جدید به مدیر و پاسخ ایمیلی به کاربر ارسال می‌شود."
      : "ایمیل تنظیم نشده — برای اطلاع ایمیلی، SMTP و ایمیل مدیر را در «تنظیمات سامانه» تکمیل کنید (پاسخ دادن در اپ بدون ایمیل هم کار می‌کند).";
    document.getElementById("tk-table").innerHTML = lastRows.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>#</th><th>فرستنده</th><th>موضوع</th><th>دسته</th><th>وضعیت</th><th>تاریخ</th><th>عملیات</th></tr></thead>
        <tbody>
          ${lastRows.map((t) => {
            const st = TICKET_STATUS[t.status] || TICKET_STATUS.open;
            return `
            <tr>
              <td>${faNum(t.id)}</td>
              <td><b>${esc(t.name)}</b><br /><span style="font-size:11px;color:var(--muted)" dir="ltr">${esc(t.contact)}</span></td>
              <td>${esc(t.subject)}</td>
              <td><span class="badge info">${TICKET_CATS[t.category] || t.category}</span></td>
              <td><span class="badge ${st[1]}">${st[0]}</span></td>
              <td>${faTime(t.createdAt)}</td>
              <td><div class="acts">
                ${writable ? `<button class="icon-btn" data-reply="${t.id}" title="مشاهده و پاسخ"><span class="material">reply</span></button>` : ""}
                ${writable && t.status !== "closed" ? `<button class="icon-btn" data-close="${t.id}" title="بستن تیکت"><span class="material">lock</span></button>` : ""}
              </div></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>` : `<div class="card"><div class="empty"><span class="material">confirmation_number</span>تیکتی یافت نشد</div></div>`;

    document.querySelectorAll("[data-reply]").forEach((b) => (b.onclick = () => openReply(lastRows.find((x) => x.id === Number(b.dataset.reply)))));
    document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () =>
      confirmDialog("این تیکت بدون پاسخ بسته شود؟", async () => {
        try { await api(`tickets/${b.dataset.close}/status`, { method: "POST", body: { status: "closed" } }); toast("تیکت بسته شد", "ok2"); load(); }
        catch (ex) { toast(ex.message, "err"); }
      })));
  };

  function openReply(t) {
    if (!t) return;
    const st = TICKET_STATUS[t.status] || TICKET_STATUS.open;
    const close = modal(`تیکت #${t.id} — ${esc(t.subject)}`, `
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;font-size:13px">
        <div><b>فرستنده:</b> ${esc(t.name)} — <span dir="ltr">${esc(t.contact)}</span> <span class="badge info">${TICKET_CATS[t.category] || t.category}</span> <span class="badge ${st[1]}">${st[0]}</span></div>
        <div style="background:var(--surface-1,rgba(0,0,0,.03));border:1px solid var(--border,#e2e8e5);border-radius:10px;padding:12px;white-space:pre-wrap">${esc(t.message)}</div>
        ${t.reply ? `<div style="background:#eef7f3;border:1px solid #cfe6dc;border-radius:10px;padding:12px;white-space:pre-wrap"><b>پاسخ قبلی:</b><br />${esc(t.reply)}</div>` : ""}
      </div>
      <div class="field"><label>پاسخ پشتیبانی</label><textarea id="tk-replytext" rows="4" placeholder="پاسخ خود را بنویسید… این پاسخ در اپ کاربر نمایش داده می‌شود">${esc(t.reply || "")}</textarea></div>
      <span class="hint">با ذخیره پاسخ، وضعیت تیکت «پاسخ داده شده» می‌شود و کاربر در اپ (تماس با ما ← تیکت‌های من) آن را می‌بیند${t.contact.includes("@") ? " و ایمیل پاسخ به او می‌رود" : ""}.</span>`,
      `<button class="btn" id="tk-close">انصراف</button><button class="btn btn-primary" id="tk-sendreply"><span class="material">reply</span><span>ثبت پاسخ</span></button>`);
    document.getElementById("tk-close").onclick = close;
    document.getElementById("tk-sendreply").onclick = async () => {
      const reply = document.getElementById("tk-replytext").value.trim();
      if (!reply) { toast("متن پاسخ را بنویسید", "err"); return; }
      try {
        await api(`tickets/${t.id}/reply`, { method: "POST", body: { reply } });
        toast("پاسخ ثبت شد و در اپ کاربر نمایش داده می‌شود", "ok2");
        close(); load();
      } catch (ex) { toast(ex.message, "err"); }
    };
  }

  document.getElementById("tk-q").oninput = load;
  document.getElementById("tk-status").onchange = (e) => { filterStatus = e.target.value; load(); };
  await load();
}

/* ---------- گزارش‌ها ---------- */

async function pageReports(host) {
  const urlDays = new URLSearchParams(location.hash.split("?")[1] || "").get("days");
  const days = Math.min(Math.max(Number(urlDays) || 14, 7), 90);
  const r = await api(`reports?days=${days}`);
  const maxApi = Math.max(...r.api_stats.map((x) => x.count), 1);
  const statsAsc = [...r.api_stats].reverse();
  const maxImp = Math.max(...r.ads_daily.map((x) => x.impressions), 1);
  const adsDailyAsc = [...r.ads_daily].reverse();
  const totalApi = r.api_stats.reduce((s, x) => s + x.count, 0);
  const totalImp = r.ads_daily.reduce((s, x) => s + x.impressions, 0);
  const totalClk = r.ads_daily.reduce((s, x) => s + x.clicks, 0);
  const ctr = totalImp ? ((totalClk / totalImp) * 100).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) : "۰";
  host.innerHTML = `
    ${pageHead("گزارش‌ها و تحلیل داده", "آمار استفاده، عملکرد API، رتبه‌بندی کمپین‌ها و تاریخچه تغییرات داده.")}
    <div class="toolbar">
      <span style="font-size:12px; color:var(--ink-2)">بازه گزارش:</span>
      ${[7, 14, 30].map((d2) => `<button class="tab ${days === d2 ? "active" : ""}" data-days="${d2}">${faNum(d2)} روز</button>`).join("")}
      <span class="spacer"></span>
      <button class="btn btn-sm" id="r-csv-api"><span class="material">download</span><span>CSV درخواست‌ها</span></button>
      <button class="btn btn-sm" id="r-csv-ads"><span class="material">download</span><span>CSV عملکرد تبلیغات</span></button>
    </div>
    <div class="kpi-grid kpi-grid-5">
      ${kpi("نشست فعال مدیران", "how_to_reg", r.active_sessions, "نشست جاری پنل", "t-primary")}
      ${kpi("درخواست API", "api", totalApi, `مجموع در ${faNum(days)} روز اخیر`, "t-surface")}
      ${kpi("نمایش تبلیغ", "visibility", r.ads_totals.impressions || totalImp, `مجموع در بازه انتخابی`, "t-dim")}
      ${kpi("کلیک تبلیغ", "ads_click", r.ads_totals.clicks || totalClk, "مجموع کلیک‌های بازه", "t-surface")}
      ${kpi("میانگین CTR", "query_stats", ctr + "٪", "نسبت کلیک به نمایش بازه", "t-tertiary")}
    </div>
    <div class="grid cols-2">
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">monitoring</span>درخواست‌های API — ${faNum(days)} روز اخیر</h3>
        <div class="bars">
          ${statsAsc.map((x) => `
            <div class="bar-col">
              <span class="bar-val">${x.count || ""}</span>
              <div class="bar" style="height:${Math.round((x.count / maxApi) * 100)}%"></div>
              <span class="bar-day">${x.day.slice(5).replace("-", "/")}</span>
            </div>`).join("")}
        </div>
      </div>
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">insights</span>نمایش و کلیک تبلیغات — روزانه</h3>
        <div class="legend"><span class="lg lg-imp"></span>نمایش <span class="lg lg-clk"></span>کلیک</div>
        <div class="bars bars-dual">
          ${adsDailyAsc.length ? adsDailyAsc.map((x) => `
            <div class="bar-col">
              <span class="bar-val">${x.impressions || ""}</span>
              <div class="bar-pair">
                <div class="bar imp" style="height:${Math.round((x.impressions / maxImp) * 100)}%" title="نمایش: ${faNum(x.impressions)}"></div>
                <div class="bar clk" style="height:${Math.round((x.clicks / maxImp) * 100)}%; min-height:${x.clicks ? "3px" : "0"}" title="کلیک: ${faNum(x.clicks)}"></div>
              </div>
              <span class="bar-day">${x.day.slice(5).replace("-", "/")}</span>
            </div>`).join("") : `<div class="empty"><span class="material">insights</span>آمار روزانه‌ای در این بازه ثبت نشده است</div>`}
        </div>
      </div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">leaderboard</span>رتبه‌بندی عملکرد کمپین‌ها (بر اساس CTR)</h3>
        ${r.ads_ranking.length ? `<div class="tbl-wrap" style="max-height:260px"><table class="tbl">
          <thead><tr><th>#</th><th>عنوان</th><th>جایگاه</th><th>نمایش</th><th>کلیک</th><th>CTR</th></tr></thead>
          <tbody>${r.ads_ranking.map((a, i) => {
            const fill = Math.min(Math.max(a.ctr * 20, 4), 100);
            return `<tr>
              <td><span class="order-chip">${faNum(i + 1)}</span></td>
              <td><b>${esc(a.title)}</b></td>
              <td><span class="placement-chip ${AD_PLACE_META[a.placement]?.cls || ""}">${PLACE_LABEL[a.placement] || a.placement}</span></td>
              <td>${faNum(a.impressions)}</td>
              <td>${faNum(a.clicks)}</td>
              <td><div class="cell-meter"><div class="meter-row"><span class="m-ctr">${a.ctr.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪</span></div><div class="meter"><div class="meter-fill ${a.ctr >= 4 ? "good" : a.ctr < 1 ? "low" : ""}" style="width:${fill}%"></div></div></div></td>
            </tr>`;
          }).join("")}</tbody></table></div>` : `<div class="empty"><span class="material">leaderboard</span>کمپینی ثبت نشده است</div>`}
      </div>
      <div>
        <div class="card" style="margin-bottom:16px">
          <h3><span class="material" style="color:var(--primary)">group</span>ترکیب وضعیت کاربران</h3>
          <div class="user-status-row">
            ${r.users_by_status.length ? r.users_by_status.map((u) => {
              const [lbl, cls] = STATUS_LABEL[u.status] || [u.status, "off"];
              return `<div class="us-box"><span class="badge ${cls}">${lbl}</span><b>${faNum(u.count)}</b><span>کاربر</span></div>`;
            }).join("") : `<div class="empty"><span class="material">group_off</span>کاربری ثبت نشده است</div>`}
          </div>
        </div>
        <div class="card">
          <h3><span class="material" style="color:var(--primary)">location_on</span>نمونه ایستگاه‌های فعال</h3>
          <div class="station-cloud">
            ${r.top_stations.length ? r.top_stations.map((s) => `<span class="station-chip"><span class="dot" style="background:${esc(s.color)}"></span>${esc(s.name)} <small>— ${esc(s.line_name)}</small></span>`).join("") : `<div class="empty"><span class="material">location_off</span>ایستگاهی ثبت نشده است</div>`}
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3><span class="material" style="color:var(--primary)">history</span>تاریخچه تغییرات داده</h3>
      <div class="feed">
        ${r.changes.length ? r.changes.map((c) => `
          <div class="feed-item">
            <span class="fi-dot" style="background:${c.action === "delete" || c.action === "bulk_delete" ? "var(--error)" : c.action === "create" || c.action === "bulk_create" ? "var(--tertiary-container)" : "var(--primary-fixed-dim)"}"></span>
            <div class="fi-body"><b>${entityLabel(c.entity)} — ${c.action === "create" || c.action === "bulk_create" ? "ایجاد" : c.action === "delete" || c.action === "bulk_delete" ? "حذف" : "ویرایش"}</b><p>${esc(c.admin_name)}${c.details ? " — " + esc(c.details) : ""}</p></div>
            <span class="fi-time">${faTime(c.created_at)}</span>
          </div>`).join("") : `<div class="empty"><span class="material">inbox</span>تغییری ثبت نشده است</div>`}
      </div>
    </div>`;
  document.querySelectorAll("[data-days]").forEach((b) => (b.onclick = () => {
    location.hash = `#/reports?days=${b.dataset.days}`;
    render();
  }));
  document.getElementById("r-csv-api").onclick = () => {
    csvExport(`darmasir-api-${days}d.csv`, ["تاریخ", "تعداد درخواست"], statsAsc.map((x) => [x.day, x.count]));
  };
  document.getElementById("r-csv-ads").onclick = () => {
    csvExport("darmasir-ads-performance.csv", ["عنوان", "جایگاه", "نمایش", "کلیک", "CTR٪", "فعال"],
      r.ads_ranking.map((a) => [a.title, PLACE_LABEL[a.placement] || a.placement, a.impressions, a.clicks, a.ctr, a.is_active ? "بله" : "خیر"]));
  };
}

function entityLabel(e) {
  return { app_user: "کاربر", line: "خط", station: "ایستگاه", city: "شهر", ad: "تبلیغ", revenue: "قرارداد درآمد", invoice: "فاکتور", voice_lexicon: "فرهنگ تلفظ" }[e] || e;
}

/* ---------- امنیت ---------- */

async function pageSecurity(host) {
  const s = await api("security");
  host.innerHTML = `
    ${pageHead("امنیت و وقایع‌نگاری", "مدیران پنل، نقش‌ها، نشست‌های فعال، تغییر گذرواژه و گزارش رویدادهای امنیتی.")}
    <div class="grid cols-2 sec-grid">
      <div class="col">
        <div class="card card-pw">
          <h3><span class="material" style="color:var(--primary)">password</span>تغییر گذرواژه من</h3>
          <div class="field"><label>گذرواژه فعلی</label><input id="pw-cur" type="password" autocomplete="current-password" /></div>
          <div class="field"><label>گذرواژه جدید (حداقل ۸ کاراکتر)</label><input id="pw-new" type="password" autocomplete="new-password" /></div>
          <div class="field"><label>تکرار گذرواژه جدید</label><input id="pw-new2" type="password" autocomplete="new-password" /></div>
          <button class="btn btn-primary" id="pw-save"><span class="material">lock_reset</span><span>تغییر گذرواژه</span></button>
        </div>
        <div class="card card-adm">
          <h3><span class="material" style="color:var(--primary)">admin_panel_settings</span>مدیران پنل</h3>
          <div style="margin-bottom:10px"><button class="btn btn-primary btn-sm" id="adm-add">+ مدیر جدید</button></div>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>نام</th><th>نام کاربری</th><th>نقش</th><th>وضعیت</th><th>آخرین ورود</th><th></th></tr></thead>
            <tbody>${s.admins.map((a) => `
              <tr>
                <td><b>${esc(a.display_name)}</b></td>
                <td style="direction:ltr;text-align:right">${esc(a.username)}</td>
                <td><span class="badge ${a.role === "super" ? "ok" : a.role === "operator" ? "warn" : "off"}">${ROLE_LABEL[a.role]}</span></td>
                <td><span class="badge ${a.is_active ? "ok" : "bad"}">${a.is_active ? "فعال" : "غیرفعال"}</span></td>
                <td>${faTime(a.last_login)}</td>
                <td><div class="acts">
                  <button class="icon-btn" data-edit="${a.id}" title="ویرایش مدیر"><span class="material">edit</span></button>
                  ${a.id !== me.id ? `<button class="icon-btn danger" data-del="${a.id}" data-name="${esc(a.username)}" title="حذف مدیر"><span class="material">delete</span></button>` : ""}
                </div></td>
              </tr>`).join("")}</tbody>
          </table></div>
        </div>
      </div>
      <div class="card card-sessions">
        <h3><span class="material" style="color:var(--primary)">wifi_tethering</span>نشست‌های فعال (${faNum(s.sessions.length)})</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>مدیر</th><th>IP</th><th>ایجاد</th><th>انقضا</th><th></th></tr></thead>
          <tbody>${s.sessions.length ? s.sessions.map((x) => `
            <tr><td><b>${esc(x.display_name)}</b><span class="cell-sub" title="${esc(x.user_agent || "")}">${esc(x.username)}</span></td>
            <td style="direction:ltr;text-align:right">${esc(x.ip || "—")}</td>
            <td>${faTime(x.created_at)}</td><td>${faTime(x.expires_at)}</td>
            <td>${x.username !== me.username ? `<button class="icon-btn danger" data-revoke="${esc(x.token)}" data-name="${esc(x.username)}" title="ابطال نشست"><span class="material">block</span></button>` : '<span class="badge info">نشست شما</span>'}</td></tr>`).join("") : `<tr><td colspan="5" class="empty">نشستی فعال نیست</td></tr>`}</tbody>
        </table></div>
        <h3><span class="material" style="color:var(--primary)">security</span>گزارش رویدادهای امنیتی (۱۰۰ مورد اخیر)</h3>
        <div class="feed feed-audit">
          ${s.audit.length ? s.audit.map((a) => `
            <div class="feed-item">
              <span class="fi-dot" style="background:${a.action === "login_failed" ? "var(--error)" : "var(--tertiary-container)"}"></span>
              <div class="fi-body"><b>${esc(actionLabel(a.action))}</b><p>${esc(a.admin_name)}${a.details ? " — " + esc(a.details) : ""} ${a.ip ? `(IP: ${esc(a.ip)})` : ""}</p></div>
              <span class="fi-time">${faTime(a.created_at)}</span>
            </div>`).join("") : `<div class="empty"><span class="material">shield</span>رویدادی ثبت نشده است</div>`}
        </div>
      </div>
    </div>`;
  document.getElementById("pw-save").onclick = async () => {
    const cur = document.getElementById("pw-cur").value;
    const nw = document.getElementById("pw-new").value;
    const nw2 = document.getElementById("pw-new2").value;
    if (!cur || !nw) { toast("هر دو مقدار الزامی است", "err"); return; }
    if (nw.length < 8) { toast("گذرواژه جدید باید حداقل ۸ کاراکتر باشد", "err"); return; }
    if (nw !== nw2) { toast("تکرار گذرواژه مطابقت ندارد", "err"); return; }
    try {
      await api("auth/change-password", { method: "POST", body: { current_password: cur, new_password: nw } });
      toast("گذرواژه با موفقیت تغییر کرد", "ok2");
      ["pw-cur", "pw-new", "pw-new2"].forEach((id) => (document.getElementById(id).value = ""));
      renderPage("security");
    } catch (ex) { toast(ex.message, "err"); }
  };
  document.getElementById("adm-add").onclick = () => openAdminForm(null);
  document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openAdminForm(s.admins.find((x) => x.id === Number(b.dataset.edit)))));
  document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
    confirmDialog(`مدیر «${b.dataset.name}» حذف شود؟`, async () => {
      await api(`admins/${b.dataset.del}`, { method: "DELETE" });
      toast("مدیر حذف شد", "ok2"); renderPage("security");
    })));
  document.querySelectorAll("[data-revoke]").forEach((b) => (b.onclick = () =>
    confirmDialog(`نشست مدیر «${b.dataset.name}» ابطال شود؟ او باید دوباره وارد شود.`, async () => {
      try {
        await api(`sessions/${encodeURIComponent(b.dataset.revoke)}`, { method: "DELETE" });
        toast("نشست ابطال شد", "ok2");
        renderPage("security");
      } catch (ex) { toast(ex.message, "err"); }
    })));
}

function openAdminForm(admin) {
  const isEdit = !!admin;
  const close = modal(isEdit ? `ویرایش مدیر — ${admin.username}` : "مدیر جدید", `
    ${!isEdit ? `
      <div class="field"><label>نام کاربری</label><input id="f-username" placeholder="username" style="direction:ltr" /></div>
      <div class="field"><label>گذرواژه (حداقل ۸ کاراکتر)</label><input id="f-pass" type="password" /></div>` : `
      <div class="field"><label>گذرواژه جدید (خالی = بدون تغییر)</label><input id="f-pass" type="password" placeholder="••••••••" /></div>`}
    <div class="field"><label>نام نمایشی</label><input id="f-display" value="${esc(admin?.display_name || "")}" /></div>
    <div class="field"><label>نقش</label>
      <select id="f-role">
        <option value="super" ${admin?.role === "super" ? "selected" : ""}>مدیر کل — دسترسی کامل</option>
        <option value="operator" ${admin?.role === "operator" ? "selected" : ""}>اپراتور — مدیریت داده‌ها و تبلیغات</option>
        <option value="viewer" ${admin?.role === "viewer" ? "selected" : ""}>ناظر — فقط مشاهده</option>
      </select></div>
    ${isEdit ? `<div class="field"><label>وضعیت</label>
      <select id="f-active"><option value="1" ${admin.is_active ? "selected" : ""}>فعال</option><option value="0" ${!admin.is_active ? "selected" : ""}>غیرفعال (غیرقابل ورود)</option></select></div>` : ""}`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "ایجاد"}</button>`);
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const body = {
      display_name: document.getElementById("f-display").value.trim(),
      role: document.getElementById("f-role").value,
    };
    const pass = document.getElementById("f-pass").value;
    if (pass) body.password = pass;
    if (isEdit) body.is_active = Number(document.getElementById("f-active").value);
    else {
      body.username = document.getElementById("f-username").value.trim();
      if (!body.username) { toast("نام کاربری الزامی است", "err"); return; }
      if (pass.length < 8) { toast("گذرواژه باید حداقل ۸ کاراکتر باشد", "err"); return; }
    }
    if (!body.display_name) { toast("نام نمایشی الزامی است", "err"); return; }
    try {
      await api(isEdit ? `admins/${admin.id}` : "admins", { method: isEdit ? "PUT" : "POST", body });
      toast("ذخیره شد", "ok2"); close(); renderPage("security");
    } catch (ex) { toast(ex.message, "err"); }
  };
}

/* ---------------- شروع ---------------- */

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", render);
if (document.readyState !== "loading") render();
