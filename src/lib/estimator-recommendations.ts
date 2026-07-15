import {
  EstimateInputs,
  EstimateResult,
  SCORP_ADVICE_MIN_NET,
  fmt,
  stateHasTax,
} from "./tax";

/**
 * The recommendation copy behind the estimator's gate — the words a lead trades
 * their email for.
 *
 * It is plain data, not JSX, for one reason: the widget renders it on screen and
 * the emailed copy renders it again in HTML, and the site promises the lead
 * "this estimate and our recommendations". Two hand-kept versions of tax copy
 * would drift the first time anyone edited one, and the drift would be invisible
 * — nobody reads the email and the page side by side. One source, two renderers.
 *
 * So: no markup here, and no styling. `lead` is the bolded opener, `body` runs
 * on after it. Callers decide what bold looks like.
 *
 * This is tax copy. Treat edits the way you'd treat edits to the tax tables in
 * lib/tax.ts — they are the firm's advice, not UI text.
 */

export type RecTone = "danger" | "strategy";

export interface RecFlag {
  key: string;
  tone: RecTone;
  icon: string;
  lead: string;
  body: string;
}

export interface RecDriver {
  key: string;
  lead: string;
  body: string;
}

export interface Recommendations {
  flags: RecFlag[];
  drivers: RecDriver[];
}

export function buildRecommendations(
  inputs: EstimateInputs,
  r: EstimateResult,
): Recommendations {
  const expRatio =
    inputs.creator > 0 ? (inputs.expenses / inputs.creator) * 100 : 0;

  const flags: RecFlag[] = [];

  if (inputs.sCorpNoPayroll) {
    flags.push({
      key: "nopayroll",
      tone: "danger",
      icon: "⚠️",
      lead: "Big red flag:",
      body:
        "you’re taxed as an S-corp but told us you don’t run payroll. S-corp " +
        "owners must pay themselves reasonable W-2 wages — no payroll is a " +
        "leading audit trigger, and back payroll taxes plus penalties add up " +
        "fast. This is the first thing to fix.",
    });
  }

  if (r.solePropRisk) {
    flags.push({
      key: "soleprop",
      tone: "danger",
      icon: "⚠️",
      lead: "Risk:",
      body:
        "you’re operating as a sole proprietor with no LLC while earning over " +
        "$20,000. That leaves your personal assets exposed with no liability " +
        "protection, and you’re likely leaving tax structure on the table. " +
        "Forming an LLC is usually the first move.",
    });
  }

  if (r.needSCorp) {
    const llcLine =
      inputs.entity === "soleprop"
        ? "You don’t have an LLC yet, so that’s step one — an S-corp election should never be made without forming the LLC first."
        : "You already have the LLC in place, so the S-corp election could be the next step.";
    flags.push({
      key: "scorp",
      tone: "strategy",
      icon: "💡",
      lead: "Tax strategy — the S-corp:",
      body:
        `at over $${SCORP_ADVICE_MIN_NET.toLocaleString("en-US")} in net ` +
        "profit, you’re in the range where an S-corp election typically starts " +
        "to save real money on self-employment tax. Timing matters — done " +
        `prematurely, the costs can outweigh the savings. ${llcLine} Getting ` +
        "the sequence and timing right is exactly what a consultation covers.",
    });
  }

  const drivers: RecDriver[] = [
    {
      key: "se",
      lead: `${fmt(r.seTax)} self-employment tax.`,
      body:
        "This is the 15.3% Social Security + Medicare tax. W-2 employees split " +
        "it with an employer; on your business profit you cover both halves.",
    },
    {
      key: "fed",
      lead: `${Math.round(r.fedMarginal * 100)}% federal bracket.`,
      body:
        `Your estimated federal income tax is ${fmt(r.fed)} after the standard ` +
        "deduction and the 20% qualified business income deduction.",
    },
    stateHasTax(inputs.state)
      ? {
          key: "state",
          lead: `${fmt(r.stateTax)} to ${inputs.state}.`,
          body:
            "State income tax on your business profit. Where you live can move " +
            "this number significantly.",
        }
      : {
          key: "state",
          lead: `${inputs.state} has no state income tax.`,
          body:
            "One less layer on your creator income — that’s already working in " +
            "your favor.",
        },
  ];

  if (inputs.creator > 0 && expRatio < 20) {
    drivers.push({
      key: "exp",
      lead: `Expenses are only ${Math.round(expRatio)}% of revenue.`,
      body:
        "A low expense ratio usually means deductions are being left on the " +
        "table — one of the first things worth a closer look.",
    });
  }

  drivers.push({
    key: "aside",
    lead: `Set aside about ${Math.round(r.setAside)}% of every business dollar.`,
    body:
      "Moving that to a separate account as you get paid is the simplest way to " +
      "avoid an April surprise.",
  });

  if (r.savingsHigh > 0) {
    drivers.push({
      key: "savings",
      lead: `${fmt(r.savingsLow)}–${fmt(r.savingsHigh)} in potential savings.`,
      body:
        "We’ve run the strategies that could apply to a situation like yours. " +
        "Which ones fit — and how to put them in place — is exactly what your " +
        "consultation covers.",
    });
  }

  return { flags, drivers };
}
