/**
 * Next year's estimated tax payments, read off the prints and laid out for
 * the recap.
 *
 * Every ProSeries print already says what the client pays toward next year,
 * in its own words, as text:
 *
 *  - the 1040's "Tax Summary and Instructions for Filing" pages, one per
 *    jurisdiction: "Federal estimated income tax payments for tax year 2026
 *    are due as follows: Voucher 1 … 04/15/2026 … $ 12,056.00", and the
 *    same for each state ("California …": vouchers 1, 2 and 4 only — its
 *    schedule is 30%, 40%, 0%, 30%). A voucher marked "*" must be paid
 *    electronically. An overpayment kept for next year: "Of this amount,
 *    $2,500.00 will be applied to your 2026 estimates."
 *  - an S corporation's or LLC's cover letter: "The due dates and required
 *    payments for the 2026 California S Corporation Franchise or Income Tax
 *    Return estimated income tax are as follows: Installment #1 04/15/26 …
 *    $ 328", the list running on to the next page when it has to, and "of
 *    which $713.00 is credited to next year's estimated tax".
 *
 * It's read here, in the browser, from the unredacted text layer the
 * builder already has — deterministic and free, and nothing about the
 * client leaves the machine for it. The schedule is shown on review, where
 * staff can correct or add to it, and saved with the recap.
 *
 * The rest of the file is what the page and the PDF share: the payments by
 * due date, each payee's total, and the notes that make the schedule read
 * plainly.
 */
import type { EstimateInstallment, EstimateSchedule, RecapEstimates } from "./schema";
import { US_STATES } from "./tables";

const STATE_BY_NAME: Record<string, string> = Object.fromEntries(Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]));

/** A state's code from the start of a phrase ("California S Corporation…", "New York State S Corporation…"). */
function stateFrom(text: string): string | null {
  const t = text.toLowerCase();
  let best: string | null = null;
  for (const [name, code] of Object.entries(STATE_BY_NAME)) {
    if ((t === name || t.startsWith(`${name} `)) && (!best || name.length > (US_STATES[best] ?? "").length)) best = code;
  }
  return best;
}

const normalize = (t: string) => t.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ");

/** "04/15/26" or "04/15/2026" → "2026-04-15"; null when it isn't a date. */
function isoDate(text: string): string | null {
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const dollars = (text: string) => Math.round(Number(text.replace(/,/g, "")));

/** One voucher or installment line: its number, an electronic-only asterisk, the date, the amount. */
const ROW = /(?:Voucher|Installment\s*#?)\s*(\d)\s*(\*?)\s*[.\s]*?(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))\s*[.\s]*\$\s*([\d,]+(?:\.\d{2})?)/g;
/** Where a schedule's list ends: the mailing instructions, the next paragraph. */
const LIST_END = /\b(?:Include a|The estimates marked|For estimates|Estimated tax payments that are|We appreciate|Mail (?:your|to)|Write your|Listed below|Sincerely)\b/;
/** How far a list can run, a page break included. */
const LIST_SPAN = 900;

function rowsAfter(text: string, from: number): EstimateInstallment[] {
  let seg = text.slice(from, from + LIST_SPAN);
  const end = seg.search(LIST_END);
  if (end >= 0) seg = seg.slice(0, end);
  // A list stops at the next schedule's heading too.
  const next = seg.search(/estimated (?:income )?tax payments for tax year|due dates and required payments for the/i);
  if (next >= 0) seg = seg.slice(0, next);
  const out: EstimateInstallment[] = [];
  for (const m of seg.matchAll(ROW)) {
    const due = isoDate(m[3]);
    const amount = dollars(m[4]);
    if (!due || !(amount > 0) || out.some((x) => x.n === Number(m[1]))) continue;
    out.push({ n: Number(m[1]), due, amount, electronic: m[2] === "*" });
  }
  return out;
}

export type ParsedEstimates = { year: number | null; schedules: EstimateSchedule[] };

/**
 * The client's 1040: each jurisdiction's voucher schedule from the filing
 * instructions, and the overpayment each one applies to next year.
 */
export function parseIndividualEstimates(pageTexts: string[]): ParsedEstimates {
  const pages = pageTexts.map(normalize);
  const text = pages.join(" ");
  const schedules: EstimateSchedule[] = [];
  let year: number | null = null;
  const scheduleFor = (phrase: string): EstimateSchedule | null => {
    // The capitalised words before the heading can take in one from the
    // sentence before ("…Tax Board California"): the jurisdiction is the
    // last one, two or three of them that name one.
    const words = phrase.split(" ");
    const federal = words[words.length - 1] === "Federal";
    let code: string | null = null;
    for (let k = Math.min(3, words.length); k >= 1 && !federal && !code; k--) {
      const name = words.slice(-k).join(" ").toLowerCase();
      code = STATE_BY_NAME[name] ?? null;
    }
    if (!federal && !code) return null;
    let s = schedules.find((x) => (federal ? x.kind === "federal" : x.kind === "state" && x.stateCode === code));
    if (!s) {
      s = { kind: federal ? "federal" : "state", stateCode: code, label: federal ? "Federal (IRS)" : (US_STATES[code as string] ?? (code as string)), installments: [], applied: 0 };
      schedules.push(s);
    }
    return s;
  };
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+){0,3}) estimated income tax payments for tax year (\d{4}) are due as follows:/g)) {
    const s = scheduleFor(m[1]);
    if (!s || s.installments.length) continue;
    year ??= Number(m[2]);
    s.installments = rowsAfter(text, (m.index ?? 0) + m[0].length);
  }
  // The overpayment kept for next year, on each jurisdiction's own summary page.
  for (const page of pages) {
    if (!/Tax Summary and Instructions for Filing/i.test(page)) continue;
    const who = page.match(/\b\d{4} ([A-Z][a-z]+(?: [A-Z][a-z]+){0,2}) Individual Income Tax Return/);
    if (!who) continue;
    const applied =
      page.match(/Of this amount, \$\s*([\d,]+(?:\.\d{2})?) will be applied to your (\d{4}) estimates/i) ??
      page.match(/refund applied to next(?: year)?[\s.]*\$\s*([\d,]+(?:\.\d{2})?)/i);
    if (!applied) continue;
    const amount = dollars(applied[1]);
    if (!(amount > 0)) continue;
    const s = scheduleFor(who[1]);
    if (s && !s.applied) s.applied = amount;
    if (applied[2]) year ??= Number(applied[2]);
  }
  return { year, schedules: schedules.filter((s) => s.installments.length || s.applied) };
}

/** What kind of return an entity's schedule is for, for its label: "S corporation", "LLC", "partnership". */
function entityReturnKind(description: string): string | null {
  if (/s corporation/i.test(description)) return "S corporation";
  if (/limited liability company|\bllc\b/i.test(description)) return "LLC";
  if (/partnership/i.test(description)) return "partnership";
  if (/corporation|franchise/i.test(description)) return "corporation";
  return null;
}

/**
 * An S corporation's or LLC's print: each state return's installments from
 * the cover letter, and the overpayment credited to next year.
 * `entityName` labels them ("IMAP LLC (California)").
 */
export function parseEntityEstimates(pageTexts: string[], entityName: string | null = null): ParsedEstimates {
  const text = pageTexts.map(normalize).join(" ");
  const schedules: (EstimateSchedule & { at: number })[] = [];
  let year: number | null = null;
  for (const m of text.matchAll(/due dates and required payments for the (\d{4}) (.{3,140}?) estimated (?:income )?tax are as follows:/gi)) {
    const description = m[2].replace(/^the\s+/i, "");
    const code = stateFrom(description.replace(/ State\b/, ""));
    year ??= Number(m[1]);
    const installments = rowsAfter(text, (m.index ?? 0) + m[0].length);
    if (!installments.length) continue;
    const where = code ? (US_STATES[code] ?? code) : description;
    const kind = entityReturnKind(description);
    schedules.push({
      kind: "entity",
      stateCode: code,
      label: entityName ? `${entityName} (${where})` : `${where}${kind ? ` ${kind}` : " business"}`,
      installments,
      applied: 0,
      at: m.index ?? 0,
    });
  }
  // "…of which $713.00 is credited to next year's estimated tax": the
  // schedule it belongs to is the next one the letter lists.
  for (const m of text.matchAll(/of which \$\s*([\d,]+(?:\.\d{2})?) is credited to next year'?s estimated tax/gi)) {
    const amount = dollars(m[1]);
    const at = m.index ?? 0;
    const s = schedules.find((x) => x.at > at) ?? schedules[schedules.length - 1];
    if (s && amount > 0 && !s.applied) s.applied = amount;
  }
  return {
    year,
    schedules: schedules.map((s) => ({ kind: s.kind, stateCode: s.stateCode, label: s.label, installments: s.installments, applied: s.applied })),
  };
}

/** Every return's schedules together: the IRS first, then the states, then the businesses. */
export function mergeEstimates(parts: ParsedEstimates[], fallbackYear: number | null): RecapEstimates | null {
  const year = parts.find((p) => p.year !== null)?.year ?? fallbackYear;
  if (!year) return null;
  const order = { federal: 0, state: 1, entity: 2 } as const;
  const schedules = parts
    .flatMap((p) => p.schedules)
    .sort((a, b) => order[a.kind] - order[b.kind]);
  return schedules.length ? { year, schedules } : null;
}

/* ─────────────────────────────── presenting it ─────────────────────────────── */

export function hasEstimates(e: RecapEstimates | null | undefined): e is RecapEstimates {
  return !!e && e.schedules.some((s) => s.installments.length > 0 || s.applied > 0);
}

/** One due date and everything due on it. */
export type EstimateDate = {
  due: string;
  items: { label: string; amount: number; electronic: boolean }[];
  total: number;
};

/** The payments by due date, earliest first, each date's payees in schedule order. */
export function estimateTimeline(e: RecapEstimates): EstimateDate[] {
  const byDate = new Map<string, EstimateDate>();
  for (const s of e.schedules) {
    for (const i of s.installments) {
      const d = byDate.get(i.due) ?? { due: i.due, items: [], total: 0 };
      d.items.push({ label: s.label, amount: i.amount, electronic: i.electronic });
      d.total += i.amount;
      byDate.set(i.due, d);
    }
  }
  return [...byDate.values()].sort((a, b) => a.due.localeCompare(b.due));
}

/** Each payee's year: what it's paid in all, in how many payments. */
export function estimateTotals(e: RecapEstimates): { label: string; total: number; count: number; applied: number }[] {
  return e.schedules.map((s) => ({
    label: s.label,
    total: s.installments.reduce((t, i) => t + i.amount, 0),
    count: s.installments.length,
    applied: s.applied,
  }));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-04-15" → "April 15, 2026"; `short` → "Apr 15". */
export function formatDue(iso: string, short = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  const month = MONTHS[(m || 1) - 1] ?? "";
  return short ? `${month.slice(0, 3)} ${d}` : `${month} ${d}, ${y}`;
}

const ORDINAL = ["", "first", "second", "third", "fourth", "fifth", "sixth"];
const money = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/**
 * The plain-language notes under the schedule: a payee whose schedule skips
 * a payment (California's has no third), payments that must be made online,
 * an overpayment already credited toward the year, and how to pay.
 */
export function estimateNotes(e: RecapEstimates, taxYear: number): string[] {
  const notes: string[] = [];
  for (const s of e.schedules) {
    if (!s.installments.length) continue;
    const ns = s.installments.map((i) => i.n);
    const top = Math.max(...ns);
    const skipped = Array.from({ length: top }, (_, k) => k + 1).filter((k) => !ns.includes(k));
    if (!skipped.length) continue;
    if (s.stateCode === "CA" && skipped.length === 1 && skipped[0] === 3 && top === 4) {
      const last = formatDue(s.installments[s.installments.length - 1].due);
      notes.push(
        s.kind === "state"
          ? `California splits the year 30%, 40%, 0%, 30%: there's no third payment, so nothing goes to California in September, and its last one is ${last}.`
          : `${s.label} follows California's 30%, 40%, 0%, 30% split too: no payment in September, and its last one is ${last}.`,
      );
    } else {
      notes.push(`${s.label}: no ${skipped.map((k) => ORDINAL[k] ?? `#${k}`).join(" or ")} payment on its schedule this year.`);
    }
  }
  if (e.schedules.some((s) => s.installments.some((i) => i.electronic))) {
    notes.push("Payments marked “online” have to be paid electronically — the state requires it at that size. The rest can be paid online or by check.");
  }
  for (const s of e.schedules) {
    if (s.applied > 0) {
      notes.push(
        `${money(s.applied)} of your ${taxYear} overpayment ${s.kind === "federal" ? "to the IRS" : s.kind === "entity" ? `on ${s.label}` : `to ${s.label}`} is already credited toward ${e.year}${
          s.installments.length ? "." : ", and no further payments are scheduled."
        }`,
      );
    }
  }
  notes.push(
    "Each payment is separate: the IRS, each state and each business are paid on their own. Pay online — irs.gov/payments for the IRS, the state's tax site for the state — or mail a check with the matching voucher from your return packet.",
  );
  return notes;
}
