import "server-only";
import { cache } from "react";
import { listCreatorFinances } from "./snapshots";
import { primaryBucket } from "./aggregate";
import { monthRange } from "./periods";
import type { CreatorFinanceRow, MoneyCents } from "./types";
import type { SiteSettings, StatContent } from "@/sanity/types";

/**
 * Live figures for the public marketing stats.
 *
 * The stat values on Home / Book a Call / Thank You are Sanity content, which
 * is right for most of them ("48-hour turnaround") — but the revenue number is
 * a fact we already hold, and a hand-typed one goes stale the day it's typed.
 *
 * Rather than a second stats system, an editor writes a TOKEN as the stat's
 * value — `{{creatorRevenue}}` — and this resolves it server-side. Any stat
 * without a token passes through untouched, so nothing existing breaks and the
 * feature is opt-in per card from the Studio.
 *
 * Failure is deliberately soft: if QuickBooks data can't be read, the token'd
 * stat is DROPPED rather than rendered as "$0" or as the raw token. A missing
 * card is a smaller lie than a wrong number on a marketing page.
 */

/** Tokens an editor may put in a Site Settings stat value. */
export const STAT_TOKENS = ["{{creatorRevenue}}"] as const;

const TOKEN_RE = /\{\{\s*creatorRevenue\s*\}\}/i;

export function hasLiveToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

/**
 * Compact money, in the shape StatsGrid can animate.
 *
 * StatsGrid splits a value on /^(\D*)([\d.]+)(.*)$/ and rolls the numeric part
 * up from zero, so a comma-grouped "$4,600,000" would parse as 4 and animate
 * through "$0,600,000". "$4.6M+" rolls correctly — same constraint the
 * leaderboard page documents.
 */
function compactUsd(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) {
    // One decimal, trailing .0 trimmed: "$4.6M+", "$12M+".
    const m = dollars / 1_000_000;
    return `$${m >= 10 ? Math.floor(m) : m.toFixed(1).replace(/\.0$/, "")}M+`;
  }
  if (dollars >= 1000) return `$${Math.floor(dollars / 1000)}K+`;
  return `$${Math.round(dollars)}`;
}

/**
 * One Firestore read serves every public consumer in a render. The home page
 * resolves the stat token AND builds the revenue graph from the same payload;
 * without this, that's two full snapshot reads per request. React's cache() is
 * per-render, which is exactly right — the ISR page caches the result anyway.
 */
const allTimeFinances = cache(() => listCreatorFinances("all-time", "accrual"));

/**
 * Total income across every connected creator, all time, in cents.
 *
 * "All time" is the sync window — see HISTORY_YEARS in periods.ts. Currency
 * safety comes from primaryBucket: aggregateRows never sums across currencies,
 * so this is the home-currency total, not a mixed one.
 *
 * Returns null when nothing readable exists, which the caller treats as
 * "drop the card".
 */
export async function creatorLifetimeRevenueCents(): Promise<number | null> {
  try {
    const payload = await allTimeFinances();
    if (!payload.rows.length) return null;
    const bucket = primaryBucket(payload.aggregate);
    return bucket.count > 0 && bucket.income > 0 ? bucket.income : null;
  } catch (e) {
    console.error("[public-stats] couldn't read creator revenue:", e);
    return null;
  }
}

/* ───────────────────── the revenue-over-time series ───────────────────── */

/** One month on the public revenue graph. */
export type RevenuePoint = {
  /** "2026-07" — MonthKey. */
  month: string;
  /** Income across every readable creator that month. Can be negative. */
  income: MoneyCents;
  /** Cumulative income through this month — the line the graph draws. */
  total: MoneyCents;
};

/**
 * One REAL income event for the replay ticker: a single creator's total for
 * one label in one month, straight off their revenue-stream line items.
 * Deliberately anonymous — amount and label only, never a name or realmId:
 * these render on the public home page.
 */
export type ReplayEvent = {
  amountCents: MoneyCents;
  /** From TICKER_VOCAB — a fixed vocabulary, never raw account text. */
  label: string;
};

/**
 * Ticker labels come from the account NAMES, not the category map. QuickBooks'
 * AccountSubType can't tell a brand deal from merch — $2.9M of one month's
 * income sits in SalesOfProductIncome, which the subtype map can only call
 * "merch" even when the account is literally named "Sponsorships". The names
 * are the better ground truth, but they're client-authored, so they never
 * reach the page verbatim: they select from this fixed vocabulary, and a name
 * that matches nothing becomes the neutral truth, "Creator income".
 *
 * (The systemic fix for the PORTAL's breakdown is the category-mapping tab —
 * once the firm maps accounts there, item.category improves for everyone.)
 */
const TICKER_VOCAB: [RegExp, string][] = [
  [/sponsor|brand|partner|collab|\bdeal/i, "Brand deals"],
  [/affiliate|commission|referral/i, "Affiliate"],
  [/adsense|ad revenue|advertis|youtube|twitch|tiktok|instagram|facebook|meta|snapchat|spotify|platform|monetiz|creator fund|shorts/i, "Platform revenue"],
  [/merch|apparel|clothing|shopify|store|product/i, "Merch & products"],
  [/subscription|membership|patreon|onlyfans|substack|\bfan/i, "Fan subscriptions"],
  [/course|coaching|consult|training|speaking|service/i, "Services & coaching"],
  [/licens|royalt|sync/i, "Licensing & royalties"],
];

function tickerLabel(accountName: string): string {
  for (const [re, label] of TICKER_VOCAB) if (re.test(accountName)) return label;
  return "Creator income";
}

export type ReplayMonth = {
  /** MonthKey, matching a tail entry of RevenueTimeline.points. */
  month: string;
  /** The point's income for this month — the amount the replay must deliver. */
  incomeCents: MoneyCents;
  /** Largest creator×category amounts, shown as ticker chips. */
  featured: ReplayEvent[];
  /** incomeCents minus the featured — accrues silently between chips. */
  backgroundCents: MoneyCents;
  /** How many creator×category entries the background folds together. */
  backgroundCount: number;
};

/**
 * The "recent activity" replay: the tail months of the series, decomposed into
 * per-creator per-category amounts so the client can re-earn them as a ticker.
 * Everything sums exactly — anchor total + every month's incomeCents lands on
 * RevenueTimeline.totalCents to the cent.
 */
export type RevenueReplay = {
  /** Index into points of the last point BEFORE the replay window. */
  anchorIndex: number;
  months: ReplayMonth[];
};

export type RevenueTimeline = {
  points: RevenuePoint[];
  /** The last point's total — what the tip chip settles on. */
  totalCents: MoneyCents;
  currency: string;
  /** Creators whose books are actually counted — render it, never imply it. */
  creatorCount: number;
  /** Most recent snapshot sync among counted rows, ISO. */
  updatedAt: string | null;
  /** Null when the tail months can't support an honest replay. */
  replay: RevenueReplay | null;
};

/** Ticker chips per replay month. More than this reads as noise, not proof. */
const FEATURED_PER_MONTH = 24;
/** How many tail months the replay re-earns (current partial month included). */
const REPLAY_MONTHS = 2;
/** Points that must remain BEFORE the window, so the intro still has a story. */
const MIN_HISTORY_POINTS = 3;

/**
 * Decompose the tail months into the replay payload.
 *
 * Events are creator×category×month sums over income-side line items — real
 * figures from real books. The reconciliation quirk: leaf sums can differ from
 * the month's headline income (QuickBooks surfaces unapplied amounts that
 * aren't leaves — same reason snapshot totals follow QB's summary rows). The
 * month's incomeCents is the truth the line must land on, so featured events
 * are trimmed to never exceed it and the remainder becomes background accrual.
 */
function buildReplay(
  points: RevenuePoint[],
  rows: CreatorFinanceRow[],
  currency: string,
): RevenueReplay | null {
  const n = points.length;
  if (n < MIN_HISTORY_POINTS + 1) return null;

  // The window is the contiguous tail. A zero month is fine (a quick, silent
  // sweep — a partial month can genuinely hold $0 yet) but a NEGATIVE month
  // would force the ticker to un-earn money, so the window starts after the
  // last one of those.
  let start = Math.max(MIN_HISTORY_POINTS, n - REPLAY_MONTHS);
  for (let i = start; i < n; i++) if (points[i].income < 0) start = i + 1;
  if (start >= n) return null;
  const tail = points.slice(start);
  if (tail.reduce((s, p) => s + p.income, 0) <= 0) return null;
  const anchorIndex = start - 1;

  const months: ReplayMonth[] = [];
  for (const point of tail) {
    // creator×label totals for this month, across every counted row
    const byCreatorLabel = new Map<string, ReplayEvent>();
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (row.connection === "disabled") continue;
      if (row.dataStatus !== "ok" || !row.data) continue;
      if (row.data.currency !== currency) continue;
      const idx = row.data.months.indexOf(point.month);
      if (idx === -1) continue;
      for (const item of row.data.revenueStreams) {
        const amount = item.monthly[idx] ?? 0;
        if (amount <= 0) continue;
        const label = tickerLabel(item.name);
        const key = `${r}:${label}`;
        const existing = byCreatorLabel.get(key);
        if (existing) existing.amountCents += amount;
        else byCreatorLabel.set(key, { amountCents: amount, label });
      }
    }

    const candidates = [...byCreatorLabel.values()].sort(
      (a, b) => b.amountCents - a.amountCents,
    );
    const featured = candidates.slice(0, FEATURED_PER_MONTH);
    // Never promise more in chips than the month actually made.
    let featuredSum = featured.reduce((s, e) => s + e.amountCents, 0);
    while (featured.length && featuredSum > point.income) {
      featuredSum -= featured.pop()!.amountCents;
    }
    months.push({
      month: point.month,
      incomeCents: point.income,
      featured,
      backgroundCents: point.income - featuredSum,
      backgroundCount: candidates.length - featured.length,
    });
  }

  return { anchorIndex, months };
}

/**
 * The cumulative creator-revenue series for the public graph.
 *
 * Same inclusion rules as the aggregate the stat token reports: readable rows
 * only, primary currency only, disabled connections out. The months are the
 * union across creators filled to a contiguous range, so a company onboarded
 * mid-window contributes zeros before its books begin rather than shifting
 * everyone else's columns.
 *
 * Same failure posture as the token: null means "render no graph" — a missing
 * section is a smaller lie than a made-up line on a marketing page.
 */
export async function creatorRevenueTimeline(): Promise<RevenueTimeline | null> {
  try {
    const payload = await allTimeFinances();
    const bucket = primaryBucket(payload.aggregate);
    if (bucket.count === 0 || bucket.income <= 0) return null;
    const currency = payload.aggregate.primaryCurrency;

    const byMonth = new Map<string, MoneyCents>();
    let updatedAt: string | null = null;
    for (const row of payload.rows) {
      if (row.connection === "disabled") continue;
      if (row.dataStatus !== "ok" || !row.data) continue;
      if (row.data.currency !== currency) continue;
      const { months, monthly } = row.data;
      for (let i = 0; i < months.length; i++) {
        byMonth.set(months[i], (byMonth.get(months[i]) ?? 0) + (monthly.income[i] ?? 0));
      }
      if (row.lastSyncedAt && (!updatedAt || row.lastSyncedAt > updatedAt)) {
        updatedAt = row.lastSyncedAt;
      }
    }

    const present = [...byMonth.keys()].sort();
    if (!present.length) return null;

    let running = 0;
    const points: RevenuePoint[] = [];
    for (const month of monthRange(present[0], present[present.length - 1])) {
      const income = byMonth.get(month) ?? 0;
      // Trim the dead run before the first dollar — a flatline of leading
      // zeros just squashes the story into the right half of the chart.
      if (!points.length && income === 0) continue;
      running += income;
      points.push({ month, income, total: running });
    }

    if (points.length < 3 || running <= 0) return null;
    return {
      points,
      totalCents: running,
      currency,
      creatorCount: bucket.count,
      updatedAt,
      replay: buildReplay(points, payload.rows, currency),
    };
  } catch (e) {
    console.error("[public-stats] couldn't build revenue timeline:", e);
    return null;
  }
}

/**
 * Replace live tokens in a Sanity stats array.
 *
 * Only touches QuickBooks when a token is actually present, so pages whose
 * stats are all static cost nothing.
 */
export async function resolveLiveStats(
  stats: StatContent[] | undefined,
): Promise<StatContent[]> {
  const list = stats ?? [];
  if (!list.some((s) => hasLiveToken(s.value ?? ""))) return list;

  const cents = await creatorLifetimeRevenueCents();
  const out: StatContent[] = [];
  for (const stat of list) {
    if (!hasLiveToken(stat.value ?? "")) {
      out.push(stat);
      continue;
    }
    if (cents == null) continue; // drop rather than show a wrong number
    out.push({ ...stat, value: stat.value.replace(TOKEN_RE, compactUsd(cents)) });
  }
  return out;
}

/**
 * Site settings with any live stat tokens resolved.
 *
 * Applied at the template-dispatch layer rather than inside getSiteSettings(),
 * which the root layout also calls for the nav and footer — resolving there
 * would put a Firestore read behind every page on the site, including the ones
 * with no stats on them.
 */
export async function withLiveStats(
  settings: SiteSettings | null,
): Promise<SiteSettings | null> {
  if (!settings) return settings;
  return { ...settings, stats: await resolveLiveStats(settings.stats) };
}
