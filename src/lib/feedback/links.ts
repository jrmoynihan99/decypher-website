/**
 * Links into the client feedback survey (/feedback).
 *
 * The query string is a contract with things outside this repo: TaxDome
 * automations paste these parameters into emails, and links already sent sit
 * in clients' inboxes. Add parameters freely; never rename one. The names are
 * the survey prototype's, kept so the automations built against it carry over
 * unchanged.
 *
 *   name / c     the client's name (c = first name only, older links)
 *   cid          TaxDome client ID: dedupes a round and joins rounds together
 *   rid          tax recap id, when the link came from a recap
 *   s            which survey: onb (default) · bk · tax · both
 *   bq           bookkeeping period, e.g. 2026-Q4 (defaults to this quarter)
 *   ty           tax year the returns were for (defaults to last year)
 *   esc          founder copied on at-risk follow-ups
 *   otl osr ost  onboarding team lead / senior / staff
 *   bkl bks      bookkeeping lead / support
 *   ts tm tsr tst  tax strategist / manager / senior / staff
 *
 * Isomorphic: the recap page (client) and the recap PDF (server) both build
 * these.
 */

export const FEEDBACK_PATH = "/feedback";

export const SURVEY_KINDS = ["onb", "bk", "tax", "both"] as const;
export type SurveyKind = (typeof SURVEY_KINDS)[number];

export const SURVEY_KIND_LABELS: Record<SurveyKind, string> = {
  onb: "Onboarding",
  bk: "Bookkeeping",
  tax: "Tax",
  both: "Bookkeeping + tax",
};

/** Lenient: unknown or missing means onboarding, as the prototype did. */
export function parseSurveyKind(raw: unknown): SurveyKind {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "bk" || s === "bookkeeping") return "bk";
  if (s === "tax") return "tax";
  if (s === "both") return "both";
  return "onb";
}

/** Team-member parameters, by the role they name. */
export const TEAM_PARAMS = {
  onboarding_team_lead_id: "otl",
  onboarding_senior_id: "osr",
  onboarding_staff_id: "ost",
  bookkeeping_lead_id: "bkl",
  bookkeeping_support_id: "bks",
  tax_strategist_id: "ts",
  tax_manager_id: "tm",
  tax_senior_id: "tsr",
  tax_staff_id: "tst",
} as const;
export type TeamRole = keyof typeof TEAM_PARAMS;

export type FeedbackLink = {
  kind: SurveyKind;
  /** Site origin with no trailing slash; "" for a same-site relative link. */
  origin?: string;
  name?: string;
  cid?: string;
  rid?: string;
  bq?: string;
  ty?: string | number;
  esc?: string;
  team?: Partial<Record<TeamRole, string>>;
};

export function feedbackHref(link: FeedbackLink): string {
  const q = new URLSearchParams();
  if (link.name?.trim()) q.set("name", link.name.trim());
  if (link.cid?.trim()) q.set("cid", link.cid.trim());
  if (link.rid?.trim()) q.set("rid", link.rid.trim());
  if (link.kind !== "onb") q.set("s", link.kind);
  if (link.bq?.trim() && link.kind !== "onb" && link.kind !== "tax") q.set("bq", link.bq.trim());
  if (link.ty != null && String(link.ty).trim() && (link.kind === "tax" || link.kind === "both")) {
    q.set("ty", String(link.ty).trim());
  }
  if (link.esc?.trim()) q.set("esc", link.esc.trim());
  for (const [role, param] of Object.entries(TEAM_PARAMS)) {
    const v = link.team?.[role as TeamRole]?.trim();
    if (v) q.set(param, v);
  }
  const qs = q.toString();
  return `${link.origin ?? ""}${FEEDBACK_PATH}${qs ? `?${qs}` : ""}`;
}

/**
 * Older links named four of the team parameters differently. Read as a
 * fallback when the current name is absent; never written.
 */
export const LEGACY_TEAM_PARAMS: Partial<Record<(typeof TEAM_PARAMS)[TeamRole], string>> = {
  otl: "lead",
  ost: "sup",
  bkl: "bk",
  ts: "tl",
};

/** The bookkeeping period a link without `bq` is about: this quarter, e.g. "2026-Q4". */
export function defaultQuarter(d = new Date()): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

/** The tax year a link without `ty` is about: last year. */
export function defaultTaxYear(d = new Date()): string {
  return String(d.getFullYear() - 1);
}

/** What a survey link says, read back off its query string. */
export type FeedbackLinkContext = {
  kind: SurveyKind;
  /** Prefill for the name field: `name`, else `c`. */
  name: string;
  /** For "Hi Maya": `c`, else the first word of `name`. */
  first: string;
  cid: string;
  rid: string;
  bq: string;
  ty: string;
  esc: string;
  /** Every role, "" where the link doesn't name anyone. */
  team: Record<TeamRole, string>;
  /**
   * A bare link (no name, client, recap or team) is staff trying the survey
   * out, not a client: its answers save as test data.
   */
  preview: boolean;
};

/**
 * Read a survey link. `get` is whatever the caller has — URLSearchParams.get
 * on the client, the page's searchParams on the server. Values are trimmed and
 * capped here for display; the submit route re-validates everything anyway.
 */
export function readFeedbackLink(
  get: (key: string) => string | null | undefined,
  now = new Date(),
): FeedbackLinkContext {
  const val = (k: string, max = 120) => (get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const name = val("name") || val("c");
  const team = {} as Record<TeamRole, string>;
  for (const [role, param] of Object.entries(TEAM_PARAMS) as [TeamRole, (typeof TEAM_PARAMS)[TeamRole]][]) {
    const legacy = LEGACY_TEAM_PARAMS[param];
    team[role] = val(param, 80) || (legacy ? val(legacy, 80) : "");
  }
  const named = [
    "c",
    "name",
    "cid",
    "rid",
    ...Object.values(TEAM_PARAMS),
    ...(Object.values(LEGACY_TEAM_PARAMS) as string[]),
  ].some((k) => val(k) !== "");
  return {
    kind: parseSurveyKind(get("s")),
    name,
    first: (val("c") || val("name").split(" ")[0] || "").trim(),
    cid: val("cid", 100),
    rid: val("rid", 200),
    bq: val("bq", 24) || defaultQuarter(now),
    ty: val("ty", 12) || defaultTaxYear(now),
    esc: val("esc", 80),
    team,
    preview: !named,
  };
}

/**
 * The Airtable forms the tax recap linked to before the survey moved in
 * house, mapped to the survey that replaced each. Recaps saved before the
 * move still carry these URLs in their next steps; they're rewritten at
 * render time rather than migrated, so a recap already in a client's inbox
 * opens the new survey too.
 */
const LEGACY_SURVEYS: Record<string, SurveyKind> = {
  "airtable.com/appMShCmmffsGuMbk/pagI4VCy5uheBp8l6": "tax",
  "airtable.com/appMShCmmffsGuMbk/pagobOu1R1lH1vmwx": "both",
};

/** Which survey an href points at, or null when it isn't one. */
export function surveyKindOfHref(href: string): SurveyKind | null {
  let url: URL;
  try {
    // A relative href is resolved against a dummy origin: only the path and
    // query matter here.
    url = new URL(href, "https://x.invalid");
  } catch {
    return null;
  }
  const legacyKey = `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/form\/?$/, "").replace(/\/+$/, "")}`;
  const legacy = LEGACY_SURVEYS[legacyKey];
  if (legacy) return legacy;
  if (url.pathname.replace(/\/+$/, "") === FEEDBACK_PATH) return parseSurveyKind(url.searchParams.get("s"));
  return null;
}

/**
 * A recap's survey link, made personal: the client's name, the tax year and
 * the recap it came from. Anything that isn't a survey link comes back as it
 * was. `origin` "" keeps the link on whichever host served the recap (right
 * for the page; the PDF passes its own origin, since a printed link has no
 * page to be relative to).
 */
export function recapSurveyHref(
  href: string,
  recap: { id: string; clientName: string; taxYear: number },
  origin = "",
): string {
  const kind = surveyKindOfHref(href);
  if (!kind) return href;
  return feedbackHref({
    kind,
    origin,
    name: recap.clientName,
    rid: recap.id,
    ty: recap.taxYear,
  });
}
