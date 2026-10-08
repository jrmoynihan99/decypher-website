/**
 * The builder's calls to /api/portal/tax-strategy/accountable-plans. Every
 * response is `{ ok, … }` or `{ ok: false, message }`; failures throw an
 * ApiError carrying the status, so callers can tell "that plan is gone"
 * (404 → save it fresh) from "you can't" (401/403) from "try again" (5xx).
 */

import type { PlanRecord, PlanState } from "@/lib/tax-strategy/accountable-plan";

const BASE = "/api/portal/tax-strategy/accountable-plans";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(url: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!res.ok || !data.ok) throw new ApiError(data.message || fallback, res.status);
  return data as T;
}

/**
 * What to tell staff when a call fails: the server's own words for a
 * refusal (signed out, no access, bad id), the caller's fallback for
 * anything that's worth retrying.
 */
export function failureMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 404 ? e.message : fallback;
}

export async function listPlans(): Promise<PlanRecord[]> {
  const data = await call<{ plans: PlanRecord[] }>(BASE, undefined, "Couldn't load saved plans");
  return Array.isArray(data.plans) ? data.plans : [];
}

export async function createPlan(state: PlanState): Promise<PlanRecord> {
  const data = await call<{ plan: PlanRecord }>(
    BASE,
    { method: "POST", body: JSON.stringify({ state }) },
    "Couldn't save",
  );
  return data.plan;
}

/** Resolves "missing" when the record was deleted underneath this draft. */
export async function updatePlan(id: string, state: PlanState): Promise<PlanRecord | "missing"> {
  try {
    const data = await call<{ plan: PlanRecord }>(
      `${BASE}/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify({ state }) },
      "Couldn't save",
    );
    return data.plan;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return "missing";
    throw e;
  }
}

export async function deletePlan(id: string): Promise<void> {
  await call(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" }, "Couldn't delete");
}

/** One backup record. The server re-narrows it and recomputes its summary. */
export async function importPlan(record: unknown): Promise<PlanRecord> {
  const data = await call<{ plan: PlanRecord }>(
    BASE,
    { method: "POST", body: JSON.stringify({ record }) },
    "Couldn't import",
  );
  return data.plan;
}
