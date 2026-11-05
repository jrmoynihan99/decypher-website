/**
 * Default copy for the landing-page section library — ONE list read by both
 * sides: the Studio shows each value as its field's placeholder, and
 * LandingTemplate renders it when the field is left empty. So the greyed-out
 * text an editor sees in an empty field is exactly what the page will say.
 *
 * `{n}` in an eyebrow is the section's number on the page (01, 02, …), counted
 * over the sections that carry an eyebrow — heroes and the closing CTA don't.
 * Numbers are worked out at render, so reordering sections in Studio can't
 * leave them out of sequence the way typed-in numbers would.
 *
 * Plain data only: the Sanity schema imports this, so nothing here may pull in
 * React or Next.
 */

export const N_TOKEN = "{n}";

/** What happens on the call — the affiliate pages' three cards. */
export const CALL_STEPS = [
  {
    title: "We look at your income",
    body: "Brand deals, affiliate income, product sales — we map where your money is actually coming from, and where it's leaking on the way in.",
  },
  {
    title: "We flag what you're missing",
    body: "The write-offs creators consistently leave on the table, whether an S-corp election makes sense for you yet, and what's quietly costing you at tax time.",
  },
  {
    title: "You get your action plan",
    body: "Exactly what to do next to improve your financial position, grow the business, and cut your biggest expense — taxes. Yours to keep either way.",
  },
];

export const CALL_STEPS_HEADING = {
  title: "Three things get covered. Nothing else.",
  sub: "// 30 MINUTES — NO PITCH DECK, NO OBLIGATION",
  label: "CALL",
};

export const LANDING_DEFAULTS = {
  sectionHeroImage: { ctaLabel: "Book your free call" },
  sectionStats: { eyebrow: "[ {n} // proof of work ]", title: "Receipts, decrypted." },
  sectionTestimonials: { eyebrow: "[ {n} // reviews ]", title: "What our creators have to say" },
  sectionVideoWall: { eyebrow: "[ {n} // the receipts ]", title: "Hear it from the creators." },
  sectionRoster: {
    eyebrow: "[ {n} // the creator roster ]",
    title: "The creators we work with everyday.",
  },
  sectionEstimator: {
    eyebrow: "[ {n} // run the numbers ]",
    title: "Estimate your tax bill",
    sub: "A 60-second, no-login estimate of your self-employment, federal, and state taxes — plus what you could be saving.",
  },
  sectionVideo: { eyebrow: "[ {n} // transmission ]" },
  sectionServices: {
    eyebrow: "[ {n} // services ]",
    title: "One stop shop for your creator business.",
  },
  sectionSteps: { eyebrow: "[ {n} // the call ]", ...CALL_STEPS_HEADING },
  sectionValueStack: { eyebrow: "[ {n} // itemized ]", totalLabel: "Total due" },
  sectionBooking: {
    eyebrow: "[ {n} // book a call ]",
    title: "Book your consultation call.",
    body: "Twenty minutes, zero jargon. We look at your numbers, tell you exactly what we'd do, and you decide if we're your team.",
  },
  sectionFaq: {
    eyebrow: "[ {n} // faq ]",
    title: "Questions, DeCyphered.",
    sub: "// straight answers — every one has its own page",
  },
} as const;
