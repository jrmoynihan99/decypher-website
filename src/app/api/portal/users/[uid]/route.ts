import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb, isConfigured } from "@/lib/firebase/admin";
import { getSession } from "@/lib/firebase/session";
import { parsePermissions, type PermissionKey } from "@/lib/permissions";

/**
 * Mutations on a single staff member: change role, suspend/restore, delete, and
 * re-issue an invite link when the last one expired before they used it.
 *
 * Every branch refuses to act on the caller themselves. An admin demoting or
 * deleting their own account could leave the portal with no admin and no way in
 * except the CLI script, so the UI hides those controls and this rejects them.
 */

type Ctx = { params: Promise<{ uid: string }> };

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

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const { uid } = await params;
  if (uid === session.uid) {
    return NextResponse.json(
      { ok: false, message: "You can't change your own role or access" },
      { status: 400 },
    );
  }

  const patch: {
    role?: "admin" | "staff";
    disabled?: boolean;
    permissions?: PermissionKey[];
  } = {};
  try {
    const body = await request.json();
    if (body?.role === "admin" || body?.role === "staff") patch.role = body.role;
    if (typeof body?.disabled === "boolean") patch.disabled = body.disabled;
    // parsePermissions returns null when the field wasn't sent (leave alone)
    // and an array — possibly empty, that's "no tabs" — when it was.
    const perms = parsePermissions(body?.permissions);
    if (perms !== null) patch.permissions = perms;
  } catch {
    // falls through to the empty-patch check
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json(
      { ok: false, message: "Nothing to update" },
      { status: 400 },
    );
  }

  try {
    await adminDb().collection("users").doc(uid).update(patch);

    if (patch.disabled !== undefined) {
      // Mirror onto the Auth record so the account can't mint new ID tokens,
      // then kill any session cookie already out there. Without the revoke,
      // a suspended user would keep their existing session until it expired.
      await adminAuth().updateUser(uid, { disabled: patch.disabled });
      if (patch.disabled) await adminAuth().revokeRefreshTokens(uid);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Could not update the account" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const { uid } = await params;
  if (uid === session.uid) {
    return NextResponse.json(
      { ok: false, message: "You can't delete your own account" },
      { status: 400 },
    );
  }

  try {
    await adminAuth().deleteUser(uid);
    await adminDb().collection("users").doc(uid).delete();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Could not delete the account" },
      { status: 500 },
    );
  }
}

/** Re-issue an invite link — reset links expire, new hires get distracted. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const { uid } = await params;

  try {
    const user = await adminAuth().getUser(uid);
    if (!user.email) {
      return NextResponse.json(
        { ok: false, message: "That account has no email" },
        { status: 400 },
      );
    }
    const link = await adminAuth().generatePasswordResetLink(user.email, {
      url: `${request.nextUrl.origin}/portal/login`,
      handleCodeInApp: false,
    });
    return NextResponse.json({ ok: true, inviteLink: link });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Could not generate an invite link" },
      { status: 500 },
    );
  }
}
