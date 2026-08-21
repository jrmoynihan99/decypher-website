/**
 * Turns Intuit's ProfitAndLoss report into our own ProfitAndLoss shape.
 *
 * Pure: no fetch, no Firestore, no clock. Everything it needs is an argument,
 * which is what lets it be developed and regression-tested against the fixtures
 * in __fixtures__/ (captured by scripts/quickbooks-introspect.mjs) rather than
 * against a live company file.
 *
 * The response shape is documented loosely by Intuit and varies with how each
 * client set their books up, so the rules below were derived from real reports.
 * Four of them carry the correctness of the whole feature:
 *
 *  1. A section contributes EITHER its child rows OR its own Summary, never
 *     both. Counting both double-counts every subtotal — and because the
 *     headline figure still reads correctly, the error hides in the category
 *     breakdown where nobody thinks to check.
 *
 *  2. Section totals come from QuickBooks' Summary row, never from summing the
 *     leaves. They occasionally disagree (QuickBooks surfaces unapplied and
 *     uncategorised amounts that aren't leaf rows). Our headline number has to
 *     match what the client sees in their own QuickBooks, so QuickBooks wins and
 *     we record a warning.
 *
 *  3. Month identity comes from column MetaData.StartDate, never ColTitle.
 *     Titles are locale-formatted display strings.
 *
 *  4. Money is parsed to integer cents at this boundary and stays integral. See
 *     the note in types.ts.
 */

import {
  resolveCategory,
  type CategoryKey,
  type CategoryOverrides,
  type CategorySide,
} from "./categories";
import { monthEndDate, monthStartDate, type MonthKey } from "./periods";
import {
  TOTALS_KEYS,
  zeroMonthly,
  zeroTotals,
  type AccountingBasis,
  type AccountMeta,
  type LineItem,
  type MonthlySeries,
  type MoneyCents,
  type PnlSection,
  type ProfitAndLoss,
  type ProfitAndLossTotals,
} from "./types";

/* ───────── the slices of Intuit's response we actually read ───────── */

interface QboMeta {
  Name?: string;
  Value?: string;
}

interface QboColData {
  value?: string;
  id?: string;
}

interface QboColumn {
  ColTitle?: string;
  ColType?: string;
  MetaData?: QboMeta[];
}

interface QboRow {
  type?: string;
  group?: string;
  Header?: { ColData?: QboColData[] };
  Rows?: { Row?: QboRow[] };
  Summary?: { ColData?: QboColData[] };
  ColData?: QboColData[];
}

interface QboReport {
  Header?: {
    StartPeriod?: string;
    EndPeriod?: string;
    Currency?: string;
    ReportBasis?: string;
    SummarizeColumnsBy?: string;
    Option?: QboMeta[];
  };
  Columns?: { Column?: QboColumn[] };
  Rows?: { Row?: QboRow[] };
}

/** Intuit's section names. Every one is optional in any given report. */
const GROUP = {
  income: "Income",
  cogs: "COGS",
  grossProfit: "GrossProfit",
  expenses: "Expenses",
  netOperatingIncome: "NetOperatingIncome",
  otherIncome: "OtherIncome",
  otherExpenses: "OtherExpenses",
  netIncome: "NetIncome",
} as const;

/**
 * Beyond this many expense lines we roll the tail into one row. Protects the
 * 1 MiB Firestore document limit against a client with a pathological chart of
 * accounts, and nobody reads a 400-row ledger anyway.
 */
const MAX_LINES = 250;

/** Tolerance for "these two figures agree" — one cent, i.e. exactly. */
const EPSILON = 1;

/* ───────────────────────────── money ───────────────────────────── */

/**
 * QuickBooks money is a string, and every one of these turns up in real
 * reports: "" (absent, meaning zero), "0.00", "-1234.56", "(1,234.56)"
 * (accounting-style negative) and thousands separators. Returns integer cents.
 */
export function cents(raw: string | undefined): MoneyCents {
  const s = raw?.trim();
  if (!s) return 0;
  const parenthesised = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[(),\s$]/g, ""));
  if (!Number.isFinite(n)) return 0;
  const magnitude = Math.round(Math.abs(n) * 100);
  return parenthesised || n < 0 ? -magnitude : magnitude;
}

/* ─────────────────────────── columns ─────────────────────────── */

function metaValue(meta: QboMeta[] | undefined, name: string): string | undefined {
  return meta?.find((m) => m.Name === name)?.Value;
}

type ColumnPlan = {
  /** Column index → month key, in report order. */
  monthColumns: { index: number; month: MonthKey }[];
  /** Column index of the grand total, or null when QuickBooks omitted it. */
  totalIndex: number | null;
};

function planColumns(columns: QboColumn[]): ColumnPlan {
  const monthColumns: { index: number; month: MonthKey }[] = [];
  let totalIndex: number | null = null;

  columns.forEach((col, index) => {
    if (metaValue(col.MetaData, "ColKey") === "total") {
      totalIndex = index;
      return;
    }
    // Rule 3: identity from StartDate, not the display title.
    const start = metaValue(col.MetaData, "StartDate");
    if (start) {
      monthColumns.push({ index, month: start.slice(0, 7) });
      return;
    }
    if (totalIndex === null && /^total$/i.test(col.ColTitle ?? "")) totalIndex = index;
  });

  return { monthColumns, totalIndex };
}

/* ──────────────────────────── rows ──────────────────────────── */

type Leaf = {
  accountId: string | null;
  name: string;
  /** Stamped by the caller from the section being walked — see collectLeaves. */
  section: PnlSection;
  monthly: MoneyCents[];
  total: MoneyCents;
};

function readCells(cd: QboColData[], plan: ColumnPlan): { monthly: MoneyCents[]; total: MoneyCents } {
  const monthly = plan.monthColumns.map(({ index }) => cents(cd[index]?.value));
  const total =
    plan.totalIndex !== null
      ? cents(cd[plan.totalIndex]?.value)
      : monthly.reduce((a, b) => a + b, 0);
  return { monthly, total };
}

/**
 * Collect the leaf accounts beneath `rows`.
 *
 * Rule 1 lives here, and it has two halves:
 *
 *   A section contributes its HEADER row plus its children — never its Summary.
 *
 * The Summary half is the obvious one: counting it as well as the children
 * double-counts every subtotal, and because the headline figure still reads
 * correctly the error hides in the category breakdown.
 *
 * The Header half is the one that isn't obvious, and it under-counts rather
 * than over-counts. When a parent account carries its OWN postings — money
 * booked directly to "Landscaping Services" rather than to one of its
 * sub-accounts — QuickBooks puts that amount on the section's Header row, not
 * in a child. So:
 *
 *     Header  "Landscaping Services" #45 = 1477.50   ← the parent's own money
 *       Data    "Fountains and Garden Lighting" = 2246.50
 *       Data    "Plants and Soil"              = 2351.97
 *     Summary "Total Landscaping Services"    = 6513.97
 *
 * Walking children alone loses the 1477.50 silently. A synthetic fixture won't
 * catch it either, because a parent with no direct postings has an empty
 * header — which is exactly how this got missed until real books were parsed.
 * The section-vs-leaves warning is what surfaced it.
 *
 * The depth guard isn't defensive theatre — a malformed response shouldn't be
 * able to hang a cron that's holding a refresh lease.
 */
function collectLeaves(
  rows: QboRow[] | undefined,
  plan: ColumnPlan,
  out: Leaf[],
  section: PnlSection,
  depth = 0,
): void {
  if (!rows || depth > 12) return;
  for (const row of rows) {
    const children = row.Rows?.Row;
    if (children?.length) {
      const header = row.Header?.ColData;
      const name = header?.[0]?.value;
      if (header?.length && name) {
        const cells = readCells(header, plan);
        // Only when it actually carries money. Most parents don't, and emitting
        // a run of $0.00 rows would bury the lines that matter.
        if (cells.total !== 0 || cells.monthly.some((v) => v !== 0)) {
          out.push({ accountId: header[0]?.id ?? null, name, section, ...cells });
        }
      }
      collectLeaves(children, plan, out, section, depth + 1);
      continue;
    }
    const cd = row.ColData ?? row.Summary?.ColData;
    if (!cd?.length) continue;
    const name = row.ColData?.[0]?.value ?? row.Header?.ColData?.[0]?.value ?? "";
    if (!name) continue;
    out.push({
      accountId: cd[0]?.id ?? null,
      name,
      section,
      ...readCells(cd, plan),
    });
  }
}

/* ────────────────────────── line items ────────────────────────── */

function toLineItems(
  leaves: Leaf[],
  accounts: Map<string, AccountMeta>,
  overrides: CategoryOverrides,
  side: CategorySide,
  unknownAccountIds: Set<string>,
  unmappedSubTypes: Set<string>,
): LineItem[] {
  const items = leaves.map((leaf) => {
    const meta = leaf.accountId ? accounts.get(leaf.accountId) : undefined;
    if (leaf.accountId && !meta) unknownAccountIds.add(leaf.accountId);
    const category = resolveCategory(leaf.accountId, meta, overrides, side);
    if (category === "uncategorized" && meta?.subType) unmappedSubTypes.add(meta.subType);
    return {
      accountId: leaf.accountId,
      // Prefer "Parent:Child" so a sub-account isn't ambiguous in the ledger.
      name: meta?.fullyQualifiedName || leaf.name,
      subType: meta?.subType ?? null,
      category,
      section: leaf.section,
      total: leaf.total,
      monthly: leaf.monthly,
    } satisfies LineItem;
  });

  // Descending by magnitude, not by value: a large negative line (a refund
  // account, a contra-revenue) matters as much as a large positive one.
  items.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return items.length > MAX_LINES ? rollUpTail(items) : items;
}

/**
 * Fold everything past MAX_LINES into one row PER SECTION.
 *
 * Per section, not one combined row: the ledger divides each section by its own
 * sum now, so a mixed roll-up would drop cost-of-sales money into the operating
 * denominator and understate every ratio in it — a quieter version of the exact
 * bug the section split exists to fix.
 */
function rollUpTail(items: LineItem[]): LineItem[] {
  const kept = items.slice(0, MAX_LINES - 1);
  const bySection = new Map<PnlSection, LineItem[]>();
  for (const item of items.slice(MAX_LINES - 1)) {
    const group = bySection.get(item.section);
    if (group) group.push(item);
    else bySection.set(item.section, [item]);
  }
  for (const [section, group] of bySection) {
    kept.push({
      accountId: null,
      name: `Other (${group.length} accounts)`,
      subType: null,
      category: "uncategorized",
      section,
      total: group.reduce((sum, it) => sum + it.total, 0),
      monthly: group[0].monthly.map((_, i) =>
        group.reduce((sum, it) => sum + it.monthly[i], 0),
      ),
    });
  }
  return kept;
}

function sumByCategory(items: LineItem[]): Partial<Record<CategoryKey, MoneyCents>> {
  const out: Partial<Record<CategoryKey, MoneyCents>> = {};
  for (const item of items) out[item.category] = (out[item.category] ?? 0) + item.total;
  return out;
}

/* ──────────────────────────── parse ──────────────────────────── */

export type ParseOptions = {
  realmId: string;
  accounts: Map<string, AccountMeta>;
  overrides: CategoryOverrides;
  /** The basis we asked for, used only to detect that QuickBooks ignored us. */
  requestedBasis: AccountingBasis;
};

export type ParseResult = {
  pnl: ProfitAndLoss;
  /**
   * Account ids on the report that weren't in the cached chart of accounts —
   * i.e. accounts created since the last account fetch. sync.ts refetches and
   * reparses when this is non-empty, so a brand-new account isn't stuck
   * uncategorised until tomorrow.
   */
  unknownAccountIds: string[];
  /** Subtypes that fell through to `uncategorized` — the mapping screen's queue. */
  unmappedSubTypes: string[];
};

export function parseProfitAndLoss(raw: unknown, opts: ParseOptions): ParseResult {
  const report = (raw ?? {}) as QboReport;
  const header = report.Header ?? {};
  const warnings: string[] = [];
  const unknownAccountIds = new Set<string>();
  const unmappedSubTypes = new Set<string>();

  const plan = planColumns(report.Columns?.Column ?? []);
  const months = plan.monthColumns.map((c) => c.month);
  if (plan.totalIndex === null && months.length) {
    warnings.push("No total column in the report — totals were summed from months.");
  }

  const basis: AccountingBasis = header.ReportBasis === "Cash" ? "cash" : "accrual";
  if (basis !== opts.requestedBasis) {
    warnings.push(
      `Requested ${opts.requestedBasis} basis but QuickBooks reported ${basis}.`,
    );
  }

  const topRows = report.Rows?.Row ?? [];
  const noReportData = metaValue(header.Option, "NoReportData") === "true";
  const empty = noReportData || topRows.length === 0;

  const sections = new Map<string, QboRow>();
  for (const row of topRows) if (row.group) sections.set(row.group, row);

  /** A section's own Summary — rule 2. Absent sections read as zero. */
  const sectionTotals = (group: string): { monthly: MoneyCents[]; total: MoneyCents } => {
    const cd = sections.get(group)?.Summary?.ColData;
    if (!cd?.length) return { monthly: months.map(() => 0), total: 0 };
    return readCells(cd, plan);
  };

  const income = sectionTotals(GROUP.income);
  const cogs = sectionTotals(GROUP.cogs);
  const expenses = sectionTotals(GROUP.expenses);
  const otherIncome = sectionTotals(GROUP.otherIncome);
  const otherExpenses = sectionTotals(GROUP.otherExpenses);

  // Derived sections: present in most reports, absent in some. Take Intuit's
  // figure when it's there, derive it when it isn't, and say so when the two
  // disagree — a mismatch means our model of the report has drifted.
  const derive = (
    group: string,
    computed: { monthly: MoneyCents[]; total: MoneyCents },
    label: string,
  ) => {
    const reported = sections.get(group)?.Summary?.ColData;
    if (!reported?.length) return computed;
    const actual = readCells(reported, plan);
    if (Math.abs(actual.total - computed.total) > EPSILON) {
      warnings.push(
        `${label} reported as ${actual.total / 100} but derives to ${computed.total / 100}.`,
      );
    }
    return actual;
  };

  const combine = (
    a: { monthly: MoneyCents[]; total: MoneyCents },
    b: { monthly: MoneyCents[]; total: MoneyCents },
    sign: 1 | -1,
  ) => ({
    monthly: a.monthly.map((v, i) => v + sign * (b.monthly[i] ?? 0)),
    total: a.total + sign * b.total,
  });

  const grossProfit = derive(GROUP.grossProfit, combine(income, cogs, -1), "Gross profit");
  const netOperatingIncome = derive(
    GROUP.netOperatingIncome,
    combine(grossProfit, expenses, -1),
    "Net operating income",
  );
  const netIncome = derive(
    GROUP.netIncome,
    combine(combine(netOperatingIncome, otherIncome, 1), otherExpenses, -1),
    "Net income",
  );

  // Leaves. COGS stays in the one expense array — pulling it out here would
  // leave the expense breakdown failing to reconcile against net income — but
  // every leaf carries the section it came from, because a cost of sale and an
  // operating expense are not the same kind of number and the ratios the firm
  // reads off this report are only true when the two are told apart.
  const incomeLeaves: Leaf[] = [];
  collectLeaves(sections.get(GROUP.income)?.Rows?.Row, plan, incomeLeaves, "income");
  collectLeaves(sections.get(GROUP.otherIncome)?.Rows?.Row, plan, incomeLeaves, "other-income");

  const expenseLeaves: Leaf[] = [];
  collectLeaves(sections.get(GROUP.cogs)?.Rows?.Row, plan, expenseLeaves, "cogs");
  collectLeaves(sections.get(GROUP.expenses)?.Rows?.Row, plan, expenseLeaves, "operating");
  collectLeaves(
    sections.get(GROUP.otherExpenses)?.Rows?.Row, plan, expenseLeaves, "other-expense",
  );

  const revenueStreams = toLineItems(
    incomeLeaves, opts.accounts, opts.overrides, "income", unknownAccountIds, unmappedSubTypes,
  );
  const expenseLines = toLineItems(
    expenseLeaves, opts.accounts, opts.overrides, "expense", unknownAccountIds, unmappedSubTypes,
  );

  // Rule 2 again, as a check rather than a correction.
  const leafIncome = revenueStreams.reduce((s, i) => s + i.total, 0);
  const reportedIncome = income.total + otherIncome.total;
  if (Math.abs(leafIncome - reportedIncome) > EPSILON) {
    warnings.push(
      `Income lines sum to ${leafIncome / 100} but QuickBooks reports ${reportedIncome / 100}. ` +
        `Headline figures follow QuickBooks.`,
    );
  }
  const leafExpense = expenseLines.reduce((s, i) => s + i.total, 0);
  const reportedExpense = cogs.total + expenses.total + otherExpenses.total;
  if (Math.abs(leafExpense - reportedExpense) > EPSILON) {
    warnings.push(
      `Expense lines sum to ${leafExpense / 100} but QuickBooks reports ${reportedExpense / 100}. ` +
        `Headline figures follow QuickBooks.`,
    );
  }

  if (unknownAccountIds.size) {
    warnings.push(`${unknownAccountIds.size} account(s) not in the cached chart of accounts.`);
  }

  const totals: ProfitAndLossTotals = {
    income: income.total,
    costOfGoodsSold: cogs.total,
    grossProfit: grossProfit.total,
    expenses: expenses.total,
    netOperatingIncome: netOperatingIncome.total,
    otherIncome: otherIncome.total,
    otherExpenses: otherExpenses.total,
    netIncome: netIncome.total,
  };

  const monthly: MonthlySeries = {
    income: income.monthly,
    costOfGoodsSold: cogs.monthly,
    grossProfit: grossProfit.monthly,
    expenses: expenses.monthly,
    netOperatingIncome: netOperatingIncome.monthly,
    otherIncome: otherIncome.monthly,
    otherExpenses: otherExpenses.monthly,
    netIncome: netIncome.monthly,
  };

  return {
    pnl: {
      realmId: opts.realmId,
      currency: header.Currency || "USD",
      basis,
      startDate: header.StartPeriod ?? "",
      endDate: header.EndPeriod ?? "",
      months,
      monthly,
      revenueStreams,
      expenseLines,
      incomeByCategory: sumByCategory(revenueStreams),
      expensesByCategory: sumByCategory(expenseLines),
      empty,
      warnings,
      ...totals,
    },
    unknownAccountIds: [...unknownAccountIds],
    unmappedSubTypes: [...unmappedSubTypes],
  };
}

/* ────────────────────────── recategorising ────────────────────────── */

/**
 * Re-resolve one stored line against the overrides as they are NOW.
 *
 * Falls back to the category the line was stored with, because a stored line
 * doesn't carry its account's `classification` — so layer 5 of resolveCategory
 * can't run here, and its `uncategorized` return has to be read as "the layers
 * that CAN run had no opinion" rather than as an answer. The stored value is
 * that opinion, made at sync time when the classification was in hand.
 *
 * The one thing this can't undo is a cleared override on an account whose
 * subtype isn't in the built-in map: nothing above the fallback matches, so the
 * old pinned category persists until the next sync. Narrow, and it fails in the
 * direction of the last decision the firm actually made.
 */
function recategorizeLine(
  item: LineItem,
  overrides: CategoryOverrides,
  side: CategorySide,
): CategoryKey {
  const next = resolveCategory(
    item.accountId,
    // `name` is already the fully-qualified name wherever one existed — see
    // toLineItems — which is what the personal-name heuristic wants to read.
    { subType: item.subType, name: item.name, fullyQualifiedName: item.name },
    overrides,
    side,
  );
  return next === "uncategorized" ? item.category : next;
}

/**
 * Apply the current category map to an already-parsed report.
 *
 * Categories are resolved at sync time and stored resolved, which made a
 * mapping change invisible until that client's next sync — the firm would pin
 * an account to "Personal (non-operating)", watch the ledger not move, and have
 * no way to tell a saved decision from a lost one. Sections, totals and every
 * monthly series come from QuickBooks and don't move; only the category does,
 * and it's cheap to re-derive. So the read path derives it, and the stored value
 * is a starting point rather than the answer.
 *
 * Returns the input unchanged, by identity, when nothing moved — which is the
 * normal case, since most reads happen with the same overrides the sync used.
 */
export function recategorize(pnl: ProfitAndLoss, overrides: CategoryOverrides): ProfitAndLoss {
  const apply = (items: LineItem[], side: CategorySide) => {
    let moved = false;
    const next = items.map((item) => {
      const category = recategorizeLine(item, overrides, side);
      if (category === item.category) return item;
      moved = true;
      return { ...item, category };
    });
    return moved ? next : items;
  };

  const revenueStreams = apply(pnl.revenueStreams, "income");
  const expenseLines = apply(pnl.expenseLines, "expense");
  if (revenueStreams === pnl.revenueStreams && expenseLines === pnl.expenseLines) return pnl;

  return {
    ...pnl,
    revenueStreams,
    expenseLines,
    incomeByCategory: sumByCategory(revenueStreams),
    expensesByCategory: sumByCategory(expenseLines),
  };
}

/* ──────────────────────────── slicing ──────────────────────────── */

/**
 * Re-slice a parsed report to a shorter month range. Exact, not approximate: a
 * P&L is entirely flows, so summing a subset of month columns gives precisely
 * what QuickBooks would return for that range. This is what lets one fetch back
 * every entry in the period selector — see periods.ts.
 */
export function slicePnl(pnl: ProfitAndLoss, from: number, to: number): ProfitAndLoss {
  if (from <= 0 && to >= pnl.months.length) return pnl;

  const months = pnl.months.slice(from, to);
  if (!months.length) {
    return {
      ...pnl,
      months: [],
      monthly: zeroMonthly(0),
      revenueStreams: [],
      expenseLines: [],
      incomeByCategory: {},
      expensesByCategory: {},
      empty: true,
      ...zeroTotals(),
    };
  }

  const sum = (xs: MoneyCents[]) => xs.reduce((a, b) => a + b, 0);
  const monthly = Object.fromEntries(
    TOTALS_KEYS.map((k) => [k, pnl.monthly[k].slice(from, to)]),
  ) as MonthlySeries;
  const totals = Object.fromEntries(
    TOTALS_KEYS.map((k) => [k, sum(monthly[k])]),
  ) as ProfitAndLossTotals;

  const sliceItems = (items: LineItem[]) =>
    items
      .map((item) => {
        const sliced = item.monthly.slice(from, to);
        return { ...item, monthly: sliced, total: sum(sliced) };
      })
      // Drop lines with no activity in the window — an account that was dormant
      // all quarter is noise in a quarterly ledger, not information.
      .filter((item) => item.total !== 0)
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const revenueStreams = sliceItems(pnl.revenueStreams);
  const expenseLines = sliceItems(pnl.expenseLines);

  return {
    ...pnl,
    startDate: monthStartDate(months[0]),
    endDate: monthEndDate(months[months.length - 1]),
    months,
    monthly,
    revenueStreams,
    expenseLines,
    incomeByCategory: sumByCategory(revenueStreams),
    expensesByCategory: sumByCategory(expenseLines),
    empty: TOTALS_KEYS.every((k) => totals[k] === 0),
    ...totals,
  };
}
