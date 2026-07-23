import "server-only";
import { Resend } from "resend";
import { client as sanity } from "@/sanity/client";
import type { LeadEmailSettings } from "@/sanity/types";
import type { Lead } from "./lead";
import {
  Recommendations,
  buildRecommendations,
} from "./estimator-recommendations";
import { ESTIMATOR_CONFIG, EstimateInputs, EstimateResult, fmt } from "./tax";

/**
 * The lead's copy of their estimate, sent through Resend.
 *
 * All tax wording comes from buildRecommendations — the same source the widget
 * renders — so this file must never author a tax claim of its own. What's
 * written here is envelope only: greeting, framing, sign-off, disclaimer. Those
 * lines are marked REVIEW COPY below; everything else is generated.
 *
 * Styling is inline and the layout is tables, because email clients are a decade
 * behind: Gmail strips <style>, Outlook renders through Word. The palette is
 * light rather than the site's dark, since dark backgrounds are inverted
 * unpredictably by several clients.
 */

const BRAND = {
  magenta: "#FF2D78",
  ink: "#12101A",
  body: "#3F3B4D",
  muted: "#6B6680",
  hair: "#E6E3EE",
  wash: "#FAF9FC",
  danger: "#B4233A",
  dangerWash: "#FDF1F3",
};

export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailError";
  }
}

/** Lead-supplied strings land in HTML; a name with an angle bracket must not. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function savingsLabel(r: EstimateResult): string | null {
  if (r.savingsHigh <= 0) return null;
  return r.savingsHigh - r.savingsLow >= 500
    ? `${fmt(r.savingsLow)}–${fmt(r.savingsHigh)}`
    : fmt(r.savingsHigh);
}

function renderHtml(
  lead: Lead,
  r: EstimateResult,
  recs: Recommendations,
): string {
  const savings = savingsLabel(r);
  const effLabel = `${r.effRate.toFixed(1).replace(/\.0$/, "")}%`;

  const flags = recs.flags
    .map((f) => {
      const danger = f.tone === "danger";
      return `
      <tr><td style="padding:0 0 10px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="border:1px solid ${danger ? "#F3C9D1" : BRAND.hair};background:${danger ? BRAND.dangerWash : BRAND.wash};border-radius:10px;">
          <tr><td style="padding:12px 14px;font-size:14px;line-height:1.5;color:${BRAND.body};">
            ${f.icon} <strong style="color:${danger ? BRAND.danger : BRAND.ink};">${esc(f.lead)}</strong> ${esc(f.body)}
          </td></tr>
        </table>
      </td></tr>`;
    })
    .join("");

  const drivers = recs.drivers
    .map(
      (d) => `
      <tr><td style="padding:10px 0;border-bottom:1px solid ${BRAND.hair};font-size:14.5px;line-height:1.5;color:${BRAND.body};">
        <strong style="color:${BRAND.ink};">${esc(d.lead)}</strong> ${esc(d.body)}
      </td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.wash};">
  <!-- preheader: the grey line clients show beside the subject -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Your estimated ${fmt(r.total)} tax bill${savings ? `, and up to ${fmt(r.savingsHigh)} we think you could save.` : "."}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.wash};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
        style="max-width:560px;background:#FFFFFF;border:1px solid ${BRAND.hair};border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

        <tr><td style="padding:26px 26px 0;">
          <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.magenta};font-weight:700;">
            ${esc(ESTIMATOR_CONFIG.firmName)}
          </div>
        </td></tr>

        <!-- REVIEW COPY: greeting + framing -->
        <tr><td style="padding:14px 26px 0;">
          <h1 style="margin:0 0 8px;font-size:22px;line-height:1.25;color:${BRAND.ink};">Your tax estimate</h1>
          <p style="margin:0;font-size:14.5px;line-height:1.55;color:${BRAND.body};">
            Hi ${esc(lead.name)}, here&rsquo;s the copy of the estimate you just ran,
            along with what we&rsquo;d look at first.
          </p>
        </td></tr>

        <tr><td style="padding:20px 26px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid ${BRAND.hair};border-radius:12px;background:${BRAND.wash};">
            <tr><td align="center" style="padding:20px 16px;">
              <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.muted};">Estimated total tax</div>
              <div style="margin:6px 0 4px;font-size:40px;line-height:1;font-weight:700;color:${BRAND.magenta};">${fmt(r.total)}</div>
              <div style="font-size:13px;color:${BRAND.muted};">roughly ${effLabel} of your income</div>
            </td></tr>
          </table>
        </td></tr>

        ${
          savings
            ? `<tr><td style="padding:12px 26px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="border:1px solid #F3C9D1;border-radius:12px;background:#FFF5F8;">
            <tr><td align="center" style="padding:16px;">
              <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.muted};">Potential tax savings</div>
              <div style="margin:6px 0 0;font-size:26px;line-height:1;font-weight:700;color:${BRAND.magenta};">${savings}</div>
            </td></tr>
          </table>
        </td></tr>`
            : ""
        }

        <tr><td style="padding:24px 26px 0;">
          <h2 style="margin:0 0 2px;font-size:17px;color:${BRAND.ink};">Our recommendations</h2>
          <p style="margin:0 0 14px;font-size:13.5px;color:${BRAND.muted};">What we found, and what we&rsquo;d do about it.</p>
          ${flags ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${flags}</table>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${drivers}</table>
        </td></tr>

        <tr><td align="center" style="padding:24px 26px 0;">
          <a href="${ESTIMATOR_CONFIG.bookingUrl}"
            style="display:inline-block;padding:14px 24px;border-radius:11px;background:${BRAND.magenta};color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;">
            Book your complimentary 1:1 tax strategy call
          </a>
        </td></tr>

        <!-- REVIEW COPY: sign-off + disclaimer -->
        <tr><td style="padding:24px 26px 26px;">
          <div style="border-top:1px solid ${BRAND.hair};padding-top:16px;font-size:12px;line-height:1.55;color:${BRAND.muted};">
            <p style="margin:0 0 8px;">&mdash; The ${esc(ESTIMATOR_CONFIG.firmName)} team</p>
            <p style="margin:0;">
              This is an estimate based on the figures you entered, not tax advice.
              Your actual liability depends on details a full review would surface.
              You&rsquo;re receiving this because you asked us to email your
              estimate at ${esc(ESTIMATOR_CONFIG.bookingUrl.replace(/^https?:\/\//, "").split("/")[0])}.
            </p>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Plain-text alternative. Absent, spam filters mark the message down. */
function renderText(lead: Lead, r: EstimateResult, recs: Recommendations): string {
  const savings = savingsLabel(r);
  const lines = [
    `Hi ${lead.name}, here's the copy of the estimate you just ran, along with what we'd look at first.`,
    "",
    `ESTIMATED TOTAL TAX: ${fmt(r.total)} (roughly ${r.effRate.toFixed(1).replace(/\.0$/, "")}% of your income)`,
  ];
  if (savings) lines.push(`POTENTIAL TAX SAVINGS: ${savings}`);
  lines.push("", "OUR RECOMMENDATIONS", "What we found, and what we'd do about it.", "");
  for (const f of recs.flags) lines.push(`* ${f.lead} ${f.body}`, "");
  for (const d of recs.drivers) lines.push(`* ${d.lead} ${d.body}`, "");
  lines.push(
    `Book your complimentary 1:1 tax strategy call: ${ESTIMATOR_CONFIG.bookingUrl}`,
    "",
    `— The ${ESTIMATOR_CONFIG.firmName} team`,
    "",
    "This is an estimate based on the figures you entered, not tax advice.",
  );
  return lines.join("\n");
}

// A bare address, no display name. Same character set the lead route enforces;
// anything looser from the CMS falls back to env rather than failing the send.
const ADDRESS_RE = /^[^\s@<>|]+@[^\s@<>|]+\.[^\s@<>|]+$/;

/**
 * Who the estimate email comes from, and where replies land.
 *
 * Sanity (Site Settings → Email) wins so the client can change the sender
 * without a deploy; RESEND_FROM / RESEND_REPLY_TO are the fallback and the
 * safety net — a malformed CMS address or a Sanity outage degrades to env
 * instead of dropping the email a visitor was just promised.
 */
async function resolveEnvelope(): Promise<{ from: string; replyTo?: string }> {
  let cms: LeadEmailSettings | null = null;
  try {
    cms = await sanity.fetch(`*[_type == "siteSettings"][0].leadEmail`);
  } catch (e) {
    console.error("[lead-email] Sanity envelope fetch failed, using env:", e);
  }

  let from: string | undefined;
  if (cms?.fromAddress && ADDRESS_RE.test(cms.fromAddress)) {
    // Angle brackets in the name would terminate the address early — strip
    // rather than reject, a name is decoration.
    const name = cms.fromName?.replace(/[<>"]/g, "").trim();
    from = name ? `${name} <${cms.fromAddress}>` : cms.fromAddress;
  }
  from ||= process.env.RESEND_FROM;
  if (!from) throw new EmailError("No sender: Site Settings → Email is empty and RESEND_FROM is not set");

  // Replies are a warm lead. Without this they land on the From address,
  // which may be a send-only mailbox nobody reads.
  const replyTo =
    cms?.replyTo && ADDRESS_RE.test(cms.replyTo)
      ? cms.replyTo
      : process.env.RESEND_REPLY_TO || undefined;

  return { from, replyTo };
}

/**
 * Send the lead their estimate. Throws EmailError; the caller decides what the
 * visitor sees.
 */
export async function sendLeadEmail(
  lead: Lead,
  inputs: EstimateInputs,
  r: EstimateResult,
): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailError("RESEND_API_KEY is not set");

  const { from, replyTo } = await resolveEnvelope();

  const recs = buildRecommendations(inputs, r);
  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from,
    to: lead.email,
    replyTo,
    subject: `${lead.name}, your estimated tax bill is ${fmt(r.total)}`,
    html: renderHtml(lead, r, recs),
    text: renderText(lead, r, recs),
  });

  // The SDK returns errors in-band rather than throwing.
  if (error) throw new EmailError(`${error.name}: ${error.message}`);
  if (!data) throw new EmailError("Resend returned no id");
  return { id: data.id };
}
