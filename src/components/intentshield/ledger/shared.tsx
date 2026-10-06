"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TRANSACTION_EVENT_TYPES,
  type TransactionListItem,
  type TransactionSource,
} from "@/lib/transactions/types";

/**
 * Ledger-specific helpers: the cross-component refresh event, table-cell
 * vocabulary (source chip, short PayPal narrative, audit tints).
 */

/** Window event the return handler dispatches so the ledger refetches. */
export const LEDGER_REFRESH_EVENT = "intentshield:ledger-refresh";

export function dispatchLedgerRefresh() {
  window.dispatchEvent(new CustomEvent(LEDGER_REFRESH_EVENT));
}

/** True while a scenario/transaction filter is live. */
export function isTransactionSource(value: string): value is TransactionSource {
  return value === "AGENT" || value === "LAB";
}

/** LAB rows carry their scenario letter ("B_OVER_BUDGET" → "B"). */
export function scenarioLetter(scenarioId: string | null): string | null {
  if (!scenarioId || scenarioId.length === 0) {
    return null;
  }
  return scenarioId.charAt(0);
}

/** Short honest PayPal column text for a ledger row. */
export function paypalShort(row: TransactionListItem): string {
  if (row.paypal?.captureId) {
    return "CAPTURED";
  }
  switch (row.status) {
    case "COMPLETED":
      return "CAPTURED";
    case "EXECUTING":
      return row.paypal ? "awaiting buyer" : "—";
    case "BLOCKED":
    case "CANCELLED":
      return "not reached";
    case "FAILED":
      return "failed";
    default:
      return "not created";
  }
}

/** AGENT / LAB provenance chip; LAB rows also carry their scenario letter. */
export function SourceChip({
  source,
  scenarioId,
}: {
  source: TransactionSource;
  scenarioId: string | null;
}) {
  const letter = scenarioLetter(scenarioId);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge
        variant="outline"
        className={cn(
          "font-data text-[10px] font-medium uppercase tracking-[0.12em]",
          source === "LAB"
            ? "border-primary/30 bg-primary/5 text-primary"
            : "border-border bg-secondary/40 text-muted-foreground"
        )}
      >
        {source}
      </Badge>
      {source === "LAB" && letter ? (
        <span
          aria-label={`Lab scenario ${letter}`}
          className="font-data text-[10px] font-medium tracking-[0.12em] text-muted-foreground"
        >
          {letter}
        </span>
      ) : null}
    </span>
  );
}

/** Audit-trail tinting for transaction lifecycle events (PIR dialog). */
const TRANSACTION_AUDIT_TINTS: { match: string; className: string }[] = [
  {
    match: TRANSACTION_EVENT_TYPES.TRANSACTION_APPROVED,
    className: "text-allow",
  },
  {
    match: TRANSACTION_EVENT_TYPES.PAYPAL_CAPTURED,
    className: "text-allow",
  },
  {
    match: TRANSACTION_EVENT_TYPES.PAYPAL_ORDER_CREATED,
    className: "text-allow",
  },
  {
    match: TRANSACTION_EVENT_TYPES.TRANSACTION_REJECTED,
    className: "text-block",
  },
  {
    match: TRANSACTION_EVENT_TYPES.EXECUTION_REFUSED,
    className: "text-block",
  },
  {
    match: TRANSACTION_EVENT_TYPES.PAYPAL_CAPTURE_FAILED,
    className: "text-block",
  },
  {
    match: TRANSACTION_EVENT_TYPES.TRANSACTION_REVIEW_REQUIRED,
    className: "text-review",
  },
  {
    match: TRANSACTION_EVENT_TYPES.PAYPAL_NOT_CONFIGURED,
    className: "text-review",
  },
];

export function transactionAuditTint(eventType: string): string {
  return (
    TRANSACTION_AUDIT_TINTS.find((entry) => entry.match === eventType)
      ?.className ?? "text-muted-foreground"
  );
}

/**
 * Convenience hook: subscribe to the cross-component ledger refresh event
 * (dispatched by the PayPal return handler after a capture).
 */
export function useLedgerRefreshListener(onRefresh: () => void) {
  const handler = React.useRef(onRefresh);
  React.useEffect(() => {
    handler.current = onRefresh;
  }, [onRefresh]);
  React.useEffect(() => {
    const listener = () => handler.current();
    window.addEventListener(LEDGER_REFRESH_EVENT, listener);
    return () => window.removeEventListener(LEDGER_REFRESH_EVENT, listener);
  }, []);
}
