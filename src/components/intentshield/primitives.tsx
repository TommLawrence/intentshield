import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Mono uppercase micro-label with wide tracking — the house eyebrow style. */
export function MonoLabel({
  children,
  className,
  as: Comp = "p",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "p" | "span" | "div";
}) {
  return (
    <Comp
      className={cn(
        "font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground",
        className
      )}
    >
      {children}
    </Comp>
  );
}

/**
 * Section header pattern: mono eyebrow (e.g. "01 / POLICY CHAIN") followed by
 * a Space Grotesk title and an optional muted description line.
 */
export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  className,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-3xl", className)}>
      <MonoLabel>
        <span
          aria-hidden="true"
          className="mr-2 inline-block size-1.5 bg-primary align-[3px]"
        />
        {eyebrow}
      </MonoLabel>
      <h2
        id={id}
        className="mt-3 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export type Decision = "ALLOW" | "REVIEW" | "BLOCK";

const DECISION_STYLES: Record<Decision, string> = {
  ALLOW: "border-allow/40 bg-allow/10 text-allow",
  REVIEW: "border-review/40 bg-review/10 text-review",
  BLOCK: "border-block/40 bg-block/10 text-block",
};

/** Decision vocabulary badge: emerald ALLOW, amber REVIEW, rose BLOCK. */
export function DecisionBadge({
  decision,
  className,
}: {
  decision: Decision;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-data text-[10px] font-medium uppercase tracking-[0.14em]",
        DECISION_STYLES[decision],
        className
      )}
    >
      {decision}
    </Badge>
  );
}
