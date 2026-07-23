/**
 * Rich-text (portable text) full descriptions for the three seeded job
 * openings, shared by seed-careers.mjs (fresh datasets) and
 * patch-job-details.mjs (backfill). Content is demo copy in the site voice —
 * the client edits the real postings in Studio.
 */

let n = 0;
const key = () => `jd${(n++).toString(36).padStart(4, "0")}`;

const span = (text, marks = []) => ({ _type: "span", _key: key(), text, marks });
const block = (style, children, extra = {}) => ({
  _type: "block",
  _key: key(),
  style,
  markDefs: [],
  children: (Array.isArray(children) ? children : [children]).map((c) =>
    typeof c === "string" ? span(c) : c,
  ),
  ...extra,
});

const p = (...children) => block("normal", children);
const h2 = (text) => block("h2", text);
const h5 = (text) => block("h5", text);
const quote = (text) => block("blockquote", text);
const li = (...children) => block("normal", children, { listItem: "bullet", level: 1 });
const bold = (text) => span(text, ["strong"]);

export const slugify = (title) =>
  title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Keyed by job title (the stable field the seed and the live docs share). */
export const JOB_DESCRIPTIONS = {
  "Senior Tax Accountant": [
    p(
      "Our creators don’t have W-2s. They have brand deals, ad-revenue splits, merch lines, and an LLC they set up at 2am off a YouTube tutorial. Your job is to turn that chaos into a strategy — and to be the person they trust when the numbers get big.",
    ),
    h2("What you’ll own"),
    li("A dedicated book of creator clients — theirs end to end, returns through strategy."),
    li(bold("Preparation and review"), " of 1040s and 1120-S returns, plus the quarterlies in between."),
    li("Proactive strategy calls — entity elections, S-corp comp, retirement stacking, the five-figure saves."),
    li("Clean handoffs with our bookkeeping team on the weekly cadence."),
    h2("What you bring"),
    li(bold("CPA or EA preferred"), " — or the experience that makes the license a formality."),
    li("4+ years in tax with small-business or self-employed clients."),
    li("Fluency in flow-through entities and reasonable-comp math."),
    li("Curiosity about the creator economy — you don’t need a channel, you need to care how one gets paid."),
    h2("How we work"),
    p(
      "Remote-first, async by default, output over hours. Our weekly model spreads the work across the year instead of cramming it into a season.",
    ),
    quote("April is just a month here."),
    h5("Comp & logistics"),
    li(bold("$85k–$110k"), " depending on experience."),
    li("Full-time, remote — US."),
    li("Clear tier path: senior → manager, on the record."),
  ],
  "Staff Bookkeeper": [
    p(
      "The weekly close is the heartbeat of DeCypher. Creators send money through Stripe, PayPal, brand-deal wires, and three platforms that didn’t exist last year — you keep it categorized, reconciled, and audit-calm.",
    ),
    h2("What you’ll own"),
    li("A roster of creator books on a ", bold("weekly close cadence"), " — categorization, reconciliation, tie-outs."),
    li("The write-off hunts our clients brag about: finding the deductions hiding in their statements."),
    li("Clean month-end packages the tax team can build strategy on."),
    li("Flagging anomalies early — duplicate charges, missing payouts, platform holdbacks."),
    h2("What you bring"),
    li(bold("QuickBooks Online mastery"), " — rules, banking feeds, journal entries without a safety net."),
    li("2+ years of bookkeeping for small businesses or the self-employed."),
    li("A pattern-matcher’s eye: you notice the $412 charge that doesn’t belong."),
    li("Comfort working async with a distributed team."),
    h2("How we work"),
    p(
      "Remote-first and metronome-steady. Weekly closes mean no quarter-end fire drills — the books are always current, and your evenings are yours.",
    ),
    h5("Comp & logistics"),
    li(bold("$55k–$70k"), " depending on experience."),
    li("Full-time, remote — US."),
    li("Growth path into senior bookkeeping and review work."),
  ],
  "Client Success Manager": [
    p(
      "Our clients live in DMs, not inboxes. You’re the voice in the group chat — the person who makes a creator’s first month feel effortless and their twelfth month feel like family.",
    ),
    h2("What you’ll own"),
    li(bold("Onboarding"), " — from signed proposal to connected accounts in days, not weeks."),
    li("The check-in cadence: proactive touchpoints, not reactive apologies."),
    li("Making sure nothing sits unanswered past ", bold("one business day"), "."),
    li("Routing questions to tax and bookkeeping — and translating the answers back into human."),
    li("Spotting at-risk accounts before they churn."),
    h2("What you bring"),
    li("2+ years in client success, account management, or agency-side creator relations."),
    li("Writing that sounds like a person — warm, fast, precise."),
    li("Systems instincts: you build the checklist so the ball can’t drop twice."),
    li("Genuine fluency in creator culture — platforms, monetization, the stakes."),
    h2("How we work"),
    p(
      "Remote-first with real ownership. You’re not a ticket queue — you’re the relationship, and the team behind you actually answers.",
    ),
    h5("Comp & logistics"),
    li(bold("$60k–$80k"), " depending on experience."),
    li("Full-time, remote — US."),
  ],
};
