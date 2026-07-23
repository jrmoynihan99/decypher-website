"use client";

import { Fragment, useState } from "react";
import type { LeadRow } from "@/lib/lead-store";

/**
 * The Leads tab: every estimator lead, newest first, with the same numbers and
 * qualification flags the Slack message carries. The row is the scan view;
 * clicking it opens the full picture (inputs, breakdown, creator info, delivery
 * stamps). Server-rendered data comes in as props; Refresh re-pulls from
 * GET /api/portal/leads without a navigation.
 */

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Mirrors ENTITY_LABELS in lib/slack.ts — that module is server-only. */
const ENTITY_LABELS: Record<string, string> = {
  soleprop: "Sole proprietor",
  smllc: "Single-member LLC",
  scorp: "S-corp",
  ccorp: "C-corp",
  unanswered: "Didn’t say",
};

function savingsLabel(l: LeadRow): string {
  const { savingsLow, savingsHigh } = l.estimate;
  if (savingsHigh <= 0) return "—";
  return savingsHigh - savingsLow >= 500
    ? `${money(savingsLow)}–${money(savingsHigh)}`
    : money(savingsHigh);
}

/** Same three signals, same order, as postLeadToSlack. */
function flags(l: LeadRow): { emoji: string; label: string; title: string }[] {
  const out: { emoji: string; label: string; title: string }[] = [];
  if (l.sCorpNoPayroll)
    out.push({
      emoji: "🚨",
      label: "No payroll",
      title: "S-corp with no payroll — audit exposure, urgent",
    });
  if (l.estimate.solePropRisk)
    out.push({
      emoji: "⚠️",
      label: "Sole prop",
      title: "Sole prop over $20k — no liability protection",
    });
  if (l.estimate.needSCorp)
    out.push({
      emoji: "💡",
      label: "S-corp fit",
      title: "S-corp candidate — net profit over threshold",
    });
  return out;
}

function when(iso: string | null): { day: string; time: string } {
  if (!iso) return { day: "—", time: "" };
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function deliveryLabel(v: boolean | null): string {
  return v === null ? "no report" : v ? "sent" : "failed";
}

const thCls =
  "whitespace-nowrap px-4 py-3 text-left font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-faint";

export default function LeadsTable({ initialLeads }: { initialLeads: LeadRow[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/portal/leads");
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.message);
      setLeads(data.leads);
    } catch {
      setError("Couldn’t refresh — try again.");
    }
    setRefreshing(false);
  };

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-[11px] uppercase tracking-[1.2px] text-dusk">
          {leads.length} lead{leads.length === 1 ? "" : "s"} · newest first
        </div>
        <div className="flex items-center gap-3">
          {error ? <span className="text-xs text-danger">{error}</span> : null}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="cursor-pointer rounded-full border border-white/15 bg-transparent px-3 py-1 font-body text-[12px] text-mist transition-colors duration-150 hover:border-mist hover:text-fog disabled:cursor-default disabled:opacity-40"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="mt-4 rounded-[18px] border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center text-sm text-dusk">
          No leads yet. They&rsquo;ll land here the moment someone finishes the
          estimator.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-[18px] border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-white/[0.07] bg-white/[0.02]">
                  <th className={thCls}>Received</th>
                  <th className={thCls}>Name</th>
                  <th className={thCls}>Contact</th>
                  <th className={`${thCls} text-right`}>Est. tax</th>
                  <th className={`${thCls} text-right`}>Savings</th>
                  <th className={thCls}>Flags</th>
                  <th className={thCls} aria-label="Details" />
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const isOpen = open === lead.id;
                  const t = when(lead.createdAt);
                  return (
                    <Fragment key={lead.id}>
                      <tr
                        onClick={() => setOpen(isOpen ? null : lead.id)}
                        aria-expanded={isOpen}
                        className={`cursor-pointer border-b border-white/[0.05] transition-colors duration-150 last:border-b-0 ${
                          isOpen ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"
                        }`}
                      >
                        {/* timestamps render in the viewer's timezone, which the
                            server can't know — hence the suppress */}
                        <td
                          suppressHydrationWarning
                          className="whitespace-nowrap px-4 py-3.5 font-body text-[13px] text-mist"
                        >
                          {t.day}
                          <span className="ml-1.5 text-dusk">{t.time}</span>
                        </td>
                        <td className="px-4 py-3.5 font-body text-[13.5px] text-fog">
                          {lead.name || "—"}
                          {lead.isCreator ? (
                            <span className="ml-2 rounded-full border border-white/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-[1px] text-dusk">
                              Creator
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 font-body text-[13px]">
                          <a
                            href={`mailto:${lead.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-mist underline decoration-white/20 underline-offset-2 hover:text-fog"
                          >
                            {lead.email}
                          </a>
                          {lead.phone ? (
                            <div className="font-mono text-[11px] text-dusk">
                              {lead.phone}
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-[13px] text-fog">
                          {money(lead.estimate.total)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-[13px] text-teal">
                          {savingsLabel(lead)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            {flags(lead).map((f) => (
                              <span
                                key={f.label}
                                title={f.title}
                                className="whitespace-nowrap rounded-full border border-white/10 px-2 py-0.5 font-body text-[11px] text-mist"
                              >
                                {f.emoji} {f.label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`ml-auto h-3.5 w-3.5 text-dusk transition-transform duration-150 ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </td>
                      </tr>

                      {isOpen ? (
                        <tr className="border-b border-white/[0.05] bg-white/[0.02] last:border-b-0">
                          <td colSpan={7} className="px-4 py-5 sm:px-6">
                            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                              <Detail label="Entity">
                                {ENTITY_LABELS[lead.entity] ?? lead.entity}
                              </Detail>
                              <Detail label="State">{lead.state || "—"}</Detail>
                              <Detail label="Business revenue">
                                {money(lead.revenue)}
                              </Detail>
                              <Detail label="Net profit">
                                {money(lead.estimate.netSE)}
                              </Detail>
                              <Detail label="Tax breakdown">
                                SE {money(lead.estimate.seTax)} · Fed{" "}
                                {money(lead.estimate.fed)} · State{" "}
                                {money(lead.estimate.stateTax)}
                              </Detail>
                              <Detail label="Effective rate">
                                {lead.estimate.effRate.toFixed(1)}%
                              </Detail>
                              <Detail label="Suggested set-aside">
                                {Math.round(lead.estimate.setAside)}%
                              </Detail>
                              <Detail label="Creator">
                                {lead.isCreator
                                  ? [
                                      lead.platform || "—",
                                      lead.username || "—",
                                      lead.revenueBand
                                        ? `self-reported ${lead.revenueBand}`
                                        : "—",
                                    ].join(" · ")
                                  : "Not a creator / content business"}
                              </Detail>
                              <Detail label="Delivery">
                                Email {deliveryLabel(lead.emailed)} · Slack{" "}
                                {deliveryLabel(lead.notified)}
                              </Detail>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-faint">
        {label}
      </div>
      <div className="mt-1 font-body text-[13px] text-mist">{children}</div>
    </div>
  );
}
