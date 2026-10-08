"use client";

/**
 * The S-Corp Analyzer's Saved clients tab — the tax team's side of the tool.
 *
 * Every saved salary gets a second look six months after it's set. This tab
 * is that workflow: notes to send clients whose salary changed, checks coming
 * due (complete it, or tweak the salary and a note is drafted), then the full
 * list with an account summary per row.
 *
 * Everything sits behind "Show saved clients" because the analyzer is
 * screen-shared on calls: names, salaries and distributions stay off screen
 * until someone asks for them, and hide again when the tab is left. All state
 * lives in ScorpAnalyzer — this file is presentation and wiring only.
 */

import { useRef } from "react";
import { money } from "@/lib/widget-format";
import { Mono } from "@/components/portal/widgets/ui";
import {
  CHECK_MONTHS,
  DUE_SOON_DAYS,
  analyze,
  clientName,
  dueLabel,
  fmtDate,
  fmtStamp,
  historyLabel,
  readOf,
  type ReviewQueues,
  type ScorpAnalysis,
  type ScorpClient,
} from "@/lib/tax-strategy/scorp";
import {
  RiskPill,
  StatusDot,
  dangerBtn,
  fieldCls,
  ghostBtn,
  okBtn,
  primaryBtn,
  tweakBtn,
  type SaveStatus,
} from "./parts";

export type SortKey = "next" | "name" | "salary" | "recent";

const DUE_TEXT = { neg: "text-danger", warn: "text-ember", mute: "text-faint" } as const;
const DUE_BORDER = { neg: "border-danger/40", warn: "border-ember/40", mute: "border-edge" } as const;
const DUE_PILL = {
  neg: "border-danger/60 text-danger",
  warn: "border-ember/60 text-ember",
  mute: "border-edge-mid text-faint",
} as const;

type Accent = "magenta" | "teal" | "ember" | "fog";
const ACCENT: Record<Accent, string> = {
  magenta: "text-magenta",
  teal: "text-teal",
  ember: "text-ember",
  fog: "text-fog",
};

/** The toolbar controls' compact shell — SalesFlow's search and filter. */
const toolbarCls =
  "rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2 font-body text-[13px] text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]";

const caretStyle: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%238f88a0' stroke-width='2'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 11px center",
};

export type SavedClientsProps = {
  clients: ScorpClient[];
  queues: ReviewQueues;
  loading: boolean;
  refreshing: boolean;
  status: SaveStatus;
  /** The client loaded in the calculator — highlighted in the table. */
  currentId: string | null;
  /** Clients with a write in flight; their actions disable until it lands. */
  busyIds: Record<string, boolean>;

  showSaved: boolean;
  onShow: () => void;
  onHide: () => void;
  onRefresh: () => void;

  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  search: string;
  onSearch: (q: string) => void;
  sortKey: SortKey;
  onSort: (k: SortKey) => void;

  noticeText: (c: ScorpClient) => string;
  onDraft: (id: string, text: string) => void;
  onSaveDraft: (c: ScorpClient) => void;
  onCopyNote: (c: ScorpClient, el: HTMLTextAreaElement | null) => void;
  onNotified: (c: ScorpClient) => void;
  onCheckComplete: (c: ScorpClient) => void;
  onTweak: (c: ScorpClient) => void;
  onOpen: (c: ScorpClient) => void;

  confirmId: string | null;
  onConfirmDelete: (id: string | null) => void;
  onDelete: (id: string) => void;

  onExport: () => void;
  onImport: (file: File) => void;
};

export default function SavedClients(p: SavedClientsProps) {
  const { clients, queues: q, loading } = p;
  // The note textareas, so "Copy note" can fall back to select-and-copy.
  const noticeRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <StatusDot tone={p.status.tone} />
          <span>{p.status.text}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={p.onRefresh}
            disabled={p.refreshing || loading}
            className={ghostBtn}
          >
            {p.refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {p.showSaved ? (
            <button type="button" onClick={p.onHide} className={ghostBtn}>
              Hide saved clients
            </button>
          ) : null}
        </div>
      </div>

      {!p.showSaved ? (
        <div className="rounded-[16px] border border-edge bg-panel px-6 py-9 text-center">
          <h3 className="font-display text-[19px] font-bold tracking-[-0.3px] text-fog">
            Client details are hidden
          </h3>
          <p className="mx-auto mt-1.5 max-w-[460px] text-[13px] leading-relaxed text-muted">
            Names, salaries and distributions stay off screen so it&rsquo;s safe to
            share. They hide again when you leave this tab or reload.
          </p>
          <div className="my-4 flex justify-center">
            <Counts q={q} saved={loading ? "…" : clients.length} />
          </div>
          <button type="button" onClick={p.onShow} className={primaryBtn}>
            Show saved clients
          </button>
        </div>
      ) : (
        <>
          <Section
            title="Salary checks"
            sub={`Every salary gets a second look ${CHECK_MONTHS} months after it's set. Checks due in the next ${DUE_SOON_DAYS} days show here.`}
            right={<Counts q={q} />}
          >
            <div className="p-5">
              {loading ? (
                <p className="text-[13px] text-muted">Loading saved clients…</p>
              ) : q.attention === 0 ? (
                <p className="text-[13.5px] leading-relaxed text-muted">
                  {clients.length === 0
                    ? "No saved clients yet. Run the numbers in the calculator, then save the client to schedule their first salary check."
                    : q.nextUp
                      ? `Nothing due. The next check is ${clientName(q.nextUp)} on ${fmtDate(q.nextUp.nextCheckOn)}.`
                      : "Nothing due."}
                </p>
              ) : (
                <>
                  {q.pending.length > 0 ? (
                    <div className={q.due.length ? "mb-6" : ""}>
                      <h4 className="font-display text-[14px] font-bold text-fog">
                        Tell the client
                      </h4>
                      <p className="mb-3 mt-1 text-[12px] text-muted">
                        These salaries changed. Copy the note into email or TaxDome,
                        send it, then mark the client notified.
                      </p>
                      <div className={gridCls}>
                        {q.pending.map((c) => {
                          const n = c.clientNotice;
                          if (!n) return null;
                          const busy = !!p.busyIds[c.id];
                          return (
                            <div
                              key={c.id}
                              className="rounded-[16px] border border-magenta/40 bg-magenta/[0.05] p-4"
                            >
                              <div className="flex items-baseline justify-between gap-2.5">
                                <div className="min-w-0 font-display text-[16px] font-bold text-fog">
                                  {clientName(c)}
                                </div>
                                <div className="whitespace-nowrap font-mono text-[10.5px] text-faint">
                                  Changed {fmtDate(n.createdOn)}
                                </div>
                              </div>
                              {c.bizName && (c.firstName || c.lastName) ? (
                                <div className="text-[12px] text-muted">{c.bizName}</div>
                              ) : null}
                              <div className="my-3 grid grid-cols-2 gap-3">
                                <Figure
                                  label="Salary"
                                  value={money(n.salary)}
                                  accent="magenta"
                                  sub={
                                    n.salary !== n.fromSalary
                                      ? `was ${money(n.fromSalary)}`
                                      : "unchanged"
                                  }
                                />
                                <Figure
                                  label="Distributions"
                                  value={money(n.distribution)}
                                  accent="teal"
                                  sub={
                                    n.distribution !== n.fromDistribution
                                      ? `was ${money(n.fromDistribution)}`
                                      : "unchanged"
                                  }
                                />
                              </div>
                              <textarea
                                ref={(el) => {
                                  noticeRefs.current[c.id] = el;
                                }}
                                value={p.noticeText(c)}
                                onChange={(e) => p.onDraft(c.id, e.target.value)}
                                onBlur={() => p.onSaveDraft(c)}
                                aria-label={`Note to ${clientName(c)}`}
                                className={`${fieldCls} block min-h-[190px] w-full resize-y font-body text-[12.5px] leading-relaxed`}
                              />
                              <div className="mt-2.5 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => p.onCopyNote(c, noticeRefs.current[c.id] ?? null)}
                                  className={tweakBtn}
                                >
                                  Copy note
                                </button>
                                <button
                                  type="button"
                                  onClick={() => p.onNotified(c)}
                                  disabled={busy}
                                  className={okBtn}
                                >
                                  Client notified
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {q.due.length > 0 ? (
                    <div>
                      <h4 className="font-display text-[14px] font-bold text-fog">
                        Due for a check
                      </h4>
                      <p className="mb-3 mt-1 text-[12px] text-muted">
                        If the salary still fits, mark the check complete. If it
                        doesn&rsquo;t, tweak it and the client note is drafted for you.
                      </p>
                      <div className={gridCls}>
                        {q.due.map((c) => {
                          const x = analyze(c);
                          const d = dueLabel(c);
                          const key = `due-${c.id}`;
                          const open = !!p.expanded[key];
                          const busy = !!p.busyIds[c.id];
                          return (
                            <div
                              key={c.id}
                              className={`rounded-[16px] border bg-panel p-4 ${DUE_BORDER[d.tone]} ${
                                open ? "col-span-full" : ""
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2.5">
                                <div className="min-w-0">
                                  <div className="font-display text-[16px] font-bold text-fog">
                                    {clientName(c)}
                                  </div>
                                  <div className="mt-0.5 text-[12px] text-muted">
                                    {[
                                      c.firstName || c.lastName ? c.bizName : "",
                                      `Salary set ${fmtDate(c.salarySetOn)}`,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </div>
                                </div>
                                <span
                                  className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.5px] ${DUE_PILL[d.tone]}`}
                                >
                                  {d.text}
                                </span>
                              </div>
                              <div className="mb-3 mt-3.5 grid grid-cols-3 gap-3">
                                <Figure
                                  label="Salary"
                                  value={money(c.salary)}
                                  accent="magenta"
                                  sub={`${money(c.salary / 12)}/mo`}
                                />
                                <Figure
                                  label="Distributions"
                                  value={money(x.distribution)}
                                  accent="teal"
                                  sub={`${x.distPct}% of profit`}
                                />
                                <Figure
                                  label="Profit"
                                  value={money(x.profit)}
                                  accent="fog"
                                  sub={`saves ${money(x.savings)}/yr`}
                                />
                              </div>
                              <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                                <RiskPill risk={x.risk} />
                                {x.overDistributing ? (
                                  <span className="text-[11.5px] text-ember">
                                    Over basis by {money(x.excessOverBasis)}
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-[12.5px] leading-relaxed text-muted">
                                {readOf(c, x)}
                              </p>
                              {open ? (
                                <div className="mt-3">
                                  <AccountSummary c={c} />
                                </div>
                              ) : null}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => p.onCheckComplete(c)}
                                  disabled={busy}
                                  className={okBtn}
                                >
                                  Check complete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => p.onTweak(c)}
                                  disabled={busy}
                                  className={tweakBtn}
                                >
                                  Tweak salary
                                </button>
                                <button
                                  type="button"
                                  onClick={() => p.onToggle(key)}
                                  aria-expanded={open}
                                  className={ghostBtn}
                                >
                                  {open ? "Hide summary" : "Account summary"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </Section>

          <SalarySetTable {...p} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={p.onExport}
              disabled={!clients.length}
              className={ghostBtn}
            >
              Export backup
            </button>
            <label className={`${ghostBtn} inline-block`}>
              Import backup
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) p.onImport(f);
                }}
              />
            </label>
            <span className="text-[11px] text-faint">
              Import brings in clients saved with the browser-only version.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** Cards that reflow from one column on a phone to as many as fit. */
const gridCls = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] gap-3";

/* ─────────────────────────────── the table ─────────────────────────────── */

function SalarySetTable(p: SavedClientsProps) {
  const { clients } = p;
  const query = p.search.trim().toLowerCase();
  const rows = clients
    .filter(
      (c) => !query || [c.firstName, c.lastName, c.bizName].join(" ").toLowerCase().includes(query),
    )
    .sort((x, y) => {
      if (p.sortKey === "name") return clientName(x).localeCompare(clientName(y));
      if (p.sortKey === "salary") return (y.salary || 0) - (x.salary || 0);
      if (p.sortKey === "recent") return (y.updatedAt || 0) - (x.updatedAt || 0);
      return x.nextCheckOn < y.nextCheckOn ? -1 : x.nextCheckOn > y.nextCheckOn ? 1 : 0;
    });

  return (
    <Section
      title="Salary set"
      sub={`${clients.length} client${clients.length === 1 ? "" : "s"} with a decided salary and distribution plan. Open a row for the account summary.`}
      right={
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search clients"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            aria-label="Search clients"
            className={`${toolbarCls} w-[190px]`}
          />
          <select
            value={p.sortKey}
            onChange={(e) => p.onSort(e.target.value as SortKey)}
            aria-label="Sort clients"
            className={`${toolbarCls} w-[170px] cursor-pointer appearance-none pr-8`}
            style={caretStyle}
          >
            <option value="next">Next check first</option>
            <option value="name">Name A–Z</option>
            <option value="salary">Highest salary</option>
            <option value="recent">Recently updated</option>
          </select>
        </div>
      }
    >
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-5 text-[13.5px] text-muted">
            {clients.length
              ? "No clients match that search."
              : "Saved clients show up here with their salary and distributions."}
          </p>
        ) : (
          <table className="w-full min-w-[1040px] border-collapse">
            <thead>
              <tr>
                <Th className="pl-5">Client</Th>
                <Th right>Profit</Th>
                <Th right accent="magenta">
                  Salary
                </Th>
                <Th right accent="teal">
                  Distributions
                </Th>
                <Th right>Savings</Th>
                <Th>Risk</Th>
                <Th>Next check</Th>
                <Th>Updated</Th>
                <Th className="pr-5">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const x = analyze(c);
                const d = dueLabel(c);
                const open = !!p.expanded[c.id];
                const busy = !!p.busyIds[c.id];
                return (
                  <ClientRow
                    key={c.id}
                    c={c}
                    x={x}
                    due={d}
                    open={open}
                    busy={busy}
                    current={c.id === p.currentId}
                    confirming={p.confirmId === c.id}
                    p={p}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Section>
  );
}

function ClientRow({
  c,
  x,
  due,
  open,
  busy,
  current,
  confirming,
  p,
}: {
  c: ScorpClient;
  x: ScorpAnalysis;
  due: ReturnType<typeof dueLabel>;
  open: boolean;
  busy: boolean;
  current: boolean;
  confirming: boolean;
  p: SavedClientsProps;
}) {
  const td = "border-b border-edge px-3 py-3.5 align-middle text-[13.5px]";
  return (
    <>
      <tr className="cursor-pointer hover:bg-panel-2" onClick={() => p.onToggle(c.id)}>
        <td className={`${td} pl-5`}>
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              p.onToggle(c.id);
            }}
            className="flex cursor-pointer items-center gap-2.5 text-left"
          >
            <span aria-hidden className="w-2.5 text-[11px] text-faint">
              {open ? "▾" : "▸"}
            </span>
            <span>
              <span className={`block font-semibold ${current ? "text-magenta" : "text-fog"}`}>
                {clientName(c)}
              </span>
              {c.bizName && (c.firstName || c.lastName) ? (
                <span className="mt-px block text-[11.5px] text-faint">{c.bizName}</span>
              ) : null}
            </span>
          </button>
        </td>
        <td className={`${td} text-right font-mono tabular-nums text-muted`}>{money(x.profit)}</td>
        <td className={`${td} text-right`}>
          <div className="font-display text-[16px] font-bold tabular-nums text-magenta">
            {money(c.salary)}
          </div>
          <div className="font-mono text-[10.5px] text-faint">{money(c.salary / 12)}/mo</div>
        </td>
        <td className={`${td} text-right`}>
          <div className="font-display text-[16px] font-bold tabular-nums text-teal">
            {money(x.distribution)}
          </div>
          <div
            className={`font-mono text-[10.5px] ${x.overDistributing ? "text-ember" : "text-faint"}`}
          >
            {x.overDistributing
              ? `over basis ${money(x.excessOverBasis)}`
              : `${x.distPct}% of profit`}
          </div>
        </td>
        <td className={`${td} text-right font-mono tabular-nums text-teal`}>{money(x.savings)}</td>
        <td className={td}>
          <RiskPill risk={x.risk} />
        </td>
        <td className={td}>
          <div className="font-mono text-[12.5px] text-mist">{fmtDate(c.nextCheckOn)}</div>
          <div className={`font-mono text-[10.5px] ${DUE_TEXT[due.tone]}`}>
            {due.text}
            {c.clientNotice?.status === "pending" ? " · notice not sent" : ""}
          </div>
        </td>
        <td className={td}>
          <div className="text-[12.5px] text-mist">{fmtStamp(c.updatedAt)}</div>
          {c.updatedBy ? <div className="text-[11px] text-faint">{c.updatedBy}</div> : null}
        </td>
        <td
          className={`${td} whitespace-nowrap pr-5 text-right`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="inline-flex gap-1.5">
            <button type="button" onClick={() => p.onOpen(c)} className={ghostBtn}>
              Open
            </button>
            <button
              type="button"
              onClick={() => p.onTweak(c)}
              disabled={busy}
              className={ghostBtn}
            >
              Tweak
            </button>
            {confirming ? (
              <button
                type="button"
                onClick={() => p.onDelete(c.id)}
                disabled={busy}
                className={dangerBtn}
              >
                Confirm delete
              </button>
            ) : (
              <button
                type="button"
                onClick={() => p.onConfirmDelete(c.id)}
                disabled={busy}
                className={ghostBtn}
              >
                Delete
              </button>
            )}
          </div>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={9} className="border-b border-edge px-5 pb-4 pt-1">
            <AccountSummary c={c} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/* ──────────────────────────── account summary ──────────────────────────── */

/** Everything about one account on one card: the read, the numbers, notes and history. */
export function AccountSummary({ c }: { c: ScorpClient }) {
  const x = analyze(c);
  const due = dueLabel(c);
  const hist = [...c.history].reverse().slice(0, 6);
  const pendingNotice = c.clientNotice?.status === "pending";
  return (
    <div className="rounded-[16px] border border-edge bg-panel-2 p-4">
      <p className="mb-3.5 max-w-[900px] text-[13.5px] leading-[1.55] text-fog">{readOf(c, x)}</p>
      <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-4">
        <Col title="The business">
          <Kv k="Revenue" v={money(x.revenue)} />
          <Kv k="Expenses" v={money(x.expenses)} />
          <Kv k="Profit" v={money(x.profit)} />
          <Kv k="Beginning basis" v={money(x.beginningBasis)} />
        </Col>
        <Col title="How they're paid">
          <Kv k="Salary" v={`${money(c.salary)} · ${money(c.salary / 12)}/mo`} accent="magenta" />
          <Kv
            k="Distributions"
            v={`${money(x.distribution)} · ${x.distPct}% of profit`}
            accent="teal"
          />
          <Kv k="Employer payroll tax" v={money(x.employerPayrollTax)} />
          <Kv
            k="Left in the business"
            v={money(x.retained)}
            accent={x.retained < 0 ? "ember" : undefined}
          />
        </Col>
        <Col title="Tax picture">
          <Kv k="Before · single-member LLC" v={money(x.before)} />
          <Kv k="After · S corp" v={money(x.after)} />
          <Kv k="Savings per year" v={money(x.savings)} accent="teal" />
          <div className="pt-2">
            <RiskPill risk={x.risk} />
          </div>
        </Col>
        <Col title="Timeline">
          <Kv k="Salary set" v={fmtDate(c.salarySetOn)} />
          <Kv k="Last check" v={fmtDate(c.lastCheckOn)} />
          <Kv
            k="Next check"
            v={fmtDate(c.nextCheckOn)}
            accent={due.tone === "neg" ? "danger" : due.tone === "warn" ? "ember" : undefined}
          />
          <Kv
            k="Client notice"
            v={
              c.clientNotice
                ? pendingNotice
                  ? "Not sent yet"
                  : `Sent ${fmtDate(c.clientNotice.sentOn)}`
                : "None"
            }
            accent={pendingNotice ? "ember" : undefined}
          />
        </Col>
      </div>

      {c.notes.trim() ? (
        <div className="mt-3.5">
          <Mono className="mb-1 block font-semibold text-faint">Notes</Mono>
          <p className="whitespace-pre-wrap text-[12.5px] leading-normal text-muted">{c.notes}</p>
        </div>
      ) : null}

      {hist.length > 0 ? (
        <div className="mt-3.5">
          <Mono className="mb-1 block font-semibold text-faint">History</Mono>
          {hist.map((h, i) => (
            <div key={i} className="flex gap-3 py-[3px] text-[12px] text-muted">
              <span className="min-w-[92px] font-mono text-faint">{fmtDate(h.on)}</span>
              <span>{historyLabel(h)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────── pieces ──────────────────────────────── */

function Section({
  title,
  sub,
  right,
  children,
}: {
  title: React.ReactNode;
  sub: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-edge bg-panel">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-edge px-5 py-4">
        <div className="min-w-0">
          <h3 className="font-display text-[19px] font-bold tracking-[-0.3px] text-fog">{title}</h3>
          <p className="mt-1 text-[12.5px] text-muted">{sub}</p>
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

/** Overdue / due soon / to tell the client — and, on the hidden card, how many are saved. */
function Counts({ q, saved }: { q: ReviewQueues; saved?: number | string }) {
  return (
    <div className="flex flex-wrap gap-x-[18px] gap-y-1 font-mono text-[11px] text-muted">
      {saved !== undefined ? (
        <span>
          <b className="text-fog">{saved}</b> saved
        </span>
      ) : null}
      <span>
        <b className="text-danger">{q.overdue}</b> overdue
      </span>
      <span>
        <b className="text-ember">{q.dueSoon}</b> due soon
      </span>
      <span>
        <b className="text-magenta">{q.pending.length}</b> to tell the client
      </span>
    </div>
  );
}

function Figure({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent: Accent;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <Mono className="block font-semibold text-faint">{label}</Mono>
      <div
        className={`mt-1 font-display text-[22px] font-bold leading-[1.1] tracking-[-0.5px] tabular-nums ${ACCENT[accent]}`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 font-mono text-[10.5px] text-faint">{sub}</div> : null}
    </div>
  );
}

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Mono className="mb-1 block font-semibold text-faint">{title}</Mono>
      {children}
    </div>
  );
}

function Kv({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: "magenta" | "teal" | "ember" | "danger";
}) {
  const cls =
    accent === "magenta" ? "text-magenta"
    : accent === "teal" ? "text-teal"
    : accent === "ember" ? "text-ember"
    : accent === "danger" ? "text-danger"
    : "text-fog";
  return (
    <div className="flex justify-between gap-2.5 border-b border-edge py-1.5 text-[12.5px]">
      <span className="text-muted">{k}</span>
      <span className={`text-right font-display font-semibold tabular-nums ${cls}`}>{v}</span>
    </div>
  );
}

function Th({
  children,
  right = false,
  accent,
  className = "",
}: {
  children: React.ReactNode;
  right?: boolean;
  /** Salary and distributions wear their figures' colours in the header too. */
  accent?: "magenta" | "teal";
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-edge-mid px-3 py-3 font-mono text-[10.5px] font-bold uppercase tracking-[1.2px] ${
        accent ? ACCENT[accent] : "text-dusk"
      } ${right ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </th>
  );
}
