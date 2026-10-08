import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFRef } from "pdf-lib";
import QRCode from "qrcode";
import { centsPerDollar } from "@/lib/decyphered/buildRecap";
import { videoIsCurrent } from "@/lib/decyphered/fromRecap";
import { recapSurveyHref } from "@/lib/feedback/links";
import { computeRecap, type EntityKind, type RecapSide } from "./compute";
import type { RecapDoc } from "./schema";
import { US_STATES } from "./tables";

/**
 * The recap as a PDF: the same beats as the page in the same order (cover,
 * before, savings, after, by strategy, at filing, strategy, next steps),
 * set in the site's palette on five Letter pages, with every link live. Built from the recap's numbers
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

type Color = ReturnType<typeof rgb>;

/** A QR code drawn as vector modules on a white plate (with its quiet zone), so it scans off a dark page. */
function qrCode(page: PDFPage, text: string, x: number, y: number, size: number) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = modules.size;
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!modules.get(r, c)) continue;
      // rows run down the code, PDF y runs up the page
      page.drawRectangle({ x: x + (c + quiet) * cell, y: y + size - (r + quiet + 1) * cell, width: cell, height: cell, color: C.night });
    }
  }
}
type LedgerRow = [label: string, value: string, opts?: { total?: boolean; color?: Color }];

/** A ledger column: label left, value right, totals with a rule above. Returns the y below it. */
function ledger(ctx: Ctx, page: PDFPage, x: number, top: number, w: number, rows: LedgerRow[]): number {
  let y = top;
  for (const [label, value, opts = {}] of rows) {
    if (opts.total) {
      page.drawLine({ start: { x, y: y + 6 }, end: { x: x + w, y: y + 6 }, thickness: 1, color: C.edge });
      y -= 8;
    }
    page.drawText(label, { x, y, size: opts.total ? 10.5 : 9.5, font: opts.total ? ctx.bold : ctx.reg, color: opts.total ? C.mist : C.muted });
    rightText(page, ctx.bold, value, x + w, y, opts.total ? 13 : 10, opts.color ?? (opts.total ? C.fog : C.mist));
    y -= opts.total ? 24 : 18;
  }
  return y;
}

/**
 * One side of the sandwich, as the page draws it: heading, the year's total
 * as the hero figure, the cents-per-dollar bar (the after's with the
 * before's extent left behind it), and the ledger in two columns, income and
 * taxes. Returns the y below it.
 */
function stage(
  ctx: Ctx,
  page: PDFPage,
  top: number,
  o: {
    label: string;
    title: string;
    sub: string;
    side: RecapSide;
    color: Color;
    /** The bar's one scale on both sides: the before return's total income. */
    scale: number;
    /** The after only: the before side, for the "was" figure and the bar's ghost. */
    was?: RecapSide;
    stateLabel: string;
    entityKind: EntityKind;
  },
): number {
  let y = top;
  eyebrow(ctx, page, o.label, M, y, o.color);
  y -= 26;
  page.drawText(o.title, { x: M, y, size: 22, font: ctx.bold, color: C.fog });
  y -= 18;
  y = paragraph(page, ctx.reg, o.sub, M, y, 9.5, W, C.muted);
  y -= 34;
  page.drawText(money(o.side.totalTaxes), { x: M, y, size: 44, font: ctx.bold, color: o.color });
  y -= 20;
  const label = "TOTAL TAXES OWED";
  page.drawText(label, { x: M, y, size: 7.5, font: ctx.bold, color: C.muted });
  if (o.was !== undefined) {
    const lx = M + ctx.bold.widthOfTextAtSize(label, 7.5) + 10;
    const was = `WAS ${money(o.was.totalTaxes)}`;
    page.drawText(was, { x: lx, y, size: 7.5, font: ctx.bold, color: C.mist });
    // struck through, as the page shows it
    const sx = lx + ctx.bold.widthOfTextAtSize("WAS ", 7.5);
    page.drawLine({ start: { x: sx, y: y + 2.6 }, end: { x: lx + ctx.bold.widthOfTextAtSize(was, 7.5), y: y + 2.6 }, thickness: 0.8, color: C.danger });
  }
  y -= 30;

  // Cents of every dollar brought in that went to tax, on one scale for both
  // sides (the before's total income), rounded as the page and the
  // DeCyphered video round it.
  if (o.scale > 0 && o.side.totalTaxes >= 0) {
    const exact = (v: number) => Math.max(0, Math.min(1, v / o.scale));
    const before = o.was ? centsPerDollar(o.was.totalTaxes, o.scale) : null;
    const lead = `${centsPerDollar(o.side.totalTaxes, o.scale)}¢`;
    page.drawText(lead, { x: M, y, size: 15, font: ctx.bold, color: C.fog });
    const rest = ` of every dollar you brought in${before !== null ? `, down from ${before}¢` : ""}`;
    page.drawText(rest, { x: M + ctx.bold.widthOfTextAtSize(lead, 15), y, size: 10, font: ctx.reg, color: C.mist });
    rightText(page, ctx.bold, `${money(o.scale)} BROUGHT IN`, M + W, y, 7.5, C.muted);
    y -= 16;
    page.drawRectangle({ x: M, y, width: W, height: 8, color: o.color, opacity: 0.16 });
    if (o.was) page.drawRectangle({ x: M, y, width: W * exact(o.was.totalTaxes), height: 8, color: C.danger, opacity: 0.4 });
    page.drawRectangle({ x: M, y, width: W * exact(o.side.totalTaxes), height: 8, color: o.color });
    y -= 34;
  }

  const colW = (W - 36) / 2;
  const right = M + colW + 36;
  page.drawText("INCOME ON THE RETURN", { x: M, y, size: 7.5, font: ctx.bold, color: C.dusk });
  page.drawText("TAXES", { x: right, y, size: 7.5, font: ctx.bold, color: C.dusk });
  y -= 20;
  const s = o.side;
  const st = o.stateLabel;
  const left = ledger(ctx, page, M, y, colW, [
    ["W-2 income", dash(s.w2Income)],
    [o.entityKind ? "Business net income (K-1)" : "Business net income", money(s.businessNetIncome), { color: C.magenta }],
    ["Other income (loss)", dash(s.otherIncome)],
    ["Gross income", money(s.grossIncome), { total: true }],
  ]);
  const taxes = ledger(ctx, page, right, y, colW, [
    ["Federal taxes", money(s.federalTaxes)],
    [`${st} taxes`, dash(s.stateTaxes)],
    // The entity's own state tax: its own row for an S corporation (tax plus the elective tax) or an LLC (annual tax plus fee).
    ...(o.entityKind === "scorp" ? ([[`${st} S-corp tax & PTET`, dash(s.entityTaxes)]] as LedgerRow[]) : []),
    ...(o.entityKind === "partnership" ? ([[`${st} LLC tax & fee`, dash(s.entityTaxes)]] as LedgerRow[]) : []),
    ["Penalties", dash(s.penalties)],
    ["Total taxes owed", money(s.totalTaxes), { total: true, color: o.color }],
  ]);
  return Math.min(left, taxes);
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
  const TOTAL = 5;
  // An S corporation's SE-tax saving sits outside the before/after and is
  // added on top, as the page does.
  const scorpSavings = recap.analysis?.scorpSavings?.amount ?? 0;
  const totalSavings = c.savings + scorpSavings;
  const attribution = recap.analysis?.attribution ?? [];
  // The before doesn't claim the dependents (engine v8 on); a recap saved
  // earlier shows them beside the total, as the page does.
  const kids = recap.analysis?.kids ?? null;
  const kidsBeside = kids && !kids.inBefore && kids.after > 0 ? kids : null;

  /* ── 1 · cover: the headline, and only the before under it ── */
  {
    const page = newPage(ctx, header);
    let y = PAGE.h - 190;
    eyebrow(ctx, page, `${recap.taxYear} tax recap`, M, y);
    y -= 46;
    page.drawText(`${firstName}, you saved`, { x: M, y, size: 38, font: ctx.bold, color: C.fog });
    y -= 44;
    page.drawText(money(totalSavings), { x: M, y, size: 38, font: ctx.bold, color: C.teal });
    y -= 30;
    y = paragraph(page, ctx.reg, "Where your taxes landed before DeCypher, where they landed after, and what comes next.", M, y, 12, 380);
    y -= 26;
    const th = 72;
    stat(ctx, page, M, y - th, 200, th, "Before DeCypher", money(c.before.totalTaxes), C.danger);
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

  /* ── 2 · before, then the savings ── */
  {
    const page = newPage(ctx, header);
    let y = stage(ctx, page, PAGE.h - 96, {
      label: "Before DeCypher",
      title: `What ${recap.taxYear} would have cost`,
      sub: `Your income with nothing taken off it: no write-offs, no strategies${kids?.inBefore ? ", no dependents claimed" : ""}.`,
      side: c.before,
      color: C.danger,
      scale: c.before.grossIncome,
      stateLabel,
      entityKind: c.entityKind,
    });
    y -= 14;

    const sh = scorpSavings > 0 ? 150 : 124;
    card(page, M, y - sh, W, sh, C.teal);
    eyebrow(ctx, page, "The difference", M + 18, y - 22, C.teal);
    page.drawText("Total tax savings", { x: M + 18, y: y - 44, size: 14, font: ctx.bold, color: C.fog });
    page.drawText(money(totalSavings), { x: M + 18, y: y - 92, size: 40, font: ctx.bold, color: C.teal });
    paragraph(
      page,
      ctx.reg,
      scorpSavings > 0
        ? `What ${recap.taxYear} would have cost on income alone, less what it cost with your books done and every strategy applied, plus the self-employment tax your S corporation kept off the table.`
        : `What ${recap.taxYear} would have cost on income alone, less what it cost with your books done and every strategy applied.`,
      M + 260,
      y - 48,
      9.5,
      W - 278,
      C.mist,
    );
    if (scorpSavings > 0) {
      page.drawText(
        `${money(c.savings)} between your two returns  +  ${money(scorpSavings)} of self-employment tax your S corporation avoided`,
        { x: M + 18, y: y - sh + 18, size: 9.5, font: ctx.reg, color: C.mist },
      );
    }
    footer(ctx, page, recapUrl, 2, TOTAL);
  }

  /* ── 3 · after, then where the savings came from ── */
  {
    const page = newPage(ctx, header);
    let y = stage(ctx, page, PAGE.h - 96, {
      label: "After DeCypher",
      title: "What it cost with DeCypher",
      sub: `Your books done and every strategy applied: the ${c.scorp ? "returns" : "return"} you're filing.`,
      side: c.after,
      color: C.teal,
      scale: c.before.grossIncome,
      was: c.before,
      stateLabel,
      entityKind: c.entityKind,
    });

    // One line per strategy, adding up to the total.
    if (attribution.length) {
      y -= 18;
      eyebrow(ctx, page, "Where it came from", M, y);
      y -= 24;
      page.drawText("Savings by strategy", { x: M, y, size: 18, font: ctx.bold, color: C.fog });
      y -= 24;
      for (const a of attribution) {
        page.drawText(a.label, { x: M, y, size: 10.5, font: ctx.reg, color: C.fog });
        rightText(page, ctx.bold, signed(a.savings), M + W, y, 10.5, a.savings >= 0 ? C.teal : C.danger);
        y -= 16;
      }
      const total = (label: string, value: number, color: Color) => {
        page.drawLine({ start: { x: M, y: y + 6 }, end: { x: M + W, y: y + 6 }, thickness: 1, color: C.edge });
        y -= 8;
        page.drawText(label, { x: M, y, size: 10.5, font: ctx.bold, color: C.mist });
        rightText(page, ctx.bold, money(value), M + W, y, 12, color);
        y -= 18;
      };
      if (recap.analysis?.scorpSavings) {
        total("Between your two returns", c.savings, C.fog);
        page.drawText("S corporation: self-employment tax avoided (estimated)", { x: M, y, size: 10.5, font: ctx.reg, color: C.fog });
        rightText(page, ctx.bold, money(recap.analysis.scorpSavings.amount), M + W, y, 10.5, C.teal);
        y -= 16;
      }
      total("Total tax savings", totalSavings, C.teal);
      if (kidsBeside) {
        y -= 4;
        paragraph(
          page,
          ctx.reg,
          `Not in your total: your ${kidsBeside.dependents === 1 ? "dependent" : "dependents"} took ${money(kidsBeside.after)} off this return. They're claimed on both versions of ${recap.taxYear}, so they aren't part of your savings.`,
          M,
          y,
          8.5,
          W,
          C.dusk,
        );
      }
    }
    footer(ctx, page, recapUrl, 3, TOTAL);
  }

  /* ── 4 · at filing (owed − paid = due) + strategy ── */
  {
    const page = newPage(ctx, header);
    let y = PAGE.h - 96;
    const refund = c.filing.total < 0;
    eyebrow(ctx, page, "At filing", M, y);
    y -= 26;
    page.drawText(refund ? "Your refund" : "Taxes due at filing", { x: M, y, size: 22, font: ctx.bold, color: C.fog });
    y -= 22;
    const lines: [string, { owed: number; paid: number; due: number }][] = [
      ["Federal", c.filing.federal],
      [stateLabel, c.filing.state],
      ...(c.filing.entity
        ? ([[c.entityKind === "partnership" ? "LLC / partnership" : "S-corp (PTET)", c.filing.entity]] as [string, { owed: number; paid: number; due: number }][])
        : []),
    ];
    // The year in three figures: owed, already paid, and what's left.
    const owed = lines.reduce((s, [, l]) => s + l.owed, 0);
    const paid = lines.reduce((s, [, l]) => s + l.paid, 0);
    const op = 26;
    const fw = (W - op * 2) / 3;
    const fh = 64;
    stat(ctx, page, M, y - fh, fw, fh, `Owed for ${recap.taxYear}`, money(owed), C.fog, 20);
    page.drawText("-", { x: M + fw + op / 2 - 4, y: y - fh / 2 - 6, size: 20, font: ctx.bold, color: C.dusk });
    stat(ctx, page, M + fw + op, y - fh, fw, fh, "Already paid", money(paid), C.teal, 20);
    page.drawText("=", { x: M + fw * 2 + op * 1.5 - 5, y: y - fh / 2 - 6, size: 20, font: ctx.bold, color: C.dusk });
    stat(ctx, page, M + (fw + op) * 2, y - fh, fw, fh, refund ? "Refund" : "Due at filing", money(Math.abs(c.filing.total)), refund ? C.teal : C.danger, 20);
    y -= fh + 14;

    for (const [label, line] of lines) {
      page.drawRectangle({ x: M, y: y - 32, width: W, height: 32, color: C.panel, borderColor: C.edge, borderWidth: 0.6 });
      page.drawText(label, { x: M + 16, y: y - 20, size: 11, font: ctx.bold, color: C.fog });
      page.drawText(`${money(line.owed)} owed  −  ${money(line.paid)} paid`, { x: M + 130, y: y - 20, size: 9.5, font: ctx.reg, color: C.muted });
      const r = line.due < 0;
      rightText(page, ctx.bold, `${money(Math.abs(line.due))} ${r ? "REFUND" : "DUE"}`, M + W - 16, y - 20, 11, r ? C.teal : C.danger);
      y -= 37;
    }
    y -= 8;
    y = paragraph(page, ctx.reg, "Owed is the tax on the return for the whole year. Paid is what already went in through withholding and estimated payments. What's left is due when you file, or comes back to you.", M, y, 9, W, C.dusk);

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
    footer(ctx, page, recapUrl, 4, TOTAL);
  }

  /* ── 5 · next steps ── */
  {
    const page = newPage(ctx, header);
    let y = PAGE.h - 96;
    eyebrow(ctx, page, "Next steps", M, y);
    y -= 26;
    page.drawText("What to do now", { x: M, y, size: 22, font: ctx.bold, color: C.fog });
    y -= 30;
    const steps = recap.nextSteps.length ? recap.nextSteps : [];
    // Survey links go to the in-house survey with the client filled in, on
    // the same host as the recap link this PDF prints. The personalised URL
    // is long, so the page shows the bare survey address and the link
    // carries the rest.
    const origin = new URL(recapUrl).origin;
    const target = (href: string) => {
      const out = recapSurveyHref(href, recap, origin);
      if (out === href) return { href, shown: href };
      const u = new URL(out);
      return { href: out, shown: `${u.host}${u.pathname}` };
    };
    for (const s of steps) {
      const options = s.options ?? [];
      const h = options.length ? 44 + options.length * 22 : s.href ? 52 : 40;
      page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: C.panel, borderColor: s.href || options.length ? C.magenta : C.edge, borderWidth: s.href || options.length ? 0.8 : 0.6 });
      page.drawCircle({ x: M + 18, y: y - 21, size: 3, color: C.magenta });
      page.drawText(s.label, { x: M + 32, y: y - 25, size: 13, font: ctx.bold, color: C.fog });
      if (s.href && !options.length) {
        const t = target(s.href);
        page.drawText(t.shown, { x: M + 32, y: y - 42, size: 9, font: ctx.reg, color: C.teal });
        link(ctx, page, M, y - h, W, h, t.href);
      }
      options.forEach((o, i) => {
        const oy = y - 46 - i * 22;
        const t = target(o.href);
        page.drawText(`${o.label}:`, { x: M + 32, y: oy, size: 10, font: ctx.bold, color: C.mist });
        const lw = ctx.bold.widthOfTextAtSize(`${o.label}:`, 10) + 8;
        page.drawText(t.shown, { x: M + 32 + lw, y: oy, size: 9, font: ctx.reg, color: C.teal });
        link(ctx, page, M + 32, oy - 4, W - 48, 16, t.href);
      });
      y -= h + 12;
    }
    y -= 12;

    // The DeCyphered video can't live in a PDF; the QR code opens it on the
    // client's phone, Share button and all (/recap/<token>/share).
    if (recap.video && videoIsCurrent(recap)) {
      const shareLink = `${recapUrl}/share`;
      const ch = 150;
      card(page, M, y - ch, W, ch, C.magenta);
      const qrSize = 114;
      const qx = M + W - 18 - qrSize;
      const qy = y - 18 - qrSize;
      qrCode(page, shareLink, qx, qy, qrSize);
      link(ctx, page, qx, qy, qrSize, qrSize, shareLink);
      eyebrow(ctx, page, "Your DeCyphered", M + 18, y - 24);
      page.drawText("Post your year to your story", { x: M + 18, y: y - 46, size: 15, font: ctx.bold, color: C.fog });
      paragraph(
        page,
        ctx.reg,
        `We made your ${recap.taxYear} into a short video for Instagram. Scan the code with your phone's camera to open it with a Share button. Tag @we.decypher when you post it and we'll send you a $50 Visa gift card.`,
        M + 18,
        y - 66,
        10,
        W - 36 - qrSize - 24,
        C.mist,
      );
      page.drawText(shareLink, { x: M + 18, y: y - ch + 16, size: 8.5, font: ctx.reg, color: C.teal });
      y -= ch + 14;
    }

    card(page, M, y - 70, W, 70);
    page.drawText("Your recap online", { x: M + 18, y: y - 24, size: 12, font: ctx.bold, color: C.fog });
    page.drawText(recapUrl, { x: M + 18, y: y - 44, size: 10, font: ctx.reg, color: C.teal });
    link(ctx, page, M, y - 70, W, 70, recapUrl);
    footer(ctx, page, recapUrl, 5, TOTAL);
  }

  flushLinks(ctx);
  return doc.save();
}

/** The download name: "Inha Voloshchakevych - 2025 Tax Recap.pdf". */
export function recapPdfFilename(recap: RecapDoc): string {
  const safe = recap.clientName.replace(/[^\w .'-]+/g, "").trim() || "Client";
  return `${safe} - ${recap.taxYear} Tax Recap.pdf`;
}
