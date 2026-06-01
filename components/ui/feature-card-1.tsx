"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedFeatureCardProps {
  /** The numerical index to display, e.g. "001" */
  index: string;
  /** The tag or category label */
  tag: string;
  /** The main title or description */
  title: React.ReactNode;
  /** The emoji / glyph shown large in the centre */
  glyph: string;
  /** The color variant which determines the gradient and tag color */
  color: "amber" | "green" | "cyan";
  /** Optional extra classes */
  className?: string;
}

const colorVariants = {
  amber: {
    "--feature-color": "hsl(28, 100%, 62%)",
    "--feature-color-light": "hsl(35, 100%, 60%)",
    "--feature-color-dark": "rgba(255,142,62,0.14)",
  },
  green: {
    "--feature-color": "hsl(146, 95%, 57%)",
    "--feature-color-light": "hsl(146, 90%, 50%)",
    "--feature-color-dark": "rgba(5,223,114,0.12)",
  },
  cyan: {
    "--feature-color": "hsl(173, 100%, 41%)",
    "--feature-color-light": "hsl(173, 100%, 45%)",
    "--feature-color-dark": "rgba(0,211,189,0.12)",
  },
};

const AnimatedFeatureCard = React.forwardRef<
  HTMLDivElement,
  AnimatedFeatureCardProps
>(({ className, index, tag, title, glyph, color }, ref) => {
  const cardStyle = colorVariants[color] as React.CSSProperties;

  return (
    <motion.div
      ref={ref}
      style={cardStyle}
      className={cn(
        "relative flex h-[380px] w-full flex-col justify-end overflow-hidden rounded-2xl border border-white/8 bg-[#100a06] p-6 shadow-sm",
        className
      )}
      whileHover="hover"
      initial="initial"
      variants={{
        initial: { y: 0 },
        hover: { y: -10 },
      }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 50% 32%, var(--feature-color-dark) 0%, transparent 65%)",
        }}
      />

      {/* Index number */}
      <div className="absolute top-6 left-6 font-mono text-lg font-bold text-[#5c4542]">
        {index}
      </div>

      {/* Central glyph */}
      <motion.div
        className="absolute inset-0 z-10 flex items-center justify-center"
        variants={{
          initial: { scale: 1, y: -10 },
          hover: { scale: 1.25, y: -28 },
        }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        <div
          className="flex h-40 w-40 items-center justify-center rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--feature-color-dark) 0%, transparent 70%)",
          }}
        >
          <span className="text-7xl leading-none select-none">{glyph}</span>
        </div>
      </motion.div>

      {/* Content */}
      <div className="relative z-20 rounded-xl border border-white/8 bg-[#0e0807]/80 p-4 backdrop-blur-sm">
        <span
          className="mb-2 inline-block rounded-full px-3 py-1 text-[10px] font-semibold tracking-widest uppercase"
          style={{
            backgroundColor: "var(--feature-color-dark)",
            color: "var(--feature-color)",
            fontFamily: "'Space Mono','Courier New',monospace",
          }}
        >
          {tag}
        </span>
        <p className="text-base text-[#d4c5c1] leading-snug">{title}</p>
      </div>
    </motion.div>
  );
});
AnimatedFeatureCard.displayName = "AnimatedFeatureCard";

export { AnimatedFeatureCard };
