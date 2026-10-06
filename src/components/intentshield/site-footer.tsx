import { ShieldCheck } from "lucide-react";

import { MonoLabel } from "@/components/intentshield/primitives";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck
              aria-hidden="true"
              className="size-4 text-primary"
            />
            <span className="font-display text-sm font-semibold tracking-tight">
              IntentShield
            </span>
          </div>
          <MonoLabel className="mt-2 text-[10px] tracking-[0.16em]">
            AI INTERPRETS · POLICY DECIDES · PAYPAL EXECUTES
          </MonoLabel>
        </div>

        <div className="md:text-right">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Prototype for PayPal AI Hackathon 2026. Sandbox only — no real money
            moves.
          </p>
          <MonoLabel className="mt-1.5 text-[10px] tracking-[0.14em]">
            Built by T L&apos;ence · Crane Systems
          </MonoLabel>
        </div>
      </div>
    </footer>
  );
}
