/**
 * "Re-read all" on the Refused returns page: the refusals to read again from
 * their kept files, worked through one at a time in the builder
 * (`/portal/tax-recap?failure=<id>&reread=1`), and what became of each. Kept
 * in this tab's sessionStorage — the builder remounts on every hop, and a
 * closed tab simply ends the run.
 */
export const REREAD_KEY = "taxRecapReread";

export type RereadResult = {
  kind: "fixed" | "refused" | "error";
  /** "verified", "projected (2 carried)", the refusal's first reason, or what went wrong. */
  detail: string;
  label: string;
};

export type RereadQueue = { ids: string[]; labels: Record<string, string>; results: Record<string, RereadResult> };

export function readRereadQueue(): RereadQueue | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(REREAD_KEY) ?? "null") as RereadQueue | null;
    return v && Array.isArray(v.ids) && v.results && typeof v.results === "object" ? { ...v, labels: v.labels ?? {} } : null;
  } catch {
    return null;
  }
}

export function writeRereadQueue(q: RereadQueue | null) {
  try {
    if (q) sessionStorage.setItem(REREAD_KEY, JSON.stringify(q));
    else sessionStorage.removeItem(REREAD_KEY);
  } catch {
    /* storage blocked: the run stops at the next hop */
  }
}

/** The next refusal in the queue with no result yet. */
export const nextInQueue = (q: RereadQueue) => q.ids.find((id) => !q.results[id]) ?? null;

export const rereadHref = (id: string) => `/portal/tax-recap?failure=${encodeURIComponent(id)}&reread=1`;
export const REREAD_DONE_HREF = "/portal/tax-recap/failures?reread=done";
