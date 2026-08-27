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
 * pre-call video, which creator videos run on the wall and the tracking
 * snippet differ between campaigns — the wall's heading, the review carousel
 * and the stats are identical on every one of these and are resolved by the
 * template from the collections and from Book a Call. A new campaign page
 * should be a two-minute job: name it, set a route, paste a video URL.
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
        "The few lines at the top of the page. Keep them short — on a phone anything longer pushes what follows off the screen.",
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
            'The line that hands off to whatever comes next — "But first…" above a hero video, or "But first, hear it from the creators." with the hero video switched off.',
        }),
      ],
    }),
    defineField({
      name: "showHeroVideo",
      title: "Include the hero video",
      type: "boolean",
      group: "content",
      initialValue: true,
      description:
        "On: the header hands off to a big pre-call video, with the creator wall under it. Off: the whole video section goes away and the header runs straight into the creator wall — the wall's own heading is hidden too, so write the header body to introduce it (\"But first, hear it from the creators.\").",
    }),
    defineField({
      name: "video",
      title: "Hero video",
      type: "object",
      group: "content",
      // Nothing in here renders with the toggle off, so don't offer it.
      hidden: ({ document }) => document?.showHeroVideo === false,
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
      name: "videos",
      title: "Creator videos",
      type: "array",
      group: "content",
      of: [
        {
          type: "reference",
          to: [{ type: "videoTestimonial" }],
          options: { disableNew: false },
        },
      ],
      // 40 is a wall, not a page — see VideoWall, which renders the first nine
      // and puts the rest behind a button so a phone isn't asked to mount
      // forty cards nobody scrolled to.
      validation: (r) => r.max(40).unique(),
      description:
        "Which creator testimonials run on the wall, in this order — drag to reorder. Leave empty to show the whole Video Testimonials collection in its own order, which is what every page did before this field existed. Up to 40; the page shows the first nine and puts the rest behind a “show all” button.",
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
