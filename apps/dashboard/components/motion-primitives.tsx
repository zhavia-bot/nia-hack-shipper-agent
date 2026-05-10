"use client";

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

/**
 * Fade + rise once on scroll-into-view. Use anywhere in the page tree;
 * works inside server components since this file is the client boundary.
 */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      variants={fadeUp}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger a list of children. Pass each child wrapped in <StaggerItem>.
 */
export function Stagger({
  children,
  className,
  delayChildren = 0.05,
  staggerChildren = 0.07,
}: {
  children: ReactNode;
  className?: string;
  delayChildren?: number;
  staggerChildren?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={{
        hidden: {},
        show: { transition: { delayChildren, staggerChildren } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Hero-only entrance — animates immediately on mount instead of in-view.
 */
export function HeroReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      variants={fadeUp}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Soft pulse — used on the hero badge sparkle and live-ticker dot.
 */
export function SoftPulse({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.span
      animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.05, 1] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      variants={fadeIn}
      className={className}
    >
      {children}
    </motion.span>
  );
}
