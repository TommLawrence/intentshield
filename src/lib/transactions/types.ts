/**
 * Transaction domain types — shared between server services and the client UI.
 *
 * This file MUST stay free of server-only imports (db, env, SDK): the agent
 * console, adversarial lab and activity ledger import these types directly.
 *
 * Money convention: every amount is INTEGER MINOR UNITS (cents) across the API
 * boundary. The UI formats with formatMoney; humans never edit these values.
 */

import type { MandateStatus, MandateVersionSummary } from "@/lib/mandates/types";

export const TRANSACTION_STATUSES = [
  "PROPOSED",
  "EVALUATED",
  "IN_REVIEW",
  "BLOCKED",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Normative decision semantics (see policy/types.ts). */
export type PolicyDecision = "ALLOW" | "REVIEW" | "BLOCK";
export type RuleOutcomeKind = PolicyDecision | "PASS";

/** Transaction provenance. */
export type TransactionSource = "AGENT" | "LAB";

export interface TransactionItemSummary {
  sku: string;
  name: string;
  category: string;
  merchant: string;
  /** Minor units. */
  unitPrice: number;
  /** Minor units. */
  lineTotal: number;
  quantity: number;
  condition: "NEW" | "REFURBISHED";
  recurring: boolean;
  /** The agent's one-line reason for proposing this item (display only). */
  reason: string | null;
}

export interface TransactionRuleOutcome {
  code: string;
  name: string;
  outcome: RuleOutcomeKind;
  detail?: string;
}

export interface TransactionEvaluationSummary {
  evaluationId: string;
  decision: PolicyDecision;
  ruleOutcomes: TransactionRuleOutcome[];
  reasons: string[];
  violations: string[];
  warnings: string[];
  policyVersion: string;
  evaluatedAt: string; // ISO
}

export interface TransactionAgentMeta {
  provider: string;
  model: string;
  /** What the operator asked the agent to find. */
  request: string;
  /** The agent's short remark (display only, never authority). */
  notes: string | null;
  warnings: string[];
}

export interface TransactionPaypalOrder {
  paypalOrderId: string;
  status: string;
  captureId: string | null;
  amount: number; // minor units
  currency: string;
  environment: string;
  approveUrl: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface TransactionPaymentIntent {
  id: string;
  reference: string;
  executionId: string;
  status: string; // PENDING | AWAITING_BUYER | COMPLETED | BLOCKED | FAILED | CANCELLED
  decidedBy: string; // POLICY_ENGINE | USER
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface TimelineEntry {
  time: string; // ISO
  label: string;
  detail?: string;
}

/** Row in the activity ledger (GET /api/transactions). */
export interface TransactionListItem {
  id: string;
  createdAt: string; // ISO
  correlationId: string;
  source: TransactionSource;
  scenarioId: string | null;
  status: TransactionStatus;
  /** Latest evaluation decision; null if never evaluated. */
  decision: PolicyDecision | null;
  policyVersion: string | null;
  mandateId: string;
  mandateVersion: number;
  merchant: string;
  currency: string;
  /** Minor units. */
  total: number;
  itemCount: number;
  quantity: number;
  condition: string;
  recurring: boolean;
  riskSignals: string[];
  paymentIntent: { id: string; reference: string; status: string; decidedBy: string } | null;
  paypal: { orderId: string; status: string; captureId: string | null } | null;
}

/** GET /api/transactions/:id — the Payment Intent Record (§18). */
export interface TransactionDetailResponse {
  id: string;
  createdAt: string; // ISO
  correlationId: string;
  source: TransactionSource;
  scenarioId: string | null;
  status: TransactionStatus;
  decision: PolicyDecision | null;
  merchant: string;
  currency: string;
  subtotal: number; // minor units
  shipping: number; // minor units
  tax: number; // minor units
  discount: number; // minor units
  total: number; // minor units
  recurring: boolean;
  condition: string;
  quantity: number;
  riskSignals: string[];
  items: TransactionItemSummary[];
  fingerprintShort: string;
  agent: TransactionAgentMeta | null;
  mandate: {
    mandateId: string;
    title: string;
    instruction: string;
    /** Mandate status at read time — revoked mandates still show their history. */
    status: MandateStatus;
    version: MandateVersionSummary;
  } | null;
  evaluation: TransactionEvaluationSummary | null;
  paymentIntent: TransactionPaymentIntent | null;
  paypal: TransactionPaypalOrder | null;
  /**
   * Plain-language PayPal status for the PIR:
   * - "NOT REACHED — blocked by policy"
   * - "NOT REACHED — rejected by the operator"
   * - "NOT CREATED — awaiting guarded execution"
   * - "AWAITING BUYER APPROVAL"
   * - "CAPTURED — payment complete"
   * - "FAILED"
   */
  paypalNarrative: string;
  timeline: TimelineEntry[];
  audit: {
    eventType: string;
    actorType: string;
    correlationId: string;
    createdAt: string; // ISO
  }[];
}

/** POST /api/agent/search response. */
export interface AgentSearchResponse {
  correlationId: string;
  transaction: TransactionDetailResponse;
  agent: {
    provider: string;
    model: string;
    request: string;
    notes: string | null;
    picks: {
      sku: string;
      name: string | null;
      quantity: number;
      reason: string;
      resolved: boolean;
    }[];
    /** e.g. dropped hallucinated SKUs. */
    warnings: string[];
  };
}

/** Audit event vocabulary for the transaction + execution lifecycle. */
export const TRANSACTION_EVENT_TYPES = {
  AGENT_SESSION_STARTED: "AGENT_SESSION_STARTED",
  AGENT_SEARCH_COMPLETED: "AGENT_SEARCH_COMPLETED",
  TRANSACTION_PROPOSED: "TRANSACTION_PROPOSED",
  POLICY_DECIDED: "POLICY_DECIDED",
  TRANSACTION_REVIEW_REQUIRED: "TRANSACTION_REVIEW_REQUIRED",
  TRANSACTION_BLOCKED: "TRANSACTION_BLOCKED",
  TRANSACTION_APPROVED: "TRANSACTION_APPROVED",
  TRANSACTION_REJECTED: "TRANSACTION_REJECTED",
  EXECUTION_REFUSED: "EXECUTION_REFUSED",
  PAYPAL_NOT_CONFIGURED: "PAYPAL_NOT_CONFIGURED",
  PAYPAL_ORDER_CREATED: "PAYPAL_ORDER_CREATED",
  PAYPAL_CAPTURED: "PAYPAL_CAPTURED",
  PAYPAL_CAPTURE_FAILED: "PAYPAL_CAPTURE_FAILED",
  LAB_SCENARIO_RUN: "LAB_SCENARIO_RUN",
} as const;

/** Human-readable labels for transaction statuses (UI). */
export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  PROPOSED: "Proposed",
  EVALUATED: "Evaluated",
  IN_REVIEW: "Needs review",
  BLOCKED: "Blocked",
  EXECUTING: "Executing",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};
