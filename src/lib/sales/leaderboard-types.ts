/**
 * Client-safe half of the leaderboard: the wire shape and the program
 * constants the page renders. lib/sales/leaderboard.ts is `server-only`
 * (Admin SDK), so the client board imports from here instead.
 */

export const HAWAII_THRESHOLD = 10;
/** What the program advertises per closed bookkeeping referral. */
export const PARTNER_REWARD = 750;
export const REFEREE_CREDIT = 250;

export interface LeaderboardEntry {
  /** Referrer doc id — a slug of the name, safe to expose. */
  id: string;
  name: string;
  photo: string | null;
  closed: number;
  /** Dollars earned across closed referrals — partner share only. */
  earned: number;
  place: number;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  totals: {
    partners: number;
    closed: number;
    earned: number;
    hawaii: number;
  };
}
