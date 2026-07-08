"use client";

import { createElement } from "react";
import { useDecryptOnView } from "@/hooks/useDecryptOnView";

/**
 * Text that scrambles into cipher characters while off-screen and "decrypts"
 * when scrolled into view.
 */
export default function DecryptOnView({
  text,
  as = "h2",
  className,
  style,
  duration,
  threshold = 0.5,
}: {
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  style?: React.CSSProperties;
  duration?: number;
  threshold?: number;
}) {
  const ref = useDecryptOnView<HTMLElement>(text, { duration, threshold });
  // decrypt-pending blurs the server-rendered copy until the hook's effect
  // takes over, so the finished text never flashes before the scramble
  return createElement(
    as,
    {
      ref,
      className: className ? `${className} decrypt-pending` : "decrypt-pending",
      style,
    },
    text,
  );
}
