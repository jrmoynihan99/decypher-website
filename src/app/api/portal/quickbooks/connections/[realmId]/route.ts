import { NextResponse, type NextRequest } from "next/server";
import { listPnlAccounts } from "@/lib/quickbooks/accounts";
import { resolveCategory } from "@/lib/quickbooks/categories";
import {
  disableConnection,
  getConnection,
  peekRefreshToken,
  setDisplayName,
} from "@/lib/quickbooks/connections";
import { revokeToken } from "@/lib/quickbooks/oauth";
import { getOverrides } from "@/lib/quickbooks/overrides";
import { REALM_ID_RE, guard } from "../../_guard";

/**
 * One company: its chart of accounts as the mapping screen sees it (GET),
 * a display-name edit (PATCH), and disconnect (DELETE).
 */

async function resolve(params: Promise<{ realmId: string }>) {
  const { realmId } = await params;
  if (!REALM_ID_RE.test(realmId)) {
    return NextResponse.json({ ok: false, message: "Invalid company id" }, { status: 400 });
  }
  const connection = await getConnection(realmId);
  if (!connection) {
    return NextResponse.json({ ok: false, message: "Not connected" }, { status: 404 });
  }
  return connection;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ realmId: string }> },
) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const connection = await resolve(params);
  if (connection instanceof NextResponse) return connection;

  try {
    const [accounts, overrides] = await Promise.all([
      listPnlAccounts(connection.realmId),
      getOverrides(connection.realmId),
    ]);

    // Resolved here rather than in the browser so the mapping screen and the
    // parser can never disagree about where an account currently lands —
    // they're calling the same function over the same inputs.
    const mapped = accounts.map((account) => {
      const side = account.classification === "Revenue" ? "income" : "expense";
      return {
        ...account,
        side,
        category: resolveCategory(account.id, account, overrides, side),
        pinned: Boolean(overrides.byAccount[account.id]),
      };
    });

    return NextResponse.json({ ok: true, connection, accounts: mapped, overrides });
  } catch (err) {
    console.error(`[quickbooks] account list failed for ${connection.realmId}:`, err);
    return NextResponse.json(
      { ok: false, message: "Couldn't load this company's chart of accounts." },
      { status: 502 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ realmId: string }> },
) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const connection = await resolve(params);
  if (connection instanceof NextResponse) return connection;

  let displayName = "";
  try {
    const body = await request.json();
    displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  } catch {
    // falls through to the validation below
  }
  if (!displayName || displayName.length > 120) {
    return NextResponse.json(
      { ok: false, message: "Give the company a name between 1 and 120 characters." },
      { status: 400 },
    );
  }

  await setDisplayName(connection.realmId, displayName);
  return NextResponse.json({ ok: true, displayName });
}

/**
 * Disconnect. The document is kept — the firm wants the history, and snapshots
 * reference it — but the credentials are dropped and revoked at Intuit.
 *
 * Revoking matters: without it our refresh token stays live on the client's
 * account for ~101 days after we stop using it. It's best-effort, though; a
 * failure there must not block the local disconnect, or staff can be left
 * unable to remove a connection precisely when it's already unreachable.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ realmId: string }> },
) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  const connection = await resolve(params);
  if (connection instanceof NextResponse) return connection;

  const token = await peekRefreshToken(connection.realmId).catch(() => null);
  const revoked = token ? await revokeToken(token) : false;
  await disableConnection(connection.realmId, session.email);

  if (token && !revoked) {
    console.warn(
      `[quickbooks] disconnected ${connection.realmId} locally but Intuit did not confirm revocation.`,
    );
  }
  return NextResponse.json({ ok: true, revoked });
}
