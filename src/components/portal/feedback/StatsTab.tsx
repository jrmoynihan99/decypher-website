"use client";

import { useMemo } from "react";
import { Panel } from "@/components/portal/widgets/ui";
import { CSAT_LABELS, ROLE_LABELS, TEAMS, type FeedbackResponse, type TeamKey } from "@/lib/feedback/schema";
import { core, fmt1, fmtDate, mean, pctTxt, teamRows, type TeamRow } from "@/lib/feedback/analytics";
import { AvgRows, Bars, scoreColor } from "./bits";

/**
 * The Stats tab: per team, the CSAT and NPS distributions, the split by
 * owner, the reasons (lowest scores first — the ones to read), plus the
 * review-ask funnel and the flag counts. Everything follows the Responses
 * filters; each team is scored on its own, so a client who answered
 * bookkeeping and tax counts once for each.
 */

// Score 1..5 → colour, for the CSAT distribution (index 0 is a 1).
const SCOLORS = [
  "var(--color-danger)",
  "var(--color-danger)",
  "var(--color-tier-warn)",
  "var(--color-teal)",
  "var(--color-teal)",
];

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default function StatsTab({ rows, team }: { rows: FeedbackResponse[]; team: TeamKey | "" }) {
  const tr = useMemo(() => teamRows(rows), [rows]);
  const teams: TeamKey[] = team ? [team] : ["onboarding", "bookkeeping", "tax"];
  const shown = rows.filter((x) => x.review_prompt_shown).length;
  const clicked = rows.filter((x) => x.review_link_clicked).length;

  return (
    <>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(330px,100%),1fr))]">
        {teams.map((t) => (
          <TeamStats key={t} team={t} trs={tr.filter((r) => r.team === t)} />
        ))}
        <Panel title="Review ask" action={<Right>Google</Right>}>
          <Bars
            total={rows.length}
            items={[
              { label: "Shown the review ask", n: shown },
              {
                label: "Tapped the review button",
                n: clicked,
                sub: `${pctTxt(clicked, shown)} of those shown`,
                color: "var(--color-teal)",
              },
            ]}
          />
        </Panel>
        <Panel title="Flags" action={<Right>per team</Right>}>
          <Bars
            total={rows.length}
            items={[
              {
                label: "Onboarding at risk",
                sub: "CSAT ≤ 3, NPS ≤ 6 or confidence ≤ 3",
                n: rows.filter((x) => x.survey === "onboarding" && x.at_risk_flag).length,
                color: "var(--color-danger)",
              },
              {
                label: "Bookkeeping at risk",
                sub: "CSAT ≤ 3 or NPS ≤ 6",
                n: rows.filter((x) => x.bookkeeping_at_risk).length,
                color: "var(--color-danger)",
              },
              {
                label: "Tax at risk",
                sub: "CSAT ≤ 3 or NPS ≤ 6",
                n: rows.filter((x) => x.tax_at_risk).length,
                color: "var(--color-danger)",
              },
              {
                label: "Happy for review",
                sub: "every team CSAT ≥ 4 and NPS ≥ 9",
                n: rows.filter((x) => x.happy_for_review).length,
                color: "var(--color-teal)",
              },
            ]}
          />
        </Panel>
      </div>
      <p className="m-0 mt-3 px-0.5 text-[12.5px] leading-relaxed text-dusk">
        Everything here follows the filters above. Each team is scored on its own, so a client who answered bookkeeping and
        tax counts once for each.
      </p>
    </>
  );
}

function Right({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-dusk">{children}</span>;
}

function Big({ items }: { items: { value: string; label: string; color?: string }[] }) {
  return (
    <div className="mb-2.5 mt-0.5 flex gap-5">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col">
          <b className="font-mono text-[26px] font-normal leading-[1.1] tabular-nums" style={{ color: it.color ?? "var(--color-fog)" }}>
            {it.value}
          </b>
          <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-dusk">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function TeamStats({ team, trs }: { team: TeamKey; trs: TeamRow[] }) {
  const { label, letter, owner } = TEAMS[team];
  const pre = letter ? `${letter} · ` : "";
  const c = core(trs);
  const prom = trs.filter((r) => r.band === "promoter").length;
  const pas = trs.filter((r) => r.band === "passive").length;
  const det = trs.filter((r) => r.band === "detractor").length;

  const owners = new Map<string, TeamRow[]>();
  for (const r of trs) {
    const k = r.owner || "Not set";
    owners.set(k, [...(owners.get(k) ?? []), r]);
  }
  const byOwner = [...owners]
    .map(([k, rs]) => {
      const cc = core(rs);
      return { label: k, n: rs.length, sub: `CSAT ${fmt1(cc.csat)} · NPS ${cc.nps ?? "–"}` };
    })
    .sort((a, b) => Number(a.label === "Not set") - Number(b.label === "Not set") || b.n - a.n);

  const why = trs
    .filter((r) => r.reason.trim())
    .sort((a, b) => (a.csat ?? 9) - (b.csat ?? 9))
    .slice(0, 8);
  const diagLabel =
    team === "onboarding" ? "Clear on next steps" : team === "bookkeeping" ? "Easy to keep books current" : "Clear on tax position and plan";
  const csatColor =
    c.csat == null ? undefined : c.csat >= 4 ? "var(--color-teal)" : c.csat < 3.5 ? "var(--color-danger)" : undefined;

  return (
    <>
      <Panel title={`${pre}${label} · CSAT`} action={<Right>{plural(c.n, "response")}</Right>}>
        <Big
          items={[
            { value: fmt1(c.csat), label: "Avg of 5", color: csatColor },
            { value: fmt1(c.diag), label: diagLabel },
          ]}
        />
        <Bars
          total={c.n}
          items={[5, 4, 3, 2, 1].map((v) => ({
            label: `${v} · ${CSAT_LABELS[v - 1]}`,
            n: trs.filter((r) => r.csat === v).length,
            color: SCOLORS[v - 1],
          }))}
        />
      </Panel>
      <Panel title={`${pre}${label} · NPS`} action={<Right>promoters − detractors</Right>}>
        <Big
          items={[
            { value: c.nps == null ? "–" : String(c.nps), label: "NPS score", color: "var(--color-teal)" },
            { value: fmt1(mean(trs.map((r) => r.nps))), label: "Avg of 10" },
          ]}
        />
        <Bars
          total={c.n}
          items={[
            { label: "Promoters (9–10)", n: prom, color: "var(--color-teal)" },
            { label: "Passives (7–8)", n: pas, color: "var(--color-tier-warn)" },
            { label: "Detractors (0–6)", n: det, color: "var(--color-danger)" },
          ]}
        />
      </Panel>
      <Panel title={`${pre}${label} · by ${ROLE_LABELS[owner].toLowerCase()}`}>
        <Bars total={trs.length} items={byOwner} />
      </Panel>
      {team === "onboarding" ? <OnboardingExtras rows={trs.map((r) => r.x)} /> : null}
      <Panel
        title={`${pre}${label} · ${team === "onboarding" ? "what to improve" : "why"}`}
        action={<Right>lowest scores first</Right>}
        className="[grid-column:1/-1]"
      >
        {why.length ? (
          <div>
            {why.map((r) => (
              <div
                key={`${r.id}-${r.team}`}
                className="mt-2.5 whitespace-pre-wrap rounded-r-[10px] border-l-2 bg-panel-2 px-3 py-2.5 text-[13.5px] leading-[1.45] text-fog first:mt-0"
                style={{ borderLeftColor: scoreColor(r.csat) === "transparent" ? "var(--color-magenta)" : scoreColor(r.csat) }}
              >
                <small className="mb-1 block font-mono text-[10px] uppercase tracking-[1.2px] text-dusk">
                  {r.client_name || "Client"} · {fmtDate(r.when)} · CSAT {r.csat ?? "–"} · NPS {r.nps ?? "–"}
                </small>
                {r.reason}
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 text-[12.5px] text-dusk">No answers yet.</p>
        )}
      </Panel>
    </>
  );
}

function OnboardingExtras({ rows }: { rows: FeedbackResponse[] }) {
  const n = rows.length;
  return (
    <>
      <Panel title="Onboarding · other scores" action={<Right>{plural(n, "response")}</Right>}>
        <AvgRows
          items={[
            { label: "Clear on next steps", v: mean(rows.map((x) => x.clarity_score)) },
            { label: "Easy to get through", v: mean(rows.map((x) => x.ease_score)) },
            { label: "Confident in tax/financial position", v: mean(rows.map((x) => x.confidence_score)) },
            { label: "Confident in 12-month plan", v: mean(rows.map((x) => x.fa_confidence_score)) },
          ]}
        />
      </Panel>
      <Panel title="Onboarding · vs. expectations" action={<Right>{n} answered</Right>}>
        <Bars
          total={n}
          items={[
            { label: "Exceeded", n: rows.filter((x) => x.expectation_match === "exceeded").length, color: "var(--color-teal)" },
            { label: "Matched", n: rows.filter((x) => x.expectation_match === "matched").length, color: "var(--color-tier-warn)" },
            { label: "Fell short", n: rows.filter((x) => x.expectation_match === "fell_short").length, color: "var(--color-danger)" },
          ]}
        />
      </Panel>
    </>
  );
}
