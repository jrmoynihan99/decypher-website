# Creator Tax FAQ

`/faq` (the hub), `/faq/<slug>` (one page per question), and the handful of
questions in the FAQ section on Home and every affiliate page. Built from a
package Acquisition.com's team put together, restyled to the site and moved
onto Sanity.

---

## The one idea

**Everything is in Studio**, sidebar → **Creator Tax FAQ**:

| Where | What |
|---|---|
| FAQ Page | Hub heading and intro, byline, "Where are you?" rows, the three call-to-action boxes (and the **Master Class link**), disclaimers, SEO |
| All questions / Questions by category | One document per question: question, route, category, order, short answer, full answer (tables via @sanity/table, first row = header), related questions, next step |
| Categories | The hub's sections, in order |
| Site Settings → FAQ → Questions on Home | Which questions Home and the affiliate pages show, in order |

Publishing lands through the webhook (FAQ types take the full purge in
`/api/revalidate`); `revalidate = 86400` is the safety net. A question
published after a deploy renders on its first visit — no deploy needed.

## Rules

- **Never change a live question's Route** without a permanent redirect in
  `next.config.ts`. Links and search results point at it.
- **No decrypt effects on FAQ text.** Headings and answers are plain static
  text on purpose: crawlers and AI assistants have to be able to read them.
  The rain, mesh and glow sit behind the text.
- **Short answers stand alone.** They're the meta description, the hub entry,
  the Home accordion, and the line AI assistants quote.
- **Every January:** answers citing yearly limits, and the savings figures in
  the pricing/savings answers, need a pass.
- Master Class next steps fall back to the booking box until FAQ Page → Calls
  to action → Write Off Master Class → Link is set.

## The one-time import

The first questions came from the FAQ doc (its **FAQ answers** tab, downloaded
as Markdown) via `scripts/import-faq.mjs`, with `scripts/data/faq-meta.json`
supplying each question's ID → route, category and order.

```bash
npm run faq:import -- path/to/export.md --dry        # check; writes nothing
npm run faq:import -- path/to/export.md --overwrite  # replace what's there
```

Additive by default (createIfNotExists). `--overwrite` replaces every
question in the export and resets Home picks and "Where are you?" — fine over
a test import, destructive once people edit in Studio. `Source:` lines and
everything after them are never imported. `scripts/fixtures/faq-answers.sample.md`
is the three-question format sample (`--allow-missing`).
