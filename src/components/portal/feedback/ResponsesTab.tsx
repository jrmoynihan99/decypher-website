"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  EXPECT_SHORT,
  LINK_ROLES,
  ONB_ROLES,
  PACKAGES,
  ROLE_LABELS,
  SEGMENTS,
  SVC_ROLES,
  TEAM_ROLES,
  joinNames,
  npsBand,
  type FeedbackResponse,
  type FeedbackSettings,
  type TeamFields,
  type TeamKey,
  type TeamRole,
} from "@/lib/feedback/schema";
import { fmtDate, fmtTime } from "@/lib/feedback/analytics";
import { CellSelect, LockIcon, NpsChip, Pill, ScoreChip, ToolButton } from "./bits";

/**
 * The Responses tab: one row per submission, in two tables — onboarding has
 * its own questions, bookkeeping and tax share one.
 *
 * Each table is two halves. Left of the line is what the client said, locked
 * (the store never writes it after the send). Right of it is what the team
 * fills in — who worked with the client, their package and segment — saved
 * the moment a dropdown changes. Date and client stay pinned while the rest
 * scrolls sideways, and clicking a client opens everything they said.
 */

export type SaveTeam = (id: string, patch: Partial<TeamFields>) => void;

export default function ResponsesTab({
  rows,
  anyAtAll,
  teamFilter,
  settings,
  openId,
  onToggleOpen,
  saveTeam,
  saving,
  canDeleteReal,
  onDelete,
  onGoSetup,
}: {
  rows: FeedbackResponse[];
  /** Whether there's a single response before filters — picks the empty message. */
  anyAtAll: boolean;
  teamFilter: TeamKey | "";
  settings: FeedbackSettings;
  openId: string | null;
  onToggleOpen: (id: string) => void;
  saveTeam: SaveTeam;
  saving: (id: string, field: string) => boolean;
  /** Admin: real responses get a delete button too, not only test ones. */
  canDeleteReal: boolean;
  onDelete: (id: string) => void;
  onGoSetup: () => void;
}) {
  if (!rows.length) return <EmptyResponses anyAtAll={anyAtAll} />;

  const onb = rows.filter((x) => x.survey === "onboarding");
  const svc = rows.filter((x) => x.survey === "service");
  const listsEmpty = TEAM_ROLES.every((k) => !settings.lists[k].length);
  const shared = { settings, openId, onToggleOpen, saveTeam, saving, canDeleteReal, onDelete };

  return (
    <div className="space-y-3">
      {teamFilter !== "bookkeeping" && teamFilter !== "tax" && onb.length ? (
        <>
          {teamFilter ? null : <SectionHead title="Onboarding" n={onb.length} />}
          <OnboardingTable rows={onb} {...shared} />
        </>
      ) : null}
      {teamFilter !== "onboarding" && svc.length ? (
        <>
          {teamFilter ? null : <SectionHead title="Bookkeeping & tax" n={svc.length} />}
          <ServiceTable rows={svc} {...shared} />
        </>
      ) : null}
      {listsEmpty ? (
        <p className="m-0 mt-2.5 text-[13px] text-tier-warn">
          The team dropdowns are empty. Add names under{" "}
          <button type="button" onClick={onGoSetup} className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-tier-warn underline">
            Team &amp; setup → Dropdown lists
          </button>
          .
        </p>
      ) : null}
    </div>
  );
}

/** Nothing to show: either nothing has come in, or the filters hide it all. */
export function EmptyResponses({ anyAtAll }: { anyAtAll: boolean }) {
  return (
    <div className="rounded-[16px] border border-edge bg-panel px-5 py-12 text-center text-[14px] leading-relaxed text-dusk">
      {anyAtAll ? (
        "No responses match these filters."
      ) : (
        <>
          <b className="text-fog">No responses yet.</b>
          <br />
          They show up here as soon as a client sends a survey.
        </>
      )}
    </div>
  );
}

function SectionHead({ title, n }: { title: string; n: number }) {
  return (
    <h3 className="m-0 flex items-baseline gap-2.5 px-0.5 pt-3 font-display text-[15px] font-semibold text-fog first:pt-0">
      {title}
      <span className="font-mono text-[12px] font-normal text-dusk">{n}</span>
    </h3>
  );
}

type TableProps = {
  rows: FeedbackResponse[];
  settings: FeedbackSettings;
  openId: string | null;
  onToggleOpen: (id: string) => void;
  saveTeam: SaveTeam;
  saving: (id: string, field: string) => boolean;
  canDeleteReal: boolean;
  onDelete: (id: string) => void;
};

/* ─────────────────────────────── table chrome ─────────────────────────────── */

// Side-specific border colours throughout: two plain `border-<colour>`
// utilities on one cell would fight over every side at once.
const thBase =
  "sticky whitespace-nowrap border-b border-b-edge-mid px-2.5 text-left font-mono text-[10.5px] font-bold uppercase tracking-[0.8px]";
// Two header rows, both sticky: the group row is a fixed 33px so the column
// row can sit exactly under it.
const thGroup = `${thBase} top-0 h-[33px] py-0`;
const thCol = `${thBase} top-[33px] py-2.5`;
// The pinned columns, each with its own background so the scrolled cells
// pass underneath. Corners (pinned AND in the header) stack highest.
const pinDate = "left-0 w-[96px] min-w-[96px] max-w-[96px]";
const pinClient = "left-[96px] w-[220px] min-w-[220px] max-w-[220px] shadow-[6px_0_10px_-8px_rgba(0,0,0,.45)]";
const sec = "border-l border-l-edge";

const gLock = `${thGroup} z-[3] bg-panel-2 text-dusk`;
const gTeam = `${thGroup} z-[3] bg-panel text-teal`;
const gCorner = (pin: string) => `${thGroup} ${pin} z-[4] bg-panel-2`;
const cTh = `${thCol} z-[3] bg-panel text-dusk`;
const cCorner = (pin: string) => `${thCol} ${pin} z-[4] bg-panel text-dusk`;

/**
 * The scroll box both tables share, and the width of it — the expanded
 * detail row pins itself to that width so it stays on screen while the
 * table under it scrolls sideways.
 */
function TableFrame({ render }: { render: (frameWidth: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="overflow-hidden rounded-[16px] border border-edge bg-panel">
      <div ref={ref} className="max-h-[72vh] overflow-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">{render(width)}</table>
      </div>
    </div>
  );
}

function Cell({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <td
      className={`whitespace-nowrap border-b border-b-edge bg-panel px-2.5 py-2 align-middle transition-colors group-hover/row:bg-panel-2 group-data-[open=true]/row:bg-panel-2 ${className}`}
    >
      {children}
    </td>
  );
}

function DateCell({ iso }: { iso: string | null }) {
  return (
    <Cell className={`sticky z-[2] ${pinDate}`}>
      <div title="Set when the client submitted. Can’t be changed." className="flex items-start gap-1.5 font-mono text-[11.5px] leading-[1.3] text-fog">
        <LockIcon className="mt-[2px] text-dusk" />
        <span>
          {fmtDate(iso)}
          <br />
          <span className="text-dusk">{fmtTime(iso)}</span>
        </span>
      </div>
    </Cell>
  );
}

function ClientCell({ x, open, onToggle }: { x: FeedbackResponse; open: boolean; onToggle: () => void }) {
  return (
    <Cell className={`sticky z-[2] ${pinClient}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group/who flex max-w-[200px] cursor-pointer flex-col items-start gap-px border-0 bg-transparent p-0 text-left"
      >
        <b className="flex max-w-[200px] items-center font-body text-[13.5px] font-semibold text-fog group-hover/who:text-magenta">
          <span className="truncate">{x.client_name || x.team.brand_name || "Unnamed client"}</span>
          <span aria-hidden className={`ml-1.5 text-dusk transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
            ›
          </span>
        </b>
        <span className="font-mono text-[10.5px] text-dusk">{x.client_id || "no client ID"}</span>
      </button>
      {x.recap_id ? (
        <Link
          href={`/portal/tax-recap?edit=${encodeURIComponent(x.recap_id)}`}
          title="Sent from this client's tax recap — open it"
          className="mt-1 inline-block rounded-full border border-violet/45 px-[7px] py-[1px] font-mono text-[10px] tracking-[0.06em] text-violet no-underline hover:border-violet"
        >
          from tax recap ↗
        </Link>
      ) : null}
    </Cell>
  );
}

const roleOptions = (settings: FeedbackSettings, role: TeamRole): [string, string][] =>
  settings.lists[role].map((n) => [n, n]);

function TeamCells({ x, roles, p, firstSec }: { x: FeedbackResponse; roles: TeamRole[]; p: TableProps; firstSec?: TeamRole }) {
  return (
    <>
      {roles.map((role) => (
        <Cell key={role} className={role === firstSec ? sec : ""}>
          <CellSelect
            label={ROLE_LABELS[role]}
            value={x.team[role]}
            options={roleOptions(p.settings, role)}
            disabled={p.saving(x.id, role)}
            onChange={(v) => p.saveTeam(x.id, { [role]: v })}
          />
        </Cell>
      ))}
      <Cell className={sec}>
        <CellSelect
          label="Package"
          value={x.team.package}
          options={PACKAGES}
          disabled={p.saving(x.id, "package")}
          onChange={(v) => p.saveTeam(x.id, { package: v })}
        />
      </Cell>
      <Cell>
        <CellSelect
          label="Segment"
          value={x.team.segment}
          options={SEGMENTS}
          disabled={p.saving(x.id, "segment")}
          onChange={(v) => p.saveTeam(x.id, { segment: v })}
        />
      </Cell>
    </>
  );
}

/* ─────────────────────────────── onboarding ─────────────────────────────── */

const ONB_LOCKED = ["CSAT", "NPS", "Clarity", "Ease", "Confidence", "12-mo plan", "Expectations", "Flags"];
const ONB_TEAM = ["Onboarding team lead", "Onboarding senior", "Onboarding staff", "Bookkeeping lead", "Package", "Segment"];

function OnboardingTable(p: TableProps) {
  const cols = 2 + ONB_LOCKED.length + ONB_TEAM.length;
  return (
    <>
      <TableFrame
        render={(w) => (
          <>
            <thead>
              <tr>
                <th className={gCorner(pinDate)} />
                <th className={gCorner(pinClient)} />
                <th colSpan={ONB_LOCKED.length} className={`${gLock} ${sec}`}>
                  <LockIcon className="mr-1.5 -mt-px" />
                  What the client said · locked
                </th>
                <th colSpan={ONB_TEAM.length} className={`${gTeam} ${sec}`}>
                  Team fills in
                </th>
              </tr>
              <tr>
                <th className={cCorner(pinDate)}>Submitted</th>
                <th className={cCorner(pinClient)}>Client</th>
                {ONB_LOCKED.map((c, i) => (
                  <th key={c} className={`${cTh} ${i === 0 ? sec : ""}`}>
                    {c}
                  </th>
                ))}
                {ONB_TEAM.map((c, i) => (
                  <th key={c} className={`${cTh} ${i === 0 || c === "Package" ? sec : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.rows.map((x) => {
                const open = p.openId === x.id;
                return (
                  <Fragment key={x.id}>
                    <tr className="group/row" data-open={open}>
                      <DateCell iso={x.submitted_at} />
                      <ClientCell x={x} open={open} onToggle={() => p.onToggleOpen(x.id)} />
                      <Cell className={sec}>
                        <ScoreChip v={x.csat_overall} />
                      </Cell>
                      <Cell>
                        <NpsChip v={x.nps_score} />
                      </Cell>
                      <Cell>
                        <ScoreChip v={x.clarity_score} />
                      </Cell>
                      <Cell>
                        <ScoreChip v={x.ease_score} />
                      </Cell>
                      <Cell>
                        <ScoreChip v={x.confidence_score} />
                      </Cell>
                      <Cell>
                        <ScoreChip v={x.fa_confidence_score} />
                      </Cell>
                      <Cell className="text-mist">{x.expectation_match ? EXPECT_SHORT[x.expectation_match] : "–"}</Cell>
                      <Cell>
                        <Flags x={x} />
                      </Cell>
                      <TeamCells x={x} roles={ONB_ROLES} p={p} firstSec="onboarding_team_lead_id" />
                    </tr>
                    {open ? (
                      <DetailRow cols={cols} width={w}>
                        <OnboardingDetail x={x} p={p} />
                      </DetailRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </>
        )}
      />
      <Footnote>
        Scores, comments and the submitted date come straight from the client and can’t be edited. Fill in who worked
        each onboarding with the team dropdowns. Click a name to see everything the client said.
      </Footnote>
    </>
  );
}

function Flags({ x }: { x: FeedbackResponse }) {
  const flags = [
    x.survey === "service" && x.bookkeeping_at_risk ? <Pill key="bk" tone="neg">BK at risk</Pill> : null,
    x.survey === "service" && x.tax_at_risk ? <Pill key="tx" tone="neg">Tax at risk</Pill> : null,
    x.survey === "onboarding" && x.at_risk_flag ? <Pill key="ar" tone="neg">at risk</Pill> : null,
    x.happy_for_review ? <Pill key="hr" tone="pos">review-ready</Pill> : null,
    x.is_test ? <Pill key="t">test</Pill> : null,
  ].filter(Boolean);
  return flags.length ? <>{flags}</> : <span className="text-faint">–</span>;
}

/* ─────────────────────────────── bookkeeping + tax ─────────────────────────────── */

const BK_COLS = ["CSAT", "NPS", "Ease", "Why"];
const TAX_COLS = ["CSAT", "NPS", "Clarity", "Why"];
const SVC_TEAM = [...SVC_ROLES.map((r) => ROLE_LABELS[r]), "Package", "Segment"];

function ServiceTable(p: TableProps) {
  const cols = 3 + BK_COLS.length + TAX_COLS.length + 1 + SVC_TEAM.length;
  const notAsked = <span className="text-faint">not asked</span>;
  return (
    <>
      <TableFrame
        render={(w) => (
          <>
            <thead>
              <tr>
                <th className={gCorner(pinDate)} />
                <th className={gCorner(pinClient)} />
                <th className={gLock} />
                <th colSpan={BK_COLS.length} className={`${gLock} ${sec}`}>
                  <LockIcon className="mr-1.5 -mt-px" />A · Bookkeeping · client said
                </th>
                <th colSpan={TAX_COLS.length} className={`${gLock} ${sec}`}>
                  <LockIcon className="mr-1.5 -mt-px" />B · Tax · client said
                </th>
                <th className={gLock} />
                <th colSpan={SVC_TEAM.length} className={`${gTeam} ${sec}`}>
                  Team fills in
                </th>
              </tr>
              <tr>
                <th className={cCorner(pinDate)}>Submitted</th>
                <th className={cCorner(pinClient)}>Client</th>
                <th className={cTh}>Round</th>
                {BK_COLS.map((c) => (
                  <th key={`bk-${c}`} className={`${cTh} ${c === "CSAT" ? sec : ""}`}>
                    {c}
                  </th>
                ))}
                {TAX_COLS.map((c) => (
                  <th key={`tax-${c}`} className={`${cTh} ${c === "CSAT" ? sec : ""}`}>
                    {c}
                  </th>
                ))}
                <th className={cTh}>Flags</th>
                {SVC_TEAM.map((c) => (
                  <th key={c} className={`${cTh} ${c === "Bookkeeping lead" || c === "Tax strategist" || c === "Package" ? sec : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.rows.map((x) => {
                const open = p.openId === x.id;
                const bk = x.teams.includes("bookkeeping");
                const tx = x.teams.includes("tax");
                return (
                  <Fragment key={x.id}>
                    <tr className="group/row" data-open={open}>
                      <DateCell iso={x.submitted_at} />
                      <ClientCell x={x} open={open} onToggle={() => p.onToggleOpen(x.id)} />
                      <Cell>
                        {bk ? <Pill>BK {x.bookkeeping_period}</Pill> : null}
                        {tx ? <Pill>Tax {x.tax_year}</Pill> : null}
                      </Cell>
                      <Cell className={sec}>{bk ? <ScoreChip v={x.bookkeeping_csat_1_5} /> : notAsked}</Cell>
                      <Cell>{bk ? <NpsChip v={x.bookkeeping_nps_0_10} /> : null}</Cell>
                      <Cell>{bk ? <ScoreChip v={x.bookkeeping_ease_1_5} /> : null}</Cell>
                      <Cell>{bk ? <Why text={x.bookkeeping_reason_text} /> : null}</Cell>
                      <Cell className={sec}>{tx ? <ScoreChip v={x.tax_csat_1_5} /> : notAsked}</Cell>
                      <Cell>{tx ? <NpsChip v={x.tax_nps_0_10} /> : null}</Cell>
                      <Cell>{tx ? <ScoreChip v={x.tax_clarity_1_5} /> : null}</Cell>
                      <Cell>{tx ? <Why text={x.tax_reason_text} /> : null}</Cell>
                      <Cell>
                        <Flags x={x} />
                      </Cell>
                      <TeamCells x={x} roles={SVC_ROLES} p={p} firstSec="bookkeeping_lead_id" />
                    </tr>
                    {open ? (
                      <DetailRow cols={cols} width={w}>
                        <ServiceDetail x={x} p={p} />
                      </DetailRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </>
        )}
      />
      <Footnote>
        Scores, reasons and the submitted date come straight from the client and can’t be edited. Fill in who worked with
        each client using the team dropdowns. Click a name to read everything.
      </Footnote>
    </>
  );
}

function Why({ text }: { text: string | null }) {
  return text ? (
    <span title={text} className="inline-block max-w-[230px] truncate align-middle text-[12.5px] text-fog">
      {text}
    </span>
  ) : (
    <span className="text-faint">–</span>
  );
}

function Footnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 mt-2.5 flex gap-1.5 px-0.5 text-[12.5px] leading-relaxed text-dusk">
      <LockIcon className="mt-[4px]" />
      <span>{children}</span>
    </p>
  );
}

/* ─────────────────────────────── the detail row ─────────────────────────────── */

function DetailRow({ cols, width, children }: { cols: number; width: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="border-b border-edge bg-night p-0">
        <div className="sticky left-0 px-4 pb-5 pt-[18px]" style={{ width: width || undefined, maxWidth: 1180 }}>
          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr_1fr]">{children}</div>
        </div>
      </td>
    </tr>
  );
}

function Section({ title, locked = false, children }: { title: string; locked?: boolean; children: React.ReactNode }) {
  return (
    <section className="min-w-0 whitespace-normal rounded-[16px] border border-edge bg-panel px-4 py-3.5">
      <h4 className="m-0 mb-2.5 flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-dusk">
        {locked ? <LockIcon /> : null}
        {title}
      </h4>
      {children}
    </section>
  );
}

function Dl({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3.5 gap-y-[7px] text-[13px]">
      {rows.map(([k, v], i) => (
        <Fragment key={i}>
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 text-right font-mono text-[12.5px] text-fog">{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Quote({ label, text }: { label: string; text: string | null }) {
  return (
    <div className="mt-3 whitespace-pre-wrap rounded-r-[10px] border-l-2 border-magenta bg-panel-2 px-3 py-2.5 text-[13.5px] leading-[1.45] text-fog">
      <small className="mb-1 block font-mono text-[10px] uppercase tracking-[1.2px] text-dusk">{label}</small>
      {text || "—"}
    </div>
  );
}

/** Brand / legal name: saved on blur or Enter, Escape puts it back. */
function RecordInput({
  x,
  field,
  label,
  placeholder,
  p,
}: {
  x: FeedbackResponse;
  field: "brand_name" | "legal_name";
  label: string;
  placeholder: string;
  p: TableProps;
}) {
  const stored = x.team[field] ?? "";
  const [text, setText] = useState(stored);
  const [editing, setEditing] = useState(false);
  // Follow the stored value (a refresh, a rollback) except while typing.
  const shown = editing ? text : stored;
  return (
    <label className="flex flex-col gap-1.5 text-[11.5px] text-muted">
      {label}
      <input
        type="text"
        value={shown}
        placeholder={placeholder}
        maxLength={200}
        disabled={p.saving(x.id, field)}
        onFocus={() => {
          setText(stored);
          setEditing(true);
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const clean = text.replace(/\s+/g, " ").trim();
          if (clean !== stored) p.saveTeam(x.id, { [field]: clean || null });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(stored);
            e.currentTarget.blur();
          }
        }}
        className={`w-full rounded-[8px] border bg-panel-2 px-2.5 py-1.5 font-body text-[13px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)] disabled:opacity-50 ${
          stored ? "border-teal/45" : "border-edge-mid"
        }`}
      />
    </label>
  );
}

function reviewLine(x: FeedbackResponse) {
  return x.review_link_clicked ? "shown · clicked" : x.review_prompt_shown ? "shown" : "not shown";
}

function Meta({ x, p, children }: { x: FeedbackResponse; p: TableProps; children?: React.ReactNode }) {
  return (
    <>
      <div className={`grid grid-cols-2 gap-2.5 ${children ? "mb-3.5" : ""}`}>
        <RecordInput x={x} field="brand_name" label="Brand name" placeholder="e.g. Maya Makes" p={p} />
        <RecordInput x={x} field="legal_name" label="Legal name" placeholder="e.g. Maya Rodriguez LLC" p={p} />
      </div>
      {children}
    </>
  );
}

/**
 * Test responses can go by anyone; a client's real one only by an admin (the
 * server enforces it too — it feeds the per-person scorecard).
 */
function DeleteResponse({ x, p }: { x: FeedbackResponse; p: TableProps }) {
  if (!x.is_test && !p.canDeleteReal) return null;
  return (
    <div className="mt-3.5">
      <ToolButton danger onClick={() => p.onDelete(x.id)}>
        {x.is_test ? "Delete this test response" : "Delete this response"}
      </ToolButton>
    </div>
  );
}

const lock = (s: string) => (
  <span className="inline-flex items-center gap-1.5">
    {s} <LockIcon className="text-dusk" />
  </span>
);

function commonTimeline(x: FeedbackResponse): [React.ReactNode, React.ReactNode][] {
  return [
    ["Review prompt", reviewLine(x)],
    ["Time on survey", x.duration_sec != null ? `${Math.round(x.duration_sec)} s` : "–"],
    ["Survey ID", x.id.slice(0, 18)],
    ["Version", `${x.survey_version || "–"}${x.is_test ? " · test" : ""}`],
    ...(x.recap_id
      ? ([
          [
            "Tax recap",
            <Link key="r" href={`/portal/tax-recap?edit=${encodeURIComponent(x.recap_id)}`} className="text-violet hover:underline">
              open ↗
            </Link>,
          ],
        ] as [React.ReactNode, React.ReactNode][])
      : []),
  ];
}

function OnboardingDetail({ x, p }: { x: FeedbackResponse; p: TableProps }) {
  const linked = [x.link_onboarding_team_lead, x.link_onboarding_senior, x.link_onboarding_staff].filter(Boolean);
  const firstName = (x.client_name || "the client").split(" ")[0];
  return (
    <>
      <Section title={`What ${firstName} said`} locked>
        <Dl
          rows={[
            ["Overall satisfaction (CSAT)", `${x.csat_overall ?? "–"} / 5`],
            ["Likely to recommend (NPS)", `${x.nps_score ?? "–"} / 10 · ${x.nps_band ?? ""}`],
            ["Clear on next steps", `${x.clarity_score ?? "–"} / 5`],
            ["Easy to get through", `${x.ease_score ?? "–"} / 5`],
            ["Confident in tax/financial position", `${x.confidence_score ?? "–"} / 5`],
            ["Confident in 12-month plan", `${x.fa_confidence_score ?? "–"} / 5`],
            ["Vs. expectations", x.expectation_match ? EXPECT_SHORT[x.expectation_match] : "–"],
          ]}
        />
        <Quote label="Most valuable" text={x.most_valuable_text} />
        <Quote label="One thing to improve" text={x.improvement_text} />
      </Section>
      <Section title="Client record">
        <Meta x={x} p={p} />
      </Section>
      <Section title="Timeline">
        <Dl
          rows={[
            [lock("Survey submitted"), `${fmtDate(x.submitted_at)} ${fmtTime(x.submitted_at)}`],
            [lock("Onboarding completed"), fmtDate(x.onboarding_completed_at ?? x.submitted_at)],
            ...(linked.length ? ([[lock("Team in the link"), joinNames(linked)]] as [React.ReactNode, React.ReactNode][]) : []),
            ...commonTimeline(x),
          ]}
        />
        <DeleteResponse x={x} p={p} />
      </Section>
    </>
  );
}

function sectionSaid(x: FeedbackResponse, t: "bookkeeping" | "tax") {
  if (!x.teams.includes(t)) return <p className="m-0 text-[13px] text-dusk">Not asked this round.</p>;
  const bk = t === "bookkeeping";
  const csat = bk ? x.bookkeeping_csat_1_5 : x.tax_csat_1_5;
  const nps = bk ? x.bookkeeping_nps_0_10 : x.tax_nps_0_10;
  const diag = bk ? x.bookkeeping_ease_1_5 : x.tax_clarity_1_5;
  return (
    <>
      <Dl
        rows={[
          ["Satisfaction (CSAT)", `${csat ?? "–"} / 5`],
          ["Likely to recommend (NPS)", `${nps ?? "–"} / 10 · ${npsBand(nps) ?? ""}`],
          [bk ? "Easy to keep books current" : "Clear on tax position and plan", diag != null ? `${diag} / 5` : "skipped"],
          [bk ? "Period" : "Tax year", (bk ? x.bookkeeping_period : x.tax_year) || "–"],
        ]}
      />
      <Quote label="Main reason for these scores" text={bk ? x.bookkeeping_reason_text : x.tax_reason_text} />
    </>
  );
}

function ServiceDetail({ x, p }: { x: FeedbackResponse; p: TableProps }) {
  const linked = LINK_ROLES.filter((lr) => lr.team !== "onboarding" && x[lr.field]);
  return (
    <>
      <Section title="A · Bookkeeping" locked>
        {sectionSaid(x, "bookkeeping")}
      </Section>
      <Section title="B · Tax" locked>
        {sectionSaid(x, "tax")}
      </Section>
      <Section title="Client record">
        <Meta x={x} p={p}>
          <Dl
            rows={[
              [lock("Submitted"), `${fmtDate(x.submitted_at)} ${fmtTime(x.submitted_at)}`],
              ...linked.map(
                (lr): [React.ReactNode, React.ReactNode] => [lock(`In the link · ${ROLE_LABELS[lr.role]}`), x[lr.field]],
              ),
              ...commonTimeline(x),
            ]}
          />
        </Meta>
        <DeleteResponse x={x} p={p} />
      </Section>
    </>
  );
}
