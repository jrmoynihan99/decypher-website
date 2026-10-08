/**
 * The client-facing S-corp summary sheet, as an HTML string.
 *
 * One builder feeds both places the sheet appears: the white "paper" card on
 * the Summary tab (via innerHTML) and the standalone document printHtml()
 * prints. Building it once is what keeps the PDF a client keeps identical to
 * what they were shown on the call — two renderings would drift.
 *
 * It's a document, not portal chrome, so the colours are fixed paper-and-ink
 * on purpose and ignore the portal's light/dark theme. Fonts name the portal's
 * next/font variables first and fall back to the Google Fonts families, which
 * is what the print document (which has no such variables) loads instead.
 *
 * Every user-typed string goes through escapeHtml(); everything else is a
 * number formatted by money() or fixed copy.
 */

import { escapeHtml } from "@/lib/print-html";
import { money } from "@/lib/widget-format";
import { GREEN_LIGHT, WAGE_BASE, type ScorpAnalysis } from "@/lib/tax-strategy/scorp";

export type SheetData = {
  /** Client name, or the business, or "Your S corp estimate". */
  title: string;
  /** The business, when the title is a person. */
  subtitle: string;
  /** "October 8, 2026" */
  date: string;
  a: ScorpAnalysis;
};

const INK = "#14121A";
const SUB = "#6B6578";
const LINE = "#E7E3EC";
const MAGENTA = "#FF2D78";
const MAGENTA_DEEP = "#C41E86";
const GREEN = "#0E9F6E";
const AMBER = "#B7791F";
const RISK_INK = { low: "#0E9F6E", medium: "#B7791F", high: "#D6304F" } as const;

const DISPLAY = "var(--font-space-grotesk, 'Space Grotesk'), ui-sans-serif, system-ui, sans-serif";
const BODY = "var(--font-inter, 'Inter'), ui-sans-serif, system-ui, -apple-system, sans-serif";
const MONO = "var(--font-plex-mono, 'IBM Plex Mono'), ui-monospace, 'SFMono-Regular', monospace";

const LABEL = `font-family:${MONO};font-size:9.5px;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;color:${SUB};`;

function row(k: string, v: string, strong = false): string {
  return (
    `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 0;border-bottom:1px solid ${LINE};">` +
    `<span style="font-size:13px;color:${strong ? INK : SUB};">${k}</span>` +
    `<span style="font-family:${DISPLAY};font-size:${strong ? 16 : 14}px;font-weight:700;color:${INK};font-variant-numeric:tabular-nums;">${v}</span>` +
    `</div>`
  );
}

function section(heading: string, body: string): string {
  return (
    `<div style="margin-bottom:18px;break-inside:avoid;">` +
    `<div style="${LABEL}color:${MAGENTA_DEEP};margin-bottom:6px;">${heading}</div>` +
    body +
    `</div>`
  );
}

/** The sheet itself — a single self-styled element. */
export function summarySheetHtml({ title, subtitle, date, a }: SheetData): string {
  const { risk } = a;

  const header =
    `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:2px solid ${MAGENTA};padding-bottom:14px;margin-bottom:18px;">` +
    `<div style="min-width:0;">` +
    `<div style="${LABEL}color:${MAGENTA_DEEP};">S corp salary &amp; savings summary</div>` +
    `<div style="font-family:${DISPLAY};font-size:22px;font-weight:700;letter-spacing:-0.5px;margin-top:4px;">${escapeHtml(title)}</div>` +
    (subtitle
      ? `<div style="font-size:13px;color:${SUB};margin-top:2px;">${escapeHtml(subtitle)}</div>`
      : "") +
    `</div>` +
    `<div style="text-align:right;font-size:11px;color:${SUB};flex-shrink:0;">` +
    `<div style="font-family:${DISPLAY};font-weight:700;color:${INK};font-size:13px;">DeCypher Financials</div>` +
    `<div style="margin-top:2px;">${escapeHtml(date)}</div>` +
    `</div>` +
    `</div>`;

  const hero =
    `<div style="text-align:center;background:#F3FBF7;border:1px solid #BFE9D6;border-radius:12px;padding:16px 12px;margin-bottom:18px;break-inside:avoid;">` +
    `<div style="${LABEL}">Estimated tax savings per year</div>` +
    `<div style="font-family:${DISPLAY};font-size:40px;font-weight:700;color:${GREEN};letter-spacing:-1.5px;line-height:1.1;font-variant-numeric:tabular-nums;">${money(a.savings)}</div>` +
    `<div style="font-size:12px;color:${SUB};margin-top:2px;">about ${money(a.savings / 12)} a month</div>` +
    `</div>`;

  const business = section(
    "The business",
    row("Total revenue", money(a.revenue)) +
      row("Expenses", money(a.expenses)) +
      row("Business profit", money(a.profit), true) +
      `<div style="font-size:12px;color:${a.greenLight ? GREEN : SUB};margin-top:8px;">${
        a.greenLight
          ? `Profit is above ${money(GREEN_LIGHT)}, which makes this a strong S corp candidate.`
          : `Profit is below ${money(GREEN_LIGHT)}. An S corp usually isn't worth the added cost and paperwork yet.`
      }</div>`,
  );

  const paid = section(
    "How you'd be paid",
    row("Salary (W-2 payroll)", money(a.salary), true) +
      row("Distributions", money(a.distribution)) +
      row(
        "Salary as share of profit",
        a.profit > 0 ? `${Math.round((a.salary / a.profit) * 100)}%` : "—",
      ),
  );

  const comparison = section(
    "Self-employment tax comparison",
    row("Today, as a single-member LLC", money(a.before)) +
      row("As an S corp (payroll tax on salary)", money(a.after)) +
      row("Difference", money(a.savings), true),
  );

  const riskCheck = risk
    ? section(
        "Salary risk check",
        `<div style="display:flex;align-items:center;gap:10px;margin-top:4px;">` +
          `<span style="display:inline-flex;align-items:center;gap:6px;border:1px solid ${RISK_INK[risk.level]};border-radius:20px;padding:3px 10px;">` +
          `<span style="width:8px;height:8px;border-radius:50%;background:${RISK_INK[risk.level]};"></span>` +
          `<span style="font-family:${MONO};font-size:10.5px;font-weight:600;color:${RISK_INK[risk.level]};text-transform:uppercase;letter-spacing:0.5px;">${risk.pill}</span>` +
          `</span>` +
          `<span style="font-size:12px;color:${SUB};">Target: ${a.targetText}</span>` +
          `</div>` +
          `<div style="font-size:13px;color:${INK};margin-top:8px;line-height:1.45;">${risk.message}</div>`,
      )
    : "";

  const basis = section(
    "Distributions vs. basis",
    `<div style="font-size:13px;line-height:1.45;color:${a.overDistributing ? AMBER : INK};">${
      a.overDistributing
        ? `Planned distributions are ${money(a.excessOverBasis)} more than the profit left after salary and employer payroll tax plus beginning basis. That excess may be taxable — worth planning around.`
        : a.retained >= 0
          ? `Distributions are covered by profit. About ${money(a.retained)} would stay in the business.`
          : `Distributions are covered, with ${money(-a.retained)} coming from beginning basis.`
    }</div>`,
  );

  const nextSteps = section(
    "Next steps",
    // list-style spelled out: on screen the sheet sits inside the portal,
    // whose CSS reset strips the bullets the printed copy would keep.
    `<ul style="margin:4px 0 0;padding-left:18px;list-style:disc;font-size:13px;line-height:1.6;color:${INK};">` +
      `<li>Confirm the salary with a reasonable-compensation review of your role and hours.</li>` +
      `<li>Set up payroll so salary is paid on a regular schedule.</li>` +
      `<li>Track distributions through the year so they stay within basis.</li>` +
      `</ul>`,
  );

  const footer =
    `<div style="font-size:9.5px;color:${SUB};line-height:1.45;border-top:1px solid ${LINE};padding-top:10px;">` +
    `Estimate of self-employment and payroll tax only. It doesn't include income tax, payroll service or filing costs, or state taxes, and it isn't a reasonable-compensation determination. Uses the 2026 Social Security wage base (${money(WAGE_BASE)}). For discussion purposes only — not tax advice.` +
    `</div>`;

  return (
    `<div class="sc-sheet" style="background:#fff;color:${INK};border-radius:16px;padding:26px 24px;font-family:${BODY};text-align:left;">` +
    header +
    hero +
    business +
    paid +
    comparison +
    riskCheck +
    basis +
    nextSteps +
    footer +
    `</div>`
  );
}

/** The sheet as a standalone printable document, for printHtml(). */
export function summaryDocument(d: SheetData): string {
  const docTitle = `S corp summary — ${d.title}`;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(docTitle)}</title>` +
    `<link rel="preconnect" href="https://fonts.googleapis.com">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap">` +
    `<style>` +
    `@page{margin:0.5in}` +
    `html,body{margin:0;background:#fff}` +
    `body{padding:24px}` +
    `*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `@media print{body{padding:0}.sc-sheet{border-radius:0 !important;padding:0 !important}}` +
    `</style></head><body>` +
    summarySheetHtml(d) +
    `</body></html>`
  );
}
