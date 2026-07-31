import { defineField, defineType } from "sanity";
import { pageLinkField } from "./pageLink";

/**
 * Thank-you pages — where a visitor lands after the booking form goes through.
 *
 * A LIST, not a singleton, for the same reason the affiliate pages are: the
 * client makes one per paid-ads campaign so each conversion has its own URL to
 * fire on. The booking form picks which one by the `?ty=<route>` parameter on
 * the landing link (see thankYouTargetFor in lib/thank-you.ts); with no
 * parameter it falls back to the page set in Book a Call → Thank You.
 *
 * Deliberately thinner than the affiliate form. Only the header copy, the
 * pre-call video and the tracking snippet differ between campaigns — the
 * creator-video wall, the review carousel and the stats are identical on every
 * one of these and are resolved by the template from the collections and from
 * Book a Call. A new campaign page should be a two-minute job: name it, set a
 * route, paste a video URL.
 *
 * Slugs live under /thank-you/, so unlike an affiliate page they can't shadow
 * a real route — the only collision possible is with each other.
 */

const THANK_YOU_GROUPS = [
  { name: "content", title: "Content" },
  { name: "meta", title: "Route & Tracking" },
];

export const thankYouPage = defineType({
  name: "thankYouPage",
  title: "Thank You Page",
  type: "document",
  groups: THANK_YOU_GROUPS,
  fields: [
    pageLinkField({ groups: THANK_YOU_GROUPS, basePath: "/thank-you" }),
    defineField({
      name: "title",
      title: "Name",
      type: "string",
      group: "meta",
      validation: (r) => r.required(),
      description:
        'What this page is for, e.g. "Meta ads — January UGC campaign". Internal only: it names the document in this list and never appears on the page.',
    }),
    defineField({
      name: "slug",
      title: "Route",
      type: "slug",
      group: "meta",
      validation: (r) => r.required(),
      description:
        'URL segment under /thank-you/ — "meta-january" serves /thank-you/meta-january. Send visitors here by adding ?ty=meta-january to the booking link in the ad.',
      options: {
        source: "title",
        maxLength: 64,
        // Scoped to thank-you pages on purpose. The default isUnique checks
        // every slugged document in the dataset, which would reject a route
        // matching an affiliate page — harmless here, since these are nested
        // under /thank-you/ and can only collide with one another.
        isUnique: async (slug, context) => {
          const { document, getClient } = context;
          if (!document) return true;
          const id = document._id.replace(/^drafts\./, "");
          const taken = await getClient({ apiVersion: "2024-10-01" }).fetch<boolean>(
            `defined(*[_type == "thankYouPage" && !(_id in [$draft, $published]) && slug.current == $slug][0]._id)`,
            { draft: `drafts.${id}`, published: id, slug },
          );
          return !taken;
        },
      },
    }),
    defineField({
      name: "header",
      type: "object",
      group: "content",
      description:
        "The few lines above the video. Keep them short — the video is what this page is for, and on a phone anything longer pushes it off the screen.",
      fields: [
        defineField({
          name: "eyebrow",
          type: "string",
          description: 'Teal status line, e.g. "● CHANNEL OPEN".',
        }),
        defineField({ name: "title", type: "string" }),
        defineField({
          name: "body",
          type: "text",
          rows: 3,
          description:
            'The line that hands off to the video, e.g. "But first…".',
        }),
      ],
    }),
    defineField({
      name: "video",
      title: "Hero video",
      type: "object",
      group: "content",
      description:
        "The big pre-call video under the header. An on-brand placeholder frame shows until the URL is set.",
      fields: [
        defineField({
          name: "eyebrow",
          type: "string",
          description:
            "Optional kicker over the video — leave empty to let the body line above do the introducing.",
        }),
        defineField({
          name: "title",
          type: "string",
          description: "Optional heading over the video — usually empty.",
        }),
        defineField({
          name: "videoUrl",
          title: "YouTube URL",
          type: "url",
          description: "Any YouTube link works — watch, share, or unlisted.",
        }),
      ],
    }),
    defineField({
      name: "trackingCode",
      title: "Conversion tracking code",
      type: "text",
      rows: 6,
      group: "meta",
      description:
        "Optional. The snippet your ad platform gives you for a conversion event, pasted whole (script tags and all) — it runs on this page only. The base pixel that has to be on EVERY page goes in Site Settings → Tracking instead. Anything pasted here runs in your visitors' browsers, so only paste code you got from the platform itself.",
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "slug.current" },
    prepare: ({ title, subtitle }) => ({
      title: title ?? "Untitled thank-you page",
      subtitle: subtitle ? `/thank-you/${subtitle}` : "no route set",
    }),
  },
});
