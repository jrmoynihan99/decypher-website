/**
 * DeCyphered: the client's recap as a vertical video to post. Ported from
 * the advisor's kit (his Oct 2026 handoff); the shapes are
 * his, with the changes marked.
 *
 * INPUT: what the recap supplies per client (fromRecap.ts builds it).
 * All amounts are whole US dollars, exactly as they appear on the recap page.
 */
export interface TaxFigures {
  creator: { name: string; handle?: string; email?: string };
  tax_year: number;
  schedule_c: {
    /** Schedule C line 1 (Form 1120-S / 1065 line 1a for an entity client) */
    gross_receipts: number;
    /** Schedule C Part II lines, keyed by the names in config.ts LINE_GROUPS. Omit zero lines. */
    lines: Record<string, number>;
    /** Schedule C Part V "Other expenses", as written on the return */
    other_expenses: { description: string; amount: number }[];
    /** Schedule C line 44a, if a vehicle was claimed */
    business_miles?: number;
  };
  /** The recap page's before/after totals. */
  totals: {
    tax_before: number;
    tax_after: number;
    /** Form 1040 line 9 on the income-only ("before") version */
    total_income_before: number;
    /** Form 1040 line 9 as filed */
    total_income_after: number;
    /** The "income" figure shown at the top of the recap page. Only used by RATE_METHOD "headline_income". */
    headline_income?: number;
    /**
     * CHANGED (port): savings that sit outside before − after — an S
     * corporation's self-employment tax avoided, which the recap page adds
     * on top. tax_before - tax_after + outside_savings must equal the sum of
     * strategy savings.
     */
    outside_savings?: number;
  };
  /** The recap page's "Savings by strategy" waterfall. kind must exist in config.ts STRATEGIES. */
  strategies: { kind: string; amount: number }[];
  /** Optional human-written line, e.g. "my monthly med-spa content days". Falls back to business miles. */
  fun_writeoff_example?: string;
  /** Creator's tracked referral link (goes in their story link sticker, not in the video). Unused: no referral links yet. */
  referral_link: string;
  /** false = percentages-only version: no income, no dollar savings, no write-off amounts */
  share_dollar_amounts: boolean;
}

/** OUTPUT of buildRecap(): the one object the video renderer reads. */
export interface RecapData {
  creator_name: string;
  creator_handle?: string;
  tax_year: number;
  creator_income: number;
  prior_effective_tax_rate: number;
  current_effective_tax_rate: number;
  estimated_tax_savings: number;
  top_writeoff_categories: { name: string; amount: number }[];
  fun_writeoff_example?: string;
  strategies_implemented: string[];
  tax_personality: { name: string; line: string };
  share_dollar_amounts: boolean;
  referral_link: string;
  brand_handle: string;
  brand_name: string;
  /** Pre-formatted strings. The ONLY numbers allowed on screen. */
  display: {
    creator_income: string;
    daily_income: string;
    estimated_tax_savings: string;
    tax_bill_cut_pct: string;
    prior_rate: string;
    current_rate: string;
    writeoffs: string[];
  };
}
