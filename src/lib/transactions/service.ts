import { db } from "@/lib/db";
import { newExecutionId, paymentReference } from "@/lib/correlation";
import { recordAuditEvent } from "@/lib/audit";
import { isPayPalConfigured } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { MandateApiError } from "@/lib/mandates/service";
import { deriveMandateTitle } from "@/lib/mandates/normalize";
import type { MandateVersionSummary, MandateStatus } from "@/lib/mandates/types";
import { evaluateTransaction } from "@/lib/policy/engine";
import { POLICY_RULES, type MandateConstraints, type PolicyEvaluationResult, type TransactionProposal } from "@/lib/policy/types";
import { createOrder, captureOrder, getOrder, PayPalApiError, PayPalNotConfiguredError } from "@/lib/paypal/client";
import {
  captureRequestSchema,
  executeRequestSchema,
  formatZodIssues,
  reviewRequestSchema,
} from "@/lib/transactions/validation";
import {
  TRANSACTION_EVENT_TYPES,
  type PolicyDecision,
  type TimelineEntry,
  type TransactionDetailResponse,
  type TransactionItemSummary,
  type TransactionListItem,
  type TransactionPaymentIntent,
  type TransactionStatus,
} from "@/lib/transactions/types";

/**
 * Transaction lifecycle service (Phase 4/5) — review, guarded execution,
 * capture and the Payment Intent Record.
 *
 * THE GUARDED EXECUTOR (normative):
 * 1. receives a transaction id (never a raw payment request)
 * 2. loads the exact mandate version the transaction was judged against
 * 3. RE-EVALUATES policy deterministically at execution time (defense in depth
 *    — a mandate revoked between proposal and execution BLOCKs here)
 * 4. checks idempotency (one PaymentIntent live per transaction; retries return
 *    the existing PayPal order, never a second charge)
 * 5. only then invokes PayPal — and ONLY for ALLOW (or human-approved REVIEW)
 * 6. records every step in the audit trail
 *
 * There is no code path that executes a BLOCKed transaction.
 */

const DEMO_USER_EMAIL = "demo@intentshield.local";

type TxRow = {
  id: string;
  mandateId: string;
  mandateVersion: number;
  sessionId: string;
  merchant: string;
  items: string;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  recurring: boolean;
  condition: string;
  quantity: number;
  externalMetadata: string | null;
  riskSignals: string | null;
  fingerprint: string;
  status: string;
  source: string;
  scenarioId: string | null;
  correlationId: string;
  agentMeta: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type EvaluationRow = {
  id: string;
  decision: string;
  ruleOutcomes: string;
  reasons: string;
  violations: string;
  warnings: string;
  policyVersion: string;
  evaluatedAt: Date;
};

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseItems(raw: string): TransactionItemSummary[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TransactionItemSummary[];
  } catch {
    return [];
  }
}

function parseAgentMeta(raw: string | null): TransactionDetailResponse["agent"] {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      provider: string;
      model: string;
      request: string;
      notes: string | null;
      warnings: string[];
    };
    return parsed ?? null;
  } catch {
    return null;
  }
}

/** Rebuild the engine's TransactionProposal from the persisted row. */
function proposalFromRow(tx: TxRow): TransactionProposal {
  const items = parseItems(tx.items).map((i) => ({
    sku: i.sku,
    name: i.name,
    category: i.category,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    condition: i.condition,
    recurring: i.recurring,
    merchant: i.merchant,
  }));
  return {
    transactionId: tx.id,
    sessionId: tx.sessionId,
    merchant: tx.merchant,
    items,
    subtotal: tx.subtotal,
    shipping: tx.shipping,
    tax: tx.tax,
    discount: tx.discount,
    total: tx.total,
    currency: tx.currency,
    recurring: tx.recurring,
    quantity: tx.quantity,
    externalMetadata: tx.externalMetadata ? JSON.parse(tx.externalMetadata) : null,
    riskSignals: parseJsonArray(tx.riskSignals),
    fingerprint: tx.fingerprint,
  };
}

async function mandateConstraintsFor(tx: TxRow): Promise<{ constraints: MandateConstraints; mandateStatus: string } | null> {
  const mandate = await db.mandate.findUnique({
    where: { id: tx.mandateId },
    include: { versions: { where: { version: tx.mandateVersion } } },
  });
  if (!mandate) return null;
  const version = mandate.versions[0];
  if (!version) return null;
  return {
    constraints: {
      mandateId: mandate.id,
      mandateVersion: version.version,
      currency: version.currency,
      maxTotal: version.maxTotal,
      maxShipping: version.maxShipping,
      allowedCategories: version.allowedCategories ? JSON.parse(version.allowedCategories) : null,
      blockedCategories: version.blockedCategories ? JSON.parse(version.blockedCategories) : null,
      allowedMerchants: version.allowedMerchants ? JSON.parse(version.allowedMerchants) : null,
      blockedMerchants: version.blockedMerchants ? JSON.parse(version.blockedMerchants) : null,
      allowRecurring: version.allowRecurring,
      allowRefurbished: version.allowRefurbished,
      purchaseType: version.purchaseType === "RECURRING" ? "RECURRING" : "ONE_TIME",
      maxQuantity: version.maxQuantity,
      validFrom: version.validFrom,
      validUntil: version.validUntil,
      approvalMode: version.approvalMode === "MANUAL_REVIEW" ? "MANUAL_REVIEW" : "AUTO",
    },
    mandateStatus: mandate.status,
  };
}

function toVersionSummary(version: {
  version: number;
  createdAt: Date;
  currency: string;
  maxTotal: number;
  maxShipping: number | null;
  allowRecurring: boolean;
  allowRefurbished: boolean;
  purchaseType: string;
  maxQuantity: number;
  validFrom: Date;
  validUntil: Date;
  approvalMode: string;
  allowedCategories: string | null;
  blockedCategories: string | null;
  allowedMerchants: string | null;
  blockedMerchants: string | null;
}): MandateVersionSummary {
  return {
    version: version.version,
    createdAt: version.createdAt.toISOString(),
    currency: version.currency,
    maxTotal: version.maxTotal,
    maxShipping: version.maxShipping,
    allowRecurring: version.allowRecurring,
    allowRefurbished: version.allowRefurbished,
    purchaseType: version.purchaseType === "RECURRING" ? "RECURRING" : "ONE_TIME",
    maxQuantity: version.maxQuantity,
    validFrom: version.validFrom.toISOString(),
    validUntil: version.validUntil.toISOString(),
    approvalMode: version.approvalMode === "MANUAL_REVIEW" ? "MANUAL_REVIEW" : "AUTO",
    allowedCategories: version.allowedCategories ? JSON.parse(version.allowedCategories) : null,
    blockedCategories: version.blockedCategories ? JSON.parse(version.blockedCategories) : null,
    allowedMerchants: version.allowedMerchants ? JSON.parse(version.allowedMerchants) : null,
    blockedMerchants: version.blockedMerchants ? JSON.parse(version.blockedMerchants) : null,
    isCurrent: true, // caller corrects
  };
}

function paypalNarrativeFor(tx: TxRow, decision: PolicyDecision | null, intent: TransactionPaymentIntent | null, paypal: TransactionDetailResponse["paypal"]): string {
  if (tx.status === "BLOCKED" || decision === "BLOCK") {
    return "NOT REACHED — blocked by policy. No PayPal order was created.";
  }
  if (tx.status === "CANCELLED") {
    return "NOT REACHED — rejected/cancelled by the operator. No PayPal order exists.";
  }
  if (paypal?.status === "CAPTURED") {
    return `CAPTURED — payment complete (capture ${paypal.captureId ?? "—"}).`;
  }
  if (intent?.status === "AWAITING_BUYER") {
    return "ORDER CREATED — awaiting buyer approval on PayPal Sandbox.";
  }
  if (intent?.status === "FAILED") {
    return "FAILED — the PayPal order could not be created.";
  }
  return "NOT CREATED — awaiting guarded execution.";
}

/** Build the full Payment Intent Record for one transaction. */
export async function getTransactionDetail(transactionId: string): Promise<TransactionDetailResponse> {
  const tx = await db.proposedTransaction.findUnique({
    where: { id: transactionId },
    include: {
      evaluations: { orderBy: { evaluatedAt: "desc" } },
      paymentIntents: { orderBy: { createdAt: "desc" }, include: { paypalOrder: true } },
    },
  });
  if (!tx) throw new MandateApiError(404, "NOT_FOUND", "Transaction not found.");

  const latestEval: EvaluationRow | null = tx.evaluations[0] ?? null;
  const intentRow = tx.paymentIntents[0] ?? null;

  const mandateRow = await db.mandate.findUnique({
    where: { id: tx.mandateId },
    include: { versions: { where: { version: tx.mandateVersion } } },
  });

  const ruleNames = new Map<string, string>(POLICY_RULES.map((r) => [r.code as string, r.name]));
  const decision = (latestEval?.decision as PolicyDecision | undefined) ?? null;

  const auditRows = await db.auditEvent.findMany({
    where: { transactionId: tx.id },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { eventType: true, actorType: true, correlationId: true, createdAt: true },
  });

  const timeline: TimelineEntry[] = [];
  timeline.push({
    time: tx.createdAt.toISOString(),
    label: "TRANSACTION PROPOSED",
    detail: `${tx.source === "LAB" ? "Adversarial lab" : "Agent"} proposed ${parseItems(tx.items).length} item(s) from ${tx.merchant || "an unknown merchant"}.`,
  });
  if (latestEval) {
    timeline.push({
      time: latestEval.evaluatedAt.toISOString(),
      label: `POLICY DECIDED — ${latestEval.decision}`,
      detail: `Deterministic engine v${latestEval.policyVersion} against mandate V${tx.mandateVersion}.`,
    });
  }
  for (const event of auditRows) {
    if (event.eventType === TRANSACTION_EVENT_TYPES.TRANSACTION_PROPOSED || event.eventType === TRANSACTION_EVENT_TYPES.POLICY_DECIDED) {
      continue; // already represented above
    }
    timeline.push({
      time: event.createdAt.toISOString(),
      label: event.eventType.replace(/_/g, " "),
      detail: `${event.actorType} · correlation ${event.correlationId.slice(0, 8)}`,
    });
  }
  if (intentRow?.paypalOrder) {
    timeline.push({
      time: intentRow.paypalOrder.createdAt.toISOString(),
      label: "PAYPAL ORDER CREATED",
      detail: `Sandbox order ${intentRow.paypalOrder.paypalOrderId} · ${formatMoney(intentRow.paypalOrder.amount, intentRow.paypalOrder.currency)}.`,
    });
  }
  timeline.sort((a, b) => a.time.localeCompare(b.time));

  const paypal = intentRow?.paypalOrder
    ? {
        paypalOrderId: intentRow.paypalOrder.paypalOrderId,
        status: intentRow.paypalOrder.status,
        captureId: intentRow.paypalOrder.captureId,
        amount: intentRow.paypalOrder.amount,
        currency: intentRow.paypalOrder.currency,
        environment: intentRow.paypalOrder.environment,
        approveUrl: intentRow.paypalOrder.approveUrl,
        createdAt: intentRow.paypalOrder.createdAt.toISOString(),
        updatedAt: intentRow.paypalOrder.updatedAt.toISOString(),
      }
    : null;

  const intent: TransactionPaymentIntent | null = intentRow
    ? {
        id: intentRow.id,
        reference: intentRow.reference,
        executionId: intentRow.executionId,
        status: intentRow.status,
        decidedBy: intentRow.decidedBy,
        createdAt: intentRow.createdAt.toISOString(),
        updatedAt: intentRow.updatedAt.toISOString(),
      }
    : null;

  return {
    id: tx.id,
    createdAt: tx.createdAt.toISOString(),
    correlationId: tx.correlationId,
    source: tx.source === "LAB" ? "LAB" : "AGENT",
    scenarioId: tx.scenarioId,
    status: tx.status as TransactionStatus,
    decision,
    merchant: tx.merchant,
    currency: tx.currency,
    subtotal: tx.subtotal,
    shipping: tx.shipping,
    tax: tx.tax,
    discount: tx.discount,
    total: tx.total,
    recurring: tx.recurring,
    condition: tx.condition,
    quantity: tx.quantity,
    riskSignals: parseJsonArray(tx.riskSignals),
    items: parseItems(tx.items),
    fingerprintShort: tx.fingerprint.slice(0, 16),
    agent: parseAgentMeta(tx.agentMeta),
    mandate: mandateRow
      ? {
          mandateId: mandateRow.id,
          title: deriveMandateTitle(mandateRow.naturalLanguageIntent),
          instruction: mandateRow.naturalLanguageIntent,
          status: mandateRow.status as MandateStatus,
          version: {
            ...toVersionSummary(mandateRow.versions[0]),
            isCurrent: mandateRow.versions[0]?.version === mandateRow.currentVersion,
          },
        }
      : null,
    evaluation: latestEval
      ? {
          evaluationId: latestEval.id,
          decision: latestEval.decision as PolicyDecision,
          ruleOutcomes: (JSON.parse(latestEval.ruleOutcomes) as { code: string; outcome: string; detail?: string }[]).map((o) => ({
            code: o.code,
            name: ruleNames.get(o.code) ?? o.code,
            outcome: o.outcome as "PASS" | "ALLOW" | "REVIEW" | "BLOCK",
            detail: o.detail,
          })),
          reasons: JSON.parse(latestEval.reasons) as string[],
          violations: JSON.parse(latestEval.violations) as string[],
          warnings: JSON.parse(latestEval.warnings) as string[],
          policyVersion: latestEval.policyVersion,
          evaluatedAt: latestEval.evaluatedAt.toISOString(),
        }
      : null,
    paymentIntent: intent,
    paypal,
    paypalNarrative: paypalNarrativeFor(tx, decision, intent, paypal),
    timeline,
    audit: auditRows
      .slice()
      .reverse()
      .map((a) => ({ eventType: a.eventType, actorType: a.actorType, correlationId: a.correlationId, createdAt: a.createdAt.toISOString() })),
  };
}

/** GET /api/transactions — the activity ledger. */
export async function listTransactions(): Promise<{ transactions: TransactionListItem[] }> {
  const rows = await db.proposedTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      evaluations: { orderBy: { evaluatedAt: "desc" }, take: 1 },
      paymentIntents: { orderBy: { createdAt: "desc" }, include: { paypalOrder: true } },
    },
  });

  return {
    transactions: rows.map((tx) => {
      const latest = tx.evaluations[0] ?? null;
      const intent = tx.paymentIntents[0] ?? null;
      return {
        id: tx.id,
        createdAt: tx.createdAt.toISOString(),
        correlationId: tx.correlationId,
        source: tx.source === "LAB" ? ("LAB" as const) : ("AGENT" as const),
        scenarioId: tx.scenarioId,
        status: tx.status as TransactionStatus,
        decision: (latest?.decision as PolicyDecision | undefined) ?? null,
        policyVersion: latest?.policyVersion ?? null,
        mandateId: tx.mandateId,
        mandateVersion: tx.mandateVersion,
        merchant: tx.merchant,
        currency: tx.currency,
        total: tx.total,
        itemCount: parseItems(tx.items).length,
        quantity: tx.quantity,
        condition: tx.condition,
        recurring: tx.recurring,
        riskSignals: parseJsonArray(tx.riskSignals),
        paymentIntent: intent
          ? { id: intent.id, reference: intent.reference, status: intent.status, decidedBy: intent.decidedBy }
          : null,
        paypal: intent?.paypalOrder
          ? {
              orderId: intent.paypalOrder.paypalOrderId,
              status: intent.paypalOrder.status,
              captureId: intent.paypalOrder.captureId,
            }
          : null,
      };
    }),
  };
}

// ── POST /api/transactions/:id/review — the human gate for REVIEW decisions ─

export async function reviewTransaction(transactionId: string, body: unknown): Promise<TransactionDetailResponse> {
  const parsed = reviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new MandateApiError(400, "VALIDATION_ERROR", "The review request was not valid.", formatZodIssues(parsed.error));
  }
  const { action, note } = parsed.data;

  const tx = await db.proposedTransaction.findUnique({ where: { id: transactionId } });
  if (!tx) throw new MandateApiError(404, "NOT_FOUND", "Transaction not found.");
  const correlationId = parsed.data.correlationId ?? tx.correlationId;

  if (action === "APPROVE") {
    if (tx.status !== "IN_REVIEW") {
      throw new MandateApiError(
        409,
        "INVALID_STATE",
        `Only transactions awaiting review can be approved — this one is ${tx.status.toLowerCase()}.`
      );
    }
    const count = await db.paymentIntent.count();
    await db.$transaction(async (trx) => {
      await trx.paymentIntent.create({
        data: {
          reference: paymentReference(count + 1),
          transactionId: tx.id,
          executionId: newExecutionId(),
          status: "PENDING",
          decidedBy: "USER",
        },
      });
      await trx.proposedTransaction.update({ where: { id: tx.id }, data: { status: "EVALUATED" } });
      await recordAuditEvent(
        {
          actorType: "USER",
          actorId: DEMO_USER_EMAIL,
          eventType: TRANSACTION_EVENT_TYPES.TRANSACTION_APPROVED,
          correlationId,
          entityType: "transaction",
          entityId: tx.id,
          mandateId: tx.mandateId,
          transactionId: tx.id,
          payload: { note: note ?? null, decidedBy: "USER" },
        },
        trx
      );
    });
  } else {
    if (tx.status !== "IN_REVIEW" && tx.status !== "EVALUATED") {
      throw new MandateApiError(
        409,
        "INVALID_STATE",
        `This transaction is ${tx.status.toLowerCase()} and cannot be rejected here.`
      );
    }
    await db.$transaction(async (trx) => {
      await trx.proposedTransaction.update({ where: { id: tx.id }, data: { status: "CANCELLED" } });
      await trx.paymentIntent.updateMany({ where: { transactionId: tx.id, status: "PENDING" }, data: { status: "CANCELLED" } });
      await recordAuditEvent(
        {
          actorType: "USER",
          actorId: DEMO_USER_EMAIL,
          eventType: TRANSACTION_EVENT_TYPES.TRANSACTION_REJECTED,
          correlationId,
          entityType: "transaction",
          entityId: tx.id,
          mandateId: tx.mandateId,
          transactionId: tx.id,
          payload: { note: note ?? null },
        },
        trx
      );
    });
  }

  return getTransactionDetail(transactionId);
}

// ── POST /api/transactions/:id/execute — THE GUARDED EXECUTOR ──────────────

export async function executeTransaction(
  transactionId: string,
  body: unknown,
  origin: string
): Promise<{ transaction: TransactionDetailResponse; approveUrl: string | null }> {
  const parsed = executeRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new MandateApiError(400, "VALIDATION_ERROR", "The execution request was not valid.", formatZodIssues(parsed.error));
  }

  const tx = await db.proposedTransaction.findUnique({
    where: { id: transactionId },
    include: { paymentIntents: { orderBy: { createdAt: "desc" }, include: { paypalOrder: true } } },
  });
  if (!tx) throw new MandateApiError(404, "NOT_FOUND", "Transaction not found.");
  const correlationId = parsed.data.correlationId ?? tx.correlationId;

  // Structural refusals — no code path past this point for these states.
  if (tx.status === "BLOCKED") {
    throw new MandateApiError(
      409,
      "EXECUTION_REFUSED",
      "This transaction was BLOCKED by the deterministic policy engine. The guarded executor structurally refuses blocked transactions — nothing can reach PayPal."
    );
  }
  if (tx.status === "IN_REVIEW") {
    throw new MandateApiError(
      409,
      "REVIEW_REQUIRED",
      "This transaction requires explicit human approval before it can be executed."
    );
  }
  if (tx.status === "CANCELLED") {
    throw new MandateApiError(409, "INVALID_STATE", "This transaction was cancelled — nothing to execute.");
  }
  if (tx.status === "COMPLETED") {
    // Idempotent: return the completed state.
    return { transaction: await getTransactionDetail(tx.id), approveUrl: null };
  }

  // Idempotency: a live awaiting-buyer order is returned as-is — a retried
  // execute can NEVER produce a second PayPal order for the same transaction.
  const awaitingIntent = tx.paymentIntents.find((i) => i.status === "AWAITING_BUYER" && i.paypalOrder);
  if (awaitingIntent?.paypalOrder) {
    return {
      transaction: await getTransactionDetail(tx.id),
      approveUrl: awaitingIntent.paypalOrder.approveUrl,
    };
  }

  // ── Fresh deterministic re-evaluation (defense in depth) ──────────────────
  const mandateData = await mandateConstraintsFor(tx);
  if (!mandateData) {
    throw new MandateApiError(409, "INVALID_STATE", "The mandate behind this transaction no longer exists.");
  }
  const otherExecuted = (
    await db.proposedTransaction.findMany({
      where: { mandateId: tx.mandateId, status: { in: ["EVALUATED", "EXECUTING", "COMPLETED"] } },
      select: { fingerprint: true },
    })
  )
    .map((r) => r.fingerprint)
    .filter((f) => f !== tx.fingerprint);

  const freshEvaluation: PolicyEvaluationResult = evaluateTransaction(
    mandateData.constraints,
    proposalFromRow(tx),
    { now: new Date(), executedFingerprints: otherExecuted, mandateStatus: mandateData.mandateStatus }
  );
  await db.policyEvaluation.create({
    data: {
      transactionId: tx.id,
      mandateId: tx.mandateId,
      mandateVersion: tx.mandateVersion,
      decision: freshEvaluation.decision,
      ruleOutcomes: JSON.stringify(freshEvaluation.ruleOutcomes),
      reasons: JSON.stringify(freshEvaluation.reasons),
      violations: JSON.stringify(freshEvaluation.violations),
      warnings: JSON.stringify(freshEvaluation.warnings),
      policyVersion: freshEvaluation.policyVersion,
      evaluatedAt: new Date(),
    },
  });

  const humanApprovedIntent = tx.paymentIntents.find((i) => i.decidedBy === "USER" && i.status === "PENDING");

  if (freshEvaluation.decision === "BLOCK") {
    await db.proposedTransaction.update({ where: { id: tx.id }, data: { status: "BLOCKED" } });
    await db.paymentIntent.updateMany({ where: { transactionId: tx.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    await recordAuditEvent({
      actorType: "PAYMENT_EXECUTOR",
      eventType: TRANSACTION_EVENT_TYPES.EXECUTION_REFUSED,
      correlationId,
      entityType: "transaction",
      entityId: tx.id,
      mandateId: tx.mandateId,
      transactionId: tx.id,
      evaluationId: freshEvaluation.evaluationId,
      payload: {
        stage: "EXECUTION_TIME_RE_EVALUATION",
        violations: freshEvaluation.violations,
        note: "The executor re-evaluated policy and refused. No PayPal call was made.",
      },
    });
    throw new MandateApiError(
      409,
      "EXECUTION_REFUSED",
      "The transaction no longer complies with the mandate (it may have been revoked or changed). The guarded executor refused — no PayPal call was made.",
      freshEvaluation.violations
    );
  }

  if (freshEvaluation.decision === "REVIEW" && !humanApprovedIntent) {
    await db.proposedTransaction.update({ where: { id: tx.id }, data: { status: "IN_REVIEW" } });
    await recordAuditEvent({
      actorType: "PAYMENT_EXECUTOR",
      eventType: TRANSACTION_EVENT_TYPES.TRANSACTION_REVIEW_REQUIRED,
      correlationId,
      entityType: "transaction",
      entityId: tx.id,
      mandateId: tx.mandateId,
      transactionId: tx.id,
      evaluationId: freshEvaluation.evaluationId,
      payload: { stage: "EXECUTION_TIME_RE_EVALUATION", warnings: freshEvaluation.warnings },
    });
    throw new MandateApiError(
      409,
      "REVIEW_REQUIRED",
      "The transaction requires explicit human approval before it can be executed.",
      freshEvaluation.warnings
    );
  }

  // ── Honest gate: never simulate PayPal ─────────────────────────────────────
  if (!isPayPalConfigured()) {
    await recordAuditEvent({
      actorType: "PAYMENT_EXECUTOR",
      eventType: TRANSACTION_EVENT_TYPES.PAYPAL_NOT_CONFIGURED,
      correlationId,
      entityType: "transaction",
      entityId: tx.id,
      mandateId: tx.mandateId,
      transactionId: tx.id,
      payload: { note: "Execution authorized by policy but PayPal sandbox credentials are absent. Refusing to fake a result." },
    });
    throw new MandateApiError(
      409,
      "PAYPAL_NOT_CONFIGURED",
      "Policy authorized this transaction, but PayPal sandbox credentials are not set (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET). IntentShield never fakes PayPal results — add credentials in .env and retry."
    );
  }

  // ── Create/reuse the PaymentIntent, then the PayPal order ──────────────────────
  const items = parseItems(tx.items);

  // Reuse the human-approved PENDING intent when present; otherwise create a
  // fresh one (decidedBy POLICY_ENGINE — the engine authorized this payment).
  const intentRow = humanApprovedIntent
    ? humanApprovedIntent
    : await db.paymentIntent.create({
        data: {
          reference: paymentReference((await db.paymentIntent.count()) + 1),
          transactionId: tx.id,
          executionId: newExecutionId(),
          status: "PENDING",
          decidedBy: "POLICY_ENGINE",
        },
      });

  let order;
  try {
    order = await createOrder({
      executionId: intentRow.executionId,
      amountMinor: tx.total,
      currency: tx.currency,
      description: `IntentShield ${intentRow.reference} — ${items.map((i) => i.name).join(", ").slice(0, 90)}`,
      returnUrl: `${origin}/?intent=${intentRow.id}`,
      cancelUrl: `${origin}/?intent-cancelled=${intentRow.id}`,
      invoiceId: intentRow.reference,
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unitAmountMinor: i.unitPrice,
        category: i.category === "software" || i.category === "subscriptions" ? ("DIGITAL_GOODS" as const) : ("PHYSICAL_GOODS" as const),
      })),
      shippingMinor: tx.shipping,
      taxMinor: tx.tax,
      discountMinor: tx.discount,
    });
  } catch (err) {
    const message = err instanceof PayPalApiError ? err.message : "PayPal order creation failed";
    console.error("[executor] createOrder failed:", err instanceof Error ? err.message : "unknown");
    await db.paymentIntent.update({ where: { id: intentRow.id }, data: { status: "FAILED" } });
    await db.proposedTransaction.update({ where: { id: tx.id }, data: { status: "FAILED" } });
    await recordAuditEvent({
      actorType: "PAYMENT_EXECUTOR",
      eventType: TRANSACTION_EVENT_TYPES.PAYPAL_CAPTURE_FAILED,
      correlationId,
      entityType: "transaction",
      entityId: tx.id,
      mandateId: tx.mandateId,
      transactionId: tx.id,
      paymentIntentId: intentRow.id,
      payload: { stage: "ORDER_CREATION", reason: message },
    });
    throw new MandateApiError(502, "PAYPAL_ERROR", `PayPal order creation failed: ${message}`);
  }

  await db.payPalOrder.create({
    data: {
      paymentIntentId: intentRow.id,
      paypalOrderId: order.paypalOrderId,
      status: order.status === "CREATED" ? "CREATED" : order.status,
      amount: tx.total,
      currency: tx.currency,
      environment: "SANDBOX",
      approveUrl: order.approveUrl,
      rawSnapshot: JSON.stringify({ id: order.paypalOrderId, status: order.status }),
    },
  });
  await db.paymentIntent.update({ where: { id: intentRow.id }, data: { status: "AWAITING_BUYER" } });
  await db.proposedTransaction.update({ where: { id: tx.id }, data: { status: "EXECUTING" } });

  await recordAuditEvent({
    actorType: "PAYMENT_EXECUTOR",
    eventType: TRANSACTION_EVENT_TYPES.PAYPAL_ORDER_CREATED,
    correlationId,
    entityType: "transaction",
    entityId: tx.id,
    mandateId: tx.mandateId,
    transactionId: tx.id,
    paymentIntentId: intentRow.id,
    paypalOrderId: order.paypalOrderId,
    payload: {
      reference: intentRow.reference,
      executionId: intentRow.executionId,
      paypalOrderId: order.paypalOrderId,
      amountMinor: tx.total,
      currency: tx.currency,
      decidedBy: intentRow.decidedBy,
      environment: "SANDBOX",
    },
  });

  return { transaction: await getTransactionDetail(tx.id), approveUrl: order.approveUrl };
}

// ── POST /api/transactions/:id/capture — capture after buyer approval ──────

export async function captureTransaction(transactionId: string, body: unknown): Promise<TransactionDetailResponse> {
  const parsed = captureRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new MandateApiError(400, "VALIDATION_ERROR", "The capture request was not valid.", formatZodIssues(parsed.error));
  }

  const tx = await db.proposedTransaction.findUnique({
    where: { id: transactionId },
    include: { paymentIntents: { orderBy: { createdAt: "desc" }, include: { paypalOrder: true } } },
  });
  if (!tx) throw new MandateApiError(404, "NOT_FOUND", "Transaction not found.");
  const correlationId = parsed.data.correlationId ?? tx.correlationId;

  const intent = tx.paymentIntents.find((i) => i.paypalOrder) ?? null;
  if (!intent || !intent.paypalOrder) {
    throw new MandateApiError(409, "NO_ORDER", "No PayPal order exists for this transaction — execute it first.");
  }
  const order = intent.paypalOrder;

  if (intent.status === "COMPLETED" && order.captureId) {
    return getTransactionDetail(tx.id); // idempotent
  }

  let remote: { id: string; status: string };
  try {
    remote = await getOrder(order.paypalOrderId);
  } catch (err) {
    const message = err instanceof PayPalApiError ? err.message : "PayPal order lookup failed";
    throw new MandateApiError(502, "PAYPAL_ERROR", `Could not verify the order with PayPal: ${message}`);
  }

  if (remote.status !== "APPROVED" && remote.status !== "COMPLETED") {
    throw new MandateApiError(
      409,
      "NOT_APPROVED",
      `The buyer has not approved this order yet (PayPal status: ${remote.status}). Open the approval link and complete checkout first.`
    );
  }

  let capture;
  try {
    capture = await captureOrder(order.paypalOrderId, intent.executionId);
  } catch (err) {
    if (err instanceof PayPalNotConfiguredError) {
      throw new MandateApiError(409, "PAYPAL_NOT_CONFIGURED", "PayPal credentials are no longer configured.");
    }
    const message = err instanceof PayPalApiError ? err.message : "PayPal capture failed";
    console.error("[executor] capture failed:", err instanceof Error ? err.message : "unknown error");
    await recordAuditEvent({
      actorType: "PAYMENT_EXECUTOR",
      eventType: TRANSACTION_EVENT_TYPES.PAYPAL_CAPTURE_FAILED,
      correlationId,
      entityType: "transaction",
      entityId: tx.id,
      mandateId: tx.mandateId,
      transactionId: tx.id,
      paymentIntentId: intent.id,
      paypalOrderId: order.paypalOrderId,
      payload: { reason: message },
    });
    throw new MandateApiError(502, "PAYPAL_ERROR", `PayPal capture failed: ${message}`);
  }

  const completed = capture.status === "COMPLETED";
  await db.payPalOrder.update({
    where: { id: order.id },
    data: {
      status: completed ? "CAPTURED" : "FAILED",
      captureId: capture.captureId,
      rawSnapshot: JSON.stringify({ id: capture.paypalOrderId, status: capture.status, captureId: capture.captureId }),
    },
  });
  await db.paymentIntent.update({
    where: { id: intent.id },
    data: { status: completed ? "COMPLETED" : "FAILED" },
  });
  await db.proposedTransaction.update({
    where: { id: tx.id },
    data: { status: completed ? "COMPLETED" : "FAILED" },
  });

  await recordAuditEvent({
    actorType: "PAYMENT_EXECUTOR",
    eventType: completed ? TRANSACTION_EVENT_TYPES.PAYPAL_CAPTURED : TRANSACTION_EVENT_TYPES.PAYPAL_CAPTURE_FAILED,
    correlationId,
    entityType: "transaction",
    entityId: tx.id,
    mandateId: tx.mandateId,
    transactionId: tx.id,
    paymentIntentId: intent.id,
    paypalOrderId: order.paypalOrderId,
    payload: {
      reference: intent.reference,
      paypalOrderId: order.paypalOrderId,
      captureId: capture.captureId,
      amountMinor: tx.total,
      currency: tx.currency,
      status: capture.status,
    },
  });

  return getTransactionDetail(tx.id);
}

