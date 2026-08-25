/**
 * The pipeline as a spreadsheet.
 *
 * Isomorphic — the browser builds the filename and the route builds the file,
 * and both need the same vocabulary. Nothing here may import Firebase or
 * anything server-only.
 *
 * Two decisions shape the whole module:
 *
 *  1. EVERY FIELD, not the visible columns. The tab you export from decides
 *     WHICH ROWS go in the file, never which facts about them — an operator
 *     exporting Deal Desk to hand to a bookkeeper shouldn't discover afterwards
 *     that the phone numbers were dropped because they weren't on screen. The
 *     Calendly intake answers ride along for the same reason; they're the one
 *     thing the grid genuinely doesn't have (see the note in types.ts).
 *
 *  2. KEYS ARE RESOLVED TO LABELS, money stays a bare number. A CSV is read by
 *     a human or by Excel: "launch-imp" means nothing to the first and "$1,995"
 *     is text to the second. So every dropdown is written as its current label
 *     and every dollar figure as digits with no symbol or separator.
 */

import {
  CALL_TYPE_LABELS,
  COMMISSION_PRESETS,
  DEAL_STATUS_LABELS,
  REFERRAL_KIND_LABELS,
  SHOW_STATUS_LABELS,
  type Answer,
  commissionTotal,
  optionLabel,
  payoutDate,
} from "./options";
import type { SalesCallRow, SalesOptionsConfig } from "./types";

/** A row plus the intake Q&A, which the grid's wire shape deliberately omits. */
export type ExportRow = SalesCallRow & { answers: Answer[] };

/**
 * How many distinct intake questions may become columns.
 *
 * The three live event types ask about ten between them, so this is a guard
 * against a pathological history (renamed questions accumulate as new columns),
 * not a real limit. Anything past it is reported rather than dropped silently.
 */
export const MAX_QUESTION_COLUMNS = 60;

/* ────────────────────────── RFC 4180 ────────────────────────── */

/**
 * One field, escaped.
 *
 * Quoting is not conditional on containing a comma. A leading `=`, `+`, `-` or
 * `@` makes Excel and Sheets treat the cell as a FORMULA, and these cells hold
 * free text an invitee typed into a public booking form — so a value starting
 * with one is prefixed with a tab, the standard defence, before quoting. The
 * cell still reads as its own text; it just stops being executable.
 */
function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "boolean") return value ? '"Yes"' : '"No"';
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : '""';

  const text = value.replace(/\r\n?/g, "\n");
  const guarded = /^[=+\-@\t\r]/.test(text) ? `\t${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Rows of already-typed values into one CSV document. */
export function toCsv(rows: (string | number | boolean | null)[][]): string {
  // CRLF and a BOM: between them, Excel on Windows opens a UTF-8 CSV with
  // accented names intact instead of mojibake, without a manual import step.
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/* ────────────────────────── formatting ────────────────────────── */

/**
 * A timestamp as the operator's own clock reads it.
 *
 * The export is a picture of what was on screen, and the grid renders in the
 * browser's timezone — so a CSV in UTC would put a Monday-evening booking on
 * Tuesday and quietly disagree with the row it came from. The client sends its
 * IANA zone; an unusable one falls back to UTC rather than throwing, because a
 * bad `timeZone` must not be able to fail an export.
 */
function formatter(timeZone: string): Intl.DateTimeFormat {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  try {
    return new Intl.DateTimeFormat("en-CA", opts);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "UTC" });
  }
}

function stamp(iso: string | null, fmt: Intl.DateTimeFormat): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // en-CA gives yyyy-mm-dd; the time half arrives after a comma, which would
  // read as a second column if it survived into the cell.
  return fmt.format(d).replace(",", "");
}

/* ────────────────────────── the columns ────────────────────────── */

/**
 * The fixed columns, in the order a reader wants them: who they are, what they
 * booked, what happened, what it paid, who touched it last.
 *
 * The intake questions are appended after these, one column each — they vary by
 * event type and by how long ago the row was booked, so they can't be a fixed
 * list.
 */
const HEADERS = [
  "Booked",
  "Call date",
  "Call type",
  "Calendly event",
  "Booking status",
  "Rescheduled",
  "Source",

  "Name",
  "Email",
  "Phone",
  "Website / social",
  "Revenue band",
  "Timezone",

  "Sales call",
  "Referral",
  "Deleted",

  "Lead source",
  "Lead source (their words)",
  "Suggested lead source",
  "Show",
  "Status",
  "Offer",
  "Payment plan",
  "Service sold",
  "Objection",
  "Onboarding date",
  "Notes",

  "Referred by",
  "Referrer (their words)",
  "Referral type",
  "Commission preset",
  "Partner commission",
  "Referee commission",
  "Commission total",
  "Payout date",
  "Paid",

  "Last edited",
  "Edited by",
  "Row ID",
] as const;

const presetLabel = (id: string | null) =>
  id ? (COMMISSION_PRESETS.find((p) => p.id === id)?.label ?? id) : "";

/**
 * Every question asked across the exported rows, in a stable order.
 *
 * Ordered by `position` — the order Calendly asks them in — then by the
 * question text, so two event types that both ask something at position 3 don't
 * swap columns between one export and the next. Sorting by first appearance
 * would make the column order depend on which row happened to sort first.
 */
function questionColumns(rows: ExportRow[]): string[] {
  const seen = new Map<string, number>();
  for (const row of rows) {
    for (const a of row.answers ?? []) {
      const q = a?.question?.trim();
      if (!q) continue;
      const position = typeof a.position === "number" ? a.position : 999;
      const known = seen.get(q);
      if (known === undefined || position < known) seen.set(q, position);
    }
  }
  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([question]) => question)
    .slice(0, MAX_QUESTION_COLUMNS);
}

export interface CsvOptions {
  /** IANA zone the operator is reading in. Falls back to UTC if unusable. */
  timeZone: string;
  config: SalesOptionsConfig;
}

/**
 * The whole file, header row included.
 *
 * `rows` arrives in the order the grid had them — the export is meant to be the
 * thing on screen, sort and all — so nothing is re-sorted here.
 */
export function buildSalesCsv(rows: ExportRow[], { timeZone, config }: CsvOptions): string {
  const minute = formatter(timeZone);
  const questions = questionColumns(rows);

  const body = rows.map((row) => {
    // One lookup per row rather than one per question column: a row with ten
    // answers scanned once beats ten scans of the same array.
    const answers = new Map(
      (row.answers ?? []).map((a) => [a?.question?.trim() ?? "", a?.answer ?? ""]),
    );

    return [
      stamp(row.bookedAt, minute),
      stamp(row.scheduledAt, minute),
      CALL_TYPE_LABELS[row.callType] ?? row.callType ?? "",
      row.callName,
      row.calendlyStatus ?? "",
      row.rescheduled,
      row.source,

      row.name,
      row.email,
      row.phone ?? "",
      row.socials ?? "",
      row.revenueBand ?? "",
      row.timezone ?? "",

      row.isSales,
      row.isReferral,
      row.archived,

      row.leadSource ? optionLabel(config.leadSource, row.leadSource) : "",
      row.leadSourceRaw ?? "",
      row.suggestedLeadSource
        ? optionLabel(config.leadSource, row.suggestedLeadSource)
        : "",
      row.showStatus ? (SHOW_STATUS_LABELS[row.showStatus] ?? row.showStatus) : "",
      row.status ? (DEAL_STATUS_LABELS[row.status] ?? row.status) : "",
      row.offer,
      row.paymentPlan ? optionLabel(config.paymentPlan, row.paymentPlan) : "",
      row.service ? optionLabel(config.service, row.service) : "",
      row.objection ? optionLabel(config.objection, row.objection) : "",
      row.onboardingDate ?? "",
      row.notes ?? "",

      row.referrerName ?? "",
      row.referrerRaw ?? "",
      row.referralKind ? (REFERRAL_KIND_LABELS[row.referralKind] ?? row.referralKind) : "",
      presetLabel(row.commissionPreset),
      row.partnerCommission,
      row.refereeCommission,
      // The one derived money column. Zero unless the deal actually closed —
      // commissionTotal owns that rule, so the file can't disagree with the
      // Referrals tab about what is owed.
      commissionTotal(row),
      row.isReferral ? (payoutDate(row.bookedAt) ?? "") : "",
      row.paid,

      stamp(row.updatedAt, minute),
      row.updatedBy ?? "",
      row.id,
      ...questions.map((q) => answers.get(q) ?? ""),
    ];
  });

  return toCsv([[...HEADERS, ...questions], ...body]);
}

/* ────────────────────────── the filename ────────────────────────── */

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/**
 * `decypher-deal-desk-year-to-date-2026-08-25.csv`.
 *
 * The range is in the name deliberately: these files get emailed around, and
 * two exports of the same tab a quarter apart are otherwise indistinguishable
 * in a downloads folder.
 */
export function csvFilename(view: string, rangeLabel: string, today: Date): string {
  const date = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  return ["decypher", slug(view), slug(rangeLabel), date].filter(Boolean).join("-") + ".csv";
}
