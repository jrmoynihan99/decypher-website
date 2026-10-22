import Link from "next/link";
import { requirePermission } from "@/lib/firebase/session";
import { KEEP_DAYS, listFailures } from "@/lib/tax-recap/failures-store";
import { loadTables } from "@/lib/tax-recap/tables-store";
import { Eyebrow } from "@/components/estimator/fields";
import FailureList from "@/components/portal/tax-recap/FailureList";

export const metadata = { title: "Tax Recap failures — DeCypher Portal" };

/**
 * Every return the engine refused, with everything it was handed, so a
 * refusal can be replayed and fixed without asking for the files again.
 */
export default async function TaxRecapFailuresPage() {
  await requirePermission("receipts");
  // The tables the builder derives with, so "Retry" runs the engine as the builder would.
  const [failures, tables] = await Promise.all([listFailures(), loadTables()]);

  return (
    <>
      <Eyebrow>Tool · engineering</Eyebrow>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-fog">Refused returns</h1>
        <Link
          href="/portal/tax-recap"
          className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted no-underline hover:text-fog"
        >
          ← Back to Tax Recap
        </Link>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-muted">
        Each time the engine can&rsquo;t compute a before column, what it was handed is
        recorded here: the numbers as read, the reader&rsquo;s notes, the cross-check warnings
        and the reasons. That is enough to replay the refusal on a laptop (
        <code className="font-mono text-[12px] text-mist">npm run recap:replay</code>) and turn
        it into a test. The files dropped for a refusal are kept with it as they were uploaded
        (from 2026-10-22 on) until the refusal is deleted; the redacted copies the reader saw,
        when someone pressed &ldquo;keep&rdquo;, for {`${KEEP_DAYS} days`}. &ldquo;Retry&rdquo; runs
        every refusal again with the engine as it is now.
      </p>

      <div className="mt-9">
        <FailureList failures={failures} tables={tables} />
      </div>
    </>
  );
}
