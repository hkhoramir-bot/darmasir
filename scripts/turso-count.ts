/* شمارش ردیف‌های جدول‌های Turso — ابزار یک‌بارمصرف مهاجرت */
const TOKEN = process.env.TURSO_TOKEN || "";
const URL_BASE = "https://darmasir-darmasir.turso.io";

const TABLES = [
  '"User"',
  '"Session"',
  '"OtpCode"',
  '"TripHistory"',
  '"Favorite"',
  '"DailyRoute"',
  '"AppUserTrip"',
  '"AppUserFavorite"',
  '"AppUserDailyRoute"',
  '"SupportTicket"',
  '"app_users"',
  '"settings"',
  '"cities"',
  '"lines"',
  '"stations"',
  '"ads"',
  '"admins"',
  '"tickets"',
  '"voice_lexicon"',
  '"invoices"',
  '"revenues"',
];

async function count(table: string): Promise<string> {
  const res = await fetch(`${URL_BASE}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql: `SELECT COUNT(*) AS n FROM ${table}` } },
        { type: "close" },
      ],
    }),
  });
  if (!res.ok) return `HTTP_${res.status}`;
  const j: any = await res.json().catch(() => null);
  const r = j?.results?.[0];
  if (!r || r.type !== "ok") return `ERR_${r?.error?.message?.slice(0, 60) ?? "?"}`;
  const cell = r.response?.result?.rows?.[0]?.[0];
  return String(cell?.value ?? cell ?? "?");
}

const out: string[] = [];
for (const t of TABLES) {
  out.push(`${t}: ${await count(t)}`);
}
console.log(out.join("\n"));
