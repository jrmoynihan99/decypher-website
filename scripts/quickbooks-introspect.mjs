/**
 * Read-only QuickBooks Online introspection — answers the questions the
 * Creator Finances parser depends on, before we write a line of it: which
 * company the token points at, what that company's chart of accounts actually
 * looks like (AccountSubType is the join key for cross-client aggregation), and
 * the real shape of a ProfitAndLoss report summarised by month.
 *
 * Intuit's docs describe the report response loosely and the row tree varies
 * with how the client set their books up, so the fixtures this writes are the
 * spec — parse.ts is developed against them, not against the documentation.
 *
 * Makes GET requests only. Never prints a token.
 *
 * Bootstrapping: this runs BEFORE the app's OAuth flow exists, so it wants a
 * short-lived access token pasted into .env.local. Get one in ~30 seconds from
 * https://developer.intuit.com/app/developer/playground — pick your app, scope
 * com.intuit.quickbooks.accounting, and copy both the access token and the
 * realm (company) id. The token dies after an hour; re-paste and re-run.
 *
 *   QUICKBOOKS_ACCESS_TOKEN=...    (from the OAuth Playground)
 *   QUICKBOOKS_REALM_ID=...        (the company id shown next to it)
 *   QUICKBOOKS_ENV=sandbox         (or production)
 *
 *   node scripts/quickbooks-introspect.mjs
 *   node scripts/quickbooks-introspect.mjs --write-fixtures
 */
import { createDecipheriv } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

// Node's own parser, which handles the quoted multi-line PEM in FIREBASE_PRIVATE_KEY.
// A naive line-by-line regex silently truncates it and you get "Failed to parse
// private key" from somewhere unrelated.
process.loadEnvFile(".env.local");
const env = process.env;

/**
 * Two ways in, tried in order:
 *
 *  1. A connection already stored by the portal. Once any company is connected
 *     there's nothing to paste — we read its access token straight out of
 *     Firestore and decrypt it. This is the normal path.
 *  2. QUICKBOOKS_ACCESS_TOKEN + QUICKBOOKS_REALM_ID from Intuit's OAuth
 *     Playground, for bootstrapping before the first company is connected.
 *
 * Deliberately uses the stored ACCESS token and never the refresh token. Minting
 * a new one here would rotate the refresh token outside the app's lease and
 * could invalidate the copy the portal holds — see the header of
 * src/lib/quickbooks/connections.ts. If the access token has expired (they last
 * an hour), hit "Sync now" in the portal and re-run this.
 */
function decryptToken(stored, keyB64) {
  if (!stored.startsWith("v1.")) return stored;
  const [, iv, tag, ciphertext] = stored.split(".");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function fromStoredConnection() {
  if (!env.FIREBASE_PROJECT_ID || !env.QUICKBOOKS_TOKEN_KEY) return null;
  try {
    const { cert, initializeApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    const wanted = process.argv.find((a) => /^\d{5,}$/.test(a));
    const snap = await getFirestore().collection("quickbooksConnections").get();
    const doc =
      snap.docs.find((d) => (wanted ? d.id === wanted : d.data().status === "connected")) ??
      snap.docs[0];
    if (!doc) return null;
    const d = doc.data();
    if (!d.accessToken) return null;
    return {
      realm: doc.id,
      token: decryptToken(d.accessToken, env.QUICKBOOKS_TOKEN_KEY),
      name: d.displayName ?? d.companyName ?? doc.id,
    };
  } catch (err) {
    console.error(`(couldn't read a stored connection: ${err.message})`);
    return null;
  }
}

const stored = await fromStoredConnection();
const TOKEN = stored?.token ?? env.QUICKBOOKS_ACCESS_TOKEN;
const REALM = stored?.realm ?? env.QUICKBOOKS_REALM_ID;

if (!TOKEN || !REALM) {
  console.error("No stored QuickBooks connection, and no playground token either.\n");
  console.error("Either connect a company in the portal (Creator Finances → Add a client),");
  console.error("or set QUICKBOOKS_ACCESS_TOKEN and QUICKBOOKS_REALM_ID in .env.local from");
  console.error("https://developer.intuit.com/app/developer/playground");
  process.exit(1);
}
if (stored) console.log(`Using the stored connection: ${stored.name} (${stored.realm})\n`);

const SANDBOX = (env.QUICKBOOKS_ENV ?? "sandbox") !== "production";
const API = SANDBOX
  ? "https://sandbox-quickbooks.api.intuit.com"
  : "https://quickbooks.api.intuit.com";

/** Minor versions 1–74 were retired on 2025-08-01; 75 is the floor. */
const MINOR_VERSION = "75";
const WRITE_FIXTURES = process.argv.includes("--write-fixtures");
const FIXTURE_DIR = "src/lib/quickbooks/__fixtures__";

async function get(path, params = {}) {
  const url = new URL(`${API}/v3/company/${REALM}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("minorversion", MINOR_VERSION);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Intuit nests the useful part under Fault.Error[]; res.statusText is useless.
    const fault = body?.Fault?.Error?.[0];
    const detail = fault ? `${fault.Message} — ${fault.Detail}` : res.statusText;
    throw Object.assign(new Error(`${res.status} ${detail}`), { status: res.status, body });
  }
  return body;
}

const rule = (label) => console.log(`\n${"─".repeat(68)}\n${label}\n`);

/** Last 12 whole months through the end of last month, plus the current month. */
function reportRange(today = new Date()) {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start_date: iso(start), end_date: iso(end) };
}

function saveFixture(name, data) {
  if (!WRITE_FIXTURES) return;
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const path = `${FIXTURE_DIR}/${name}.json`;
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`\n  → wrote ${path}`);
}

/* ===================== 1. which company ===================== */
rule("1. WHICH COMPANY THIS TOKEN POINTS AT");

let company;
try {
  company = (await get(`/companyinfo/${REALM}`)).CompanyInfo;
} catch (e) {
  console.error(`Failed: ${e.message}`);
  if (e.status === 401) {
    console.error("→ Access token is expired (they last 1 hour). Re-paste from the Playground.");
  }
  if (e.status === 403) {
    console.error("→ Token is valid but lacks com.intuit.quickbooks.accounting scope.");
  }
  process.exit(1);
}

console.log(`environment:   ${SANDBOX ? "SANDBOX" : "PRODUCTION"}`);
console.log(`realmId:       ${REALM}`);
console.log(`company:       ${company.CompanyName}`);
console.log(`legal name:    ${company.LegalName ?? "—"}`);
console.log(`country:       ${company.Country ?? "—"}`);
console.log(`fiscal start:  ${company.FiscalYearStartMonth ?? "—"}`);
console.log(`currency:      ${company.Currency?.value ?? "—"}`);
console.log(`multi-currency:${company.NameValue?.find?.((n) => n.Name === "MultiCurrencyEnabled")?.Value ?? "—"}`);

/* ===================== 2. chart of accounts ===================== */
rule("2. CHART OF ACCOUNTS — AccountSubType is the aggregation join key");

const accountQuery = "SELECT * FROM Account MAXRESULTS 1000";
const accountRes = await get("/query", { query: accountQuery });
const accounts = accountRes.QueryResponse?.Account ?? [];

console.log(`${accounts.length} accounts (${accountRes.QueryResponse?.maxResults ?? "?"} returned)`);
if (accounts.length === 1000) {
  console.log("→ Hit MAXRESULTS. Real client files can exceed this; paginate with STARTPOSITION.");
}

const pnlAccounts = accounts.filter(
  (a) => a.Classification === "Revenue" || a.Classification === "Expense",
);
console.log(`${pnlAccounts.length} of them are Revenue/Expense (i.e. appear on a P&L)\n`);

const bySubType = new Map();
for (const a of pnlAccounts) {
  const key = `${a.Classification}/${a.AccountSubType ?? "(none)"}`;
  if (!bySubType.has(key)) bySubType.set(key, []);
  bySubType.get(key).push(a);
}

for (const [key, list] of [...bySubType.entries()].sort()) {
  console.log(`  ${key}  (${list.length})`);
  for (const a of list) {
    const flags = [a.Active === false && "INACTIVE", a.SubAccount && "sub"].filter(Boolean);
    console.log(
      `      [${a.Id}] ${a.FullyQualifiedName ?? a.Name}${flags.length ? `  · ${flags.join(" · ")}` : ""}`,
    );
  }
}

console.log(`\n→ The income subtypes above are why revenue streams keep RAW account`);
console.log(`  names: QuickBooks has no subtype that distinguishes AdSense from a`);
console.log(`  brand deal from merch. Expenses normalise fine; income needs the map.`);

saveFixture("accounts", accountRes);

/* ===================== 3. the P&L, summarised by month ===================== */
rule("3. PROFIT & LOSS (summarize_column_by=Months) — the shape parse.ts targets");

const range = reportRange();
console.log(`range:  ${range.start_date} → ${range.end_date}`);

const pnl = await get("/reports/ProfitAndLoss", {
  ...range,
  summarize_column_by: "Month",
  accounting_method: "Accrual",
});

const header = pnl.Header ?? {};
console.log(`basis reported: ${header.ReportBasis ?? "—"}   (we asked for Accrual)`);
console.log(`currency:       ${header.Currency ?? "—"}`);
console.log(`summarised by:  ${header.SummarizeColumnsBy ?? "—"}`);
for (const opt of header.Option ?? []) console.log(`option:         ${opt.Name} = ${opt.Value}`);

/* --- columns: month identity must come from MetaData, never ColTitle --- */
console.log(`\ncolumns (${pnl.Columns?.Column?.length ?? 0}):`);
for (const [i, c] of (pnl.Columns?.Column ?? []).entries()) {
  const meta = (c.MetaData ?? []).map((m) => `${m.Name}=${m.Value}`).join(" ");
  console.log(`  [${i}] type=${c.ColType ?? "—"}  title=${JSON.stringify(c.ColTitle ?? "")}  ${meta}`);
}

const totalIdx = (pnl.Columns?.Column ?? []).findIndex((c) =>
  c.MetaData?.some((m) => m.Name === "ColKey" && m.Value === "total"),
);
console.log(
  totalIdx >= 0
    ? `\n→ Total column present at index ${totalIdx} (ColKey=total).`
    : `\n→ NO ColKey=total column. Parser must sum the months. Check the titles above.`,
);

/* --- the section groups actually emitted --- */
console.log(`\ntop-level rows:`);
for (const r of pnl.Rows?.Row ?? []) {
  const label = r.Header?.ColData?.[0]?.value ?? r.Summary?.ColData?.[0]?.value ?? "(unlabelled)";
  const kids = r.Rows?.Row?.length ?? 0;
  console.log(`  group=${(r.group ?? "—").padEnd(20)} type=${(r.type ?? "—").padEnd(8)} kids=${String(kids).padEnd(4)} ${label}`);
}

const groups = new Set((pnl.Rows?.Row ?? []).map((r) => r.group).filter(Boolean));
const EXPECTED = [
  "Income", "COGS", "GrossProfit", "Expenses", "NetOperatingIncome",
  "OtherIncome", "OtherExpenses", "NetOtherIncome", "NetIncome",
];
console.log(`\ngroups present: ${[...groups].join(", ") || "(none)"}`);
const missing = EXPECTED.filter((g) => !groups.has(g));
if (missing.length) {
  console.log(`groups absent:  ${missing.join(", ")}`);
  console.log(`→ Absent is normal (a service business has no COGS/GrossProfit).`);
  console.log(`  The parser must treat every group as optional.`);
}
const surprise = [...groups].filter((g) => !EXPECTED.includes(g));
if (surprise.length) console.log(`UNEXPECTED groups: ${surprise.join(", ")}  ← add these to the parser`);

/* --- leaf depth + whether ids are present (the account join) --- */
let maxDepth = 0;
let leaves = 0;
let leavesWithId = 0;
const moneyShapes = new Set();

(function walk(rows, depth) {
  for (const r of rows ?? []) {
    maxDepth = Math.max(maxDepth, depth);
    const kids = r.Rows?.Row;
    if (kids?.length) { walk(kids, depth + 1); continue; }
    const cd = r.ColData ?? r.Summary?.ColData;
    if (!cd?.length) continue;
    leaves++;
    if (cd[0]?.id) leavesWithId++;
    for (const c of cd.slice(1)) {
      const v = c.value ?? "";
      if (v === "") moneyShapes.add("(empty string)");
      else if (/^\(.*\)$/.test(v)) moneyShapes.add("(parenthesised negative)");
      else if (v.includes(",")) moneyShapes.add("(thousands separator)");
      else if (v.startsWith("-")) moneyShapes.add("(leading minus)");
      else moneyShapes.add("(plain decimal)");
    }
  }
})(pnl.Rows?.Row, 0);

console.log(`\nrow tree:      max depth ${maxDepth}, ${leaves} leaves`);
console.log(`account join:  ${leavesWithId}/${leaves} leaves carry ColData[0].id`);
if (leavesWithId < leaves) {
  console.log(`→ ${leaves - leavesWithId} leaves have NO account id (uncategorised rows,`);
  console.log(`  collapsed subtotals). resolveCategory() must handle a null id.`);
}
console.log(`money formats seen: ${[...moneyShapes].join(" ") || "(none)"}`);

/* --- does QBO's own summary agree with summing the leaves? --- */
const cents = (v) => {
  const s = (v ?? "").trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[(),\s$]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.abs(n) * 100) * (neg || n < 0 ? -1 : 1);
};

const col = totalIdx >= 0 ? totalIdx : (pnl.Columns?.Column?.length ?? 1) - 1;
console.log(`\nsection summary vs sum-of-leaves (column ${col}):`);
for (const r of pnl.Rows?.Row ?? []) {
  if (!r.group || !r.Summary?.ColData) continue;
  const summary = cents(r.Summary.ColData[col]?.value);
  let sum = 0;
  (function add(rows) {
    for (const x of rows ?? []) {
      const kids = x.Rows?.Row;
      if (kids?.length) { add(kids); continue; }
      const cd = x.ColData ?? x.Summary?.ColData;
      if (cd?.length) sum += cents(cd[col]?.value);
    }
  })(r.Rows?.Row);
  const delta = summary - sum;
  const flag = r.Rows?.Row?.length ? (delta === 0 ? "match" : `DELTA ${delta / 100}`) : "no leaves";
  console.log(`  ${r.group.padEnd(20)} summary=${String(summary / 100).padStart(12)}  leaves=${String(sum / 100).padStart(12)}  ${flag}`);
}
console.log(`→ Any DELTA means QBO surfaces money that isn't in a leaf row. Trust the`);
console.log(`  summary for headline figures — it's what the client sees in QuickBooks.`);

saveFixture("profit-and-loss-months", pnl);

/* ===================== 4. the empty case ===================== */
rule("4. THE EMPTY CASE — a range with no transactions");

const empty = await get("/reports/ProfitAndLoss", {
  start_date: "1990-01-01",
  end_date: "1990-12-31",
  summarize_column_by: "Month",
  accounting_method: "Accrual",
});
const noData = empty.Header?.Option?.find((o) => o.Name === "NoReportData")?.Value;
console.log(`HTTP 200, rows: ${empty.Rows?.Row?.length ?? 0}, NoReportData option: ${noData ?? "(absent)"}`);
console.log(`→ This is a valid empty result, NOT an error. A newly onboarded client`);
console.log(`  hits it every night until their first transaction lands.`);

saveFixture("profit-and-loss-empty", empty);

/* ===================== 5. raw ===================== */
if (!WRITE_FIXTURES) {
  rule("RAW P&L (full shape, for building against)");
  console.log(JSON.stringify(pnl, null, 2));
  console.log(`\n→ Re-run with --write-fixtures to save these to ${FIXTURE_DIR}/ instead.`);
}
