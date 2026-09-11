"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Panel, TableCell, TableHead } from "@/components/portal/widgets/ui";
import { money, shortDate } from "@/lib/widget-format";
import type { RecapSummary } from "@/lib/tax-recap/store";

/**
 * Every recap built so far, newest first. Copy hands over the client link,
 * Edit reopens the builder on the saved numbers (no re-read — the extraction
 * is stored), Revoke kills the link without losing the record (a
 * wrong-recipient link, a number that has to come down now).
 *
 * The rows come from the server on every render, so a save in the builder
 * shows up here as soon as its router.refresh() resolves.
 */
export default function RecapList({ recaps: fromServer }: { recaps: RecapSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /**
   * Revokes applied here before the server round-trip lands. Rendered over the
   * server's rows rather than replacing them: the builder calls
   * router.refresh() after every save, and a useState copy of the list would
   * ignore that and leave a just-saved recap invisible.
   */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const recaps = fromServer.map((r) =>
    r.id in pending ? { ...r, revoked: pending[r.id] } : r,
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

  const toggleRevoked = async (r: RecapSummary) => {
    setBusy(r.id);
    try {
      const res = await fetch(`/api/portal/tax-recap/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoked: !r.revoked }),
      });
      if (res.ok) {
        setPending((p) => ({ ...p, [r.id]: !r.revoked }));
        router.refresh();
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
    <Panel title="Saved recaps" bodyClassName="!px-0 !py-0">
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
            {recaps.map((r) => (
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
                    <Link
                      href={`/portal/tax-recap?edit=${r.id}`}
                      className={`${action} border-magenta/40 text-magenta hover:border-magenta hover:text-magenta`}
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => toggleRevoked(r)}
                      className={`${action} ${r.revoked ? "" : "hover:text-danger"}`}
                    >
                      {r.revoked ? "Restore" : "Revoke"}
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
