/**
 * Typographic primitives for the legal pages.
 *
 * Small and explicit rather than a prose-plugin class, because these documents
 * are the only long-form body copy on the site and giving them their own
 * vocabulary keeps a future tweak to marketing typography from silently
 * reformatting a licence agreement.
 */

/**
 * A value someone still has to supply. Rendered loudly rather than as quiet grey
 * text, because the failure mode for a legal page is shipping it with
 * "[MAILING ADDRESS]" still in the body and nobody noticing for a year.
 */
export function Fill({ children }: { children: React.ReactNode }) {
  // A span rather than <mark>: the user-agent stylesheet gives <mark> a yellow
  // background and black text, which renders as an obvious visual bug on a dark
  // page. Styling it deliberately keeps "someone still has to fill this in"
  // reading as intentional rather than broken.
  return (
    <span className="rounded border border-magenta/50 bg-magenta/20 px-1.5 py-0.5 font-mono text-[12.5px] font-bold uppercase tracking-[0.5px] text-magenta">
      {children}
    </span>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-3 font-display text-[34px] font-semibold leading-tight text-fog">
      {children}
    </h1>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-11 font-display text-[20px] font-semibold text-fog">{children}</h2>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-4">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mb-4 list-disc space-y-2 pl-6 marker:text-magenta">{children}</ul>;
}

export function Updated({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-10 font-mono text-[11.5px] uppercase tracking-[1.2px] text-dusk">
      {children}
    </p>
  );
}
