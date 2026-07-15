import "server-only";
import type { Lead } from "./lead";
import { EstimateInputs, EstimateResult, fmt } from "./tax";

/**
 * Lead notifications to the client's Slack, via an Incoming Webhook.
 *
 * The webhook URL is a bearer credential — anyone holding it can post into that
 * channel as this app — so it is server-only and never reaches the browser.
 *
 * Unset SLACK_WEBHOOK_URL is a supported state, not an error: the flow shipped
 * before the client's workspace had a hook to point at. It returns "skipped" so
 * a missing hook can't take the estimator down with it.
 */

export type SlackOutcome = "sent" | "skipped";

export class SlackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlackError";
  }
}

const ENTITY_LABELS: Record<string, string> = {
  soleprop: "Sole proprietor",
  smllc: "Single-member LLC",
  scorp: "S-corp",
  ccorp: "C-corp",
  unanswered: "Didn’t say",
};

/** A Slack mrkdwn field, trimmed to Block Kit's 10-per-section limit by callers. */
function field(label: string, value: string) {
  return { type: "mrkdwn", text: `*${label}*\n${value}` };
}

export async function postLeadToSlack(
  lead: Lead,
  inputs: EstimateInputs,
  r: EstimateResult,
): Promise<SlackOutcome> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.warn("[lead] SLACK_WEBHOOK_URL is not set — skipping notification");
    return "skipped";
  }

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

  const creatorLine = lead.isCreator
    ? `${lead.platform || "—"} · ${lead.username || "—"} · self-reported ${lead.revenueBand || "—"}`
    : "Not a creator / content business";

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `New estimator lead: ${lead.name}`, emoji: true },
    },
    {
      type: "section",
      fields: [
        field("Email", `<mailto:${lead.email}|${lead.email}>`),
        field("Phone", lead.phone || "—"),
        field("Estimated tax", fmt(r.total)),
        field("Potential savings", savings),
        field("Entity", ENTITY_LABELS[inputs.entity] ?? inputs.entity),
        field("State", inputs.state || "—"),
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

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `text` is the notification/fallback line — what shows in the sidebar and
    // on a phone before the blocks render.
    body: JSON.stringify({
      text: `New estimator lead: ${lead.name} — ${fmt(r.total)} estimated tax`,
      blocks,
    }),
  });

  if (!res.ok) {
    // Slack answers a bad hook with a plain-text reason ("no_service", etc.).
    const detail = await res.text().catch(() => "");
    throw new SlackError(`Slack webhook ${res.status}: ${detail.slice(0, 200)}`);
  }

  return "sent";
}
