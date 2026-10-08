"use client";

import { useMemo } from "react";
import { TEAMS, type FeedbackResponse, type FeedbackTask } from "@/lib/feedback/schema";
import { assignedTo, needsTeam } from "@/lib/feedback/analytics";
import { Pill, ToolButton, type Tone } from "./bits";

/**
 * Follow-ups: one per at-risk team on a response, open ones first, soonest
 * due first. Who it's assigned to is read off the client's team as it is NOW
 * (lib/feedback/analytics taskOwners) — so a follow-up made before anyone set
 * the team routes itself once someone does, and says so until then.
 */

const TEAM_TONE: Record<FeedbackTask["team"], Tone> = { onboarding: "brand", bookkeeping: "pos", tax: "warn" };

export default function FollowupsTab({
  tasks,
  responses,
  escalation,
  saving,
  onToggle,
}: {
  tasks: FeedbackTask[];
  responses: FeedbackResponse[];
  escalation: string;
  saving: (id: string) => boolean;
  onToggle: (t: FeedbackTask) => void;
}) {
  const byId = useMemo(() => new Map(responses.map((r) => [r.id, r])), [responses]);
  const sorted = useMemo(
    () =>
      [...tasks].sort(
        (a, b) => Number(a.status === "done") - Number(b.status === "done") || a.due_date.localeCompare(b.due_date),
      ),
    [tasks],
  );

  if (!sorted.length) {
    return (
      <div className="rounded-[16px] border border-edge bg-panel px-5 py-12 text-center text-[14px] leading-relaxed text-dusk">
        No follow-ups. Every at-risk response creates one for that team’s owner and {escalation || "the founder"}.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {sorted.map((t) => (
        <article
          key={t.task_id}
          className={`rounded-[16px] border border-edge bg-panel px-4 py-3.5 ${t.status === "done" ? "opacity-70" : ""}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <strong className="min-w-0 font-display text-[14.5px] font-semibold text-fog">{t.title}</strong>
            <span className="flex flex-wrap items-center gap-1">
              <Pill tone={TEAM_TONE[t.team]}>{TEAMS[t.team].label}</Pill>
              {t.status === "done" ? <Pill tone="pos">done</Pill> : <Pill tone="neg">open</Pill>}
              <Pill>due {t.due_date.slice(0, 10)}</Pill>
              {t.is_test ? <Pill>test</Pill> : null}
              <ToolButton onClick={() => onToggle(t)} disabled={saving(t.task_id)}>
                {t.status === "done" ? "Reopen" : "Mark done"}
              </ToolButton>
            </span>
          </div>
          <div className="mt-2 text-[13px] text-muted">
            Assigned to <span className="text-mist">{assignedTo(t, byId, escalation)}</span>
            {needsTeam(t, byId) ? (
              <span className="ml-2">
                <Pill tone="warn">set the team on Responses</Pill>
              </span>
            ) : null}
          </div>
          <pre className="m-0 mt-2.5 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-dusk">{t.body}</pre>
        </article>
      ))}
    </div>
  );
}
