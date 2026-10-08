"use client";

/**
 * The builder's right column: the estimated annual benefit, how it's built,
 * and the live policy document those answers produce.
 *
 * Sticky on desktop and sized to the viewport, with the document taking
 * whatever height is left and scrolling inside itself — the column is too
 * tall to stick whole, and a sticky column taller than the screen hides its
 * own buttons until the form beside it runs out.
 *
 * The document is a sheet of paper on purpose: fixed light colours in both
 * portal themes, because it's the legal document the client signs and it
 * should look the same on screen as it prints.
 */

import { Fragment } from "react";
import { Kpi, KpiRow, LineRow, Mono, MoneyFlow, Panel } from "@/components/portal/widgets/ui";
import {
  methodLabel,
  money,
  type PlanState,
  type PlanTotals,
} from "@/lib/tax-strategy/accountable-plan";
import { btnCls } from "./kit";

/**
 * The on-screen document's styles, scoped to `.ap-paper` — the original's
 * `.document-sheet` rules. The HTML is a string from policyDocHtml, so it's
 * styled by selector rather than by utility classes. Preflight resets lists
 * and headings, so those are restated here.
 */
export const PAPER_CSS = `
.ap-paper{background:#FBFAF6;color:#1B1B1F;font-family:Georgia,"Times New Roman",serif;}
.ap-paper h1{font-size:19px;font-weight:700;text-align:center;margin:0 0 4px;}
.ap-paper .doc-sub{text-align:center;font-family:var(--font-body,sans-serif);font-size:11.5px;color:#6B6D74;margin-bottom:24px;}
.ap-paper h2{font-size:14px;font-weight:700;margin:24px 0 8px;padding-top:13px;border-top:1px solid #E4E0D4;}
.ap-paper h2:first-of-type{border-top:none;padding-top:0;margin-top:0;}
.ap-paper p{font-size:13px;line-height:1.65;margin:0 0 9px;}
.ap-paper ul{margin:7px 0 9px;padding-left:19px;list-style:disc;}
.ap-paper li{font-size:13px;line-height:1.6;margin-bottom:4px;}
.ap-paper strong{font-weight:700;}
.ap-paper table{width:100%;border-collapse:collapse;margin:9px 0 13px;font-family:var(--font-body,sans-serif);}
.ap-paper th,.ap-paper td{border:1px solid #E4E0D4;padding:6px 8px;font-size:12px;text-align:left;}
.ap-paper th{background:#F1EEE3;font-weight:600;}
.ap-paper .placeholder-text{color:#8A8C92;font-style:italic;}
.ap-paper .doc-sig-block{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:22px;}
.ap-paper .sig-line{border-top:1px solid #1B1B1F;padding-top:6px;font-family:var(--font-body,sans-serif);font-size:11px;color:#6B6D74;}
.ap-paper .sig-name{font-size:13.5px;color:#1B1B1F;margin-bottom:22px;}
.ap-paper .sig-name.sig-script{font-family:var(--font-great-vibes),"Great Vibes","Brush Script MT","Segoe Script",cursive;font-size:30px;line-height:1;margin-bottom:8px;min-height:30px;}
`;

/**
 * The policy as paper. `html` comes from policyDocHtml, which escapes every
 * user-supplied string — that, and only that, is what makes injecting it
 * safe. Don't feed this anything else. Radius and shadow are the caller's:
 * the preview floats a sheet, the viewer fills its dialog edge to edge.
 */
export function PaperSheet({ html, className = "" }: { html: string; className?: string }) {
  return (
    <div
      className={`ap-paper overflow-y-auto px-6 py-8 sm:px-[38px] sm:py-10 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function ResultsColumn({
  plan,
  all,
  docHtml,
  saveLabel,
  saving,
  onPrint,
  onSave,
  onDownloadHtml,
  onDownloadText,
}: {
  plan: PlanState;
  all: PlanTotals;
  docHtml: string;
  saveLabel: string;
  saving: boolean;
  onPrint: () => void;
  onSave: () => void;
  onDownloadHtml: () => void;
  onDownloadText: () => void;
}) {
  const hoOn = plan.homeOffice.included;
  const vOn = plan.vehicles.included;

  return (
    <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pb-1">
      <div className="flex-none rounded-[20px] border border-magenta/35 bg-panel bg-gradient-to-br from-magenta/[0.14] to-magenta/[0.02] px-6 py-6 text-center">
        <Mono className="text-muted">Estimated annual benefit</Mono>
        <div className="mt-2 font-display text-[46px] font-bold leading-none tabular-nums text-magenta">
          <MoneyFlow value={all.grandTotal} />
        </div>
        <p className="mt-2 text-[12px] text-dusk">Tax-free reimbursement, deductible to the company</p>
      </div>

      <KpiRow cols={3} className="flex-none">
        <Kpi
          label="Home office"
          value={hoOn ? money(all.hoTotal) : "—"}
          sub={hoOn ? methodLabel(all.ho.effective) : "Not included"}
        />
        <Kpi
          label="Vehicle(s)"
          value={vOn ? money(all.vehTotal) : "—"}
          sub={vOn ? all.vehicles.length + " vehicle" + (all.vehicles.length === 1 ? "" : "s") : "Not included"}
        />
        <Kpi
          label="Depreciation boost"
          value={all.depTotal > 0 ? money(all.depTotal) : "—"}
          sub={all.depTotal > 0 ? "From 2026 vehicles" : "None this year"}
        />
      </KpiRow>

      <Panel title="How the number is built" className="flex-none">
        {hoOn && all.ho.effective === "actual" ? (
          <LineRow label="Home office — actual expense" value={money(all.ho.actualDeduction)} />
        ) : null}
        {vOn
          ? all.vehicles.map((x) => {
              const label = (x.v.label || "Vehicle") + " — " + methodLabel(x.calc.effective);
              if (x.calc.effective !== "actual") {
                return <LineRow key={x.v.id} label={label} value={money(x.calc.effectiveTotal)} />;
              }
              // A fragment, not a wrapper: LineRow's hairline drops on :first-child.
              return (
                <Fragment key={x.v.id}>
                  <LineRow label={label + " (operating)"} value={money(x.calc.operatingDeduction)} />
                  {x.calc.leaseDeduction > 0 ? (
                    <LineRow label={label + " (lease)"} value={money(x.calc.leaseDeduction)} />
                  ) : null}
                  {x.calc.depreciationDeduction > 0 ? (
                    <LineRow label={label + " (depreciation)"} value={money(x.calc.depreciationDeduction)} />
                  ) : null}
                </Fragment>
              );
            })
          : null}
        {!hoOn && !vOn ? <LineRow label="Nothing selected yet" value={"—"} /> : null}
        <LineRow label="Total" value={money(all.grandTotal)} total tone="pos" />
      </Panel>

      {/* Label and sheet are direct flex children so the sheet can take the
          leftover height (flex-auto, floored at 320px) and scroll inside. */}
      <div className="-mb-1.5 flex flex-none items-center justify-between">
        <Mono className="text-dusk">The client&rsquo;s policy document</Mono>
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[1.2px] text-teal">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-teal" />
          Live
        </span>
      </div>
      <PaperSheet
        html={docHtml}
        className="max-h-[620px] rounded-[10px] shadow-[0_20px_50px_rgba(0,0,0,0.35)] lg:max-h-none lg:min-h-[320px] lg:flex-auto"
      />

      <div className="flex-none">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onPrint} className={btnCls("primary", "sm")}>
            Print / Save as PDF
          </button>
          <button type="button" onClick={onSave} disabled={saving} className={btnCls("teal", "sm")}>
            {saving ? "Saving…" : saveLabel}
          </button>
          <button type="button" onClick={onDownloadHtml} className={btnCls("ghost", "sm")}>
            Download HTML
          </button>
          <button type="button" onClick={onDownloadText} className={btnCls("ghost", "sm")}>
            Download text
          </button>
        </div>
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-dusk">
          Print gives you a clean PDF from your browser&rsquo;s print dialog.
        </p>
        <p className="mt-4 border-t border-edge pt-3.5 text-[11px] leading-relaxed text-faint">
          2026 figures: IRS standard mileage rate $0.725/mi; luxury-auto depreciation limits per Rev. Proc. 2026-15; 100% bonus depreciation under IRC &sect;168(k) as amended; heavy-SUV &sect;179 cap $32,000. Estimates only &mdash; confirm exact figures with the client&rsquo;s tax preparer before filing.
        </p>
      </div>
    </aside>
  );
}
