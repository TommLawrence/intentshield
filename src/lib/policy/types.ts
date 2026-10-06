/**
 * IntentShield policy engine — domain contracts (Phase 1).
 *
 * The engine that implements these types is fully deterministic:
 * no LLM, no network, no time-of-eval randomness beyond the explicit
 * `now` passed in via the evaluation context. Same inputs → same decision,
 * always. It is unit-testable in isolation (tests land in the Codex phase).
 */

export const POLICY_ENGINE_VERSION = "1.0.0";

export type PolicyDecision = "ALLOW" | "REVIEW" | "BLOCK";

export type RuleOutcomeKind = PolicyDecision | "PASS";

/** Stable, machine-readable rule codes. Never renumber — audit records cite these. */
export type RuleCode =
  | "R-01"
  | "R-02"
  | "R-03"
  | "R-04"
  | "R-05"
  | "R-06"
  | "R-07"
  | "R-08"
  | "R-09"
  | "R-10"
  | "R-11"
  | "R-12"
  | "R-13"
  | "R-14";

export interface PolicyRuleDefinition {
  code: RuleCode;
  name: string;
  description: string;
  /** Outcome when the rule fires. R-13 surfaces as REVIEW; all others BLOCK. */
  outcomeOnViolation: PolicyDecision;
}

/**
 * The rule catalog — single source of truth. The UI rule table and the
 * engine's iteration order both derive from this list.
 */
export const POLICY_RULES: readonly PolicyRuleDefinition[] = [
  { code: "R-01", name: "Amount ceiling", description: "Total exceeds the mandate maximum", outcomeOnViolation: "BLOCK" },
  { code: "R-02", name: "Shipping ceiling", description: "Shipping exceeds the mandate maximum", outcomeOnViolation: "BLOCK" },
  { code: "R-03", name: "Currency mismatch", description: "Currency differs from the mandate currency", outcomeOnViolation: "BLOCK" },
  { code: "R-04", name: "Recurring charge", description: "Subscription/recurring charge where the mandate forbids it", outcomeOnViolation: "BLOCK" },
  { code: "R-05", name: "Condition violation", description: "Refurbished item where the mandate requires new", outcomeOnViolation: "BLOCK" },
  { code: "R-06", name: "Category restriction", description: "Category outside allowed list or on blocked list", outcomeOnViolation: "BLOCK" },
  { code: "R-07", name: "Merchant restriction", description: "Merchant outside allowed list or on blocked list", outcomeOnViolation: "BLOCK" },
  { code: "R-08", name: "Quantity limit", description: "Quantity exceeds mandate maximum", outcomeOnViolation: "BLOCK" },
  { code: "R-09", name: "Mandate expired", description: "Mandate validity window has elapsed", outcomeOnViolation: "BLOCK" },
  { code: "R-10", name: "Mandate not yet valid", description: "Before the mandate validity window", outcomeOnViolation: "BLOCK" },
  { code: "R-11", name: "Missing field", description: "Critical transaction field absent or malformed", outcomeOnViolation: "BLOCK" },
  { code: "R-12", name: "Duplicate execution", description: "Same transaction already executed (idempotency)", outcomeOnViolation: "BLOCK" },
  { code: "R-13", name: "Untrusted metadata", description: "Suspicious external signals (e.g. injected instructions)", outcomeOnViolation: "REVIEW" },
  { code: "R-14", name: "Structural inconsistency", description: "Transaction shape inconsistent with the mandate", outcomeOnViolation: "BLOCK" },
] as const;

/** Structured mandate constraints — the authoritative form of the user's will. */
export interface MandateConstraints {
  mandateId: string;
  mandateVersion: number;
  currency: string;
  /** Minor units (cents). */
  maxTotal: number;
  /** Minor units; null = no shipping ceiling was set. */
  maxShipping: number | null;
  allowedCategories: string[] | null; // null = all
  blockedCategories: string[] | null; // null = none
  allowedMerchants: string[] | null; // null = all
  blockedMerchants: string[] | null; // null = none
  allowRecurring: boolean;
  allowRefurbished: boolean;
  purchaseType: "ONE_TIME" | "RECURRING";
  maxQuantity: number;
  validFrom: Date;
  validUntil: Date;
  approvalMode: "AUTO" | "MANUAL_REVIEW";
}

export interface ProposalItem {
  sku: string;
  name: string;
  category: string;
  unitPrice: number; // minor units
  quantity: number;
  condition: "NEW" | "REFURBISHED";
  recurring: boolean;
}

/** An agent proposal — always UNTRUSTED input to the policy engine. */
export interface TransactionProposal {
  transactionId?: string;
  sessionId: string;
  merchant: string;
  items: ProposalItem[];
  subtotal: number; // minor units
  shipping: number; // minor units
  tax: number; // minor units
  discount: number; // minor units
  total: number; // minor units — the number the engine judges
  currency: string;
  recurring: boolean;
  quantity: number;
  /** Untrusted external content attached to the proposal (merchant metadata). */
  externalMetadata?: Record<string, unknown> | null;
  /** Deterministic risk signals (e.g. INJECTED_INSTRUCTIONS) — never model output. */
  riskSignals?: string[];
}

export interface EvaluationContext {
  /** Explicit clock — determinism and testability. */
  now: Date;
  /** Fingerprints of transactions already executed under the same mandate. */
  executedFingerprints: string[];
  /** Mandate status as persisted. */
  mandateStatus: string;
}

export interface RuleOutcome {
  code: RuleCode;
  outcome: RuleOutcomeKind;
  detail?: string;
}

export interface PolicyEvaluationResult {
  evaluationId: string;
  decision: PolicyDecision;
  /** Every rule, every time — a PASS is recorded, not implied. */
  ruleOutcomes: RuleOutcome[];
  reasons: string[];
  violations: string[];
  warnings: string[];
  policyVersion: string;
  evaluatedAt: string; // ISO 8601
}

/**
 * Decision semantics (normative):
 * - ALLOW  — complies with the mandate; may proceed to guarded PayPal execution.
 * - REVIEW — not clearly prohibited, but requires explicit human confirmation.
 * - BLOCK  — violates a hard rule; MUST NOT reach PayPal. The guarded executor
 *            structurally refuses BLOCK decisions — there is no code path that
 *            executes a blocked transaction.
 */
export interface PolicyEngine {
  evaluate(
    mandate: MandateConstraints,
    transaction: TransactionProposal,
    context: EvaluationContext
  ): PolicyEvaluationResult;
}
