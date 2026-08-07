import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { PAGE_TYPES, slugToPath } from "@/sanity/queries";

/**
 * Sanity webhook → on-demand ISR. Pages otherwise revalidate daily
 * (`revalidate = 86400`) as a safety net; this makes publishes land
 * instantly.
 *
 * Configure the webhook in sanity.io/manage to POST the changed document
 * (projection: `{_id, _type, slug}`) to /api/revalidate with the
 * SANITY_REVALIDATE_SECRET as a Bearer token or ?secret= param.
 *
 * Strategy: a page edit purges that page's path. Everything else
 * (creators, testimonials, team, services, settings) renders on several
 * pages at once — with only five routes, a full purge is cheaper than
 * being clever.
 */

const PAGE_TYPE_SET = new Set<string>(PAGE_TYPES);

function revalidateForDoc(doc: {
  _type?: string;
  slug?: { current?: string } | string;
}): Record<string, unknown> {
  const type = doc?._type;
  const slug = typeof doc?.slug === "string" ? doc.slug : doc?.slug?.current;

  // Book a Call carries the headings every thank-you page shares and the
  // reference deciding where the form goes, so its edits fan out past its own
  // path — see the note on thankYouPage below for why that means a full purge.
  if (type === "schedulePage") {
    revalidatePath("/", "layout");
    return { strategy: "full-purge", type, reason: "shared by every thank-you page" };
  }

  if (type && PAGE_TYPE_SET.has(type) && typeof slug === "string" && slug) {
    const path = slugToPath(slug);
    revalidatePath(path);
    // slug edits change the prerendered route list too
    revalidatePath("/[...slug]", "page");
    return { strategy: "surgical", type, path };
  }

  // Its own fixed route, no slug — the default full purge below would work,
  // but this page is edited often enough during a campaign to be worth the
  // surgical path.
  if (type === "leaderboardPage") {
    revalidatePath("/leaderboard");
    return { strategy: "surgical", type, path: "/leaderboard" };
  }

  // Legal pages route under /legal/, so slugToPath would send "privacy" to
  // "/privacy" and purge nothing that exists.
  if (type === "legalPage" && typeof slug === "string" && slug) {
    const path = `/legal/${slug}`;
    revalidatePath(path);
    revalidatePath("/legal/[slug]", "page");
    return { strategy: "surgical", type, path };
  }

  /**
   * Thank-you pages can't be purged surgically, for a reason worth writing
   * down: adding one changes a second page as well. The booking form only
   * honours a `?ty=` naming a route that exists, and it checks that against a
   * list baked into the prerendered Book a Call page — so until that page is
   * regenerated, a brand-new campaign silently books to the default instead.
   *
   * The obvious surgical move, revalidatePath("/[...slug]", "page"), does not
   * reach prerendered instances of a catch-all route (verified against Next
   * 16.2.10 — the page kept serving the stale list until a layout purge).
   * Naming "/schedule-team" outright would work until someone renames that
   * route in the Studio, at which point it breaks silently.
   *
   * So: the same full purge the collections take, for the same stated reason —
   * with this few routes it is cheaper than being clever, and campaign pages
   * are created a handful of times a month.
   */
  if (type === "thankYouPage") {
    revalidatePath("/", "layout");
    return {
      strategy: "full-purge",
      type,
      reason: "route list is embedded in the booking page",
    };
  }

  revalidatePath("/", "layout");
  return { strategy: "full-purge", type: type ?? null };
}

export async function POST(request: NextRequest) {
  const secret = process.env.SANITY_REVALIDATE_SECRET;

  if (!secret) {
    return NextResponse.json(
      { revalidated: false, message: "Server missing SANITY_REVALIDATE_SECRET" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const provided = bearer || request.nextUrl.searchParams.get("secret");

  if (provided !== secret) {
    return NextResponse.json(
      { revalidated: false, message: "Invalid secret" },
      { status: 401 },
    );
  }

  let doc: { _type?: string; slug?: { current?: string } | string } = {};
  try {
    doc = await request.json();
  } catch {
    // no/invalid body — treat as a request to refresh everything
  }

  const revalidated = revalidateForDoc(doc);
  return NextResponse.json({ revalidated, now: Date.now() });
}
