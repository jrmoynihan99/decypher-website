import { RETURN_FIELD_KEYS, type ExtractedValue, type ReturnExtract, type ReturnFieldKey } from "./schema";

/**
 * Cross-check an extraction against the PDF's own text layer.
 *
 * Claude reads the rendered pages; pdfjs reads the text layer in the
 * browser. The two are independent, which is what makes this a real check:
 * a number the model made up won't be on the page it cited. Kept apart from
 * extract.ts so it has no server-only imports and can be exercised directly.
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

/**
 * Stamp `verified` on each value. Off-by-one page citations are common
 * enough (a cover page counted or not) that the neighbours are checked too
 * and the page corrected when the number is found there instead. A number
 * found nowhere in the document is flagged, not dropped — the reviewer
 * decides.
 */
export function verifyAgainstText(
  extract: ReturnExtract,
  pageTexts: string[] | null,
): { extract: ReturnExtract; unverified: ReturnFieldKey[]; noText: boolean } {
  // A scanned print has a page per image and no text layer at all — a few
  // stray characters at most. Checking against that would flag every number
  // and tell the reviewer nothing; say "scan" instead.
  const chars = pageTexts?.reduce((n, t) => n + t.trim().length, 0) ?? 0;
  if (!pageTexts || !pageTexts.length || chars < 200) {
    return { extract, unverified: [], noText: true };
  }
  const unverified: ReturnFieldKey[] = [];
  const fields = { ...extract.fields };
  for (const key of RETURN_FIELD_KEYS) {
    const f: ExtractedValue = fields[key];
    if (f.value === null) {
      fields[key] = { ...f, verified: null };
      continue;
    }
    const value = f.value;
    const cited = f.page;
    const candidates = cited
      ? [cited, cited - 1, cited + 1].filter((p) => p >= 1 && p <= pageTexts.length)
      : [];
    const hit = candidates.find((p) => appearsOn(pageTexts[p - 1], value));
    if (hit !== undefined) {
      fields[key] = { value, page: hit, verified: true };
      continue;
    }
    // Last resort: anywhere in the document. Still a pass for the number,
    // but the citation was wrong, so record the page it was actually on.
    const anywhere = pageTexts.findIndex((t) => appearsOn(t, value));
    if (anywhere !== -1) {
      fields[key] = { value, page: anywhere + 1, verified: true };
    } else {
      fields[key] = { ...f, verified: false };
      unverified.push(key);
    }
  }
  return { extract: { ...extract, fields }, unverified, noText: false };
}

/**
 * Translate cited page numbers back to the original return.
 *
 * When a return is trimmed before sending (see lib/tax-recap/pages), the
 * model cites positions in the trimmed copy. The reviewer is holding the
 * real return, so "page 3" has to become the page it actually came from or
 * the citation is worse than useless.
 */
export function remapPages(extract: ReturnExtract, pageMap: number[] | null): ReturnExtract {
  if (!pageMap?.length) return extract;
  const fields = { ...extract.fields };
  for (const key of RETURN_FIELD_KEYS) {
    const f = fields[key];
    if (f.page === null) continue;
    const original = pageMap[f.page - 1];
    if (original) fields[key] = { ...f, page: original };
  }
  return { ...extract, fields };
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
