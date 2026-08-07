import "server-only";
import { adminDb, isConfigured } from "@/lib/firebase/admin";
import { getCreators } from "@/sanity/queries";
import { DEAL_STATUS_META, matchReferrer } from "./options";
import type { DealStatus } from "./options";

/**
 * The public leaderboard's data — aggregated fresh from `salesCalls` and
 * `salesReferrers`, which the portal's Referrals tab edits. This is why the
 * page needs no manual entry screen: closing a referral in the Deal Desk IS
 * the leaderboard update.
 *
 * Everything here is chosen for a PUBLIC page:
 * - Only partners with `showOnLeaderboard` (and at least one closed referral)
 *   appear. The toggle lives in the portal's referrer manager.
 * - Per-partner CLOSED COUNT and EARNINGS are published — matching the widget
 *   the client approved, which showed both.
 * - No lead names, emails, or anything about the people referred.
 *
 * Photos resolve in two steps: an explicit `sanityCreatorId` on the referrer
 * doc wins; otherwise a conservative name/alias match against the Sanity
 * roster (the same matcher the grid uses for Calendly answers). A miss shows
 * initials, exactly like the widget this replaces.
 */

import {
  HAWAII_THRESHOLD,
  type LeaderboardData,
  type LeaderboardEntry,
} from "./leaderboard-types";

export type { LeaderboardData, LeaderboardEntry };
export { HAWAII_THRESHOLD };

const counts = (status: unknown): boolean =>
  typeof status === "string" &&
  Boolean(DEAL_STATUS_META[status as DealStatus]?.counts);

export async function getLeaderboard(): Promise<LeaderboardData> {
  if (!isConfigured()) return { entries: [], totals: { partners: 0, closed: 0, earned: 0, hawaii: 0 } };

  const db = adminDb();
  const [callsSnap, referrersSnap, creators] = await Promise.all([
    db.collection("salesCalls").where("isReferral", "==", true).get(),
    db.collection("salesReferrers").get(),
    getCreators().catch(() => []),
  ]);

  /* Aggregate closed referrals per referrerId. */
  const byId = new Map<string, { closed: number; earned: number }>();
  for (const doc of callsSnap.docs) {
    const d = doc.data();
    if (d.archived || !d.referrerId || !counts(d.status)) continue;
    const hit = byId.get(d.referrerId) ?? { closed: 0, earned: 0 };
    hit.closed += 1;
    hit.earned += typeof d.partnerCommission === "number" ? Math.round(d.partnerCommission) : 0;
    byId.set(d.referrerId, hit);
  }

  const entries: LeaderboardEntry[] = [];
  for (const doc of referrersSnap.docs) {
    const d = doc.data();
    if (d.showOnLeaderboard === false || d.active === false) continue;
    const agg = byId.get(doc.id);
    if (!agg || agg.closed === 0) continue;

    const name: string = d.name ?? doc.id;
    const aliases: string[] = Array.isArray(d.aliases) ? d.aliases : [];

    let photo: string | null = null;
    if (typeof d.sanityCreatorId === "string" && d.sanityCreatorId) {
      photo = creators.find((c) => c.id === d.sanityCreatorId)?.img ?? null;
    }
    if (!photo) {
      // Same conservative matcher the grid uses — the roles are swapped (the
      // "answer" is the partner's name, the roster is Sanity), which it
      // handles because it normalises and substring-matches both directions.
      const match = matchReferrer(
        name,
        creators.map((c) => ({ id: c.id, name: c.name, aliases: [] })),
      );
      if (!match) {
        for (const alias of aliases) {
          const hit = matchReferrer(alias, creators.map((c) => ({ id: c.id, name: c.name })));
          if (hit) {
            photo = creators.find((c) => c.id === hit.id)?.img ?? null;
            break;
          }
        }
      } else {
        photo = creators.find((c) => c.id === match.id)?.img ?? null;
      }
    }

    entries.push({ id: doc.id, name, photo, closed: agg.closed, earned: agg.earned, place: 0 });
  }

  entries.sort(
    (a, b) => b.closed - a.closed || b.earned - a.earned || a.name.localeCompare(b.name),
  );
  entries.forEach((e, i) => {
    e.place = i + 1;
  });

  return {
    entries,
    totals: {
      partners: entries.length,
      closed: entries.reduce((s, e) => s + e.closed, 0),
      earned: entries.reduce((s, e) => s + e.earned, 0),
      hawaii: entries.filter((e) => e.closed >= HAWAII_THRESHOLD).length,
    },
  };
}
