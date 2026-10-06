import { CheckCircle2, ShieldAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { MonoLabel, SectionHeading } from "@/components/intentshield/primitives";
import { Reveal } from "@/components/intentshield/reveal";

interface BoundaryItem {
  lead: string;
  rest: string;
}

const TRUSTED_ITEMS: BoundaryItem[] = [
  {
    lead: "User mandate",
    rest: "— the human's actual authorization",
  },
  {
    lead: "System policy",
    rest: "— deterministic rules, versioned",
  },
  {
    lead: "Server-side executor",
    rest: "— the only path to PayPal",
  },
];

const UNTRUSTED_ITEMS: BoundaryItem[] = [
  {
    lead: "Merchant descriptions",
    rest: "— arbitrary third-party text",
  },
  {
    lead: "Product metadata",
    rest: "— prices, categories, claims",
  },
  {
    lead: "Model-generated reasoning",
    rest: "— suggestions, not authority",
  },
  {
    lead: "Agent suggestions",
    rest: "— proposals, never authorization",
  },
];

function BoundaryColumn({
  title,
  icon: Icon,
  items,
  tone,
  labelledBy,
}: {
  title: string;
  icon: LucideIcon;
  items: BoundaryItem[];
  tone: "trusted" | "untrusted";
  labelledBy: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        "rounded-md border p-5 sm:p-6",
        tone === "trusted" ? "border-allow/30" : "border-block/30"
      )}
    >
      <h3
        id={labelledBy}
        className={cn(
          "flex items-center gap-2 font-data text-[11px] font-medium uppercase tracking-[0.18em]",
          tone === "trusted" ? "text-allow" : "text-block"
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
        {title}
      </h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.lead} className="flex items-start gap-2.5">
            {tone === "trusted" ? (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-allow"
              />
            ) : (
              <ShieldAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-block"
              />
            )}
            <p className="text-sm leading-relaxed">
              <span className="font-medium text-foreground">{item.lead}</span>{" "}
              <span className="text-muted-foreground">{item.rest}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TrustBoundary() {
  return (
    <section id="trust" aria-labelledby="trust-title" className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal>
          <SectionHeading
            id="trust-title"
            eyebrow="06 / TRUST BOUNDARY"
            title="What the model may never touch"
            description="External content can be reasoned about. It can never acquire authority."
          />
        </Reveal>

        <Reveal delay={60} className="mt-12">
          <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-0">
            <BoundaryColumn
              labelledBy="trusted-title"
              title="TRUSTED"
              icon={CheckCircle2}
              items={TRUSTED_ITEMS}
              tone="trusted"
            />

            <div className="flex items-center justify-center gap-3 md:flex-col md:gap-2 md:px-4">
              <div
                aria-hidden="true"
                className="h-px w-10 shrink-0 bg-border md:hidden"
              />
              <div
                aria-hidden="true"
                className="hidden w-px flex-1 bg-border md:block"
              />
              <span className="rounded-md border bg-surface-raised px-3 py-1.5 text-center font-data text-[10px] font-medium uppercase tracking-[0.14em] text-foreground">
                INTENTSHIELD · DETERMINISTIC POLICY ENGINE
              </span>
              <div
                aria-hidden="true"
                className="h-px w-10 shrink-0 bg-border md:hidden"
              />
              <div
                aria-hidden="true"
                className="hidden w-px flex-1 bg-border md:block"
              />
            </div>

            <BoundaryColumn
              labelledBy="untrusted-title"
              title="UNTRUSTED"
              icon={ShieldAlert}
              items={UNTRUSTED_ITEMS}
              tone="untrusted"
            />
          </div>
        </Reveal>

        <Reveal delay={90} className="mt-6">
          <MonoLabel className="text-[10px] leading-relaxed tracking-[0.12em]">
            PROMPT-INJECTION DEFENCE: malicious text inside product data cannot
            modify the mandate, the policy, or execution privileges.
          </MonoLabel>
        </Reveal>
      </div>
    </section>
  );
}
