"use client";

import { useMemo } from "react";
import { Panel } from "@/components/portal/widgets/ui";
import { ROLE_LABELS, TEAMS, type FeedbackResponse, type TeamKey, type TeamRole } from "@/lib/feedback/schema";
import {
  DATA_SCOPES,
  SC_MIN_SAMPLE,
  fmt1,
  inScope,
  lastMonths,
  monthLabel,
  pctOf,
  scoreboard,
  teamRows,
  trend,
  type Core,
  type DataScope,
} from "@/lib/feedback/analytics";
import { FilterSelect, ToolButton } from "./bits";

/**
 * The Monthly scorecard: the advisor's four core numbers (responses, CSAT,
 * NPS, % promoters/detractors) per team over the last six months, then one
 * team's leaderboard for one month by whichever role you pick. Months go by
 * the locked submitted date. Only the Data filter applies here — the
 * scorecard is the long view, not the current slice.
 */

export type ScorecardState = { team: TeamKey; by: TeamRole; month: string };

const th = "whitespace-nowrap border-b border-b-edge-mid px-2.5 py-2.5 text-left font-mono text-[10.5px] font-bold uppercase tracking-[0.8px] text-dusk";
const td = "whitespace-nowrap border-b border-b-edge px-2.5 py-2 font-mono text-[12.5px] tabular-nums";
const sec = "border-l border-l-edge";

export default function ScorecardTab({
  rows,
  data,
  sc,
  onChange,
  onCopy,
}: {
  rows: FeedbackResponse[];
  data: DataScope;
  sc: ScorecardState;
  onChange: (next: ScorecardState) => void;
  onCopy: () => void;
}) {
  const months = useMemo(() => lastMonths(12), []);
  const tr = useMemo(() => teamRows(rows).filter((r) => inScope(r, data)), [rows, data]);
  const six = useMemo(() => trend(tr, months.slice(0, 6)), [tr, months]);
  const month = sc.month || months[0];
  const by = TEAMS[sc.team].roles.includes(sc.by) ? sc.by : TEAMS[sc.team].owner;
  const board = useMemo(() => scoreboard(tr, sc.team, by, month), [tr, sc.team, by, month]);
  const when = month === "ytd" ? "this year" : month === "all" ? "any month" : monthLabel(month);

  const cell = (c: Core) =>
    c.n ? (
      <>
        <td className={`${td} ${sec} text-fog`}>{fmt1(c.csat)}</td>
        <td className={`${td} text-fog`}>{c.nps}</td>
        <td className={`${td} text-dusk`}>{c.n}</td>
      </>
    ) : (
      <>
        <td className={`${td} ${sec} text-faint`}>–</td>
        <td className={`${td} text-faint`}>–</td>
        <td className={`${td} text-faint`}>0</td>
      </>
    );

  return (
    <div className="space-y-5">
      <Panel
        title="Core numbers · last 6 months"
        action={<span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-dusk">{DATA_SCOPES.find(([k]) => k === data)?.[1]}</span>}
        bodyClassName="px-0 py-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th className={`${th} bg-panel-2`} />
                {(["onboarding", "bookkeeping", "tax"] as const).map((t) => (
                  <th key={t} colSpan={3} className={`${th} ${sec} bg-panel-2`}>
                    {TEAMS[t].label}
                  </th>
                ))}
              </tr>
              <tr>
                <th className={th}>Month</th>
                {[0, 1, 2].map((i) => (
                  <Cols key={i} />
                ))}
              </tr>
            </thead>
            <tbody>
              {six.map((m) => (
                <tr key={m.month} className="hover:bg-white/[0.02]">
                  <td className={`${td} font-body font-semibold text-fog`}>{monthLabel(m.month)}</td>
                  {cell(m.teams.onboarding)}
                  {cell(m.teams.bookkeeping)}
                  {cell(m.teams.tax)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Team"
          value={sc.team}
          width="w-[150px]"
          onChange={(v) => {
            const team = v as TeamKey;
            onChange({ ...sc, team, by: TEAMS[team].owner });
          }}
        >
          {(["onboarding", "bookkeeping", "tax"] as const).map((t) => (
            <option key={t} value={t}>
              {TEAMS[t].label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Rank by" value={by} width="w-[190px]" onChange={(v) => onChange({ ...sc, by: v as TeamRole })}>
          {TEAMS[sc.team].roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Month" value={month} width="w-[150px]" onChange={(v) => onChange({ ...sc, month: v })}>
          {months.map((k) => (
            <option key={k} value={k}>
              {monthLabel(k)}
            </option>
          ))}
          <option value="ytd">Year to date</option>
          <option value="all">All time</option>
        </FilterSelect>
        <ToolButton onClick={onCopy} disabled={!tr.length}>
          ↓ Copy scorecard
        </ToolButton>
      </div>

      <div className="overflow-x-auto rounded-[16px] border border-edge bg-panel">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {["#", ROLE_LABELS[by], "Responses", "CSAT", "NPS", "% promoters", "% detractors", sc.team === "bookkeeping" ? "Ease" : "Clarity", "At risk"].map(
                (h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {board.length ? (
              board.map((g, i) => (
                <tr key={g.name} className="hover:bg-white/[0.02]">
                  <td className={`${td} text-dusk`}>{g.name === "Not set" ? "" : i + 1}</td>
                  <td className={`${td} font-body`}>
                    <b className="font-semibold text-fog">{g.name}</b>
                    {g.n < SC_MIN_SAMPLE ? (
                      <div className="font-mono text-[10.5px] text-dusk">fewer than {SC_MIN_SAMPLE} responses</div>
                    ) : null}
                  </td>
                  <td className={`${td} text-fog`}>{g.n}</td>
                  <td className={`${td} text-fog`}>{fmt1(g.csat)}</td>
                  <td className={`${td} text-fog`}>{g.nps ?? "–"}</td>
                  <td className={`${td} text-fog`}>{pctOf(g.promPct)}</td>
                  <td className={`${td} text-fog`}>{pctOf(g.detPct)}</td>
                  <td className={`${td} text-fog`}>{fmt1(g.diag)}</td>
                  <td className={`${td} ${g.risk ? "text-danger" : "text-fog"}`}>{g.risk}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center text-[14px] text-dusk">
                  No {TEAMS[sc.team].label.toLowerCase()} responses in {when}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="m-0 px-0.5 text-[12.5px] leading-relaxed text-dusk">
        NPS = % promoters (9–10) minus % detractors (0–6). Onboarding is ranked by % promoters, bookkeeping and tax by NPS,
        then CSAT. Months go by the locked submitted date. People with fewer than {SC_MIN_SAMPLE} responses are too small a
        sample to judge on their own. The Data filter on the Responses tab also applies here.
      </p>
    </div>
  );
}

function Cols() {
  return (
    <>
      <th className={`${th} ${sec}`}>CSAT</th>
      <th className={th}>NPS</th>
      <th className={th}>n</th>
    </>
  );
}
