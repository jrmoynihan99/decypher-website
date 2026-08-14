/**
 * Regression check for the QuickBooks P&L parser.
 *
 * The repo has no test runner, and adding one for this alone isn't worth the
 * dependency — so this compiles the pure quickbooks modules with the local
 * TypeScript and asserts against the committed fixtures. It is the closest
 * thing the feature has to a unit test, and it's the thing to run after
 * replacing the synthetic fixtures with real captures:
 *
 *   node scripts/quickbooks-introspect.mjs --write-fixtures
 *   node scripts/quickbooks-parse-check.mjs
 *
 * The fixture arithmetic is asserted too, so an edit that quietly breaks a
 * fixture's internal consistency fails here rather than weakening the test.
 *
 *   npm run qb:check
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SRC = "src/lib/quickbooks";
const MODULES = ["types", "categories", "periods", "parse", "aggregate"];

/* ───────────────────── compile ───────────────────── */

const out = mkdtempSync(join(tmpdir(), "qb-check-"));
process.on("exit", () => rmSync(out, { recursive: true, force: true }));

const tsc = spawnSync(
  process.execPath,
  [
    "node_modules/typescript/bin/tsc",
    ...MODULES.map((m) => `${SRC}/${m}.ts`),
    "--outDir", out,
    // CommonJS with classic node resolution, so the extensionless relative
    // imports in source resolve without rewriting them. Node's own type
    // stripping can't do this (it requires explicit .ts extensions).
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--target", "es2022",
    "--skipLibCheck",
  ],
  { encoding: "utf8" },
);

if (tsc.status !== 0) {
  console.error("TypeScript failed to compile:\n");
  console.error(tsc.stdout || tsc.stderr);
  process.exit(1);
}

const { parseProfitAndLoss, slicePnl, cents } = await import(pathToFileURL(join(out, "parse.js")));
const { aggregateRows, averageOf, primaryBucket } = await import(pathToFileURL(join(out, "aggregate.js")));
const { resolvePeriod, sliceIndices, syncWindow } = await import(pathToFileURL(join(out, "periods.js")));
const { NO_OVERRIDES } = await import(pathToFileURL(join(out, "categories.js")));

/* ───────────────────── harness ───────────────────── */

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failures.push(`${label}\n      expected ${e}\n      actual   ${a}`);
  }
}

function ok(label, condition, detail = "") {
  if (condition) passed++;
  else failures.push(`${label}${detail ? `\n      ${detail}` : ""}`);
}

const section = (t) => console.log(`\n${t}`);
const fixture = (name) => JSON.parse(readFileSync(`${SRC}/__fixtures__/${name}.json`, "utf8"));

/* ───────────────────── fixtures ───────────────────── */

const accountIndex = new Map(
  fixture("accounts").QueryResponse.Account.map((a) => [
    a.Id,
    {
      id: a.Id,
      name: a.Name,
      fullyQualifiedName: a.FullyQualifiedName ?? a.Name,
      accountType: a.AccountType ?? null,
      subType: a.AccountSubType ?? null,
      classification: a.Classification ?? null,
      active: a.Active !== false,
    },
  ]),
);

const opts = {
  realmId: "9130350000000000",
  accounts: accountIndex,
  overrides: NO_OVERRIDES,
  requestedBasis: "accrual",
};

const { pnl, unknownAccountIds, unmappedSubTypes } = parseProfitAndLoss(
  fixture("profit-and-loss-months"),
  opts,
);

/* ───────────────────── money parsing ───────────────────── */

section("money");
check("empty string is zero", cents(""), 0);
check("undefined is zero", cents(undefined), 0);
check("plain decimal", cents("1234.56"), 123456);
check("leading minus", cents("-1234.56"), -123456);
check("parenthesised negative", cents("(1,234.56)"), -123456);
check("thousands separators", cents("1,234,567.89"), 123456789);
check("no rounding drift", cents("0.07") * 3, 21);
check("garbage is zero, not NaN", cents("n/a"), 0);

/* ───────────────────── headline totals ───────────────────── */

section("totals — must equal QuickBooks' own section summaries");
check("income", pnl.income, 15391905);
check("costOfGoodsSold", pnl.costOfGoodsSold, 550600);
check("grossProfit", pnl.grossProfit, 14841305);
check("expenses", pnl.expenses, 6752245);
check("netOperatingIncome", pnl.netOperatingIncome, 8089060);
check("otherIncome", pnl.otherIncome, 12885);
check("otherExpenses", pnl.otherExpenses, 63000);
check("netIncome", pnl.netIncome, 8038945);

section("totals — internally consistent");
check("grossProfit = income - cogs", pnl.grossProfit, pnl.income - pnl.costOfGoodsSold);
check(
  "netOperatingIncome = grossProfit - expenses",
  pnl.netOperatingIncome,
  pnl.grossProfit - pnl.expenses,
);
check(
  "netIncome = netOperatingIncome + otherIncome - otherExpenses",
  pnl.netIncome,
  pnl.netOperatingIncome + pnl.otherIncome - pnl.otherExpenses,
);

section("monthly series");
check("months", pnl.months, ["2026-05", "2026-06", "2026-07"]);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
for (const key of Object.keys(pnl.monthly)) {
  check(`monthly.${key} sums to total`, sum(pnl.monthly[key]), pnl[key]);
}

/* ───────────────────── the double-counting rule ───────────────────── */

section("rule 1 — a section contributes children OR its summary, never both");
check("revenue stream count", pnl.revenueStreams.length, 8);
ok(
  "parent subtotal not counted as a line",
  !pnl.revenueStreams.some((r) => r.name.startsWith("Total ")),
  pnl.revenueStreams.map((r) => r.name).join(", "),
);
check(
  "revenue lines sum to income + otherIncome",
  sum(pnl.revenueStreams.map((r) => r.total)),
  pnl.income + pnl.otherIncome,
);
check(
  "expense lines sum to cogs + expenses + otherExpenses",
  sum(pnl.expenseLines.map((r) => r.total)),
  pnl.costOfGoodsSold + pnl.expenses + pnl.otherExpenses,
);
check("no parser warnings on a clean report", pnl.warnings, []);

/* ───────────────────── line item details ───────────────────── */

section("line items");
const byName = (items, name) => items.find((i) => i.name === name);

const refunds = byName(pnl.revenueStreams, "Refunds & Chargebacks");
ok("negative revenue line survives", refunds?.total === -192550, `got ${refunds?.total}`);

const integrations = byName(pnl.revenueStreams, "Brand Partnerships:Integrations");
ok("sub-account uses its fully qualified name", !!integrations);
check("empty-string month reads as zero", integrations?.monthly[1], 0);
check("sub-account total", integrations?.total, 2000000);

const uncategorised = byName(pnl.expenseLines, "Uncategorized Expense");
ok("leaf with no account id is kept, not dropped", !!uncategorised);
check("...and lands in the uncategorised bucket", uncategorised?.category, "uncategorized");
check("...with a null account id", uncategorised?.accountId, null);

check("descending by magnitude", pnl.revenueStreams[0].name, "Brand Partnerships:Sponsorships");

// The bug real books exposed and a synthetic fixture hid: when a parent account
// carries its OWN postings, QuickBooks puts them on the section's Header row.
// Walking only the children loses that money silently, and the headline total
// still looks right - it's the leaves-vs-summary warning that catches it.
const parent = byName(pnl.revenueStreams, "Brand Partnerships");
ok("a parent account's own postings become a line", !!parent, "header row was dropped");
check("...with the parent's own amount, not the subtotal", parent?.total, 450000);
check("...and its monthly series", parent?.monthly, [150000, 200000, 100000]);
ok(
  "...without swallowing the children",
  !!byName(pnl.revenueStreams, "Brand Partnerships:Sponsorships"),
);
// A parent with no direct postings must NOT produce a $0 line.
ok(
  "an empty parent header adds no line",
  !pnl.expenseLines.some((l) => l.total === 0),
);

/* ───────────────────── sections ───────────────────── */

// The report nets cost of sales against revenue and divides operating ratios by
// what's left, so these assertions are what stands between a correct ratio and
// a number that reads plausibly and is wrong by a factor of three.
section("sections — the cost-of-sales split");

const inSection = (items, name) => items.filter((l) => l.section === name);
const cogsLines = inSection(pnl.expenseLines, "cogs");
const operatingLines = inSection(pnl.expenseLines, "operating");

ok(
  "every line carries a section",
  [...pnl.revenueStreams, ...pnl.expenseLines].every((l) => !!l.section),
);
ok(
  "income lines are on the income side",
  pnl.revenueStreams.every((l) => l.section === "income" || l.section === "other-income"),
);
ok("the COGS section produced lines", cogsLines.length > 0);
check("COGS lines sum to the COGS total", sum(cogsLines.map((l) => l.total)), pnl.costOfGoodsSold);
check(
  "operating lines sum to the operating expense total",
  sum(operatingLines.map((l) => l.total)),
  pnl.expenses,
);
check(
  "other-expense lines sum to the other-expense total",
  sum(inSection(pnl.expenseLines, "other-expense").map((l) => l.total)),
  pnl.otherExpenses,
);
// Nothing may fall between the three: the sections still have to add back up to
// every cost, or the ledger stops reconciling against net profit.
check(
  "the three expense sections account for every expense line",
  cogsLines.length +
    operatingLines.length +
    inSection(pnl.expenseLines, "other-expense").length,
  pnl.expenseLines.length,
);
// Section, not category — CostOfLabor resolves to `contractors`, so a category
// filter would leave cost-of-sales money in the operating base.
ok(
  "a COGS line whose category isn't cost-of-sales is still sectioned as COGS",
  cogsLines.some((l) => l.category !== "cost-of-sales"),
  "fixture no longer covers the case category-filtering would get wrong",
);
// The whole point, stated as arithmetic: the denominator actually moved.
ok(
  "the operating base excludes COGS",
  sum(operatingLines.map((l) => l.total)) <
    pnl.costOfGoodsSold + pnl.expenses,
);

/* ───────────────────── categories ───────────────────── */

section("categories");
check(
  "expense categories sum to the expense total",
  sum(Object.values(pnl.expensesByCategory)),
  pnl.costOfGoodsSold + pnl.expenses + pnl.otherExpenses,
);
check(
  "income categories sum to the income total",
  sum(Object.values(pnl.incomeByCategory)),
  pnl.income + pnl.otherIncome,
);
check("software mapped from DuesSubscriptions", pnl.expensesByCategory.software, 284863);
// Three accounts, and one of them (Merch Fulfilment Labor, CostOfLabor) sits in
// the COGS section. That's why the ledger splits on section and not on this:
// filtering by category would leave that $1,100.50 of cost-of-sales money in the
// operating base, understating every ratio computed against it.
check("contractors merges accounts across sections", pnl.expensesByCategory.contractors, 4380050);
check("cost-of-sales from a COGS subtype", pnl.expensesByCategory["cost-of-sales"], 440550);

// The whole reason the override map is v1-mandatory: QuickBooks files AdSense,
// sponsorships, integrations and affiliate income under one subtype.
check(
  "without overrides, distinct revenue streams collapse into one category",
  pnl.incomeByCategory["platform-revenue"],
  3952625 + 450000 + 7550000 + 2000000 + 612575,
);

const { pnl: mapped } = parseProfitAndLoss(fixture("profit-and-loss-months"), {
  ...opts,
  overrides: {
    byAccount: { 2: "brand-deals", 3: "brand-deals", 4: "brand-deals", 6: "affiliate" },
    bySubType: {},
  },
});
check("per-account override splits them apart", mapped.incomeByCategory["brand-deals"], 10000000);
check("...affiliate too", mapped.incomeByCategory.affiliate, 612575);
check("...leaving only AdSense as platform revenue", mapped.incomeByCategory["platform-revenue"], 3952625);
check(
  "overrides don't change the headline total",
  sum(Object.values(mapped.incomeByCategory)),
  sum(Object.values(pnl.incomeByCategory)),
);

section("account index");
check("every id on the report was resolvable", unknownAccountIds, []);
check("no subtype fell through to uncategorised", unmappedSubTypes, []);

const { pnl: stale, unknownAccountIds: unknown } = parseProfitAndLoss(
  fixture("profit-and-loss-months"),
  { ...opts, accounts: new Map() },
);
// Derived rather than hardcoded so this still holds after the synthetic
// fixtures are replaced with real captures. Note it counts LEAF ids: a parent
// account that only appears as a section header contributes no line of its own.
const leafIds = new Set(
  [...pnl.revenueStreams, ...pnl.expenseLines].map((l) => l.accountId).filter(Boolean),
);
check("a stale account cache is reported, not swallowed", unknown.length, leafIds.size);
check("...and the headline total is unaffected", stale.income, pnl.income);
ok("...though the lines fall back to uncategorised", stale.expensesByCategory.uncategorized > 0);

/* ───────────────────── the empty case ───────────────────── */

section("NoReportData");
const { pnl: none } = parseProfitAndLoss(fixture("profit-and-loss-empty"), opts);
check("flagged empty", none.empty, true);
check("income is zero, not NaN", none.income, 0);
check("netIncome is zero", none.netIncome, 0);
check("no lines", none.revenueStreams.length, 0);
ok("did not throw", true);

const { pnl: garbage } = parseProfitAndLoss(null, opts);
check("null input is empty, not a crash", garbage.empty, true);

/* ───────────────────── slicing ───────────────────── */

section("slicing — must be exact, not approximate");
const july = slicePnl(pnl, 2, 3);
check("sliced months", july.months, ["2026-07"]);
check("sliced income = July column", july.income, 6198575);
check("sliced netIncome = July column", july.netIncome, 3428872);
check("sliced dates", [july.startDate, july.endDate], ["2026-07-01", "2026-07-31"]);
check(
  "sliced categories still reconcile",
  sum(Object.values(july.expensesByCategory)),
  july.costOfGoodsSold + july.expenses + july.otherExpenses,
);
const dormant = july.expenseLines.find((l) => l.name === "Equipment");
ok("lines dormant in the window are dropped", !dormant);

const whole = slicePnl(pnl, 0, 3);
check("a full-width slice is identity", whole.netIncome, pnl.netIncome);
const nothing = slicePnl(pnl, 0, 0);
check("an empty slice is empty, not NaN", [nothing.empty, nothing.income], [true, 0]);

/* ───────────────────── periods ───────────────────── */

section("periods");
const today = new Date("2026-07-28T08:00:00Z");
check("ytd", resolvePeriod("ytd", today), {
  key: "ytd", label: "Year to date", startMonth: "2026-01", endMonth: "2026-07",
});
check("last-12-months spans a year boundary", resolvePeriod("last-12-months", today), {
  key: "last-12-months", label: "Last 12 months", startMonth: "2025-08", endMonth: "2026-07",
});
check("last-month", resolvePeriod("last-month", today), {
  key: "last-month", label: "Last month", startMonth: "2026-06", endMonth: "2026-06",
});
check("this-quarter", resolvePeriod("this-quarter", today), {
  key: "this-quarter", label: "This quarter", startMonth: "2026-07", endMonth: "2026-07",
});
check("last-quarter", resolvePeriod("last-quarter", today), {
  key: "last-quarter", label: "Last quarter", startMonth: "2026-04", endMonth: "2026-06",
});
check("last-year", resolvePeriod("last-year", today), {
  key: "last-year", label: "Last full year", startMonth: "2025-01", endMonth: "2025-12",
});

// A July fiscal year start is the case a calendar-year assumption gets wrong.
check("ytd honours a non-January fiscal start", resolvePeriod("ytd", today, 7), {
  key: "ytd", label: "Year to date", startMonth: "2026-07", endMonth: "2026-07",
});
check("last-year with a July fiscal start", resolvePeriod("last-year", today, 7), {
  key: "last-year", label: "Last full year", startMonth: "2025-07", endMonth: "2026-06",
});

// The window reaches back HISTORY_YEARS (5) fiscal years — what makes per-year
// selection, "all time" and the public revenue graph free of extra API calls.
check("sync window reaches back HISTORY_YEARS fiscal years", syncWindow(today), {
  startMonth: "2021-01", endMonth: "2026-07",
  startDate: "2021-01-01", endDate: "2026-07-31",
});
check("month-end handles a leap February", syncWindow(new Date("2028-02-10T00:00:00Z")).endDate, "2028-02-29");

check(
  "sliceIndices finds the July column",
  sliceIndices(pnl.months, { startMonth: "2026-07", endMonth: "2026-07" }),
  { from: 2, to: 3 },
);
check(
  "a period outside the data clamps to empty",
  sliceIndices(pnl.months, { startMonth: "2024-01", endMonth: "2024-12" }),
  { from: 0, to: 0 },
);

/* ───────────────────── aggregate ───────────────────── */

section("aggregate");
const row = (realmId, dataStatus, data, currency = "USD") => ({
  realmId, creatorId: realmId, displayName: `Creator ${realmId}`, companyName: "", currency,
  connection: "connected", connectionMessage: "", connectionCheckedAt: null,
  dataStatus, dataMessage: "", data, lastSyncedAt: null, stale: false,
});

const zero = { ...pnl, ...Object.fromEntries(Object.keys(pnl.monthly).map((k) => [k, 0])), empty: true, incomeByCategory: {}, expensesByCategory: {} };

const agg = aggregateRows([
  row("a", "ok", pnl),
  row("b", "ok", pnl),
  row("c", "empty", zero),
  row("d", "error", null),
  row("e", "never", null),
]);

const usd = primaryBucket(agg);
check("totals only the readable books", usd.income, pnl.income * 2);
check("a genuine zero counts toward the denominator", usd.count, 3);
check("broken connections are excluded", agg.excluded.map((e) => e.realmId), ["d", "e"]);
check("average divides by the stated denominator", averageOf(usd).income, Math.round((pnl.income * 2) / 3));
check("not flagged mixed on one currency", agg.mixedCurrency, false);
check("aggregate categories sum too", sum(Object.values(usd.expensesByCategory)), (pnl.costOfGoodsSold + pnl.expenses + pnl.otherExpenses) * 2);

const mixed = aggregateRows([
  row("a", "ok", pnl),
  row("b", "ok", pnl),
  row("c", "ok", { ...pnl, currency: "CAD" }, "CAD"),
]);
check("currencies are kept apart", Object.keys(mixed.byCurrency).sort(), ["CAD", "USD"]);
check("mixed currency is flagged", mixed.mixedCurrency, true);
check("primary currency is the modal one", mixed.primaryCurrency, "USD");
check("CAD is not added to USD", mixed.byCurrency.USD.income, pnl.income * 2);

check("an empty roster doesn't divide by zero", averageOf(primaryBucket(aggregateRows([]))).income, 0);

/* ───────────────────── report ───────────────────── */

console.log(`\n${"─".repeat(64)}`);
if (failures.length) {
  console.log(`\n${failures.length} FAILED, ${passed} passed\n`);
  for (const f of failures) console.log(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`\n  ✓ all ${passed} checks passed\n`);
