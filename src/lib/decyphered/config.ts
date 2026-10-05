/**
 * Every business decision about the DeCyphered video lives here. Changing a
 * number shown to clients = changing this file, with sign-off from
 * accounting. Ported from the advisor's kit; changes are marked.
 */

export const BRAND = {
  name: "DeCypher Financials",
  // confirmed 2026-10-05: instagram.com/we.decypher
  handle: "@we.decypher",
};

// CHANGED (port): the kit's REFERRAL block ($250 off / $750 credit) is gone.
// There are no tracked referral links yet; the poster's incentive (a $50
// Visa for tagging us) is on the recap page, not in the video.

/**
 * How the before/after tax burden is put.
 * "cents_per_dollar": tax ÷ the BEFORE return's total income (Form 1040 line 9) on both
 *                     versions, as cents of every dollar (Carpenter: 29¢ → 13¢)  [decided 2026-10-05]
 * "own_total_income": tax ÷ Form 1040 line 9 on each version, as a rate (Carpenter: 29% → 21%)
 * "headline_income":  tax ÷ the recap page's income figure on both versions, as a rate
 * The recap page and the PDF show the same figure (centsPerDollar), so the three never disagree.
 */
export const RATE_METHOD: "cents_per_dollar" | "own_total_income" | "headline_income" = "cents_per_dollar";

/** Schedule C Part II line → creator-friendly bucket. Unused until the write-offs scene returns. */
export const LINE_GROUPS: Record<string, string> = {
  advertising: "Marketing & ads",
  car_truck: "Car & mileage",
  commissions_fees: "Marketing & ads",
  contract_labor: "Team & contractors",
  wages: "Team & contractors",
  employee_benefits: "Team & contractors",
  pension_profit_sharing: "Team & contractors",
  depreciation: "Other business costs",
  insurance: "Office & admin",
  interest: "Other business costs",
  legal_professional: "Pros & advisors",
  office_expense: "Office & admin",
  rent_lease: "Home studio",
  repairs: "Repairs & upkeep",
  supplies: "Production & gear",
  taxes_licenses: "Office & admin",
  travel: "Travel & meals",
  meals: "Travel & meals",
  utilities: "Office & admin",
  home_office: "Home studio",
};

/** Schedule C Part V "other expenses" descriptions → bucket, first match wins. */
export const OTHER_EXPENSE_RULES: [RegExp, string][] = [
  [/video|production|editing|shoot|studio|props|wardrobe|styling/i, "Production & gear"],
  [/equipment|gear|camera|lighting|computer/i, "Production & gear"],
  [/software|subscription|app|saas/i, "Production & gear"],
  [/telecom|phone|internet|cell/i, "Office & admin"],
  [/bank|merchant|processing|fee/i, "Office & admin"],
  [/education|course|coaching|training/i, "Learning"],
  [/contractor|editor|assistant|manager/i, "Team & contractors"],
];
export const OTHER_BUCKET = "Other business costs";

/**
 * Strategy kinds from the recap page's savings waterfall.
 * label = how the creator says it; group = which tax personality it counts toward.
 * hidden = counts in the total but is never named in the video or toward a personality.
 */
export const STRATEGIES: Record<string, { label: string; group: string; hidden?: boolean }> = {
  bookkeeping_writeoffs: { label: "Year-round bookkeeping", group: "writeoffs" },
  home_office: { label: "Home office deduction", group: "home" },
  rental_expenses: { label: "Rental property write-offs", group: "realestate" },
  re_professional: { label: "Real estate professional status", group: "realestate" },
  cost_segregation: { label: "Cost segregation", group: "realestate" },
  s_corp: { label: "S-corp election", group: "scorp" },
  reasonable_salary: { label: "S-corp payroll setup", group: "scorp" },
  solo_401k: { label: "Solo 401(k) contributions", group: "retirement" },
  sep_ira: { label: "SEP IRA contributions", group: "retirement" },
  backdoor_roth: { label: "Backdoor Roth IRA", group: "retirement" },
  hsa: { label: "HSA contributions", group: "retirement" },
  hire_children: { label: "Hiring my kids", group: "family" },
  augusta_rule: { label: "Augusta rule rental", group: "home" },
  se_health_insurance: { label: "Self-employed health insurance", group: "writeoffs" },
  // ADDED (port): steps the recap engine has that the kit didn't
  pte_election: { label: "Pass-through entity tax election", group: "scorp" },
  guaranteed_payments: { label: "Partner pay through the LLC", group: "writeoffs" },
  // The before doesn't claim the dependents, so they're a step in the
  // split; the kit's brief says the video never mentions kids.
  dependents: { label: "Dependents", group: "family", hidden: true },
};

/** Picked by whichever group saved the most. Never chosen by the LLM. */
export const PERSONALITIES: Record<string, { name: string; line: string }> = {
  realestate: { name: "The Empire Builder", line: "Content funds the properties. The properties shield the content." },
  writeoffs: { name: "The Receipt Keeper", line: "Every trip, tool and freelancer, found and booked." },
  scorp: { name: "The Strategist", line: "Set up like a company, taxed like one too." },
  retirement: { name: "The Future Builder", line: "Paying future me instead of the IRS." },
  home: { name: "The Home Studio Boss", line: "The studio is the house. The house is a write-off." },
  family: { name: "The Family CFO", line: "Running the household like a business." },
};

export const MAX_STRATEGIES_SHOWN = 4;
export const TOP_WRITEOFFS_SHOWN = 3;
