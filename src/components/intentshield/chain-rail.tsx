import * as React from "react";
import {
  Bot,
  MoveRight,
  ScrollText,
  ShieldCheck,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/intentshield/primitives";
import { Reveal } from "@/components/intentshield/reveal";
import { DecisionSemantics } from "@/components/intentshield/decision-semantics";

interface ChainNode {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  phase: string;
  highlighted?: boolean;
}

const CHAIN_NODES: ChainNode[] = [
  {
    id: "user-intent",
    label: "USER INTENT",
    icon: UserRound,
    description:
      "Natural-language spending mandate becomes structured policy.",
    phase: "PHASE 2",
  },
  {
    id: "agent-proposal",
    label: "AGENT PROPOSAL",
    icon: Bot,
    description: "AI searches the catalogue and proposes a transaction.",
    phase: "PHASE 3",
  },
  {
    id: "policy-evaluation",
    label: "POLICY EVALUATION",
    icon: ShieldCheck,
    description: "Deterministic engine returns ALLOW, REVIEW or BLOCK.",
    phase: "PHASE 4",
    highlighted: true,
  },
  {
    id: "paypal-execution",
    label: "PAYPAL EXECUTION",
    icon: Wallet,
    description:
      "Guarded server-side Orders v2 call. Browser never holds credentials.",
    phase: "PHASE 5",
  },
  {
    id: "audit-record",
    label: "AUDIT RECORD",
    icon: ScrollText,
    description:
      "Immutable, human-readable trail of the whole chain.",
    phase: "PHASE 6",
  },
];

export function ChainRail() {
  return (
    <section id="chain" aria-labelledby="chain-title" className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal>
          <SectionHeading
            id="chain-title"
            eyebrow="05 / POLICY CHAIN"
            title="One request, five checkpoints"
            description="Every AI payment action passes through the same guarded pipeline before any money moves."
          />
        </Reveal>

        <Reveal delay={60} className="mt-12">
          <ol
            aria-label="Policy chain checkpoints"
            className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0"
          >
            {CHAIN_NODES.map((node, index) => (
              <React.Fragment key={node.id}>
                <li className="flex-1 md:min-w-0">
                  <div
                    className={cn(
                      "flex h-full items-start gap-3 rounded-md border bg-card p-4 transition-colors",
                      node.highlighted
                        ? "border-primary/50 bg-surface-raised"
                        : "border-border"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-md border",
                        node.highlighted
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-secondary/50 text-muted-foreground"
                      )}
                    >
                      <node.icon
                        aria-hidden="true"
                        className="size-4"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="font-data text-[11px] font-medium uppercase tracking-[0.14em] text-foreground">
                        {node.label}
                      </p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                        {node.description}
                      </p>
                      <span
                        className={cn(
                          "mt-3 inline-flex items-center rounded-md border px-1.5 py-0.5 font-data text-[10px] uppercase tracking-[0.14em]",
                          node.highlighted
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-secondary/40 text-muted-foreground"
                        )}
                      >
                        {node.phase}
                      </span>
                    </div>
                  </div>
                </li>
                {index < CHAIN_NODES.length - 1 ? (
                  <li
                    aria-hidden="true"
                    className="flex shrink-0 items-center justify-center py-1 md:w-8 md:py-0"
                  >
                    <MoveRight className="size-4 rotate-90 text-muted-foreground md:rotate-0" />
                  </li>
                ) : null}
              </React.Fragment>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={90} className="mt-12">
          <DecisionSemantics />
        </Reveal>
      </div>
    </section>
  );
}
