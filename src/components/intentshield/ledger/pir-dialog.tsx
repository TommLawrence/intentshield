"use client";

import * as React from "react";
import { ExternalLink, Fingerprint } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  TRANSACTION_STATUS_LABELS,
  type TransactionDetailResponse,
} from "@/lib/transactions/types";
import {
  BlockHeading,
  DecisionBanner,
  FieldRow,
  ItemLine,
  RiskSignalChips,
  RuleOutcomeList,
  TotalsRows,
  TransactionStatusBadge,
  formatUtc,
} from "@/components/intentshield/agent/shared";
import { ExecutionControls } from "@/components/intentshield/agent/execution-controls";
import { SourceChip, transactionAuditTint } from "@/components/intentshield/ledger/shared";

/**
 * The Payment Intent Record — the §18 auditability deliverable. Every
 * transaction that exists has one, immutable and complete: the human intent,
 * the mandate terms, the AI proposal, the deterministic decision, the PayPal
 * leg and the full audit trail.
 */
export function PirDialog({
  transaction,
  open,
  onClose,
  onUpdated,
}: {
  transaction: TransactionDetailResponse;
  open: boolean;
  onClose: () => void;
  /** Propagate post-dialog actions (approve / execute / capture / reject). */
  onUpdated?: (tx: TransactionDetailResponse) => void;
}) {
  const [current, setCurrent] = React.useState<TransactionDetailResponse>(
    transaction
  );
  React.useEffect(() => {
    setCurrent(transaction);
  }, [transaction]);

  const key = current.id.slice(0, 8);
  const evaluation = current.evaluation;
  const mandate = current.mandate;
  const firedRules =
    evaluation?.ruleOutcomes.filter((rule) => rule.outcome !== "PASS") ?? [];

  const description = `${TRANSACTION_STATUS_LABELS[current.status]} · ${current.source} proposal · ${current.items.length} item${current.items.length === 1 ? "" : "s"} · ${formatMoney(current.total, current.currency)}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="top-[50%] flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-3xl translate-y-[-50%] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 gap-1.5 border-b px-4 py-3 sm:gap-2 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center gap-2 pr-11">
            <TransactionStatusBadge status={current.status} />
            {/* Decorative context label — hidden on mobile where the row
                would otherwise wrap; the status badge, reference and version
                carry the essential context. */}
            <span className="hidden font-data text-[11px] uppercase tracking-[0.16em] text-muted-foreground sm:inline">
              PAYMENT INTENT RECORD
            </span>
            {current.paymentIntent ? (
              <span className="font-data text-[11px] font-medium tracking-[0.12em] text-primary">
                {current.paymentIntent.reference}
              </span>
            ) : null}
            {mandate ? (
              <span className="font-data text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {`V${mandate.version.version}`}
              </span>
            ) : null}
          </div>
          <DialogTitle className="pr-11 font-display text-lg font-semibold tracking-tight sm:text-xl">
            {`${current.merchant} — ${formatMoney(current.total, current.currency)}`}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-snug">
            {description}
          </DialogDescription>
          <p className="font-data text-[10px] uppercase leading-snug tracking-[0.14em] text-muted-foreground">
            {`TX ${key} · CREATED ${formatUtc(current.createdAt)} · #${current.correlationId.slice(0, 8)}`}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:space-y-6 sm:px-6 sm:py-5">
          {/* 1 — The human's words, always first. */}
          <section aria-labelledby={`pir-intent-${key}`}>
            <BlockHeading id={`pir-intent-${key}`}>USER INTENT</BlockHeading>
            {mandate ? (
              <blockquote className="mt-3 whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-[13px] italic leading-relaxed text-muted-foreground">
                {`“${mandate.instruction}”`}
              </blockquote>
            ) : (
              <p className="mt-3 text-[13px] text-muted-foreground">
                The mandate record is unavailable for this transaction.
              </p>
            )}
          </section>

          {/* 2 — The authorization the engine actually enforced. */}
          {mandate ? (
            <section
              aria-labelledby={`pir-mandate-${key}`}
              className="rounded-lg border p-4"
            >
              <BlockHeading id={`pir-mandate-${key}`}>
                {`MANDATE (V${mandate.version.version}) — ${mandate.title}`}
              </BlockHeading>
              <div className="mt-2">
                <dl>
                  <FieldRow
                    label="Maximum spend"
                    value={formatMoney(
                      mandate.version.maxTotal,
                      mandate.version.currency
                    )}
                    valueClassName="font-data text-[13px] font-medium"
                  />
                  <FieldRow
                    label="Shipping limit"
                    value={
                      mandate.version.maxShipping !== null
                        ? formatMoney(
                            mandate.version.maxShipping,
                            mandate.version.currency
                          )
                        : "Not specified"
                    }
                  />
                  <FieldRow
                    label="Recurring payments"
                    value={
                      mandate.version.allowRecurring ? "Allowed" : "Not allowed"
                    }
                  />
                  <FieldRow
                    label="Condition"
                    value={
                      mandate.version.allowRefurbished
                        ? "Refurbished allowed"
                        : "New items only"
                    }
                  />
                  <FieldRow
                    label="Purchase type"
                    value={mandate.version.purchaseType}
                  />
                  <FieldRow
                    label="Maximum quantity"
                    value={String(mandate.version.maxQuantity)}
                  />
                  <FieldRow
                    label="Validity window"
                    value={`${formatUtc(mandate.version.validFrom)} → ${formatUtc(mandate.version.validUntil)}`}
                  />
                  <FieldRow
                    label="Approval mode"
                    value={
                      mandate.version.approvalMode === "MANUAL_REVIEW"
                        ? "MANUAL_REVIEW — ask me before executing"
                        : "AUTO — policy decides automatically"
                    }
                  />
                </dl>
              </div>
            </section>
          ) : null}

          {/* 3 — What the AI actually proposed. */}
          <section aria-labelledby={`pir-proposal-${key}`}>
            <BlockHeading id={`pir-proposal-${key}`}>
              AGENT PROPOSAL
            </BlockHeading>
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <SourceChip
                  source={current.source}
                  scenarioId={current.scenarioId}
                />
                {current.recurring ? (
                  <span className="font-data text-[10px] font-medium uppercase tracking-[0.12em] text-review">
                    RECURRING
                  </span>
                ) : null}
                <span className="font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {`CONDITION ${current.condition}`}
                </span>
                <span className="flex items-center gap-1 font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <Fingerprint aria-hidden="true" className="size-3" />
                  {current.fingerprintShort}
                </span>
              </div>
              {current.agent ? (
                <blockquote className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-[13px] italic leading-relaxed text-muted-foreground">
                  {`“${current.agent.request}”`}
                </blockquote>
              ) : null}
              {current.agent?.notes ? (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {current.agent.notes}
                </p>
              ) : null}
              <ul aria-label="Proposed items">
                {current.items.map((item) => (
                  <ItemLine
                    key={item.sku}
                    item={item}
                    currency={current.currency}
                  />
                ))}
              </ul>
              <TotalsRows transaction={current} />
              <RiskSignalChips signals={current.riskSignals} />
            </div>
          </section>

          {/* 4 — The deterministic decision, every rule every time. */}
          <section aria-labelledby={`pir-decision-${key}`}>
            <BlockHeading id={`pir-decision-${key}`}>
              POLICY DECISION
            </BlockHeading>
            {evaluation ? (
              <div className="mt-3 space-y-3">
                <DecisionBanner
                  decision={evaluation.decision}
                  ruleCount={evaluation.ruleOutcomes.length}
                />
                {evaluation.reasons.length > 0 ? (
                  <ul className="space-y-1 text-[13px] leading-relaxed text-muted-foreground">
                    {evaluation.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
                {evaluation.violations.length > 0 ? (
                  <div>
                    <p className="font-data text-[10px] uppercase tracking-[0.14em] text-block">
                      Violations
                    </p>
                    <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed text-block">
                      {evaluation.violations.map((violation) => (
                        <li key={violation}>{violation}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {evaluation.warnings.length > 0 ? (
                  <div>
                    <p className="font-data text-[10px] uppercase tracking-[0.14em] text-review">
                      Warnings — escalated to a human
                    </p>
                    <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed text-review">
                      {evaluation.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="rounded-lg border p-4">
                  <p className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {`ALL ${evaluation.ruleOutcomes.length} RULES · ENGINE v${evaluation.policyVersion} · ${firedRules.length} FIRED`}
                  </p>
                  <div className="mt-2">
                    <RuleOutcomeList outcomes={evaluation.ruleOutcomes} />
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-muted-foreground">
                No policy evaluation is recorded for this transaction.
              </p>
            )}
          </section>

          {/* 5 — The PayPal leg, told plainly. */}
          <section aria-labelledby={`pir-paypal-${key}`}>
            <BlockHeading id={`pir-paypal-${key}`}>PAYPAL</BlockHeading>
            <div className="mt-3 space-y-3">
              <p
                className={cn(
                  "rounded-lg border px-4 py-3 font-data text-[12px] font-medium uppercase tracking-[0.1em]",
                  current.status === "COMPLETED"
                    ? "border-allow/40 bg-allow/10 text-allow"
                    : current.paypal
                      ? "border-review/40 bg-review/10 text-review"
                      : "border-border bg-secondary/40 text-muted-foreground"
                )}
              >
                {current.paypalNarrative}
              </p>
              {current.paypal ? (
                <dl>
                  <FieldRow
                    label="PayPal order"
                    value={current.paypal.paypalOrderId}
                    valueClassName="break-all font-data text-[12px]"
                  />
                  <FieldRow
                    label="Capture"
                    value={
                      current.paypal.captureId ?? "—"
                    }
                    valueClassName="break-all font-data text-[12px]"
                  />
                  <FieldRow
                    label="Environment"
                    value={current.paypal.environment}
                    valueClassName="font-data text-[12px]"
                  />
                  <FieldRow
                    label="Amount"
                    value={formatMoney(
                      current.paypal.amount,
                      current.paypal.currency
                    )}
                    valueClassName="font-data text-[12px]"
                  />
                </dl>
              ) : null}
              {current.paypal?.approveUrl ? (
                <Button
                  type="button"
                  asChild
                  variant="outline"
                  className="h-11 border-review/40 font-data text-[11px] uppercase tracking-[0.14em] text-review hover:bg-review/10 hover:text-review"
                >
                  <a
                    href={current.paypal.approveUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    OPEN PAYPAL BUYER APPROVAL
                    <ExternalLink aria-hidden="true" className="size-4" />
                  </a>
                </Button>
              ) : null}
            </div>
          </section>

          {/* 6 — What happened, in order. */}
          <section aria-labelledby={`pir-timeline-${key}`}>
            <BlockHeading id={`pir-timeline-${key}`}>TIMELINE</BlockHeading>
            {current.timeline.length > 0 ? (
              <ol className="mt-3 overflow-hidden rounded-lg border">
                {current.timeline.map((entry, index) => (
                  <li
                    key={`${entry.time}-${index}`}
                    className="border-b px-4 py-3 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                      <span className="font-data text-[11px] font-medium tracking-[0.08em] text-foreground">
                        {entry.label}
                      </span>
                      <span className="font-data text-[10px] tracking-[0.06em] text-muted-foreground">
                        {formatUtc(entry.time)}
                      </span>
                    </div>
                    {entry.detail ? (
                      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                        {entry.detail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-[13px] text-muted-foreground">
                No timeline events recorded.
              </p>
            )}
          </section>

          {/* 7 — Append-only audit trail. */}
          <section aria-labelledby={`pir-audit-${key}`}>
            <BlockHeading id={`pir-audit-${key}`}>AUDIT TRAIL</BlockHeading>
            {current.audit.length > 0 ? (
              <ol className="mt-3 max-h-40 overflow-y-auto rounded-lg border px-4 py-1">
                {current.audit.map((event) => (
                  <li
                    key={`${event.eventType}-${event.correlationId}-${event.createdAt}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b py-1.5 last:border-b-0"
                  >
                    <span
                      className={cn(
                        "font-data text-[10px] font-medium uppercase tracking-[0.12em]",
                        transactionAuditTint(event.eventType)
                      )}
                    >
                      {event.eventType}
                    </span>
                    <span className="font-data text-[10px] tracking-[0.06em] text-muted-foreground">
                      {`${formatUtc(event.createdAt)} · #${event.correlationId.slice(0, 8)}`}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-[13px] text-muted-foreground">
                No audit events recorded.
              </p>
            )}
          </section>
        </div>

        <div className="shrink-0 border-t px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end">
            <div className="min-w-0 sm:mr-auto">
              <ExecutionControls
                transaction={current}
                variant="compact"
                onUpdated={(tx) => {
                  setCurrent(tx);
                  onUpdated?.(tx);
                }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-9 shrink-0 px-3 font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              CLOSE
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
