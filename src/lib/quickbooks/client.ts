import "server-only";

/**
 * The QuickBooks Accounting API transport, following the shape of
 * lib/calendly.ts: one private generic wrapper, a typed error class, and
 * exported functions that are domain verbs returning narrowed types of our own
 * rather than raw provider shapes.
 *
 * Two deliberate departures from that precedent, both documented at the point
 * they occur:
 *
 *  1. `api()` takes realmId as its first argument instead of closing over one
 *     credential. There is no single credential here — every client company is
 *     a separate OAuth connection, and the sync fans out across all of them.
 *
 *  2. It retries exactly once, on a 401. calendly.ts has a no-retries rule and
 *     it's right there; here, access tokens live 60 minutes and can expire in
 *     the window between the freshness check and the request landing. That race
 *     is unavoidable rather than a symptom, and one forced refresh plus replay
 *     removes it. A second 401 propagates.
 */

import { getAccessToken } from "./connections";
import { QuickBooksAuthError, QuickBooksError } from "./errors";
import { currentEnvironment } from "./oauth";
import type { AccountingBasis, AccountMeta } from "./types";

/** Minor versions 1–74 were retired 2025-08-01. Always send one explicitly. */
const MINOR_VERSION = "75";

function baseUrl(): string {
  return currentEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

/* ── the slices of Intuit's responses this module actually reads ── */

interface QboFault {
  Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[]; type?: string };
}

interface AccountResource {
  Id?: string;
  Name?: string;
  FullyQualifiedName?: string;
  AccountType?: string;
  AccountSubType?: string;
  Classification?: string;
  Active?: boolean;
}

interface CompanyInfoResource {
  CompanyName?: string;
  LegalName?: string;
  Country?: string;
  FiscalYearStartMonth?: string;
  CompanyAddr?: { CountrySubDivisionCode?: string };
}

export type CompanyInfo = {
  companyName: string;
  legalName: string;
  country: string;
  currency: string;
  /** 1–12. QuickBooks reports it as a month name. */
  fiscalYearStartMonth: number;
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function monthNumber(name: string | undefined): number {
  const index = MONTHS.indexOf((name ?? "").trim().toLowerCase());
  return index >= 0 ? index + 1 : 1;
}

function faultMessage(body: QboFault | null, status: number): { message: string; code: string } {
  const fault = body?.Fault?.Error?.[0];
  if (!fault) return { message: `HTTP ${status}`, code: `http_${status}` };
  const detail = fault.Detail ? ` — ${fault.Detail}` : "";
  return {
    message: `${fault.Message ?? "QuickBooks error"}${detail}`,
    code: fault.code ?? `http_${status}`,
  };
}

async function request<T>(
  realmId: string,
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const url = new URL(`${baseUrl()}/v3/company/${realmId}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("minorversion", MINOR_VERSION);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch (cause) {
    throw new QuickBooksError(
      `Could not reach QuickBooks: ${(cause as Error).message}`,
      503,
      "network_error",
      true,
    );
  }

  if (res.ok) return (await res.json()) as T;

  const body = (await res.json().catch(() => null)) as QboFault | null;
  const { message, code } = faultMessage(body, res.status);

  if (res.status === 401) {
    throw new QuickBooksAuthError(message, code);
  }
  if (res.status === 403) {
    // Not a revocation: the token is valid but this company or scope is off
    // limits. Marking it reconnect-required would be misleading.
    throw new QuickBooksError(
      `QuickBooks refused access to company ${realmId}: ${message}`,
      403,
      code,
      false,
    );
  }
  throw new QuickBooksError(
    message,
    res.status,
    code,
    res.status === 429 || res.status >= 500,
  );
}

/**
 * `bearer` short-circuits token resolution. The connect flow needs it: at the
 * moment the callback wants the company's name it holds a freshly minted token
 * but has not yet written the connection, so there is nothing in Firestore to
 * resolve. Writing a half-populated connection first, then reading it back,
 * would leave a broken row behind whenever this call failed.
 */
async function api<T>(
  realmId: string,
  path: string,
  params: Record<string, string> = {},
  bearer?: string,
): Promise<T> {
  const token = bearer ?? (await getAccessToken(realmId));
  try {
    return await request<T>(realmId, path, params, token);
  } catch (err) {
    if (!(err instanceof QuickBooksAuthError) || bearer) throw err;
    // See the header note: the token expired mid-flight. One forced refresh,
    // one replay, then give up — a second 401 means the connection is genuinely
    // dead, and looping would only bury that.
    const fresh = await getAccessToken(realmId);
    if (fresh === token) throw err;
    return request<T>(realmId, path, params, fresh);
  }
}

/* ────────────────────────── domain verbs ────────────────────────── */

/**
 * Called during the connect flow so a new client's company name, currency and
 * fiscal year populate themselves — nothing about onboarding should be typed in
 * by hand and drift from the books.
 */
export async function fetchCompanyInfo(
  realmId: string,
  bearer?: string,
): Promise<CompanyInfo> {
  const body = await api<{ CompanyInfo?: CompanyInfoResource & { Currency?: { value?: string } } }>(
    realmId,
    `/companyinfo/${realmId}`,
    {},
    bearer,
  );
  const info = body.CompanyInfo ?? {};
  return {
    companyName: info.CompanyName ?? "",
    legalName: info.LegalName ?? "",
    country: info.Country ?? "",
    currency: (info as { Currency?: { value?: string } }).Currency?.value ?? "USD",
    fiscalYearStartMonth: monthNumber(info.FiscalYearStartMonth),
  };
}

/**
 * The chart of accounts, paginated. Cached for 24h by accounts.ts — this is the
 * join table that lets ~150 different charts of accounts roll up into one set of
 * categories.
 *
 * MAXRESULTS caps at 1000 and a real client file can exceed it, so this pages
 * rather than silently truncating: a missing account doesn't error, it just
 * quietly lands in "uncategorised" forever.
 */
export async function fetchAccounts(realmId: string): Promise<AccountMeta[]> {
  const PAGE = 1000;
  const out: AccountMeta[] = [];

  for (let start = 1; ; start += PAGE) {
    const body = await api<{ QueryResponse?: { Account?: AccountResource[] } }>(realmId, "/query", {
      query: `SELECT * FROM Account STARTPOSITION ${start} MAXRESULTS ${PAGE}`,
    });
    const page = body.QueryResponse?.Account ?? [];
    for (const a of page) {
      if (!a.Id) continue;
      out.push({
        id: a.Id,
        name: a.Name ?? "",
        fullyQualifiedName: a.FullyQualifiedName || a.Name || "",
        accountType: a.AccountType ?? null,
        subType: a.AccountSubType ?? null,
        classification: a.Classification ?? null,
        active: a.Active !== false,
      });
    }
    if (page.length < PAGE) break;
  }

  return out;
}

/**
 * The profit & loss, summarised by month.
 *
 * Returns the RAW response — narrowing is parse.ts's job, and keeping the two
 * apart is what lets the parser be regression-tested against saved fixtures
 * without a network or a company file.
 *
 * Always `summarize_column_by=Months`: a P&L is entirely flows, so the monthly
 * columns can be re-sliced client-side to any sub-range exactly. One call
 * therefore backs every entry in the period selector. See periods.ts.
 */
export async function fetchProfitAndLoss(
  realmId: string,
  opts: { startDate: string; endDate: string; basis: AccountingBasis },
): Promise<unknown> {
  return api<unknown>(realmId, "/reports/ProfitAndLoss", {
    start_date: opts.startDate,
    end_date: opts.endDate,
    // SINGULAR. Intuit's enum is Total | Month | Week | Days | Quarter | Year |
    // Customers | Vendors | Classes | ... — "Months" is rejected outright with
    // "Invalid Enumeration", which is a generic 400 that names no parameter.
    // Note the RESPONSE header echoes it back as "Month" too.
    summarize_column_by: "Month",
    accounting_method: opts.basis === "cash" ? "Cash" : "Accrual",
  });
}
