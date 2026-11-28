/* بررسی اسکیمای جدول‌های Turso — ابزار یک‌بارمصرف مهاجرت */
const TOKEN = process.env.TURSO_TOKEN || "";
const BASE = "https://darmasir-darmasir.turso.io";

async function q(sql: string) {
  const res = await fetch(`${BASE}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql } }, { type: "close" }] }),
  });
  const j: any = await res.json();
  const r = j?.results?.[0];
  if (!r || r.type !== "ok") return { err: r?.error?.message };
  const cols = (r.response?.result?.cols ?? []).map((c: any) => c.name);
  const rows = (r.response?.result?.rows ?? []).map((row: any[]) => {
    const o: any = {};
    cols.forEach((c, i) => (o[c] = row[i]?.value ?? null));
    return o;
  });
  return { cols, rows };
}

const TABLES = ['"User"', '"Session"', '"OtpCode"', '"TripHistory"', '"Favorite"', '"DailyRoute"', '"SupportTicket"', '"AppUserTrip"', '"AppUserFavorite"', '"AppUserDailyRoute"'];
for (const t of TABLES) {
  const r = await q(`PRAGMA table_info(${t})`);
  if (r.err) { console.log(t, "ERR", r.err); continue; }
  console.log(t, "=>", r.rows.map((x: any) => `${x.name}:${x.type}${x.pk ? "(PK)" : ""}`).join(", "));
}
// نمونه کاربر
const u = await q('SELECT * FROM "User" LIMIT 3');
console.log("sample users:", JSON.stringify(u.rows, null, 1).slice(0, 800));
