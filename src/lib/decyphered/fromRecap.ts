import { computeRecap } from "@/lib/tax-recap/compute";
import type { RecapDoc, VideoVariant } from "@/lib/tax-recap/schema";
import { buildRecap, RecapInputError } from "./buildRecap";
import type { RecapData, TaxFigures } from "./types";

/**
 * A saved recap → the advisor's TaxFigures → RecapData, the one object the
 * video draws. Every figure is one the recap page already shows: the
 * before and after totals, each side's total income, the strategy split,
 * and the S corporation's self-employment tax estimate on top. Unknown
 * strategy steps fail loudly rather than vanish from the total.
 *
 * Isomorphic: the builder renders from it, the recap page checks the
 * stored video's hash against it.
 */

/** The engine's step keys (derive.ts Scenario + "kids") → the kit's strategy kinds. */
const KIND_BY_KEY: Record<string, string> = {
  kids: "dependents",
  expenses: "bookkeeping_writeoffs",
  writeOffs: "bookkeeping_writeoffs",
  homeOffice: "home_office",
  rentalExpenses: "rental_expenses",
  reps: "re_professional",
  salary: "reasonable_salary",
  retirement: "solo_401k",
  pte: "pte_election",
  healthInsurance: "se_health_insurance",
  guaranteedPayments: "guaranteed_payments",
};

/** Recaps saved before steps carried keys: the same mapping by label. */
const KIND_BY_LABEL: [RegExp, string][] = [
  [/^Claiming your/, "dependents"],
  [/^Bookkeeping: business write-offs/, "bookkeeping_writeoffs"],
  [/^Home office/, "home_office"],
  [/^Bookkeeping: rental expenses/, "rental_expenses"],
  [/^Real estate professional status/, "re_professional"],
  [/^Owner salary/, "reasonable_salary"],
  [/^Solo 401\(k\)/, "solo_401k"],
  [/^Pass-through entity elective tax/, "pte_election"],
  [/^Health insurance through the partnership/, "se_health_insurance"],
  [/^Guaranteed payments/, "guaranteed_payments"],
];

type RecapLike = Pick<
  RecapDoc,
  "clientName" | "taxYear" | "before" | "after" | "entityBefore" | "entityAfter" | "priorYearIncome" | "analysis"
>;

export function toTaxFigures(recap: RecapLike, variant: VideoVariant): TaxFigures {
  const c = computeRecap(recap);
  const attribution = recap.analysis?.attribution ?? [];
  if (!attribution.length) throw new RecapInputError("This recap has no savings-by-strategy split to build the video from.");
  const strategies = attribution.map((a) => {
    const kind = (a.key && KIND_BY_KEY[a.key]) || KIND_BY_LABEL.find(([re]) => re.test(a.label))?.[1];
    if (!kind) throw new RecapInputError(`No video strategy for "${a.label}". Add it to fromRecap.ts.`);
    return { kind, amount: a.savings };
  });
  const scorp = recap.analysis?.scorpSavings?.amount ?? 0;
  if (scorp > 0) strategies.push({ kind: "s_corp", amount: scorp });
  const firstName = recap.clientName.trim().split(/\s+/)[0] || recap.clientName;
  return {
    creator: { name: firstName },
    tax_year: recap.taxYear,
    schedule_c: { gross_receipts: c.receipts, lines: {}, other_expenses: [] },
    totals: {
      tax_before: c.before.totalTaxes,
      tax_after: c.after.totalTaxes,
      total_income_before: c.before.grossIncome,
      total_income_after: c.after.grossIncome,
      headline_income: c.currentYearIncome,
      outside_savings: scorp,
    },
    strategies,
    referral_link: "",
    share_dollar_amounts: variant === "dollars",
  };
}

export function recapDataFor(recap: RecapLike, variant: VideoVariant): RecapData {
  return buildRecap(toTaxFigures(recap, variant));
}

/**
 * What the stored video was made from, as a short hash: both cuts' RecapData
 * plus the renderer's version. A recap whose numbers moved since the video
 * was rendered hashes differently, and the page holds the video back.
 */
export function videoHash(recap: RecapLike): string {
  const s = JSON.stringify([RENDER_VERSION, recapDataFor(recap, "dollars"), recapDataFor(recap, "percent")]);
  // cyrb53: small, fast, stable across server and browser
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Bump when the video's look changes, so stored videos re-render on the next save. */
export const RENDER_VERSION = "2";

/** True when the recap's stored video still matches its numbers. */
export function videoIsCurrent(recap: RecapLike & Pick<RecapDoc, "video">): boolean {
  if (!recap.video) return false;
  try {
    return recap.video.hash === videoHash(recap);
  } catch {
    return false;
  }
}
