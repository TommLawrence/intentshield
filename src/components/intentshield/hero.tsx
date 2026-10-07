import { MonoLabel } from "@/components/intentshield/primitives";
import { Reveal } from "@/components/intentshield/reveal";
import { SemanticsChips } from "@/components/intentshield/semantics";

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

        {/* The decision semantics — hover on desktop, tap on mobile. Exactly
            one tooltip is ever open; each label explains its own role. */}
        <Reveal delay={120}>
          <div className="mt-10">
            <SemanticsChips variant="chips" />
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
