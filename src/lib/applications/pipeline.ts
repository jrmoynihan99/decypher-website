/**
 * The recruiting pipeline — the operator-owned half of a job application.
 *
 * An application document has two halves that must never mix. The applicant
 * wrote everything in lib/application.ts; recruiting writes everything here,
 * and it lives under a single `pipeline` map on the same document so a new
 * question on the careers form can never collide with a tracking field.
 *
 * Isomorphic on purpose: the tracker renders these in the browser and the
 * PATCH route validates against them on the server, so nothing here may import
 * Firebase or anything server-only.
 *
 * The stored value is always the option KEY, never the label. Labels get
 * reworded from ⚙ Options; keys are what the stats count. That's the whole
 * reason `hired` can be renamed to "Signed" without the hire count moving.
 */

import { optionKey, type OptionItem } from "@/lib/option-list";

/* ───────────────────────── the tracked fields ───────────────────────── */

export interface ApplicationPipeline {
  /** Screening verdict — a key from the `fit` list. */
  fit: string | null;
  /**
   * Where the offer got to — a key from the `offer` list.
   *
   * Any value here means an offer WAS pitched; `accepted` and `declined` are
   * what happened next, not alternatives to pitching. That's what makes
   * "offers pitched" a single non-null check rather than a key whitelist that
   * drifts every time the list is edited.
   */
  offer: string | null;
  /** Hired / not hired — a key from the `outcome` list. `hired` is counted. */
  outcome: string | null;
  /**
   * The role they're being tracked against — a key from the editable `role`
   * list, which is deliberately NOT the role they applied for.
   *
   * The applied-for role is captured from the job posting and is history; this
   * is the role recruiting is actually considering them for, and people get
   * moved. Both are shown in the tracker, side by side.
   */
  role: string | null;
  /** Free text for the recruiter. Optional. */
  notes: string | null;
}

export const EMPTY_PIPELINE: ApplicationPipeline = {
  fit: null,
  offer: null,
  outcome: null,
  role: null,
  notes: null,
};

/**
 * The two keys the stats count. Renameable in the UI, fixed on the wire —
 * relabelling "Hired" to "Signed" must not move the hire count.
 */
export const HIRED_KEY = "hired";
export const FIT_KEY = "fit";

export const NOTES_MAX = 2000;

/* ───────────────────────── the editable lists ───────────────────────── */

export interface ApplicationOptionsConfig {
  fit: OptionItem[];
  offer: OptionItem[];
  outcome: OptionItem[];
  role: OptionItem[];
}

export type ApplicationList = keyof ApplicationOptionsConfig;

/**
 * The lists where adding and retiring keys is allowed.
 *
 * Only `role` — the roles you hire for are your own vocabulary and change
 * every quarter, which is exactly what the client asked to be able to tweak.
 * The other three carry the stats semantics (a hire is `outcome: hired`, an
 * offer is any non-null `offer`), so adding or removing an entry there is not
 * an edit, it's a code change. All four can still be renamed, recoloured and
 * reordered.
 */
export const APPLICATION_OPEN_LISTS = ["role"] as const;

export const APPLICATION_LIST_ORDER: ApplicationList[] = [
  "role",
  "fit",
  "offer",
  "outcome",
];

export const APPLICATION_LIST_TITLES: Record<ApplicationList, string> = {
  role: "Roles",
  fit: "Fit",
  offer: "Offer",
  outcome: "Outcome",
};

/**
 * What `applicationConfig/options` holds before anyone edits it.
 *
 * `role` ships EMPTY rather than guessing at a roster: the openings live in
 * Sanity and rotate, so the tracker offers the roles it has actually seen
 * applications for as one-click adds instead (see roleSuggestions).
 */
export function defaultApplicationOptions(): ApplicationOptionsConfig {
  return {
    role: [],
    fit: [
      { key: "fit", label: "A fit", color: "sky" },
      { key: "not-a-fit", label: "Not a fit", color: "slate" },
    ],
    offer: [
      { key: "pitched", label: "Offer pitched", color: "amber" },
      { key: "accepted", label: "Offer accepted", color: "lime" },
      { key: "declined", label: "Offer declined", color: "rose" },
    ],
    outcome: [
      { key: HIRED_KEY, label: "Hired", color: "teal" },
      { key: "not-hired", label: "Not hired", color: "rose" },
    ],
  };
}

/**
 * Roles seen on applications that the editable list doesn't offer yet, as
 * {key, label} pairs ready to add. Sorted by how many applications carry them,
 * so the role you're actually hiring for is the first suggestion.
 */
export function roleSuggestions(
  configured: OptionItem[],
  appliedRoles: string[],
): { key: string; label: string; count: number }[] {
  const known = new Set(configured.map((i) => i.key));
  const counts = new Map<string, { label: string; count: number }>();
  for (const raw of appliedRoles) {
    const label = raw.trim();
    if (!label) continue;
    const key = optionKey(label);
    if (!key || known.has(key)) continue;
    const seen = counts.get(key);
    if (seen) seen.count += 1;
    else counts.set(key, { label, count: 1 });
  }
  return [...counts.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* ───────────────────────── counting ───────────────────────── */

/** Did an offer go out? Any stage on the offer list means yes — see the type. */
export const offerPitched = (p: ApplicationPipeline) => p.offer !== null;

/** One definition each, so no two panels can disagree about them. */
export const isHired = (p: ApplicationPipeline) => p.outcome === HIRED_KEY;
export const isFit = (p: ApplicationPipeline) => p.fit === FIT_KEY;
/** Has anyone made a call on this person yet? */
export const isTriaged = (p: ApplicationPipeline) =>
  p.fit !== null || p.offer !== null || p.outcome !== null;
