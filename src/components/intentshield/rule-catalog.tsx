import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import {
  DecisionBadge,
  SectionHeading,
  type Decision,
} from "@/components/intentshield/primitives";
import { Reveal } from "@/components/intentshield/reveal";
import { POLICY_RULES as ENGINE_RULES } from "@/lib/policy/types";

/** The engine's rule catalog is the single source of truth — the UI never
 *  maintains its own copy. R-15/R-16 were appended in engine v1.1.0. */
const POLICY_RULES = ENGINE_RULES.map((rule) => ({
  code: rule.code as string,
  name: rule.name,
  description: rule.description,
  outcome: rule.outcomeOnViolation,
}));



export function RuleCatalog() {
  return (
    <section id="rules" aria-labelledby="rules-title" className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal>
          <SectionHeading
            id="rules-title"
            eyebrow="07 / POLICY RULES"
            title="Sixteen deterministic rules"
            description="The engine has zero LLM dependency. Every decision carries explicit, machine-readable reasons."
          />
        </Reveal>

        <Reveal delay={60} className="mt-10">
          <Card className="gap-0 overflow-hidden rounded-md py-0 shadow-none">
            <div className="rules-scroll max-h-96 overflow-y-auto overflow-x-hidden">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16 pl-4 font-data text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      CODE
                    </TableHead>
                    <TableHead className="font-data text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      RULE
                    </TableHead>
                    <TableHead className="w-24 pr-4 font-data text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      OUTCOME
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {POLICY_RULES.map((rule) => (
                    <TableRow key={rule.code}>
                      <TableCell className="pl-4 pr-2 font-data text-[12px] font-medium text-primary">
                        {rule.code}
                      </TableCell>
                      <TableCell className="whitespace-normal py-2.5 pr-4">
                        <span className="text-sm font-medium text-foreground">
                          {rule.name}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                          {rule.description}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4">
                        <DecisionBadge decision={rule.outcome} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
