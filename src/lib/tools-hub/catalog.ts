/**
 * What the Tools Hub holds before anyone edits it, plus the helpers both sides
 * of the wire need.
 *
 * Isomorphic on purpose: the hub renders these in the browser and the PUT route
 * sanitizes against the same rules on the server. Nothing here may import
 * Firebase or anything server-only.
 *
 * The defaults below are the client's own list, ported verbatim from the
 * prototype. Two of the URLs in it are placeholders that don't resolve
 * (`taxgpt.internal`, `timeoff.decypher.internal`) and the notion.so SOP links
 * are of the same shape — they're kept rather than dropped because the list is
 * the client's record of which tools the team uses, and fixing a URL is one
 * field in the editor. See docs/PORTAL.md.
 */

import type { ToolDepartment, ToolEntry, ToolsHubCatalog } from "./types";

/* ─────────────────────────── departments ─────────────────────────── */

const DEFAULT_DEPARTMENTS: ToolDepartment[] = [
  { id: "client", label: "Client Serving" },
  { id: "internal", label: "Internal Software" },
  { id: "sales", label: "Sales" },
  { id: "marketing", label: "Marketing" },
];

/* ───────────────────────────── tools ───────────────────────────── */

const DEFAULT_TOOLS: ToolEntry[] = [
  /* Client serving */
  {
    id: "taxdome",
    name: "TaxDome",
    vendor: "TaxDome",
    department: "client",
    description: "Client portal and project management.",
    appUrl: "https://app.taxdome.com",
    docsUrl: "https://notion.so/decypher/taxdome-sop",
    accent: "#2e5bff",
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    vendor: "QuickBooks",
    department: "client",
    description: "Creator bookkeeping and accounting.",
    appUrl: "https://qbo.intuit.com/",
    docsUrl: "https://notion.so/decypher/qbo-sop",
    accent: "#2ca01c",
  },
  {
    id: "proseries",
    name: "ProSeries",
    vendor: "ProSeries",
    department: "client",
    description: "Tax preparation software.",
    appUrl: "https://proseries.intuit.com/",
    accent: "#236cff",
  },
  {
    id: "fathom",
    name: "Fathom",
    vendor: "Fathom",
    department: "client",
    description: "Client call recordings and transcripts.",
    appUrl: "https://fathom.video/",
    accent: "#7c3aed",
  },
  {
    id: "aircall",
    name: "Aircall",
    vendor: "Aircall",
    department: "client",
    description: "DeCypher phone system for client calls.",
    appUrl: "https://dashboard.aircall.io/",
    accent: "#00b388",
  },
  {
    id: "loom",
    name: "Loom",
    vendor: "Loom",
    department: "client",
    description: "Screen recordings for client walkthroughs.",
    appUrl: "https://www.loom.com/login",
    accent: "#625df5",
  },
  {
    id: "zoom",
    name: "Zoom",
    vendor: "Zoom",
    department: "client",
    description: "Video meetings with clients and team.",
    appUrl: "https://zoom.us/signin",
    accent: "#2d8cff",
  },
  {
    id: "calendly",
    name: "Calendly",
    vendor: "Calendly",
    department: "client",
    description: "Client scheduling and booking.",
    appUrl: "https://calendly.com/login",
    docsUrl: "https://notion.so/decypher/calendly-sop",
    accent: "#006bff",
  },

  /* Internal */
  {
    id: "gusto",
    name: "Gusto Payroll",
    vendor: "Gusto",
    department: "internal",
    description: "Run payroll and manage employee benefits.",
    appUrl: "https://app.gusto.com/login",
    docsUrl: "https://notion.so/decypher/gusto-sop",
    accent: "#f45d48",
  },
  {
    id: "lattice",
    name: "Lattice Performance",
    vendor: "Lattice",
    department: "internal",
    description: "Performance reviews and goal tracking.",
    appUrl: "https://decypher.latticehq.com/",
    accent: "#8b5cf6",
  },
  {
    id: "taxgpt",
    name: "TaxGPT",
    vendor: "TaxGPT",
    department: "internal",
    description: "AI assistant for tax research and questions.",
    appUrl: "https://taxgpt.internal/",
    accent: "#10b981",
  },
  {
    id: "timeoff",
    name: "Time-off",
    vendor: "Time-off",
    department: "internal",
    description: "Submit and track PTO and vacation requests.",
    appUrl: "https://timeoff.decypher.internal/",
    accent: "#f59e0b",
  },
  {
    id: "slack",
    name: "Slack",
    vendor: "Slack",
    department: "internal",
    description: "DeCypher team communication.",
    appUrl: "https://slack.com/signin",
    docsUrl: "https://notion.so/decypher/slack-etiquette",
    accent: "#611f69",
  },
  {
    id: "gsuite",
    name: "Google Workspace",
    vendor: "Google Workspace",
    department: "internal",
    description: "Email, calendar, and shared Drive.",
    appUrl: "https://workspace.google.com/dashboard",
    accent: "#4285f4",
  },

  /* Sales */
  {
    id: "airtable",
    name: "Airtable CRM",
    vendor: "Airtable",
    department: "sales",
    description: "Sales pipeline and CRM tracking.",
    appUrl: "https://airtable.com/login",
    accent: "#f82b60",
  },
];

/** The catalog a fresh install serves. Cloned, so a caller can't mutate it. */
export function defaultCatalog(): ToolsHubCatalog {
  return {
    departments: DEFAULT_DEPARTMENTS.map((d) => ({ ...d })),
    tools: DEFAULT_TOOLS.map((t) => ({ ...t })),
  };
}

/* ─────────────────────────── helpers ─────────────────────────── */

/** Slug for a new department or tool. Empty when the label has nothing usable. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * The one or two characters on the fallback tile.
 *
 * Capitals first, because vendor names are camel-cased brands — "TaxDome" reads
 * as TD, "QuickBooks" as QB. A single-capital name falls back to its first
 * letter rather than padding with a lowercase one.
 */
export function monogram(vendor: string): string {
  const caps = vendor.match(/[A-Z0-9]/g) ?? [];
  if (caps.length >= 2) return (caps[0] + caps[1]).toUpperCase();
  return (vendor.trim()[0] ?? "?").toUpperCase();
}

const HEX = /^#[0-9a-f]{6}$/i;

/** A `#rrggbb` accent, lowercased, or null for anything else. */
export function asAccent(value: unknown): string | null {
  return typeof value === "string" && HEX.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

/**
 * `rgba()` for an accent at a given alpha.
 *
 * The tile composites the tint over whatever surface it sits on rather than
 * baking in a blend, so the same tool card reads correctly inside a panel and
 * inside the editor's list.
 */
export function accentRgba(accent: string | undefined, alpha: number): string | undefined {
  if (!accent || !HEX.test(accent)) return undefined;
  const n = parseInt(accent.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * An http(s) link, or null.
 *
 * These strings become `href`s on a page every member of staff opens, so a
 * `javascript:` or `data:` URL entered in the editor must not survive the trip.
 * Parsed rather than regex-matched, so the check can't be walked around with
 * whitespace or case.
 */
export function asHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw.slice(0, 500) : null;
  } catch {
    return null;
  }
}

/** Same, but a site-relative path is also fine — logos are served from /public. */
export function asAssetUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw.slice(0, 500);
  return asHttpUrl(raw);
}

/** Does this tool match what someone typed into the search box? */
export function matchesQuery(tool: ToolEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    tool.name.toLowerCase().includes(q) ||
    tool.vendor.toLowerCase().includes(q) ||
    tool.description.toLowerCase().includes(q)
  );
}
