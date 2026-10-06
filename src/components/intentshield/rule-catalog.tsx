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

interface PolicyRule {
  code: string;
  name: string;
  description: string;
  outcome: Decision;
}

const POLICY_RULES: PolicyRule[] = [
  {
    code: "R-01",
    name: "Amount ceiling",
    description: "Total exceeds the mandate maximum",
    outcome: "BLOCK",
  },
  {
    code: "R-02",
    name: "Shipping ceiling",
    description: "Shipping exceeds the mandate maximum",
    outcome: "BLOCK",
  },
  {
    code: "R-03",
    name: "Currency mismatch",
    description: "Currency differs from the mandate currency",
    outcome: "BLOCK",
  },
  {
    code: "R-04",
    name: "Recurring charge",
    description: "Subscription/recurring charge where the mandate forbids it",
    outcome: "BLOCK",
  },
  {
    code: "R-05",
    name: "Condition violation",
    description: "Refurbished item where the mandate requires new",
    outcome: "BLOCK",
  },
  {
    code: "R-06",
    name: "Category restriction",
    description: "Category outside allowed list or on blocked list",
    outcome: "BLOCK",
  },
  {
    code: "R-07",
    name: "Merchant restriction",
    description: "Merchant outside allowed list or on blocked list",
    outcome: "BLOCK",
  },
  {
    code: "R-08",
    name: "Quantity limit",
    description: "Quantity exceeds mandate maximum",
    outcome: "BLOCK",
  },
  {
    code: "R-09",
    name: "Mandate expired",
    description: "Mandate validity window has elapsed",
    outcome: "BLOCK",
  },
  {
    code: "R-10",
    name: "Mandate not yet valid",
    description: "Before the mandate validity window",
    outcome: "BLOCK",
  },
  {
    code: "R-11",
    name: "Missing field",
    description: "Critical transaction field absent or malformed",
    outcome: "BLOCK",
  },
  {
    code: "R-12",
    name: "Duplicate execution",
    description: "Same transaction already executed (idempotency)",
    outcome: "BLOCK",
  },
  {
    code: "R-13",
    name: "Untrusted metadata",
    description: "Suspicious external signals (e.g. injected instructions)",
    outcome: "REVIEW",
  },
  {
    code: "R-14",
    name: "Structural inconsistency",
    description: "Transaction shape inconsistent with the mandate",
    outcome: "BLOCK",
  },
];

export function RuleCatalog() {
  return (
    <section id="rules" aria-labelledby="rules-title" className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal>
          <SectionHeading
            id="rules-title"
            eyebrow="03 / POLICY RULES"
            title="Fourteen deterministic rules"
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
