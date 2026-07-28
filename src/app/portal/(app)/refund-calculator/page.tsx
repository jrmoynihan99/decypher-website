import { requirePermission } from "@/lib/firebase/session";
import { Eyebrow } from "@/components/estimator/fields";
import RefundCalculator from "@/components/portal/widgets/RefundCalculator";

export const metadata = { title: "Service Ledger — DeCypher Portal" };

export default async function RefundCalculatorPage() {
  await requirePermission("refund-calculator");

  return (
    <>
      <Eyebrow>Tool</Eyebrow>

      <div className="mt-4 flex items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-fog">
          Service Ledger
        </h1>
        <span className="rounded-full border border-teal/40 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-teal">
          Live
        </span>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-muted">
        We only charge for the time we actually work. Enter the join date and
        the cancellation date, and this shows exactly what comes back — and how
        we got there.
      </p>

      <div className="mt-9">
        <RefundCalculator />
      </div>
    </>
  );
}
