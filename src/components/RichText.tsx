import { PortableText, type PortableTextComponents } from "next-sanity";
import type { PortableTextBlock } from "next-sanity";

/**
 * Renders Sanity portable text in the site voice — used by job postings and
 * the legal pages. Shared deliberately: two renderers would drift, and a legal
 * document reading in a different typographic voice from the rest of the site
 * looks like it came from somewhere else.
 *
 * Styling: display-font
 * headings, mist body copy, magenta list markers, mono H5/H6 "section labels"
 * (the eyebrow style — handy for REQUIREMENTS / BENEFITS strips). The page's
 * real H1 is the hero title, so an editor H1 here is just the largest heading
 * size — rendered as an h2 element to keep the document outline honest.
 */

const headingBase = "font-display font-semibold tracking-[-0.02em] text-fog";
const monoLabel = "font-mono font-bold uppercase text-magenta";

const components: PortableTextComponents = {
  block: {
    normal: ({ children }) => (
      <p className="m-0 mt-4 text-[15.5px] leading-relaxed text-mist first:mt-0">
        {children}
      </p>
    ),
    h1: ({ children }) => (
      <h2
        className={`m-0 mt-10 text-[clamp(26px,3.4vw,34px)] font-bold leading-[1.15] first:mt-0 ${headingBase}`}
      >
        {children}
      </h2>
    ),
    h2: ({ children }) => (
      <h2
        className={`m-0 mt-10 text-[clamp(21px,2.6vw,26px)] leading-[1.2] first:mt-0 ${headingBase}`}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className={`m-0 mt-8 text-[19px] leading-snug first:mt-0 ${headingBase}`}>
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className={`m-0 mt-7 text-[16.5px] leading-snug first:mt-0 ${headingBase}`}>
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 className={`m-0 mt-8 text-[11.5px] tracking-[0.22em] first:mt-0 ${monoLabel}`}>
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6
        className={`m-0 mt-7 text-[10.5px] tracking-[0.2em] text-faint first:mt-0 ${monoLabel}`}
      >
        {children}
      </h6>
    ),
    blockquote: ({ children }) => (
      <blockquote className="m-0 mt-6 border-l-2 border-magenta/60 pl-5 text-[16px] italic leading-relaxed text-fog/90 first:mt-0">
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet: ({ children }) => (
      <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">{children}</ul>
    ),
    number: ({ children }) => (
      <ol className="m-0 mt-4 flex list-none flex-col gap-2 p-0 [counter-reset:jobs]">
        {children}
      </ol>
    ),
  },
  listItem: {
    bullet: ({ children }) => (
      <li className="relative pl-6 text-[15.5px] leading-relaxed text-mist before:absolute before:left-0.5 before:top-[7px] before:font-mono before:text-[10px] before:text-magenta before:content-['▸']">
        {children}
      </li>
    ),
    number: ({ children }) => (
      <li className="relative pl-8 text-[15.5px] leading-relaxed text-mist [counter-increment:jobs] before:absolute before:left-0 before:top-[3px] before:font-mono before:text-[12px] before:text-magenta before:content-[counter(jobs,decimal-leading-zero)]">
        {children}
      </li>
    ),
  },
  marks: {
    strong: ({ children }) => (
      <strong className="font-semibold text-fog">{children}</strong>
    ),
    code: ({ children }) => (
      <code className="rounded-md border border-white/10 bg-panel-2 px-1.5 py-0.5 font-mono text-[0.85em] text-teal">
        {children}
      </code>
    ),
    link: ({ children, value }) => {
      const href: string = value?.href ?? "#";
      const external = /^https?:\/\//i.test(href);
      return (
        <a
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="text-magenta underline decoration-magenta/40 underline-offset-4 transition-colors hover:decoration-magenta"
        >
          {children}
        </a>
      );
    },
  },
};

export default function RichText({
  value,
  className = "",
}: {
  value: PortableTextBlock[];
  className?: string;
}) {
  return (
    <div className={className}>
      <PortableText value={value} components={components} />
    </div>
  );
}
