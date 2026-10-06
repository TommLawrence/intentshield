import { ChainRail } from "@/components/intentshield/chain-rail";
import { Hero } from "@/components/intentshield/hero";
import { MandateConsole } from "@/components/intentshield/mandates/console";
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
        <ChainRail />
        <TrustBoundary />
        <RuleCatalog />
        <SystemStatus />
        <Roadmap />
      </main>
      <SiteFooter />
    </div>
  );
}
