import { createHash } from "crypto";

import { formatMoney } from "@/lib/money";
import {
  POLICY_ENGINE_VERSION,
  POLICY_RULES,
  type EvaluationContext,
  type MandateConstraints,
  type PolicyDecision,
  type PolicyEngine,
  type PolicyEvaluationResult,
  type RuleOutcome,
  type TransactionProposal,
} from "@/lib/policy/types";

/**
 * The IntentShield deterministic policy engine (Phase 4).
 *
 * Properties (normative, §16):
 * - COMPLETELY deterministic: no LLM, no network, no randomness, no clock
 *   reads — time arrives only through context.now. Same inputs always produce
 *   the same decision, the same rule outcomes and the same reasons.
 * - Every rule is evaluated on every call. A PASS is recorded explicitly,
 *   never implied by absence.
 * - Decision semantics: any BLOCK rule firing → BLOCK; otherwise any REVIEW
 *   rule firing → REVIEW; otherwise ALLOW.
 * - BLOCK is structural: the guarded executor refuses BLOCK decisions — there
 *   is no code path from a BLOCK decision to a PayPal call.
 */

const CURRENCY_RE = /^[A-Z]{3}$/;

function pass(code: RuleOutcome["code"], detail: string): RuleOutcome {
  return { code, outcome: "PASS", detail };
}

function money(minor: number, currency: string): string {
  return formatMoney(minor, currency);
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Deterministic evaluation id — derived from the judged inputs, not random. */
function deriveEvaluationId(
  mandate: MandateConstraints,
  proposal: TransactionProposal,
  now: Date
): string {
  return `pe_${createHash("sha256")
    .update(
      [
        mandate.mandateId,
        mandate.mandateVersion,
        proposal.fingerprint ?? "",
        proposal.merchant,
        proposal.total,
        proposal.currency,
        now.toISOString(),
      ].join("|")
    )
    .digest("hex")
    .slice(0, 24)}`;
}

class Engine implements PolicyEngine {
  evaluate(
    mandate: MandateConstraints,
    transaction: TransactionProposal,
    context: EvaluationContext
  ): PolicyEvaluationResult {
    const now = context.now;
    const outcomes: RuleOutcome[] = [];
    const cur = transaction.currency;

    // R-01 — amount ceiling
    if (transaction.total > mandate.maxTotal) {
      outcomes.push({
        code: "R-01",
        outcome: "BLOCK",
        detail: `Total ${money(transaction.total, cur)} exceeds the authorized maximum ${money(
          mandate.maxTotal,
          mandate.currency
        )} by ${money(transaction.total - mandate.maxTotal, cur)}.`,
      });
    } else {
      outcomes.push(
        pass("R-01", `Total ${money(transaction.total, cur)} is within the authorized maximum ${money(mandate.maxTotal, mandate.currency)}.`)
      );
    }

    // R-02 — shipping ceiling
    if (mandate.maxShipping !== null && transaction.shipping > mandate.maxShipping) {
      outcomes.push({
        code: "R-02",
        outcome: "BLOCK",
        detail: `Shipping ${money(transaction.shipping, cur)} exceeds the authorized maximum ${money(
          mandate.maxShipping,
          mandate.currency
        )} by ${money(transaction.shipping - mandate.maxShipping, cur)}.`,
      });
    } else {
      outcomes.push(
        pass(
          "R-02",
          mandate.maxShipping === null
            ? "No shipping ceiling was set on the mandate."
            : `Shipping ${money(transaction.shipping, cur)} is within the authorized maximum ${money(mandate.maxShipping, mandate.currency)}.`
        )
      );
    }

    // R-03 — currency mismatch
    if (transaction.currency !== mandate.currency) {
      outcomes.push({
        code: "R-03",
        outcome: "BLOCK",
        detail: `Transaction currency ${transaction.currency} differs from the mandate currency ${mandate.currency}.`,
      });
    } else {
      outcomes.push(pass("R-03", `Currency ${transaction.currency} matches the mandate.`));
    }

    // R-04 — recurring charge where forbidden
    const hasRecurringItem = transaction.recurring || transaction.items.some((i) => i.recurring);
    if (hasRecurringItem && !mandate.allowRecurring) {
      const recurringSkus = transaction.items.filter((i) => i.recurring).map((i) => i.sku);
      outcomes.push({
        code: "R-04",
        outcome: "BLOCK",
        detail: `Recurring/subscription charge where the mandate prohibits it${
          recurringSkus.length > 0 ? ` (recurring items: ${recurringSkus.join(", ")})` : ""
        }.`,
      });
    } else {
      outcomes.push(
        pass("R-04", mandate.allowRecurring ? "Recurring charges are authorized by this mandate." : "No recurring charges in the proposal.")
      );
    }

    // R-05 — refurbished where prohibited
    const hasRefurbished = transaction.items.some((i) => i.condition === "REFURBISHED");
    if (hasRefurbished && !mandate.allowRefurbished) {
      const refurbSkus = transaction.items.filter((i) => i.condition === "REFURBISHED").map((i) => i.sku);
      outcomes.push({
        code: "R-05",
        outcome: "BLOCK",
        detail: `Refurbished item where the mandate requires new${
          refurbSkus.length > 0 ? ` (refurbished items: ${refurbSkus.join(", ")})` : ""
        }.`,
      });
    } else {
      outcomes.push(
        pass("R-05", mandate.allowRefurbished ? "Refurbished items are authorized by this mandate." : "All items are new.")
      );
    }

    // R-06 — category restriction
    const allowedCats = mandate.allowedCategories?.map((c) => c.toLowerCase()) ?? null;
    const blockedCats = mandate.blockedCategories?.map((c) => c.toLowerCase()) ?? null;
    const itemCategories = Array.from(new Set(transaction.items.map((i) => i.category.toLowerCase())));
    const outsideAllowed =
      allowedCats !== null ? itemCategories.filter((c) => !allowedCats.includes(c)) : [];
    const onBlocked =
      blockedCats !== null ? itemCategories.filter((c) => blockedCats.includes(c)) : [];
    if (outsideAllowed.length > 0 || onBlocked.length > 0) {
      const parts: string[] = [];
      if (outsideAllowed.length > 0) parts.push(`outside the allowed categories (allowed: ${allowedCats!.join(", ")})`);
      if (onBlocked.length > 0) parts.push(`on the blocked categories (${onBlocked.join(", ")})`);
      outcomes.push({ code: "R-06", outcome: "BLOCK", detail: `Category violation: ${parts.join("; ")}.` });
    } else {
      outcomes.push(pass("R-06", itemCategories.length > 0 ? `Categories ${itemCategories.join(", ")} are permitted.` : "No category items."));
    }

    // R-07 — merchant restriction
    const allowedMerchants = mandate.allowedMerchants ?? null;
    const blockedMerchants = mandate.blockedMerchants ?? null;
    const txMerchant = transaction.merchant.trim();
    const merchantBlocked =
      (allowedMerchants !== null && !allowedMerchants.some((m) => equalsIgnoreCase(m, txMerchant))) ||
      (blockedMerchants !== null && blockedMerchants.some((m) => equalsIgnoreCase(m, txMerchant)));
    if (merchantBlocked) {
      const why =
        allowedMerchants !== null && !allowedMerchants.some((m) => equalsIgnoreCase(m, txMerchant))
          ? `not in the allowed merchant list (${allowedMerchants.join(", ")})`
          : `on the blocked merchant list`;
      outcomes.push({ code: "R-07", outcome: "BLOCK", detail: `Merchant "${txMerchant}" is ${why}.` });
    } else {
      outcomes.push(pass("R-07", `Merchant "${txMerchant}" is permitted.`));
    }

    // R-08 — quantity limit
    if (transaction.quantity > mandate.maxQuantity) {
      outcomes.push({
        code: "R-08",
        outcome: "BLOCK",
        detail: `Quantity ${transaction.quantity} exceeds the mandate maximum of ${mandate.maxQuantity}.`,
      });
    } else {
      outcomes.push(pass("R-08", `Quantity ${transaction.quantity} is within the mandate maximum of ${mandate.maxQuantity}.`));
    }

    // R-09 — mandate expired
    if (now.getTime() > mandate.validUntil.getTime()) {
      outcomes.push({ code: "R-09", outcome: "BLOCK", detail: `The mandate's validity window ended ${mandate.validUntil.toISOString()}.` });
    } else {
      outcomes.push(pass("R-09", `Mandate is valid until ${mandate.validUntil.toISOString()}.`));
    }

    // R-10 — mandate not yet valid
    if (now.getTime() < mandate.validFrom.getTime()) {
      outcomes.push({ code: "R-10", outcome: "BLOCK", detail: `The mandate's validity window opens ${mandate.validFrom.toISOString()}.` });
    } else {
      outcomes.push(pass("R-10", `Mandate has been valid since ${mandate.validFrom.toISOString()}.`));
    }

    // R-11 — missing / malformed critical fields
    const missing: string[] = [];
    if (typeof transaction.merchant !== "string" || transaction.merchant.trim().length === 0) missing.push("merchant");
    if (!Array.isArray(transaction.items) || transaction.items.length === 0) missing.push("items");
    if (!Number.isInteger(transaction.total) || transaction.total <= 0) missing.push("total");
    if (typeof transaction.currency !== "string" || !CURRENCY_RE.test(transaction.currency)) missing.push("currency");
    if (!Number.isInteger(transaction.quantity) || transaction.quantity < 1) missing.push("quantity");
    if (missing.length > 0) {
      outcomes.push({ code: "R-11", outcome: "BLOCK", detail: `Critical transaction information missing or malformed: ${missing.join(", ")}.` });
    } else {
      outcomes.push(pass("R-11", "All critical transaction fields are present and well-formed."));
    }

    // R-12 — duplicate execution (idempotency)
    if (transaction.fingerprint && context.executedFingerprints.includes(transaction.fingerprint)) {
      outcomes.push({
        code: "R-12",
        outcome: "BLOCK",
        detail:
          "An identical transaction (same merchant, items, total, currency) was already accepted under this mandate. Possible duplicate/retry — nothing was executed twice.",
      });
    } else {
      outcomes.push(pass("R-12", "No identical live transaction exists under this mandate."));
    }

    // R-13 — untrusted external metadata / injected instructions (→ human review)
    const signals = transaction.riskSignals ?? [];
    if (signals.length > 0) {
      outcomes.push({
        code: "R-13",
        outcome: "REVIEW",
        detail: `Untrusted external signals detected: ${signals.join(", ")}. The content was treated as data; a human must confirm.`,
      });
    } else {
      outcomes.push(pass("R-13", "No suspicious external signals detected."));
    }

    // R-14 — structural consistency
    const structural: string[] = [];
    const expectedSubtotal = transaction.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    if (transaction.subtotal !== expectedSubtotal) {
      structural.push(`subtotal ${money(transaction.subtotal, cur)} does not match items ${money(expectedSubtotal, cur)}`);
    }
    const expectedTotal = transaction.subtotal + transaction.shipping + transaction.tax - transaction.discount;
    if (transaction.total !== expectedTotal) {
      structural.push(`total ${money(transaction.total, cur)} does not match subtotal+shipping+tax-discount ${money(expectedTotal, cur)}`);
    }
    const expectedQuantity = transaction.items.reduce((sum, i) => sum + i.quantity, 0);
    if (transaction.quantity !== expectedQuantity) {
      structural.push(`quantity ${transaction.quantity} does not match item quantities ${expectedQuantity}`);
    }
    const expectedRecurring = transaction.items.some((i) => i.recurring);
    if (transaction.recurring !== expectedRecurring) {
      structural.push("recurring flag does not match the items");
    }
    const itemMerchants = new Set(transaction.items.map((i) => (i.merchant ?? "").trim().toLowerCase()).filter(Boolean));
    if (itemMerchants.size > 1) {
      structural.push("items span multiple merchants — single-merchant transactions only in this MVP");
    } else if (itemMerchants.size === 1 && transaction.merchant.trim().length > 0) {
      const [only] = itemMerchants;
      if (!equalsIgnoreCase(transaction.merchant, only)) structural.push("merchant does not match the items' merchant");
    }
    if (structural.length > 0) {
      outcomes.push({ code: "R-14", outcome: "BLOCK", detail: `Transaction structure is inconsistent: ${structural.join("; ")}.` });
    } else {
      outcomes.push(pass("R-14", "Transaction structure is internally consistent."));
    }

    // R-15 — mandate approval mode (→ human review for EVERY transaction)
    if (mandate.approvalMode === "MANUAL_REVIEW") {
      outcomes.push({
        code: "R-15",
        outcome: "REVIEW",
        detail: "The mandate requires explicit human review of every transaction (approval mode MANUAL_REVIEW).",
      });
    } else {
      outcomes.push(pass("R-15", "Mandate approval mode is AUTO — no per-transaction human review required."));
    }

    // R-16 — mandate not ACTIVE
    if (context.mandateStatus !== "ACTIVE") {
      outcomes.push({
        code: "R-16",
        outcome: "BLOCK",
        detail: `The mandate is not active (status: ${context.mandateStatus}). A ${context.mandateStatus} mandate can never authorize a payment.`,
      });
    } else {
      outcomes.push(pass("R-16", "Mandate status is ACTIVE."));
    }

    // ── Decision: BLOCK > REVIEW > ALLOW ────────────────────────────────────
    const violations = outcomes.filter((o) => o.outcome === "BLOCK");
    const reviews = outcomes.filter((o) => o.outcome === "REVIEW");
    const decision: PolicyDecision = violations.length > 0 ? "BLOCK" : reviews.length > 0 ? "REVIEW" : "ALLOW";

    const reasons: string[] = [];
    if (decision === "BLOCK") {
      reasons.push(`BLOCK — ${violations.length} hard rule(s) violated: ${violations.map((v) => v.code).join(", ")}.`);
      reasons.push("The transaction never reaches PayPal. There is no execution path for a blocked transaction.");
    } else if (decision === "REVIEW") {
      reasons.push(`REVIEW — ${reviews.length} condition(s) require human confirmation: ${reviews.map((v) => v.code).join(", ")}.`);
      reasons.push("Nothing executes until a human explicitly approves.");
    } else {
      reasons.push(`ALLOW — all ${POLICY_RULES.length} rules passed against mandate V${mandate.mandateVersion}.`);
    }

    return {
      evaluationId: deriveEvaluationId(mandate, transaction, now),
      decision,
      ruleOutcomes: outcomes,
      reasons,
      violations: violations.map((v) => v.detail ?? v.code),
      warnings: reviews.map((v) => v.detail ?? v.code),
      policyVersion: POLICY_ENGINE_VERSION,
      evaluatedAt: now.toISOString(),
    };
  }
}

/** The single deterministic engine instance (stateless — pure functions). */
export const policyEngine: PolicyEngine = new Engine();

/**
 * Convenience wrapper used by services and the adversarial lab.
 * The engine never touches the database — callers assemble pure inputs.
 */
export function evaluateTransaction(
  mandate: MandateConstraints,
  transaction: TransactionProposal,
  context: EvaluationContext
): PolicyEvaluationResult {
  return policyEngine.evaluate(mandate, transaction, context);
}
