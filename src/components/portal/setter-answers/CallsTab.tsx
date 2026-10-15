"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { fmtDate, fmtTime } from "@/lib/feedback/analytics";
import {
  LISTS,
  countsText,
  fmtDateAnswer,
  fmtMoney,
  label,
  named,
  parseDateStr,
  revenueText,
  safeUrl,
  short,
  talkingPoints,
  type DiscoveryRecord,
  type DiscoveryTeam,
  type ListKey,
} from "@/lib/discovery/schema";
import { CellSelect, LockIcon, Pill, ToolButton } from "@/components/portal/feedback/bits";
import type { SaveTeam } from "./SetterAnswers";

/**
 * The Calls tab: one row per discovery call. Left of the line is what the
 * creator said, locked (the call writes it; this tab never does). Right of
 * it is what staff fill in — advisor, fit, next step — saved the moment a
 * dropdown changes. Date and creator stay pinned while the rest scrolls
 * sideways, and clicking a creator opens everything they said, the notes
 * and the Fathom link. The same table as Client Feedback's Responses.
 */

const CALL_COLS = ["Source", "Entity", "Payroll", "Banks (biz / pers.)", "Cards (biz / pers.)", "Mixing", "Filed via", "Total tax", "Current year", "Next call", "Flags"];
const STAFF_COLS = ["Advisor", "Fit", "Next step"];

type Props = {
  rows: DiscoveryRecord[];
  /** Whether there's a single call before filters — picks the empty message. */
  anyAtAll: boolean;
  /** Practice calls exist but the Data filter hides them. */
  hiddenPractice: boolean;
  advisors: string[];
  openId: string | null;
  onToggleOpen: (id: string) => void;
  saveTeam: SaveTeam;
  saving: (id: string, field: string) => boolean;
  /** Admin: real calls get a delete button too, not only practice ones. */
  canDeleteReal: boolean;
  onDelete: (id: string) => void;
};

const opts = (list: ListKey): [string, string][] => (LISTS[list] as readonly (readonly [string, string])[]).map(([v, l]) => [v, l]);

export default function CallsTab(p: Props) {
  if (!p.rows.length) return <EmptyCalls anyAtAll={p.anyAtAll} hiddenPractice={p.hiddenPractice} />;
  const cols = 2 + CALL_COLS.length + STAFF_COLS.length;
  return (
    <>
      <TableFrame
        render={(w) => (
          <>
            <thead>
              <tr>
                <th className={gCorner(pinDate)} />
                <th className={gCorner(pinClient)} />
                <th colSpan={CALL_COLS.length} className={`${gLock} ${sec}`}>
                  <LockIcon className="mr-1.5 -mt-px" />
                  What the creator said · locked
                </th>
                <th colSpan={STAFF_COLS.length} className={`${gTeam} ${sec}`}>
                  Staff fills in
                </th>
              </tr>
              <tr>
                <th className={cCorner(pinDate)}>Called</th>
                <th className={cCorner(pinClient)}>Creator</th>
                {CALL_COLS.map((c, i) => (
                  <th key={c} className={`${cTh} ${i === 0 ? sec : ""}`}>
                    {c}
                  </th>
                ))}
                {STAFF_COLS.map((c, i) => (
                  <th key={c} className={`${cTh} ${i === 0 ? sec : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.rows.map((x) => {
                const open = p.openId === x.id;
                const c = x.call;
                const payroll =
                  c.entity !== "s_corp" ? (
                    <Dash />
                  ) : c.payroll === "yes" ? (
                    c.payrollProvider ? named("payroll_provider", c.payrollProvider, c.payrollProviderDetail) : "Yes"
                  ) : c.payroll === "no" ? (
                    <span className="text-magenta">None</span>
                  ) : (
                    <Dash />
                  );
                return (
                  <Fragment key={x.id}>
                    <tr className="group/row" data-open={open}>
                      <DateCell iso={x.submittedAt} />
                      <CreatorCell x={x} open={open} onToggle={() => p.onToggleOpen(x.id)} onDelete={canDelete(x, p) ? () => p.onDelete(x.id) : null} />
                      <Cell className={`${sec} text-mist`}>{c.source ? short("source", c.source) : <Dash />}</Cell>
                      <Cell className="text-mist">{c.entity ? short("entity", c.entity) : <Dash />}</Cell>
                      <Cell className="text-mist">{payroll}</Cell>
                      <Cell className="font-mono text-mist">{c.banksBusiness != null ? `${c.banksBusiness} / ${c.banksPersonal}` : <Dash />}</Cell>
                      <Cell className="font-mono text-mist">{c.cardsBusiness != null ? `${c.cardsBusiness} / ${c.cardsPersonal}` : <Dash />}</Cell>
                      <Cell className="text-mist">{c.commingle ? short("commingle", c.commingle) : <Dash />}</Cell>
                      <Cell className="text-mist">{c.filedPrior === "no" ? "Didn’t file" : c.filedHow ? short("filed_how", c.filedHow) : <Dash />}</Cell>
                      <Cell className="font-mono text-mist">{c.totalTax != null ? fmtMoney(c.totalTax) : c.totalTaxUnsure ? <span className="text-dusk">Not sure</span> : <Dash />}</Cell>
                      <Cell className="text-mist">
                        {c.revenueExact != null ? <span className="font-mono">{fmtMoney(c.revenueExact)}</span> : c.revenueBand ? label("revenue", c.revenueBand) : <Dash />}
                      </Cell>
                      <Cell>{c.reviewChoice ? <Pill tone={c.reviewChoice === "return" ? "pos" : "mute"}>{short("review_choice", c.reviewChoice)}</Pill> : <Dash />}</Cell>
                      <Cell>
                        <Flags x={x} />
                      </Cell>
                      <Cell className={sec}>
                        <CellSelect
                          label="Advisor"
                          value={x.team.advisor}
                          options={p.advisors.map((n) => [n, n])}
                          disabled={p.saving(x.id, "advisor")}
                          onChange={(v) => p.saveTeam(x.id, { advisor: v })}
                        />
                      </Cell>
                      <Cell>
                        <CellSelect label="Fit" value={x.team.fit} options={opts("fit")} disabled={p.saving(x.id, "fit")} onChange={(v) => p.saveTeam(x.id, { fit: v })} />
                      </Cell>
                      <Cell>
                        <CellSelect
                          label="Next step"
                          value={x.team.nextStep}
                          options={opts("next_step")}
                          disabled={p.saving(x.id, "nextStep")}
                          onChange={(v) => p.saveTeam(x.id, { nextStep: v })}
                        />
                      </Cell>
                    </tr>
                    {open ? (
                      <DetailRow cols={cols} width={w}>
                        <CallDetail x={x} p={p} />
                      </DetailRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </>
        )}
      />
      <p className="m-0 mt-2.5 flex gap-1.5 px-0.5 text-[12.5px] leading-relaxed text-dusk">
        <LockIcon className="mt-[4px]" />
        <span>
          Answers and the call date come from the call and can’t be edited here. Fill in the advisor, the fit and the next step
          with the dropdowns. Click a creator to see everything, plus notes and the Fathom link.
        </span>
      </p>
    </>
  );
}

/** Nothing to show: either nothing has come in, or the filters hide it all. */
export function EmptyCalls({ anyAtAll, hiddenPractice }: { anyAtAll: boolean; hiddenPractice: boolean }) {
  return (
    <div className="rounded-[16px] border border-edge bg-panel px-5 py-12 text-center text-[14px] leading-relaxed text-dusk">
      {anyAtAll ? (
        <>
          No calls match these filters.
          {hiddenPractice ? (
            <>
              <br />
              Practice calls are hidden. Set <b className="text-fog">Data</b> to include them.
            </>
          ) : null}
        </>
      ) : (
        <>
          <b className="text-fog">No calls yet.</b>
          <br />
          Run one from Tax Strategy → Sales Discovery. Tick <b className="text-fog">Practice call</b> there, or in the call’s staff
          drawer, to keep a test out of your real numbers.
          {hiddenPractice ? (
            <>
              <br />
              Practice calls are hidden. Set <b className="text-fog">Data</b> to include them.
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────── table chrome ─────────────────────────────── */

// Side-specific border colours throughout: two plain `border-<colour>`
// utilities on one cell would fight over every side at once.
const thBase = "sticky whitespace-nowrap border-b border-b-edge-mid px-2.5 text-left font-mono text-[10.5px] font-bold uppercase tracking-[0.8px]";
// Two header rows, both sticky: the group row is a fixed 33px so the column
// row can sit exactly under it.
const thGroup = `${thBase} top-0 h-[33px] py-0`;
const thCol = `${thBase} top-[33px] py-2.5`;
// The pinned columns, each with its own background so the scrolled cells
// pass underneath. Corners (pinned AND in the header) stack highest.
const pinDate = "left-0 w-[112px] min-w-[112px] max-w-[112px]";
const pinClient = "left-[112px] w-[220px] min-w-[220px] max-w-[220px] shadow-[6px_0_10px_-8px_rgba(0,0,0,.45)]";
const sec = "border-l border-l-edge";

const gLock = `${thGroup} z-[3] bg-panel-2 text-dusk`;
const gTeam = `${thGroup} z-[3] bg-panel text-teal`;
const gCorner = (pin: string) => `${thGroup} ${pin} z-[4] bg-panel-2`;
const cTh = `${thCol} z-[3] bg-panel text-dusk`;
const cCorner = (pin: string) => `${thCol} ${pin} z-[4] bg-panel text-dusk`;

/** The scroll box, and its width — the expanded detail row pins itself to it so it stays on screen while the table scrolls sideways. */
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

const Dash = () => <span className="text-faint">–</span>;

function DateCell({ iso }: { iso: string | null }) {
  return (
    <Cell className={`sticky z-[2] ${pinDate}`}>
      <div title="Set when the call was saved. Can’t be changed." className="flex items-start gap-1.5 font-mono text-[11.5px] leading-[1.3] text-fog">
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

/** The pinned name column: opens the row, and carries the row's delete so it's always on screen. */
function CreatorCell({ x, open, onToggle, onDelete }: { x: DiscoveryRecord; open: boolean; onToggle: () => void; onDelete: (() => void) | null }) {
  const sub = `${x.call.durationMin ? `${x.call.durationMin} min call` : "call"}${safeUrl(x.team.fathom) ? " · Fathom" : ""}`;
  return (
    <Cell className={`sticky z-[2] ${pinClient}`}>
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="group/who flex min-w-0 max-w-[200px] cursor-pointer flex-col items-start gap-px border-0 bg-transparent p-0 text-left"
        >
          <b className="flex max-w-[180px] items-center font-body text-[13.5px] font-semibold text-fog group-hover/who:text-magenta">
            <span className="truncate">{x.call.creatorName || "Unnamed creator"}</span>
            <span aria-hidden className={`ml-1.5 text-dusk transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
              ›
            </span>
          </b>
          <span className="font-mono text-[10.5px] text-dusk">{sub}</span>
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${x.call.creatorName || "this"} call`}
            title={x.isTest ? "Delete this practice call" : "Delete this call"}
            className="flex-none cursor-pointer rounded-[8px] border-0 bg-transparent p-1.5 text-dusk transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6" />
            </svg>
          </button>
        ) : null}
      </div>
    </Cell>
  );
}

function Flags({ x }: { x: DiscoveryRecord }) {
  const c = x.call;
  const flags = [
    c.usFiler === "no" ? <Pill key="us" tone="neg">not US</Pill> : null,
    c.entity === "s_corp" && c.payroll === "no" ? <Pill key="pr" tone="neg">S corp, no payroll</Pill> : null,
    c.entity === "sole_prop" ? <Pill key="llc" tone="warn">no LLC</Pill> : null,
    c.banksBusiness === 0 ? <Pill key="bk" tone="warn">no biz bank</Pill> : null,
    c.commingle === "yes" || c.commingle === "some" ? <Pill key="mx" tone="warn">mixing</Pill> : null,
    c.pointsInterest === "yes" ? <Pill key="pt" tone="pos">points</Pill> : null,
    x.isTest ? <Pill key="t">practice</Pill> : null,
  ].filter(Boolean);
  return flags.length ? <>{flags}</> : <Dash />;
}

/* ─────────────────────────────── the detail row ─────────────────────────────── */

function DetailRow({ cols, width, children }: { cols: number; width: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="border-b border-edge bg-night p-0">
        <div className="sticky left-0 px-4 pb-5 pt-[18px]" style={{ width: width || undefined, maxWidth: 1180 }}>
          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">{children}</div>
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
          <dt className="whitespace-nowrap text-muted">{k}</dt>
          <dd className="m-0 text-right font-mono text-[12.5px] text-fog [overflow-wrap:anywhere]">{v || "–"}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** Notes and the Fathom link: saved on blur or Enter, Escape puts it back. */
function RecordInput({
  x,
  field,
  label,
  placeholder,
  p,
  multiline = false,
}: {
  x: DiscoveryRecord;
  field: "notes" | "fathom";
  label: string;
  placeholder: string;
  p: Props;
  multiline?: boolean;
}) {
  const stored = x.team[field] ?? "";
  const [text, setText] = useState(stored);
  const [editing, setEditing] = useState(false);
  // Follow the stored value (a refresh, a rollback) except while typing.
  const shown = editing ? text : stored;
  const commit = () => {
    setEditing(false);
    const clean = multiline ? text.trim() : text.replace(/\s+/g, " ").trim();
    if (clean !== stored) p.saveTeam(x.id, { [field]: clean || null } as Partial<DiscoveryTeam>);
  };
  const cls = `w-full rounded-[8px] border bg-panel-2 px-2.5 py-1.5 font-body text-[13px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)] disabled:opacity-50 ${
    stored ? "border-teal/45" : "border-edge-mid"
  }`;
  const url = field === "fathom" ? safeUrl(stored) : "";
  return (
    <label className="flex flex-col gap-1.5 text-[11.5px] text-muted">
      <span className="flex items-center justify-between gap-2">
        {label}
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-[10.5px] uppercase tracking-[0.8px] text-teal no-underline hover:underline">
            Open ↗
          </a>
        ) : null}
      </span>
      {multiline ? (
        <textarea
          value={shown}
          placeholder={placeholder}
          maxLength={5000}
          disabled={p.saving(x.id, field)}
          onFocus={() => {
            setText(stored);
            setEditing(true);
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setText(stored);
              e.currentTarget.blur();
            }
          }}
          className={`${cls} min-h-[110px] resize-y leading-relaxed`}
        />
      ) : (
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
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setText(stored);
              e.currentTarget.blur();
            }
          }}
          className={cls}
        />
      )}
    </label>
  );
}

const canDelete = (x: DiscoveryRecord, p: Pick<Props, "canDeleteReal">) => x.isTest || p.canDeleteReal;

const when = (s: string | null) => (s ? fmtDateAnswer(parseDateStr(s)) : "");

function CallDetail({ x, p }: { x: DiscoveryRecord; p: Props }) {
  const c = x.call;
  const tp = talkingPoints(c);
  const rows: ([React.ReactNode, React.ReactNode] | null)[] = [
    ["Heard about us", [short("source", c.source), c.sourceDetail].filter(Boolean).join(" · ")],
    ["Files US taxes", c.usFiler === "yes" ? "Yes" : c.usFiler === "no" ? "No" : ""],
    ["Entity", label("entity", c.entity)],
    c.llcFiled ? ["LLC filed", when(c.llcFiled)] : null,
    c.scorpElected ? ["S corp elected", when(c.scorpElected)] : null,
    c.payroll
      ? ["Payroll", c.payroll === "yes" ? `Yes${c.payrollProvider ? ` · ${named("payroll_provider", c.payrollProvider, c.payrollProviderDetail)}` : ""}` : <span className="text-magenta">No</span>]
      : null,
    c.salary != null || c.salaryUnsure ? ["Salary", c.salary != null ? fmtMoney(c.salary) : "Not sure"] : null,
    c.partnershipFiled ? ["Partnership filed", when(c.partnershipFiled)] : null,
    ["Bank accounts", countsText(c.banks, c.banksDetail, "bank")],
    ["Credit cards", c.cardsNone ? "None" : countsText(c.cards, c.cardsDetail, "issuers")],
    ["Business vs personal", label("commingle", c.commingle)],
    ["Filing status", label("filing_status", c.filingStatus)],
    [`Prior-year (${c.taxYearAsked}) return`, `${label("filed_prior", c.filedPrior)}${c.filedHow ? ` · ${named("filed_how", c.filedHow, c.filedHowDetail)}` : ""}`],
    ["Total tax (line 24)", c.totalTax != null ? fmtMoney(c.totalTax) : c.totalTaxUnsure ? "Not sure" : ""],
    ["Income from", c.streams.map((s) => label("streams", s) || s).join(", ")],
    [`Prior year (${c.taxYearAsked})`, `${revenueText(c.priorRevenueExact, c.priorRevenueBand)}${c.priorRevenueUnsure ? " (range)" : ""}`],
    [`Current year (${c.revenueYear})`, `${revenueText(c.revenueExact, c.revenueBand)}${c.revenueUnsure ? " (range)" : ""}`],
    ["Next call", label("review_choice", c.reviewChoice)],
    ["Decision", c.decider === "others" ? `Including ${c.deciderWho || "someone"}` : label("decider", c.decider)],
    ["Tracking", c.tracking.map((t) => (t === "other_tool" ? c.trackingDetail || "Other tool" : short("tracking", t))).join(", ")],
  ];
  return (
    <>
      <Section title={`What ${c.creatorName ? c.creatorName.split(" ")[0] : "the creator"} told us`} locked>
        <Dl rows={rows.filter((r): r is [React.ReactNode, React.ReactNode] => !!r)} />
      </Section>
      <Section title="Staff">
        <div className="grid gap-2.5">
          {x.team.fit === "not_fit" ? (
            <label className="flex flex-col gap-1.5 text-[11.5px] text-muted">
              Why not a fit
              <CellSelect label="Why not a fit" value={x.team.fitReason} options={opts("fit_reason")} wide disabled={p.saving(x.id, "fitReason")} onChange={(v) => p.saveTeam(x.id, { fitReason: v })} />
            </label>
          ) : null}
          <RecordInput x={x} field="fathom" label="Fathom recording" placeholder="https://fathom.video/…" p={p} />
          <RecordInput x={x} field="notes" label="Call notes" placeholder="What to recap on the next call" p={p} multiline />
        </div>
        <h4 className="m-0 mb-2 mt-4 font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] text-dusk">Talking points</h4>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {tp.length ? (
            tp.map((t) => (
              <li key={t} className="rounded-[9px] border-l-2 border-ember bg-panel-2 px-2.5 py-2 text-[12.5px] leading-[1.4] text-fog">
                {t}
              </li>
            ))
          ) : (
            <li className="rounded-[9px] border-l-2 border-edge bg-panel-2 px-2.5 py-2 text-[12.5px] text-dusk">Nothing flagged.</li>
          )}
        </ul>
        <Dl
          rows={[
            ["Saved by", x.savedByName || "–"],
            ["Last staff edit", x.teamUpdatedAt ? `${fmtDate(x.teamUpdatedAt)}${x.teamUpdatedBy ? ` · ${x.teamUpdatedBy}` : ""}` : "–"],
            ["Version", `${c.version}${x.isTest ? " · practice" : ""}`],
          ]}
        />
        {canDelete(x, p) ? (
          <div className="mt-3.5">
            <ToolButton danger onClick={() => p.onDelete(x.id)}>
              {x.isTest ? "Delete this practice call" : "Delete this call"}
            </ToolButton>
          </div>
        ) : null}
      </Section>
    </>
  );
}
