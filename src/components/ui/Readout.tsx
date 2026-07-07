import { Fragment } from "react";

/**
 * Renders a CMS "readout" string (the mono status lines) with its
 * lightweight tokens resolved:
 *
 * - `{count}` / `{tiers}` etc. are replaced from `vars`
 * - `**word**` renders that word in brand magenta
 * - `blink` appends the blinking cursor block
 */
export default function Readout({
  text,
  vars = {},
  blink = false,
}: {
  text?: string;
  vars?: Record<string, string | number>;
  blink?: boolean;
}) {
  if (!text) return null;
  let resolved = text;
  for (const [token, value] of Object.entries(vars)) {
    resolved = resolved.replaceAll(`{${token}}`, String(value));
  }
  const parts = resolved.split("**");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="text-magenta">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
      {blink && (
        <>
          {" "}
          <span className="animate-blink text-magenta">▮</span>
        </>
      )}
    </>
  );
}
