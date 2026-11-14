/* ============================================================
   پنل مدیریت درمسیر — اپلیکیشن تک‌صفحه‌ای فارسی RTL
   ============================================================ */
"use strict";

const PORT = 3035;
const TOKEN_KEY = "darmasir_admin_token";
const ADMIN_KEY = "darmasir_admin_me";

/* دسترسی از مسیر تمیز /admin/ یا مستقیم با ?XTransformPort=3035 */
const API_BASE = location.pathname.startsWith("/admin/") ? "/admin/api/v1/" : "/api/v1/";
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

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiPath(path), {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
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

/* ---------------- وضعیت ---------------- */

let me = null;
try { me = JSON.parse(localStorage.getItem(ADMIN_KEY) || "null"); } catch {}

const ROLE_LABEL = { super: "مدیر کل", operator: "اپراتور", viewer: "ناظر" };
const STATUS_LABEL = { active: ["فعال", "ok"], limited: ["محدود", "warn"], disabled: ["غیرفعال", "bad"] };
const MODE_LABEL = { metro: "مترو", bus: "اتوبوس", brt: "اتوبوس تندرو" };
const PLACE_LABEL = { home: "خانه", map: "نقشه", plan: "مسیریابی" };

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
  return `
  <div class="card kpi">
    <div class="kpi-top"><span class="kpi-lbl">${esc(label)}</span><div class="kpi-icon ${tone}"><span class="material">${icon}</span></div></div>
    <div class="kpi-num">${Number(num || 0).toLocaleString("fa-IR")}</div>
    <div class="kpi-sub"><span class="material">trending_up</span><span>${esc(sub)}</span></div>
  </div>`;
}

function filterTables(q) {
  document.querySelectorAll("table.tbl tbody").forEach((tb) => {
    tb.querySelectorAll("tr").forEach((tr) => {
      tr.style.display = !q || tr.textContent.includes(q) ? "" : "none";
    });
  });
}

/* ---------------- مسیریابی ---------------- */

const PAGES = [
  { id: "dashboard", title: "داشبورد مدیریتی", icon: "dashboard" },
  { id: "users", title: "کاربران", icon: "group" },
  { id: "lines", title: "خطوط", icon: "alt_route" },
  { id: "stations", title: "ایستگاه‌ها", icon: "location_on" },
  { id: "ads", title: "تبلیغات و بنرها", icon: "campaign" },
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
  document.getElementById("logout-btn").onclick = async () => {
    try { await api("auth/logout", { method: "POST" }); } catch {}
    logoutLocal();
  };
  const burger = document.getElementById("burger");
  const sidebar = document.getElementById("sidebar");
  burger.onclick = () => sidebar.classList.toggle("open");
  document.addEventListener("click", function onDoc(e) {
    if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && e.target !== burger && !burger.contains(e.target)) {
      sidebar.classList.remove("open");
      document.querySelectorAll(".sidebar-back").forEach((x) => x.remove());
    }
  });
  if (sidebar.classList.contains("open")) {
    const back = document.createElement("div");
    back.className = "sidebar-back";
    document.body.appendChild(back);
  }
  const ts = document.getElementById("top-search");
  if (ts) {
    ts.oninput = () => filterTables(ts.value.trim());
  }
  renderPage(cur.id);
  if (ts && ts.value.trim()) filterTables(ts.value.trim());
}

function loginView() {
  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-logo"><span class="material fill">subway</span></div>
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
          <div class="brand-logo"><span class="material fill">subway</span></div>
          <div class="brand-txt">
            <div class="brand-title-row"><b>درمسیر</b><span class="ver-chip">نسخه ۲.۴</span></div>
            <span class="brand-sub">پنل مدیریت سامانه ناوبری شهری</span>
          </div>
        </div>
        <nav class="nav" aria-label="ناوبری پنل">${nav}</nav>
      </div>
      <div class="side-foot">
        <div class="side-meta"><span class="material">database</span><span>پایگاه داده محلی فعال — بدون وابستگی خارجی</span></div>
        <button class="logout-btn" id="logout-btn"><span class="material">logout</span><span>خروج از حساب</span></button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="burger" id="burger" aria-label="منو"><span class="material">menu</span></button>
        <div class="top-search">
          <span class="material">search</span>
          <input id="top-search" type="search" placeholder="جستجو در جدول‌های این صفحه…" aria-label="جستجو در صفحه" />
        </div>
        <div class="db-chip"><span class="pulse"></span><span>اتصال پایگاه داده فعال</span></div>
        <span class="top-divider"></span>
        <div class="me-box">
          <div class="who"><b>${esc(me.display_name)}</b><span>${ROLE_LABEL[me.role] || me.role} — ${esc(me.username || "")}</span></div>
          <div class="avatar">${esc((me.display_name || "?").slice(0, 1))}</div>
        </div>
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
    else if (id === "lines") await pageLines(host);
    else if (id === "stations") await pageStations(host);
    else if (id === "ads") await pageAds(host);
    else if (id === "voice") await pageVoice(host);
    else if (id === "settings") await pageSettings(host);
    else if (id === "reports") await pageReports(host);
    else if (id === "security") await pageSecurity(host);
  } catch (ex) {
    host.innerHTML = `<div class="card"><div class="empty">${esc(ex.message)}</div></div>`;
  }
}

/* ---------------- صفحات ---------------- */

async function pageDashboard(host) {
  const d = await api("dashboard");
  const maxApi = Math.max(...d.api_last7.map((x) => x.count), 1);
  host.innerHTML = `
    ${pageHead("داشبورد مدیریتی", "نمای کلی آمار کاربران، سفرها، تبلیغات و وضعیت سرویس‌های درمسیر")}
    <div class="kpi-grid">
      ${kpi("کل کاربران", "group", d.users_total, "کاربر ثبت‌شده در سامانه", "t-primary")}
      ${kpi("کاربران فعال", "trending_up", d.users_active, "کاربر با نشست اخیر", "t-tertiary")}
      ${kpi("سفرهای ثبت‌شده", "route", d.trips_total, "از ابتدا تا امروز", "t-surface")}
      ${kpi("تبلیغ فعال", "campaign", d.ads_active, "کمپین در حال نمایش", "t-dim")}
    </div>
    <div class="kpi-grid kpi-grid-3">
      ${kpi("خط فعال", "alt_route", d.lines_active, "خط در حال سرویس‌دهی", "t-primary")}
      ${kpi("ایستگاه", "location_on", d.stations_total, "ایستگاه ثبت‌شده در پایگاه داده", "t-surface")}
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">dns</span>وضعیت سرویس‌ها</h3>
        ${d.services.map((s) => `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:7px 0; border-bottom:1px solid rgba(194,198,211,.35)">
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
    </div>`;
}

function actionLabel(a) {
  return {
    login: "ورود به پنل", login_failed: "ورود ناموفق", logout: "خروج",
    user_create: "ایجاد کاربر", user_update: "ویرایش کاربر", user_delete: "حذف کاربر",
    line_create: "ایجاد خط", line_update: "ویرایش خط", line_delete: "حذف خط",
    station_create: "ایجاد ایستگاه", station_update: "ویرایش ایستگاه", station_delete: "حذف ایستگاه",
    ad_create: "ایجاد تبلیغ", ad_update: "ویرایش تبلیغ", ad_delete: "حذف تبلیغ",
    lexicon_create: "افزودن مدخل تلفظ", settings_update: "بروزرسانی تنظیمات",
    admin_create: "ایجاد مدیر", admin_update: "ویرایش مدیر", admin_delete: "حذف مدیر",
  }[a] || a;
}

/* ---------- کاربران ---------- */

async function pageUsers(host) {
  const writable = can("operator");
  host.innerHTML = `
    ${pageHead("کاربران", "مشاهده و مدیریت حساب‌های مسافران، وضعیت و محدودیت‌های دسترسی.",
      writable ? `<button class="btn btn-primary" id="u-add"><span class="material">add</span><span>کاربر جدید</span></button>` : "")}
    <div class="toolbar">
      <input id="u-q" placeholder="جست‌وجوی نام یا شماره…" style="min-width:220px" />
      <select id="u-status">
        <option value="">همه وضعیت‌ها</option>
        <option value="active">فعال</option>
        <option value="limited">محدود</option>
        <option value="disabled">غیرفعال</option>
      </select>
    </div>
    <div id="u-table"></div>`;
  const load = async () => {
    const q = document.getElementById("u-q").value.trim();
    const st = document.getElementById("u-status").value;
    const rows = await api(`users?q=${encodeURIComponent(q)}&status=${st}`);
    document.getElementById("u-table").innerHTML = rows.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>نام</th><th>شماره</th><th>وضعیت</th><th>سفرها</th><th>عضویت</th><th>آخرین بازدید</th>${writable ? "<th>عملیات</th>" : ""}</tr></thead>
        <tbody>
          ${rows.map((u) => {
            const [lbl, cls] = STATUS_LABEL[u.status] || [u.status, "off"];
            return `<tr>
              <td><b>${esc(u.display_name)}</b></td>
              <td>${esc(u.phone || "—")}</td>
              <td><span class="badge ${cls}">${lbl}</span></td>
              <td>${Number(u.trips_count || 0).toLocaleString("fa-IR")}</td>
              <td>${faTime(u.created_at)}</td>
              <td>${faTime(u.last_seen)}</td>
              ${writable ? `<td><div class="acts">
                <button class="icon-btn" data-edit="${u.id}" title="ویرایش کاربر"><span class="material">edit</span></button>
                <button class="icon-btn danger" data-del="${u.id}" data-name="${esc(u.display_name)}" title="حذف کاربر"><span class="material">delete</span></button>
              </div></td>` : ""}
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>` : `<div class="card"><div class="empty"><span class="material">group_off</span>کاربری یافت نشد</div></div>`;
    if (writable) {
      document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openUserForm(rows.find((x) => x.id === Number(b.dataset.edit)))));
      document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog(`کاربر «${b.dataset.name}» حذف شود؟`, async () => {
          await api(`users/${b.dataset.del}`, { method: "DELETE" });
          toast("کاربر حذف شد", "ok2"); load();
        })));
    }
  };
  document.getElementById("u-q").oninput = load;
  document.getElementById("u-status").onchange = load;
  const addBtn = document.getElementById("u-add");
  if (addBtn) addBtn.onclick = () => openUserForm(null, load);
  await load();
}

function openUserForm(user, after) {
  const isEdit = !!user;
  const close = modal(isEdit ? "ویرایش کاربر" : "کاربر جدید", `
    <div class="field"><label>نام نمایشی</label><input id="f-name" value="${esc(user?.display_name || "")}" placeholder="مثلاً کاربر نمونه" /></div>
    <div class="field"><label>شماره تماس</label><input id="f-phone" value="${esc(user?.phone || "")}" placeholder="۰۹…" /></div>
    <div class="field"><label>وضعیت</label>
      <select id="f-status">
        <option value="active" ${user?.status === "active" ? "selected" : ""}>فعال</option>
        <option value="limited" ${user?.status === "limited" ? "selected" : ""}>محدود</option>
        <option value="disabled" ${user?.status === "disabled" ? "selected" : ""}>غیرفعال</option>
      </select></div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "افزودن"}</button>`);
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const body = {
      display_name: document.getElementById("f-name").value.trim(),
      phone: document.getElementById("f-phone").value.trim(),
      status: document.getElementById("f-status").value,
    };
    if (!body.display_name) { toast("نام الزامی است", "err"); return; }
    try {
      await api(isEdit ? `users/${user.id}` : "users", { method: isEdit ? "PUT" : "POST", body });
      toast(isEdit ? "کاربر بروزرسانی شد" : "کاربر اضافه شد", "ok2");
      close(); after ? after() : renderPage("users");
    } catch (ex) { toast(ex.message, "err"); }
  };
}

/* ---------- خطوط ---------- */

async function pageLines(host) {
  const writable = can("operator");
  let mode = "metro";
  host.innerHTML = `
    ${pageHead("خطوط", "مدیریت خطوط مترو، اتوبوس و اتوبوس تندرو؛ مشاهده و اصلاح داده‌های حمل‌ونقل.",
      writable ? `<button class="btn btn-primary" id="l-add"><span class="material">add</span><span>خط جدید</span></button>` : "")}
    <div class="toolbar">
      <select id="l-mode">
        <option value="metro">مترو</option>
        <option value="bus">اتوبوس</option>
        <option value="brt">اتوبوس تندرو</option>
      </select>
    </div>
    <div id="l-table"></div>`;
  const load = async () => {
    const rows = await api(`lines?mode=${mode}`);
    document.getElementById("l-table").innerHTML = rows.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th></th><th>نام خط</th><th>شماره</th><th>سرخط‌ها</th><th>جهت</th><th>وضعیت</th>${writable ? "<th>عملیات</th>" : ""}</tr></thead>
        <tbody>
          ${rows.map((l) => `
            <tr>
              <td><span class="dot" style="background:${esc(l.color)}"></span></td>
              <td><b>${esc(l.name)}</b></td>
              <td>${l.number ?? "—"}</td>
              <td>${esc((l.terminals || "").split("|").filter(Boolean).join(" ← ")) || "—"}</td>
              <td>${esc(l.direction || "—")}</td>
              <td><span class="badge ${l.is_active ? "ok" : "off"}">${l.is_active ? "فعال" : "غیرفعال"}</span></td>
              ${writable ? `<td><div class="acts">
                <button class="icon-btn" data-edit="${l.id}" title="ویرایش خط"><span class="material">edit</span></button>
                <button class="icon-btn danger" data-del="${l.id}" data-name="${esc(l.name)}" title="حذف خط"><span class="material">delete</span></button>
              </div></td>` : ""}
            </tr>`).join("")}
        </tbody>
      </table></div>` : `<div class="card"><div class="empty"><span class="material">alt_route</span>خطی در این دسته ثبت نشده است</div></div>`;
    if (writable) {
      document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openLineForm(rows.find((x) => x.id === Number(b.dataset.edit)))));
      document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog(`خط «${b.dataset.name}» و ایستگاه‌هایش حذف شوند؟`, async () => {
          await api(`lines/${b.dataset.del}`, { method: "DELETE" });
          toast("خط حذف شد", "ok2"); load();
        })));
    }
  };
  document.getElementById("l-mode").onchange = (e) => { mode = e.target.value; load(); };
  const addBtn = document.getElementById("l-add");
  if (addBtn) addBtn.onclick = () => openLineForm(null, load);
  await load();
}

function openLineForm(line, after) {
  const isEdit = !!line;
  const close = modal(isEdit ? "ویرایش خط" : "خط جدید", `
    <div class="field"><label>نام خط</label><input id="f-name" value="${esc(line?.name || "")}" placeholder="مثلاً خط ۱" /></div>
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
    <div class="field"><label>سرخط‌ها</label><input id="f-terminals" value="${esc((line?.terminals || "").split("|").join("|"))}" placeholder="مبدأ|مقصد" /><span class="hint">دو سرخط را با «|» جدا کنید</span></div>
    <div class="field"><label>جهت</label><input id="f-direction" value="${esc(line?.direction || "")}" placeholder="مثلاً شمال - جنوب" /></div>
    <div class="field"><label>وضعیت</label>
      <select id="f-active"><option value="1" ${!line || line.is_active ? "selected" : ""}>فعال</option><option value="0" ${line && !line.is_active ? "selected" : ""}>غیرفعال</option></select></div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "افزودن"}</button>`);
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const body = {
      name: document.getElementById("f-name").value.trim(),
      mode: document.getElementById("f-mode").value,
      number: document.getElementById("f-number").value,
      color: document.getElementById("f-color").value.trim(),
      terminals: document.getElementById("f-terminals").value.trim(),
      direction: document.getElementById("f-direction").value.trim(),
      is_active: Number(document.getElementById("f-active").value),
    };
    if (!body.name) { toast("نام خط الزامی است", "err"); return; }
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
  const lines = await api("lines");
  if (!lines.length) { host.innerHTML = `${pageHead("ایستگاه‌ها", "مدیریت ایستگاه‌های هر خط و مختصات جغرافیایی.")}<div class="card"><div class="empty"><span class="material">location_off</span>ابتدا یک خط ثبت کنید</div></div>`; return; }
  host.innerHTML = `
    ${pageHead("ایستگاه‌ها", "مدیریت ایستگاه‌های هر خط و مختصات جغرافیایی.",
      writable ? `<button class="btn btn-primary" id="s-add"><span class="material">add</span><span>ایستگاه جدید</span></button>` : "")}
    <div class="toolbar">
      <select id="s-line">${lines.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join("")}</select>
    </div>
    <div id="s-table"></div>`;
  const load = async () => {
    const lineId = document.getElementById("s-line").value;
    const rows = await api(`stations?line_id=${lineId}`);
    document.getElementById("s-table").innerHTML = rows.length ? `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>ترتیب</th><th>نام ایستگاه</th><th>عرض جغرافیایی</th><th>طول جغرافیایی</th><th>وضعیت</th>${writable ? "<th>عملیات</th>" : ""}</tr></thead>
        <tbody>
          ${rows.map((s) => `
            <tr>
              <td>${s.order_index}</td>
              <td><b>${esc(s.name)}</b></td>
              <td>${s.lat ?? "—"}</td>
              <td>${s.lng ?? "—"}</td>
              <td><span class="badge ${s.is_active ? "ok" : "off"}">${s.is_active ? "فعال" : "غیرفعال"}</span></td>
              ${writable ? `<td><div class="acts">
                <button class="icon-btn" data-edit="${s.id}" title="ویرایش ایستگاه"><span class="material">edit</span></button>
                <button class="icon-btn danger" data-del="${s.id}" data-name="${esc(s.name)}" title="حذف ایستگاه"><span class="material">delete</span></button>
              </div></td>` : ""}
            </tr>`).join("")}
        </tbody>
      </table></div>` : `<div class="card"><div class="empty"><span class="material">location_off</span>برای این خط ایستگاهی ثبت نشده است</div></div>`;
    if (writable) {
      document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openStationForm(lineId, rows.find((x) => x.id === Number(b.dataset.edit)))));
      document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog(`ایستگاه «${b.dataset.name}» حذف شود؟`, async () => {
          await api(`stations/${b.dataset.del}`, { method: "DELETE" });
          toast("ایستگاه حذف شد", "ok2"); load();
        })));
    }
  };
  document.getElementById("s-line").onchange = load;
  const addBtn = document.getElementById("s-add");
  if (addBtn) addBtn.onclick = () => openStationForm(document.getElementById("s-line").value, null, load);
  await load();
}

function openStationForm(lineId, station, after) {
  const isEdit = !!station;
  const close = modal(isEdit ? "ویرایش ایستگاه" : "ایستگاه جدید", `
    <div class="field"><label>نام ایستگاه</label><input id="f-name" value="${esc(station?.name || "")}" placeholder="مثلاً تجریش" /></div>
    <div class="grid cols-2">
      <div class="field"><label>عرض جغرافیایی</label><input id="f-lat" value="${station?.lat ?? ""}" placeholder="35.7…" /></div>
      <div class="field"><label>طول جغرافیایی</label><input id="f-lng" value="${station?.lng ?? ""}" placeholder="51.4…" /></div>
    </div>
    <div class="field"><label>ترتیب در خط</label><input id="f-order" type="number" value="${station?.order_index ?? 0}" /></div>
    <div class="field"><label>وضعیت</label>
      <select id="f-active"><option value="1" ${!station || station.is_active ? "selected" : ""}>فعال</option><option value="0" ${station && !station.is_active ? "selected" : ""}>غیرفعال</option></select></div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "افزودن"}</button>`);
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const body = {
      line_id: Number(lineId),
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
      close(); after ? after() : renderPage("stations");
    } catch (ex) { toast(ex.message, "err"); }
  };
}

/* ---------- تبلیغات ---------- */

async function pageAds(host) {
  const writable = can("operator");
  const rows = await api("ads");
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
  const PLACE_ICON = { home: "view_carousel", map: "map", plan: "alt_route" };
  const PLACE_CLASS = { home: "", map: "alt", plan: "warn2" };
  host.innerHTML = `
    ${pageHead("تبلیغات و بنرها", "پیکربندی کمپین‌های درون‌برنامه‌ای و زمان‌بندی نمایش؛ خاموش‌کردن تبلیغ بدون انتشار نسخه جدید اپلیکیشن.",
      writable ? `<button class="btn btn-primary" id="a-add"><span class="material">add</span><span>ایجاد کمپین / بنر جدید</span></button>` : "")}
    <div class="tbl-card">
      <div class="tabbar" id="a-tabs">
        ${TABS.map(([id, lbl, fn]) => `<button class="tab ${id === tab ? "active" : ""}" data-tab="${id}">${lbl} (${rows.filter(fn).length.toLocaleString("fa-IR")})</button>`).join("")}
      </div>
      <div id="a-table"></div>
      <div class="tbl-foot" id="a-foot"></div>
    </div>`;
  const renderTable = () => {
    const fn = (TABS.find((t) => t[0] === tab) || TABS[0])[2];
    const filtered = rows.filter(fn);
    document.getElementById("a-table").innerHTML = filtered.length ? `
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>عنوان و تصویر بنر</th><th>جایگاه نمایش در اپ</th><th>بازه زمانی</th><th class="cell-center">وضعیت زنده</th><th>آمار کلیک / نمایش</th>${writable ? '<th class="cell-center">عملیات</th>' : ""}</tr></thead>
      <tbody>
        ${filtered.map((a) => {
          const live = isLive(a);
          const ctr = a.impressions ? (a.clicks / a.impressions) * 100 : 0;
          const fill = Math.min(Math.max(ctr * 20, 4), 100);
          return `<tr>
            <td>
              <div class="cell-media">
                ${a.image_url ? `<img class="thumb" src="${esc(a.image_url)}" alt="تصویر بنر ${esc(a.title)}" onerror="this.style.display='none'" />` : `<div class="thumb thumb-empty"><span class="material">campaign</span></div>`}
                <div>
                  <b>${esc(a.title)}</b>
                  <span class="cell-sub">شناسه: #AD-${String(a.id).padStart(4, "0")}</span>
                </div>
              </div>
            </td>
            <td><span class="placement-chip ${PLACE_CLASS[a.placement] || ""}"><span class="material">${PLACE_ICON[a.placement] || "info"}</span>${PLACE_LABEL[a.placement] || a.placement}</span></td>
            <td class="cell-range">
              <span>${a.starts_at ? faTime(a.starts_at) : "بدون شروع"}</span>
              <span class="m-live" style="display:block">تا ${a.ends_at ? faTime(a.ends_at) : "پایان نامحدود"}</span>
            </td>
            <td class="cell-center">
              ${writable ? `<label class="switch"><input type="checkbox" data-toggle="${a.id}" ${a.is_active ? "checked" : ""} aria-label="وضعیت ${esc(a.title)}" /><span class="knob"></span></label>` : `<span class="badge ${live ? "ok" : "off"}">${live ? "در حال نمایش" : "خاموش"}</span>`}
            </td>
            <td>
              <div class="cell-meter">
                <div class="meter-row"><span class="m-imp">${Number(a.impressions || 0).toLocaleString("fa-IR")} نمایش</span><span class="m-ctr">${Number(a.clicks || 0).toLocaleString("fa-IR")} کلیک (${ctr.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪)</span></div>
                <div class="meter"><div class="meter-fill ${ctr >= 4 ? "good" : ctr < 1 ? "low" : ""}" style="width:${fill}%"></div></div>
              </div>
            </td>
            ${writable ? `<td class="cell-center"><div class="acts" style="justify-content:center">
              <button class="icon-btn" data-imp="${a.id}" title="ثبت نمایش آزمایشی"><span class="material">visibility</span></button>
              <button class="icon-btn" data-clk="${a.id}" title="ثبت کلیک آزمایشی"><span class="material">ads_click</span></button>
              <button class="icon-btn" data-edit="${a.id}" title="ویرایش بنر"><span class="material">edit</span></button>
              <button class="icon-btn danger" data-del="${a.id}" data-name="${esc(a.title)}" title="حذف بنر"><span class="material">delete</span></button>
            </div></td>` : ""}
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>` : `<div class="empty"><span class="material">campaign</span>در این دسته کمپینی ثبت نشده است</div>`;
    document.getElementById("a-foot").textContent = `نمایش ${filtered.length.toLocaleString("fa-IR")} از مجموع ${rows.length.toLocaleString("fa-IR")} کمپین ثبت‌شده در پایگاه داده`;
    if (writable) {
      document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openAdForm(rows.find((x) => x.id === Number(b.dataset.edit)))));
      document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog(`تبلیغ «${b.dataset.name}» حذف شود؟`, async () => {
          await api(`ads/${b.dataset.del}`, { method: "DELETE" });
          toast("تبلیغ حذف شد", "ok2"); renderPage("ads");
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
  if (writable) document.getElementById("a-add").onclick = () => openAdForm(null);
  renderTable();
}

function openAdForm(ad) {
  const isEdit = !!ad;
  const dt = (v) => v ? new Date(v).toISOString().slice(0, 16) : "";
  const close = modal(isEdit ? "ویرایش تبلیغ" : "تبلیغ جدید", `
    <div class="field"><label>عنوان</label><input id="f-title" value="${esc(ad?.title || "")}" placeholder="مثلاً بنر فروشگاه X" /></div>
    <div class="field"><label>آدرس تصویر</label><input id="f-img" value="${esc(ad?.image_url || "")}" placeholder="https://…" style="direction:ltr" /></div>
    <div class="field"><label>لینک مقصد</label><input id="f-link" value="${esc(ad?.link_url || "")}" placeholder="https://…" style="direction:ltr" /></div>
    <div class="field"><label>محل نمایش</label>
      <select id="f-place">
        <option value="home" ${ad?.placement === "home" || !ad ? "selected" : ""}>خانه</option>
        <option value="map" ${ad?.placement === "map" ? "selected" : ""}>نقشه</option>
        <option value="plan" ${ad?.placement === "plan" ? "selected" : ""}>مسیریابی</option>
      </select></div>
    <div class="grid cols-2">
      <div class="field"><label>شروع نمایش</label><input id="f-start" type="datetime-local" value="${dt(ad?.starts_at)}" /></div>
      <div class="field"><label>پایان نمایش</label><input id="f-end" type="datetime-local" value="${dt(ad?.ends_at)}" /></div>
    </div>
    <div class="field"><label>وضعیت</label>
      <select id="f-active"><option value="1" ${ad?.is_active ? "selected" : ""}>فعال</option><option value="0" ${!ad || !ad.is_active ? "selected" : ""}>خاموش</option></select></div>`,
    `<button class="btn" id="f-cancel">انصراف</button><button class="btn btn-primary" id="f-save">${isEdit ? "ذخیره" : "افزودن"}</button>`);
  document.getElementById("f-cancel").onclick = close;
  document.getElementById("f-save").onclick = async () => {
    const body = {
      title: document.getElementById("f-title").value.trim(),
      image_url: document.getElementById("f-img").value.trim(),
      link_url: document.getElementById("f-link").value.trim(),
      placement: document.getElementById("f-place").value,
      starts_at: document.getElementById("f-start").value ? new Date(document.getElementById("f-start").value).toISOString() : null,
      ends_at: document.getElementById("f-end").value ? new Date(document.getElementById("f-end").value).toISOString() : null,
      is_active: Number(document.getElementById("f-active").value),
    };
    if (!body.title) { toast("عنوان الزامی است", "err"); return; }
    try {
      await api(isEdit ? `ads/${ad.id}` : "ads", { method: isEdit ? "PUT" : "POST", body });
      toast(isEdit ? "تبلیغ بروزرسانی شد" : "تبلیغ اضافه شد", "ok2");
      close(); renderPage("ads");
    } catch (ex) { toast(ex.message, "err"); }
  };
}

/* ---------- دستیار صوتی ---------- */

async function pageVoice(host) {
  const writable = can("operator");
  const [lex, settings] = await Promise.all([api("voice-lexicon"), api("settings")]);
  host.innerHTML = `
    ${pageHead("دستیار صوتی", "تنظیم متن‌های ثابت، فرهنگ تلفظ و تنظیمات مجاز سرویس صوتی.")}
    <div class="grid cols-2">
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
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">translate</span>فرهنگ تلفظ</h3>
        <p class="card-sub" style="margin-top:0">نگاشت گفتار به نوشتار — برای تشخیص صحیح نام ایستگاه‌ها و مکان‌ها</p>
        <div id="v-lex"></div>
      </div>
    </div>`;
  const renderLex = (rows) => {
    document.getElementById("v-lex").innerHTML = rows.length ? `
      <div class="tbl-wrap" style="max-height:280px"><table class="tbl">
        <thead><tr><th>گفتاری</th><th>نوشتاری</th><th>اولویت</th>${writable ? "<th></th>" : ""}</tr></thead>
        <tbody>${rows.map((l) => `
          <tr><td>${esc(l.spoken)}</td><td>${esc(l.written)}</td><td>${l.priority}</td>
          ${writable ? `<td><div class="acts">
            <button class="icon-btn" data-edit="${l.id}" title="ویرایش مدخل"><span class="material">edit</span></button>
            <button class="icon-btn danger" data-del="${l.id}" title="حذف مدخل"><span class="material">delete</span></button>
          </div></td>` : ""}</tr>`).join("")}</tbody>
      </table></div>` : `<div class="empty"><span class="material">record_voice_over</span>مدخلی ثبت نشده است</div>`;
    if (writable) {
      document.querySelectorAll("#v-lex [data-edit]").forEach((b) => (b.onclick = () => openLexForm(rows.find((x) => x.id === Number(b.dataset.edit)))));
      document.querySelectorAll("#v-lex [data-del]").forEach((b) => (b.onclick = () =>
        confirmDialog("این مدخل تلفظ حذف شود؟", async () => {
          await api(`voice-lexicon/${b.dataset.del}`, { method: "DELETE" });
          toast("مدخل حذف شد", "ok2"); renderPage("voice");
        })));
    }
  };
  renderLex(lex);
  document.getElementById("v-save")?.addEventListener("click", async () => {
    try {
      await api("settings", { method: "PUT", body: { voice_service: document.getElementById("v-service").value, voice_enabled: document.getElementById("v-enabled").value } });
      toast("تنظیمات صوتی ذخیره شد", "ok2");
    } catch (ex) { toast(ex.message, "err"); }
  });
  const addBtn = document.createElement("button");
  addBtn.className = "btn btn-sm btn-primary";
  addBtn.textContent = "+ مدخل جدید";
  addBtn.onclick = () => openLexForm(null);
  document.querySelector("#v-lex").parentElement.querySelector("h3").appendChild(addBtn);
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
}

/* ---------- تنظیمات عمومی ---------- */

async function pageSettings(host) {
  const s = await api("settings");
  const readOnly = me.role !== "super";
  const F = (key, label, type = "text") => `
    <div class="field"><label>${label}</label>
      <input id="st-${key}" value="${esc(s[key]?.value || "")}" ${readOnly ? "disabled" : ""} ${type === "number" ? 'type="number"' : ""} /></div>`;
  host.innerHTML = `
    ${pageHead("تنظیمات سامانه", "نام، لوگو، پیام‌ها، نسخه و تنظیمات عمومی برنامه — فقط برای مدیر کل.")}
    <div class="grid cols-2">
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">app_shortcut</span>هویت برنامه</h3>
        ${F("app_name", "نام برنامه")}
        ${F("app_version", "نسخه فعلی")}
        ${F("welcome_message", "پیام خوش‌آمد")}
        ${F("support_message", "پیام پشتیبانی")}
      </div>
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">engineering</span>وضعیت عملیاتی</h3>
        <div class="field"><label>حالت نگهداری</label>
          <select id="st-maintenance_mode" ${readOnly ? "disabled" : ""}>
            <option value="off" ${s.maintenance_mode?.value !== "on" ? "selected" : ""}>خاموش (عادی)</option>
            <option value="on" ${s.maintenance_mode?.value === "on" ? "selected" : ""}>روشن (کاربران پیام نگهداری می‌بینند)</option>
          </select></div>
        <p class="card-sub">در حالت نگهداری، پیام خوش‌آمد جایگزین بخش‌های حساس برنامه می‌شود. تنظیمات از مسیر نسخه‌دار /api/v1/ اعمال می‌شوند.</p>
        ${!readOnly ? `<button class="btn btn-primary" id="st-save">ذخیره تنظیمات</button>` : `<p class="card-sub">ذخیره تنظیمات فقط برای مدیر کل مجاز است.</p>`}
      </div>
    </div>`;
  document.getElementById("st-save")?.addEventListener("click", async () => {
    const body = {
      app_name: document.getElementById("st-app_name").value.trim(),
      app_version: document.getElementById("st-app_version").value.trim(),
      welcome_message: document.getElementById("st-welcome_message").value.trim(),
      support_message: document.getElementById("st-support_message").value.trim(),
      maintenance_mode: document.getElementById("st-maintenance_mode").value,
    };
    try {
      await api("settings", { method: "PUT", body });
      toast("تنظیمات ذخیره شد", "ok2");
    } catch (ex) { toast(ex.message, "err"); }
  });
}

/* ---------- گزارش‌ها ---------- */

async function pageReports(host) {
  const r = await api("reports");
  const maxApi = Math.max(...r.api_stats.map((x) => x.count), 1);
  const statsAsc = [...r.api_stats].reverse();
  host.innerHTML = `
    ${pageHead("گزارش‌ها و تحلیل داده", "آمار استفاده، عملکرد API، عملکرد تبلیغات و تاریخچه تغییرات داده.")}
    <div class="kpi-grid kpi-grid-3">
      ${kpi("نشست فعال مدیران", "how_to_reg", r.active_sessions, "نشست جاری پنل", "t-primary")}
      ${kpi("درخواست API — ۱۴ روز", "api", r.api_stats.reduce((s, x) => s + x.count, 0), "مجموع فراخوانی نسخه‌دار", "t-surface")}
      ${kpi("آخرین تغییرات داده", "edit_note", r.changes.length, "رویداد ثبت‌شده در وقایع‌نگاری", "t-tertiary")}
    </div>
    <div class="grid cols-2">
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">monitoring</span>درخواست‌های API — ۱۴ روز اخیر</h3>
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
        <h3><span class="material" style="color:var(--primary)">ads_click</span>عملکرد تبلیغات</h3>
        ${r.ads.length ? `<div class="tbl-wrap" style="max-height:200px"><table class="tbl">
          <thead><tr><th>عنوان</th><th>نمایش</th><th>کلیک</th><th>وضعیت</th></tr></thead>
          <tbody>${r.ads.map((a) => `<tr>
            <td>${esc(a.title)}</td>
            <td>${Number(a.impressions).toLocaleString("fa-IR")}</td>
            <td>${Number(a.clicks).toLocaleString("fa-IR")}</td>
            <td><span class="badge ${a.is_active ? "ok" : "off"}">${a.is_active ? "فعال" : "خاموش"}</span></td>
          </tr>`).join("")}</tbody></table></div>` : `<div class="empty"><span class="material">campaign</span>تبلیغی ثبت نشده است</div>`}
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3><span class="material" style="color:var(--primary)">history</span>تاریخچه تغییرات داده</h3>
      <div class="feed">
        ${r.changes.length ? r.changes.map((c) => `
          <div class="feed-item">
            <span class="fi-dot" style="background:${c.action === "delete" ? "var(--error)" : c.action === "create" ? "var(--tertiary-container)" : "var(--primary-fixed-dim)"}"></span>
            <div class="fi-body"><b>${entityLabel(c.entity)} — ${c.action === "create" ? "ایجاد" : c.action === "update" ? "ویرایش" : "حذف"}</b><p>${esc(c.admin_name)}${c.details ? " — " + esc(c.details) : ""}</p></div>
            <span class="fi-time">${faTime(c.created_at)}</span>
          </div>`).join("") : `<div class="empty"><span class="material">inbox</span>تغییری ثبت نشده است</div>`}
      </div>
    </div>`;
}

function entityLabel(e) {
  return { app_user: "کاربر", line: "خط", station: "ایستگاه", ad: "تبلیغ", voice_lexicon: "فرهنگ تلفظ" }[e] || e;
}

/* ---------- امنیت ---------- */

async function pageSecurity(host) {
  const s = await api("security");
  host.innerHTML = `
    ${pageHead("امنیت و وقایع‌نگاری", "مدیران پنل، نقش‌ها، نشست‌های فعال و گزارش رویدادهای امنیتی.")}
    <div class="grid cols-2">
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">admin_panel_settings</span>مدیران پنل</h3>
        <div style="margin-bottom:10px"><button class="btn btn-primary btn-sm" id="adm-add">+ مدیر جدید</button></div>
        <div class="tbl-wrap" style="max-height:300px"><table class="tbl">
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
      <div class="card">
        <h3><span class="material" style="color:var(--primary)">wifi_tethering</span>نشست‌های فعال</h3>
        <div class="tbl-wrap" style="max-height:150px"><table class="tbl">
          <thead><tr><th>مدیر</th><th>IP</th><th>ایجاد</th><th>انقضا</th></tr></thead>
          <tbody>${s.sessions.length ? s.sessions.map((x) => `
            <tr><td>${esc(x.display_name)}</td><td style="direction:ltr;text-align:right">${esc(x.ip || "—")}</td>
            <td>${faTime(x.created_at)}</td><td>${faTime(x.expires_at)}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">نشستی فعال نیست</td></tr>`}</tbody>
        </table></div>
        <h3 style="margin-top:16px"><span class="material" style="color:var(--primary)">security</span>گزارش رویدادهای امنیتی (۱۰۰ مورد اخیر)</h3>
        <div class="feed" style="max-height:260px">
          ${s.audit.length ? s.audit.map((a) => `
            <div class="feed-item">
              <span class="fi-dot" style="background:${a.action === "login_failed" ? "var(--error)" : "var(--tertiary-container)"}"></span>
              <div class="fi-body"><b>${esc(actionLabel(a.action))}</b><p>${esc(a.admin_name)}${a.details ? " — " + esc(a.details) : ""} ${a.ip ? `(IP: ${esc(a.ip)})` : ""}</p></div>
              <span class="fi-time">${faTime(a.created_at)}</span>
            </div>`).join("") : `<div class="empty"><span class="material">shield</span>رویدادی ثبت نشده است</div>`}
        </div>
      </div>
    </div>`;
  document.getElementById("adm-add").onclick = () => openAdminForm(null);
  document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openAdminForm(s.admins.find((x) => x.id === Number(b.dataset.edit)))));
  document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () =>
    confirmDialog(`مدیر «${b.dataset.name}» حذف شود؟`, async () => {
      await api(`admins/${b.dataset.del}`, { method: "DELETE" });
      toast("مدیر حذف شد", "ok2"); renderPage("security");
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
