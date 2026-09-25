import { NextResponse } from "next/server";
import { gate } from "../../_gate";
import { sanitizeYearCard, seedFor, validateYearCard } from "@/lib/tax-recap/tables";
import { TaxTablesStoreError, deleteYear, putYear } from "@/lib/tax-recap/tables-store";

/**
 * Save or drop one tax year's tables (federal + every state card).
 *
 *   PUT    { card: YearCard }   validated whole; a card with any problem is
 *                               refused with the list, nothing partial lands
 *   DELETE                      falls the year back to the seed in tables.ts
 *
 * Same gate as the recap tool. A wrong number here can't reach a client
 * silently — the engine refuses a card that doesn't reproduce a return's own
 * tax — but it can stop every derivation for a year, so the Tax Tables page
 * proves a draft against the saved recaps before it lets you save.
 */

function yearOf(raw: string): number | null {
  const y = Number(raw);
  return Number.isInteger(y) && y >= 2015 && y <= 2040 ? y : null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ year: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;

  const year = yearOf((await params).year);
  if (!year) return NextResponse.json({ ok: false, message: "Bad tax year" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
  const card = sanitizeYearCard((body as { card?: unknown } | null)?.card, seedFor(year));
  const problems = validateYearCard(card);
  if (problems.length) {
    return NextResponse.json(
      { ok: false, message: "The tables have problems", problems },
      { status: 400 },
    );
  }

  try {
    const stored = await putYear(year, card, session.email);
    return NextResponse.json({ ok: true, stored });
  } catch (e) {
    if (e instanceof TaxTablesStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tax-recap] tables save failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't save" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const session = await gate();
  if (session instanceof NextResponse) return session;

  const year = yearOf((await params).year);
  if (!year) return NextResponse.json({ ok: false, message: "Bad tax year" }, { status: 400 });

  try {
    await deleteYear(year);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TaxTablesStoreError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    console.error("[tax-recap] tables delete failed:", e);
    return NextResponse.json({ ok: false, message: "Couldn't delete" }, { status: 500 });
  }
}
