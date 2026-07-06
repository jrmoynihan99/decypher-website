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
  duration,
  threshold = 0.5,
}: {
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  duration?: number;
  threshold?: number;
}) {
  const ref = useDecryptOnView<HTMLElement>(text, { duration, threshold });
  return createElement(as, { ref, className }, text);
}
