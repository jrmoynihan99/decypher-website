/**
 * Wire shapes for the Tools Hub.
 *
 * Separate from store.ts because store.ts is `server-only` and the hub is a
 * client component. Same rule as lib/sales/types.ts: nothing in this file may
 * import anything with a runtime side effect.
 */

/**
 * A group of tools. `id` is what a tool's `department` is written in, so the
 * editor renames labels freely but never touches an id — a rename that changed
 * the id would orphan every tool inside it.
 */
export interface ToolDepartment {
  id: string;
  label: string;
}

/**
 * One tool card.
 *
 * `id` is derived from the name once, at creation, and then fixed: it keys the
 * logo file and it's what a per-user preference would be written in. Everything
 * else is display and may be edited.
 *
 * `accent` is a brand hex, and it is the one place this codebase allows a free
 * colour rather than a swatch from a vetted palette. The rule in
 * lib/sales/options.ts exists because a chart bar's hue IS the label; here the
 * vendor's name is printed directly under its tile, so the colour carries no
 * information and can't mislead. It's rendered only as a low-alpha tint behind
 * a `text-fog` monogram — never as text or as a chart series — so a dark brand
 * like Slack's aubergine stays legible.
 */
export interface ToolEntry {
  id: string;
  name: string;
  vendor: string;
  /** A ToolDepartment id. */
  department: string;
  description: string;
  appUrl: string;
  /** Link to the SOP / runbook. Optional — most tools don't have one yet. */
  docsUrl?: string;
  /** `/logos/<id>.svg` once a file exists. Falls back to the monogram tile. */
  logoUrl?: string;
  /** `#rrggbb`. */
  accent?: string;
}

export interface ToolsHubCatalog {
  departments: ToolDepartment[];
  tools: ToolEntry[];
}
