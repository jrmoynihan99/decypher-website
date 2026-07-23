"use client";

import { Fragment, useState } from "react";
import type { ApplicationRow } from "@/lib/application-store";

/**
 * The Applications tab: careers-page submissions, newest first — the portal
 * copy of what pings #recruiting. Rows with a cover note expand to show it;
 * the link opens in a new tab since it's the actual application.
 */

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

const thCls =
  "whitespace-nowrap px-4 py-3 text-left font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-faint";

export default function ApplicationsTable({
  initialApplications,
}: {
  initialApplications: ApplicationRow[];
}) {
  const [applications, setApplications] = useState(initialApplications);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/portal/applications");
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.message);
      setApplications(data.applications);
    } catch {
      setError("Couldn’t refresh — try again.");
    }
    setRefreshing(false);
  };

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-[11px] uppercase tracking-[1.2px] text-dusk">
          {applications.length} application{applications.length === 1 ? "" : "s"} ·
          newest first
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

      {applications.length === 0 ? (
        <div className="mt-4 rounded-[18px] border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center text-sm text-dusk">
          No applications yet. They&rsquo;ll land here when someone applies
          through the careers page.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-[18px] border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr className="border-b border-white/[0.07] bg-white/[0.02]">
                  <th className={thCls}>Received</th>
                  <th className={thCls}>Role</th>
                  <th className={thCls}>Applicant</th>
                  <th className={thCls}>Link</th>
                  <th className={thCls}>Note</th>
                  <th className={thCls} aria-label="Details" />
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => {
                  const isOpen = open === a.id;
                  const t = when(a.createdAt);
                  const note = a.message.trim();
                  return (
                    <Fragment key={a.id}>
                      <tr
                        onClick={() => setOpen(isOpen ? null : a.id)}
                        aria-expanded={isOpen}
                        className={`cursor-pointer border-b border-white/[0.05] transition-colors duration-150 last:border-b-0 ${
                          isOpen ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"
                        }`}
                      >
                        {/* viewer-timezone timestamp — see LeadsTable */}
                        <td
                          suppressHydrationWarning
                          className="whitespace-nowrap px-4 py-3.5 font-body text-[13px] text-mist"
                        >
                          {t.day}
                          <span className="ml-1.5 text-dusk">{t.time}</span>
                        </td>
                        <td className="px-4 py-3.5 font-body text-[13.5px] text-fog">
                          {a.role || "—"}
                          {a.department ? (
                            <span className="ml-2 rounded-full border border-white/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-[1px] text-dusk">
                              {a.department}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 font-body text-[13px]">
                          <div className="text-mist">{a.name || "—"}</div>
                          <a
                            href={`mailto:${a.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-[11px] text-dusk underline decoration-white/20 underline-offset-2 hover:text-fog"
                          >
                            {a.email}
                          </a>
                        </td>
                        <td className="px-4 py-3.5 font-body text-[13px]">
                          {a.link ? (
                            <a
                              href={a.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                            >
                              Open ↗
                            </a>
                          ) : (
                            <span className="text-dusk">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-body text-[12px] text-dusk">
                          {note ? "Yes" : "—"}
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
                          <td colSpan={6} className="px-4 py-5 sm:px-6">
                            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                              <div>
                                <div className="font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-faint">
                                  Cover note
                                </div>
                                <p className="mt-1 max-w-prose whitespace-pre-wrap font-body text-[13px] leading-relaxed text-mist">
                                  {note || "No note left."}
                                </p>
                              </div>
                              <div>
                                <div className="font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-faint">
                                  Delivery
                                </div>
                                <div className="mt-1 font-body text-[13px] text-mist">
                                  Slack{" "}
                                  {a.notified === null
                                    ? "no report"
                                    : a.notified
                                      ? "posted"
                                      : "failed"}
                                </div>
                                {a.link ? (
                                  <div className="mt-3 break-all font-mono text-[11px] text-dusk">
                                    {a.link}
                                  </div>
                                ) : null}
                              </div>
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
