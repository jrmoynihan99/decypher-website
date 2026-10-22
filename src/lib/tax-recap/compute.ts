/**
 * Every number on the recap page, derived from the returns.
 *
 * Pure and isomorphic: the review grid previews with it in the browser and
 * the public page renders with it on the server, from the same stored
 * numbers. The LLM never does arithmetic — it reads lines; this adds them.
 *
 * Formulas follow docs/TAX-RECAP-FIELD-MAP.md. Four conventions, each
 * checked against a real recap:
 *  - Federal Taxes is total tax (line 24) net of refundable credits (line
 *    32): a credit lowers the client's tax, it isn't money they paid. What
 *    they paid is line 33 minus line 32 — withholding and estimates only.
 *    Line 32 also carries line 31 (paid with an extension, excess Social
 *    Security withheld), which IS money paid, so that part is netted back.
 *  - State Taxes is the state's tax before payments and WITHOUT underpayment
 *    penalties or interest; Penalties get their own row. Some state totals
 *    bundle the penalty in (NJ-1040 "Total Tax Due"); extraction unbundles
 *    it, and validateNumbers flags it if a hand-typed figure still has it.
 *  - An S corporation's own state tax (California's 1.5% and the elective
 *    PTE tax the corporation pays) is its own row, "State S-corp tax &
 *    PTET", on top of the shareholder's state tax — the Canva recaps carry
 *    it that way. Business net income is the K-1 for such a client.
 *  - "This year's income" is what the business took in: gross receipts,
 *    plus W-2 wages for a sole proprietor (an S corporation's owner is paid
 *    out of those receipts).
 * On the filing page, Owed = what's due now + what was already paid: the
 * whole year's bill including any penalty, which is how the recaps show it.
 */

import { OTHER_STATE_CREDIT_WITH_PAYMENTS, type EntityForm, type EntityNumbers, type RecapInput, type ReturnNumbers, type StateNumbers } from "./schema";

const n = (v: number | null | undefined) => (typeof v === "number" && isFinite(v) ? v : 0);
const has = (v: number | null | undefined): v is number =>
  typeof v === "number" && isFinite(v);

/**
 * The refundable credits proper: line 32 less the other payments on line
 * 31 it includes (an extension payment, excess Social Security withheld),
 * which are money the client sent in, not a credit against the tax.
 */
export const refundableCreditsOf = (r: ReturnNumbers): number =>
  Math.max(0, n(r.federalRefundableCredits) - n(r.otherPayments));

export type RecapSide = {
  w2Income: number;
  businessNetIncome: number;
  otherIncome: number;
  grossIncome: number;
  federalTaxes: number;
  /** Every state return together. */
  stateTaxes: number;
  /** The entity's own state tax (an S corporation's franchise tax, an LLC's annual tax and fee) plus its PTE elective tax, every entity together; 0 for a sole proprietor. */
  entityTaxes: number;
  /** One figure per state return: the main state's, then each other state's in `otherStates` order. Adds up to `stateTaxes`. */
  stateRows: number[];
  /** One figure per entity return: the first entity's, then each other entity's. Adds up to `entityTaxes`. */
  entityRows: number[];
  penalties: number;
  /**
   * The before only: the self-employment tax the K-1 income would carry
   * without the S corporation (the engine's `scorpSavings` estimate) — what
   * the client would have paid as a sole proprietor. 0 on the after, and on
   * a recap without an S corporation. Inside `totalTaxes`.
   */
  scorpSeTax: number;
  totalTaxes: number;
};

/**
 * What one side carries beyond the 1040 and the first entity return: the
 * other state returns' lines and the other entities'; and the main
 * state's code, which says where its credit for other states' tax sits.
 */
export type SideMore = { states?: StateNumbers[]; entities?: (EntityNumbers | null)[]; mainState?: string | null };

/**
 * The main state's credit for tax paid to other states when the return
 * claims it with the payments (Virginia, Pennsylvania): not money the
 * client paid, so it comes off the state's tax and its payments both.
 */
export const creditWithPaymentsOf = (r: ReturnNumbers, mainState: string | null | undefined): number =>
  mainState && OTHER_STATE_CREDIT_WITH_PAYMENTS.has(mainState) ? n(r.stateOtherStateCredit) : 0;

/**
 * What kind of business the client runs through an entity return, from the
 * lines the 1040 carries: an S corporation's K-1, a partnership's, or
 * neither (a sole proprietor). Decides the recap's labels.
 */
export type EntityKind = "scorp" | "partnership" | null;

export function entityKindOf(after: ReturnNumbers, before: ReturnNumbers | null = null, entity: EntityNumbers | null = null): EntityKind {
  if (n(after.partnershipIncome) > 0 || n(before?.partnershipIncome) > 0) return "partnership";
  if (n(after.scorpIncome) > 0 || n(before?.scorpIncome) > 0) return "scorp";
  // An entity return with guaranteed payments is a partnership; one with officer pay is an S corporation.
  if (entity) return n(entity.guaranteedPayments) > 0 || n(entity.k1Guaranteed) > 0 ? "partnership" : "scorp";
  return null;
}

/** An entity return's own bills: the state's tax and elective tax, and a city's corporation tax when it files one (New York City's NYC-3L). */
const entityTaxOf = (e: EntityNumbers | null | undefined) => (e ? n(e.stateTax) + n(e.pteTax) + n(e.cityTax) : 0);

export function sideSummary(r: ReturnNumbers, e: EntityNumbers | null = null, more: SideMore = {}): RecapSide {
  const w2 = n(r.w2Income);
  const biz = n(r.businessNetIncome) + n(r.scorpIncome) + n(r.partnershipIncome);
  // Total income falls back to the parts when line 9 wasn't read, so a
  // half-extracted return still previews instead of showing $0 everywhere.
  const gross = has(r.totalIncome) ? r.totalIncome : w2 + biz;
  const federal = n(r.federalTotalTax) - refundableCreditsOf(r);
  // A refundable PTE credit (New Jersey's BAIT) sits with the payments, so
  // the printed state tax is gross of it; the shareholder's real state bill
  // is net, the same convention as the federal refundable credits.
  const stateRows = [
    n(r.stateTotalTax) - n(r.statePteCreditRefundable) - creditWithPaymentsOf(r, more.mainState),
    ...(more.states ?? []).map((s) => n(s.stateTotalTax)),
  ];
  const entityRows = [entityTaxOf(e), ...(more.entities ?? []).map(entityTaxOf)];
  const state = stateRows.reduce((s, v) => s + v, 0);
  const entity = entityRows.reduce((s, v) => s + v, 0);
  const penalties = n(r.federalPenalty) + n(r.statePenalty) + (more.states ?? []).reduce((s, x) => s + n(x.statePenalty), 0);
  return {
    w2Income: w2,
    businessNetIncome: biz,
    otherIncome: gross - w2 - biz,
    grossIncome: gross,
    federalTaxes: federal,
    stateTaxes: state,
    entityTaxes: entity,
    stateRows,
    entityRows,
    penalties,
    scorpSeTax: 0,
    totalTaxes: federal + state + entity + penalties,
  };
}

/** The recap's "total taxes owed" for one side — the figure the savings are the difference of. */
export function totalTaxesOf(r: ReturnNumbers, e: EntityNumbers | null = null, more: SideMore = {}): number {
  return sideSummary(r, e, more).totalTaxes;
}

export type FilingLine = {
  /** The whole year's bill: due + paid. */
  owed: number;
  /** Withholding and estimated payments actually sent in. */
  paid: number;
  /** Positive = balance due, negative = refund. */
  due: number;
};

function filingLine(
  paid: number,
  refund: number | null,
  balanceDue: number | null,
  /** Fallback when the return's own balance line wasn't read. */
  taxLessPayments: number,
): FilingLine {
  // Prefer the return's own balance line — it already carries the penalty
  // and the rounding; the subtraction is only the fallback.
  const due = has(refund) && refund > 0 ? -refund : has(balanceDue) ? balanceDue : taxLessPayments;
  return { owed: due + paid, paid, due };
}

export type RecapComputed = {
  before: RecapSide;
  after: RecapSide;
  savings: number;
  /** Exact decompositions of `savings` — no counterfactual involved. */
  breakdown: {
    /** What the dependents the before doesn't claim add to it; 0 when it claims them. */
    kids: number;
    /** The S corporation's self-employment tax avoided, on the before (`RecapSide.scorpSeTax`). */
    scorpSeTax: number;
    deductionsFound: number;
    seTaxSaved: number;
    incomeTaxSaved: number;
    stateSaved: number;
    entitySaved: number;
    penaltiesSaved: number;
  };
  filing: {
    federal: FilingLine;
    state: FilingLine;
    /** The S corporation's own state bill; null for a sole proprietor. */
    entity: FilingLine | null;
    /** Each other state return's, in `states` order after the main one. */
    otherStates: FilingLine[];
    /** Each other entity return's, in `entities` order after the first. */
    otherEntities: FilingLine[];
    /** Sum of the `due` figures — the "Total" box on the filing page. */
    total: number;
  };
  currentYearIncome: number;
  /** What the business took in: Schedule C line 1, or the entity returns' line 1a. */
  receipts: number;
  priorYearIncome: number | null;
  /** True when the client's business runs through an entity return (an S corporation or a partnership). */
  scorp: boolean;
  /** Which kind of entity, for the recap's labels; null for a sole proprietor. */
  entityKind: EntityKind;
  /** True when the corporation files a city's own return too (New York City's NYC-3L): its tax is inside `entityTaxes`, and the labels say so. */
  cityTax: boolean;
  /** The state returns in row order (`RecapSide.stateRows`): the main state, then the others. */
  states: { code: string | null }[];
  /** The entity returns in row order (`RecapSide.entityRows`); empty for a sole proprietor. */
  entities: RecapEntityRow[];
};

/** One entity return's row: what kind, which state charges it, and whether a city return's tax is in it. */
export type RecapEntityRow = { kind: "scorp" | "partnership"; stateCode: string | null; cityTax: boolean; name: string | null };

/** The entity row's label on the recap: what the corporation itself pays, by its kind — and the city when it files a city return too. */
export function entityRowLabel(c: { entityKind: EntityKind; cityTax: boolean }, stateLabel: string): string {
  if (c.entityKind === "partnership") return `${stateLabel} LLC tax & fee`;
  return c.cityTax ? `${stateLabel} & city S-corp tax` : `${stateLabel} S-corp tax & PTET`;
}

/** The entity line's label on the filing page. */
export function entityFilingLabel(c: { entityKind: EntityKind; cityTax: boolean }): string {
  if (c.entityKind === "partnership") return "LLC / partnership";
  return c.cityTax ? "S-corp (state & city)" : "S-corp (PTET)";
}

/**
 * The rows the recap shows for the states and the entities, labelled.
 * One row each when there's one of each, as the recap always had; one per
 * return when the client filed in several states or owns several
 * businesses, so every one's taxes — and savings — are on the page.
 * `stateName` turns a two-letter code into the state's name.
 */
export function taxRows(
  c: Pick<RecapComputed, "states" | "entities" | "entityKind" | "cityTax">,
  stateName: (code: string | null) => string,
): { states: { label: string; index: number }[]; entities: { label: string; filingLabel: string; index: number }[] } {
  const states = c.states.map((s, index) => ({ label: `${stateName(s.code)} taxes`, index }));
  const main = stateName(c.states[0]?.code ?? null);
  const several = c.entities.length > 1;
  const entities = c.entities.map((e, index) => {
    const where = e.stateCode ? stateName(e.stateCode) : main;
    const row = { entityKind: e.kind, cityTax: e.cityTax };
    return {
      label: several && e.name ? `${e.name}: ${entityRowLabel(row, where)}` : entityRowLabel(row, where),
      filingLabel: several && e.name ? `${e.name} · ${entityFilingLabel(row)}` : entityFilingLabel(row),
      index,
    };
  });
  return { states, entities };
}

const kindOfForm = (form: EntityForm | null | undefined, e: EntityNumbers | null | undefined): "scorp" | "partnership" =>
  form === "1065" ? "partnership" : form === "1120-S" ? "scorp" : n(e?.guaranteedPayments) > 0 || n(e?.k1Guaranteed) > 0 ? "partnership" : "scorp";

export function computeRecap(
  input: Pick<RecapInput, "before" | "after" | "priorYearIncome"> &
    Partial<Pick<RecapInput, "entityBefore" | "entityAfter" | "analysis" | "otherEntities" | "otherStates" | "stateCode" | "extraction">>,
): RecapComputed {
  const eb = input.entityBefore ?? null;
  const ea = input.entityAfter ?? null;
  const otherStates = input.otherStates ?? [];
  const otherEntities = input.otherEntities ?? [];
  // The before column as read or derived claims the dependents; the
  // recap's before doesn't (the engine's `kids.inBefore`, v8 on), so their
  // worth on that side goes onto its federal and main state rows.
  const kids = input.analysis?.kids?.inBefore ?? null;
  const mainState = input.stateCode ?? null;
  const asFiled = sideSummary(input.before, eb, { states: otherStates.map((s) => s.before), entities: otherEntities.map((x) => x.before), mainState });
  const withKids: RecapSide = kids
    ? {
        ...asFiled,
        federalTaxes: asFiled.federalTaxes + kids.federal,
        stateTaxes: asFiled.stateTaxes + kids.state,
        stateRows: asFiled.stateRows.map((v, i) => (i === 0 ? v + kids.state : v)),
        totalTaxes: asFiled.totalTaxes + kids.federal + kids.state,
      }
    : asFiled;
  // Both returns are S corporation returns, so the self-employment tax the
  // structure avoids is in neither; the before is what the year would have
  // cost without DeCypher, so it carries it on its own row (the site owner's
  // call, 2026-10-22: a before and an after that didn't add up to the
  // savings beside them made the recap's math look wrong). The before less
  // the after is then the whole saving, S corporation included.
  const scorpSe = Math.max(0, Math.round(input.analysis?.scorpSavings?.amount ?? 0));
  const before: RecapSide = scorpSe > 0 ? { ...withKids, scorpSeTax: scorpSe, totalTaxes: withKids.totalTaxes + scorpSe } : withKids;
  const after = sideSummary(input.after, ea, { states: otherStates.map((s) => s.after), entities: otherEntities.map((x) => x.after), mainState });
  const a = input.after;
  const b = input.before;
  const firstForm = input.extraction?.entity?.returnForm ?? null;
  // With one entity its kind is what the 1040 says; with several, each
  // return's own form says.
  const entityKind: EntityKind = otherEntities.length && (ea || eb) ? kindOfForm(firstForm, ea ?? eb) : entityKindOf(a, b, ea ?? eb);
  const scorp = entityKind !== null || otherEntities.length > 0;

  // Line 33 bundles refundable credits in with payments; only the payments
  // count as "paid" — the credit already lowered the tax figure above.
  const fedPaid = Math.max(0, n(a.federalPayments) - refundableCreditsOf(a));
  const federal = filingLine(
    fedPaid,
    a.federalRefund,
    a.federalAmountOwed,
    after.federalTaxes - fedPaid + n(a.federalPenalty),
  );
  // stateTotalDue is the figure the client actually pays (includes penalty),
  // so it wins over the pre-penalty balance when both were read. A
  // refundable PTE credit is inside the payments line but isn't money the
  // client sent in.
  const statePaid = Math.max(0, n(a.statePayments) - n(a.statePteCreditRefundable) - creditWithPaymentsOf(a, mainState));
  const state = filingLine(
    statePaid,
    a.stateRefund,
    has(a.stateTotalDue) ? a.stateTotalDue : a.stateAmountOwed,
    after.stateTaxes - statePaid + n(a.statePenalty),
  );
  // The corporation pays its elective tax with the election, on its own
  // vouchers, so it counts as paid alongside the return's own payments.
  const entityFiling = (x: EntityNumbers, taxes: number): FilingLine => {
    const paid = n(x.statePayments) + n(x.pteTax) + n(x.cityPayments);
    const due = has(x.stateAmountDue) || has(x.cityAmountDue) ? n(x.stateAmountDue) + n(x.cityAmountDue) : null;
    return filingLine(paid, x.stateRefund, due, taxes - paid);
  };
  const entity: FilingLine | null = ea ? entityFiling(ea, after.entityRows[0]) : null;
  const otherEntityFiling = otherEntities.map((x, i) => (x.after ? entityFiling(x.after, after.entityRows[i + 1]) : filingLine(0, null, null, 0)));
  // Another state's return, the way the main one is: its own balance line when read.
  const otherStateFiling = otherStates.map((s, i) => {
    const paid = n(s.after.statePayments);
    return filingLine(paid, s.after.stateRefund, has(s.after.stateTotalDue) ? s.after.stateTotalDue : s.after.stateAmountOwed, after.stateRows[i + 1] - paid + n(s.after.statePenalty));
  });

  // What the businesses took in: each entity's receipts, and the Schedule
  // C's beside a partnership (a sole proprietor's own business next to the
  // K-1). The Schedule C beside an S corporation is left out, as it always
  // was: it can be the owner's make-up payroll, which the corporation's
  // receipts already count.
  const entityReceipts = (after?: EntityNumbers | null, before?: EntityNumbers | null) =>
    has(after?.grossReceipts) ? (after?.grossReceipts as number) : has(before?.grossReceipts) ? (before?.grossReceipts as number) : null;
  const schCReceipts = has(a.grossReceipts) ? a.grossReceipts : has(b.grossReceipts) ? b.grossReceipts : null;
  // A Schedule C netting to $0 beside a K-1 only passes the entity's income through.
  const schCOwn = n(a.businessNetIncome) !== 0 || n(b.businessNetIncome) !== 0;
  const anyScorp =
    (ea || eb ? (otherEntities.length ? kindOfForm(firstForm, ea ?? eb) : entityKind) === "scorp" : false) ||
    otherEntities.some((x) => kindOfForm(x.form, x.after ?? x.before) === "scorp");
  let receipts: number;
  if (!scorp) receipts = schCReceipts ?? before.businessNetIncome;
  else {
    const parts = [entityReceipts(ea, eb), ...otherEntities.map((x) => entityReceipts(x.after, x.before))];
    if (!otherEntities.length && parts[0] === null) receipts = before.businessNetIncome;
    else receipts = parts.reduce<number>((s, v) => s + n(v), 0) + (anyScorp || !schCOwn ? 0 : n(schCReceipts));
  }

  // The first entity's row shows whenever the client's business runs through
  // one, as it always did, even before its return's numbers are in.
  const firstEntity: RecapEntityRow[] =
    entityKind !== null
      ? [{ kind: entityKind, stateCode: input.extraction?.entity?.stateCode ?? null, cityTax: n(ea?.cityTax) > 0 || n(eb?.cityTax) > 0, name: input.extraction?.entity?.entityName ?? null }]
      : [];
  const entities: RecapEntityRow[] = [
    ...firstEntity,
    ...otherEntities.map((x) => ({
      kind: kindOfForm(x.form, x.after ?? x.before),
      stateCode: x.stateCode,
      cityTax: n(x.after?.cityTax) > 0 || n(x.before?.cityTax) > 0,
      name: x.name,
    })),
  ];

  return {
    before,
    after,
    savings: before.totalTaxes - after.totalTaxes,
    breakdown: {
      kids: withKids.totalTaxes - asFiled.totalTaxes,
      scorpSeTax: before.scorpSeTax,
      deductionsFound: before.businessNetIncome - after.businessNetIncome,
      seTaxSaved: n(b.seTax) - n(a.seTax),
      incomeTaxSaved: n(b.incomeTax) - n(a.incomeTax),
      stateSaved: asFiled.stateTaxes - after.stateTaxes,
      entitySaved: before.entityTaxes - after.entityTaxes,
      penaltiesSaved: before.penalties - after.penalties,
    },
    filing: {
      federal,
      state,
      entity,
      otherStates: otherStateFiling,
      otherEntities: otherEntityFiling,
      total:
        federal.due +
        state.due +
        (entity?.due ?? 0) +
        otherStateFiling.reduce((s, l) => s + l.due, 0) +
        otherEntityFiling.reduce((s, l) => s + l.due, 0),
    },
    currentYearIncome: receipts + (scorp ? 0 : n(a.w2Income ?? b.w2Income)),
    receipts,
    priorYearIncome: input.priorYearIncome,
    scorp,
    entityKind,
    cityTax: n(ea?.cityTax) > 0 || n(eb?.cityTax) > 0,
    states: [{ code: input.stateCode ?? null }, ...otherStates.map((s) => ({ code: s.stateCode }))],
    entities,
  };
}

/* ─────────────────────────────── validation ─────────────────────────────── */

export type Warning = { side: "before" | "after" | "both" | "entity"; message: string };

/** Rounding on the forms is to the dollar, so identities hold within $2. */
const TOL = 2;
const off = (x: number, y: number) => Math.abs(x - y) > TOL;
const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/** Arithmetic identities within one return. Any failure means "look again". */
export function validateNumbers(r: ReturnNumbers, side: "before" | "after"): Warning[] {
  const w: Warning[] = [];
  const add = (message: string) => w.push({ side, message });

  if (!has(r.federalTotalTax)) add("Federal total tax (1040 line 24) wasn't read");
  if (!has(r.totalIncome) && !has(r.businessNetIncome) && !has(r.scorpIncome) && !has(r.partnershipIncome) && !has(r.w2Income)) {
    add("No income lines were read");
  }

  if (has(r.federalTotalTax) && has(r.incomeTax)) {
    // Line 24 = 16 + 17 − 19 − 20 + 23 (SE tax, additional Medicare, NIIT…).
    // Line 23 is the whole of it when read; otherwise not every piece of it
    // is, so a gap is a glance, not an alarm.
    const expected =
      Math.max(0, r.incomeTax + n(r.additionalTaxes) - n(r.childTaxCredit) - n(r.nonrefundableCredits)) +
      (has(r.otherTaxes) ? r.otherTaxes : n(r.seTax) + n(r.niit));
    const gap = r.federalTotalTax - expected;
    if (Math.abs(gap) > TOL) {
      add(
        `Federal total tax is ${fmt(Math.abs(gap))} ${gap > 0 ? "more" : "less"} than income tax + additional taxes − credits + SE tax + NIIT — usually other Schedule 2 taxes (additional Medicare tax) or a credit that wasn't read; check if unexpected`,
      );
    }
  }
  if (has(r.taxableIncome) && has(r.agi) && r.taxableIncome > r.agi + TOL) {
    add("Taxable income is larger than AGI");
  }
  if (has(r.totalIncome)) {
    const parts =
      n(r.w2Income) + n(r.businessNetIncome) + n(r.scorpIncome) + n(r.partnershipIncome) + Math.min(0, n(r.rentalIncome));
    // A capital loss (capped at $3,000) is the usual reason total income
    // runs under the parts; anything bigger is worth a look.
    if (r.totalIncome + 3000 + TOL < parts) {
      add(
        `Total income ${fmt(r.totalIncome)} is ${fmt(parts - r.totalIncome)} less than W-2 + business income ${fmt(parts)} — a loss on Schedule D or E, or a misread line`,
      );
    }
  }
  if (has(r.rentalLosses) && has(r.rentalIncome) && r.rentalLosses > 0 && r.rentalIncome < -(r.rentalLosses + n(r.rentalProfits)) - TOL) {
    add(`Rental income or loss ${fmt(r.rentalIncome)} is a bigger loss than the properties' own losses ${fmt(r.rentalLosses)}`);
  }
  // Schedule E line 23a less 23e is the properties' net (line 21 added up).
  if (
    has(r.rentalRents) &&
    has(r.rentalExpenses) &&
    (has(r.rentalProfits) || has(r.rentalLosses)) &&
    off(r.rentalRents - r.rentalExpenses, n(r.rentalProfits) - n(r.rentalLosses))
  ) {
    add(
      `Rents ${fmt(r.rentalRents)} less rental expenses ${fmt(r.rentalExpenses)} isn't the properties' net ${fmt(n(r.rentalProfits) - n(r.rentalLosses))} (Schedule E lines 23a, 23e and 21)`,
    );
  }
  if (has(r.saltDeducted) && has(r.saltPaid) && r.saltDeducted > r.saltPaid + TOL) {
    add("State and local taxes deducted (Schedule A line 5e) exceed the taxes paid (line 5d)");
  }
  if (has(r.federalAmountOwed) && has(r.federalTotalTax)) {
    const expected = r.federalTotalTax - n(r.federalPayments) + n(r.federalPenalty);
    if (off(r.federalAmountOwed, expected)) {
      const gap = r.federalAmountOwed - expected;
      add(
        `Federal amount owed ${fmt(r.federalAmountOwed)} ≠ total tax − payments + penalty ${fmt(expected)}` +
          (!has(r.federalPenalty) && gap > 0
            ? ` — the ${fmt(gap)} gap may be an estimated tax penalty on line 38 that wasn't read`
            : ""),
      );
    }
  }
  if (has(r.federalRefund) && has(r.federalTotalTax) && has(r.federalPayments)) {
    const expected = r.federalPayments - r.federalTotalTax - n(r.federalPenalty);
    if (off(r.federalRefund, expected)) {
      add(`Federal refund ${fmt(r.federalRefund)} ≠ payments − total tax − penalty ${fmt(expected)}`);
    }
  }
  if (has(r.federalRefundableCredits) && has(r.federalPayments) && r.federalRefundableCredits > r.federalPayments + TOL) {
    add("Refundable credits (line 32) exceed total payments (line 33), which includes them");
  }
  if (has(r.otherPayments) && r.otherPayments > n(r.federalRefundableCredits) + TOL) {
    add("Other payments (line 31) exceed line 32, which includes them");
  }
  if (
    has(r.stateTotalTax) &&
    has(r.stateTotalDue) &&
    n(r.statePenalty) > 0 &&
    !off(r.stateTotalDue, r.stateTotalTax - n(r.statePayments))
  ) {
    add(
      `State total tax ${fmt(r.stateTotalTax)} looks like it includes the ${fmt(n(r.statePenalty))} penalty — the recap would count it twice`,
    );
  }
  if (has(r.businessNetIncome) && has(r.grossReceipts)) {
    const expected = r.grossReceipts - n(r.cogs) - n(r.totalExpenses) - n(r.homeOffice);
    if (off(r.businessNetIncome, expected)) {
      add(
        `Schedule C net profit ${fmt(r.businessNetIncome)} ≠ gross receipts − cost of goods sold − expenses − home office ${fmt(expected)} (returns and allowances or other income on line 6 may explain it)`,
      );
    }
  }
  if (has(r.stateTotalDue) && has(r.stateAmountOwed)) {
    if (off(r.stateTotalDue, r.stateAmountOwed + n(r.statePenalty))) {
      add(
        `State total due ${fmt(r.stateTotalDue)} ≠ amount owed + penalties ${fmt(r.stateAmountOwed + n(r.statePenalty))}`,
      );
    }
  }
  if (has(r.statePteCredit) && has(r.statePteCreditAvailable) && r.statePteCredit > r.statePteCreditAvailable + TOL) {
    add("The PTE elective tax credit claimed is more than the credit available");
  }
  return w;
}

/**
 * The S corporation's own identities, and how it ties to the shareholder's
 * 1040. With other entity returns on the same 1040 (`others`), the K-1s
 * and the officer pay are judged all together against the 1040's lines,
 * and each other return's own identities are checked too.
 */
export function validateEntity(e: EntityNumbers, r: ReturnNumbers, others: EntityNumbers[] = []): Warning[] {
  const w: Warning[] = [];
  const add = (message: string) => w.push({ side: "entity", message });
  /** `which` names the return when there are several ("Entity return 2: …"). */
  const own = (x: EntityNumbers, which: string | null) => {
    const say = (message: string) => add(which ? `${which}: ${message}` : message);
    if (has(x.totalIncome) && has(x.grossReceipts) && off(x.totalIncome, x.grossReceipts - n(x.cogs) + n(x.otherIncome))) {
      say(
        `1120-S total income ${fmt(x.totalIncome)} ≠ gross receipts − cost of goods sold ${fmt(x.grossReceipts - n(x.cogs))} (returns, a 4797 gain or other income may explain it)`,
      );
    }
    if (has(x.ordinaryIncome) && has(x.totalIncome) && has(x.totalDeductions) && off(x.ordinaryIncome, x.totalIncome - x.totalDeductions)) {
      say(`1120-S ordinary income ${fmt(x.ordinaryIncome)} ≠ total income − total deductions ${fmt(x.totalIncome - x.totalDeductions)}`);
    }
    if (has(x.guaranteedPayments) && (has(x.k1Guaranteed) || has(x.k1Guaranteed2)) && off(x.guaranteedPayments, n(x.k1Guaranteed) + n(x.k1Guaranteed2))) {
      say(`Guaranteed payments on the 1065 (${fmt(x.guaranteedPayments)}) aren't the K-1s' box 4c added up (${fmt(n(x.k1Guaranteed) + n(x.k1Guaranteed2))}) — a partner who isn't on this 1040`);
    }
  };
  own(e, others.length ? "Entity return 1" : null);
  others.forEach((x, i) => own(x, `Entity return ${i + 2}`));
  // Every K-1 on this 1040 added up — ordinary income and, for a partner,
  // the guaranteed payments, less the section 179 deduction passed through
  // (Schedule E column (j)) — is what Schedule E reports.
  const k1Of = (x: EntityNumbers) => n(x.k1Ordinary) + n(x.k1Ordinary2) + n(x.k1Guaranteed) + n(x.k1Guaranteed2) - n(x.k1Section179);
  const k1Total = [e, ...others].reduce((s, x) => s + k1Of(x), 0);
  const reported = others.length
    ? has(r.partnershipIncome) || has(r.scorpIncome)
      ? n(r.partnershipIncome) + n(r.scorpIncome)
      : null
    : has(r.partnershipIncome)
      ? r.partnershipIncome
      : has(r.scorpIncome)
        ? r.scorpIncome
        : null;
  if (has(e.k1Ordinary) && reported !== null && off(k1Total, reported)) {
    add(`The K-1s' income ${fmt(k1Total)} isn't what the 1040 reports on Schedule E (${fmt(reported)})`);
  }
  // Wages beyond the officer's are fine once the W-2 lines say who paid
  // them (a spouse on the payroll, an outside employer); unplaced, they're
  // worth a look.
  const entityW2 = n(r.w2TaxpayerEntity) + n(r.w2SpouseEntity);
  const officerComp = [e, ...others].reduce((s, x) => s + n(x.officerComp), 0);
  if ([e, ...others].some((x) => has(x.officerComp)) && has(r.w2Income) && r.w2Income > officerComp + TOL && entityW2 <= 0) {
    add(
      `W-2 wages on the 1040 (${fmt(r.w2Income)}) exceed the officer compensation on the 1120-S${others.length ? "s" : ""} (${fmt(officerComp)}) and the W-2 lines don't say who paid the rest`,
    );
  }
  if (has(r.w2Taxpayer) && has(r.w2Spouse) && has(r.w2Income) && off(r.w2Taxpayer + r.w2Spouse, r.w2Income)) {
    add(`The taxpayer's and spouse's W-2 wages (${fmt(r.w2Taxpayer + r.w2Spouse)}) don't add up to line 1z (${fmt(r.w2Income)})`);
  }
  if (has(e.stateTotalTax) && has(e.stateTax) && n(e.pteTax) > 0 && !off(e.stateTotalTax, e.stateTax)) {
    add(
      `The state's total tax (${fmt(e.stateTotalTax)}) doesn't include the ${fmt(n(e.pteTax))} PTE elective tax — it's paid on its own vouchers, so the recap adds the two`,
    );
  }
  return w;
}

/**
 * Cross-checks between the two returns. They come from the same ProSeries
 * file with the income untouched, so anything income-side that differs is a
 * sign the wrong file was uploaded on one side.
 */
export function crossValidate(
  before: ReturnNumbers,
  after: ReturnNumbers,
  entityBefore: EntityNumbers | null = null,
  entityAfter: EntityNumbers | null = null,
  more: { before: SideMore; after: SideMore } = { before: {}, after: {} },
): Warning[] {
  const w: Warning[] = [];
  const add = (message: string) => w.push({ side: "both", message });

  if (has(before.grossReceipts) && has(after.grossReceipts) && off(before.grossReceipts, after.grossReceipts)) {
    add(
      `Gross receipts differ: ${fmt(before.grossReceipts)} before vs ${fmt(after.grossReceipts)} after — the before return should carry the same income`,
    );
  }
  if (
    has(entityBefore?.grossReceipts) &&
    has(entityAfter?.grossReceipts) &&
    off(entityBefore?.grossReceipts as number, entityAfter?.grossReceipts as number)
  ) {
    add(
      `The corporation's gross receipts differ: ${fmt(entityBefore?.grossReceipts as number)} before vs ${fmt(entityAfter?.grossReceipts as number)} after`,
    );
  }
  if (
    has(before.w2Income) &&
    has(after.w2Income) &&
    off(before.w2Income, after.w2Income) &&
    !(n(before.scorpIncome) > 0 || n(after.scorpIncome) > 0)
  ) {
    add("W-2 wages differ between the two returns");
  }
  // The before zeroes the rental expenses, so its losses differ by design;
  // the rents are what both sides share.
  if (has(before.rentalRents) && has(after.rentalRents) && off(before.rentalRents, after.rentalRents)) {
    add("The rental properties' rents differ between the two returns — the before return should carry the same rents");
  }
  if (
    has(before.federalPayments) &&
    has(after.federalPayments) &&
    off(before.federalPayments, after.federalPayments) &&
    // An S corporation owner's W-2 withholding leaves with the salary on the before.
    !(n(after.scorpIncome) > 0 && !off(after.federalPayments - before.federalPayments, n(after.federalWithholding)))
  ) {
    add("Federal payments differ between the two returns");
  }
  const b = sideSummary(before, entityBefore, more.before);
  const a = sideSummary(after, entityAfter, more.after);
  if (a.totalTaxes > b.totalTaxes + TOL) {
    add(
      `The after return owes more (${fmt(a.totalTaxes)}) than the before (${fmt(b.totalTaxes)}) — are the files swapped?`,
    );
  }
  return w;
}

export function validateAll(
  before: ReturnNumbers,
  after: ReturnNumbers,
  entityBefore: EntityNumbers | null = null,
  entityAfter: EntityNumbers | null = null,
  more: Pick<RecapInput, "otherEntities" | "otherStates"> = {},
): Warning[] {
  const others = more.otherEntities ?? [];
  const states = more.otherStates ?? [];
  const sides = {
    before: { states: states.map((s) => s.before), entities: others.map((x) => x.before) },
    after: { states: states.map((s) => s.after), entities: others.map((x) => x.after) },
  };
  return [
    ...validateNumbers(before, "before"),
    ...validateNumbers(after, "after"),
    ...(entityAfter ? validateEntity(entityAfter, after, others.map((x) => x.after).filter((x): x is EntityNumbers => x !== null)) : []),
    ...crossValidate(before, after, entityBefore, entityAfter, sides),
  ];
}
