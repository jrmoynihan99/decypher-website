/**
 * "Re-read" runs on the Refused returns page: refusals read again from their
 * kept files and, when they go through, saved as recaps (video and all). The
 * work happens in the builder (`/portal/tax-recap?failure=<id>&reread=1&lane=<n>`),
 * a few lanes at once in frames on the Refused returns page; each lane works
 * down its own list, page by page. Kept in localStorage, which the frames
 * share with the page: the run's lists under one key, each refusal's result
 * under its own, so two lanes finishing at once can't overwrite each other.
 */
const RUN_KEY = "taxRecapReread";
const resultKey = (id: string) => `${RUN_KEY}:${id}`;

/** How many returns are read at once. More trips the model's rate limit and slows the video renders. */
export const REREAD_LANES = 3;

export type RereadResult = {
  kind: "fixed" | "refused" | "error";
  /** "verified — recap saved with its video", the refusal's first reason, or what went wrong. */
  detail: string;
  label: string;
  /** The recap saved when it went through. */
  recap?: string;
};

export type RereadRun = { ids: string[]; labels: Record<string, string>; lanes: string[][]; startedAt: string };

const store = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function readRun(): RereadRun | null {
  try {
    const v = JSON.parse(store()?.getItem(RUN_KEY) ?? "null") as RereadRun | null;
    return v && Array.isArray(v.ids) && Array.isArray(v.lanes) ? v : null;
  } catch {
    return null;
  }
}

/** Start a run (its old results cleared), or end one (null). */
export function writeRun(run: RereadRun | null) {
  const s = store();
  if (!s) return;
  try {
    const old = readRun();
    for (const id of old?.ids ?? []) s.removeItem(resultKey(id));
    if (run) {
      for (const id of run.ids) s.removeItem(resultKey(id));
      s.setItem(RUN_KEY, JSON.stringify(run));
    } else s.removeItem(RUN_KEY);
  } catch {
    /* storage blocked: the run can't go on */
  }
}

export function readResult(id: string): RereadResult | null {
  try {
    return JSON.parse(store()?.getItem(resultKey(id)) ?? "null") as RereadResult | null;
  } catch {
    return null;
  }
}

export function writeResult(id: string, r: RereadResult) {
  try {
    store()?.setItem(resultKey(id), JSON.stringify(r));
  } catch {
    /* the summary just won't show it */
  }
}

export function runResults(run: RereadRun): Record<string, RereadResult> {
  const out: Record<string, RereadResult> = {};
  for (const id of run.ids) {
    const r = readResult(id);
    if (r) out[id] = r;
  }
  return out;
}

/** The next refusal in a lane with no result yet. */
export function nextInLane(run: RereadRun, lane: number): string | null {
  return run.lanes[lane]?.find((id) => !readResult(id)) ?? null;
}

/** Which lane a refusal is in (-1 when it isn't in the run). */
export const laneOf = (run: RereadRun, id: string) => run.lanes.findIndex((l) => l.includes(id));

export const rereadHref = (id: string, lane: number) => `/portal/tax-recap?failure=${encodeURIComponent(id)}&reread=1&lane=${lane}`;
