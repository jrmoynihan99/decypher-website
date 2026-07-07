"use client";

import { Fragment } from "react";
import { motion } from "framer-motion";
import { useRevealDelay } from "@/lib/transition-timing";
import { useSectionReveal } from "@/context/SectionRevealContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { noop } from "@/lib/noop";

/**
 * Word-staggered rise-in for display headings. NB: section titles on this
 * site decrypt via <DecryptOnView> instead — reach for this only where a
 * heading shouldn't scramble.
 */
type HeadingRevealProps = {
  children: string;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
  delay?: number;
  stagger?: number;
  className?: string;
  immediate?: boolean;
};

const wordVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0 },
};

const wordTransition = {
  duration: 1.2,
  ease: [0.08, 0.82, 0.17, 1] as const,
};

// static per-tag motion components — creating them during render resets state
const MOTION_TAGS = {
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  h4: motion.h4,
  h5: motion.h5,
  h6: motion.h6,
  p: motion.p,
  span: motion.span,
} as const;

export default function HeadingReveal({
  children,
  as: Tag = "h2",
  delay = 0,
  stagger = 0.08,
  className = "",
  immediate = false,
}: HeadingRevealProps) {
  const totalDelay = delay + useRevealDelay();
  const section = useSectionReveal();
  const reduced = useReducedMotion();
  const MotionTag = MOTION_TAGS[Tag];

  // Split by line breaks first, then by words
  // Replace literal \n string with actual newline, then split
  const normalizedText = children.replace(/\\n/g, "\n");
  const lines = normalizedText.split("\n");

  if (reduced) {
    return (
      <Tag className={className}>
        {lines.map((line, i) => (
          <Fragment key={i}>
            {line}
            {i < lines.length - 1 && <br />}
          </Fragment>
        ))}
      </Tag>
    );
  }

  const allWords = lines.flatMap((line, lineIndex) => {
    const words = line.split(" ");
    return words.map((word, wordIndex) => ({
      word,
      isLastInLine: wordIndex === words.length - 1,
      isLastLine: lineIndex === lines.length - 1,
    }));
  });

  const animationProps = immediate || (section && section.triggered)
    ? {
        initial: "hidden",
        animate: "visible",
        transition: { staggerChildren: stagger, delayChildren: totalDelay },
      }
    : section
      ? {
          initial: "hidden",
          animate: "hidden",
          transition: { staggerChildren: stagger, delayChildren: totalDelay },
        }
      : {
          initial: "hidden",
          whileInView: "visible",
          viewport: { once: true, margin: "0px 0px -60px 0px", amount: 0.3 },
          transition: { staggerChildren: stagger, delayChildren: totalDelay },
        };

  return (
    <MotionTag {...animationProps} className={className}>
      {allWords.map((item, i) => (
        <Fragment key={i}>
          <motion.span
            variants={wordVariants}
            transition={wordTransition}
            onUpdate={noop}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              willChange: "transform, opacity",
            }}
          >
            {item.word}
            {!item.isLastInLine && " "}
          </motion.span>
          {item.isLastInLine && !item.isLastLine && <br />}
        </Fragment>
      ))}
    </MotionTag>
  );
}
