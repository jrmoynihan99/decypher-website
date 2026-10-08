"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, Panel } from "@/components/portal/widgets/ui";
import { shortDate } from "@/lib/widget-format";
import type { FailureFileKind, FailureStatus, FailureSummary } from "@/lib/tax-recap/failures-store";
import { ENTITY_FIELD_KEYS, RETURN_FIELD_KEYS } from "@/lib/tax-recap/schema";

/**
 * The refused returns, newest first. Each opens to its reasons, the
 * mismatches (what the return printed against what the tables gave), the
 * reader's notes and the cross-check warnings; from there the JSON goes
 * to a laptop for `npm run recap:replay`, or the fixture goes straight
 * into tax-recap-derive-check.mjs. Kept PDFs download until they expire.
 */
export default function FailureList({ failures: fromServer }: { failures: FailureSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(fromServer[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<FailureStatus | "all">("open");
  /** Local overrides so a status change or delete shows before the refresh lands. */
  const [statuses, setStatuses] = useState<Record<string, FailureStatus>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  const failures = fromServer
    .filter((f) => !deleted.has(f.id))
    .map((f) => ({ ...f, status: statuses[f.id] ?? f.status }))
    .filter((f) => filter === "all" || f.status === filter);
  const counts = { open: 0, fixed: 0, dismissed: 0 };
  for (const f of fromServer) if (!deleted.has(f.id)) counts[statuses[f.id] ?? f.status]++;

  const setStatus = async (f: FailureSummary, status: FailureStatus) => {
    setBusy(f.id);
    setError(null);
    try {
      const res = await fetch(`/api/portal/tax-recap/failures/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string };
        setError(d.message ?? "Couldn't update");
        return;
      }
      setStatuses((s) => ({ ...s, [f.id]: status }));
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (f: FailureSummary) => {
    if (!window.confirm(`Delete this refused return (${f.clientName || "unnamed"} ${f.taxYear ?? ""}) and any kept PDFs?`)) return;
    setBusy(f.id);
    setError(null);
    try {
      const res = await fetch(`/api/portal/tax-recap/failures/${f.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string };
        setError(d.message ?? "Couldn't delete");
        return;
      }
      setDeleted((d) => new Set(d).add(f.id));
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  /** Fetch the full record and put a recap:check fixture on the clipboard. */
  const copyFixture = async (f: FailureSummary) => {
    setBusy(f.id);
    setError(null);
    try {
      const res = await fetch(`/api/portal/tax-recap/failures/${f.id}`);
      const doc = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !doc) {
        setError("Couldn't load the record");
        return;
      }
      await navigator.clipboard.writeText(fixtureOf(doc));
      setCopied(f.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Clipboard blocked — download the JSON instead");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="Refused returns"
      bodyClassName="!px-0 !py-0"
      action={
        <div className="flex items-center gap-2">
          {error ? <span className="mr-2 text-[12px] text-danger">{error}</span> : null}
          {(["open", "fixed", "dismissed", "all"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`${action} ${filter === k ? "border-mist text-fog" : ""}`}
            >
              {k}
              {k !== "all" ? ` ${counts[k]}` : ""}
            </button>
          ))}
        </div>
      }
    >
      {!failures.length ? (
        <p className="px-5 py-4 text-[13px] text-dusk">
          {fromServer.length ? "Nothing with that status." : "No refusals recorded yet — the next one the engine makes lands here on its own."}
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {failures.map((f) => {
            const isOpen = open === f.id;
            const kept = (Object.entries(f.files) as [FailureFileKind, NonNullable<FailureSummary["files"][FailureFileKind]>][]).filter(
              ([, v]) => v && new Date(v.expiresAt).getTime() > Date.now(),
            );
            return (
              <li key={f.id} className="px-5 py-4">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : f.id)}
                  className="flex w-full cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 text-left"
                >
                  <span className="font-body text-[14px] text-fog">{f.clientName || "Unnamed"}</span>
                  <span className="font-mono text-[11px] uppercase tracking-[1px] text-muted">
                    {f.taxYear ?? "year ?"} · {f.filingStatus ?? "status ?"} · {f.stateCode ?? "no state"}
                    {f.entityForm ? ` · ${f.entityForm}` : ""} · engine v{f.engineVersion || "?"}
                    {f.stage === "rederive" ? " · on recompute" : ""}
                  </span>
                  <Chip tone={f.status === "open" ? "warn" : f.status === "fixed" ? "pos" : "mute"}>{f.status}</Chip>
                  <span className="ml-auto font-body text-[11.5px] text-dusk">
                    {f.createdAt ? shortDate(new Date(f.createdAt)) : "—"} · {f.createdBy}
                  </span>
                </button>
                {!isOpen ? (
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-mist">{f.reasons[0]}</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <Section title="Why it refused">
                      <ul className="space-y-1">
                        {f.reasons.map((r, i) => (
                          <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-mist">
                            <span className="flex-none text-ember">·</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                      {f.mismatches.length ? (
                        <table className="mt-2 text-[12px]">
                          <tbody>
                            {f.mismatches.map((m, i) => (
                              <tr key={i}>
                                <td className="pr-4 text-dusk">{m.line}</td>
                                <td className="pr-4 text-right font-mono text-mist">read {m.read.toLocaleString("en-US")}</td>
                                <td className="text-right font-mono text-mist">tables {m.computed.toLocaleString("en-US")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                    </Section>
                    {f.readerNotes.after || f.readerNotes.entity ? (
                      <Section title="Reader notes">
                        {f.readerNotes.after ? <p className="text-[12.5px] leading-snug text-mist">1040: {f.readerNotes.after}</p> : null}
                        {f.readerNotes.entity ? (
                          <p className="mt-1 text-[12.5px] leading-snug text-mist">
                            {f.entityForm ?? "Entity"}: {f.readerNotes.entity}
                          </p>
                        ) : null}
                      </Section>
                    ) : null}
                    {f.warnings.after.length || f.warnings.entity.length ? (
                      <Section title="Cross-check warnings">
                        <ul className="space-y-1">
                          {[...f.warnings.after, ...f.warnings.entity].map((w, i) => (
                            <li key={i} className="flex gap-2 text-[12px] leading-snug text-dusk">
                              <span className="flex-none">·</span>
                              <span>{w}</span>
                            </li>
                          ))}
                        </ul>
                      </Section>
                    ) : null}
                    {f.note ? (
                      <Section title="Note">
                        <p className="text-[12.5px] text-mist">{f.note}</p>
                      </Section>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={`/api/portal/tax-recap/failures/${f.id}?download=1`} className={action}>
                        JSON for replay
                      </a>
                      <button type="button" disabled={busy === f.id} onClick={() => copyFixture(f)} className={action}>
                        {copied === f.id ? "Copied" : "Copy fixture"}
                      </button>
                      {kept.map(([kind, v]) => (
                        <a key={kind} href={`/api/portal/tax-recap/failures/${f.id}/file?kind=${kind}`} className={action}>
                          {kind === "entity" ? (f.entityForm ?? "entity") : kind} PDF · until {shortDate(new Date(v.expiresAt))}
                        </a>
                      ))}
                      {!kept.length ? <span className="font-body text-[11.5px] text-dusk">No PDF kept</span> : null}
                      <span className="mx-1 text-dusk">|</span>
                      {f.status !== "fixed" ? (
                        <button type="button" disabled={busy === f.id} onClick={() => setStatus(f, "fixed")} className={`${action} hover:border-teal hover:text-teal`}>
                          Mark fixed
                        </button>
                      ) : null}
                      {f.status !== "dismissed" ? (
                        <button type="button" disabled={busy === f.id} onClick={() => setStatus(f, "dismissed")} className={action}>
                          Dismiss
                        </button>
                      ) : null}
                      {f.status !== "open" ? (
                        <button type="button" disabled={busy === f.id} onClick={() => setStatus(f, "open")} className={action}>
                          Reopen
                        </button>
                      ) : null}
                      <button type="button" disabled={busy === f.id} onClick={() => remove(f)} className={`${action} hover:border-danger hover:text-danger`}>
                        {busy === f.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[1.2px] text-muted">{title}</div>
      {children}
    </div>
  );
}

/** A block for tax-recap-derive-check.mjs: the after and entity numbers as read, the meta, nothing null. */
function fixtureOf(doc: Record<string, unknown>): string {
  const after = (doc.after ?? {}) as Record<string, unknown>;
  const entity = (doc.entity ?? null) as Record<string, unknown> | null;
  const meta = (doc.meta ?? {}) as Record<string, unknown>;
  const lines = (obj: Record<string, unknown>, keys: readonly string[]) =>
    keys
      .filter((k) => typeof obj[k] === "number")
      .map((k) => `    ${k}: ${obj[k]},`)
      .join("\n");
  const name = `${String(doc.clientName ?? "client")} ${String(meta.taxYear ?? "")}`.trim();
  const metaOut = {
    taxYear: meta.taxYear ?? null,
    filingStatus: meta.filingStatus ?? null,
    stateCode: meta.stateCode ?? null,
    stateForm: meta.stateForm ?? null,
    ...(meta.entityForm ? { entityForm: meta.entityForm } : {}),
  };
  const reasons = Array.isArray(doc.reasons) ? (doc.reasons as string[]) : [];
  return [
    `/* ── ${name}: recorded failure ${String(doc.id ?? "")} ──`,
    ...reasons.map((r) => `   ${r}`),
    "*/",
    "const FIXTURE = {",
    `  meta: ${JSON.stringify(metaOut)},`,
    "  after: numbers({",
    lines(after, RETURN_FIELD_KEYS),
    "  }),",
    ...(entity ? ["  entity: entityNumbers({", lines(entity, ENTITY_FIELD_KEYS), "  }),"] : []),
    "};",
  ].join("\n");
}

const action =
  "cursor-pointer rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1px] text-mist no-underline transition-colors hover:border-mist hover:text-fog disabled:opacity-50";
