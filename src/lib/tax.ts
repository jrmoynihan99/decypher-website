/**
 * Creator tax estimator — config + math, ported from the design prototype.
 * A CPA can edit the TAX tables without touching the logic below them.
 */

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";
export type EntityType = "soleprop" | "smllc" | "scorp" | "ccorp";

/** [lower bound, marginal rate] */
type Bracket = [number, number];

interface StateRule {
  none?: boolean;
  flat?: number;
  b?: Bracket[];
  surOver?: number;
  surRate?: number;
}

export const ESTIMATOR_CONFIG = {
  firmName: "DeCypher Financials",
  bookingUrl: "https://wedecypher.co/schedule-team",
};

export const TAX = {
  year: 2026,
  ssWageBase: 184500,
  stdDed: { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150 } as Record<
    FilingStatus,
    number
  >,
  applyQBI: true,
  qbiRate: 0.2,
  seRate: { ss: 0.124, medicare: 0.029, netAdj: 0.9235 },
  // Strategy modeling limits (2026 estimates — CPA-editable).
  // These drive the internal savings range only; specifics are never shown.
  strat: {
    solo401kDeferral: 24500, // employee elective deferral
    dcCap: 72000, // combined defined-contribution cap
    iraLimit: 7500, // traditional IRA deduction (pre-phaseout)
    hsaSelf: 4400,
    hsaFamily: 8750,
    scorpMinNet: 60000, // only model S-corp above this net profit
    scorpSalaryRate: 0.45, // reasonable-comp heuristic (share of net profit)
    targetExpenseRatio: 0.35, // well-optimized creator expense ratio
    homeOfficeDeduction: 1500, // simplified-method home office estimate
    maxSavingsFraction: 0.6, // credibility ceiling for the high end
  },
  fedBrackets: {
    single: [
      [0, 0.1],
      [12400, 0.12],
      [50400, 0.22],
      [105700, 0.24],
      [201775, 0.32],
      [256225, 0.35],
      [640600, 0.37],
    ],
    mfj: [
      [0, 0.1],
      [24800, 0.12],
      [100800, 0.22],
      [211400, 0.24],
      [403550, 0.32],
      [512450, 0.35],
      [768700, 0.37],
    ],
    mfs: [
      [0, 0.1],
      [12400, 0.12],
      [50400, 0.22],
      [105700, 0.24],
      [201775, 0.32],
      [256225, 0.35],
      [384350, 0.37],
    ],
    hoh: [
      [0, 0.1],
      [17700, 0.12],
      [67450, 0.22],
      [105700, 0.24],
      [201775, 0.32],
      [256200, 0.35],
      [640600, 0.37],
    ],
  } as Record<FilingStatus, Bracket[]>,
  states: {
    Alabama: { b: [[0, 0.02], [500, 0.04], [3000, 0.05]] },
    Alaska: { none: true },
    Arizona: { flat: 0.025 },
    Arkansas: { b: [[0, 0], [5500, 0.02], [11000, 0.03], [91801, 0.039]] },
    California: {
      b: [
        [0, 0.01],
        [10756, 0.02],
        [25499, 0.04],
        [40245, 0.06],
        [55866, 0.08],
        [70606, 0.093],
        [360659, 0.103],
        [432787, 0.113],
        [721314, 0.123],
      ],
      surOver: 1000000,
      surRate: 0.01,
    },
    Colorado: { flat: 0.044 },
    Connecticut: {
      b: [
        [0, 0.02],
        [10000, 0.045],
        [50000, 0.055],
        [100000, 0.06],
        [200000, 0.065],
        [250000, 0.069],
        [500000, 0.0699],
      ],
    },
    Delaware: {
      b: [
        [0, 0],
        [2000, 0.022],
        [5000, 0.039],
        [10000, 0.048],
        [20000, 0.052],
        [25000, 0.0555],
        [60000, 0.066],
      ],
    },
    "District of Columbia": {
      b: [
        [0, 0.04],
        [10000, 0.06],
        [40000, 0.065],
        [60000, 0.085],
        [250000, 0.0925],
        [500000, 0.0975],
        [1000000, 0.1075],
      ],
    },
    Florida: { none: true },
    Georgia: { flat: 0.0539 },
    Hawaii: {
      b: [
        [0, 0.014],
        [2400, 0.032],
        [4800, 0.055],
        [9600, 0.064],
        [14400, 0.068],
        [19200, 0.072],
        [24000, 0.076],
        [36000, 0.079],
        [48000, 0.0825],
        [150000, 0.09],
        [175000, 0.1],
        [200000, 0.11],
      ],
    },
    Idaho: { flat: 0.05695 },
    Illinois: { flat: 0.0495 },
    Indiana: { flat: 0.0305 },
    Iowa: { flat: 0.038 },
    Kansas: { b: [[0, 0.0258], [23000, 0.0558]] },
    Kentucky: { flat: 0.04 },
    Louisiana: { flat: 0.03 },
    Maine: { b: [[0, 0.058], [26050, 0.0675], [61600, 0.0715]] },
    Maryland: {
      b: [
        [0, 0.02],
        [1000, 0.03],
        [2000, 0.04],
        [3000, 0.0475],
        [100000, 0.05],
        [125000, 0.0525],
        [150000, 0.055],
        [250000, 0.0575],
      ],
    },
    Massachusetts: { flat: 0.05, surOver: 1083150, surRate: 0.04 },
    Michigan: { flat: 0.0425 },
    Minnesota: {
      b: [
        [0, 0.0535],
        [31690, 0.068],
        [104090, 0.0785],
        [193240, 0.0985],
      ],
    },
    Mississippi: { flat: 0.044 },
    Missouri: {
      b: [
        [0, 0],
        [1273, 0.02],
        [2546, 0.025],
        [3819, 0.03],
        [5092, 0.035],
        [6365, 0.04],
        [7638, 0.045],
        [8911, 0.047],
      ],
    },
    Montana: { b: [[0, 0.047], [20500, 0.059]] },
    Nebraska: {
      b: [
        [0, 0.0246],
        [3700, 0.0351],
        [22170, 0.0501],
        [35730, 0.0584],
      ],
    },
    Nevada: { none: true },
    "New Hampshire": { none: true },
    "New Jersey": {
      b: [
        [0, 0.014],
        [20000, 0.0175],
        [35000, 0.035],
        [40000, 0.05525],
        [75000, 0.0637],
        [500000, 0.0897],
        [1000000, 0.1075],
      ],
    },
    "New Mexico": {
      b: [
        [0, 0.017],
        [5500, 0.032],
        [11000, 0.047],
        [16000, 0.049],
        [210000, 0.059],
      ],
    },
    "New York": {
      b: [
        [0, 0.04],
        [8500, 0.045],
        [11700, 0.0525],
        [13900, 0.055],
        [80650, 0.06],
        [215400, 0.0685],
        [1077550, 0.0965],
        [5000000, 0.103],
        [25000000, 0.109],
      ],
    },
    "North Carolina": { flat: 0.0425 },
    "North Dakota": { b: [[0, 0], [47150, 0.0195], [238200, 0.025]] },
    Ohio: { b: [[0, 0], [26050, 0.0275], [100000, 0.035]] },
    Oklahoma: {
      b: [
        [0, 0.0025],
        [1000, 0.0075],
        [2500, 0.0175],
        [3750, 0.0275],
        [4900, 0.0375],
        [7200, 0.0475],
      ],
    },
    Oregon: {
      b: [
        [0, 0.0475],
        [4300, 0.0675],
        [10750, 0.0875],
        [125000, 0.099],
      ],
    },
    Pennsylvania: { flat: 0.0307 },
    "Rhode Island": { b: [[0, 0.0375], [77450, 0.0475], [176050, 0.0599]] },
    "South Carolina": { b: [[0, 0], [3460, 0.03], [17330, 0.062]] },
    "South Dakota": { none: true },
    Tennessee: { none: true },
    Texas: { none: true },
    Utah: { flat: 0.0455 },
    Vermont: {
      b: [
        [0, 0.0335],
        [45400, 0.066],
        [110050, 0.076],
        [229550, 0.0875],
      ],
    },
    Virginia: { b: [[0, 0.02], [3000, 0.03], [5000, 0.05], [17000, 0.0575]] },
    Washington: { none: true },
    "West Virginia": {
      b: [
        [0, 0.0222],
        [10000, 0.0296],
        [25000, 0.0333],
        [40000, 0.0444],
        [60000, 0.0482],
      ],
    },
    Wisconsin: {
      b: [
        [0, 0.035],
        [14680, 0.044],
        [29370, 0.053],
        [323290, 0.0765],
      ],
    },
    Wyoming: { none: true },
  } as Record<string, StateRule>,
};

export const STATE_NAMES = Object.keys(TAX.states);

export interface TaxInputs {
  status: FilingStatus;
  state: string;
  creator: number;
  expenses: number;
  w2: number;
  other: number;
}

export interface TaxBreakdown {
  netSE: number;
  seTax: number;
  fed: number;
  stateTax: number;
  total: number;
  taxable: number;
  fedMarginal: number;
}

export function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function marginal(base: number, b: Bracket[]): number {
  let t = 0;
  for (let i = 0; i < b.length; i++) {
    const [lo, r] = b[i];
    const hi = i + 1 < b.length ? b[i + 1][0] : Infinity;
    if (base > lo) t += (Math.min(base, hi) - lo) * r;
    else break;
  }
  return t;
}

function marginalRate(base: number, b: Bracket[]): number {
  let rate = b[0][1];
  for (let i = 0; i < b.length; i++) {
    if (base > b[i][0]) rate = b[i][1];
    else break;
  }
  return rate;
}

function stateTaxFor(base: number, name: string, status: FilingStatus): number {
  const s = TAX.states[name];
  if (!s || s.none) return 0;
  if (s.flat != null) {
    let t = base * s.flat;
    if (s.surOver && base > s.surOver) t += (base - s.surOver) * s.surRate!;
    return t;
  }
  let b = s.b!;
  if (status === "mfj") b = b.map((r) => [r[0] * 2, r[1]]);
  let tt = marginal(base, b);
  if (s.surOver && base > s.surOver) tt += (base - s.surOver) * s.surRate!;
  return tt;
}

export function stateHasTax(name: string): boolean {
  const s = TAX.states[name];
  return !!(s && !s.none);
}

/**
 * Compute SE + federal + state tax for the given inputs. `deduction` is an
 * above-the-line deduction: it lowers the income-tax base, not SE tax.
 */
export function computeTax(inp: TaxInputs, deduction = 0): TaxBreakdown {
  const netSE = Math.max(0, inp.creator - inp.expenses);
  const seBase = netSE * TAX.seRate.netAdj;
  const ssRoom = Math.max(0, TAX.ssWageBase - inp.w2); // W-2 wages already use SS base
  const ss = Math.min(seBase, ssRoom) * TAX.seRate.ss;
  const med = seBase * TAX.seRate.medicare;
  const seTax = ss + med;
  const halfSE = seTax / 2;

  const combined = netSE + inp.w2 + inp.other;
  const preQBI = Math.max(
    0,
    combined - halfSE - deduction - TAX.stdDed[inp.status],
  );
  const qbiDed = TAX.applyQBI
    ? Math.min(
        TAX.qbiRate * Math.max(0, netSE - halfSE),
        TAX.qbiRate * preQBI,
      )
    : 0;
  const taxable = Math.max(0, preQBI - qbiDed);
  const fed = marginal(taxable, TAX.fedBrackets[inp.status]);

  const stateBase = Math.max(0, combined - halfSE - deduction);
  const stateTax = stateTaxFor(stateBase, inp.state, inp.status);

  return {
    netSE,
    seTax,
    fed,
    stateTax,
    total: seTax + fed + stateTax,
    taxable,
    fedMarginal: marginalRate(taxable, TAX.fedBrackets[inp.status]),
  };
}

/**
 * Produce a low–high range of *potential* savings:
 *   low  = modest retirement contribution + HSA + home office
 *   high = S-corp SE-tax savings + maxed retirement + HSA + captured write-offs
 * Write-offs (and home office) cut BOTH self-employment tax and income tax, so
 * an under-claimed expense ratio pushes the high end up substantially.
 * The specific strategies are intentionally NOT surfaced to the user.
 */
export function computeStrategies(
  inp: TaxInputs,
  base: TaxBreakdown,
  alreadySCorp: boolean,
): { low: number; high: number } {
  const st = TAX.strat;
  const netSE = base.netSE;
  const incomeCap = netSE + inp.w2 + inp.other;

  function saveFromDeduction(d: number): number {
    d = Math.max(0, Math.min(d, incomeCap));
    if (d <= 0) return 0;
    return Math.max(0, base.total - computeTax(inp, d).total);
  }
  // Additional business expenses reduce net profit → cut SE tax AND income/state tax.
  function saveFromWriteoffs(extra: number): number {
    extra = Math.max(0, extra);
    if (extra <= 0) return 0;
    return Math.max(
      0,
      base.total - computeTax({ ...inp, expenses: inp.expenses + extra }).total,
    );
  }

  const hsaLimit = inp.status === "mfj" ? st.hsaFamily : st.hsaSelf;

  // Retirement deduction room
  const employerRoom = Math.max(0, 0.2 * (netSE - base.seTax / 2));
  let retireLow: number;
  let retireHigh: number;
  if (netSE > 0) {
    retireLow = Math.min(st.solo401kDeferral, netSE);
    retireHigh = Math.min(st.solo401kDeferral + employerRoom, st.dcCap, netSE);
  } else {
    // IRA only, no SE plan
    retireLow = retireHigh = Math.min(
      st.iraLimit,
      Math.max(0, inp.w2 + inp.other),
    );
  }

  // Missed write-offs: gap between current expense ratio and a well-optimized
  // one, plus a home-office estimate. Bigger when they're under-claiming.
  const expRatio = inp.creator > 0 ? inp.expenses / inp.creator : 0;
  const writeoffRoom =
    inp.creator > 0 && expRatio < st.targetExpenseRatio
      ? (st.targetExpenseRatio - expRatio) * inp.creator
      : 0;
  const homeOffice = inp.creator > 0 ? st.homeOfficeDeduction : 0;

  // S-corp self-employment tax savings (only where it's plausibly worth it,
  // and only if they haven't already elected — otherwise it's not "potential")
  let scorp = 0;
  if (!alreadySCorp && netSE >= st.scorpMinNet && inp.creator > 0) {
    const salary = Math.min(
      netSE,
      Math.round((netSE * st.scorpSalaryRate) / 1000) * 1000,
    );
    const payroll =
      Math.min(salary, TAX.ssWageBase) * TAX.seRate.ss +
      salary * TAX.seRate.medicare;
    scorp = Math.max(0, base.seTax - payroll);
  }

  const low =
    saveFromDeduction(retireLow + hsaLimit) + saveFromWriteoffs(homeOffice);
  let high =
    scorp +
    saveFromDeduction(retireHigh + hsaLimit) +
    saveFromWriteoffs(writeoffRoom + homeOffice);
  high = Math.min(high, base.total * st.maxSavingsFraction); // keep the high end credible
  if (high < low) high = low;
  return { low: Math.round(low), high: Math.round(high) };
}

/* ===================== the full estimate ===================== */

/**
 * Net profit above which we *tell* someone the S-corp conversation is worth
 * having. Deliberately below TAX.strat.scorpMinNet (the point where we start
 * modelling S-corp savings into the range): the advice is "worth discussing",
 * the modelling is "we'd put a number on it". A lead between the two sees the
 * recommendation with no S-corp contribution in their savings range.
 */
export const SCORP_ADVICE_MIN_NET = 55000;

/** Everything the estimator asks for. Extends the pure tax inputs. */
export interface EstimateInputs extends TaxInputs {
  paid: number;
  fulltime: boolean;
  entity: EntityType | "unanswered";
  sCorp: boolean;
  sCorpSalary: number | null;
  sCorpSalaryStatus: string;
  sCorpNoPayroll: boolean;
}

export interface EstimateResult extends TaxBreakdown {
  bizTax: number;
  setAside: number;
  effRate: number;
  afterTax: number;
  totalIncome: number;
  savingsLow: number;
  savingsHigh: number;
  /** Derived risk flags — drive the recommendations. */
  solePropRisk: boolean;
  needSCorp: boolean;
}

/**
 * The estimate behind both the widget and the emailed copy. It lives here, not
 * in the component, because the server rebuilds it from the same raw inputs
 * when it sends the email: the browser's numbers are never trusted, and the
 * email can't drift from what the visitor saw on screen.
 */
export function buildEstimate(inputs: EstimateInputs): EstimateResult {
  const r = computeTax(inputs);

  // business-attributable tax (marginal on the creator income)
  const rNoBiz = computeTax({ ...inputs, creator: 0, expenses: 0 });
  const bizTax = Math.max(0, r.total - rNoBiz.total);
  const setAside = r.netSE > 0 ? Math.min(60, (bizTax / r.netSE) * 100) : 0;

  const totalIncome = r.netSE + inputs.w2 + inputs.other;
  const effRate = totalIncome > 0 ? (r.total / totalIncome) * 100 : 0;
  const afterTax = totalIncome - r.total;

  // Already an S-corp? Don't count S-corp election as "potential" savings.
  const strat = computeStrategies(inputs, r, inputs.sCorp);

  return {
    ...r,
    bizTax,
    setAside,
    effRate,
    afterTax,
    totalIncome,
    savingsLow: strat.low,
    savingsHigh: strat.high,
    solePropRisk: inputs.entity === "soleprop" && inputs.creator > 20000,
    needSCorp:
      r.netSE > SCORP_ADVICE_MIN_NET &&
      (inputs.entity === "soleprop" || inputs.entity === "smllc"),
  };
}
