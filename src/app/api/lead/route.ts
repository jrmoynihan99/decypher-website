import { NextRequest, NextResponse } from "next/server";
import { EmailError, sendLeadEmail } from "@/lib/lead-email";
import { SlackError, postLeadToSlack } from "@/lib/slack";
import { LeadStoreError, recordDelivery, saveLead } from "@/lib/lead-store";
import type { Lead } from "@/lib/lead";
import { CONSENT_TEXT } from "@/lib/lead";
import { EstimateInputs, buildEstimate } from "@/lib/tax";

/**
 * The estimator's lead capture: records the lead, emails the visitor their
 * estimate, and notifies the team in Slack.
 *
 * This replaced a browser-side Zapier webhook. The move server-side is the point
 * of the whole thing: the old call was fire-and-forget with mode:"no-cors", so
 * its response was opaque by construction and a dead Zap dropped leads in
 * silence. Here every call is awaited and every failure is logged.
 *
 * POST { lead, inputs }                 → { emailed, notified, recorded }
 * POST { lead, inputs, resend: true }   → { emailed } — email only
 *
 * `resend` exists because the results screen lets someone send themselves
 * another copy. Without it each click would file a second lead and ping the
 * team again: same person, same estimate, twice.
 *
 * The client sends raw inputs, never its own numbers: the estimate is rebuilt
 * here with the same buildEstimate the widget used, so the email cannot disagree
 * with the screen and a forged payload can't put invented figures in Slack.
 *
 * The endpoint is public and unauthenticated — it has to be, it's behind a
 * public form. It is therefore spammable, exactly as the Zapier hook was, and
 * now spam lands in Firestore rather than nowhere. If that turns into a problem
 * the answer is rate limiting or a captcha, not a secret the browser would have
 * to carry anyway.
 */

export const dynamic = "force-dynamic";

interface LeadRequest {
  lead?: Partial<Lead>;
  inputs?: Partial<EstimateInputs>;
  resend?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Narrows the request to a Lead, or explains what's wrong with it. */
function parseLead(l: Partial<Lead> | undefined): { lead: Lead } | { error: string } {
  if (!l || typeof l !== "object") return { error: "lead is required" };

  const name = typeof l.name === "string" ? l.name.trim() : "";
  const email = typeof l.email === "string" ? l.email.trim() : "";
  const phone = typeof l.phone === "string" ? l.phone.trim() : "";

  if (!name || !email || !phone) {
    const missing = (["name", "email", "phone"] as const).filter(
      (k) => !(typeof l[k] === "string" && l[k]!.trim()),
    );
    return { error: `Missing: ${missing.join(", ")}` };
  }
  if (!EMAIL_RE.test(email)) return { error: "Invalid email." };

  // Consent gates the email and the sales call alike — a lead without it isn't
  // one we're allowed to contact, so this is a hard reject rather than a default.
  if (l.consent !== true) return { error: "Consent is required." };

  return {
    lead: {
      name,
      email,
      phone,
      isCreator: l.isCreator === true,
      platform: typeof l.platform === "string" ? l.platform : "",
      username: typeof l.username === "string" ? l.username : "",
      revenueBand: typeof l.revenueBand === "string" ? l.revenueBand : "",
      consent: true,
      // Record what the form actually showed, but don't let a caller invent it.
      consentText:
        typeof l.consentText === "string" && l.consentText
          ? l.consentText
          : CONSENT_TEXT,
    },
  };
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0);

/** Narrows the request to EstimateInputs. Anything unrecognised falls back. */
function parseInputs(i: Partial<EstimateInputs> | undefined):
  | { inputs: EstimateInputs }
  | { error: string } {
  if (!i || typeof i !== "object") return { error: "inputs are required" };

  const status = i.status;
  if (status !== "single" && status !== "mfj" && status !== "mfs" && status !== "hoh") {
    return { error: "inputs.status is invalid" };
  }
  if (typeof i.state !== "string" || !i.state) {
    return { error: "inputs.state is required" };
  }

  const entity =
    i.entity === "soleprop" ||
    i.entity === "smllc" ||
    i.entity === "scorp" ||
    i.entity === "ccorp"
      ? i.entity
      : "unanswered";

  return {
    inputs: {
      status,
      state: i.state,
      creator: n(i.creator),
      expenses: n(i.expenses),
      w2: n(i.w2),
      other: n(i.other),
      paid: n(i.paid),
      fulltime: i.fulltime !== false,
      entity,
      sCorp: entity === "scorp",
      sCorpSalary: typeof i.sCorpSalary === "number" ? i.sCorpSalary : null,
      sCorpSalaryStatus:
        typeof i.sCorpSalaryStatus === "string" ? i.sCorpSalaryStatus : "n/a",
      sCorpNoPayroll: entity === "scorp" && i.sCorpNoPayroll === true,
    },
  };
}

export async function POST(req: NextRequest) {
  let body: LeadRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsedLead = parseLead(body.lead);
  if ("error" in parsedLead) {
    return NextResponse.json({ error: parsedLead.error }, { status: 400 });
  }
  const parsedInputs = parseInputs(body.inputs);
  if ("error" in parsedInputs) {
    return NextResponse.json({ error: parsedInputs.error }, { status: 400 });
  }

  const { lead } = parsedLead;
  const { inputs } = parsedInputs;
  const estimate = buildEstimate(inputs);

  // A second copy of an email already sent. Nothing new to file or announce.
  if (body.resend === true) {
    try {
      await sendLeadEmail(lead, inputs, estimate);
      return NextResponse.json({ emailed: true });
    } catch (e) {
      console.error(
        `[lead] resend failed for ${lead.email}:`,
        e instanceof EmailError ? e.message : e,
      );
      return NextResponse.json(
        { error: "We couldn't send that again just now.", emailed: false },
        { status: 502 },
      );
    }
  }

  // Record before delivering. Email and Slack are both droppable; this is the
  // copy that has to survive. A store failure still lets the sends proceed —
  // losing the audit trail beats losing the lead's email and the team's ping.
  let leadId: string | null = null;
  try {
    const saved = await saveLead(lead, inputs, estimate);
    if (saved !== "skipped") leadId = saved.id;
  } catch (e) {
    console.error(
      `[lead] NOT RECORDED — ${lead.email}:`,
      e instanceof LeadStoreError ? e.message : e,
    );
  }

  // Both run regardless of the other's outcome: a lead the team never hears
  // about is a worse failure than one that missed its receipt, and neither
  // should be able to cancel the other.
  const [emailRes, slackRes] = await Promise.allSettled([
    sendLeadEmail(lead, inputs, estimate),
    postLeadToSlack(lead, inputs, estimate),
  ]);

  const emailed = emailRes.status === "fulfilled";
  const notified = slackRes.status === "fulfilled" && slackRes.value === "sent";

  if (slackRes.status === "rejected") {
    const e = slackRes.reason;
    console.error(
      `[lead] Slack notification failed for ${lead.email}:`,
      e instanceof SlackError ? e.message : e,
    );
  }
  if (emailRes.status === "rejected") {
    const e = emailRes.reason;
    console.error(
      `[lead] estimate email failed for ${lead.email}:`,
      e instanceof EmailError ? e.message : e,
    );
  }

  // Best-effort annotation; never awaited into the failure path.
  if (leadId) await recordDelivery(leadId, { emailed, notified });

  if (!emailed) {
    // The visitor was promised this email, so a failure is worth telling them
    // about — but their details are filed and the team may already know, so
    // this is not a reason to make the whole submission look like it failed.
    return NextResponse.json(
      {
        error: "We couldn't email your estimate. Our team still got your details.",
        emailed: false,
        notified,
        recorded: leadId !== null,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ emailed, notified, recorded: leadId !== null });
}
