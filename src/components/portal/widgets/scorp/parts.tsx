"use client";

/**
 * Small pieces the S-Corp Analyzer's tabs share: button skins, the risk pill
 * and the save-status line. Buttons match the portal's toolbar conventions
 * (SalesFlow): mono caps at 11px on a 10px radius, magenta fill for the one
 * action that matters, hairline ghosts for the rest.
 */

import { money } from "@/lib/widget-format";
import { GREEN_LIGHT, type Risk } from "@/lib/tax-strategy/scorp";
import { Chip } from "@/components/portal/widgets/ui";

const btnBase =
  "cursor-pointer rounded-[10px] border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.8px] whitespace-nowrap transition-colors duration-150 disabled:cursor-default disabled:opacity-40";

export const ghostBtn = `${btnBase} border-edge-mid text-dusk hover:border-magenta hover:text-fog disabled:hover:border-edge-mid disabled:hover:text-dusk`;

export const primaryBtn =
  "cursor-pointer whitespace-nowrap rounded-[10px] bg-magenta px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.8px] text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-default disabled:opacity-40";

/** "Check complete", "Client notified" — the go-ahead actions. */
export const okBtn = `${btnBase} border-teal/50 bg-teal/10 text-teal hover:bg-teal/15`;

/** "Tweak salary", "Copy note" — opens the next step rather than closing one. */
export const tweakBtn = `${btnBase} border-magenta/60 text-magenta hover:bg-magenta/10`;

export const dangerBtn = `${btnBase} border-danger text-danger hover:bg-danger/10`;

/**
 * The kit's input shell, for the text fields NumInput doesn't cover. Font,
 * size and width are left to the caller — two utilities for one property
 * don't reliably resolve in class order.
 */
export const fieldCls =
  "rounded-[10px] border border-edge-mid bg-panel-2 px-3 py-2.5 text-fog outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-magenta focus:shadow-[0_0_0_3px_rgba(255,45,120,0.18)]";

/** The salary risk as a pill, or the under-threshold note where there's no risk to rate. */
export function RiskPill({ risk }: { risk: Risk | null }) {
  if (!risk) {
    return (
      <span className="whitespace-nowrap font-mono text-[10.5px] text-faint">
        Under {money(GREEN_LIGHT)}
      </span>
    );
  }
  return <Chip tone={risk.tone}>{risk.pill}</Chip>;
}

export type SaveStatus = { tone: "pos" | "neg" | "mute"; text: string };

export function StatusDot({ tone }: { tone: SaveStatus["tone"] }) {
  return (
    <span
      aria-hidden
      className={`h-2 w-2 flex-none rounded-full ${
        tone === "pos"
          ? "bg-teal shadow-[0_0_8px_var(--color-teal)]"
          : tone === "neg"
            ? "bg-danger"
            : "bg-faint"
      }`}
    />
  );
}
