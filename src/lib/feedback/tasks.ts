/**
 * The follow-up an unhappy response creates: one per at-risk team, for
 * whoever owns that team's work plus the founder.
 *
 *   onboarding  → the onboarding team lead
 *   bookkeeping → the bookkeeping lead
 *   tax         → the tax strategist and the tax manager
 *
 * Owners here are who the LINK named, frozen at submit. The portal re-reads
 * the owner off the client's current team when it shows the task, so filling
 * the team in later still routes it (see analytics.taskOwners).
 *
 * Title and body wording is the prototype's, verbatim — staff already know
 * these tasks by sight.
 */

import {
  LINK_ROLES,
  ROLE_LABELS_SHORT,
  TEAMS,
  joinNames,
  type Flags,
  type LinkFields,
  type ScoreFields,
  type TeamKey,
  type FeedbackTask,
  teamFlags,
} from "./schema";

/** What a task is built from: the response as it's about to be saved. */
export type TaskSource = ScoreFields &
  LinkFields & {
    survey_id: string;
    client_id: string | null;
    client_name: string;
    escalation: string | null;
    bookkeeping_period: string | null;
    tax_year: string | null;
    is_test: boolean;
  };

export type TaskDraft = Omit<FeedbackTask, "task_id" | "created_at" | "completed_at">;

const dash = (v: unknown) => (v == null || v === "" ? "–" : String(v));

/** `n` business days after `from`, as yyyy-mm-dd. Weekends skipped, holidays not. */
export function businessDaysFrom(from: Date, n: number): string {
  const d = new Date(from);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

/** Every follow-up a response earns — none when no team is at risk. */
export function buildTasks(p: TaskSource, flags: Flags, now = new Date()): TaskDraft[] {
  return flags.teams.filter((t) => teamFlags(flags, t).atRisk).map((t) => buildTask(t, p, now));
}

function buildTask(team: TeamKey, p: TaskSource, now: Date): TaskDraft {
  if (team === "onboarding") return buildOnboardingTask(p, now);
  const owners = team === "bookkeeping" ? [p.link_bookkeeping_lead] : [p.link_tax_strategist, p.link_tax_manager];
  const assignees = [...new Set([...owners, p.escalation].filter((v): v is string => !!v))];
  const teamNames = LINK_ROLES.filter((r) => r.team === team && p[r.field]).map(
    (r) => `${ROLE_LABELS_SHORT[r.role]} ${p[r.field]}`,
  );
  const who = p.client_name || "Client";
  const L = TEAMS[team].label;
  const c = team === "bookkeeping" ? p.bookkeeping_csat_1_5 : p.tax_csat_1_5;
  const n = team === "bookkeeping" ? p.bookkeeping_nps_0_10 : p.tax_nps_0_10;
  const why = [c != null && c <= 3 && `CSAT ${c}/5`, n != null && n <= 6 && `NPS ${n}/10`].filter(Boolean).join(", ");
  const diag =
    team === "bookkeeping"
      ? `Ease of keeping books current: ${dash(p.bookkeeping_ease_1_5)}/5`
      : `Clarity on tax position and plan: ${dash(p.tax_clarity_1_5)}/5`;
  const reason = team === "bookkeeping" ? p.bookkeeping_reason_text : p.tax_reason_text;
  const body = [
    `Client: ${who}${p.client_id ? ` (${p.client_id})` : ""}`,
    `${L} ${team === "bookkeeping" ? `period: ${dash(p.bookkeeping_period)}` : `year: ${dash(p.tax_year)}`}`,
    `${L} team: ${teamNames.join(", ") || "–"}`,
    `Flagged for: ${why}`,
    "",
    `${L} satisfaction (CSAT): ${dash(c)}/5`,
    `${L} likelihood to recommend (NPS): ${dash(n)}/10`,
    diag,
    "",
    `Main reason: ${reason || "–"}`,
  ].join("\n");
  return {
    team,
    kind: "at_risk",
    survey_id: p.survey_id,
    client_id: p.client_id,
    priority: "high",
    status: "open",
    title: `At-risk ${L.toLowerCase()} client: ${who} (CSAT ${dash(c)}/5, NPS ${dash(n)})`,
    assignees,
    due_date: businessDaysFrom(now, 1),
    body,
    is_test: p.is_test,
  };
}

function buildOnboardingTask(p: TaskSource, now: Date): TaskDraft {
  const assignees = [...new Set([p.link_onboarding_team_lead, p.escalation].filter((v): v is string => !!v))];
  const who = p.client_name || "Client";
  const exp =
    ({ exceeded: "Exceeded", matched: "Matched", fell_short: "Fell short" } as Record<string, string>)[
      p.expectation_match ?? ""
    ] || "–";
  const why = [
    p.csat_overall != null && p.csat_overall <= 3 && `CSAT ${p.csat_overall}/5`,
    p.nps_score != null && p.nps_score <= 6 && `NPS ${p.nps_score}/10`,
    p.confidence_score != null && p.confidence_score <= 3 && `confidence ${p.confidence_score}/5`,
  ]
    .filter(Boolean)
    .join(", ");
  const body = [
    `Client: ${who}${p.client_id ? ` (${p.client_id})` : ""}`,
    `Onboarding team: ${joinNames([...new Set([p.link_onboarding_team_lead, p.link_onboarding_senior, p.link_onboarding_staff].filter(Boolean))]) || "–"}`,
    `Flagged for: ${why}`,
    "",
    `Overall satisfaction (CSAT): ${dash(p.csat_overall)}/5`,
    `Likelihood to recommend (NPS): ${dash(p.nps_score)}/10`,
    `Clarity on next steps: ${dash(p.clarity_score)}/5`,
    `Ease of onboarding: ${dash(p.ease_score)}/5`,
    `Confidence in tax/financial position: ${dash(p.confidence_score)}/5`,
    `Confidence in 12-month plan: ${dash(p.fa_confidence_score)}/5`,
    `Vs. expectations: ${exp}`,
    "",
    `Most valuable: ${p.most_valuable_text || "–"}`,
    `One thing to improve: ${p.improvement_text || "–"}`,
  ].join("\n");
  return {
    team: "onboarding",
    kind: "at_risk",
    survey_id: p.survey_id,
    client_id: p.client_id,
    priority: "high",
    status: "open",
    title: `At-risk onboarding: ${who} (CSAT ${dash(p.csat_overall)}/5, NPS ${dash(p.nps_score)})`,
    assignees,
    due_date: businessDaysFrom(now, 1),
    body,
    is_test: p.is_test,
  };
}
