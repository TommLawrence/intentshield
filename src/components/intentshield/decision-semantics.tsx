"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { MonoLabel, type Decision } from "@/components/intentshield/primitives";

const DECISIONS: Record<
  Decision,
  { label: string; description: string; idle: string; active: string; edge: string }
> = {
  ALLOW: {
    label: "ALLOW",
    description:
      "Complies with the mandate. Proceeds to guarded PayPal execution.",
    idle: "border-border text-muted-foreground hover:border-allow/50 hover:text-allow",
    active: "border-allow/60 bg-allow/10 text-allow",
    edge: "border-l-allow",
  },
  REVIEW: {
    label: "REVIEW",
    description:
      "Not clearly prohibited, but ambiguous. Requires explicit human confirmation before any execution.",
    idle: "border-border text-muted-foreground hover:border-review/50 hover:text-review",
    active: "border-review/60 bg-review/10 text-review",
    edge: "border-l-review",
  },
  BLOCK: {
    label: "BLOCK",
    description:
      "Violates a hard rule. Never reaches PayPal — the executor structurally refuses blocked transactions.",
    idle: "border-border text-muted-foreground hover:border-block/50 hover:text-block",
    active: "border-block/60 bg-block/10 text-block",
    edge: "border-l-block",
  },
};

export function DecisionSemantics() {
  const [active, setActive] = React.useState<Decision | null>(null);
  const reducedMotion = useReducedMotion();

  const toggle = (decision: Decision) => {
    setActive((current) => (current === decision ? null : decision));
  };

  const activeDecision = active ? DECISIONS[active] : null;

  return (
    <div>
      <MonoLabel className="text-[10px] tracking-[0.14em]">
        DECISION SEMANTICS
      </MonoLabel>
      <div
        role="group"
        aria-label="Decision semantics"
        className="mt-3 flex flex-col gap-2 sm:flex-row"
      >
        {(Object.keys(DECISIONS) as Decision[]).map((decision) => {
          const spec = DECISIONS[decision];
          const isActive = active === decision;
          return (
            <button
              key={decision}
              type="button"
              aria-pressed={isActive}
              onClick={() => toggle(decision)}
              className={cn(
                "h-11 flex-1 rounded-md border font-data text-[11px] font-medium uppercase tracking-[0.18em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isActive ? spec.active : spec.idle
              )}
            >
              {spec.label}
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="mt-2">
        <AnimatePresence initial={false} mode="wait">
          {activeDecision ? (
            <motion.div
              key={active ?? "none"}
              initial={reducedMotion ? undefined : { opacity: 0, y: 6 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn(
                "rounded-md border border-border border-l-2 bg-card px-4 py-3.5",
                activeDecision.edge
              )}
            >
              <p className="font-data text-[11px] font-medium uppercase tracking-[0.14em] text-foreground">
                {activeDecision.label}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {activeDecision.description}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
