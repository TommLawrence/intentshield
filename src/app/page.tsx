import { AgentConsole } from "@/components/intentshield/agent/console";
import { ChainRail } from "@/components/intentshield/chain-rail";
import { Hero } from "@/components/intentshield/hero";
import { Lab } from "@/components/intentshield/lab/lab";
import { Ledger } from "@/components/intentshield/ledger/ledger";
import { MandateConsole } from "@/components/intentshield/mandates/console";
import { ReturnHandler } from "@/components/intentshield/return-handler";
import { Roadmap } from "@/components/intentshield/roadmap";
import { RuleCatalog } from "@/components/intentshield/rule-catalog";
import { SiteFooter } from "@/components/intentshield/site-footer";
import { SiteHeader } from "@/components/intentshield/site-header";
import SystemStatus from "@/components/intentshield/system-status";
import { TrustBoundary } from "@/components/intentshield/trust-boundary";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <MandateConsole />
        <AgentConsole />
        <Lab />
        <Ledger />
        <ChainRail />
        <TrustBoundary />
        <RuleCatalog />
        <SystemStatus />
        <Roadmap />
      </main>
      <SiteFooter />
      <ReturnHandler />
    </div>
  );
}
