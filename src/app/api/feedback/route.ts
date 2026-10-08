import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/firebase/admin";
import { SURVEY_KIND_LABELS } from "@/lib/feedback/links";
import {
  LIMITS,
  LINK_ROLES,
  ROLE_LABELS_SHORT,
  TEAMS,
  sanitizeSettings,
  sanitizeSubmission,
  teamFlags,
  teamScores,
  type FeedbackResponse,
  type FeedbackSettings,
  type FeedbackTask,
} from "@/lib/feedback/schema";
import { getSettings, submitResponse, type SubmitOutcome } from "@/lib/feedback/store";
import { postFeedbackAlertToSlack } from "@/lib/slack";

/**
 * The survey's send. Public and unauthenticated — the survey is a public link
 * — so everything is re-derived here: the body is size-capped and sanitized
 * (lib/feedback/schema), the flags and the review ask are re-scored from the
 * answers, and whether it's a staff preview is decided by what the link
 * named, not by the page's say-so.
 *
 * POST JSON → 200 { ok, survey_id, at_risk_flag }
 *           → 409 { ok:false, already:true }   this round's already answered
 *           → 400 { ok:false, message }        malformed or incomplete
 *
 * Record first, then Slack: the response and its follow-ups are written in
 * one transaction (lib/feedback/store), and the #feedback ping for an at-risk
 * real response is a best-effort doorbell after it. A Slack failure logs; it
 * never fails the client's send.
 *
 * No rate limit, like /api/lead and /api/apply: free text is capped, Slack
 * strings are escaped, and test sends land flagged. If abuse shows up, that's
 * the next thing to add.
 */

export const dynamic = "force-dynamic";

const bad = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function POST(req: Request) {
  if (!isConfigured()) return bad("The survey isn’t connected to its database", 500);

  // Read as text first so an oversized body is refused before it's parsed.
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > LIMITS.body) return bad("Too large", 413);
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return bad("Couldn’t read the request");
  }
  if (raw.length > LIMITS.body) return bad("Too large", 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return bad("Invalid JSON");
  }

  const parsed = sanitizeSubmission(body);
  if (!parsed.ok) return bad(parsed.error);

  let settings: FeedbackSettings;
  try {
    settings = await getSettings();
  } catch (e) {
    // The defaults (founder "OT") are a fine stand-in; don't lose the response over it.
    console.error("[feedback] couldn't read settings:", e);
    settings = sanitizeSettings(null);
  }

  let outcome: SubmitOutcome;
  try {
    outcome = await submitResponse(parsed.value, settings);
  } catch (e) {
    console.error("[feedback] couldn't save a response:", e);
    return bad("Couldn’t save your feedback", 500);
  }

  if (!outcome.ok) {
    return outcome.reason === "already"
      ? NextResponse.json({ ok: false, already: true }, { status: 409 })
      : bad("That survey id is taken", 409);
  }

  const r = outcome.response;
  if (!outcome.replay && !r.is_test && r.at_risk_flag) {
    try {
      await postFeedbackAlertToSlack(alertFor(r, outcome.tasks));
    } catch (e) {
      console.error("[feedback] at-risk Slack alert failed:", e);
    }
  }

  return NextResponse.json({ ok: true, survey_id: r.id, at_risk_flag: r.at_risk_flag });
}

/** The Slack alert's display strings, from the saved response and its follow-ups. */
function alertFor(r: FeedbackResponse, tasks: FeedbackTask[]) {
  const dash = (v: number | null) => (v == null ? "–" : String(v));
  return {
    clientName: r.client_name,
    clientId: r.client_id,
    survey: SURVEY_KIND_LABELS[r.kind],
    round:
      [r.bookkeeping_period, r.tax_year ? `tax year ${r.tax_year}` : null].filter(Boolean).join(" · ") || null,
    fromRecap: !!r.recap_id,
    teams: r.teams
      .filter((t) => teamFlags(r, t).atRisk)
      .map((t) => {
        const s = teamScores(r, t);
        const confidence =
          t === "onboarding" && r.confidence_score != null && r.confidence_score <= 3
            ? ` · confidence ${r.confidence_score}/5`
            : "";
        const people = LINK_ROLES.filter((lr) => lr.team === t && r.team[lr.role])
          .map((lr) => `${ROLE_LABELS_SHORT[lr.role]} ${r.team[lr.role]}`)
          .join(", ");
        return {
          label: TEAMS[t].label,
          scores: `CSAT ${dash(s.csat)}/5 · NPS ${dash(s.nps)}/10${confidence}`,
          people: people || null,
          reason: s.reason || null,
        };
      }),
    assignees: [...new Set(tasks.flatMap((t) => t.assignees))],
    due: tasks[0]?.due_date ?? null,
  };
}
