import { defineField, defineType } from "sanity";

/**
 * The public referral leaderboard at /leaderboard.
 *
 * A content shell only. The standings — who is on the board, how many
 * referrals they closed, what they earned — are computed live from the sales
 * pipeline in Firestore and are NOT editable here; that is the whole point of
 * the page, and an editable copy would immediately disagree with the portal.
 *
 * What an editor owns is the wrapper (headings, copy, CTA) and the per-creator
 * SPOTLIGHTS below: an Instagram or TikTok post to show alongside a creator's
 * row. Creators are matched by name, so a spotlight for someone not currently
 * on the board simply doesn't render — it starts working the moment they close
 * a referral.
 */

const GROUPS = [
  { name: "header", title: "Header" },
  { name: "hawaii", title: "Hawaii Club" },
  { name: "standings", title: "Standings" },
  { name: "spotlights", title: "Creator Posts" },
  { name: "cta", title: "CTA" },
  { name: "meta", title: "Route & SEO" },
];

export const leaderboardPage = defineType({
  name: "leaderboardPage",
  title: "Referral Leaderboard",
  type: "document",
  groups: GROUPS,
  fields: [
    // No pageLink field and no slug: the route is fixed at /leaderboard, and
    // that widget exists to mirror an editable Route field this document
    // deliberately doesn't have.
    defineField({
      name: "title",
      type: "string",
      initialValue: "Referral Leaderboard",
      group: "meta",
      readOnly: true,
      description: "Lives at /leaderboard. The route is fixed in code.",
    }),
    defineField({ name: "seo", type: "seoBlock", group: "meta" }),

    defineField({
      name: "header",
      type: "pageHeaderBlock",
      group: "header",
      description:
        "The readout line supports {reward} and {credit} for the payout figures.",
    }),

    defineField({
      name: "hawaiiSection",
      title: "Hawaii Club heading",
      type: "sectionHeadingBlock",
      group: "hawaii",
      description:
        "The section for creators who have hit the referral threshold. Only shown once someone qualifies.",
    }),
    defineField({
      name: "hawaiiEmpty",
      title: "Empty state",
      type: "text",
      rows: 3,
      group: "hawaii",
      description: "Shown while nobody has unlocked Hawaii yet.",
    }),

    defineField({
      name: "standingsSection",
      title: "Top 10 heading",
      type: "sectionHeadingBlock",
      group: "standings",
    }),
    defineField({
      name: "riseSection",
      title: "On the Rise heading",
      type: "sectionHeadingBlock",
      group: "standings",
    }),

    defineField({
      name: "spotlights",
      title: "Creator posts",
      type: "array",
      group: "spotlights",
      description:
        "Attach a social post to a creator's row on the board. Match the name to how it appears on the leaderboard.",
      of: [
        {
          type: "object",
          fields: [
            defineField({
              name: "name",
              title: "Creator name",
              type: "string",
              validation: (r) => r.required(),
              description:
                "Matched against the name on the board, ignoring case and punctuation.",
            }),
            defineField({
              name: "postUrl",
              title: "Post URL",
              type: "url",
              validation: (r) =>
                r.required().uri({ scheme: ["http", "https"] }),
              description:
                "Instagram or TikTok post link, e.g. https://www.instagram.com/p/XXXXXXXXXXX/ — Instagram posts embed inline; anything else becomes a link out.",
            }),
            defineField({
              name: "caption",
              type: "string",
              description: "Optional line shown above the post when expanded.",
            }),
          ],
          preview: { select: { title: "name", subtitle: "postUrl" } },
        },
      ],
    }),

    defineField({ name: "cta", title: "Closing CTA", type: "ctaBlock", group: "cta" }),
  ],
  preview: { prepare: () => ({ title: "Referral Leaderboard" }) },
});
