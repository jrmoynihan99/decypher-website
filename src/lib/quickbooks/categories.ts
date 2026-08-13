/**
 * Canonical finance categories, and the rules that map a client's QuickBooks
 * accounts onto them.
 *
 * Why this module exists: every creator's books are a SEPARATE QuickBooks
 * company file with its own chart of accounts. One client's "Software", the
 * next one's "Subscriptions & Tools" and a third's "SaaS" are the same expense,
 * so summing raw account names across clients produces garbage. The aggregate
 * row needs a shared vocabulary; this is it.
 *
 * The join key is Intuit's `AccountSubType` — a closed enum assigned through
 * QuickBooks' own account-type picker, so it's populated even in sloppily kept
 * books, and it means the same thing in every company file.
 *
 * The asymmetry that shapes everything below: subtypes work well for EXPENSES
 * and badly for INCOME. QuickBooks has no subtype that distinguishes AdSense
 * from a brand deal from merch — they all land in SalesOfProductIncome or
 * ServiceFeeIncome. So per-creator revenue streams keep their RAW account names
 * (that's the feature the firm actually wants), and the aggregate's income
 * breakdown is driven by the firm-maintained override map instead. Overrides
 * are load-bearing here, not a nicety.
 *
 * Isomorphic on purpose — the parser, the aggregate and the UI legend all read
 * these same constants, so they agree by construction. No imports, no I/O.
 */

export const CATEGORY_KEYS = [
  // ── income ──
  "platform-revenue",
  "brand-deals",
  "affiliate",
  "merch",
  "subscriptions-income",
  "other-income",
  // ── expense ──
  "contractors",
  "software",
  "advertising",
  "equipment",
  "travel",
  "meals",
  "office",
  "professional-fees",
  "payroll",
  "rent",
  "insurance",
  "taxes-licenses",
  "bank-fees",
  "education",
  "cost-of-sales",
  "other-expense",
  /* Owner spending that runs through the business books but isn't an
     operating expense. No subtype maps here by default — it's assigned
     through the mapping screen's overrides — and the expense ledger lists
     it separately so operating spend stays clean. */
  "personal",
  // ── the fallback, valid on either side ──
  "uncategorized",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export type CategorySide = "income" | "expense";

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  "platform-revenue": "Platform revenue",
  "brand-deals": "Brand deals",
  affiliate: "Affiliate",
  merch: "Merch & products",
  "subscriptions-income": "Fan subscriptions",
  "other-income": "Other income",
  contractors: "Contractors & talent",
  software: "Software & subscriptions",
  advertising: "Advertising & promotion",
  equipment: "Equipment & gear",
  travel: "Travel",
  meals: "Meals & entertainment",
  office: "Office & admin",
  "professional-fees": "Legal & professional",
  payroll: "Payroll",
  rent: "Rent & facilities",
  insurance: "Insurance",
  "taxes-licenses": "Taxes & licences",
  "bank-fees": "Bank & merchant fees",
  education: "Education & training",
  "cost-of-sales": "Cost of sales",
  "other-expense": "Other expenses",
  personal: "Personal (non-operating)",
  uncategorized: "Uncategorised",
};

/**
 * Which side of the P&L a category may be offered on. `uncategorized` is "both"
 * because it's the never-drop-a-line fallback — see resolveCategory().
 */
export const CATEGORY_SIDE: Record<CategoryKey, CategorySide | "both"> = {
  "platform-revenue": "income",
  "brand-deals": "income",
  affiliate: "income",
  merch: "income",
  "subscriptions-income": "income",
  "other-income": "income",
  contractors: "expense",
  software: "expense",
  advertising: "expense",
  equipment: "expense",
  travel: "expense",
  meals: "expense",
  office: "expense",
  "professional-fees": "expense",
  payroll: "expense",
  rent: "expense",
  insurance: "expense",
  "taxes-licenses": "expense",
  "bank-fees": "expense",
  education: "expense",
  "cost-of-sales": "expense",
  "other-expense": "expense",
  personal: "expense",
  uncategorized: "both",
};

/** The categories a mapping UI should offer for an account on a given side. */
export function categoriesForSide(side: CategorySide): CategoryKey[] {
  return CATEGORY_KEYS.filter((k) => CATEGORY_SIDE[k] === side || CATEGORY_SIDE[k] === "both");
}

/**
 * Intuit AccountSubType → our category.
 *
 * Deliberately incomplete, and safe to be: anything unmapped falls through to
 * `uncategorized` and stays visible rather than vanishing. Tune it against real
 * client books once the first sync lands — `scripts/quickbooks-introspect.mjs`
 * prints exactly which subtypes a company actually uses.
 *
 * Note how little the income half can do. That's not an oversight in this
 * table, it's the shape of Intuit's enum; see the module header.
 */
export const SUBTYPE_TO_CATEGORY: Record<string, CategoryKey> = {
  // ── income (Classification: Revenue) ──
  SalesOfProductIncome: "merch",
  SalesRetail: "merch",
  SalesWholesale: "merch",
  ServiceFeeIncome: "platform-revenue",
  OtherPrimaryIncome: "platform-revenue",
  NonProfitIncome: "other-income",
  CashReceiptIncome: "other-income",
  OperatingGrants: "other-income",
  DiscountsRefundsGiven: "other-income",
  UnappliedCashPaymentIncome: "other-income",

  // ── other income ──
  DividendIncome: "other-income",
  InterestEarned: "other-income",
  OtherInvestmentIncome: "other-income",
  OtherMiscellaneousIncome: "other-income",
  TaxExemptInterestIncome: "other-income",
  GainLossOnSaleOfFixedAssets: "other-income",
  GainLossOnSaleOfInvestments: "other-income",

  // ── cost of goods sold ──
  CostOfLabor: "contractors",
  CostOfLaborCos: "contractors",
  SuppliesMaterialsCogs: "cost-of-sales",
  EquipmentRentalCos: "cost-of-sales",
  ShippingFreightDeliveryCos: "cost-of-sales",
  OtherCostsOfServiceCos: "cost-of-sales",

  // ── operating expenses ──
  AdvertisingPromotional: "advertising",
  PromotionalMeals: "advertising",
  OtherSellingExpenses: "advertising",

  DuesSubscriptions: "software",

  CommissionsAndFees: "contractors",
  ExternalServices: "contractors",
  OtherMiscellaneousServiceCost: "contractors",
  ManagementCompensation: "contractors",

  LegalProfessionalFees: "professional-fees",

  PayrollExpenses: "payroll",
  PayrollWageExpenses: "payroll",
  PayrollTaxExpenses: "payroll",
  StaffCosts: "payroll",

  EquipmentRental: "equipment",
  RepairMaintenance: "equipment",
  Auto: "equipment",

  Travel: "travel",
  TravelExpensesGeneralAndAdminExpenses: "travel",
  TravelExpensesSellingExpense: "travel",
  TravelMeals: "meals",
  Entertainment: "meals",
  EntertainmentMeals: "meals",

  OfficeExpenses: "office",
  OfficeGeneralAdministrativeExpenses: "office",
  SuppliesMaterials: "office",
  ShippingFreightDelivery: "office",
  ShippingAndDeliveryExpense: "office",
  Utilities: "office",
  Sundry: "office",

  RentOrLeaseOfBuildings: "rent",

  Insurance: "insurance",

  TaxesPaid: "taxes-licenses",
  IncomeTaxExpense: "taxes-licenses",
  GlobalTaxExpense: "taxes-licenses",

  BankCharges: "bank-fees",
  FinanceCosts: "bank-fees",
  InterestPaid: "bank-fees",
  BorrowingCost: "bank-fees",
  BadDebts: "bank-fees",

  CharitableContributions: "other-expense",
  AmortizationExpense: "other-expense",
  DepreciationExpense: "other-expense",
  Depreciation: "other-expense",
  ExtraordinaryCharges: "other-expense",
  OtherMiscellaneousExpense: "other-expense",
  UnappliedCashBillPaymentExpense: "other-expense",
  ProjectStudioExpenses: "other-expense",
  DistributionCosts: "other-expense",
  PurchasesRebates: "other-expense",
};

/** The slice of a QuickBooks Account that category resolution reads. */
export type AccountLike = {
  subType?: string | null;
  /** "Revenue" | "Expense" — the reliable side discriminator when a subtype is exotic. */
  classification?: string | null;
  /** The client's own account name — read by the personal-spend heuristic below. */
  name?: string | null;
  /** "Parent:Child". Preferred over `name`: a "Personal:Gym" child says so only here. */
  fullyQualifiedName?: string | null;
};

/**
 * Names that mean "this is the owner's money, not the business's".
 *
 * Intuit has no subtype for personal spending — an owner's gym membership and
 * the studio's electricity bill are both `Utilities` if that's where the
 * bookkeeper put them. What creators' books DO have is the word: an account
 * called "Personal", a "Personal" parent with children under it, or an owner
 * draw. That's the signal, so this reads the name.
 *
 * Matched against the fully-qualified name so a child of a "Personal" parent
 * is caught even when its own leaf name is "Groceries".
 */
const PERSONAL_NAME =
  /\bpersonal\b|\bowner'?s?\s*(draw|personal)|\bshareholder\s+distributions?\b|\bnon-?business\b/i;

/**
 * ...except these, which are ordinary business expenses that happen to contain
 * the word. A creator paying for personal training content, a personal
 * assistant, or personal branding is spending business money.
 */
const PERSONAL_EXCEPTIONS =
  /\bpersonal\s+(training|trainer|development|brand|branding|coach|coaching|assistant|shopper)/i;

/**
 * Whether an account name reads as personal (non-operating) spending.
 *
 * Deliberately a DEFAULT, not a verdict: it sits below the per-account
 * override in resolveCategory, so anything it gets wrong is one dropdown away
 * from being fixed permanently on the mapping tab.
 */
export function looksPersonal(name: string | null | undefined): boolean {
  if (!name) return false;
  if (PERSONAL_EXCEPTIONS.test(name)) return false;
  return PERSONAL_NAME.test(name);
}

export type CategoryOverrides = {
  /** accountId → category. Per-realm, highest precedence, survives renames. */
  byAccount: Record<string, CategoryKey>;
  /** AccountSubType → category. Global: one decision applies to every client. */
  bySubType: Record<string, CategoryKey>;
};

export const NO_OVERRIDES: CategoryOverrides = { byAccount: {}, bySubType: {} };

/**
 * Five layers, first match wins:
 *   1. per-account override  — the firm pinned this exact account
 *   2. personal-name match   — the account calls itself personal (expenses only)
 *   3. per-subtype override  — the firm re-mapped a subtype for everyone
 *   4. built-in subtype map  — the table above
 *   5. side fallback         — never drop the line
 *
 * Layer 2 sits above both subtype layers on purpose. A subtype is a generic
 * default that means the same thing in every company file; the account's own
 * name is evidence about THIS client. "Personal:Dining" is the owner's dinner
 * whatever `Entertainment` would otherwise say, and layer 1 still overrules it
 * when the heuristic guesses wrong.
 *
 * Layer 4 is the important one. An unmatched account MUST land somewhere
 * visible: if a line silently disappears, the categories stop summing to the
 * section total while the headline figure still looks right, which is the one
 * failure mode nobody notices. `uncategorized` is also the queue the mapping
 * screen works through, so a new client's unmapped accounts surface themselves.
 *
 * A null accountId is normal, not a bug — uncategorised rows, "Not Specified",
 * and rolled-up sub-accounts all arrive without one.
 */
export function resolveCategory(
  accountId: string | null,
  account: AccountLike | undefined,
  overrides: CategoryOverrides,
  side: CategorySide,
): CategoryKey {
  if (accountId) {
    const pinned = overrides.byAccount[accountId];
    if (pinned) return pinned;
  }
  // Expenses only — "personal" is an expense-side category, and an income
  // account with the word in it ("Personal training sessions") is revenue.
  if (
    side === "expense" &&
    looksPersonal(account?.fullyQualifiedName ?? account?.name)
  ) {
    return "personal";
  }
  const subType = account?.subType;
  if (subType) {
    const remapped = overrides.bySubType[subType];
    if (remapped) return remapped;
    const known = SUBTYPE_TO_CATEGORY[subType];
    if (known) return known;
  }
  if (account?.classification === "Revenue") return "other-income";
  if (account?.classification === "Expense") return "other-expense";
  return side === "income" ? "other-income" : "uncategorized";
}

const VALID = new Set<string>(CATEGORY_KEYS);

/** Narrow an untrusted value (an API body, a Firestore doc) to a category key. */
export function parseCategoryKey(value: unknown): CategoryKey | null {
  return typeof value === "string" && VALID.has(value) ? (value as CategoryKey) : null;
}
