import { createHash, randomUUID } from "crypto";

/**
 * Correlation & execution identifiers.
 * One correlationId ties every audit event of a single end-to-end request
 * together: intent → agent → policy → PayPal → outcome.
 */
export function newCorrelationId(): string {
  return randomUUID();
}

/** Application-level idempotency key for payment execution. */
export function newExecutionId(): string {
  return `exec_${randomUUID()}`;
}

/** Deterministic duplicate-detection key for a proposed transaction. */
export function transactionFingerprint(input: {
  mandateId: string;
  merchant: string;
  items: string;
  total: number;
  currency: string;
}): string {
  return createHash("sha256")
    .update(`${input.mandateId}|${input.merchant}|${input.items}|${input.total}|${input.currency}`)
    .digest("hex");
}

/** Human-readable payment intent reference, e.g. "IS-1042". */
export function paymentReference(sequence: number): string {
  return `IS-${1000 + sequence}`;
}
