import "server-only";
import type { Application } from "./application";
import type { Lead } from "./lead";
import { EstimateInputs, EstimateResult, fmt } from "./tax";

/**
 * Slack notifications, via Incoming Webhooks. Each webhook is bound to one
 * channel: leads go to SLACK_WEBHOOK_URL (#leads), applications to
 * SLACK_RECRUITING_WEBHOOK_URL (#recruiting), won deals to
 * SLACK_ONBOARDING_WEBHOOK_URL, client feedback to SLACK_FEEDBACK_WEBHOOK_URL
 * (#client-feedback). Same app in Slack, one hook per channel.
 *
 * A webhook URL is a bearer credential — anyone holding it can post into that
 * channel as this app — so these are server-only and never reach the browser.
 *
 * An unset hook is a supported state, not an error: each flow can ship before
 * its channel exists. postToChannel returns "skipped" so a missing hook can't
 * take the submission down with it.
 */

export type SlackOutcome = "sent" | "skipped";

export class SlackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackError";
  }
}

/**
 * Post one message, or skip if the hook isn't configured. `label` names the
 * missing env var in the warning so a silent channel is diagnosable. `text` is
 * the fallback line shown in the sidebar / on a phone before blocks render.
 */
async function postToChannel(
  url: string | undefined,
  label: string,
  text: string,
  blocks: unknown[],
): Promise<SlackOutcome> {
  if (!url) {
    console.warn(`[slack] ${label} is not set — skipping notification`);
    return "skipped";
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, blocks }),
  });
  if (!res.ok) {
    // Slack answers a bad hook with a plain-text reason ("no_service", etc.).
    const detail = await res.text().catch(() => "");
    throw new SlackError(`Slack webhook ${res.status}: ${detail.slice(0, 200)}`);
  }
  return "sent";
}

const ENTITY_LABELS: Record<string, string> = {
  soleprop: "Sole proprietor",
  smllc: "Single-member LLC",
  scorp: "S-corp",
  ccorp: "C-corp",
  unanswered: "Didn’t say",
};

/**
 * Escape the three characters Slack treats as control syntax in mrkdwn. Without
 * this, a stranger whose name/handle/note contains `<!channel>` or `<@U123>`
 * would broadcast-ping the channel on submit — cheap abuse through a public
 * form. Apply to ANY free text a stranger controls, in EVERY mrkdwn context:
 * section text, mrkdwn fields, AND the top-level fallback `text` (that line is
 * parsed for mentions too, so escaping only the blocks leaves the hole open).
 * The one safe spot is a `plain_text` header, which Slack renders literally.
 * Leave our own link markup (`<mailto:…>`, `<https://…>`) unescaped — its
 * safety comes from validating the address/URL upstream, not from escaping.
 */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A Slack mrkdwn field, trimmed to Block Kit's 10-per-section limit by callers. */
function field(label: string, value: string) {
  return { type: "mrkdwn", text: `*${label}*\n${value}` };
}

/**
 * A clickable mailto field. The display label is escaped; the mailto: target is
 * left raw and is safe only because the route's EMAIL_RE forbids the `<>|`
 * characters that could break out of the link — validate there, not here.
 */
function emailField(email: string) {
  return field("Email", `<mailto:${email}|${esc(email)}>`);
}

export async function postLeadToSlack(
  lead: Lead,
  inputs: EstimateInputs,
  r: EstimateResult,
): Promise<SlackOutcome> {
  // The flags are the qualification signal: they're why this lead is worth a
  // call, so they lead the message rather than sitting under the numbers.
  const alerts: string[] = [];
  if (inputs.sCorpNoPayroll)
    alerts.push("🚨 *S-corp with no payroll* — audit exposure, urgent");
  if (r.solePropRisk)
    alerts.push("⚠️ *Sole prop over $20k* — no liability protection");
  if (r.needSCorp) alerts.push("💡 *S-corp candidate* — net profit over threshold");

  const savings =
    r.savingsHigh > 0
      ? r.savingsHigh - r.savingsLow >= 500
        ? `${fmt(r.savingsLow)}–${fmt(r.savingsHigh)}`
        : fmt(r.savingsHigh)
      : "—";

  // platform/username/revenueBand are attacker-controllable free text — the
  // route accepts any string, and username is a hand-typed handle — so every
  // one is escaped before it reaches mrkdwn.
  const creatorLine = lead.isCreator
    ? `${esc(lead.platform) || "—"} · ${esc(lead.username) || "—"} · self-reported ${esc(lead.revenueBand) || "—"}`
    : "Not a creator / content business";

  const blocks: unknown[] = [
    {
      // plain_text header — rendered literally, so lead.name is safe unescaped.
      type: "header",
      text: { type: "plain_text", text: `New estimator lead: ${lead.name}`, emoji: true },
    },
    {
      type: "section",
      fields: [
        emailField(lead.email),
        field("Phone", esc(lead.phone) || "—"),
        field("Estimated tax", fmt(r.total)),
        field("Potential savings", savings),
        field("Entity", ENTITY_LABELS[inputs.entity] ?? esc(inputs.entity)),
        field("State", esc(inputs.state) || "—"),
        field("Business revenue", fmt(inputs.creator)),
        field("Net profit", fmt(r.netSE)),
      ],
    },
    { type: "section", text: { type: "mrkdwn", text: `*Creator*\n${creatorLine}` } },
  ];

  if (alerts.length) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: alerts.join("\n") },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Effective rate ${r.effRate.toFixed(1)}% · suggested set-aside ${Math.round(r.setAside)}% · consented to be contacted`,
      },
    ],
  });

  return postToChannel(
    process.env.SLACK_WEBHOOK_URL,
    "SLACK_WEBHOOK_URL",
    // Fallback text is mrkdwn too — escape the name here as well as in the block.
    `New estimator lead: ${esc(lead.name)} — ${fmt(r.total)} estimated tax`,
    blocks,
  );
}

/**
 * Where the portal lives, for deep links out of Slack. SITE_URL wins when set;
 * otherwise Vercel's own production-domain variable covers deployed builds.
 * Null (local dev, misconfig) just drops the link — never the notification.
 */
function portalApplicationsUrl(): string | null {
  const base =
    process.env.SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  return base ? `${base.replace(/\/$/, "")}/portal/applications` : null;
}

/**
 * A job application to the #recruiting channel. Deliberately a heads-up, not a
 * dossier: name, role, how to reach them, and a button into the portal's
 * Applications tab — which holds the full form and the resume. The portal is
 * the record; this is the doorbell.
 */
export async function postApplicationToSlack(
  a: Application,
  hasResume: boolean,
): Promise<SlackOutcome> {
  const roleLine = a.department ? `${esc(a.role)} · ${esc(a.department)}` : esc(a.role);
  const portal = portalApplicationsUrl();

  const roleSection: Record<string, unknown> = {
    type: "section",
    text: { type: "mrkdwn", text: `*Role*\n${roleLine}` },
  };
  if (portal) {
    // A link button needs no Slack interactivity setup — safe from a webhook.
    roleSection.accessory = {
      type: "button",
      text: { type: "plain_text", text: "View in portal" },
      url: portal,
    };
  }

  const blocks: unknown[] = [
    {
      // A header is plain_text, not mrkdwn — Slack renders it literally, so the
      // name needs no escaping here (and emoji:true only affects :shortcodes:).
      type: "header",
      text: { type: "plain_text", text: `New application: ${a.name}`, emoji: true },
    },
    roleSection,
    {
      type: "section",
      fields: [
        emailField(a.email),
        field("Phone", esc(a.phone) || "—"),
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${hasResume ? "Resume attached" : "No resume"} · full application in the portal's Applications tab`,
        },
      ],
    },
  ];

  return postToChannel(
    process.env.SLACK_RECRUITING_WEBHOOK_URL,
    "SLACK_RECRUITING_WEBHOOK_URL",
    // Fallback text is mrkdwn — escape name and role here too.
    `New application: ${esc(a.name)} — ${esc(a.role)}`,
    blocks,
  );
}

/**
 * A won deal to the #onboarding channel — the handoff doorbell. Fired by the
 * sales PATCH route when a deal's status transitions INTO "won" (the pre-image
 * check lives in the store, so editing an already-won deal stays silent).
 *
 * Takes display-ready strings rather than sales-flow types: the route maps
 * option keys to their labels before calling, so this module stays ignorant
 * of the sales vocabulary.
 */
export async function postClosedDealToSlack(deal: {
  name: string;
  email: string;
  /** Whole dollars, as stored on the row. */
  offer: number | null;
  service: string | null;
  paymentPlan: string | null;
  /** ISO yyyy-mm-dd. */
  onboardingDate: string | null;
  /** The staff member who flipped the status. */
  closedBy: string;
}): Promise<SlackOutcome> {
  const blocks: unknown[] = [
    {
      // plain_text header — rendered literally, so the name is safe unescaped.
      type: "header",
      text: { type: "plain_text", text: `🎉 Deal closed: ${deal.name}`, emoji: true },
    },
    {
      type: "section",
      fields: [
        // Plain text rather than a mailto link: this email arrives via the
        // Calendly sync, not a route with an EMAIL_RE gate, so it hasn't
        // earned the raw link target that emailField() assumes.
        field("Email", esc(deal.email) || "—"),
        field("Offer", deal.offer != null ? fmt(deal.offer) : "—"),
        field("Service", esc(deal.service ?? "") || "—"),
        field("Payment plan", esc(deal.paymentPlan ?? "") || "—"),
        field("Onboarding date", esc(deal.onboardingDate ?? "") || "—"),
        field("Closed by", esc(deal.closedBy) || "—"),
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Marked won in the Sales Flow — over to onboarding.",
        },
      ],
    },
  ];

  return postToChannel(
    process.env.SLACK_ONBOARDING_WEBHOOK_URL,
    "SLACK_ONBOARDING_WEBHOOK_URL",
    `Deal closed: ${esc(deal.name)}${deal.offer != null ? ` — ${fmt(deal.offer)}` : ""}`,
    blocks,
  );
}

/**
 * A client feedback response to SLACK_FEEDBACK_WEBHOOK_URL (#client-feedback).
 * Every real response, like #recruiting gets every application: a doorbell
 * with the scores per team, the client's own words, and a button into the
 * portal's Client Feedback tab, which is the record. At-risk ones lead with
 * the flag and say who got the follow-up. The submit route never calls this
 * for a staff preview.
 *
 * Takes display-ready strings, like postClosedDealToSlack, so this module
 * stays ignorant of the survey's field names. Nearly everything here is
 * stranger-controlled — the client typed their name and their reasons, and
 * the team names ride in on the survey link's query string — so every one is
 * escaped before it reaches mrkdwn.
 */
export async function postFeedbackToSlack(fb: {
  clientName: string;
  clientId: string | null;
  /** "Onboarding", "Bookkeeping + tax"… */
  survey: string;
  /** The round, e.g. "2026-Q4 · tax year 2025". */
  round: string | null;
  fromRecap: boolean;
  /** at_risk: any team unhappy · promoter: shown the review ask · passive: neither. */
  segment: "at_risk" | "promoter" | "passive";
  /** One per team the client answered for. */
  teams: { label: string; scores: string; atRisk: boolean; people: string | null; reason: string | null }[];
  /** Who the follow-ups went to, when there are any. */
  assignees: string[];
  due: string | null;
}): Promise<SlackOutcome> {
  const base =
    process.env.SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  const portal = base ? `${base.replace(/\/$/, "")}/portal/client-feedback` : null;
  // Section text caps at 3,000 characters; a client's essay doesn't need to fit.
  const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

  const lead =
    fb.segment === "at_risk"
      ? "⚠️ At-risk feedback"
      : fb.segment === "promoter"
        ? "🌟 Happy client"
        : "💬 New feedback";

  const heading: Record<string, unknown> = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: [
        `*${esc(fb.survey)}*${fb.round ? ` · ${esc(fb.round)}` : ""}${fb.fromRecap ? " · from their tax recap" : ""}`,
        fb.clientId ? `Client ID ${esc(fb.clientId)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  };
  if (portal) {
    heading.accessory = {
      type: "button",
      text: { type: "plain_text", text: "View in portal" },
      url: portal,
    };
  }

  const footer =
    fb.segment === "at_risk"
      ? `Follow-up created for ${esc(fb.assignees.join(", ") || "the team")}${fb.due ? `, due ${esc(fb.due)}` : ""}`
      : fb.segment === "promoter"
        ? "Shown the Google review ask"
        : "No follow-up needed";

  const blocks: unknown[] = [
    {
      // plain_text header — rendered literally, so the name is safe unescaped.
      // Headers cap at 150 characters.
      type: "header",
      text: { type: "plain_text", text: clip(`${lead}: ${fb.clientName}`, 150), emoji: true },
    },
    heading,
    ...fb.teams.map((t) => ({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*${esc(t.label)}* · ${esc(t.scores)}${t.atRisk ? " · *at risk*" : ""}`,
          t.people ? `Team: ${esc(t.people)}` : null,
          t.reason ? `> ${esc(clip(t.reason.replace(/\s+/g, " ").trim(), 600))}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    })),
    { type: "context", elements: [{ type: "mrkdwn", text: footer }] },
  ];

  return postToChannel(
    process.env.SLACK_FEEDBACK_WEBHOOK_URL,
    "SLACK_FEEDBACK_WEBHOOK_URL",
    // Fallback text is mrkdwn — escape the name here too.
    `${lead.replace(/^\S+ /, "")}: ${esc(fb.clientName)} — ${esc(fb.survey)}`,
    blocks,
  );
}
