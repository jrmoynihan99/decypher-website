import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFRef } from "pdf-lib";
import { computeRecap, type RecapSide } from "./compute";
import type { RecapDoc } from "./schema";
import { US_STATES } from "./tables";

/**
 * The recap as a PDF: the same six beats as the page (cover, before/after,
 * savings, at filing, strategy, next steps), set in the site's palette on
 * four Letter pages, with every link live. Built from the recap's numbers
 * with pdf-lib, so it's the same on every machine and needs no browser —
 * the email attachment next to the link.
 *
 * Standard Helvetica throughout: no font files to ship, and it prints
 * cleanly. Runs anywhere (no server-only imports); the two routes that
 * serve it are what gate it.
 */

const PAGE = { w: 612, h: 792 };
const M = 48; // margin
const W = PAGE.w - M * 2;

const hex = (h: string) => {
  const v = parseInt(h.slice(1), 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
};
const C = {
  night: hex("#0e0d14"),
  panel: hex("#141319"),
  panel2: hex("#1b1a22"),
  edge: hex("#2a2833"),
  fog: hex("#f1eef6"),
  mist: hex("#b8b3c6"),
  muted: hex("#8f88a0"),
  dusk: hex("#7a7488"),
  magenta: hex("#ff2d78"),
  violet: hex("#8b5cf6"),
  teal: hex("#3dd6c4"),
  danger: hex("#ff6b7a"),
};

const money = (v: number) => (isFinite(v) ? `$${Math.round(v).toLocaleString("en-US")}` : "—");

/**
 * The standard fonts only carry WinAnsi (Latin-1 plus a few typographic
 * marks); anything else throws when drawn. Staff type names and strategies
 * freely, so every string is folded to what the font can print: common
 * symbols mapped, accents stripped, anything left over becomes "?".
 */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const MAP: Record<string, string> = { "−": "-", "→": "->", "←": "<-", "✓": "v", "✔": "v", "≈": "~", "·": "·", " ": " " };
function pdfSafe(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)) {
      out += ch;
    } else if (MAP[ch] !== undefined) {
      out += MAP[ch];
    } else if (ch === "\n" || ch === "\t") {
      out += " ";
    } else {
      const folded = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
      out += /^[\x20-\x7e]+$/.test(folded) ? folded : "?";
    }
  }
  return out;
}

/** Make a standard font forgiving: everything drawn or measured is folded first. */
function forgiving(font: PDFFont): PDFFont {
  const encode = font.encodeText.bind(font);
  const width = font.widthOfTextAtSize.bind(font);
  font.encodeText = (t: string) => encode(pdfSafe(t));
  font.widthOfTextAtSize = (t: string, size: number) => width(pdfSafe(t), size);
  return font;
}
/** A figure that can be negative: "-$3,000" rather than "$-3,000". */
const signed = (v: number) => (v < 0 ? `-${money(-v)}` : money(v));
const dash = (v: number) => (v === 0 ? "—" : signed(v));

type Ctx = {
  doc: PDFDocument;
  bold: PDFFont;
  reg: PDFFont;
  links: Map<PDFPage, PDFRef[]>;
};

function newPage(ctx: Ctx, header: { left: string; right: string }): PDFPage {
  const page = ctx.doc.addPage([PAGE.w, PAGE.h]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: C.night });
  // a thin brand rule along the top
  page.drawRectangle({ x: 0, y: PAGE.h - 4, width: PAGE.w * 0.62, height: 4, color: C.magenta });
  page.drawRectangle({ x: PAGE.w * 0.62, y: PAGE.h - 4, width: PAGE.w * 0.38, height: 4, color: C.violet });
  page.drawText(header.left, { x: M, y: PAGE.h - M, size: 12, font: ctx.bold, color: C.fog });
  const rw = ctx.reg.widthOfTextAtSize(header.right, 8.5);
  page.drawText(header.right, { x: PAGE.w - M - rw, y: PAGE.h - M + 1, size: 8.5, font: ctx.reg, color: C.muted });
  return page;
}

function footer(ctx: Ctx, page: PDFPage, recapUrl: string, n: number, total: number) {
  page.drawLine({ start: { x: M, y: 58 }, end: { x: PAGE.w - M, y: 58 }, thickness: 0.6, color: C.edge });
  page.drawText("Prepared by DeCypher Financials  ·  wedecypher.co", { x: M, y: 42, size: 8.5, font: ctx.reg, color: C.dusk });
  const url = `Your recap online: ${recapUrl}`;
  page.drawText(url, { x: M, y: 30, size: 8.5, font: ctx.reg, color: C.mist });
  link(ctx, page, M, 26, ctx.reg.widthOfTextAtSize(url, 8.5), 12, recapUrl);
  const pn = `${n} / ${total}`;
  page.drawText(pn, { x: PAGE.w - M - ctx.reg.widthOfTextAtSize(pn, 8.5), y: 42, size: 8.5, font: ctx.reg, color: C.dusk });
}

/** A clickable rectangle; pdf-lib has no high-level API for links, so it's the raw annotation. */
function link(ctx: Ctx, page: PDFPage, x: number, y: number, w: number, h: number, url: string) {
  const annot = ctx.doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, y, x + w, y + h],
    Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  });
  const ref = ctx.doc.context.register(annot);
  ctx.links.set(page, [...(ctx.links.get(page) ?? []), ref]);
}

function flushLinks(ctx: Ctx) {
  for (const [page, refs] of ctx.links) {
    page.node.set(PDFName.of("Annots"), ctx.doc.context.obj(refs));
  }
}

/** Word-wrap `text` to `width` at `size`; returns the lines. */
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paragraph(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, width: number, color = C.mist, leading = 1.45): number {
  let yy = y;
  for (const l of wrap(font, text, size, width)) {
    page.drawText(l, { x, y: yy, size, font, color });
    yy -= size * leading;
  }
  return yy;
}

function eyebrow(ctx: Ctx, page: PDFPage, text: string, x: number, y: number, color = C.magenta) {
  page.drawText(text.toUpperCase(), { x, y, size: 8, font: ctx.bold, color });
}

function rightText(page: PDFPage, font: PDFFont, text: string, right: number, y: number, size: number, color: ReturnType<typeof rgb>) {
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, size, font, color });
}

/** A rounded-ish card: pdf-lib draws sharp rectangles, so a hairline border on a panel. */
function card(page: PDFPage, x: number, y: number, w: number, h: number, accent?: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width: w, height: h, color: C.panel, borderColor: accent ?? C.edge, borderWidth: accent ? 1 : 0.6 });
}

/** One stat tile: small caps label, big number. */
function stat(ctx: Ctx, page: PDFPage, x: number, y: number, w: number, h: number, label: string, value: string, color: ReturnType<typeof rgb>, big = 22) {
  page.drawRectangle({ x, y, width: w, height: h, color: C.panel2, borderColor: C.edge, borderWidth: 0.6 });
  // Labels shrink to fit the tile rather than running into the next one.
  const text = label.toUpperCase();
  let size = 7.5;
  while (size > 5 && ctx.bold.widthOfTextAtSize(text, size) > w - 24) size -= 0.25;
  page.drawText(text, { x: x + 12, y: y + h - 20, size, font: ctx.bold, color: C.muted });
  page.drawText(value, { x: x + 14, y: y + 16, size: big, font: ctx.bold, color });
}

/** A ledger column: label left, value right, totals with a rule above. */
function ledger(ctx: Ctx, page: PDFPage, x: number, top: number, w: number, side: RecapSide, stateLabel: string, totalLabel: string, totalColor: ReturnType<typeof rgb>, scorp = false): number {
  let y = top;
  const row = (label: string, value: string, opts: { total?: boolean; color?: ReturnType<typeof rgb>; gap?: boolean } = {}) => {
    if (opts.gap) y -= 8;
    if (opts.total) {
      page.drawLine({ start: { x, y: y + 6 }, end: { x: x + w, y: y + 6 }, thickness: 1, color: C.edge });
      y -= 8;
    }
    page.drawText(label, { x, y, size: opts.total ? 10.5 : 9.5, font: opts.total ? ctx.bold : ctx.reg, color: opts.total ? C.mist : C.muted });
    rightText(page, ctx.bold, value, x + w, y, opts.total ? 13 : 10, opts.color ?? (opts.total ? C.fog : C.mist));
    y -= opts.total ? 24 : 18;
  };
  row("W-2 income", dash(side.w2Income));
  row(scorp ? "Business net income (K-1)" : "Business net income", money(side.businessNetIncome), { color: C.magenta });
  row("Other income (loss)", dash(side.otherIncome));
  row("Gross income", money(side.grossIncome), { total: true });
  row("Federal taxes", money(side.federalTaxes), { gap: true });
  row(`${stateLabel} taxes`, dash(side.stateTaxes));
  // The corporation's own state tax and elective tax: its own row for an S corporation.
  if (scorp) row(`${stateLabel} S-corp tax & PTET`, dash(side.entityTaxes));
  row("Penalties", dash(side.penalties));
  row(totalLabel, money(side.totalTaxes), { total: true, color: totalColor });
  return y;
}

export async function buildRecapPdf(recap: RecapDoc, recapUrl: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${recap.clientName} - ${recap.taxYear} Tax Recap`);
  doc.setAuthor("DeCypher Financials");
  doc.setCreator("DeCypher Tax Recap");
  const ctx: Ctx = {
    doc,
    bold: forgiving(await doc.embedFont(StandardFonts.HelveticaBold)),
    reg: forgiving(await doc.embedFont(StandardFonts.Helvetica)),
    links: new Map(),
  };
  const c = computeRecap(recap);
  const firstName = recap.clientName.trim().split(/\s+/)[0] || recap.clientName;
  const stateLabel = recap.stateCode ? (US_STATES[recap.stateCode] ?? recap.stateCode) : "State";
  const header = { left: "DeCypher Financials", right: `TAX RECAP  ·  ${recap.taxYear}` };
  const TOTAL = 4;
  // An S corporation's SE-tax saving sits outside the before/after and is
  // added on top, as the page does.
  const scorpSavings = recap.analysis?.scorpSavings?.amount ?? 0;
  const totalSavings = c.savings + scorpSavings;
  const attribution = recap.analysis?.attribution ?? [];

  /* ── 1 · cover ── */
  {
    const page = newPage(ctx, header);
    let y = PAGE.h - 190;
    eyebrow(ctx, page, `${recap.taxYear} tax recap`, M, y);
    y -= 44;
    for (const l of wrap(ctx.bold, `${firstName}, here's your ${recap.taxYear} on one page.`, 34, W)) {
      page.drawText(l, { x: M, y, size: 34, font: ctx.bold, color: C.fog });
      y -= 40;
    }
    y -= 6;
    y = paragraph(page, ctx.reg, "Where your taxes landed before DeCypher, where they landed after, and what comes next.", M, y, 12, 380);
    y -= 28;
    const tw = (W - 16) / 3;
    const th = 72;
    stat(ctx, page, M, y - th, tw, th, "Before DeCypher", money(c.before.totalTaxes), C.danger);
    stat(ctx, page, M + tw + 8, y - th, tw, th, "After DeCypher", money(c.after.totalTaxes), C.fog);
    stat(ctx, page, M + (tw + 8) * 2, y - th, tw, th, "Total tax savings", money(totalSavings), C.teal);
    y -= th + 40;

    card(page, M, y - 96, W, 96);
    eyebrow(ctx, page, "Agenda", M + 18, y - 22);
    const items = ["Your tax summary", "Q&A, if needed", "Housekeeping items"];
    items.forEach((it, i) => {
      page.drawText(`0${i + 1}`, { x: M + 18, y: y - 46 - i * 20, size: 9, font: ctx.bold, color: C.magenta });
      page.drawText(it, { x: M + 44, y: y - 46 - i * 20, size: 12, font: ctx.bold, color: C.fog });
    });
    // income pills, right side of the agenda card
    let px = M + W - 18;
    const pill = (label: string, value: string, color = C.fog) => {
      const t = `${label.toUpperCase()}  ${value}`;
      const tw2 = ctx.bold.widthOfTextAtSize(t, 9) + 24;
      px -= tw2;
      page.drawRectangle({ x: px, y: y - 52, width: tw2, height: 24, color: C.panel2, borderColor: C.edge, borderWidth: 0.6 });
      page.drawText(label.toUpperCase(), { x: px + 12, y: y - 44, size: 7.5, font: ctx.bold, color: C.muted });
      const lw = ctx.bold.widthOfTextAtSize(label.toUpperCase(), 7.5);
      page.drawText(value, { x: px + 12 + lw + 8, y: y - 44.5, size: 9.5, font: ctx.bold, color });
      px -= 8;
    };
    if (c.priorYearIncome !== null) pill(`${recap.taxYear - 1} income`, money(c.priorYearIncome));
    pill(`${recap.taxYear} income`, money(c.currentYearIncome));
    footer(ctx, page, recapUrl, 1, TOTAL);
  }

  /* ── 2 · before / after + savings ── */
  {
    const page = newPage(ctx, header);
    let y = PAGE.h - 96;
    eyebrow(ctx, page, "Tax summary", M, y);
    y -= 26;
    page.drawText("Where your taxes landed", { x: M, y, size: 22, font: ctx.bold, color: C.fog });
    y -= 22;
    const colW = (W - 16) / 2;
    const cardH = c.scorp ? 280 : 262;
    // before
    card(page, M, y - cardH, colW, cardH);
    eyebrow(ctx, page, "Before DeCypher", M + 18, y - 22);
    page.drawText("Income only", { x: M + 18, y: y - 42, size: 14, font: ctx.bold, color: C.fog });
    page.drawText("No write-offs, no strategies", { x: M + 18, y: y - 56, size: 9, font: ctx.reg, color: C.muted });
    ledger(ctx, page, M + 18, y - 84, colW - 36, c.before, stateLabel, "Total taxes owed", C.danger, c.scorp);
    // after
    const ax = M + colW + 16;
    card(page, ax, y - cardH, colW, cardH, C.teal);
    eyebrow(ctx, page, "After DeCypher", ax + 18, y - 22, C.teal);
    page.drawText("Bookkeeping + strategies", { x: ax + 18, y: y - 42, size: 14, font: ctx.bold, color: C.fog });
    page.drawText(c.scorp ? "Your final returns" : "Your final return", { x: ax + 18, y: y - 56, size: 9, font: ctx.reg, color: C.muted });
    ledger(ctx, page, ax + 18, y - 84, colW - 36, c.after, stateLabel, "New total taxes owed", C.teal, c.scorp);
    y -= cardH + 20;

    // savings callout
    const sh = scorpSavings > 0 ? 226 : 168;
    card(page, M, y - sh, W, sh, C.teal);
    eyebrow(ctx, page, "The result", M + 18, y - 22, C.teal);
    page.drawText("Total tax savings", { x: M + 18, y: y - 44, size: 14, font: ctx.bold, color: C.fog });
    page.drawText(money(totalSavings), { x: M + 18, y: y - 88, size: 40, font: ctx.bold, color: C.teal });
    paragraph(
      page,
      ctx.reg,
      scorpSavings > 0
        ? `The difference between what ${recap.taxYear} would have cost on income alone and what it cost with your books done and every strategy applied, plus the self-employment tax your S corporation kept off the table.`
        : `The difference between what ${recap.taxYear} would have cost on income alone and what it cost with your books done and every strategy applied.`,
      M + 260,
      y - 48,
      9.5,
      W - 278,
      C.mist,
    );
    const bw = (W - 36 - 24) / 4;
    const by = y - sh + 14;
    if (scorpSavings > 0) {
      const tw3 = (W - 36 - 16) / 3;
      const split: [string, number, ReturnType<typeof rgb>][] = [
        ["Bookkeeping + strategies", c.savings, C.fog],
        ["S-corp: SE tax avoided", scorpSavings, C.fog],
        ["Total tax savings", totalSavings, C.teal],
      ];
      split.forEach(([l, v, col], i) => stat(ctx, page, M + 18 + i * (tw3 + 8), by + 58, tw3, 50, l, money(v), col, 14));
    }
    const tiles: [string, number][] = [
      ["Deductions found", c.breakdown.deductionsFound],
      c.scorp ? ["S-corp state tax & PTET saved", c.breakdown.entitySaved] : ["SE tax saved", c.breakdown.seTaxSaved],
      ["Income tax saved", c.breakdown.incomeTaxSaved],
      [`${stateLabel} tax saved`, c.breakdown.stateSaved + c.breakdown.penaltiesSaved],
    ];
    tiles.forEach(([l, v], i) => stat(ctx, page, M + 18 + i * (bw + 8), by, bw, 50, l, signed(v), C.fog, 14));
    footer(ctx, page, recapUrl, 2, TOTAL);
  }

  /* ── 3 · at filing + strategy ── */
  {
    const page = newPage(ctx, header);
    let y = PAGE.h - 96;
    eyebrow(ctx, page, "At filing", M, y);
    y -= 26;
    page.drawText("Taxes due or refund", { x: M, y, size: 22, font: ctx.bold, color: C.fog });
    y -= 26;
    const rows: [string, { owed: number; paid: number; due: number }][] = [
      ["Federal", c.filing.federal],
      [stateLabel, c.filing.state],
      ...(c.filing.entity ? ([["S-corp (PTET)", c.filing.entity]] as [string, { owed: number; paid: number; due: number }][]) : []),
    ];
    for (const [label, line] of rows) {
      page.drawRectangle({ x: M, y: y - 40, width: W, height: 40, color: C.panel, borderColor: C.edge, borderWidth: 0.6 });
      page.drawText(label, { x: M + 16, y: y - 24, size: 12, font: ctx.bold, color: C.fog });
      page.drawText(`${money(line.owed)} owed  −  ${money(line.paid)} paid`, { x: M + 130, y: y - 24, size: 9.5, font: ctx.reg, color: C.muted });
      const refund = line.due < 0;
      const t = `${money(Math.abs(line.due))} ${refund ? "REFUND" : "DUE"}`;
      rightText(page, ctx.bold, t, M + W - 16, y - 24, 12, refund ? C.teal : C.danger);
      y -= 46;
    }
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: M + W, y: y - 2 }, thickness: 1, color: C.edge });
    y -= 24;
    page.drawText("Total", { x: M + 16, y, size: 12, font: ctx.bold, color: C.mist });
    {
      const refund = c.filing.total < 0;
      rightText(page, ctx.bold, `${money(Math.abs(c.filing.total))} ${refund ? "REFUND" : "DUE"}`, M + W - 16, y, 16, refund ? C.teal : C.danger);
    }
    y -= 22;
    y = paragraph(page, ctx.reg, "Owed is the tax on the return. Paid is what was already sent in through withholding and estimated payments. What's left is due at filing, or comes back as a refund.", M, y, 9, W, C.dusk);

    // Where the savings came from: one line per strategy, adding up to the total.
    if (attribution.length) {
      y -= 30;
      eyebrow(ctx, page, "Where it came from", M, y);
      y -= 24;
      page.drawText("Savings by strategy", { x: M, y, size: 18, font: ctx.bold, color: C.fog });
      y -= 24;
      for (const a of attribution) {
        page.drawText(a.label, { x: M, y, size: 10.5, font: ctx.reg, color: C.fog });
        rightText(page, ctx.bold, signed(a.savings), M + W, y, 10.5, a.savings >= 0 ? C.teal : C.danger);
        y -= 16;
      }
      page.drawLine({ start: { x: M, y: y + 6 }, end: { x: M + W, y: y + 6 }, thickness: 1, color: C.edge });
      y -= 8;
      page.drawText("Bookkeeping + strategies", { x: M, y, size: 10.5, font: ctx.bold, color: C.mist });
      rightText(page, ctx.bold, money(c.savings), M + W, y, 12, C.teal);
      y -= 16;
      if (recap.analysis?.scorpSavings) {
        page.drawText("S corporation: self-employment tax avoided (estimated)", { x: M, y, size: 10.5, font: ctx.reg, color: C.fog });
        rightText(page, ctx.bold, money(recap.analysis.scorpSavings.amount), M + W, y, 10.5, C.teal);
        y -= 16;
      }
    }

    if (recap.strategies.length) {
      y -= 34;
      eyebrow(ctx, page, "Improvements", M, y);
      y -= 26;
      page.drawText("Tax strategy going forward", { x: M, y, size: 22, font: ctx.bold, color: C.fog });
      y -= 30;
      recap.strategies.forEach((s, i) => {
        page.drawText(String(i + 1).padStart(2, "0"), { x: M, y, size: 9, font: ctx.bold, color: C.magenta });
        y = paragraph(page, ctx.reg, s, M + 28, y, 11.5, W - 28, C.fog, 1.4);
        y -= 8;
      });
    }
    footer(ctx, page, recapUrl, 3, TOTAL);
  }

  /* ── 4 · next steps ── */
  {
    const page = newPage(ctx, header);
    let y = PAGE.h - 96;
    eyebrow(ctx, page, "Next steps", M, y);
    y -= 26;
    page.drawText("What to do now", { x: M, y, size: 22, font: ctx.bold, color: C.fog });
    y -= 30;
    const steps = recap.nextSteps.length ? recap.nextSteps : [];
    for (const s of steps) {
      const options = s.options ?? [];
      const h = options.length ? 44 + options.length * 22 : s.href ? 52 : 40;
      page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: C.panel, borderColor: s.href || options.length ? C.magenta : C.edge, borderWidth: s.href || options.length ? 0.8 : 0.6 });
      page.drawCircle({ x: M + 18, y: y - 21, size: 3, color: C.magenta });
      page.drawText(s.label, { x: M + 32, y: y - 25, size: 13, font: ctx.bold, color: C.fog });
      if (s.href && !options.length) {
        page.drawText(s.href, { x: M + 32, y: y - 42, size: 9, font: ctx.reg, color: C.teal });
        link(ctx, page, M, y - h, W, h, s.href);
      }
      options.forEach((o, i) => {
        const oy = y - 46 - i * 22;
        page.drawText(`${o.label}:`, { x: M + 32, y: oy, size: 10, font: ctx.bold, color: C.mist });
        const lw = ctx.bold.widthOfTextAtSize(`${o.label}:`, 10) + 8;
        page.drawText(o.href, { x: M + 32 + lw, y: oy, size: 9, font: ctx.reg, color: C.teal });
        link(ctx, page, M + 32, oy - 4, W - 48, 16, o.href);
      });
      y -= h + 12;
    }
    y -= 12;
    card(page, M, y - 70, W, 70);
    page.drawText("Your recap online", { x: M + 18, y: y - 24, size: 12, font: ctx.bold, color: C.fog });
    page.drawText(recapUrl, { x: M + 18, y: y - 44, size: 10, font: ctx.reg, color: C.teal });
    link(ctx, page, M, y - 70, W, 70, recapUrl);
    footer(ctx, page, recapUrl, 4, TOTAL);
  }

  flushLinks(ctx);
  return doc.save();
}

/** The download name: "Inha Voloshchakevych - 2025 Tax Recap.pdf". */
export function recapPdfFilename(recap: RecapDoc): string {
  const safe = recap.clientName.replace(/[^\w .'-]+/g, "").trim() || "Client";
  return `${safe} - ${recap.taxYear} Tax Recap.pdf`;
}
