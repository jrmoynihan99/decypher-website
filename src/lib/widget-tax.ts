/**
 * Tax math for the internal portal widgets.
 *
 * The brackets, state table and standard deductions are NOT duplicated here —
 * they live in lib/tax.ts (the public estimator's engine) and are imported, so
 * a CPA updating a bracket for the tax year fixes the whole site at once.
 * What lives here is the modelling the staff tools need and the public
 * estimator doesn't: switchable standard/QBI deductions, the QBI phase-out,
 * per-plan retirement contribution room, the Roth MAGI phase-out, and the
 * late-filing penalty run.
 *
 * Every figure below is a 2026 estimate. Verify against the IRS release before
 * a client acts on it — the widgets say so on screen, and so does this file.
 */

import {
  TAX,
  marginal,
  marginalRate,
  stateTaxFor,
  type FilingStatus,
} from "@/lib/tax";

export type { FilingStatus };

/** The three statuses the savings wizard offers; the shelter engine adds mfs. */
export type WizardStatus = "single" | "mfj" | "hoh";

export const STD_DED = TAX.stdDed;
export const SS_WAGE_BASE = TAX.ssWageBase;
export const SE = TAX.seRate;

/** 2026 contribution limits — the shelter engine exposes these for editing. */
export const LIMITS = {
  /** 401(k) elective deferral */
  deferral: 24500,
  /** Catch-up, ages 50–59 and 64+ */
  deferralCatchup50: 8000,
  /** "Super" catch-up, ages 60–63 */
  deferralCatchup60: 11250,
  /** 415(c) total defined-contribution / SEP cap */
  dcLimit: 72000,
  /** Compensation cap for plan contributions */
  compCap: 360000,
  sepPctSoleProp: 0.2,
  sepPctScorp: 0.25,
  hsaSelf: 4400,
  hsaFamily: 8750,
  hsaCatchup55: 1000,
  iraLimit: 7500,
  iraCatchup50: 1100,
} as const;

/**
 * 2026 Roth IRA MAGI phase-out ranges [start, end] — the contribution reduces
 * linearly to $0 across the range. MFS assumes the taxpayer lived with their
 * spouse, which is the punitive $0–$10,000 band.
 */
export const ROTH_PHASEOUT: Record<FilingStatus, [number, number]> = {
  single: [153000, 168000],
  hoh: [153000, 168000],
  mfj: [242000, 252000],
  mfs: [0, 10000],
};

/**
 * 2026 QBI phase-out ranges [start, end], measured on taxable income *before*
 * the QBI deduction.
 *
 * Modelled as a specified service trade or business (SSTB) — the usual
 * treatment for a content creator — so the deduction slides linearly to $0
 * across the range rather than falling back on the wage/property limit. Under
 * the OBBBA permanent rules the phase-in span is $75,000 (single, HOH, MFS)
 * and $150,000 (MFJ). Verify against the IRS release.
 */
export const QBI_PHASEOUT: Record<FilingStatus, [number, number]> = {
  single: [201750, 276750],
  hoh: [201750, 276750],
  mfs: [201750, 276750],
  mfj: [403500, 553500],
};

/** The share of the QBI deduction that survives the SSTB phase-out. */
export function qbiPct(preQBI: number, status: FilingStatus): number {
  const [lo, hi] = QBI_PHASEOUT[status];
  if (preQBI <= lo) return 1;
  if (preQBI >= hi) return 0;
  return 1 - (preQBI - lo) / (hi - lo);
}

/* ─────────────────────────── core estimate ─────────────────────────── */

export interface TaxScenario {
  /** Business net profit (revenue less write-offs). */
  net: number;
  status: FilingStatus;
  state: string;
  /** W-2 and any other household taxable income. */
  other?: number;
  /** Above-the-line deduction — retirement. Cuts income tax, never SE tax. */
  adjust?: number;
  /** Off models a client who itemises or is otherwise ineligible. */
  useStd?: boolean;
  useQBI?: boolean;
}

export interface TaxResult {
  seTax: number;
  fed: number;
  stateTax: number;
  total: number;
  taxable: number;
  /** The single federal bracket the taxable income lands in. */
  fedRate: number;
  /** Taxable income before the QBI deduction — what the phase-out is read off. */
  preQBI: number;
  qbiDed: number;
  /** 1 = fully available, 0 = fully phased out. */
  qbiPct: number;
}

/**
 * SE + federal + state tax for one scenario.
 *
 * The SS portion of SE tax is capped against the wage base *net of* `other`,
 * because W-2 wages already consumed part of that base — without it a creator
 * with a day job is overcharged social security on their business income.
 */
export function estimateTax(s: TaxScenario): TaxResult {
  const net = Math.max(0, s.net);
  const other = Math.max(0, s.other ?? 0);
  const adjust = Math.max(0, s.adjust ?? 0);
  const useStd = s.useStd !== false;
  const useQBI = s.useQBI !== false;

  const seBase = net * SE.netAdj;
  const ss = Math.min(seBase, Math.max(0, SS_WAGE_BASE - other)) * SE.ss;
  const seTax = ss + seBase * SE.medicare;
  const halfSE = seTax / 2;

  const totalAGI = Math.max(0, net - halfSE - adjust) + other;
  const preQBI = Math.max(0, totalAGI - (useStd ? STD_DED[s.status] : 0));
  // A retirement contribution is an adjustment to income, so it shrinks the
  // qualified business income the 20% is taken on as well as the tax base.
  const qbiIncome = Math.max(0, net - halfSE - adjust);
  const pct = qbiPct(preQBI, s.status);
  const qbi = useQBI
    ? Math.min(TAX.qbiRate * qbiIncome * pct, TAX.qbiRate * preQBI)
    : 0;
  const taxable = Math.max(0, preQBI - qbi);

  const brackets = TAX.fedBrackets[s.status];
  const fed = marginal(taxable, brackets);
  const stateTax = stateTaxFor(Math.max(0, totalAGI), s.state, s.status);

  return {
    seTax,
    fed,
    stateTax,
    total: seTax + fed + stateTax,
    taxable,
    fedRate: marginalRate(taxable, brackets),
    preQBI,
    qbiDed: qbi,
    qbiPct: pct,
  };
}

/** Federal-only marginal rate for an already-computed taxable income. */
export function fedMarginalRate(taxable: number, status: FilingStatus): number {
  return marginalRate(taxable, TAX.fedBrackets[status]);
}

/* ──────────────────────── retirement plan room ─────────────────────── */

/**
 * The elective-deferral catch-up for an age. SECURE 2.0 gives 60–63 a larger
 * "super" catch-up and puts 64+ back on the ordinary one — not a typo.
 */
export function deferralCatchup(
  age: number,
  cu: number = LIMITS.deferralCatchup50,
  superCu: number = LIMITS.deferralCatchup60,
): number {
  if (age >= 60 && age <= 63) return superCu;
  if (age >= 50) return cu;
  return 0;
}

/** Reduce a Roth base contribution across the MAGI phase-out band. */
export function rothAllowed(
  base: number,
  magi: number,
  [lo, hi]: [number, number],
): number {
  if (magi <= lo) return base;
  if (magi >= hi) return 0;
  let r = (base * (hi - magi)) / (hi - lo);
  r = Math.floor(r / 10) * 10; // the IRS rounds down to the nearest $10
  if (r > 0 && r < 200) r = 200; // …and floors a non-zero result at $200
  return r;
}

/* ───────────────── failure-to-file / failure-to-pay ────────────────── */

export const PENALTY = {
  /** Failure-to-file: 5%/mo, capped at 25% of the balance. */
  ftf: 0.05,
  ftfMax: 0.25,
  /** Failure-to-pay: 0.5%/mo, capped at 25%. */
  ftp: 0.005,
  ftpMax: 0.25,
  /** Underpayment interest, compounded daily. */
  interest: 0.08,
  /** Minimum FTF once a return is more than 60 days late (2026 — verify). */
  minFtf: 510,
} as const;

/** Whole months late, counting any started month as a full one (IRS rule). */
export function monthsLate(due: Date, now: Date): number {
  if (now <= due) return 0;
  let m =
    (now.getFullYear() - due.getFullYear()) * 12 +
    (now.getMonth() - due.getMonth());
  if (now.getDate() > due.getDate()) m += 1;
  return Math.max(0, m);
}

export interface PenaltyResult {
  ftf: number;
  ftp: number;
  interest: number;
  total: number;
  origDue: Date;
  fileDue: Date;
}

/**
 * Federal late-filing exposure on `base` of unpaid tax for one tax year.
 *
 * An extension moves the *filing* deadline six months but never the *paying*
 * one, so failure-to-pay and interest still run from April either way — that
 * asymmetry is the whole point of the card this feeds.
 */
export function penaltyFor(
  base: number,
  taxYear: number,
  ext: boolean,
  now: Date,
): PenaltyResult {
  const origDue = new Date(taxYear + 1, 3, 15); // Apr 15 of the following year
  const extDue = new Date(taxYear + 1, 9, 15); // Oct 15 with an extension
  const fileDue = ext ? extDue : origDue;

  const ftfM = Math.min(5, monthsLate(fileDue, now));
  const ftpM = Math.min(50, monthsLate(origDue, now));
  // In months where both run, FTF is reduced by the FTP rate rather than stacked.
  const ftfRate = ftpM > 0 ? PENALTY.ftf - PENALTY.ftp : PENALTY.ftf;

  let ftf = base * Math.min(PENALTY.ftfMax, ftfM * ftfRate);
  const daysLateFile = (now.getTime() - fileDue.getTime()) / 86400000;
  if (base > 0 && daysLateFile > 60) {
    ftf = Math.max(ftf, Math.min(PENALTY.minFtf, base));
  }

  const ftp = base * Math.min(PENALTY.ftpMax, ftpM * PENALTY.ftp);
  const days = Math.max(0, (now.getTime() - origDue.getTime()) / 86400000);
  const interest = base * (Math.pow(1 + PENALTY.interest / 365, days) - 1);

  return { ftf, ftp, interest, total: ftf + ftp + interest, origDue, fileDue };
}

/** The most recent tax year whose return is already overdue as of `now`. */
export function latestLateYear(now: Date): number {
  const y = now.getFullYear();
  return now >= new Date(y, 3, 15) ? y - 1 : y - 2;
}
