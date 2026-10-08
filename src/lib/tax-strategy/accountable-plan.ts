import { escapeHtml } from "@/lib/print-html";

/**
 * The Accountable Plan Builder's engine: what an S-corp can reimburse its
 * shareholder-employee for a home office and business vehicles, which method
 * gets the strongest defensible deduction, and the written policy that adopts
 * those elections.
 *
 * Ported from the standalone builder page, and deliberately kept to its letter:
 * the arithmetic, the validation, the recommendation rules and every word of
 * the policy document are the firm's reviewed wording, so nothing here is
 * "tidied". The differences are structural — pure functions over a state
 * value instead of a module-level `state`, and every user-supplied string in
 * the policy HTML escaped (the page renders it as HTML, and the original
 * missed several, e.g. the business name and vehicle labels).
 *
 * Isomorphic and pure: the builder runs it live, and the API re-runs it on
 * save so a record's summary figures come from the server, not from whatever
 * the browser sent.
 *
 * Form values are kept as strings, as the original stored them — a
 * half-typed "1,2" or an emptied field has to survive the round trip, and
 * old backups hold strings.
 */

/* ───────────────────────── 2026 tax constants ───────────────────────── */

/** Update annually. */
export const RATES = {
  /** IRS standard business mileage rate, 2026. */
  mileageRate: 0.725,
  /** §280F cap, passenger vehicle, year 1, w/ bonus depreciation (Rev. Proc. 2026-15). */
  luxuryCapYear1: 20300,
  /** §179 cap for heavy SUVs (6,001–14,000 lbs GVWR), 2026. */
  suv179Cap: 32000,
  /** 100% bonus depreciation under §168(k), OBBBA (property placed in service after 1/19/2025). */
  bonusDepreciationPct: 1.0,
  /** §179/bonus depreciation require majority (>50%) business use. */
  depreciationMinBusinessUsePct: 50,
} as const;

/* ─────────────────────────────── types ─────────────────────────────── */

export type Frequency = "monthly" | "quarterly";
export type OwnOrRent = "own" | "rent";
export type Ownership = "owned" | "leased";
export type WeightClass = "standard" | "heavySuv" | "heavyTruck" | "unsure";
export type VehicleMethod = "actual" | "mileage";
export type HomeOfficeMethod = "actual" | "none";

export type Vehicle = {
  id: string;
  _seq: number;
  label: string;
  /** Monthly business miles — the name predates the per-month question and old backups carry it. */
  annualMiles: string;
  ownership: Ownership | null;
  /** Per month. */
  fuelCost: string;
  /** Per month. */
  insuranceCost: string;
  /** Per year. */
  maintenanceCost: string;
  /** Per month. */
  leasePayment: string;
  /** "0"–"100" in steps of 5. */
  businessUsePct: string;
  isFinanced: boolean;
  purchasedThisYear: boolean;
  purchasePrice: string;
  capitalLease: boolean;
  leaseStartedThisYear: boolean;
  /** Capitalized cost of a capital lease. */
  leaseCost: string;
  weightClass: WeightClass;
  /** Staff override of the recommended method; null follows the recommendation. */
  methodOverride: VehicleMethod | null;
};

export type HomeOffice = {
  included: boolean;
  hasDedicated: boolean | null;
  officeSqFt: string;
  homeSqFt: string;
  ownOrRent: OwnOrRent | null;
  /** Per month. */
  mortgageInterest: string;
  /** Per year. */
  propertyTax: string;
  /** Per month. */
  rentPaid: string;
  /** Per month. */
  homeInsurance: string;
  /** Per month. */
  utilities: string;
  /** Per month. */
  maintenance: string;
  /** Per year. */
  repairs: string;
  /** One-time catch-up reimbursement elected (true/false), or unanswered. */
  catchUp: boolean | null;
  /** The catch-up's "through" date, YYYY-MM-DD. */
  catchUpDate: string;
};

export type VehiclesSection = {
  included: boolean;
  list: Vehicle[];
  catchUp: boolean | null;
  catchUpDate: string;
};

export type PlanState = {
  businessName: string;
  entityState: string;
  ownerName: string;
  ein: string;
  /** YYYY-MM-DD. */
  effectiveDate: string;
  preparedBy: string;
  reimbursementFrequency: Frequency;
  homeOffice: HomeOffice;
  vehicles: VehiclesSection;
  signerName: string;
  signerTitle: string;
  /** YYYY-MM-DD. */
  signDate: string;
  /** The saved record this draft belongs to, if any. */
  _clientId?: string | null;
};

export type StepId = "business" | "homeoffice" | "vehicle" | "substantiation" | "review";

export const STEPS: { id: StepId; label: string }[] = [
  { id: "business", label: "Business" },
  { id: "homeoffice", label: "Home Office" },
  { id: "vehicle", label: "Vehicle" },
  { id: "substantiation", label: "Timing" },
  { id: "review", label: "Review & Sign" },
];

/* ───────────────────────────── defaults ───────────────────────────── */

const pad2 = (n: number) => (n < 10 ? "0" : "") + n;
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Today, local time, as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  return isoOf(now);
}

/** Last day of the current month (local time), as YYYY-MM-DD. */
export function endOfMonthIso(now = new Date()): string {
  return isoOf(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

export function defaultPlanState(now = new Date()): PlanState {
  const today = todayIso(now);
  const eom = endOfMonthIso(now);
  return {
    businessName: "",
    entityState: "",
    ownerName: "",
    ein: "",
    effectiveDate: today,
    preparedBy: "",
    reimbursementFrequency: "monthly",
    homeOffice: {
      included: false,
      hasDedicated: null,
      officeSqFt: "",
      homeSqFt: "",
      ownOrRent: null,
      mortgageInterest: "",
      propertyTax: "",
      rentPaid: "",
      homeInsurance: "",
      utilities: "",
      maintenance: "",
      repairs: "",
      catchUp: null,
      catchUpDate: eom,
    },
    vehicles: { included: false, list: [], catchUp: null, catchUpDate: eom },
    signerName: "",
    signerTitle: "",
    signDate: today,
  };
}

export function newVehicle(seq: number): Vehicle {
  return {
    id: "veh_" + seq,
    _seq: seq,
    label: "",
    annualMiles: "",
    ownership: null,
    fuelCost: "",
    insuranceCost: "",
    maintenanceCost: "",
    leasePayment: "",
    businessUsePct: "80",
    isFinanced: false,
    purchasedThisYear: false,
    purchasePrice: "",
    capitalLease: false,
    leaseStartedThisYear: false,
    leaseCost: "",
    weightClass: "standard",
    methodOverride: null,
  };
}

/** Next vehicle sequence number: one past the highest in the list. */
export function nextVehicleSeq(list: Vehicle[]): number {
  return list.reduce((m, v) => Math.max(m, v._seq || 0), 0) + 1;
}

/* ───────────────────────────── formatting ───────────────────────────── */

/** "2026-03-15" → "March 15, 2026". Anything else comes back unchanged. */
export function fmtDateLong(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "$1,234" — rounded, and NaN/undefined read as $0 (the original's rule). */
export function money(n: number): string {
  return "$" + Math.round(n || 0).toLocaleString("en-US");
}

export function num(v: unknown): number {
  const n = parseFloat(String(v ?? ""));
  return isFinite(n) ? n : 0;
}

export function methodLabel(m: VehicleMethod | HomeOfficeMethod): string {
  if (m === "actual") return "Actual expense";
  if (m === "mileage") return "Standard mileage";
  return "—";
}

/* ───────────────────────── date entry (MM/DD/YYYY) ───────────────────────── */

export function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? m[2] + "/" + m[3] + "/" + m[1] : "";
}

export function digitsToDisplay(digits: string): string {
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4, 8);
}

/** Eight typed digits → YYYY-MM-DD, or null unless they make a real calendar date. */
export function digitsToIso(digits: string): string | null {
  if (!/^\d{8}$/.test(digits)) return null;
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  const mmN = parseInt(mm, 10);
  const ddN = parseInt(dd, 10);
  const yyyyN = parseInt(yyyy, 10);
  if (mmN < 1 || mmN > 12 || ddN < 1 || ddN > 31 || yyyyN < 1900 || yyyyN > 2999) return null;
  const d = new Date(Date.UTC(yyyyN, mmN - 1, ddN));
  if (d.getUTCFullYear() !== yyyyN || d.getUTCMonth() !== mmN - 1 || d.getUTCDate() !== ddN) {
    return null;
  }
  return yyyy + "-" + mm + "-" + dd;
}

/** Typed EIN → "XX-XXXXXXX" as the digits arrive. */
export function formatEin(typed: string): string {
  const digits = typed.replace(/\D/g, "").slice(0, 9);
  return digits.length > 2 ? digits.slice(0, 2) + "-" + digits.slice(2) : digits;
}

/* ───────────────────────── recommendation engine ───────────────────────── */

export function pctUse(office: string, home: string): number | null {
  const o = num(office);
  const h = num(home);
  if (!o || !h || h <= 0) return null;
  return Math.round((o / h) * 1000) / 10;
}

type CatchUpSection = { catchUp: boolean | null; catchUpDate: string };

/**
 * Share of the year still to be reimbursed. If a catch-up reimbursement is NOT
 * elected, the period through the catch-up date is excluded from the estimate
 * (days remaining after that date / days in that year).
 */
export function catchUpFactor(sec: CatchUpSection | null | undefined): number {
  if (!sec || sec.catchUp !== false || !sec.catchUpDate) return 1;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sec.catchUpDate);
  if (!m) return 1;
  const y = +m[1];
  const through = Date.UTC(y, +m[2] - 1, +m[3]);
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  const daysInYear = (end - start) / 86400000;
  const elapsed = (through - start) / 86400000 + 1;
  return Math.max(0, Math.min(1, (daysInYear - elapsed) / daysInYear));
}

export function catchUpNoteForEstimate(sec: CatchUpSection | null | undefined): string {
  if (!sec || sec.catchUp !== false || !sec.catchUpDate) return "";
  return (
    "No catch-up is elected, so this estimate covers expenses after " +
    fmtDateLong(sec.catchUpDate) +
    " only."
  );
}

/**
 * Most inputs are collected per month and annualized here; property taxes
 * and repairs are collected as annual amounts and added as-is.
 */
export function homeOfficeAnnualCosts(ho: HomeOffice): number {
  let monthly = 0;
  let annual = 0;
  if (ho.ownOrRent === "own") {
    monthly = num(ho.mortgageInterest) + num(ho.homeInsurance) + num(ho.utilities) + num(ho.maintenance);
    annual = num(ho.propertyTax) + num(ho.repairs);
  } else if (ho.ownOrRent === "rent") {
    monthly = num(ho.rentPaid) + num(ho.homeInsurance) + num(ho.utilities) + num(ho.maintenance);
    annual = num(ho.repairs);
  } else return 0;
  return (monthly * 12 + annual) * catchUpFactor(ho);
}

export function homeOfficeDocItems(ho: HomeOffice): string[] {
  const items: string[] = [];
  if (ho.ownOrRent === "own") {
    if (num(ho.mortgageInterest) > 0) items.push("Most recent monthly mortgage loan statement (showing interest paid)");
    if (num(ho.propertyTax) > 0) items.push("Property tax bill");
  } else if (ho.ownOrRent === "rent") {
    if (num(ho.rentPaid) > 0) items.push("Lease agreement or rent payment statements");
  }
  if (num(ho.homeInsurance) > 0) items.push((ho.ownOrRent === "rent" ? "Renters" : "Homeowners") + " insurance statement");
  if (num(ho.utilities) > 0) items.push("Utility bills (electric, gas, water, etc.)");
  if (num(ho.maintenance) > 0 || num(ho.repairs) > 0) items.push("Receipts for home repairs and maintenance");
  if (ho.hasDedicated) items.push("Supporting documentation for the home office square footage (e.g., room measurements, floor plan, or photos)");
  return items;
}

export function homeOfficeEscrowNote(ho: HomeOffice): string {
  if (ho.ownOrRent === "own" && num(ho.mortgageInterest) > 0 && (num(ho.propertyTax) > 0 || num(ho.homeInsurance) > 0)) {
    return "Property taxes and homeowners insurance are often included on the same mortgage statement if held in escrow — check there before requesting separate documents.";
  }
  return "";
}

export type HomeOfficeCalc = {
  pct: number | null;
  actualDeduction: number;
  recommended: HomeOfficeMethod;
  effective: HomeOfficeMethod;
  effectiveTotal: number;
};

export function computeHomeOffice(ho: HomeOffice): HomeOfficeCalc {
  const p = pctUse(ho.officeSqFt, ho.homeSqFt);
  const actualDeduction = ho.hasDedicated && p !== null ? (p / 100) * homeOfficeAnnualCosts(ho) : 0;
  const recommended: HomeOfficeMethod = ho.hasDedicated ? "actual" : "none";
  return { pct: p, actualDeduction, recommended, effective: recommended, effectiveTotal: actualDeduction };
}

export type VehicleCalc = {
  mileageDeduction: number;
  operatingDeduction: number;
  leaseDeduction: number;
  depreciationDeduction: number;
  depreciationEligible: boolean;
  depreciationNote: string;
  actualTotal: number;
  recommended: VehicleMethod;
  effective: VehicleMethod;
  effectiveTotal: number;
  delta: number;
};

/** `section` supplies the vehicle catch-up election, which applies to every vehicle. */
export function computeVehicle(v: Vehicle, section: CatchUpSection): VehicleCalc {
  // Input is collected per month; annualize for the yearly estimate.
  const factor = catchUpFactor(section);
  const miles = num(v.annualMiles) * 12 * factor;
  const mileageDeduction = miles * RATES.mileageRate;

  const busPct = Math.max(0, Math.min(100, num(v.businessUsePct)));
  // Fuel and insurance are collected per month (annualized here); maintenance & repairs is collected per year.
  const operatingCosts = ((num(v.fuelCost) + num(v.insuranceCost)) * 12 + num(v.maintenanceCost)) * factor;
  const operatingDeduction = (busPct / 100) * operatingCosts;

  let leaseDeduction = 0;
  let depreciationDeduction = 0;
  let depreciationEligible = false;
  let depreciationNote = "";
  // Depreciation applies to a vehicle purchased this year, or to a capital lease that began this year
  // (a capital lease is treated like owning the vehicle, so depreciation replaces the lease-payment deduction).
  const capitalLease = v.ownership === "leased" && !!v.capitalLease;
  const depApplies = (v.ownership === "owned" && !!v.purchasedThisYear) || (capitalLease && !!v.leaseStartedThisYear);
  if (v.ownership === "leased" && !capitalLease) {
    leaseDeduction = (busPct / 100) * (num(v.leasePayment) * 12) * factor;
    if (num(v.leasePayment) > 0) depreciationNote = "Leased vehicles deduct the business-use share of lease payments instead of depreciation. Very high-value leases can also require a small “lease inclusion” add-back — the client's tax preparer will confirm if that applies.";
  } else if (capitalLease && !depApplies) {
    depreciationNote = "A capital lease is treated like owning the vehicle, so lease payments aren't deducted directly — depreciation applies instead. A lease that began before 2026 doesn't qualify for first-year depreciation this year; the client's tax preparer will confirm the depreciation that applies.";
  } else if (depApplies) {
    const price = num(capitalLease ? v.leaseCost : v.purchasePrice);
    const basis = price * (busPct / 100);
    depreciationEligible = busPct > RATES.depreciationMinBusinessUsePct;
    if (depreciationEligible && basis > 0) {
      if (v.weightClass === "heavyTruck") {
        depreciationDeduction = basis;
        depreciationNote = "Heavy trucks/vans over 14,000 lbs (or with a full cargo bed) generally fall outside the luxury-auto caps entirely, so the full business-use basis can potentially be expensed in year one, subject to the client's overall Section 179 income limit.";
      } else if (v.weightClass === "heavySuv") {
        depreciationDeduction = basis; // §179 SUV cap + 100% bonus on remainder ≈ full basis
        depreciationNote = "Heavy SUVs (6,001–14,000 lbs) can combine a $" + RATES.suv179Cap.toLocaleString("en-US") + " Section 179 deduction with 100% bonus depreciation on the rest of the basis — together, that's close to the full business-use cost in year one.";
      } else {
        depreciationDeduction = Math.min(basis, RATES.luxuryCapYear1);
        depreciationNote = "Cars, crossovers, and small SUVs are capped at $" + RATES.luxuryCapYear1.toLocaleString("en-US") + " of first-year depreciation under the luxury-auto rules (IRC §280F), even with 100% bonus depreciation.";
      }
    } else if (!depreciationEligible && price > 0) {
      depreciationNote = "Business use is at or below 50%, so this vehicle doesn't qualify for Section 179 or bonus depreciation this year — only straight-line depreciation would apply.";
    }
    if (capitalLease && depreciationNote) depreciationNote = "Because this is a capital lease, the client is treated as the owner for depreciation purposes. " + depreciationNote;
  }

  const actualTotal = operatingDeduction + leaseDeduction + depreciationDeduction;
  const recommended: VehicleMethod = actualTotal > mileageDeduction ? "actual" : "mileage";
  const effective: VehicleMethod = v.methodOverride || recommended;
  const effectiveTotal = effective === "actual" ? actualTotal : mileageDeduction;

  return {
    mileageDeduction,
    operatingDeduction,
    leaseDeduction,
    depreciationDeduction,
    depreciationEligible,
    depreciationNote,
    actualTotal,
    recommended,
    effective,
    effectiveTotal,
    delta: Math.abs(actualTotal - mileageDeduction),
  };
}

export function vehicleDocItems(v: Vehicle, calc: VehicleCalc): string[] {
  const items: string[] = [];
  const leased = v.ownership === "leased";
  if (calc.effective === "mileage") {
    if (leased) items.push("Copy of the vehicle lease agreement");
    items.push("Contemporaneous mileage log: date, starting/ending odometer or miles, destination, business purpose");
    return items;
  }
  if (num(v.fuelCost) > 0) items.push("Fuel/gas receipts or statements");
  if (num(v.insuranceCost) > 0) items.push("Vehicle insurance statement");
  if (num(v.maintenanceCost) > 0) items.push("Receipts for repairs and maintenance");
  if (leased) items.push("Copy of the vehicle lease agreement");
  if (leased && !v.capitalLease && num(v.leasePayment) > 0) items.push("Lease statement showing annual payments");
  if (v.ownership === "owned" && v.purchasedThisYear && calc.depreciationDeduction > 0) items.push("Purchase invoice");
  if (v.ownership === "owned" && v.isFinanced) items.push("Loan agreement/statement");
  items.push("Supporting documentation to substantiate this vehicle's business-use percentage (e.g., a mileage log)");
  return items;
}

export function vehicleBundlingNote(v: Vehicle, calc: VehicleCalc): string {
  if (calc.effective !== "actual") return "";
  const hasOtherCosts = num(v.fuelCost) > 0 || num(v.insuranceCost) > 0 || num(v.maintenanceCost) > 0;
  if (!hasOtherCosts) return "";
  if (v.ownership === "leased" && !v.capitalLease && num(v.leasePayment) > 0) {
    return "The client's lease statement won't include fuel, insurance, or repair costs — they'll still need separate receipts for those.";
  }
  if (v.ownership === "owned" && num(v.purchasePrice) > 0) {
    return "The client's loan or purchase statement won't include fuel, insurance, or repair costs — they'll still need separate receipts for those.";
  }
  return "";
}

export type PlanTotals = {
  ho: HomeOfficeCalc;
  vehicles: { v: Vehicle; calc: VehicleCalc }[];
  hoTotal: number;
  vehTotal: number;
  depTotal: number;
  grandTotal: number;
};

export function computeAll(state: PlanState): PlanTotals {
  const ho = computeHomeOffice(state.homeOffice);
  const vehicles = state.vehicles.list.map((v) => ({ v, calc: computeVehicle(v, state.vehicles) }));
  const hoTotal = state.homeOffice.included ? ho.effectiveTotal : 0;
  const vehTotal = state.vehicles.included ? vehicles.reduce((s, x) => s + x.calc.effectiveTotal, 0) : 0;
  const depTotal = state.vehicles.included
    ? vehicles.reduce((s, x) => s + (x.calc.effective === "actual" ? x.calc.depreciationDeduction : 0), 0)
    : 0;
  return { ho, vehicles, hoTotal, vehTotal, depTotal, grandTotal: hoTotal + vehTotal };
}

/* ───────────────────────────── validation ───────────────────────────── */

/** Error message by field key. Vehicle keys carry the vehicle id: v_, m_, own_, price_. */
export type StepErrors = Record<string, string>;

export function validateStep(state: PlanState, i: number): StepErrors {
  const errs: StepErrors = {};
  if (i === 0) {
    if (!state.businessName.trim()) errs.businessName = "Enter the client's business name.";
    if (!state.ownerName.trim()) errs.ownerName = "Enter the shareholder-employee's name.";
    if (!state.effectiveDate) errs.effectiveDate = "Choose an effective date.";
    if (state.ein && state.ein.replace(/\D/g, "").length !== 9) errs.ein = "EIN should be 9 digits (XX-XXXXXXX).";
  }
  if (i === 1 && state.homeOffice.included) {
    const ho = state.homeOffice;
    if (ho.hasDedicated === null) errs.hoNone = "Answer the question below, or turn this off.";
    else if (ho.hasDedicated === false) errs.hoNone = "Home office reimbursement needs a dedicated, regularly-used space — turn this off if that doesn't apply.";
    else {
      if (!ho.officeSqFt) errs.officeSqFt = "Enter the client's office square footage.";
      if (!ho.homeSqFt) errs.homeSqFt = "Enter the client's home's total square footage.";
      if (!ho.ownOrRent) errs.ownOrRent = "Let us know if the client owns or rents.";
      if (ho.catchUp === null) errs.hoCatchUp = "Let us know whether a catch-up reimbursement applies.";
      if (!ho.catchUpDate) errs.hoCatchUpDate = "Enter a date.";
    }
  }
  if (i === 2 && state.vehicles.included) {
    if (state.vehicles.list.length === 0) errs.vehicles = "Add at least one vehicle, or turn this off.";
    state.vehicles.list.forEach((v) => {
      if (!v.label.trim()) errs["v_" + v.id] = "Give this vehicle a short description.";
      if (!v.annualMiles) errs["m_" + v.id] = "Estimate monthly business miles.";
      if (!v.ownership) errs["own_" + v.id] = "Let us know if the client owns or leases this vehicle.";
      if (v.ownership === "owned" && v.purchasedThisYear && !v.purchasePrice) errs["price_" + v.id] = "Enter the purchase price.";
      if (v.ownership === "leased" && v.capitalLease && v.leaseStartedThisYear && !v.leaseCost) errs["price_" + v.id] = "Enter the capitalized cost.";
    });
    if (state.vehicles.catchUp === null) errs.vCatchUp = "Let us know whether a catch-up reimbursement applies.";
    if (!state.vehicles.catchUpDate) errs.vCatchUpDate = "Enter a date.";
  }
  if (i === 4) {
    if (!state.signerName.trim()) errs.signerName = "Enter the signer's name.";
    if (!state.signerTitle.trim()) errs.signerTitle = "Enter the signer's title.";
  }
  return errs;
}

/* ───────────────────────── substantiation & timing ───────────────────────── */

export function reimbursementCadenceNote(freq: Frequency): string {
  if (freq !== "quarterly") return "";
  return "Because meetings are quarterly, reimbursement is calculated and paid quarterly too. The client calculates each reimbursement using the plan's reimbursement tracker and keeps supporting documentation as expenses are incurred — staying within the 60-day substantiation window — then brings the completed tracker to the quarterly meeting for review and payment.";
}

export type DocGroup = { label: string; items: string[] };

export function getSubstantiationGroups(state: PlanState, all = computeAll(state)): DocGroup[] {
  const groups: DocGroup[] = [];
  const ho = state.homeOffice;

  let hoItems: string[] = [];
  if (ho.included && all.ho.effective === "actual") hoItems = hoItems.concat(homeOfficeDocItems(ho));
  if (hoItems.length) groups.push({ label: "Home Office", items: hoItems });

  if (state.vehicles.included) {
    // Deduplicated across vehicles, first-seen order.
    const vehItems: string[] = [];
    all.vehicles.forEach((x) => {
      vehicleDocItems(x.v, x.calc).forEach((item) => {
        if (!vehItems.includes(item)) vehItems.push(item);
      });
    });
    if (vehItems.length) groups.push({ label: "Vehicle", items: vehItems });
  }

  const anyItems = groups.some((g) => g.items.length);
  if (state.reimbursementFrequency === "quarterly" && anyItems) {
    groups.push({
      label: "General",
      items: ["An up-to-date reimbursement tracker, maintained as expenses are incurred — this keeps every expense inside the 60-day substantiation window."],
    });
  }
  return groups;
}

/* ───────────────────────────── the policy ───────────────────────────── */

const esc = escapeHtml;

/** "Riverside Design Studio, Inc., a Virginia S-Corporation," — HTML-escaped. */
function entityNameHtml(state: PlanState): string {
  const name = state.businessName.trim() || "[Business Name]";
  const st = state.entityState.trim();
  return esc(name) + (st ? ", a " + esc(st) + " S-Corporation," : ", an S-Corporation,");
}

function ownerNameHtml(state: PlanState): string {
  return esc(state.ownerName.trim() || "[Owner Name]");
}

export type PolicySection = { title: string; body: string };

/** The numbered sections, bodies as HTML. Every user-supplied string is escaped. */
export function buildSections(state: PlanState): PolicySection[] {
  const sections: PolicySection[] = [];
  const all = computeAll(state);
  const owner = ownerNameHtml(state);

  sections.push({ title: "Purpose", body: "<p>This Accountable Plan (“the Plan”) is intended to meet the requirements of Treasury Regulation &sect; 1.62-2, implementing IRC &sect;&sect; 62(a)(2)(A) and 62(c). The Plan allows " + entityNameHtml(state) + " (“the Company”) to reimburse its employees, including shareholder-employees, for ordinary and necessary business expenses incurred in performing services for the Company, without such reimbursements being treated as taxable wages.</p>" });

  const categories: string[] = [];
  if (state.homeOffice.included) categories.push("Home office");
  if (state.vehicles.included) categories.push("Business use of a vehicle");
  sections.push({
    title: "Eligible Expense Categories",
    body: categories.length
      ? "<p>The Company will reimburse the following categories of business expense under this Plan:</p><ul>" + categories.map((c) => "<li>" + c + "</li>").join("") + "</ul>"
      : '<p class="placeholder-text">No expense categories selected yet.</p>',
  });

  if (state.homeOffice.included) {
    const ho = state.homeOffice;
    const hc = all.ho;
    let body = "";
    if (hc.effective === "actual") {
      body += "<p>The Company has elected the <strong>Actual Expense Method</strong> for home office reimbursement. " + owner + "'s home office comprises approximately " + esc(ho.officeSqFt || "[office sq ft]") + " square feet of a " + esc(ho.homeSqFt || "[home sq ft]") + "-square-foot residence" + (hc.pct !== null ? ", a business-use percentage of <strong>" + hc.pct + "%</strong>." : ".") + " Reimbursement is based on this percentage of actual mortgage interest or rent, utilities, insurance, and maintenance costs.</p>";
      if (ho.catchUp === false && ho.catchUpDate) body += "<p>No catch-up reimbursement is elected for home office expenses. This Plan applies to home office expenses incurred after " + esc(fmtDateLong(ho.catchUpDate)) + ".</p>";
    }
    if (!body) body = '<p class="placeholder-text">Answer the home office questions to populate this section.</p>';
    sections.push({ title: "Home Office Reimbursement", body });
  }

  if (state.vehicles.included) {
    let vBody = "<p>For each vehicle listed below, the Company has elected the indicated reimbursement method:</p>";
    if (all.vehicles.length) {
      vBody += "<table><tr><th>Vehicle</th><th>Owned/Leased</th><th>Method</th><th>Business-use %</th></tr>";
      all.vehicles.forEach((x) => {
        vBody += "<tr><td>" + esc(x.v.label || "[vehicle]") + "</td><td>" + (x.v.ownership === "leased" ? (x.v.capitalLease ? "Leased (capital lease)" : "Leased") : x.v.ownership === "owned" ? "Owned" : "—") + "</td><td>" + (x.calc.effective === "mileage" ? "Standard mileage rate" : "Actual expense") + "</td><td>" + (x.v.businessUsePct ? esc(x.v.businessUsePct) + "%" : "—") + "</td></tr>";
      });
      vBody += "</table>";
    }
    vBody += "<p>Reimbursement under the Standard Mileage Method is calculated using the applicable IRS standard business mileage rate in effect when each expense is incurred, as published annually by the IRS. A vehicle's elected method will not change mid-year without a documented reason, and a vehicle depreciated under the Actual Expense Method may not later switch to the standard mileage rate.</p>";
    if (all.vehicles.some((x) => x.calc.effective === "actual" && x.calc.depreciationDeduction > 0)) {
      vBody += "<p>Depreciation on vehicles placed in service during the plan year, including any Section 179 or bonus depreciation election, will be calculated and substantiated by the Company's tax preparer and is subject to applicable IRC &sect;280F and &sect;179 limitations.</p>";
    }
    if (all.vehicles.some((x) => x.calc.effective === "actual" && x.v.ownership === "leased" && !x.v.capitalLease)) {
      vBody += "<p>For leased vehicles, reimbursement under the Actual Expense Method is based on the business-use percentage of lease payments rather than depreciation.</p>";
    }
    if (all.vehicles.some((x) => x.calc.effective === "actual" && x.v.ownership === "leased" && x.v.capitalLease)) {
      vBody += "<p>For a leased vehicle that is a capital lease, the Company treats the employee as the owner of the vehicle for tax purposes. Depreciation is calculated in the same manner as for a purchased vehicle, in place of a reimbursement of lease payments, and is subject to the limitations described above.</p>";
    }
    vBody += "<p>Consistent with IRC &sect; 274(d) and Treasury Regulation &sect; 1.274-5T, a vehicle's business-use percentage is the ratio of business miles to total miles driven during the year. The employee shall maintain a contemporaneous mileage log recording the date, mileage, destination, and business purpose of each trip, and shall use that log to determine the business-use percentage applied under this Plan.</p>";
    if (state.vehicles.catchUp === false && state.vehicles.catchUpDate) vBody += "<p>No catch-up reimbursement is elected for vehicle expenses. This Plan applies to vehicle expenses incurred after " + esc(fmtDateLong(state.vehicles.catchUpDate)) + ".</p>";
    sections.push({ title: "Business Use of a Vehicle", body: vBody });
  }

  let subBody = "<p>Employees must substantiate each reimbursed expense as to amount, time, place, and business purpose within the time limits described below. Each employee will maintain the following documentation and use it to calculate their own reimbursement with the Company's reimbursement tracker, for the Company's accounting team to review:</p>";
  const subGroupsDoc = getSubstantiationGroups(state, all);
  if (subGroupsDoc.length) {
    subBody += subGroupsDoc
      .map((g) => "<p><strong>" + g.label + "</strong></p><ul>" + g.items.map((i) => "<li>" + i + "</li>").join("") + "</ul>")
      .join("");
  }
  const escrow = homeOfficeEscrowNote(state.homeOffice);
  subBody += escrow ? '<p style="font-size:11.5px;color:#6B6D74;">Note: ' + escrow + "</p>" : "";
  sections.push({ title: "Substantiation", body: subBody });

  const cuParts: { label: string; date: string }[] = [];
  if (state.homeOffice.included && state.homeOffice.catchUp === true) cuParts.push({ label: "home office", date: state.homeOffice.catchUpDate });
  if (state.vehicles.included && state.vehicles.catchUp === true) cuParts.push({ label: "vehicle", date: state.vehicles.catchUpDate });
  const hasCatchUp = cuParts.length > 0;
  if (hasCatchUp) {
    let cuWhat: string;
    if (cuParts.length === 2 && cuParts[0].date === cuParts[1].date) {
      cuWhat = "business expenses incurred through " + (cuParts[0].date ? esc(fmtDateLong(cuParts[0].date)) : "[catch-up date]");
    } else {
      cuWhat = cuParts.map((c) => c.label + " expenses incurred through " + (c.date ? esc(fmtDateLong(c.date)) : "[catch-up date]")).join(" and ");
    }
    sections.push({
      title: "One-Time Catch-Up Reimbursement",
      body: "<p>The Company will make a single, one-time catch-up reimbursement for substantiated " + cuWhat + " that were not reimbursed because " + owner + " was not yet aware of this benefit. Because of these extenuating circumstances, this payment falls outside the timing periods described under &ldquo;Timing &mdash; Reasonable Period (Fixed-Date Method)&rdquo; below. It is intended solely to give " + owner + " the full benefit of this Plan. Every expense remains subject to the substantiation requirements of Treasury Regulation &sect; 1.62-2(e) and will be recorded in the reimbursement tracker. Expenses incurred after the applicable date above are reimbursed within the periods in Treasury Regulation &sect; 1.62-2(g)(2).</p>",
    });
  }

  let timingBody = "";
  if (state.reimbursementFrequency === "quarterly") {
    timingBody += "<p>The Company meets with its accounting team <strong>quarterly</strong>. " + owner + " calculates each reimbursement using the Company's reimbursement tracker as expenses are incurred, remaining within the substantiation window described below, and presents the completed tracker and supporting documentation at that meeting for the accounting team's review and payment.</p>";
  } else {
    timingBody += "<p>The Company meets with its accounting team <strong>monthly</strong>. " + owner + " calculates each reimbursement using the Company's reimbursement tracker as expenses are incurred, and reimbursements under this Plan are paid upon the accounting team's review of the tracker and supporting documentation at that meeting.</p>";
  }
  timingBody += "<p>The Company applies the Fixed-Date Method safe harbor under Treasury Regulation &sect; 1.62-2(g)(2)(i):</p><ul><li>Any advance is made no more than 30 days before the related expense is paid or incurred.</li><li>Expenses are substantiated within 60 days after being paid or incurred.</li><li>Any excess reimbursement is returned within 120 days after the expense is paid or incurred.</li></ul>";
  if (hasCatchUp) timingBody += "<p>These periods apply to all reimbursements under this Plan other than the one-time catch-up reimbursement described under &ldquo;One-Time Catch-Up Reimbursement&rdquo; above.</p>";
  sections.push({ title: "Timing — Reasonable Period (Fixed-Date Method)", body: timingBody });

  sections.push({ title: "Return of Excess Reimbursement", body: "<p>Any amount advanced to an employee in excess of substantiated expenses must be returned to the Company within the period described above.</p>" });

  sections.push({ title: "Tax Treatment", body: "<p>Amounts properly reimbursed under this Plan are excluded from the employee's gross income, are not reported as wages on Form W-2, and are exempt from withholding and payment of employment taxes. Expenses not reimbursed under this Plan are outside its scope.</p>" });

  return sections;
}

/**
 * The full policy document for a plan, as an HTML fragment: title, sections,
 * Adoption and the signature block. Styled by the `.ap-paper` rules on
 * screen and by documentStandaloneHtml's sheet for print and download. Safe
 * to inject — every user-supplied string is escaped.
 */
export function policyDocHtml(state: PlanState): string {
  const sections = buildSections(state);
  let html = "<h1>Accountable Plan Policy</h1>";
  html += '<div class="doc-sub">' + entityNameHtml(state) + " &mdash; Effective " + (state.effectiveDate ? esc(fmtDateLong(state.effectiveDate)) : "[effective date]") + "</div>";
  sections.forEach((s, i) => {
    html += "<h2>" + (i + 1) + ". " + s.title + "</h2>" + s.body;
  });
  const n = sections.length + 1;
  html += "<h2>" + n + ". Adoption</h2><p>This Accountable Plan Policy is adopted by the Company effective as of the date below.</p>";
  const sigNm = state.signerName.trim();
  html += '<div class="doc-sig-block"><div><div class="sig-name' + (sigNm ? " sig-script" : "") + '">' + (sigNm ? esc(sigNm) : "—") + '</div><div class="sig-line">' + (sigNm ? esc(sigNm) + ", " : "") + esc(state.signerTitle.trim() || "Signer title") + ", " + esc(state.businessName.trim() || "Company") + '</div></div><div><div class="sig-name">' + (state.signDate ? esc(fmtDateLong(state.signDate)) : "—") + '</div><div class="sig-line">Date signed</div></div></div>';
  if (state.preparedBy.trim()) html += '<p style="margin-top:20px;font-size:10.5px;color:#8A8C92;font-family:Arial,sans-serif;">Prepared with the assistance of ' + esc(state.preparedBy.trim()) + ".</p>";
  return html;
}

/**
 * The entities the section bodies use, decoded for the .txt download. The
 * original left `&sect;` and friends in the text file verbatim; this is the
 * one place that output deliberately differs.
 */
const ENTITIES: Record<string, string> = {
  "&sect;": "§",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&mdash;": "—",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
};

function htmlToText(html: string): string {
  return html
    .replace(/<li>/g, "\n  - ")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&(?:sect|ldquo|rdquo|mdash|nbsp|quot|#39|lt|gt|amp);/g, (m) => ENTITIES[m] ?? m)
    .trim();
}

export function documentPlainText(state: PlanState): string {
  const sections = buildSections(state);
  const lines: string[] = [];
  lines.push("ACCOUNTABLE PLAN POLICY");
  lines.push(htmlToText(entityNameHtml(state)));
  lines.push("Effective " + (state.effectiveDate ? fmtDateLong(state.effectiveDate) : "[effective date]"));
  lines.push("");
  sections.forEach((s, i) => {
    lines.push(i + 1 + ". " + s.title.toUpperCase());
    lines.push(htmlToText(s.body));
    lines.push("");
  });
  const n = sections.length + 1;
  lines.push(n + ". ADOPTION");
  lines.push("This Accountable Plan Policy is adopted by the Company effective as of the date below.");
  lines.push("");
  lines.push("Signed: " + (state.signerName.trim() || "________________________"));
  lines.push("Title: " + (state.signerTitle.trim() || "________________________"));
  lines.push("Date: " + (state.signDate ? fmtDateLong(state.signDate) : "________________________"));
  return lines.join("\n");
}

/**
 * A self-contained HTML file of the policy — the Download HTML button, and
 * what Print hands the browser (so the print dialog sees only the document).
 * Loads Great Vibes from Google Fonts so the signature prints in script; the
 * title becomes Chrome's default "Save as PDF" filename, hence the business.
 */
export function documentStandaloneHtml(state: PlanState): string {
  const business = state.businessName.trim();
  const title = "Accountable Plan Policy" + (business ? " — " + business : "");
  return (
    "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>" +
    esc(title) +
    "</title><link href='https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap' rel='stylesheet'><style>body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1B1B1F;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact;}h1{font-size:22px;text-align:center;}.doc-sub{text-align:center;font-family:Arial,sans-serif;font-size:12px;color:#6B6D74;margin-bottom:26px;}h2{font-size:15px;margin-top:26px;border-top:1px solid #E4E0D4;padding-top:14px;}table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;}th,td{border:1px solid #E4E0D4;padding:7px 9px;font-size:12.5px;text-align:left;}th{background:#F1EEE3;}.placeholder-text{color:#8A8C92;font-style:italic;}.doc-sig-block{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:22px;break-inside:avoid;}.doc-sig-block .sig-line{border-top:1px solid #1B1B1F;padding-top:6px;font-family:Arial,sans-serif;font-size:11px;color:#6B6D74;}.doc-sig-block .sig-name{font-size:13.5px;margin-bottom:22px;}.doc-sig-block .sig-name.sig-script{font-family:'Great Vibes','Brush Script MT','Segoe Script',cursive;font-size:30px;line-height:1;margin-bottom:8px;}@page{margin:0.75in;}@media print{body{margin:0 auto;padding:0;}h2{break-after:avoid;}}</style></head><body>" +
    policyDocHtml(state) +
    "</body></html>"
  );
}

/* ───────────────────────────── records ───────────────────────────── */

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Everything the records table needs at a glance, derived from the plan.
 * The server computes this on every write rather than trusting the browser's
 * numbers, so the table and the CSV can't disagree with the policy.
 */
export type PlanSummary = {
  ownerName: string;
  businessName: string;
  entityState: string;
  effectiveDate: string;
  reimbursementFrequency: Frequency;
  homeOfficeIncluded: boolean;
  homeOfficePct: number;
  homeOfficeAnnual: number;
  vehicleCount: number;
  vehicles: { label: string; method: VehicleMethod; annual: number }[];
  vehicleAnnual: number;
  depreciationAnnual: number;
  estimatedAnnualBenefit: number;
  signerName: string;
  signerTitle: string;
  signDate: string;
  signatureComplete: boolean;
};

/** A saved plan as the API returns it. Timestamps are ISO; names are display names. */
export type PlanRecord = PlanSummary & {
  id: string;
  createdAt: string | null;
  createdByName: string;
  savedAt: string | null;
  savedByName: string;
  state: PlanState;
};

export function buildRecordSummary(state: PlanState): PlanSummary {
  const r = computeAll(state);
  const vehicles = state.vehicles.included ? r.vehicles : [];
  const signerName = state.signerName.trim();
  return {
    ownerName: state.ownerName.trim(),
    businessName: state.businessName.trim(),
    entityState: state.entityState || "",
    effectiveDate: state.effectiveDate || "",
    reimbursementFrequency: state.reimbursementFrequency,
    homeOfficeIncluded: !!state.homeOffice.included,
    homeOfficePct: state.homeOffice.included && r.ho.pct !== null ? round2(r.ho.pct) : 0,
    homeOfficeAnnual: round2(r.hoTotal),
    vehicleCount: vehicles.length,
    vehicles: vehicles.map((x) => ({
      label: (x.v.label || "").trim(),
      method: x.calc.effective,
      annual: state.vehicles.included ? round2(x.calc.effectiveTotal) : 0,
    })),
    vehicleAnnual: round2(r.vehTotal),
    depreciationAnnual: round2(r.depTotal),
    estimatedAnnualBenefit: round2(r.grandTotal),
    signerName,
    signerTitle: state.signerTitle.trim(),
    signDate: state.signDate || "",
    signatureComplete: !!(signerName && state.signerTitle.trim() && state.signDate),
  };
}

/* ───────────────────────────── sanitizing ───────────────────────────── */

/** Most vehicles one plan can carry. Ten is several times any real client. */
export const MAX_VEHICLES = 10;

/** Firestore-safe document id: no slashes, no dots, no reserved __x__ form. */
export function isValidPlanId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(id) && !/^__.*__$/.test(id);
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});

/** A string field, capped; a key that's absent takes the default (the original's merge-over-defaults). */
function str(raw: Raw, key: string, fallback: string, max = 200): string {
  if (!(key in raw)) return fallback;
  const v = raw[key];
  return typeof v === "string" ? v.slice(0, max) : typeof v === "number" && isFinite(v) ? String(v) : "";
}

/** A number kept as its typed string: digits, one point, an optional leading minus. */
function numStr(raw: Raw, key: string, fallback = ""): string {
  if (!(key in raw)) return fallback;
  const v = raw[key];
  if (typeof v === "number") return isFinite(v) ? String(v).slice(0, 16) : "";
  if (typeof v !== "string") return "";
  const neg = v.trim().startsWith("-");
  let s = v.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  return ((neg && s ? "-" : "") + s).slice(0, 16);
}

/** YYYY-MM-DD or "" — the policy prints these, so nothing else gets through. */
function isoDate(raw: Raw, key: string, fallback: string): string {
  if (!(key in raw)) return fallback;
  const v = raw[key];
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

const bool = (raw: Raw, key: string, fallback = false) => (key in raw ? raw[key] === true : fallback);

function triBool(raw: Raw, key: string): boolean | null {
  const v = raw[key];
  return v === true ? true : v === false ? false : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function sanitizeVehicle(rawV: unknown, index: number): Vehicle {
  const r = obj(rawV);
  const seq = Number.isInteger(r._seq) && (r._seq as number) > 0 && (r._seq as number) < 1e6 ? (r._seq as number) : index + 1;
  const base = newVehicle(seq);
  return {
    id: typeof r.id === "string" && /^veh_\d{1,6}$/.test(r.id) ? r.id : base.id,
    _seq: seq,
    label: str(r, "label", "", 120),
    annualMiles: numStr(r, "annualMiles"),
    ownership: oneOf(r.ownership, ["owned", "leased"] as const),
    fuelCost: numStr(r, "fuelCost"),
    insuranceCost: numStr(r, "insuranceCost"),
    maintenanceCost: numStr(r, "maintenanceCost"),
    leasePayment: numStr(r, "leasePayment"),
    businessUsePct: numStr(r, "businessUsePct", base.businessUsePct),
    isFinanced: bool(r, "isFinanced"),
    purchasedThisYear: bool(r, "purchasedThisYear"),
    purchasePrice: numStr(r, "purchasePrice"),
    capitalLease: bool(r, "capitalLease"),
    leaseStartedThisYear: bool(r, "leaseStartedThisYear"),
    leaseCost: numStr(r, "leaseCost"),
    weightClass: oneOf(r.weightClass, ["standard", "heavySuv", "heavyTruck", "unsure"] as const) ?? "standard",
    methodOverride: oneOf(r.methodOverride, ["actual", "mileage"] as const),
  };
}

/**
 * Narrow untrusted input — a request body, a backup file, a localStorage
 * draft — to a well-formed PlanState. Absent keys take the defaults, present
 * ones are coerced or blanked; nothing here throws. Vehicle ids are made
 * unique, since the form keys errors and controls by them.
 */
export function sanitizePlanState(raw: unknown, now = new Date()): PlanState {
  const r = obj(raw);
  const d = defaultPlanState(now);
  const ho = obj(r.homeOffice);
  const vs = obj(r.vehicles);

  const list = (Array.isArray(vs.list) ? vs.list : []).slice(0, MAX_VEHICLES).map(sanitizeVehicle);
  const seen = new Set<string>();
  let seq = nextVehicleSeq(list);
  const vehicles = list.map((v) => {
    if (!seen.has(v.id)) {
      seen.add(v.id);
      return v;
    }
    const fresh = { ...v, id: "veh_" + seq, _seq: seq };
    seq += 1;
    seen.add(fresh.id);
    return fresh;
  });

  const state: PlanState = {
    businessName: str(r, "businessName", d.businessName),
    entityState: str(r, "entityState", d.entityState, 80),
    ownerName: str(r, "ownerName", d.ownerName),
    ein: formatEin(str(r, "ein", d.ein, 20)),
    effectiveDate: isoDate(r, "effectiveDate", d.effectiveDate),
    preparedBy: str(r, "preparedBy", d.preparedBy),
    reimbursementFrequency: oneOf(r.reimbursementFrequency, ["monthly", "quarterly"] as const) ?? "monthly",
    homeOffice: {
      included: bool(ho, "included"),
      hasDedicated: triBool(ho, "hasDedicated"),
      officeSqFt: numStr(ho, "officeSqFt"),
      homeSqFt: numStr(ho, "homeSqFt"),
      ownOrRent: oneOf(ho.ownOrRent, ["own", "rent"] as const),
      mortgageInterest: numStr(ho, "mortgageInterest"),
      propertyTax: numStr(ho, "propertyTax"),
      rentPaid: numStr(ho, "rentPaid"),
      homeInsurance: numStr(ho, "homeInsurance"),
      utilities: numStr(ho, "utilities"),
      maintenance: numStr(ho, "maintenance"),
      repairs: numStr(ho, "repairs"),
      catchUp: triBool(ho, "catchUp"),
      catchUpDate: isoDate(ho, "catchUpDate", d.homeOffice.catchUpDate),
    },
    vehicles: {
      included: bool(vs, "included"),
      list: vehicles,
      catchUp: triBool(vs, "catchUp"),
      catchUpDate: isoDate(vs, "catchUpDate", d.vehicles.catchUpDate),
    },
    signerName: str(r, "signerName", d.signerName),
    signerTitle: str(r, "signerTitle", d.signerTitle),
    signDate: isoDate(r, "signDate", d.signDate),
  };
  if (isValidPlanId(r._clientId)) state._clientId = r._clientId;
  return state;
}

/** A record arriving from a backup file, before the store re-derives its summary. */
export type ImportedPlan = {
  id: string | null;
  state: PlanState;
  createdAt: string | null;
  createdByName: string;
  savedAt: string | null;
  savedByName: string;
};

const isoTimestamp = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return isFinite(t) ? new Date(t).toISOString() : null;
};

/**
 * Narrow one backup record. Returns null when there's no plan in it — the
 * original importer skipped those too. Only the plan and the provenance
 * survive; the summary is recomputed from the plan. Old backups carry
 * opaque user ids in createdBy/savedBy, which mean nothing here and are
 * dropped.
 */
export function sanitizePlanRecord(raw: unknown): ImportedPlan | null {
  const r = obj(raw);
  if (!r.state || typeof r.state !== "object") return null;
  const name = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
  const state = sanitizePlanState(r.state);
  delete state._clientId;
  return {
    id: isValidPlanId(r.id) ? r.id : null,
    state,
    createdAt: isoTimestamp(r.createdAt),
    createdByName: name(r.createdByName),
    savedAt: isoTimestamp(r.savedAt),
    savedByName: name(r.savedByName),
  };
}
