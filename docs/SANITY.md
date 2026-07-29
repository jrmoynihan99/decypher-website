# Sanity CMS

The entire site is content-driven from Sanity (project `076c9ywj`, dataset
`production`). The Studio is embedded at **`/studio`**.

## Architecture

- **Pages** — six page documents (Home, Services, Our Creators, Our Team,
  Book a Call, Careers), one per template. Section *layout and order live in
  code* (the neural-web meshes span fixed groups of sections); every text
  string and image in each section is editable in the page document. Each
  page's `Route` (slug) field controls its URL via the catch-all route
  `src/app/(site)/[...slug]` (home is pinned to `/`). If you change a slug,
  update any links pointing at it in Site Settings.
- **Collections** — Creators (111), Testimonials, Team, Services, Job
  Openings. Sorted by their `order` field; the first 16 creators feed the
  home hero strip and roster. Job Openings are the role cards on Careers —
  each card links to its `Apply link` (a mailto or job-post URL), and an
  empty collection shows the page's editable empty state instead.
- **Legal Pages** — privacy policy and terms of use, served at
  `/legal/<slug>` by `src/app/(site)/legal/[slug]`. Also a list, so more can
  be added without a deploy. Unlike a page document the *entire* text is one
  rich-text `body` field — these are documents, not templates. Two
  consequences: a change leaves no commit trail and passes through no review
  (take legal copy to counsel before publishing), and **the URLs are
  registered with Intuit's app assessment**, so renaming a slug breaks a link
  someone external is relying on.
- **Site Settings** — logo, navbar links, footer, stats, default SEO, and
  the global consultation button (label + link).

Content conventions:

- **Readout lines** (the mono `// STATUS` strings) support tokens:
  `{count}` / `{tiers}` are replaced with live record counts, and
  `**word**` renders that word in brand magenta.
- The tax estimator is intentionally **not** CMS-driven — it encodes 2026
  tax law and legal disclaimers. Same for form field labels and the
  interaction hints inside the services animation.
- The Book-a-Call **thank-you takeover** (shown after the form submits) is
  editable under Book a Call → Thank You. The transmission-log panel that
  echoes the visitor's own submission stays in code, and every field falls
  back to a sensible default if left empty.
- **SEO** is per-page under each page's Meta group, falling back to Site
  Settings → Default SEO. The optional **Share image** (1200×630) is what
  iMessage/Slack/LinkedIn show; leave it empty and the site generates a
  branded card instead (`src/app/opengraph-image.tsx`). `/robots.txt` and
  `/sitemap.xml` are generated from Sanity, so new job posts and legal pages
  appear in the sitemap without a deploy. Affiliate pages are deliberately
  left out of it — see `src/app/sitemap.ts`.

## Caching / revalidation (same pattern as aletheia-website)

1. **Build**: all pages prerender statically (`generateStaticParams`).
2. **Daily safety net**: every page exports `revalidate = 86400`.
3. **Instant updates**: a Sanity webhook POSTs to `/api/revalidate`, which
   purges just the edited page's path (page docs) or the whole site
   (collections/settings — they render on several pages, and with five
   routes a full purge is cheap).

### Webhook setup (one-time, after first deploy)

In [sanity.io/manage](https://www.sanity.io/manage) → project `076c9ywj` →
**API → Webhooks → Create webhook**:

| Setting | Value |
| --- | --- |
| Name | `revalidate-production` |
| URL | `https://<your-domain>/api/revalidate` |
| Dataset | `production` |
| Trigger on | Create, Update, Delete |
| Filter | *(leave empty)* |
| Projection | `{_id, _type, slug}` |
| HTTP method | `POST` |
| HTTP headers | `Authorization: Bearer <SANITY_REVALIDATE_SECRET>` |
| API version | `v2021-03-25` (default) |
| Draft/versions | Off (published documents only) |

The secret is in `.env.local` (`SANITY_REVALIDATE_SECRET`).

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | local + Vercel | project id (`076c9ywj`) |
| `NEXT_PUBLIC_SANITY_DATASET` | local + Vercel | `production` |
| `SANITY_REVALIDATE_SECRET` | local + Vercel | shared secret for `/api/revalidate` |
| `SANITY_API_WRITE_TOKEN` | local only | used by the migration script — do **not** add to Vercel |

Also add the production domain (and `http://localhost:3000`) to CORS
origins in Manage → API so the embedded Studio can talk to the API.

## Migration script

`node scripts/migrate-to-sanity.mjs` seeded Sanity from the old hardcoded
content (`src/lib/content.ts`, `src/data/*.json`, `/public/assets`). It
uses deterministic document IDs, so it is idempotent — but **re-running it
overwrites any edits made in the Studio** for those documents. Treat it as
a one-time bootstrap.

`node scripts/seed-careers.mjs` is the additive follow-up that seeded the
Careers page, the three starter Job Openings, and the Book-a-Call thank-you
copy. Unlike the migration it never overwrites: new documents use
`createIfNotExists` and the schedule page is patched with `setIfMissing`,
so it is safe to re-run at any time.

`npm run legal:seed` (`scripts/seed-legal.mjs`) seeded the privacy policy
and terms of use. Also `createIfNotExists`, so re-running never clobbers a
Studio edit — to start a document over, delete it in Studio first. The
drafted copy ships with `[BRACKETED]` blanks (entity name, address,
retention period, governing-law state); Studio shows a warning listing the
ones still outstanding until they are filled in.
