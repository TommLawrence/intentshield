"use client";

import * as React from "react";
import { CheckCircle2, FlaskConical, Loader2, Play, RotateCw } from "lucide-react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  DecisionBadge,
  MonoLabel,
  SectionHeading,
} from "@/components/intentshield/primitives";
import { Reveal } from "@/components/intentshield/reveal";
import {
  apiFetch,
  formatApiErrorText,
  isAbortError,
  TransactionStatusBadge,
} from "@/components/intentshield/agent/shared";
import { PirDialog } from "@/components/intentshield/ledger/pir-dialog";
import { dispatchLedgerRefresh } from "@/components/intentshield/ledger/shared";
import type {
  PolicyDecision,
  TransactionDetailResponse,
} from "@/lib/transactions/types";

/**
 * Adversarial Lab — local response shapes. The server-side lab service files
 * import the database client and MUST NOT be imported client-side, so the
 * frozen contract is re-declared here (same pattern as system-status.tsx).
 */
interface LabScenarioSummary {
  id: string;
  letter: string;
  title: string;
  attack: string;
  expected: string;
  expectedDecision: PolicyDecision;
  expectedRule: string | null;
}

interface LabRunResponse {
  scenario: LabScenarioSummary;
  request: string;
  attempts: { narrative: string; transaction: TransactionDetailResponse }[];
  paypalNote: string;
}

interface LabOverview {
  scenarios: LabScenarioSummary[];
  fixtures: {
    standardMandateId: string | null;
    expiredMandateId: string | null;
    ready: boolean;
  };
  policyEngine: { version: string; rules: number };
}

const NOTE_STYLES: Record<PolicyDecision, string> = {
  ALLOW: "border-allow/40 bg-allow/10 text-allow",
  REVIEW: "border-review/40 bg-review/10 text-review",
  BLOCK: "border-block/40 bg-block/10 text-block",
};

function firedRuleCodes(transaction: TransactionDetailResponse): string[] {
  return (
    transaction.evaluation?.ruleOutcomes
      .filter((rule) => rule.outcome !== "PASS")
      .map((rule) => rule.code) ?? []
  );
}

export function Lab() {
  const [overview, setOverview] = React.useState<LabOverview | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [lastRun, setLastRun] = React.useState<LabRunResponse | null>(null);
  const [pirTransaction, setPirTransaction] = React.useState<TransactionDetailResponse | null>(null);
  const [pirOpen, setPirOpen] = React.useState(false);

  const alive = React.useRef(true);
  const overviewAbort = React.useRef<AbortController | null>(null);
  const resultRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      overviewAbort.current?.abort();
    };
  }, []);

  const loadOverview = React.useCallback(async () => {
    overviewAbort.current?.abort();
    const controller = new AbortController();
    overviewAbort.current = controller;
    setLoadError(null);
    try {
      const data = await apiFetch<LabOverview>("/api/lab/scenarios", {
        signal: controller.signal,
      });
      if (alive.current && !controller.signal.aborted) {
        setOverview(data);
      }
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      if (alive.current) {
        setLoadError(
          formatApiErrorText(err, "Could not load the adversarial scenarios.")
        );
      }
    }
  }, []);

  React.useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function handleRun(scenario: LabScenarioSummary) {
    if (runningId) {
      return;
    }
    setRunningId(scenario.id);
    try {
      const data = await apiFetch<LabRunResponse>("/api/lab/run", {
        method: "POST",
        body: JSON.stringify({ scenarioId: scenario.id }),
      });
      if (!alive.current) {
        return;
      }
      setLastRun(data);
      // Fresh outcomes land in the activity ledger — tell it to refetch.
      dispatchLedgerRefresh();
      // Bring the fresh outcome into view without yanking the page around.
      window.requestAnimationFrame(() => {
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;
        resultRef.current?.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "nearest",
        });
      });
    } catch (err) {
      if (!isAbortError(err)) {
        toast.error(
          formatApiErrorText(err, "Could not run this scenario. Please retry.")
        );
      }
    } finally {
      if (alive.current) {
        setRunningId(null);
      }
    }
  }

  function handlePirUpdated(tx: TransactionDetailResponse) {
    setPirTransaction(tx);
    setLastRun((prev) =>
      prev
        ? {
            ...prev,
            attempts: prev.attempts.map((attempt) =>
              attempt.transaction.id === tx.id
                ? { ...attempt, transaction: tx }
                : attempt
            ),
          }
        : prev
    );
  }

  return (
    <section id="lab" aria-labelledby="lab-title" className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal>
          <SectionHeading
            id="lab-title"
            eyebrow="03 / ADVERSARIAL LAB"
            title="Ten attacks. One wall."
            description="Every scenario runs the REAL pipeline — deterministic composition, the same policy engine, the same guarded executor. No mocks. Outcomes land in the activity ledger."
          />
        </Reveal>

        <Reveal delay={40}>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            {overview ? (
              <>
                <MonoLabel
                  as="span"
                  className="text-[10px] tracking-[0.14em]"
                >
                  {`POLICY ENGINE v${overview.policyEngine.version} · ${overview.policyEngine.rules} RULES`}
                </MonoLabel>
                <span
                  aria-hidden="true"
                  className="size-1 rounded-full bg-border"
                />
                <MonoLabel
                  as="span"
                  className={cn(
                    "text-[10px] tracking-[0.14em]",
                    overview.fixtures.ready ? "text-allow" : "text-review"
                  )}
                >
                  {overview.fixtures.ready
                    ? "FIXTURES READY"
                    : "FIXTURES PREPARING…"}
                </MonoLabel>
              </>
            ) : (
              <Skeleton className="h-3.5 w-56" />
            )}
          </div>
        </Reveal>

        {loadError ? (
          <Reveal delay={60} className="mt-6">
            <Alert variant="destructive">
              <AlertTitle>Lab unavailable</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>{loadError}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadOverview()}
                  className="h-9"
                >
                  <RotateCw aria-hidden="true" className="size-3.5" />
                  RETRY
                </Button>
              </AlertDescription>
            </Alert>
          </Reveal>
        ) : null}

        {/* Scenario grid */}
        <Reveal delay={60} className="mt-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {overview === null && !loadError ? (
              Array.from({ length: 6 }, (_, index) => (
                <Card key={index} className="gap-0 py-0">
                  <div className="space-y-3 p-4">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                </Card>
              ))
            ) : (
              (overview?.scenarios ?? []).map((scenario) => {
                const running = runningId === scenario.id;
                return (
                  <Card
                    key={scenario.id}
                    className="gap-0 py-0"
                  >
                    <div className="flex h-full flex-col gap-3 p-4">
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-md border font-data text-[15px] font-semibold",
                            running
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border bg-secondary/40 text-secondary-foreground"
                          )}
                        >
                          {scenario.letter}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-display text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                            {scenario.title}
                          </h3>
                          <p className="mt-0.5 font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            {`EXPECTED ${scenario.expected}`}
                          </p>
                        </div>
                      </div>
                      <p className="flex-1 text-[13px] leading-relaxed text-muted-foreground">
                        {scenario.attack}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={runningId !== null}
                        onClick={() => void handleRun(scenario)}
                        className="h-11 w-full font-data text-[11px] uppercase tracking-[0.14em]"
                      >
                        {running ? (
                          <>
                            <Loader2
                              aria-hidden="true"
                              className="size-4 animate-spin"
                            />
                            RUNNING…
                          </>
                        ) : (
                          <>
                            <Play aria-hidden="true" className="size-4" />
                            RUN
                          </>
                        )}
                      </Button>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </Reveal>

        {/* Result panel */}
        <Reveal delay={80} className="mt-6" >
          <div ref={resultRef}>
            {lastRun ? (
              <LabResult
                run={lastRun}
                onOpenPir={(tx) => {
                  setPirTransaction(tx);
                  setPirOpen(true);
                }}
              />
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <FlaskConical
                  aria-hidden="true"
                  className="mx-auto size-5 text-muted-foreground"
                />
                <p className="mt-2.5 font-display text-[15px] font-semibold tracking-tight text-foreground">
                  No scenario has run yet
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  Run any scenario — its attempts, fired rules and PayPal
                  outcome will appear here.
                </p>
              </div>
            )}
          </div>
        </Reveal>

        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          Fixture mandates are system-owned and clearly labeled
          (ADVERSARIAL LAB FIXTURE). Re-running a scenario cancels its
          previous still-live transactions — outcomes stay comparable, history
          is preserved.
        </p>
      </div>

      {pirTransaction ? (
        <PirDialog
          transaction={pirTransaction}
          open={pirOpen}
          onClose={() => setPirOpen(false)}
          onUpdated={handlePirUpdated}
        />
      ) : null}
    </section>
  );
}

/* ── Result panel ─────────────────────────────────────────────────────────── */

function LabResult({
  run,
  onOpenPir,
}: {
  run: LabRunResponse;
  onOpenPir: (tx: TransactionDetailResponse) => void;
}) {
  const final = run.attempts[run.attempts.length - 1];
  const fired = firedRuleCodes(final.transaction);
  const behaved =
    final.transaction.decision === run.scenario.expectedDecision &&
    (run.scenario.expectedRule === null ||
      fired.includes(run.scenario.expectedRule));
  const finalDecision = final.transaction.decision;

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5">
        <MonoLabel>
          {`RESULT — ${run.scenario.letter} · ${run.scenario.title.toUpperCase()}`}
        </MonoLabel>
        {behaved ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-allow/40 bg-allow/10 px-2.5 py-1 font-data text-[10px] font-medium uppercase tracking-[0.14em] text-allow">
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
            BEHAVED AS EXPECTED ✓
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-block/40 bg-block/10 px-2.5 py-1 font-data text-[10px] font-medium uppercase tracking-[0.14em] text-block">
            UNEXPECTED OUTCOME — SEE LEDGER
          </span>
        )}
      </div>

      <div className="space-y-4 px-4 py-4">
        <p className="text-[13px] italic leading-relaxed text-muted-foreground">
          {`Request: “${run.request}”`}
        </p>

        {run.attempts.map((attempt, index) => {
          const attemptFired = attempt.transaction.evaluation?.ruleOutcomes.filter(
            (rule) => rule.outcome !== "PASS"
          );
          return (
            <div
              key={attempt.transaction.id}
              className="rounded-lg border p-4"
              aria-label={`Attempt ${index + 1}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {`ATTEMPT ${index + 1} / ${run.attempts.length}`}
                  </span>
                  {attempt.transaction.decision ? (
                    <DecisionBadge decision={attempt.transaction.decision} />
                  ) : null}
                  <TransactionStatusBadge
                    status={attempt.transaction.status}
                  />
                </div>
                <p className="font-data text-[13px] font-semibold tracking-[0.04em] text-foreground">
                  {formatMoney(
                    attempt.transaction.total,
                    attempt.transaction.currency
                  )}
                </p>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {attempt.narrative}
              </p>
              {attemptFired && attemptFired.length > 0 ? (
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {attemptFired.map((rule) => (
                    <span
                      key={rule.code}
                      className={cn(
                        "font-data text-[11px] font-medium tracking-[0.06em]",
                        rule.outcome === "BLOCK" && "text-block",
                        rule.outcome === "REVIEW" && "text-review",
                        rule.outcome === "ALLOW" && "text-allow"
                      )}
                    >
                      {`${rule.code} ${rule.name}`}
                    </span>
                  ))}
                </p>
              ) : (
                <p className="mt-2 font-data text-[11px] tracking-[0.06em] text-muted-foreground">
                  ALL RULES PASSED
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenPir(attempt.transaction)}
                className="mt-3 h-11 px-3 font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              >
                OPEN PAYMENT INTENT RECORD
              </Button>
            </div>
          );
        })}

        <p
          className={cn(
            "rounded-lg border px-4 py-3 font-data text-[12px] font-medium uppercase tracking-[0.1em]",
            finalDecision ? NOTE_STYLES[finalDecision] : NOTE_STYLES.ALLOW
          )}
        >
          {run.paypalNote}
        </p>
      </div>
    </Card>
  );
}
