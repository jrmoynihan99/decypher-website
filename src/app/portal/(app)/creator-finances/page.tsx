import { requirePermission } from "@/lib/firebase/session";
import { Eyebrow } from "@/components/estimator/fields";
import CreatorFinances, {
  type ConnectNotice,
} from "@/components/portal/widgets/CreatorFinances";
import { DEFAULT_PERIOD } from "@/lib/quickbooks/periods";
import { listCreatorFinances } from "@/lib/quickbooks/snapshots";

export const metadata = { title: "Creator Finances — DeCypher Portal" };

const NOTICE_KINDS = new Set([
  "connected",
  "cancelled",
  "expired",
  "already-connected",
  "error",
]);

/**
 * Server-rendered first paint, matching the leads/applications pattern: the
 * page gates, fetches and hands the result down; the widget owns interaction.
 *
 * The `qbo=` search params are the outcome of the Intuit connect redirect.
 * They're read here rather than with useSearchParams so the widget doesn't need
 * a Suspense boundary it would otherwise require.
 */
export default async function CreatorFinancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("creator-finances");

  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };

  const kind = one("qbo");
  const notice: ConnectNotice =
    kind && NOTICE_KINDS.has(kind)
      ? {
          kind: kind as NonNullable<ConnectNotice>["kind"],
          realm: one("realm"),
          name: one("name"),
        }
      : null;

  const initial = await listCreatorFinances(DEFAULT_PERIOD, "accrual");

  return (
    <>
      <Eyebrow>Tool</Eyebrow>

      <div className="mt-4 flex items-center gap-3">
        <h1 className="font-display text-3xl font-semibold text-fog">
          Creator Finances
        </h1>
        <span className="rounded-full border border-teal/40 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[1.2px] text-teal">
          Live
        </span>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-muted">
        Every client&rsquo;s profit &amp; loss pulled straight from their own QuickBooks
        company file — revenue streams, expense categories, net operating and net
        profit — plus the roll-up and per-client average across the whole book.
      </p>

      <div className="mt-9">
        <CreatorFinances initial={initial} notice={notice} />
      </div>
    </>
  );
}
