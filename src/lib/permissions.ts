/**
 * Per-tab access control for the portal.
 *
 * A permission key is a sidebar tab. The keys live here — not in nav-items —
 * because both sides of the wire need them: client components (the sidebar,
 * the checkboxes in StaffManager) and server code (session resolution, API
 * guards). This module is deliberately isomorphic, so nothing in it may touch
 * Firebase or import anything server-only.
 *
 * Semantics, decided once so every consumer agrees:
 * - Admins always hold every permission — the checkboxes don't apply to them.
 * - A user doc with NO `permissions` field predates this feature and is
 *   grandfathered to full access, so shipping this can't lock anyone out.
 * - An explicit array means exactly that set. `[]` is a valid "no tools" state.
 */

export const PERMISSION_KEYS = [
  "tools-hub",
  "tax-strategy",
  "refund-calculator",
  "receipts",
  "sales-flow",
  "creator-finances",
  "leads",
  "applications",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  "tools-hub": "Tools Hub",
  "tax-strategy": "Tax Strategy",
  "refund-calculator": "Service Ledger",
  receipts: "Receipt Analyzer",
  "sales-flow": "Sales Flow",
  "creator-finances": "Creator Finances",
  leads: "Leads",
  applications: "Applications",
};

const VALID = new Set<string>(PERMISSION_KEYS);

/**
 * Parse an untrusted permissions value — an API body or a Firestore doc — into
 * known keys. Returns null when the value isn't an array at all (field absent,
 * legacy doc, wrong type), which callers treat as "no explicit grant recorded".
 * Unknown strings are dropped rather than kept: a stale key from a deleted tab
 * should vanish, not haunt the doc forever. Output is deduped and in canonical
 * key order so stored arrays compare stably.
 */
export function parsePermissions(value: unknown): PermissionKey[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>(value.filter((k) => typeof k === "string" && VALID.has(k)));
  return PERMISSION_KEYS.filter((k) => seen.has(k));
}

/** The set a signed-in user can actually see, applying the semantics above. */
export function resolvePermissions(
  role: "admin" | "staff",
  stored: PermissionKey[] | null,
): PermissionKey[] {
  if (role === "admin" || stored === null) return [...PERMISSION_KEYS];
  return stored;
}
