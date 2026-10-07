"use client";

import * as React from "react";
import { Check, CircleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import type {
  PolicyDecision,
  TransactionDetailResponse,
  TransactionItemSummary,
  TransactionRuleOutcome,
  TransactionStatus,
} from "@/lib/transactions/types";

/**
 * Shared client-side helpers for the agent console, adversarial lab and
 * activity ledger (Phases 3–7 UI).
 *
 * Money convention: API amounts are INTEGER MINOR UNITS (cents). The client
 * only formats for display — it never computes policy or money math.
 */

/** Typed error carrying the stable API error code (and details when present). */
export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Minimal JSON fetch wrapper for the frozen transaction API contract.
 * Errors are ALWAYS rethrown as ApiError with the body's code/message.
 */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...init,
      headers,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new ApiError("NETWORK", "Could not reach the IntentShield service.");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = body as { error?: { code: string; message: string; details?: unknown } } | null;
    const error =
      errorBody && typeof errorBody === "object" && "error" in errorBody
        ? errorBody.error
        : null;
    throw new ApiError(
      error?.code ?? "UNKNOWN",
      error?.message ?? `The service answered ${response.status}.`,
      error?.details
    );
  }
  return body as T;
}

/** String details from an API error's `details` field (arrays joined later). */
function stringDetails(details: unknown): string[] {
  if (Array.isArray(details)) {
    return details.filter((item): item is string => typeof item === "string");
  }
  if (typeof details === "string") {
    return [details];
  }
  return [];
}

/** Human-safe error text for toasts/alerts — never raw objects or stacks. */
export function formatApiErrorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const details = stringDetails(err.details);
    const detailText =
      details.length > 0 ? ` (${details.join(" · ")})` : "";
    const text = `${err.message}${detailText}`.trim();
    return text.length > 0 ? text : fallback;
  }
  return fallback;
}

/** `"2026-10-06T14:50:38.461Z"` → `"2026-10-06 14:50:38 UTC"`. */
export function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/** Compact ledger-column variant: `"10-06 14:50"` (UTC). */
export function formatUtcShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toISOString().slice(5, 16).replace("T", " ");
}

/** True when the fetch failed because the caller aborted it. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Block heading in the house mono micro-label style, as a semantic h3. */
export function BlockHeading({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      id={id}
      className={cn(
        "font-data text-[10px] uppercase tracking-[0.16em] text-muted-foreground",
        className
      )}
    >
      {children}
    </h3>
  );
}

/** Definition-list row: mono micro-label left, value right (stacked on mobile). */
export function FieldRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 font-data text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "text-[13px] leading-relaxed text-foreground sm:text-right",
          valueClassName
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ── Transaction display kit (agent console + Payment Intent Record) ──────── */

const DECISION_BANNER_STYLES: Record<PolicyDecision, string> = {
  ALLOW: "border-allow/40 bg-allow/10 text-allow",
  REVIEW: "border-review/40 bg-review/10 text-review",
  BLOCK: "border-block/40 bg-block/10 text-block",
};

function decisionBannerText(decision: PolicyDecision, rulesPassed: number): string {
  switch (decision) {
    case "ALLOW":
      return `ALLOW — all ${rulesPassed} rules passed`;
    case "REVIEW":
      return "REVIEW — needs human confirmation";
    case "BLOCK":
      return "BLOCK — hard rule violated";
  }
}

/** Decision banner: emerald/amber/rose panel with the normative semantics.
 *
 * Pass `onOpenDetails` to make the banner an interactive control that opens
 * the full Payment Intent Record for this decision — one touch, mobile-first
 * (a compact "tap for the full record" affordance shows below `sm`). Without
 * it the banner stays the plain passive panel (e.g. inside the record
 * itself, where the detail is already on screen).
 */
export function DecisionBanner({
  decision,
  ruleCount,
  className,
  onOpenDetails,
}: {
  decision: PolicyDecision;
  ruleCount: number;
  className?: string;
  /** Opens this decision's full Payment Intent Record when invoked. */
  onOpenDetails?: () => void;
}) {
  const text = decisionBannerText(decision, ruleCount);

  if (!onOpenDetails) {
    return (
      <p
        className={cn(
          "rounded-md border px-3 py-2.5 font-data text-[11px] font-medium uppercase tracking-[0.14em]",
          DECISION_BANNER_STYLES[decision],
          className
        )}
      >
        {text}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenDetails}
      aria-label={`Open the full Payment Intent Record for this ${decision} decision`}
      className={cn(
        "flex w-full cursor-pointer select-none touch-manipulation flex-col gap-1 rounded-md border px-3 py-2.5 text-left font-data text-[11px] font-medium uppercase tracking-[0.14em] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px",
        DECISION_BANNER_STYLES[decision],
        className
      )}
    >
      <span>{text}</span>
      <span className="text-[9px] tracking-[0.16em] opacity-80 sm:hidden">
        TAP TO OPEN THE FULL RECORD
      </span>
    </button>
  );
}

const OUTCOME_STYLES: Record<string, string> = {
  PASS: "text-muted-foreground",
  ALLOW: "text-allow",
  REVIEW: "text-review",
  BLOCK: "text-block",
};

/**
 * Every rule, every time: PASS muted with a check; fired rules colored with
 * their detail as a secondary line. The engine records PASS explicitly —
 * so does the UI.
 */
export function RuleOutcomeList({
  outcomes,
  id,
}: {
  outcomes: TransactionRuleOutcome[];
  id?: string;
}) {
  return (
    <ul
      id={id}
      className="grid gap-x-6 gap-y-1 sm:grid-cols-2"
      aria-label="Policy rule outcomes"
    >
      {outcomes.map((rule) => {
        const fired = rule.outcome !== "PASS";
        return (
          <li key={rule.code} className="min-w-0 py-1">
            <span className="flex items-baseline gap-2">
              {fired ? (
                <CircleAlert
                  aria-hidden="true"
                  className={cn("mt-0.5 size-3.5 shrink-0", OUTCOME_STYLES[rule.outcome])}
                />
              ) : (
                <Check
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70"
                />
              )}
              <span
                className={cn(
                  "font-data text-[11px] font-medium tracking-[0.06em]",
                  fired ? OUTCOME_STYLES[rule.outcome] : "text-muted-foreground"
                )}
              >
                {`${rule.code} · ${rule.name}`}
                <span className="sr-only">
                  {fired ? ` — rule fired with outcome ${rule.outcome}` : " — pass"}
                </span>
              </span>
            </span>
            {fired && rule.detail ? (
              <span
                className={cn(
                  "mt-0.5 block pl-[26px] text-[12px] leading-snug",
                  OUTCOME_STYLES[rule.outcome]
                )}
              >
                {rule.detail}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Amber risk-signal chips (adversarial-listing scanner vocabulary). */
export function RiskSignalChips({ signals }: { signals: string[] }) {
  if (signals.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Risk signals">
      {signals.map((signal) => (
        <Badge
          key={signal}
          variant="outline"
          className="border-review/40 bg-review/10 font-data text-[10px] font-medium uppercase tracking-[0.12em] text-review"
        >
          {signal}
        </Badge>
      ))}
    </div>
  );
}

/** Item line: "Name ×2 — USD 799.00 each" with line total on the right. */
export function ItemLine({ item, currency }: { item: TransactionItemSummary; currency: string }) {
  return (
    <li className="flex flex-col gap-0.5 border-b py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground">
          {item.name}
        </p>
        <p className="mt-0.5 font-data text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {`${item.sku} · ${item.merchant} · ${item.condition}${
            item.recurring ? " · RECURRING" : ""
          }`}
        </p>
      </div>
      <p className="shrink-0 font-data text-[12px] tracking-[0.04em] text-muted-foreground">
        {`×${item.quantity} × ${formatMoney(item.unitPrice, currency)}`}
        <span className="text-foreground">
          {` = ${formatMoney(item.lineTotal, currency)}`}
        </span>
      </p>
    </li>
  );
}

/** Totals block: subtotal → total (integer minor units, display only). */
export function TotalsRows({
  transaction,
}: {
  transaction: TransactionDetailResponse;
}) {
  const rows: { label: string; minor: number; emphasized?: boolean }[] = [
    { label: "Subtotal", minor: transaction.subtotal },
    { label: "Shipping", minor: transaction.shipping },
    { label: "Tax", minor: transaction.tax },
    ...(transaction.discount > 0
      ? [{ label: "Discount", minor: -transaction.discount }]
      : []),
    { label: "Total", minor: transaction.total, emphasized: true },
  ];
  return (
    <dl>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0"
        >
          <dt
            className={cn(
              "font-data text-[10px] uppercase tracking-[0.16em]",
              row.emphasized ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {row.label}
          </dt>
          <dd
            className={cn(
              "font-data tracking-[0.04em]",
              row.emphasized
                ? "text-[14px] font-semibold text-foreground"
                : "text-[12px] text-muted-foreground"
            )}
          >
            {formatMoney(row.minor, transaction.currency)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const STATUS_STYLES: Record<TransactionStatus, string> = {
  PROPOSED: "border-border bg-secondary/40 text-muted-foreground",
  EVALUATED: "border-allow/40 bg-allow/10 text-allow",
  IN_REVIEW: "border-review/50 bg-review/10 text-review",
  BLOCKED: "border-block/40 bg-block/10 text-block",
  EXECUTING: "border-review/50 bg-review/10 text-review",
  COMPLETED: "border-allow/40 bg-allow/10 text-allow",
  FAILED: "border-block/40 bg-block/10 text-block",
  CANCELLED: "border-border bg-secondary/40 text-muted-foreground",
};

/** Transaction lifecycle badge (ledger rows, PIR header). */
export function TransactionStatusBadge({
  status,
  className,
}: {
  status: TransactionStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-data text-[10px] font-medium uppercase tracking-[0.14em]",
        STATUS_STYLES[status],
        className
      )}
    >
      {status}
    </Badge>
  );
}
