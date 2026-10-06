import { MoveRight } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MonoLabel } from "@/components/intentshield/primitives";
import { Reveal } from "@/components/intentshield/reveal";

const PRINCIPLE_CHIPS = [
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

export function Hero() {
  return (
    <section
      id="overview"
      aria-labelledby="hero-title"
      className="hero-grid overflow-hidden border-b"
    >
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24 md:pb-24">
        <Reveal>
          <MonoLabel className="max-w-2xl">
            PAYPAL AI HACKATHON 2026 · TRUST &amp; POLICY FIREWALL FOR AGENTIC
            COMMERCE
          </MonoLabel>
        </Reveal>

        <Reveal delay={40}>
          <h1
            id="hero-title"
            className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"
          >
            Give AI <span className="text-primary">permission to act</span> —
            without giving it unlimited authority.
          </h1>
        </Reveal>

        <Reveal delay={80}>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            IntentShield converts human intent into enforceable payment policy,
            evaluates every AI-proposed transaction against it deterministically,
            and only lets authorized payments reach PayPal.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
            {PRINCIPLE_CHIPS.map((chip, index) => (
              <div
                key={chip.label}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5"
              >
                {index > 0 ? (
                  <MoveRight
                    aria-hidden="true"
                    className="size-4 rotate-90 pl-5 text-muted-foreground sm:rotate-0 sm:pl-0"
                  />
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-md border bg-card px-4 font-data text-[11px] uppercase tracking-[0.16em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        chip.highlighted
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "text-secondary-foreground"
                      )}
                    >
                      {chip.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    <span className="font-data font-semibold">
                      {chip.label}
                    </span>
                    {` — ${chip.tooltip}`}
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={160}>
          <a
            href="#agent"
            className="mt-9 inline-block font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            PHASE 3–7 LIVE — AGENT, POLICY ENGINE, GUARDED PAYPAL EXECUTION →
          </a>
        </Reveal>
      </div>
    </section>
  );
}
