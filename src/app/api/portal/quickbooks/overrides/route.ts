import { NextResponse, type NextRequest } from "next/server";
import { parseCategoryKey } from "@/lib/quickbooks/categories";
import { setAccountOverride, setSubTypeOverride } from "@/lib/quickbooks/overrides";
import { REALM_ID_RE, guard } from "../_guard";

/**
 * Category mapping writes.
 *
 * Two scopes, because the firm makes two different kinds of decision:
 *
 *   scope "account"  — this ONE client's "YT Money" is platform revenue
 *   scope "subtype"  — DuesSubscriptions is software, for every client at once
 *
 * The subtype scope is what stops onboarding from being the same decision made
 * 150 times. The account scope is what makes revenue usable at all, since
 * QuickBooks cannot distinguish AdSense from a brand deal from merch.
 *
 * A null category clears the override and falls back to the built-in map.
 * Changes take effect on the next sync for that company — the stored snapshot
 * holds already-resolved categories.
 */
export async function POST(request: NextRequest) {
  const session = await guard();
  if (session instanceof NextResponse) return session;

  let body: {
    scope?: unknown;
    realmId?: unknown;
    accountId?: unknown;
    subType?: unknown;
    category?: unknown;
  } = {};
  try {
    body = await request.json();
  } catch {
    // falls through to validation
  }

  // `null` is meaningful (clear the override) and must survive validation,
  // which is why this doesn't collapse to a truthiness check.
  const category = body.category === null ? null : parseCategoryKey(body.category);
  if (body.category !== null && category === null) {
    return NextResponse.json({ ok: false, message: "Unknown category" }, { status: 400 });
  }

  if (body.scope === "subtype") {
    const subType = typeof body.subType === "string" ? body.subType.trim() : "";
    if (!subType || subType.length > 64) {
      return NextResponse.json({ ok: false, message: "Missing account subtype" }, { status: 400 });
    }
    await setSubTypeOverride(subType, category);
    return NextResponse.json({ ok: true, scope: "subtype", subType, category });
  }

  if (body.scope === "account") {
    const realmId = typeof body.realmId === "string" ? body.realmId : "";
    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!REALM_ID_RE.test(realmId)) {
      return NextResponse.json({ ok: false, message: "Invalid company id" }, { status: 400 });
    }
    if (!accountId || accountId.length > 64) {
      return NextResponse.json({ ok: false, message: "Missing account id" }, { status: 400 });
    }
    await setAccountOverride(realmId, accountId, category);
    return NextResponse.json({ ok: true, scope: "account", realmId, accountId, category });
  }

  return NextResponse.json(
    { ok: false, message: 'scope must be "account" or "subtype"' },
    { status: 400 },
  );
}
