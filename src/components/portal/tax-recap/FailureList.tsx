"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, Panel } from "@/components/portal/widgets/ui";
import { shortDate } from "@/lib/widget-format";
import type { FailureDoc, FailureFileKind, FailureStatus, FailureSummary } from "@/lib/tax-recap/failures-store";
import { ENTITY_FIELD_KEYS, RETURN_FIELD_KEYS } from "@/lib/tax-recap/schema";
import { DERIVE_VERSION, deriveBefore } from "@/lib/tax-recap/derive";
import type { TableSet } from "@/lib/tax-recap/tables";

/** One refusal run again with today's engine, from the numbers it recorded. */
type Retried =
  | { state: "running" }
  | { state: "derives"; verified: boolean; carried: number }
  | { state: "refused"; reason: string }
  | { state: "error"; message: string };

/**
 * A recorded refusal handed to the engine as it is now — what `npm run
 * recap:replay` does, in the browser: the numbers as read, the meta (with
 * the entity's name and state from its read when the meta predates them),
 * the entity return and everything else on the 1040.
 */
function replay(doc: FailureDoc, tables: TableSet): Retried {
  const meta = {
    ...doc.meta,
    entityName: doc.meta.entityName ?? doc.extraction.entity?.entityName ?? null,
    entityStateCode: doc.meta.entityStateCode ?? doc.extraction.entity?.stateCode ?? null,
  };
  const r = deriveBefore(doc.after, meta, tables, doc.entity, doc.more);
  return r.ok
    ? { state: "derives", verified: r.derived.proof?.verified ?? false, carried: r.derived.proof?.residuals.length ?? 0 }
    : { state: "refused", reason: r.reasons[0] ?? "Refused" };
}

/**
 * The refused returns, newest first. Each opens to its reasons, the
 * mismatches (what the return printed against what the tables gave), the
 * reader's notes and the cross-check warnings; from there the JSON goes
 * to a laptop for `npm run recap:replay`, or the fixture goes straight
 * into tax-recap-derive-check.mjs. The files as uploaded download all
 * together as one zip or one at a time, for as long as the record is kept;
 * the redacted copies staff chose to keep, until they expire.
 */
export default function FailureList({ failures: fromServer, tables }: { failures: FailureSummary[]; tables: TableSet }) {
  const router = useRouter();
  /** Each refusal's result when run again with today's engine. */
  const [retried, setRetried] = useState<Record<string, Retried>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [marking, setMarking] = useState(false);
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

  /**
   * Run every refusal in view again with the engine as it is now, one at a
   * time so each row shows its result as it lands. Nothing is read again
   * and nothing is saved: it says which would go through today.
   */
  const retryAll = async () => {
    const list = failures;
    if (!list.length) return;
    setError(null);
    setRetried({});
    setProgress({ done: 0, total: list.length });
    for (const [i, f] of list.entries()) {
      setRetried((r) => ({ ...r, [f.id]: { state: "running" } }));
      let result: Retried;
      try {
        const res = await fetch(`/api/portal/tax-recap/failures/${f.id}`);
        const doc = (await res.json().catch(() => null)) as FailureDoc | null;
        result = res.ok && doc ? replay(doc, tables) : { state: "error", message: "Couldn't load the record" };
      } catch (e) {
        result = { state: "error", message: e instanceof Error ? e.message : "Failed" };
      }
      setRetried((r) => ({ ...r, [f.id]: result }));
      setProgress({ done: i + 1, total: list.length });
      // Let the row paint before the next one runs.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  /** The refusals the last retry got through, marked fixed in one go. */
  const passing = failures.filter((f) => retried[f.id]?.state === "derives" && f.status !== "fixed");
  const markPassingFixed = async () => {
    setMarking(true);
    setError(null);
    try {
      for (const f of passing) {
        const res = await fetch(`/api/portal/tax-recap/failures/${f.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "fixed", note: [f.note, `Goes through on engine v${DERIVE_VERSION} (retried ${new Date().toISOString().slice(0, 10)})`].filter(Boolean).join(" · ") }),
        });
        if (res.ok) setStatuses((s) => ({ ...s, [f.id]: "fixed" }));
      }
      router.refresh();
    } finally {
      setMarking(false);
    }
  };
  const retryCounts = Object.values(retried).reduce(
    (c, r) => ({ ...c, [r.state]: (c[r.state] ?? 0) + 1 }),
    {} as Partial<Record<Retried["state"], number>>,
  );

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
      {failures.length ? (
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!!progress && progress.done < progress.total}
              onClick={retryAll}
              className="cursor-pointer rounded-full bg-teal px-5 py-2.5 font-display text-[14px] font-semibold text-night transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
            >
              {progress && progress.done < progress.total
                ? `Retrying… ${progress.done} of ${progress.total}`
                : `Retry ${filter === "all" ? "all" : `the ${failures.length} ${filter}`} with the current engine (v${DERIVE_VERSION})`}
            </button>
            {progress ? (
              <span className="font-body text-[12.5px] text-mist">
                {retryCounts.derives ?? 0} go through now
                {retryCounts.refused ? ` · ${retryCounts.refused} still refused` : ""}
                {retryCounts.error ? ` · ${retryCounts.error} couldn't load` : ""}
              </span>
            ) : null}
            {progress && progress.done === progress.total && passing.length ? (
              <button type="button" disabled={marking} onClick={markPassingFixed} className={`${action} hover:border-teal hover:text-teal`}>
                {marking ? "Marking…" : `Mark the ${passing.length} that go through as fixed`}
              </button>
            ) : null}
          </div>
          {progress ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-teal transition-[width] duration-200" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          ) : (
            <p className="mb-0 mt-2 text-[12px] leading-snug text-dusk">
              Runs each refusal again from the numbers it recorded, with the engine as it is now — nothing is read again or saved. For one that goes
              through, &ldquo;Open in builder&rdquo; loads its files (when they were kept) to make the recap.
            </p>
          )}
        </div>
      ) : null}
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
            /** The files as dropped: kept until the record is deleted. */
            const originals = f.originals;
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
                    {originals.length ? ` · ${originals.length} file${originals.length === 1 ? "" : "s"}` : ""}
                  </span>
                  <Chip tone={f.status === "open" ? "warn" : f.status === "fixed" ? "pos" : "mute"}>{f.status}</Chip>
                  <RetryChip result={retried[f.id]} />
                  <span className="ml-auto font-body text-[11.5px] text-dusk">
                    {f.createdAt ? shortDate(new Date(f.createdAt)) : "—"} · {f.createdBy}
                  </span>
                </button>
                {retried[f.id]?.state === "refused" ? (
                  <p className="mb-0 mt-1.5 text-[12px] leading-snug text-ember">
                    Still refused on v{DERIVE_VERSION}: {(retried[f.id] as { reason: string }).reason}
                  </p>
                ) : null}
                {retried[f.id]?.state === "derives" && originals.length ? (
                  <a href={`/portal/tax-recap?failure=${f.id}`} className={`${action} mt-2 inline-block border-teal/40 text-teal`}>
                    Open in builder with its {originals.length === 1 ? "file" : `${originals.length} files`}
                  </a>
                ) : null}
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
                    {originals.length ? (
                      <Section title="Files as uploaded">
                        <div className="flex flex-wrap items-center gap-2">
                          <a href={`/api/portal/tax-recap/failures/${f.id}/originals`} className={`${action} border-teal/40 text-teal`}>
                            Download all {originals.length > 1 ? `${originals.length} ` : ""}(zip)
                          </a>
                          <a href={`/portal/tax-recap?failure=${f.id}`} className={action}>
                            Open in builder
                          </a>
                          {originals.map((o) => (
                            <a key={o.index} href={`/api/portal/tax-recap/failures/${f.id}/originals?index=${o.index}`} className={`${action} normal-case tracking-normal`}>
                              {o.name} · {(o.size / (1024 * 1024)).toFixed(1)} MB
                            </a>
                          ))}
                        </div>
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
                          redacted {kind === "entity" ? (f.entityForm ?? "entity") : kind} PDF · until {shortDate(new Date(v.expiresAt))}
                        </a>
                      ))}
                      {!kept.length && !originals.length ? <span className="font-body text-[11.5px] text-dusk">No PDF kept</span> : null}
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

/** A row's result from "Retry": running, goes through (verified or how many lines carried), or still refused. */
function RetryChip({ result }: { result: Retried | undefined }) {
  if (!result) return null;
  if (result.state === "running") return <Chip tone="mute">retrying…</Chip>;
  if (result.state === "derives") {
    return <Chip tone="pos">{result.verified ? "goes through · verified" : `goes through · ${result.carried} carried`}</Chip>;
  }
  if (result.state === "refused") return <Chip tone="warn">still refused</Chip>;
  return <Chip tone="mute">couldn&rsquo;t load</Chip>;
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
