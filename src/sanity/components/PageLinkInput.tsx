"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormValue } from "sanity";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

/**
 * The document's public URL, read-only, with a copy button — pinned to the top
 * of every slugged document so a link can be handed to a partner without
 * anyone reassembling it from the Route field in their head.
 *
 * The origin is always the live domain, deliberately NOT window.location.origin.
 * The Studio gets opened on whatever Vercel deployment URL is at hand, and a
 * link built from that host is the one thing this field must never produce: it
 * would be pasted into an ad or a DM and outlive the deployment it names.
 *
 * Nothing is ever written: the field holds no value, it renders one derived
 * from the live `slug` in the form, so it follows an unsaved edit immediately.
 */

/** "/" → "/", "services" → "/services", ("/legal", "privacy") → "/legal/privacy". */
function toPath(basePath: string, rawSlug: string): string | null {
  const slug = rawSlug.trim();
  if (!slug) return null;
  const base = basePath.replace(/\/+$/, "");
  const clean = slug.replace(/^\/+|\/+$/g, "");
  // The home page's slug is literally "/", which cleans down to nothing.
  if (!clean) return base || "/";
  return `${base}/${clean}`;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Clipboard API needs a secure context and a live user gesture; if either
    // is missing fall back to the old selection trick rather than silently
    // doing nothing.
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 5px 5px 11px",
  border: "1px solid var(--card-hairline-hard-color, rgba(134,144,160,0.35))",
  borderRadius: 4,
};

const linkStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 13,
  lineHeight: "21px",
  color: "var(--card-link-color, #2276fc)",
  textDecoration: "none",
};

const emptyStyle: CSSProperties = {
  ...rowStyle,
  ...linkStyle,
  flex: "none",
  display: "block",
  color: "var(--card-muted-fg-color, #8690a0)",
};

function buttonStyle(hover: boolean): CSSProperties {
  return {
    flex: "none",
    appearance: "none",
    border: "1px solid var(--card-hairline-hard-color, rgba(134,144,160,0.35))",
    borderRadius: 3,
    padding: "3px 10px",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 500,
    lineHeight: "15px",
    cursor: "pointer",
    background: hover
      ? "var(--card-muted-fg-color, #8690a0)"
      : "var(--card-bg-color, transparent)",
    color: hover
      ? "var(--card-bg-color, #fff)"
      : "var(--card-fg-color, inherit)",
  };
}

/**
 * One component per base path. Call at module scope and reuse the result —
 * a component identity created during render remounts the field on every
 * keystroke.
 */
export function createPageLinkInput(basePath = "") {
  function PageLinkInput() {
    const slug = useFormValue(["slug", "current"]);
    const [copied, setCopied] = useState(false);
    const [hover, setHover] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
      () => () => {
        if (timer.current) clearTimeout(timer.current);
      },
      [],
    );

    const path = typeof slug === "string" ? toPath(basePath, slug) : null;
    const url = path ? `${PRODUCTION_ORIGIN}${path}` : null;

    const copy = useCallback(() => {
      if (!url) return;
      void copyToClipboard(url).then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      });
    }, [url]);

    if (!url) {
      return <div style={emptyStyle}>Set the route below to get the link.</div>;
    }

    return (
      <div style={rowStyle}>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={linkStyle}
          title={url}
          data-testid="page-link-url"
        >
          {url}
        </a>
        <button
          type="button"
          onClick={copy}
          data-testid="page-link-copy"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={buttonStyle(hover)}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    );
  }

  PageLinkInput.displayName = `PageLinkInput(${basePath || "/"})`;
  return PageLinkInput;
}
