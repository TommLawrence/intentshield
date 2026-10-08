import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Append-only audit event writer — the single audit system for IntentShield.
 * Every state change in a mandate's life is recorded here, tied together by
 * one correlationId per end-to-end request chain.
 *
 * Payloads must be pre-sanitized by the caller (structured summaries, never
 * raw model output, never secrets). A defensive size cap keeps a runaway
 * payload from bloating the audit trail.
 */

export type AuditActorType = "USER" | "AGENT" | "POLICY_ENGINE" | "PAYMENT_EXECUTOR" | "SYSTEM";

export interface AuditEventInput {
  actorType: AuditActorType;
  actorId?: string | null;
  eventType: string;
  /** Trace id shared across the whole chain for one logical request. */
  correlationId: string;
  entityType?: string | null;
  entityId?: string | null;
  mandateId?: string | null;
  sessionId?: string | null;
  transactionId?: string | null;
  evaluationId?: string | null;
  paymentIntentId?: string | null;
  paypalOrderId?: string | null;
  payload?: Record<string, unknown> | null;
}

/** Hard cap on serialized payload size (defense in depth against bloat). */
const MAX_PAYLOAD_JSON_LENGTH = 8000;

function serializePayload(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  const json = JSON.stringify(payload);
  if (json.length <= MAX_PAYLOAD_JSON_LENGTH) return json;
  // Keep the event, drop the detail — an audit row without a payload is
  // still evidence that the event happened.
  return JSON.stringify({ truncated: true, note: "payload exceeded size cap" });
}

/**
 * Record an audit event. Accepts an open Prisma transaction so state changes
 * and their audit rows commit atomically; otherwise writes standalone.
 */
export async function recordAuditEvent(
  input: AuditEventInput,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx ?? db;
  await client.auditEvent.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      correlationId: input.correlationId,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      sessionId: input.sessionId ?? null,
      mandateId: input.mandateId ?? null,
      transactionId: input.transactionId ?? null,
      evaluationId: input.evaluationId ?? null,
      paymentIntentId: input.paymentIntentId ?? null,
      paypalOrderId: input.paypalOrderId ?? null,
      payload: serializePayload(input.payload),
    },
  });
}
