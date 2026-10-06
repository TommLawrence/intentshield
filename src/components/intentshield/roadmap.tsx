import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MonoLabel,
  SectionHeading,
} from "@/components/intentshield/primitives";
import { Reveal } from "@/components/intentshield/reveal";

type PhaseStatus = "COMPLETE" | "NEXT" | "PLANNED";

interface Phase {
  id: string;
  label: string;
  title: string;
  sub?: string;
  status: PhaseStatus;
}

const PHASES: Phase[] = [
  { id: "phase-0", label: "PHASE 0", title: "ARCHITECTURE", status: "COMPLETE" },
  {
    id: "phase-1",
    label: "PHASE 1",
    title: "FOUNDATION",
    sub: "Schema, policy contracts, PayPal & AI abstractions, this shell",
    status: "COMPLETE",
  },
  {
    id: "phase-2",
    label: "PHASE 2",
    title: "INTENT & MANDATES",
    sub: "Natural-language mandate → validated structured policy",
    status: "NEXT",
  },
  {
    id: "phase-3",
    label: "PHASE 3",
    title: "AGENT & CATALOGUE",
    sub: "Controlled product catalogue, agent sessions, proposals",
    status: "PLANNED",
  },
  {
    id: "phase-4",
    label: "PHASE 4",
    title: "POLICY ENGINE",
    sub: "Deterministic ALLOW / REVIEW / BLOCK with reasons",
    status: "PLANNED",
  },
  {
    id: "phase-5",
    label: "PHASE 5",
    title: "PAYPAL EXECUTION",
    sub: "Server-side Orders v2, buyer approval, capture, idempotency",
    status: "PLANNED",
  },
  {
    id: "phase-6",
    label: "PHASE 6",
    title: "AUDITABILITY",
    sub: "Payment intent records, activity ledger, correlation IDs",
    status: "PLANNED",
  },
  {
    id: "phase-7",
    label: "PHASE 7",
    title: "ADVERSARIAL LAB",
    sub: "Ten scripted attack scenarios, every one observable",
    status: "PLANNED",
  },
  {
    id: "phase-8",
    label: "PHASE 8",
    title: "HARDENING",
    sub: "Security review, error states, accessibility, performance",
    status: "PLANNED",
  },
  {
    id: "phase-9",
    label: "PHASE 9",
    title: "DEMO & SUBMISSION",
    sub: "Hosted demo, docs, the 3-minute story",
    status: "PLANNED",
  },
];

const STATUS_STYLES: Record<PhaseStatus, string> = {
  COMPLETE: "border-allow/40 bg-allow/10 text-allow",
  NEXT: "border-review/50 bg-review/10 text-review",
  PLANNED: "border-border bg-secondary/40 text-muted-foreground",
};

export function Roadmap() {
  return (
    <section id="roadmap" aria-labelledby="roadmap-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal>
          <SectionHeading id="roadmap-title" eyebrow="05 / ROADMAP" title="Foundation now, firewall next" />
        </Reveal>

        <Reveal delay={60} className="mt-10">
          <ol
            aria-label="Build phases"
            className="border-t"
          >
            {PHASES.map((phase) => (
              <li
                key={phase.id}
                className="grid gap-x-4 gap-y-1 border-b py-3 sm:grid-cols-[6.5rem_1fr_auto] sm:items-baseline"
              >
                <MonoLabel
                  as="span"
                  className="text-[10px] tracking-[0.16em]"
                >
                  {phase.label}
                </MonoLabel>
                <div>
                  <p className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                    {phase.title}
                  </p>
                  {phase.sub ? (
                    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                      {phase.sub}
                    </p>
                  ) : null}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "mt-1.5 justify-self-start font-data text-[10px] font-medium uppercase tracking-[0.14em] sm:mt-0 sm:justify-self-end",
                    STATUS_STYLES[phase.status]
                  )}
                >
                  {phase.status}
                </Badge>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
