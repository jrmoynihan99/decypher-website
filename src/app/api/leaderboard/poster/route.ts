import { NextResponse } from "next/server";

/**
 * Poster frames for the leaderboard's creator posts.
 *
 * WHY THIS EXISTS: `instagram.com/p/<code>/media/` serves the post's image
 * without login, but with a cross-origin resource policy — pointing an <img>
 * at it directly from our page fails with
 * `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` (verified in-browser). CORP only
 * governs *browser* fetches, so the same request made server-side returns the
 * JPEG fine. This route is that one hop.
 *
 * NOT A GENERAL PROXY. The upstream URL is built here from a validated
 * short-code against one hard-coded host — a caller cannot supply a URL, so
 * there's no SSRF surface. Keep it that way.
 *
 * Cached hard: the poster for a given post never changes, and the underlying
 * CDN address is a signed URL that expires, so re-resolving through this
 * redirect is what keeps it alive. Public route by design — the page it feeds
 * is public.
 */

/** Instagram short-codes are base64url-ish and about 11 characters. */
const CODE_RE = /^[A-Za-z0-9_-]{5,32}$/;

const SIZES = new Set(["t", "m", "l"]);

// Instagram serves a different (or no) response to an unrecognised agent.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const code = params.get("code") ?? "";
  const size = params.get("size") ?? "m";

  if (!CODE_RE.test(code) || !SIZES.has(size)) {
    return NextResponse.json({ ok: false, message: "Bad request" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://www.instagram.com/p/${code}/media/?size=${size}`,
      {
        headers: { "User-Agent": UA, Accept: "image/*" },
        redirect: "follow",
        // Next's own fetch cache would try to store the bytes; the CDN layer
        // below (Cache-Control) is the right place for that.
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !type.startsWith("image/")) {
    // 404 rather than an error page: the client's <img> onError swaps in the
    // text chip, which is the right outcome for a deleted or private post.
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
