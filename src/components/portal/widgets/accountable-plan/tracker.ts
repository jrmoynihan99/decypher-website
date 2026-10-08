/**
 * The reimbursement tracker: a workbook the client fills in each period to
 * calculate their own reimbursement under the plan's elections.
 *
 * A Summary sheet whose rows are live references into one sheet per
 * category — the home office (actual expense) and each vehicle, by the method
 * the plan elected. Actual-expense sheets total each period's costs and apply
 * the business-use %; mileage sheets multiply miles by the rate. Eight rows
 * for quarterly meetings, fifteen for monthly (a year plus slack).
 *
 * Ported from the standalone builder's SheetJS version, sheet for sheet and
 * formula for formula, onto lib/xlsx-lite. Three fixes ride along, each a
 * file Excel would otherwise refuse or break: sheet names are deduped
 * case-insensitively (Excel's rule), "Summary" and "History" are reserved up
 * front, and apostrophes are escaped in the Summary's cross-sheet references.
 * Formula cells carry a cached 0 — true, since every input starts blank —
 * so phone previews that don't calculate still show numbers.
 */

import { buildXlsx, cellRef, sheetRef, type Cell, type Range, type Sheet } from "@/lib/xlsx-lite";
import {
  RATES,
  computeAll,
  fmtDateLong,
  money,
  num,
  type HomeOffice,
  type HomeOfficeCalc,
  type PlanState,
  type Vehicle,
  type VehicleCalc,
} from "@/lib/tax-strategy/accountable-plan";

/** Rows of the header block before the data: title, note, spacer, column heads. */
const DATA_START = 4;

function rowCount(state: PlanState): number {
  return state.reimbursementFrequency === "quarterly" ? 8 : 15;
}

/**
 * The original's sanitizer — strip what Excel forbids, cap at 28 so a " 2"
 * suffix still fits in 31 — plus the edge apostrophes Excel also refuses.
 * `used` holds lower-cased names, since Excel treats "Truck" and "truck" as
 * the same sheet.
 */
function sheetNameFor(base: string, used: Set<string>): string {
  let name = (base || "Sheet").toString().replace(/[:\\/?*[\]]/g, "").trim();
  name = name.replace(/^'+|'+$/g, "").trim();
  if (!name) name = "Sheet";
  if (name.length > 28) name = name.slice(0, 28);
  let finalName = name;
  let i = 2;
  while (used.has(finalName.toLowerCase())) {
    const suffix = " " + i;
    finalName = name.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  used.add(finalName.toLowerCase());
  return finalName;
}

/** Points tall enough for the note to wrap inside its merged width. */
function noteHeight(note: string, widths: number[]): number {
  const chars = widths.reduce((s, w) => s + w, 0) * 1.1;
  return 15 * Math.max(1, Math.ceil(note.length / chars)) + 3;
}

const fullWidth = (row: number, cols: number): Range => ({
  s: { r: row, c: 0 },
  e: { r: row, c: cols - 1 },
});

type Built = { sheet: Omit<Sheet, "name">; totalsReimbRow: number; reimbCol: number };

/**
 * An actual-expense sheet: Period | cost columns… | Total costs |
 * Business-use % | Reimbursement, with SUM and percentage formulas per row
 * and a Totals row. Shared by the home office and actual-method vehicles.
 */
function actualExpenseSheet(
  title: string,
  note: string,
  costCols: string[],
  pct: number,
  n: number,
): Built {
  const header = ["Period", ...costCols, "Total costs", "Business-use %", "Reimbursement"];
  const totalCol = header.length - 3;
  const pctCol = header.length - 2;
  const reimbCol = header.length - 1;
  const firstCost = 1;
  const lastCost = costCols.length;
  const dataEnd = DATA_START + n - 1;
  const totalsRow = dataEnd + 1;

  const rows: Cell[][] = [
    [{ v: title, s: "bold" }],
    [{ v: note, s: "wrap" }],
    [],
    header.map((h) => ({ v: h, s: "bold" as const })),
  ];
  for (let r = DATA_START; r <= dataEnd; r++) {
    rows.push([
      "",
      ...costCols.map(() => ({ s: "money" as const })),
      { f: `SUM(${cellRef(r, firstCost)}:${cellRef(r, lastCost)})`, v: 0, s: "money" },
      pct,
      { f: `${cellRef(r, totalCol)}*(${cellRef(r, pctCol)}/100)`, v: 0, s: "money" },
    ]);
  }
  rows.push([
    { v: "Totals", s: "bold" },
    ...costCols.map(() => ""),
    { f: `SUM(${cellRef(DATA_START, totalCol)}:${cellRef(dataEnd, totalCol)})`, v: 0, s: "moneyBold" },
    "",
    { f: `SUM(${cellRef(DATA_START, reimbCol)}:${cellRef(dataEnd, reimbCol)})`, v: 0, s: "moneyBold" },
  ]);

  const cols = header.map((_, idx) => (idx === 0 ? 16 : 18));
  return {
    sheet: {
      rows,
      cols,
      merges: [fullWidth(0, header.length), fullWidth(1, header.length)],
      heights: { 1: noteHeight(note, cols) },
    },
    totalsReimbRow: totalsRow,
    reimbCol,
  };
}

function homeOfficeActualSheet(ho: HomeOffice, hc: HomeOfficeCalc, n: number): Built {
  const own = ho.ownOrRent === "own";
  const costCols = own
    ? ["Mortgage interest", "Property tax", "Home insurance", "Utilities", "Maintenance & repairs"]
    : ["Rent", "Renters insurance", "Utilities", "Maintenance & repairs"];
  const pct = hc.pct !== null ? hc.pct : 0;
  return actualExpenseSheet(
    "Home Office — Actual Expense Method",
    "Business-use %: " + pct + "% (office " + (ho.officeSqFt || "?") + " sq ft of " + (ho.homeSqFt || "?") + " sq ft home), from the Accountable Plan. Enter each period's actual costs below — Reimbursement calculates automatically.",
    costCols,
    pct,
    n,
  );
}

function vehicleActualSheet(v: Vehicle, calc: VehicleCalc, n: number): Built {
  const leased = v.ownership === "leased" && !v.capitalLease;
  const costCols = ["Fuel/gas", "Insurance", "Maintenance & repairs"].concat(leased ? ["Lease payment"] : []);
  const pct = Math.max(0, Math.min(100, num(v.businessUsePct)));
  const depNote =
    calc.depreciationDeduction > 0
      ? " First-year depreciation of " + money(calc.depreciationDeduction) + " was calculated in the plan for the year this vehicle was placed in service — apply it that year only, separately from this table."
      : "";
  return actualExpenseSheet(
    "Vehicle — " + (v.label || "Vehicle") + " — Actual Expense Method",
    "Business-use %: " + pct + "%, from the Accountable Plan. Enter each period's actual costs below — Reimbursement calculates automatically." + depNote,
    costCols,
    pct,
    n,
  );
}

/** Period | Business miles | Mileage rate ($/mi) | Reimbursement = miles × rate. */
function vehicleMileageSheet(v: Vehicle, n: number): Built {
  const header = ["Period", "Business miles", "Mileage rate ($/mi)", "Reimbursement"];
  const note = "Use the IRS standard business mileage rate as in effect when each expense is incurred — update the rate below if it changes mid-year.";
  const dataEnd = DATA_START + n - 1;
  const totalsRow = dataEnd + 1;

  const rows: Cell[][] = [
    [{ v: "Vehicle — " + (v.label || "Vehicle") + " — Standard Mileage Method", s: "bold" }],
    [{ v: note, s: "wrap" }],
    [],
    header.map((h) => ({ v: h, s: "bold" as const })),
  ];
  for (let r = DATA_START; r <= dataEnd; r++) {
    rows.push([
      "",
      { v: 0, s: "int" },
      { v: RATES.mileageRate, s: "rate" },
      { f: `${cellRef(r, 1)}*${cellRef(r, 2)}`, v: 0, s: "money" },
    ]);
  }
  rows.push([
    { v: "Totals", s: "bold" },
    { f: `SUM(${cellRef(DATA_START, 1)}:${cellRef(dataEnd, 1)})`, v: 0, s: "int" },
    "",
    { f: `SUM(${cellRef(DATA_START, 3)}:${cellRef(dataEnd, 3)})`, v: 0, s: "moneyBold" },
  ]);

  const cols = [14, 16, 18, 16];
  return {
    sheet: {
      rows,
      cols,
      merges: [fullWidth(0, header.length), fullWidth(1, header.length)],
      heights: { 1: noteHeight(note, cols) },
    },
    totalsReimbRow: totalsRow,
    reimbCol: 3,
  };
}

/** The whole workbook as .xlsx bytes. Callers check that something is included first. */
export function buildTrackerXlsx(state: PlanState): Uint8Array<ArrayBuffer> {
  const all = computeAll(state);
  const n = rowCount(state);
  // Reserved before any category claims them: the Summary sheet, and the
  // name Excel keeps for itself.
  const used = new Set<string>(["summary", "history"]);
  const refs: { label: string; sheet: Sheet; row: number; col: number }[] = [];

  if (state.homeOffice.included && all.ho.effective === "actual") {
    const b = homeOfficeActualSheet(state.homeOffice, all.ho, n);
    const name = sheetNameFor("Home Office - Actual", used);
    refs.push({ label: "Home Office — Actual", sheet: { name, ...b.sheet }, row: b.totalsReimbRow, col: b.reimbCol });
  }

  if (state.vehicles.included) {
    all.vehicles.forEach((x, idx) => {
      const label = x.v.label || "Vehicle " + (idx + 1);
      const b = x.calc.effective === "mileage" ? vehicleMileageSheet(x.v, n) : vehicleActualSheet(x.v, x.calc, n);
      const name = sheetNameFor(label, used);
      refs.push({ label, sheet: { name, ...b.sheet }, row: b.totalsReimbRow, col: b.reimbCol });
    });
  }

  const summaryRows: Cell[][] = [
    [{ v: state.businessName.trim() || "[Business Name]", s: "bold" }],
    ["Reimbursement Tracker — Summary"],
    ["Effective " + (state.effectiveDate ? fmtDateLong(state.effectiveDate) : "[effective date]")],
    [],
    [
      { v: "Category", s: "bold" },
      { v: "Reimbursement total", s: "bold" },
    ],
  ];
  refs.forEach((ref) => {
    summaryRows.push([ref.label, { f: sheetRef(ref.sheet.name) + cellRef(ref.row, ref.col), v: 0, s: "money" }]);
  });
  const grandRow = 5 + refs.length;
  summaryRows.push([
    { v: "Grand total", s: "bold" },
    refs.length
      ? { f: `SUM(${cellRef(5, 1)}:${cellRef(grandRow - 1, 1)})`, v: 0, s: "moneyBold" }
      : { v: 0, s: "moneyBold" },
  ]);

  const summary: Sheet = {
    name: "Summary",
    rows: summaryRows,
    cols: [28, 20],
    merges: [fullWidth(0, 2), fullWidth(1, 2), fullWidth(2, 2)],
  };

  return buildXlsx([summary, ...refs.map((r) => r.sheet)]);
}
