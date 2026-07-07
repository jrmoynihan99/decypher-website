"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { motion, useInView } from "framer-motion";
import { useRevealDelay } from "@/lib/transition-timing";
import { useSectionReveal } from "@/context/SectionRevealContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { noop } from "@/lib/noop";

/**
 * Word-level rise-in for body copy: words fade up together line by line
 * (line membership measured after layout, so it tracks real wrapping).
 */
type ParagraphRevealProps = {
  children: string | string[];
  delay?: number;
  lineStagger?: number;
  className?: string;
  immediate?: boolean;
};

export default function ParagraphReveal({
  children,
  delay = 0,
  lineStagger = 0.04,
  className = "",
  immediate = false,
}: ParagraphRevealProps) {
  const containerRef = useRef<HTMLElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [lineIndices, setLineIndices] = useState<number[]>([]);
  const isInView = useInView(containerRef, {
    once: true,
    margin: "0px 0px -60px 0px",
    amount: 0.3,
  });
  const section = useSectionReveal();
  const reduced = useReducedMotion();

  const revealDelay = useRevealDelay();
  const shouldAnimate = immediate || (section ? section.triggered : isInView);

  const paragraphs = useMemo(
    () =>
      typeof children === "string"
        ? children.split(/\n+/).filter((p) => p.trim().length > 0)
        : children,
    [children],
  );

  const wordsByParagraph = useMemo(
    () => paragraphs.map((p) => p.split(" ")),
    [paragraphs],
  );

  const paragraphOffsets = useMemo(() => {
    const offsets = [0];
    for (let i = 0; i < wordsByParagraph.length - 1; i++) {
      offsets.push(offsets[i] + wordsByParagraph[i].length);
    }
    return offsets;
  }, [wordsByParagraph]);

  const totalWords = wordsByParagraph.reduce((sum, p) => sum + p.length, 0);

  // Measure which line each word ends up on after layout
  useEffect(() => {
    if (reduced) return;
    const spans = wordRefs.current;
    if (spans.length === 0) return;

    const tops: number[] = [];
    const map: number[] = [];

    for (let i = 0; i < totalWords; i++) {
      const span = spans[i];
      if (!span) continue;
      const top = span.getBoundingClientRect().top;
      let lineIdx = tops.findIndex((t) => Math.abs(t - top) < 2);
      if (lineIdx === -1) {
        lineIdx = tops.length;
        tops.push(top);
      }
      map[i] = lineIdx;
    }

    setLineIndices(map);
  }, [totalWords, reduced]);

  if (reduced) {
    if (paragraphs.length === 1) {
      return <p className={className}>{paragraphs[0]}</p>;
    }
    return (
      <div className={className}>
        {paragraphs.map((p, i) => (
          <p key={i} className={i > 0 ? "mt-4" : undefined}>
            {p}
          </p>
        ))}
      </div>
    );
  }

  const renderWord = (
    word: string,
    flatIdx: number,
    isLastInParagraph: boolean,
  ) => (
    <motion.span
      key={flatIdx}
      ref={(el) => {
        wordRefs.current[flatIdx] = el;
      }}
      initial={{ opacity: 0, y: 32 }}
      animate={shouldAnimate ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      onUpdate={noop}
      transition={{
        duration: 1.2,
        ease: [0.08, 0.82, 0.17, 1] as [number, number, number, number],
        delay: delay + revealDelay + (lineIndices[flatIdx] ?? 0) * lineStagger,
      }}
      style={{
        display: "inline-block",
        whiteSpace: "pre",
        willChange: "transform, opacity",
      }}
    >
      {word}
      {isLastInParagraph ? "" : " "}
    </motion.span>
  );

  // Single paragraph: render <p> directly (backward compatible)
  if (paragraphs.length === 1) {
    const words = wordsByParagraph[0];
    return (
      <p
        ref={containerRef as React.RefObject<HTMLParagraphElement>}
        className={className}
      >
        {words.map((word, i) => renderWord(word, i, i === words.length - 1))}
      </p>
    );
  }

  // Multiple paragraphs: render <div> wrapper with <p> children
  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className={className}
    >
      {wordsByParagraph.map((words, pIdx) => (
        <p key={pIdx} className={pIdx > 0 ? "mt-4" : undefined}>
          {words.map((word, wIdx) => {
            const flatIdx = paragraphOffsets[pIdx] + wIdx;
            return renderWord(word, flatIdx, wIdx === words.length - 1);
          })}
        </p>
      ))}
    </div>
  );
}
