"use client";

import { Panel } from "@/components/portal/widgets/ui";
import { LISTS, label, short, type DiscoveryRecord, type ListKey } from "@/lib/discovery/schema";
import { Bars, type BarItem } from "@/components/portal/feedback/bits";

/**
 * The Stats tab: how creators found us, fit, entity and payroll, banking,
 * how they filed, income, tracking, what the next call reviews and the next
 * step. Everything follows the Calls filters. Distributions in list order,
 * ranked by count — "how many of everyone said X" is the question.
 */

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function countBy(rows: DiscoveryRecord[], list: ListKey, get: (r: DiscoveryRecord) => string | string[] | null): BarItem[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = get(r);
    for (const k of Array.isArray(v) ? v : [v]) if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return (LISTS[list] as readonly (readonly [string, string])[])
    .filter(([v]) => m.has(v))
    .map(([v, l]) => ({ label: short(list, v) || l, n: m.get(v)! }))
    .sort((a, b) => b.n - a.n);
}

export default function StatsTab({ rows }: { rows: DiscoveryRecord[] }) {
  const us = rows.filter((x) => x.call.usFiler === "yes");
  const sc = us.filter((x) => x.call.entity === "s_corp");
  const withBanks = us.filter((x) => x.call.banksBusiness != null);
  const withCards = us.filter((x) => x.call.cardsBusiness != null);
  const noBizBank = withBanks.filter((x) => x.call.banksBusiness === 0).length;
  const noBizCard = withCards.filter((x) => x.call.cardsBusiness === 0).length;
  const ty = rows[0]?.call.taxYearAsked;
  const cy = rows[0]?.call.revenueYear;

  const fitRows: BarItem[] = [
    ...LISTS.fit.map(([v, l]) => ({ label: l, n: rows.filter((x) => x.team.fit === v).length, color: v === "good" ? "var(--color-teal)" : v === "not_fit" ? "var(--color-danger)" : "var(--color-tier-warn)" })),
    { label: "Not set", n: rows.filter((x) => !x.team.fit).length, color: "var(--color-faint)" },
  ].filter((i) => i.n);
  const stepRows = LISTS.next_step.map(([v, l]) => ({ label: l, n: rows.filter((x) => x.team.nextStep === v).length })).filter((i) => i.n);
  const filedRows = [
    ...countBy(
      us.filter((x) => x.call.filedHow),
      "filed_how",
      (r) => r.call.filedHow,
    ),
    { label: "Didn’t file", n: us.filter((x) => x.call.filedPrior === "no").length, color: "var(--color-danger)" },
  ].filter((i) => i.n);
  const payRows = [
    ...countBy(
      sc.filter((x) => x.call.payroll === "yes"),
      "payroll_provider",
      (r) => r.call.payrollProvider,
    ),
    { label: "No payroll (red flag)", n: sc.filter((x) => x.call.payroll === "no").length, color: "var(--color-danger)" },
  ].filter((i) => i.n);
  const bankRows = LISTS.bank.map(([v]) => ({ label: short("bank", v), n: withBanks.filter((x) => x.call.banks[v]).length }))
    .filter((i) => i.n)
    .sort((a, b) => b.n - a.n);
  const issuerRows = LISTS.issuers.map(([v]) => ({ label: short("issuers", v), n: withCards.filter((x) => x.call.cards[v]).length }))
    .filter((i) => i.n)
    .sort((a, b) => b.n - a.n);
  const incomeRows = LISTS.revenue.map(([v, l]) => ({ label: l, n: us.filter((x) => x.call.revenueBand === v).length })).filter((i) => i.n);
  const reviewRows = LISTS.review_choice.map(([v]) => ({ label: short("review_choice", v), n: rows.filter((x) => x.call.reviewChoice === v).length })).filter((i) => i.n);

  return (
    <>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(330px,100%),1fr))]">
        <Panel title="How they found us" action={<Right>{plural(rows.length, "call")}</Right>}>
          <Bars total={rows.length} items={countBy(rows, "source", (r) => r.call.source)} />
        </Panel>
        <Panel title="Fit" action={<Right>{plural(rows.length, "call")}</Right>}>
          <Bars total={rows.length} items={fitRows} />
        </Panel>
        <Panel title="Entity structure" action={<Right>{plural(us.length, "US filer")}</Right>}>
          <Bars total={us.length} items={countBy(us, "entity", (r) => r.call.entity)} />
        </Panel>
        <Panel title="S corp payroll" action={<Right>{plural(sc.length, "S corp")}</Right>}>
          <Bars total={sc.length} items={payRows} />
        </Panel>
        <Panel title="Banks" action={<Right>{noBizBank} with no business account</Right>}>
          <Bars total={withBanks.length} items={bankRows} />
        </Panel>
        <Panel title="Card issuers" action={<Right>{noBizCard} with no business card</Right>}>
          <Bars total={withCards.length} items={issuerRows} />
        </Panel>
        <Panel title="Filing status" action={<Right>{plural(us.length, "US filer")}</Right>}>
          <Bars total={us.length} items={countBy(us, "filing_status", (r) => r.call.filingStatus)} />
        </Panel>
        <Panel title={`How they filed the prior year${ty ? ` (${ty})` : ""}`} action={<Right>{plural(us.length, "US filer")}</Right>}>
          <Bars total={us.length} items={filedRows} />
        </Panel>
        <Panel title={`Current-year income${cy ? ` (${cy})` : ""}`} action={<Right>{plural(us.length, "US filer")}</Right>}>
          <Bars total={us.length} items={incomeRows} />
        </Panel>
        <Panel title="Income streams" action={<Right>share of US filers</Right>}>
          <Bars total={us.length} items={countBy(us, "streams", (r) => r.call.streams)} />
        </Panel>
        <Panel title="How they track money" action={<Right>share of US filers</Right>}>
          <Bars total={us.length} items={countBy(us, "tracking", (r) => r.call.tracking)} />
        </Panel>
        <Panel title="Next call review" action={<Right>{plural(rows.length, "call")}</Right>}>
          <Bars total={rows.length} items={reviewRows} />
        </Panel>
        <Panel title="Next step" action={<Right>{plural(rows.length, "call")}</Right>}>
          <Bars total={rows.length} items={stepRows} />
        </Panel>
      </div>
      <p className="m-0 mt-3 px-0.5 text-[12.5px] leading-relaxed text-dusk">
        Everything here follows the filters above. Entity, banking, filing and income count US filers only — a creator who
        doesn’t file here is asked nothing past the first question. {label("entity", "s_corp")} payroll counts S corps alone.
      </p>
    </>
  );
}

function Right({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-dusk">{children}</span>;
}
