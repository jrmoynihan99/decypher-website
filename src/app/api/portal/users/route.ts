import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb, isConfigured } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { generateInviteLink, listStaff } from "@/lib/firebase/users";
import { PERMISSION_KEYS, parsePermissions, type PermissionKey } from "@/lib/permissions";

/**
 * Staff roster. Admin-only, and re-checked here rather than trusted from the
 * proxy or the calling page — a route handler is reachable directly over HTTP,
 * so its own gate is the only one that counts.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function guard() {
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Server missing Firebase credentials" },
      { status: 500 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, message: "Admins only" }, { status: 403 });
  }
  return session;
}

export async function GET() {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  return NextResponse.json({ ok: true, users: await listStaff() });
}

export async function POST(request: NextRequest) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  let email = "";
  let displayName = "";
  let role: "admin" | "staff" = "staff";
  let permissions: PermissionKey[] | null = null;
  try {
    const body = await request.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    role = body?.role === "admin" ? "admin" : "staff";
    permissions = parsePermissions(body?.permissions);
  } catch {
    // falls through to validation below
  }

  if (!EMAIL_RE.test(email) || !displayName) {
    return NextResponse.json(
      { ok: false, message: "A name and a valid email are required" },
      { status: 400 },
    );
  }

  // No password is set here — deliberately. The account is created in a state
  // nobody can sign into, and the invite link below is the only way to give it
  // one. That means an admin never knows a colleague's password and there's no
  // temporary credential to leak in a chat log.
  let uid: string;
  try {
    const user = await adminAuth().createUser({ email, displayName, emailVerified: false });
    uid = user.uid;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/email-already-exists") {
      return NextResponse.json(
        { ok: false, message: "That email already has an account" },
        { status: 409 },
      );
    }
    console.error("[portal] createUser failed", err);
    return NextResponse.json(
      { ok: false, message: failureMessage("Could not create the account", code) },
      { status: 500 },
    );
  }

  // Past this point an Auth account exists. Anything that goes wrong now has to
  // undo it — a half-made account is worse than none, because it isn't usable
  // and it makes the retry fail with "that email already has an account".
  try {
    await adminDb().collection("users").doc(uid).set({
      email,
      displayName,
      role,
      // Always stored explicitly on new accounts — the absent-field state is
      // reserved for docs that predate permissions (it means "everything").
      // A request without the field defaults to everything, not nothing.
      permissions: permissions ?? [...PERMISSION_KEYS],
      disabled: false,
      createdAt: new Date(),
      createdBy: session.email,
    });

    const link = await generateInviteLink(email);

    return NextResponse.json({ ok: true, uid, inviteLink: link });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    console.error("[portal] rolling back half-created account", email, err);
    await adminAuth().deleteUser(uid).catch(() => {});
    await adminDb().collection("users").doc(uid).delete().catch(() => {});
    return NextResponse.json(
      { ok: false, message: failureMessage("Could not create the account", code) },
      { status: 500 },
    );
  }
}

/** Admin-only surface, so the raw Firebase code goes to the person who can act
 *  on it rather than dying in a log nobody reads. */
function failureMessage(prefix: string, code?: string) {
  return code ? `${prefix} (${code})` : `${prefix} — check the server logs`;
}
