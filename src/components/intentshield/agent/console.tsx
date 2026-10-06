"use client";

import * as React from "react";
import { Bot, Loader2, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import type { MandateListItem } from "@/lib/mandates/types";
import type {
  AgentSearchResponse,
  TransactionDetailResponse,
} from "@/lib/transactions/types";
import { MonoLabel, SectionHeading } from "@/components/intentshield/primitives";
import { Reveal } from "@/components/intentshield/reveal";
import {
  ApiError,
  BlockHeading,
  DecisionBanner,
  ItemLine,
  RiskSignalChips,
  RuleOutcomeList,
  TotalsRows,
  apiFetch,
  formatApiErrorText,
} from "@/components/intentshield/agent/shared";
import { ExecutionControls } from "@/components/intentshield/agent/execution-controls";
import { PirDialog } from "@/components/intentshield/ledger/pir-dialog";
import { dispatchLedgerRefresh } from "@/components/intentshield/ledger/shared";

const REQUEST_MAX = 2000;
const REQUEST_MIN = 3;

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "STANDARD",
    text: "Find me a solid business laptop.",
  },
  {
    label: "OVER-REACH",
    text: "Get me the best laptop you can find.",
  },
  {
    label: "SUBSCRIPTION",
    text: "Add protection to my laptop purchase.",
  },
];

/** Map agent-search error codes to honest, actionable copy. */
function searchErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "VALIDATION_ERROR":
        return formatApiErrorText(
          err,
          "Describe the shopping request in 3–2000 characters."
        );
      case "NOT_FOUND":
        return "The selected mandate no longer exists — refresh and pick another.";
      case "INVALID_STATE":
        return "The selected mandate is not ACTIVE. Confirm it in the mandate console first.";
      case "AGENT_SEARCH_FAILED":
        return "The AI agent could not complete this search — nothing was proposed. Try rephrasing.";
      case "NO_MATCHING_PRODUCTS":
        return "The agent found no matching products in the catalogue.";
      case "AI_UNAVAILABLE":
        return "The AI agent is unavailable right now. Please try again shortly.";
      default:
        return formatApiErrorText(
          err,
          "Something went wrong running this search. Please try again."
        );
    }
  }
  return formatApiErrorText(
    err,
    "Something went wrong running this search. Please try again."
  );
}

export function AgentConsole() {
  // Mandate selector state.
  const [mandates, setMandates] = React.useState<MandateListItem[] | null>(null);
  const [mandatesLoading, setMandatesLoading] = React.useState(true);
  const [mandateId, setMandateId] = React.useState("");

  // Search state.
  const [request, setRequest] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AgentSearchResponse | null>(null);
  const [pirOpen, setPirOpen] = React.useState(false);

  const alive = React.useRef(true);
  const mandatesAbort = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      mandatesAbort.current?.abort();
    };
  }, []);

  const refreshMandates = React.useCallback(async () => {
    mandatesAbort.current?.abort();
    const controller = new AbortController();
    mandatesAbort.current = controller;
    setMandatesLoading(true);
    try {
      const data = await apiFetch<{ mandates: MandateListItem[] }>(
        "/api/mandates",
        { signal: controller.signal }
      );
      if (alive.current && !controller.signal.aborted) {
        setMandates(
          data.mandates.filter(
            (item) => item.status === "ACTIVE" && item.currentVersion >= 1
          )
        );
      }
    } catch (err) {
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        return;
      }
      if (alive.current) {
        toast.error(formatApiErrorText(err, "Could not load mandates."));
      }
    } finally {
      if (alive.current && !controller.signal.aborted) {
        setMandatesLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void refreshMandates();
  }, [refreshMandates]);

  async function handleSearch() {
    const text = request.trim();
    if (!mandateId) {
      toast.error("Select an ACTIVE mandate first.");
      return;
    }
    if (text.length < REQUEST_MIN) {
      toast.error(
        `Describe the shopping request in at least ${REQUEST_MIN} characters.`
      );
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const data = await apiFetch<AgentSearchResponse>("/api/agent/search", {
        method: "POST",
        body: JSON.stringify({ mandateId, request: text }),
      });
      if (!alive.current) {
        return;
      }
      setResult(data);
      // The proposal just landed in the activity ledger — tell it to refetch.
      dispatchLedgerRefresh();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setSearchError(searchErrorMessage(err));
      }
    } finally {
      if (alive.current) {
        setSearching(false);
      }
    }
  }

  /** Keep the last result in sync as execution / review actions land. */
  function handleTransactionUpdated(tx: TransactionDetailResponse) {
    setResult((prev) => (prev ? { ...prev, transaction: tx } : prev));
  }

  const selectedMandate = mandates?.find((item) => item.id === mandateId);

  return (
    <section id="agent" aria-labelledby="agent-title" className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal>
          <SectionHeading
            id="agent-title"
            eyebrow="02 / AGENT & EXECUTION"
            title="The agent proposes. Policy decides."
            description="Pick an ACTIVE mandate and describe what to buy. The AI agent proposes by SKU only — deterministic code composes the transaction, and the policy engine decides before anything can reach PayPal."
          />
        </Reveal>

        <Reveal delay={60} className="mt-10">
          <div className="grid items-start gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
            {/* LEFT — the agent brief */}
            <Card className="gap-0 py-0">
              <div className="border-b px-4 py-3.5">
                <MonoLabel>AGENT BRIEF</MonoLabel>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  A real AI shopping agent, proposing against a controlled
                  catalogue under your authorization.
                </p>
              </div>
              <form
                className="flex flex-col gap-4 px-4 py-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSearch();
                }}
              >
                <div className="space-y-2">
                  <label
                    htmlFor="agent-mandate"
                    className="font-data text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    Spend under mandate
                  </label>
                  {mandates === null ? (
                    <div
                      role="status"
                      aria-label="Loading mandates"
                      className="space-y-2"
                    >
                      <Skeleton className="h-11 w-full" />
                    </div>
                  ) : mandates.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-center">
                      <p className="font-display text-[14px] font-semibold tracking-tight text-foreground">
                        Create and confirm a mandate first
                      </p>
                      <a
                        href="#mandates"
                        className="mt-1.5 inline-block font-data text-[11px] uppercase tracking-[0.12em] text-primary underline decoration-primary/40 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        OPEN THE MANDATE CONSOLE →
                      </a>
                    </div>
                  ) : (
                    <>
                      <Select
                        value={mandateId}
                        onValueChange={setMandateId}
                        disabled={searching}
                      >
                        <SelectTrigger
                          id="agent-mandate"
                          className="h-11 w-full"
                          aria-describedby="agent-mandate-hint"
                        >
                          <SelectValue placeholder="Select an ACTIVE mandate" />
                        </SelectTrigger>
                        <SelectContent>
                          {mandates.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-[13px] font-medium">
                                  {item.title}
                                </span>
                                <span className="font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                                  {`${formatMoney(item.maxTotal ?? 0, item.currency ?? "USD")} · V${item.currentVersion}`}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p
                        id="agent-mandate-hint"
                        className="text-[11px] leading-relaxed text-muted-foreground"
                      >
                        Only confirmed, ACTIVE mandates appear here. Lab
                        fixture mandates are system-owned and labeled — or{" "}
                        <a
                          href="#mandates"
                          className="underline decoration-border underline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          create your own
                        </a>
                        .
                      </p>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="agent-request"
                    className="font-data text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    Shopping request
                  </label>
                  <Textarea
                    id="agent-request"
                    rows={4}
                    maxLength={REQUEST_MAX}
                    placeholder="e.g. Find me a solid business laptop."
                    value={request}
                    disabled={searching}
                    aria-describedby="agent-request-hint"
                    className="min-h-[100px] resize-y bg-background text-[13px] leading-relaxed"
                    onChange={(event) => setRequest(event.target.value)}
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    <p
                      id="agent-request-hint"
                      className="text-[11px] leading-relaxed text-muted-foreground"
                    >
                      The AI agent runs a real catalogue search — this can take
                      up to 20 seconds.
                    </p>
                    <p className="shrink-0 font-data text-[10px] tracking-[0.1em] text-muted-foreground">
                      {`${request.length}/${REQUEST_MAX}`}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <MonoLabel as="p" className="text-[10px] tracking-[0.16em]">
                    EXAMPLES
                  </MonoLabel>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLES.map((example) => (
                      <button
                        key={example.label}
                        type="button"
                        title={example.text}
                        disabled={searching}
                        onClick={() => setRequest(example.text)}
                        className="inline-flex min-h-11 items-center rounded-md border bg-card px-3 font-data text-[10px] uppercase tracking-[0.12em] text-secondary-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
                      >
                        {example.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={searching || mandates === null || mandates.length === 0}
                  className="h-11 w-full font-data text-[11px] uppercase tracking-[0.14em]"
                >
                  {searching ? (
                    <>
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                      SEARCHING CATALOGUE…
                    </>
                  ) : (
                    <>
                      <Search aria-hidden="true" className="size-4" />
                      RUN AGENT SEARCH
                    </>
                  )}
                </Button>

                {searchError ? (
                  <Alert variant="destructive">
                    <ShieldAlert aria-hidden="true" />
                    <AlertTitle>Agent search failed</AlertTitle>
                    <AlertDescription>{searchError}</AlertDescription>
                  </Alert>
                ) : null}

                <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
                  The AI proposes by SKU. Deterministic code composes the
                  transaction. The policy engine decides.
                </p>
              </form>
            </Card>

            {/* RIGHT — the result */}
            <Card className="gap-0 py-0">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <MonoLabel>RESULT</MonoLabel>
                {selectedMandate ? (
                  <span className="truncate font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {`UNDER ${selectedMandate.title}`}
                  </span>
                ) : null}
              </div>

              {searching ? (
                <div
                  role="status"
                  aria-label="Agent searching the catalogue"
                  className="m-4 rounded-lg border border-dashed p-6"
                >
                  <p className="flex items-center gap-2.5 font-display text-[15px] font-semibold tracking-tight text-foreground">
                    <Loader2
                      aria-hidden="true"
                      className="size-4 animate-spin text-primary"
                    />
                    The AI agent is searching the catalogue…
                  </p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                    The proposal, its deterministic composition and its policy
                    evaluation will appear here. This is a real model call —
                    up to 20 seconds.
                  </p>
                  <div className="mt-4 space-y-2.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ) : result === null ? (
                <div className="m-4 rounded-lg border border-dashed p-8 text-center">
                  <Bot
                    aria-hidden="true"
                    className="mx-auto size-5 text-muted-foreground"
                  />
                  <p className="mt-2.5 font-display text-[15px] font-semibold tracking-tight text-foreground">
                    No proposal yet
                  </p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                    Run an agent search to see a proposal, its policy
                    evaluation and its execution path.
                  </p>
                </div>
              ) : (
                <AgentResult
                  result={result}
                  onTransactionUpdated={handleTransactionUpdated}
                  onOpenPir={() => setPirOpen(true)}
                />
              )}
            </Card>
          </div>
        </Reveal>
      </div>

      {result ? (
        <PirDialog
          transaction={result.transaction}
          open={pirOpen}
          onClose={() => setPirOpen(false)}
          onUpdated={handleTransactionUpdated}
        />
      ) : null}
    </section>
  );
}

/* ── Result rendering ─────────────────────────────────────────────────────── */

function AgentResult({
  result,
  onTransactionUpdated,
  onOpenPir,
}: {
  result: AgentSearchResponse;
  onTransactionUpdated: (tx: TransactionDetailResponse) => void;
  onOpenPir: () => void;
}) {
  const { agent, transaction } = result;
  const evaluation = transaction.evaluation;
  const merchants = Array.from(
    new Set(transaction.items.map((item) => item.merchant))
  );

  return (
    <div className="space-y-6 px-4 py-4">
      {/* AGENT PROPOSAL */}
      <section aria-labelledby="agent-result-picks">
        <BlockHeading id="agent-result-picks">AGENT PROPOSAL</BlockHeading>
        <div className="mt-3 space-y-3">
          <p className="font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {`${agent.provider} · ${agent.model}`}
          </p>
          <ul className="space-y-2.5">
            {agent.picks.map((pick) => (
              <li
                key={pick.sku}
                className={cn(
                  "rounded-lg border p-3",
                  pick.resolved
                    ? "border-border bg-card"
                    : "border-dashed border-border bg-muted/30"
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0">
                    <span className="font-data text-[11px] font-medium tracking-[0.08em] text-primary">
                      {pick.sku}
                    </span>
                    <span className="ml-2 text-[13px] font-medium text-foreground">
                      {pick.name ?? "Unknown product"}
                    </span>
                    {!pick.resolved ? (
                      <span className="ml-2 font-data text-[10px] uppercase tracking-[0.12em] text-review">
                        DROPPED — SKU NOT IN CATALOGUE
                      </span>
                    ) : (
                      <span className="ml-2 font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {`×${pick.quantity}`}
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] italic leading-relaxed text-muted-foreground">
                  {`“${pick.reason}”`}
                </p>
              </li>
            ))}
          </ul>
          {agent.notes ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {agent.notes}
            </p>
          ) : null}
          {agent.warnings.length > 0 ? (
            <Alert className="border-review/40 bg-review/5 text-review">
              <ShieldAlert aria-hidden="true" />
              <AlertTitle className="text-[13px] font-semibold">
                Agent warnings
              </AlertTitle>
              <AlertDescription className="text-[13px] leading-relaxed text-muted-foreground">
                <ul className="space-y-1">
                  {agent.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </section>

      {/* PROPOSAL SUMMARY */}
      <section aria-labelledby="agent-result-summary">
        <BlockHeading id="agent-result-summary">
          PROPOSAL SUMMARY
        </BlockHeading>
        <div className="mt-3 space-y-3">
          <ul aria-label="Proposed items">
            {transaction.items.map((item) => (
              <ItemLine
                key={item.sku}
                item={item}
                currency={transaction.currency}
              />
            ))}
          </ul>
          <TotalsRows transaction={transaction} />
          <div className="flex flex-wrap items-center gap-1.5">
            {merchants.map((merchant) => (
              <span
                key={merchant}
                className="inline-flex items-center rounded-md border bg-secondary/40 px-2 py-0.5 font-data text-[10px] font-medium uppercase tracking-[0.12em] text-secondary-foreground"
              >
                {merchant}
              </span>
            ))}
            <span className="inline-flex items-center rounded-md border bg-secondary/40 px-2 py-0.5 font-data text-[10px] font-medium uppercase tracking-[0.12em] text-secondary-foreground">
              {transaction.condition}
            </span>
            {transaction.recurring ? (
              <span className="inline-flex items-center rounded-md border border-review/40 bg-review/10 px-2 py-0.5 font-data text-[10px] font-medium uppercase tracking-[0.12em] text-review">
                RECURRING
              </span>
            ) : null}
          </div>
          <RiskSignalChips signals={transaction.riskSignals} />
          <p className="font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {`FINGERPRINT ${transaction.fingerprintShort} · CORRELATION #${transaction.correlationId.slice(0, 8)}`}
          </p>
        </div>
      </section>

      {/* POLICY EVALUATION */}
      <section aria-labelledby="agent-result-policy">
        <BlockHeading id="agent-result-policy">
          POLICY EVALUATION
        </BlockHeading>
        {evaluation && transaction.decision ? (
          <div className="mt-3 space-y-3">
            <DecisionBanner
              decision={transaction.decision}
              ruleCount={evaluation.ruleOutcomes.length}
            />
            <div className="rounded-lg border p-4">
              <RuleOutcomeList outcomes={evaluation.ruleOutcomes} />
            </div>
            {evaluation.violations.length > 0 ? (
              <ul className="space-y-1 text-[13px] leading-relaxed text-block">
                {evaluation.violations.map((violation) => (
                  <li key={violation}>{violation}</li>
                ))}
              </ul>
            ) : null}
            {evaluation.warnings.length > 0 ? (
              <ul className="space-y-1 text-[13px] leading-relaxed text-review">
                {evaluation.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-muted-foreground">
            No policy evaluation is recorded for this transaction.
          </p>
        )}
      </section>

      {/* EXECUTION PATH */}
      <section aria-labelledby="agent-result-execution">
        <BlockHeading id="agent-result-execution">
          EXECUTION
        </BlockHeading>
        <div className="mt-3">
          <ExecutionControls
            transaction={transaction}
            onUpdated={onTransactionUpdated}
          />
        </div>
      </section>

      <Button
        type="button"
        variant="ghost"
        onClick={onOpenPir}
        className="h-11 w-full font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
      >
        VIEW PAYMENT INTENT RECORD
      </Button>
    </div>
  );
}
