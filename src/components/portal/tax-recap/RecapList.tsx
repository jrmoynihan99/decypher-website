"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Field,
  Mono,
  Panel,
  SearchSelect,
  SelectInput,
  TableCell,
  TableHead,
  type SearchOption,
} from "@/components/portal/widgets/ui";
import { money, shortDate } from "@/lib/widget-format";
import { clientKey } from "@/lib/tax-recap/schema";
import type { RecapSummary } from "@/lib/tax-recap/store";

/**
 * Every recap built so far, newest first, narrowed by client and by year.
 * Copy hands over the client link, PDF downloads the attachment, Edit
 * reopens the builder on the saved numbers (no re-read — the extraction is
 * stored), Delete removes the recap for good, link and all, after a confirm.
 *
 * The rows come from the server on every render, so a save in the builder
 * shows up here as soon as its router.refresh() resolves.
 */
export default function RecapList({ recaps: fromServer }: { recaps: RecapSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Deletes applied here before the server round-trip lands. Filtered over
   * the server's rows rather than replacing them: the builder calls
   * router.refresh() after every save, and a useState copy of the list would
   * ignore that and leave a just-saved recap invisible.
   */
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const recaps = fromServer.filter((r) => !deleted.has(r.id));

  /** A client by `clientKey`, so "JANE M DOE" and "Jane Doe" are one choice; "" is every client. */
  const [client, setClient] = useState("");
  const [year, setYear] = useState("");
  const clients = useMemo(() => {
    // Newest first, so a client's label is the name on their latest recap.
    const byKey = new Map<string, string>();
    for (const r of fromServer) {
      const key = clientKey(r.clientName);
      if (key && !byKey.has(key)) byKey.set(key, r.clientName);
    }
    const named: SearchOption[] = [...byKey]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "", label: "All clients" }, ...named];
  }, [fromServer]);
  const years = useMemo(
    () => [...new Set(fromServer.map((r) => r.taxYear))].sort((a, b) => b - a),
    [fromServer],
  );
  // A choice whose last recap was just deleted falls back to all, not to an empty table.
  const activeClient = clients.some((o) => o.value === client) ? client : "";
  const activeYear = years.includes(Number(year)) ? year : "";
  const shown = recaps.filter(
    (r) =>
      (!activeClient || clientKey(r.clientName) === activeClient) &&
      (!activeYear || r.taxYear === Number(activeYear)),
  );

  const copy = async (r: RecapSummary) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/recap/${r.token}`);
      setCopied(r.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const remove = async (r: RecapSummary) => {
    if (
      !window.confirm(
        `Delete ${r.clientName}'s ${r.taxYear} recap permanently?\n\nThe numbers are erased and the client's link and PDF stop working. This can't be undone.`,
      )
    ) {
      return;
    }
    setBusy(r.id);
    setError(null);
    try {
      const res = await fetch(`/api/portal/tax-recap/${r.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleted((d) => new Set(d).add(r.id));
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? "Couldn't delete that recap");
      }
    } finally {
      setBusy(null);
    }
  };

  if (!recaps.length) {
    return (
      <Panel title="Saved recaps">
        <p className="text-[13px] text-dusk">Nothing saved yet — the first one lands here.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Saved recaps"
      bodyClassName="!px-0 !py-0"
      action={error ? <span className="text-[12px] text-danger">{error}</span> : null}
    >
      <div className="flex flex-wrap items-end gap-3 px-4 py-3.5">
        <SearchSelect
          label="Client"
          className="w-[280px]"
          value={activeClient}
          onChange={setClient}
          options={clients}
          placeholder="Search clients…"
          emptyLabel="No client by that name."
        />
        <Field label="Year" className="w-[140px]">
          <SelectInput value={activeYear} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Mono className="pb-3 text-dusk">
          {shown.length} of {recaps.length}
        </Mono>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <TableHead align="left">Client</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Before</TableHead>
              <TableHead>After</TableHead>
              <TableHead>Savings</TableHead>
              <TableHead align="left">Created</TableHead>
              <TableHead align="left">Link</TableHead>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[13px] text-dusk">
                  Nothing matches that filter.
                </td>
              </tr>
            ) : null}
            {shown.map((r) => (
              <tr key={r.id} className="even:bg-white/[0.02]">
                <TableCell align="left">
                  <span className="font-body text-fog">{r.clientName}</span>
                </TableCell>
                <TableCell>{r.taxYear}</TableCell>
                <TableCell>{money(r.totalBefore)}</TableCell>
                <TableCell>{money(r.totalAfter)}</TableCell>
                <TableCell>
                  <span className={r.savings >= 0 ? "text-teal" : "text-danger"}>{money(r.savings)}</span>
                </TableCell>
                <TableCell align="left">
                  <span className="font-body text-mist">
                    {r.createdAt ? shortDate(new Date(r.createdAt)) : "—"}
                  </span>
                  <span className="ml-1.5 font-body text-[11px] text-dusk">{r.createdBy}</span>
                </TableCell>
                <TableCell align="left">
                  <div className="flex items-center gap-2 font-body">
                    {r.revoked ? (
                      <span className="rounded-full border border-danger/40 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-danger">
                        Revoked
                      </span>
                    ) : (
                      <>
                        <button type="button" onClick={() => copy(r)} className={action}>
                          {copied === r.id ? "Copied" : "Copy"}
                        </button>
                        <Link href={`/recap/${r.token}`} target="_blank" className={action}>
                          Open
                        </Link>
                      </>
                    )}
                    <a href={`/api/portal/tax-recap/${r.id}/pdf`} className={action}>
                      PDF
                    </a>
                    <Link
                      href={`/portal/tax-recap?edit=${r.id}`}
                      className={`${action} border-magenta/40 text-magenta hover:border-magenta hover:text-magenta`}
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => remove(r)}
                      className={`${action} hover:border-danger hover:text-danger`}
                    >
                      {busy === r.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const action =
  "cursor-pointer rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1px] text-mist no-underline transition-colors hover:border-mist hover:text-fog disabled:opacity-50";
