import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb, isConfigured } from "@/lib/firebase/admin";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  getSession,
} from "@/lib/firebase/session";

/**
 * Trades a freshly-minted Firebase ID token for an httpOnly session cookie.
 *
 * The ID token arrives in the POST *body*, never a cookie — which is what makes
 * this endpoint CSRF-safe by construction. A malicious site can make your
 * browser send a request here, but it can't produce a valid ID token to put in
 * it, and the browser won't hand it one.
 */

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function POST(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Server missing Firebase credentials" },
      { status: 500 },
    );
  }

  let idToken = "";
  try {
    const body = await request.json();
    idToken = typeof body?.idToken === "string" ? body.idToken : "";
  } catch {
    // no/invalid body — falls through to the empty-token check below
  }

  if (!idToken) {
    return NextResponse.json(
      { ok: false, message: "Missing idToken" },
      { status: 400 },
    );
  }

  try {
    const decoded = await adminAuth().verifyIdToken(idToken, true);

    // Only mint a session from a token that was issued for a sign-in that just
    // happened. Firebase's own guidance — it shrinks the window in which a
    // leaked ID token is worth anything to days-long session cookie.
    const ageSeconds = Date.now() / 1000 - decoded.auth_time;
    if (ageSeconds > 5 * 60) {
      return NextResponse.json(
        { ok: false, message: "Sign-in is stale — please try again" },
        { status: 401 },
      );
    }

    // Firebase Auth knowing who you are is necessary but not sufficient: you're
    // only staff if an admin provisioned a user record for you. This is what
    // makes the portal invite-only even though Firebase would happily
    // authenticate any account that exists in the project.
    const snap = await adminDb().collection("users").doc(decoded.uid).get();
    const data = snap.exists ? snap.data() : null;

    if (!data || data.disabled) {
      return NextResponse.json(
        { ok: false, message: "This account does not have portal access" },
        { status: 403 },
      );
    }

    const sessionCookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, sessionCookie, {
      ...cookieOptions,
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Could not verify sign-in" },
      { status: 401 },
    );
  }
}

/** Sign out: revoke server-side, then drop the cookie. */
export async function DELETE() {
  const session = await getSession();

  if (session) {
    try {
      // Kills every session for this user everywhere, not just this browser —
      // the right default for "I think I left myself signed in somewhere".
      await adminAuth().revokeRefreshTokens(session.uid);
    } catch {
      // Best-effort; clearing the cookie below is what the user actually asked for.
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
