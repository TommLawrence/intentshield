"use client";

import * as React from "react";
import { MoveRight } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The platform's decision semantics — the one-line answer to "who is allowed
 * to decide what?" Each label carries its own tooltip, and every place the
 * chain appears renders it through this component so the explanation is one
 * tap away everywhere.
 */
export const DECISION_SEMANTICS = [
  {
    label: "AI INTERPRETS",
    tooltip: "natural-language understanding only; zero authority",
    highlighted: false,
  },
  {
    label: "POLICY DECIDES",
    tooltip: "deterministic engine; no LLM in the authorization path",
    highlighted: true,
  },
  {
    label: "PAYPAL EXECUTES",
    tooltip: "guarded, server-side, auditable",
    highlighted: false,
  },
] as const;

/**
 * Cross-instance "one at a time": only one semantics tooltip may be open on
 * the whole page, no matter which of the three renderings (hero, mandate
 * console strip, footer strip) opened it.
 */
const SEMANTICS_OPEN_EVENT = "intentshield:semantics-open";

function broadcastSemanticsOpen(sourceKey: string) {
  window.dispatchEvent(
    new CustomEvent(SEMANTICS_OPEN_EVENT, { detail: { sourceKey } })
  );
}

/**
 * AI INTERPRETS · POLICY DECIDES · PAYPAL EXECUTES — as tappable labels.
 *
 * Desktop: hover (or keyboard focus) shows each tooltip, exactly as before.
 * Touch: the first tap opens exactly one tooltip — the one tapped; tapping
 * another label switches to it; tapping anywhere else (or Escape) closes it.
 * Tooltips never stack, and scrolling is never intercepted.
 */
export function SemanticsChips({
  variant = "chips",
  className,
}: {
  /** "chips" — the hero's bordered chips; "inline" — the quiet text strips. */
  variant?: "chips" | "inline";
  className?: string;
}) {
  const instanceKey = React.useId();
  const [openLabel, setOpenLabel] = React.useState<string | null>(null);
  /** Time of the last touch interaction. Some browsers fire focus alongside a
   * tap — within this short echo window, focus/blur are ignored so the tap
   * toggle stays the single source of truth. It self-heals: real keyboard
   * focus (or mouse hover) after the window works normally. */
  const lastTouchAt = React.useRef(0);

  const isTouchEcho = () => Date.now() - lastTouchAt.current < 500;

  // Other renderings of the chain close when this one opens, and vice versa.
  React.useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ sourceKey: string }>).detail;
      if (detail.sourceKey !== instanceKey) {
        setOpenLabel(null);
      }
    };
    window.addEventListener(SEMANTICS_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(SEMANTICS_OPEN_EVENT, handleOpen);
  }, [instanceKey]);

  const open = React.useCallback(
    (label: string) => {
      setOpenLabel(label);
      broadcastSemanticsOpen(instanceKey);
    },
    [instanceKey]
  );

  const close = React.useCallback(() => {
    setOpenLabel((prev) => (prev === null ? prev : null));
  }, []);

  // Touch dismissal: a tap anywhere outside the semantics closes the open one.
  React.useEffect(() => {
    if (openLabel === null) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !target.closest("[data-semantics-trigger]")
      ) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [openLabel, close]);

  const isChips = variant === "chips";

  return (
    <div
      className={cn(
        isChips
          ? "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5"
          : "flex flex-wrap items-center gap-x-1.5",
        className
      )}
    >
      {DECISION_SEMANTICS.map((chip, index) => {
        const isOpen = openLabel === chip.label;
        return (
          <React.Fragment key={chip.label}>
            {isChips && index > 0 ? (
              <MoveRight
                aria-hidden="true"
                className="size-4 rotate-90 pl-5 text-muted-foreground sm:rotate-0 sm:pl-0"
              />
            ) : null}
            {!isChips && index > 0 ? (
              <span aria-hidden="true" className="text-muted-foreground">
                ·
              </span>
            ) : null}
            <Tooltip open={isOpen}>
              <TooltipTrigger asChild>
                <span
                  data-semantics-trigger
                  tabIndex={0}
                  onPointerDown={(event) => {
                    if (event.pointerType === "mouse") return;
                    // Touch / pen: tap toggles this one tooltip.
                    lastTouchAt.current = Date.now();
                    if (isOpen) {
                      setOpenLabel(null);
                    } else {
                      open(chip.label);
                    }
                  }}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") {
                      open(chip.label);
                    }
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType === "mouse" && isOpen) {
                      close();
                    }
                  }}
                  onFocus={() => {
                    if (!isTouchEcho()) {
                      open(chip.label);
                    }
                  }}
                  onBlur={() => {
                    if (!isTouchEcho()) {
                      close();
                    }
                  }}
                  className={cn(
                    "select-none touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isChips
                      ? cn(
                          "inline-flex min-h-11 cursor-pointer items-center rounded-md border bg-card px-4 font-data text-[11px] uppercase tracking-[0.16em] transition-colors",
                          chip.highlighted
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "text-secondary-foreground"
                        )
                      : "inline-flex cursor-pointer items-center py-1 font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                  )}
                >
                  {chip.label}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                <span className="font-data font-semibold">{chip.label}</span>
                {` — ${chip.tooltip}`}
              </TooltipContent>
            </Tooltip>
          </React.Fragment>
        );
      })}
    </div>
  );
}
