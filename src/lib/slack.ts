import "server-only";
import type { Application } from "./application";
import type { Lead } from "./lead";
import { EstimateInputs, EstimateResult, fmt } from "./tax";

/**
 * Slack notifications, via Incoming Webhooks. Each webhook is bound to one
 * channel: leads go to SLACK_WEBHOOK_URL (#leads), applications to
 * SLACK_RECRUITING_WEBHOOK_URL (#recruiting). Same app in Slack, two hooks.
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
 * A job application to the #recruiting channel. Add a field to the Application
 * and want it here? Add a `field(...)` row below — the section holds up to 10.
 */
export async function postApplicationToSlack(
  a: Application,
): Promise<SlackOutcome> {
  const roleLine = a.department ? `${esc(a.role)} · ${esc(a.department)}` : esc(a.role);

  const blocks: unknown[] = [
    {
      // A header is plain_text, not mrkdwn — Slack renders it literally, so the
      // name needs no escaping here (and emoji:true only affects :shortcodes:).
      type: "header",
      text: { type: "plain_text", text: `New application: ${a.name}`, emoji: true },
    },
    { type: "section", text: { type: "mrkdwn", text: `*Role*\n${roleLine}` } },
    {
      type: "section",
      fields: [
        field("Name", esc(a.name)),
        emailField(a.email),
        // Wrapped as a Slack link. Safe unescaped only because the route's
        // URL_RE forbids `<>|` — without that, a crafted link could inject
        // `<!channel>`. Escaping instead would corrupt `&` in query strings.
        field("Link", a.link ? `<${a.link}>` : "—"),
      ],
    },
  ];

  if (a.message.trim()) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Note*\n${esc(a.message.trim())}` },
    });
  }

  return postToChannel(
    process.env.SLACK_RECRUITING_WEBHOOK_URL,
    "SLACK_RECRUITING_WEBHOOK_URL",
    // Fallback text is mrkdwn — escape name and role here too.
    `New application: ${esc(a.name)} — ${esc(a.role)}`,
    blocks,
  );
}
