"use client";

import { Fragment, useEffect, useState } from "react";
import type { ApplicationRow } from "@/lib/application-store";

/**
 * The Applications tab: careers-page submissions, newest first. Slack only
 * gets a doorbell ping — THIS is where the full application lives, so an
 * expanded row shows everything the form collected: contact, role fit, tools,
 * the culture answers, logistics, compliance flags, and the resume (served by
 * /api/portal/applications/[id]/resume out of Firestore).
 *
 * Rows from before the long form (name/email/link/note only) still render:
 * empty facts show as "—", empty groups don't render at all.
 *
 * Delete lives in the expanded panel rather than on the row: it's permanent
 * (the resume goes with it) and a stray click in a list you're scanning is not
 * a decision. Opening the row, reading it, then arming the button is. The same
 * delete is on the Pipeline tracker, over the same documents.
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

// The form stores option slugs; show the human labels it displayed. Unknown
// values (or free text from older rows) fall through untouched.
const OPTION_LABELS: Record<string, string> = {
  referral: "Referral",
  social: "Social media",
  "job-board": "Job board",
  other: "Other",
  "full-time": "Full-time",
  "part-time": "Part-time",
  contractor: "Contractor",
  "<1": "Less than 1 year",
  "1-2": "1–2 years",
  "3-5": "3–5 years",
  "6-9": "6–9 years",
  "10+": "10+ years",
};
const pretty = (v: string) => OPTION_LABELS[v] ?? v;

const prettyBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

const thCls =
  "whitespace-nowrap px-4 py-3 text-left font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-faint";
const groupLabelCls =
  "font-mono text-[9.5px] font-bold uppercase tracking-[1.4px] text-faint";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className={groupLabelCls}>{label}</div>
      <div className="mt-0.5 font-body text-[13px] text-mist">
        {value || "—"}
      </div>
    </div>
  );
}

function YesNoChip({ label, value }: { label: string; value: boolean | null }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-body text-[11.5px] ${
        value === null
          ? "border-white/10 text-dusk"
          : value
            ? "border-teal/30 bg-teal/10 text-teal"
            : "border-danger/30 bg-danger/10 text-danger"
      }`}
    >
      {label}: {value === null ? "—" : value ? "Yes" : "No"}
    </span>
  );
}

function Essay({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div>
      <div className={groupLabelCls}>{label}</div>
      <p className="mt-1 max-w-prose whitespace-pre-wrap font-body text-[13px] leading-relaxed text-mist">
        {text.trim()}
      </p>
    </div>
  );
}

function Pills({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className={groupLabelCls}>{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((t) => (
          <span
            key={t}
            className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-body text-[11.5px] text-mist"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ApplicationsTable({
  initialApplications,
}: {
  initialApplications: ApplicationRow[];
}) {
  const [applications, setApplications] = useState(initialApplications);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  /** Which row's delete is armed, and which is mid-request. */
  const [armed, setArmed] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // An armed delete disarms itself, so a button left hot behind a scrolled-away
  // row can't be hit by the next click that lands there.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  const remove = async (id: string) => {
    setArmed(null);
    setDeleting(id);
    setError("");
    try {
      const res = await fetch(`/api/portal/applications/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.message);
      setApplications((list) => list.filter((a) => a.id !== id));
      if (open === id) setOpen(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn’t delete that.");
    }
    setDeleting(null);
  };

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
                  <th className={thCls}>Location</th>
                  <th className={thCls}>Resume</th>
                  <th className={thCls} aria-label="Details" />
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => {
                  const isOpen = open === a.id;
                  const t = when(a.createdAt);
                  const resumeHref = `/api/portal/applications/${a.id}/resume`;
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
                        <td className="px-4 py-3.5 font-body text-[13px] text-mist">
                          {a.location || "—"}
                        </td>
                        <td className="px-4 py-3.5 font-body text-[13px]">
                          {a.resume ? (
                            <a
                              href={resumeHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                            >
                              Open ↗
                            </a>
                          ) : a.linkedin ? (
                            <a
                              href={a.linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                            >
                              Link ↗
                            </a>
                          ) : (
                            <span className="text-dusk">—</span>
                          )}
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
                            {/* contact + fit facts */}
                            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
                              <Fact label="Phone" value={a.phone} />
                              <Fact
                                label="LinkedIn / link"
                                value={
                                  a.linkedin ? (
                                    <a
                                      href={a.linkedin}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="break-all text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                                    >
                                      {a.linkedin}
                                    </a>
                                  ) : (
                                    ""
                                  )
                                }
                              />
                              <Fact
                                label="Heard about us"
                                value={pretty(a.heardAbout)}
                              />
                              <Fact
                                label="Employment type"
                                value={pretty(a.employmentType)}
                              />
                              <Fact
                                label="Experience"
                                value={pretty(a.experience)}
                              />
                              <Fact label="Current role" value={a.currentRole} />
                              <Fact label="Desired comp" value={a.desiredComp} />
                              <Fact label="Earliest start" value={a.startDate} />
                              <Fact label="Availability" value={a.availability} />
                            </div>

                            {/* compliance + logistics flags */}
                            <div className="mt-5 flex flex-wrap gap-1.5">
                              <YesNoChip label="US work auth" value={a.workAuth} />
                              <YesNoChip
                                label="Needs sponsorship"
                                value={a.needsSponsorship}
                              />
                              <YesNoChip
                                label="Background check + NDA"
                                value={a.backgroundCheck}
                              />
                              <YesNoChip
                                label="Cameras on"
                                value={a.remoteCameras}
                              />
                              <YesNoChip
                                label="Reliable internet"
                                value={a.internet}
                              />
                            </div>

                            {/* tools + end-to-end experience */}
                            {(a.tools.length || a.handled.length) ? (
                              <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                                <Pills label="Tools used" items={a.tools} />
                                <Pills
                                  label="Handled end to end"
                                  items={a.handled}
                                />
                              </div>
                            ) : null}

                            {/* the written answers */}
                            <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                              <Essay label="Why DeCypher" text={a.whyUs} />
                              <Essay
                                label="Ownership story"
                                text={a.ownershipStory}
                              />
                              <Essay
                                label="“Do the boring work”"
                                text={a.boringWork}
                              />
                              <Essay
                                label="Possible conflicts"
                                text={a.conflicts}
                              />
                              <Essay label="Note" text={a.message} />
                            </div>

                            {/* resume + delivery */}
                            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[0.06] pt-4">
                              {a.resume ? (
                                <a
                                  href={resumeHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-body text-[13px] text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                                >
                                  {a.resume.filename} (
                                  {prettyBytes(a.resume.size)}) ↗
                                </a>
                              ) : (
                                <span className="font-body text-[13px] text-dusk">
                                  No resume on file
                                </span>
                              )}
                              <span className="font-body text-[12px] text-dusk">
                                Slack{" "}
                                {a.notified === null
                                  ? "no report"
                                  : a.notified
                                    ? "posted"
                                    : "failed"}
                              </span>

                              {armed === a.id ? (
                                <span className="ml-auto flex items-center gap-3">
                                  <span className="font-body text-[12px] text-dusk">
                                    Delete this application and its resume,
                                    permanently?
                                  </span>
                                  <button
                                    type="button"
                                    disabled={deleting === a.id}
                                    onClick={() => remove(a.id)}
                                    className="cursor-pointer rounded-[8px] border border-danger/50 bg-danger/10 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.8px] text-danger transition-colors duration-150 hover:bg-danger/20 disabled:opacity-40"
                                  >
                                    {deleting === a.id ? "Deleting…" : "Delete"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setArmed(null)}
                                    className="cursor-pointer font-mono text-[10.5px] uppercase tracking-[0.8px] text-dusk hover:text-fog"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={deleting === a.id}
                                  onClick={() => setArmed(a.id)}
                                  className="ml-auto cursor-pointer rounded-[8px] border border-transparent px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.8px] text-faint transition-colors duration-150 hover:border-danger/40 hover:text-danger disabled:opacity-40"
                                >
                                  Delete
                                </button>
                              )}
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
