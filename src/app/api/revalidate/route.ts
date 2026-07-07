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

  if (type && PAGE_TYPE_SET.has(type) && typeof slug === "string" && slug) {
    const path = slugToPath(slug);
    revalidatePath(path);
    // slug edits change the prerendered route list too
    revalidatePath("/[...slug]", "page");
    return { strategy: "surgical", type, path };
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
