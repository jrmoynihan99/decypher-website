import {
  ENTITY_FIELD_KEYS,
  OTHER_STATE_FIELD_KEYS,
  RETURN_FIELD_KEYS,
  type EntityExtract,
  type ExtractedValue,
  type OtherStateFieldKey,
  type ReturnExtract,
} from "./schema";

/**
 * Cross-check an extraction against the PDF's own text layer.
 *
 * Claude reads the rendered pages; pdfjs reads the text layer in the
 * browser. The two are independent, which is what makes this a real check:
 * a number the model made up won't be on the page it cited. Kept apart from
 * extract.ts so it has no server-only imports and can be exercised directly.
 *
 * The checks are written over a plain record of fields so the 1040 and the
 * 1120-S go through the same code; the typed wrappers at the bottom are
 * what extract.ts calls.
 */

/**
 * Does `value` literally appear in `pageText`? Commas are dropped so
 * "123,038." on the form and 123038 in the extraction meet in the middle.
 * Whitespace is deliberately kept: on these prints a line number sits right
 * before its amount ("24 29,652."), and squashing the gap would weld the two
 * into one digit run and hide the match. The number has to stand alone — a
 * hit inside a longer digit run (an EIN, a routing number) doesn't count.
 */
export function appearsOn(pageText: string | undefined, value: number): boolean {
  if (!pageText) return false;
  const digits = String(Math.abs(Math.round(value)));
  const hay = pageText.replace(/,/g, "");
  const re = new RegExp(`(^|[^\\d])${digits}(?![\\d])`);
  return re.test(hay);
}

/** Every standalone amount printed on a page, commas dropped. */
function amountsOn(pageText: string | undefined): number[] {
  if (!pageText) return [];
  return (pageText.match(/(?<![\d.,])\d[\d,]*(?![\d])/g) ?? [])
    .map((s) => Number(s.replace(/,/g, "")))
    .filter((v) => Number.isFinite(v) && v > 0);
}

/**
 * Two printed amounts that add up to `value`, larger first, or null. For
 * the fields the field map defines as a sum the return never prints — the
 * premiums on two Forms 7206 (one per partner), Form 8582 lines 1c + 2c, the
 * properties on Schedule E line 21, the distributions on two K-1s, Form
 * 568's fee plus annual tax — this is the check; for any other line it's
 * the explanation offered when the number isn't printed. The same amount
 * twice (4,145 on each partner's 7206) counts only when it's printed twice.
 */
function sumOfTwoOn(pageTexts: (string | undefined)[], value: number, min = 1): number[] | null {
  const target = Math.abs(Math.round(value));
  const counts = new Map<number, number>();
  for (const t of pageTexts) for (const a of amountsOn(t)) if (a >= min) counts.set(a, (counts.get(a) ?? 0) + 1);
  for (const [a, c] of counts) {
    const b = target - a;
    if (b <= 0) continue;
    if (b === a ? c >= 2 : counts.has(b)) return a >= b ? [a, b] : [b, a];
  }
  return null;
}

/**
 * Three amounts printed on one page that add up to `value` (each printed
 * amount used once), largest first, or null — the reader adds three lines
 * for some (New York's withholding is lines 72 + 73 + 74). One page only:
 * across a whole print some three amounts add up to almost anything.
 */
function sumOfThreeOn(pageText: string | undefined, value: number, min = 1): number[] | null {
  const target = Math.abs(Math.round(value));
  const list = amountsOn(pageText)
    .filter((a) => a >= min && a < target)
    .sort((a, b) => a - b);
  if (list.length < 3 || list.length > 400) return null;
  for (let i = 0; i < list.length - 2; i++) {
    let l = i + 1;
    let r = list.length - 1;
    while (l < r) {
      const s = list[i] + list[l] + list[r];
      if (s === target) return [list[r], list[l], list[i]];
      if (s < target) l++;
      else r--;
    }
  }
  return null;
}

/** Fields the field map defines as an addition of printed amounts. */
const SUM_FIELDS = new Set<string>([
  "sehiPaid",
  "passivePriorUnallowed",
  "rentalProfits",
  "rentalLosses",
  "distributions",
  "stateTax",
  "w2Taxpayer",
  "w2Spouse",
  "w2TaxpayerEntity",
  "w2SpouseEntity",
  "stateWageDeduction",
  "stateBusinessIncome",
  // two Schedules C added up; a state's due plus its penalty
  "grossReceipts",
  "totalExpenses",
  "stateTotalDue",
]);

/**
 * Fields that are a whole column added up — Form 8962's twelve monthly
 * premiums (lines 12–23) when the annual line 11 isn't used. Checked as a
 * subset sum of the amounts printed on the cited page and its neighbours,
 * each amount usable as often as it is printed (eight months at $1,866 and
 * two at $1,313 is one such sum).
 */
const COLUMN_SUM_FIELDS = new Set<string>(["ptcPremiums", "ptcSlcsp"]);

/**
 * Some of the printed amounts that add up to `value`, or null. Bounded: the
 * sums tracked never exceed the target. Each sum remembers the amount that
 * first reached it, and the sums are walked down so each printed amount is
 * used once, which is what spells the column back out.
 */
function subsetSumOn(pageTexts: (string | undefined)[], value: number): number[] | null {
  const target = Math.abs(Math.round(value));
  if (target <= 0 || target > 5_000_000) return null;
  const amounts = pageTexts.flatMap(amountsOn).filter((a) => a <= target);
  if (amounts.length > 400) return null;
  /** The index of the amount that first reached each sum; -1 for not reached, -2 for zero. */
  const via = new Int32Array(target + 1).fill(-1);
  via[0] = -2;
  for (let i = 0; i < amounts.length; i++) {
    const a = amounts[i];
    for (let s = target; s >= a; s--) if (via[s] === -1 && via[s - a] !== -1) via[s] = i;
    if (via[target] !== -1) break;
  }
  if (via[target] === -1) return null;
  const parts: number[] = [];
  for (let s = target; s > 0; s -= amounts[via[s]]) parts.push(amounts[via[s]]);
  return parts.sort((a, b) => b - a);
}

/**
 * Stamp `verified` on each value. Off-by-one page citations are common
 * enough (a cover page counted or not) that the neighbours are checked too
 * and the page corrected when the number is found there instead. A number
 * found nowhere in the document is flagged, not dropped — the reviewer
 * decides. A field that is a sum by definition (`SUM_FIELDS`) also passes
 * as two amounts on the cited page and its neighbours.
 *
 * Whatever adds up is recorded (`parts`), so the review note can say how:
 * a sum field's two amounts, a column's months, and — for any other line
 * that isn't printed — two amounts near the cited page or three on it.
 * That last is an explanation, not a pass: the line stays flagged, since a
 * line the return prints as one number shouldn't need adding up.
 */
export function verifyFields<K extends string>(
  fields: Record<K, ExtractedValue>,
  keys: K[],
  pageTexts: string[] | null,
): { fields: Record<K, ExtractedValue>; unverified: K[]; noText: boolean } {
  // A scanned print has a page per image and no text layer at all — a few
  // stray characters at most. Checking against that would flag every number
  // and tell the reviewer nothing; say "scan" instead.
  const chars = pageTexts?.reduce((n, t) => n + t.trim().length, 0) ?? 0;
  if (!pageTexts || !pageTexts.length || chars < 200) {
    return { fields, unverified: [], noText: true };
  }
  const unverified: K[] = [];
  const out = { ...fields };
  for (const key of keys) {
    const f: ExtractedValue = out[key];
    if (f.value === null) {
      out[key] = { ...f, verified: null };
      continue;
    }
    const value = f.value;
    const cited = f.page;
    const candidates = cited
      ? [cited, cited - 1, cited + 1].filter((p) => p >= 1 && p <= pageTexts.length)
      : [];
    const hit = candidates.find((p) => appearsOn(pageTexts[p - 1], value));
    if (hit !== undefined) {
      out[key] = { value, page: hit, verified: true };
      continue;
    }
    // Last resort: anywhere in the document. Still a pass for the number,
    // but the citation was wrong, so record the page it was actually on.
    const anywhere = pageTexts.findIndex((t) => appearsOn(t, value));
    if (anywhere !== -1) {
      out[key] = { value, page: anywhere + 1, verified: true };
      continue;
    }
    const near = candidates.map((p) => pageTexts[p - 1]);
    // A line that's a sum by definition can be made of any printed amount;
    // an explanation for any other line only of amounts of $100 or more —
    // line numbers (1–99) would make a sum of almost anything.
    const min = SUM_FIELDS.has(key) ? 1 : 100;
    // A pair on one page first (so the note can name it), then across the
    // cited page and its neighbours (two partners' 7206s side by side).
    const onePage = candidates.map((p) => ({ p, parts: sumOfTwoOn([pageTexts[p - 1]], value, min) })).find((x) => x.parts);
    const pair = onePage?.parts ?? (candidates.length > 1 ? sumOfTwoOn(near, value, min) : null);
    const pairPage = onePage?.p ?? cited;
    const column = !pair && COLUMN_SUM_FIELDS.has(key) && candidates.length ? subsetSumOn(near, value) : null;
    if (SUM_FIELDS.has(key) && pair) {
      out[key] = { value, page: pairPage, verified: true, parts: pair };
    } else if (column) {
      out[key] = { value, page: cited, verified: true, parts: column };
    } else {
      const triple = !pair && cited ? sumOfThreeOn(pageTexts[cited - 1], value, min) : null;
      const parts = pair ?? triple;
      out[key] = { value, page: pair ? pairPage : f.page, verified: false, ...(parts ? { parts } : {}) };
      unverified.push(key);
    }
  }
  return { fields: out, unverified, noText: false };
}

const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/**
 * The review note for one line the check couldn't find printed: what it
 * was read as, and either the amounts that add up to it or that nothing did.
 */
export function unverifiedNote(label: string, f: ExtractedValue): string {
  const value = f.value === null ? "" : ` ${usd(f.value)}`;
  const where = f.page ? ` on page ${f.page}` : "";
  if (f.parts && f.parts.length > 1) {
    return `${label}${value}: not printed as one number — ${f.parts.map(usd).join(" + ")}${where} add up to it. Check that's what this line should be`;
  }
  return `${label}${value}: not found anywhere in the PDF's text, and no two or three amounts${where} add up to it — check it by hand`;
}

export function verifyAgainstText(
  extract: ReturnExtract,
  pageTexts: string[] | null,
): {
  extract: ReturnExtract;
  unverified: (typeof RETURN_FIELD_KEYS)[number][];
  /** Each other state return's lines found nowhere, by state code. */
  unverifiedOther: { stateCode: string; keys: OtherStateFieldKey[] }[];
  noText: boolean;
} {
  const r = verifyFields(extract.fields, RETURN_FIELD_KEYS, pageTexts);
  const unverifiedOther: { stateCode: string; keys: OtherStateFieldKey[] }[] = [];
  const otherStates = extract.otherStates?.map((s) => {
    const v = verifyFields(s.fields, [...OTHER_STATE_FIELD_KEYS], pageTexts);
    if (v.unverified.length) unverifiedOther.push({ stateCode: s.stateCode, keys: v.unverified });
    return { ...s, fields: v.fields };
  });
  return {
    extract: { ...extract, fields: r.fields, ...(otherStates ? { otherStates } : {}) },
    unverified: r.unverified,
    unverifiedOther,
    noText: r.noText,
  };
}

export function verifyEntityAgainstText(
  extract: EntityExtract,
  pageTexts: string[] | null,
): { extract: EntityExtract; unverified: (typeof ENTITY_FIELD_KEYS)[number][]; noText: boolean } {
  const r = verifyFields(extract.fields, ENTITY_FIELD_KEYS, pageTexts);
  return { extract: { ...extract, fields: r.fields }, unverified: r.unverified, noText: r.noText };
}

/**
 * Translate cited page numbers back to the original return.
 *
 * When a return is trimmed before sending (see lib/tax-recap/pages), the
 * model cites positions in the trimmed copy. The reviewer is holding the
 * real return, so "page 3" has to become the page it actually came from or
 * the citation is worse than useless.
 */
export function remapFieldPages<K extends string>(
  fields: Record<K, ExtractedValue>,
  keys: K[],
  pageMap: number[] | null,
): Record<K, ExtractedValue> {
  if (!pageMap?.length) return fields;
  const out = { ...fields };
  for (const key of keys) {
    const f = out[key];
    if (f.page === null) continue;
    const original = pageMap[f.page - 1];
    if (original) out[key] = { ...f, page: original };
  }
  return out;
}

export function remapPages(extract: ReturnExtract, pageMap: number[] | null): ReturnExtract {
  const otherStates = extract.otherStates?.map((s) => ({ ...s, fields: remapFieldPages(s.fields, [...OTHER_STATE_FIELD_KEYS], pageMap) }));
  return { ...extract, fields: remapFieldPages(extract.fields, RETURN_FIELD_KEYS, pageMap), ...(otherStates ? { otherStates } : {}) };
}

export function remapEntityPages(extract: EntityExtract, pageMap: number[] | null): EntityExtract {
  return { ...extract, fields: remapFieldPages(extract.fields, ENTITY_FIELD_KEYS, pageMap) };
}

/**
 * If the state's "total tax" came back with the underpayment penalty inside
 * it, take the penalty out. The arithmetic proves the case: due = tax −
 * payments + penalty when the penalty is separate, so a total due that
 * equals tax − payments while a penalty exists means the tax already
 * carries it. NJ-1040's "Total Tax Due" is the known offender, and on that
 * form there's no separate balance-before-penalty line either, so an
 * "amount owed" that repeats the bundled total is corrected the same way.
 * Adjusted figures are derived, so they lose their verified tick and the
 * reviewer gets a note.
 */
export function unbundleStatePenalty(
  extract: ReturnExtract,
): { extract: ReturnExtract; notes: string[] } {
  const f = extract.fields;
  const tax = f.stateTotalTax.value;
  const due = f.stateTotalDue.value;
  const pen = f.statePenalty.value;
  const paid = f.statePayments.value ?? 0;
  if (tax === null || due === null || !pen || pen <= 0) return { extract, notes: [] };
  if (Math.abs(due - (tax - paid)) > 2) return { extract, notes: [] };

  const fields = {
    ...f,
    stateTotalTax: { value: tax - pen, page: f.stateTotalTax.page, verified: null },
  };
  const owed = f.stateAmountOwed.value;
  if (owed !== null && (Math.abs(owed - due) <= 2 || Math.abs(owed - tax) <= 2)) {
    fields.stateAmountOwed = { value: due - pen, page: f.stateAmountOwed.page, verified: null };
  }
  const money = (v: number) => v.toLocaleString("en-US");
  return {
    extract: { ...extract, fields },
    notes: [
      `State total tax as printed (${money(tax)}) included the ${money(pen)} underpayment penalty — recorded as ${money(tax - pen)} so it isn't counted twice`,
    ],
  };
}
