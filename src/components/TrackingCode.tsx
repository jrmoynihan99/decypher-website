import Script from "next/script";

/**
 * Runs an analytics/pixel snippet pasted into the Studio.
 *
 * Two places feed this: Site Settings → Tracking, injected on every page (the
 * base pixel — a Meta or Google tag can't attribute anything without one), and
 * a thank-you page's own Conversion tracking code, injected on that page only.
 * Both are empty until the client pastes something, and empty renders nothing
 * at all.
 *
 * Why parse rather than dump the string into the page: markup inserted through
 * dangerouslySetInnerHTML is parsed with its <script> elements inert — the
 * browser will not execute them, by spec. So the snippet is taken apart and
 * re-emitted as real script elements. Anything that isn't a <script> or a
 * <noscript> (comments, stray markup) is dropped, which is what the platforms'
 * snippets contain anyway.
 *
 * The obvious caveat, stated plainly: this executes CMS content in every
 * visitor's browser. It is the same trust boundary the legal pages already
 * accept — anyone with Studio access can change what the site says — but the
 * blast radius is larger, so the field descriptions tell the client to paste
 * only what the platform itself gave them.
 */

interface Block {
  kind: "src" | "inline" | "noscript";
  value: string;
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const NOSCRIPT_RE = /<noscript\b[^>]*>([\s\S]*?)<\/noscript\s*>/gi;
const SRC_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

export function parseSnippet(code: string): Block[] {
  const trimmed = code.trim();
  if (!trimmed) return [];

  // Bare JavaScript with no tags around it — a reasonable thing to paste, and
  // the only reading of it that does anything useful.
  if (!/<script\b/i.test(trimmed) && !/<noscript\b/i.test(trimmed)) {
    return [{ kind: "inline", value: trimmed }];
  }

  const blocks: Block[] = [];

  // Pulled out first so a <script> nested inside one is never also run live.
  const withoutNoscript = trimmed.replace(NOSCRIPT_RE, (_m, inner: string) => {
    if (inner.trim()) blocks.push({ kind: "noscript", value: inner });
    return "";
  });

  for (const m of withoutNoscript.matchAll(SCRIPT_RE)) {
    const [, attrs = "", body = ""] = m;
    const src = SRC_RE.exec(attrs);
    if (src) {
      const url = src[1] ?? src[2] ?? src[3] ?? "";
      if (url) blocks.push({ kind: "src", value: url });
      continue;
    }
    if (body.trim()) blocks.push({ kind: "inline", value: body });
  }

  return blocks;
}

export default function TrackingCode({
  code,
  id,
}: {
  code?: string;
  /** Prefix for the script element ids Next requires on inline scripts. */
  id: string;
}) {
  const blocks = parseSnippet(code ?? "");
  if (!blocks.length) return null;

  return (
    <>
      {blocks.map((block, i) => {
        const key = `${id}-${i}`;
        if (block.kind === "src") {
          return <Script key={key} id={key} src={block.value} />;
        }
        if (block.kind === "inline") {
          return (
            <Script
              key={key}
              id={key}
              dangerouslySetInnerHTML={{ __html: block.value }}
            />
          );
        }
        // Only reached with JS off, where it's the platform's tracking <img>.
        return (
          <noscript key={key} dangerouslySetInnerHTML={{ __html: block.value }} />
        );
      })}
    </>
  );
}
