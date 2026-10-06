import { db } from "@/lib/db";
import { newCorrelationId, transactionFingerprint } from "@/lib/correlation";
import { getAIProvider } from "@/lib/ai/provider";
import { AISearchError } from "@/lib/ai/schemas";
import { recordAuditEvent } from "@/lib/audit";
import { composeProposal, toAgentCatalogEntry, type CompositionPick } from "@/lib/agent/compose";
import { listCatalog, type CatalogProduct } from "@/lib/catalog/service";
import { formatMoney } from "@/lib/money";
import { MandateApiError } from "@/lib/mandates/service";
import { evaluateTransaction } from "@/lib/policy/engine";
import type { MandateConstraints, PolicyEvaluationResult, TransactionProposal } from "@/lib/policy/types";
import { formatZodIssues, agentSearchRequestSchema } from "@/lib/transactions/validation";
import { TRANSACTION_EVENT_TYPES, type TransactionDetailResponse, type TransactionItemSummary } from "@/lib/transactions/types";
import { getTransactionDetail } from "@/lib/transactions/service";

/**
 * Agent service (Phase 3) — the ONLY code that creates proposed transactions.
 *
 * Trust model:
 * - The AI proposes products BY SKU; deterministic code re-reads authoritative
 *   catalogue rows for every price/condition/recurring fact.
 * - The composed proposal is UNTRUSTED input to the deterministic policy
 *   engine. The engine's decision is the only authority.
 * - Everything is persisted: session, agent actions, proposal, evaluation,
 *   audit events — one correlationId per end-to-end run.
 */

/** Stored agentMeta shape (NON-AUTHORITATIVE display data). */
export interface StoredAgentMeta {
  provider: string;
  model: string;
  request: string;
  notes: string | null;
  warnings: string[];
}

export interface MandateForProposal {
  id: string;
  userId: string;
  status: string;
  currentVersion: number;
  naturalLanguageIntent: string;
  version: {
    version: number;
    currency: string;
    maxTotal: number;
    maxShipping: number | null;
    allowedCategories: string | null;
    blockedCategories: string | null;
    allowedMerchants: string | null;
    blockedMerchants: string | null;
    allowRecurring: boolean;
    allowRefurbished: boolean;
    purchaseType: string;
    maxQuantity: number;
    validFrom: Date;
    validUntil: Date;
    approvalMode: string;
  };
}

/** Load the mandate + the EXACT version a transaction must be judged against. */
export async function loadMandateForProposal(mandateId: string): Promise<MandateForProposal | null> {
  const mandate = await db.mandate.findUnique({
    where: { id: mandateId },
    include: { versions: true },
  });
  if (!mandate) return null;
  const version = mandate.versions.find((v) => v.version === mandate.currentVersion) ?? null;
  if (!version || mandate.currentVersion < 1) return null;
  return {
    id: mandate.id,
    userId: mandate.userId,
    status: mandate.status,
    currentVersion: mandate.currentVersion,
    naturalLanguageIntent: mandate.naturalLanguageIntent,
    version: {
      version: version.version,
      currency: version.currency,
      maxTotal: version.maxTotal,
      maxShipping: version.maxShipping,
      allowedCategories: version.allowedCategories,
      blockedCategories: version.blockedCategories,
      allowedMerchants: version.allowedMerchants,
      blockedMerchants: version.blockedMerchants,
      allowRecurring: version.allowRecurring,
      allowRefurbished: version.allowRefurbished,
      purchaseType: version.purchaseType,
      maxQuantity: version.maxQuantity,
      validFrom: version.validFrom,
      validUntil: version.validUntil,
      approvalMode: version.approvalMode,
    },
  };
}

/** Pure mapping DB version row → engine MandateConstraints. */
export function toMandateConstraints(m: MandateForProposal): MandateConstraints {
  return {
    mandateId: m.id,
    mandateVersion: m.version.version,
    currency: m.version.currency,
    maxTotal: m.version.maxTotal,
    maxShipping: m.version.maxShipping,
    allowedCategories: m.version.allowedCategories ? (JSON.parse(m.version.allowedCategories) as string[]) : null,
    blockedCategories: m.version.blockedCategories ? (JSON.parse(m.version.blockedCategories) as string[]) : null,
    allowedMerchants: m.version.allowedMerchants ? (JSON.parse(m.version.allowedMerchants) as string[]) : null,
    blockedMerchants: m.version.blockedMerchants ? (JSON.parse(m.version.blockedMerchants) as string[]) : null,
    allowRecurring: m.version.allowRecurring,
    allowRefurbished: m.version.allowRefurbished,
    purchaseType: m.version.purchaseType === "RECURRING" ? "RECURRING" : "ONE_TIME",
    maxQuantity: m.version.maxQuantity,
    validFrom: m.version.validFrom,
    validUntil: m.version.validUntil,
    approvalMode: m.version.approvalMode === "MANUAL_REVIEW" ? "MANUAL_REVIEW" : "AUTO",
  };
}

/** Fingerprints of previously ACCEPTED (ALLOW), still-live transactions. */
export async function executedFingerprintsFor(mandateId: string): Promise<string[]> {
  const rows = await db.proposedTransaction.findMany({
    where: {
      mandateId,
      status: { in: ["EVALUATED", "EXECUTING", "COMPLETED"] },
    },
    select: { fingerprint: true },
  });
  return rows.map((r) => r.fingerprint);
}

/** Canonical fingerprint input for a composed proposal. */
export function fingerprintProposal(mandateId: string, proposal: TransactionProposal): string {
  return transactionFingerprint({
    mandateId,
    merchant: proposal.merchant,
    items: JSON.stringify(
      proposal.items.map((i) => ({ sku: i.sku, unitPrice: i.unitPrice, quantity: i.quantity }))
    ),
    total: proposal.total,
    currency: proposal.currency,
  });
}

/**
 * The shared proposal→evaluation→persistence pipeline. Used by BOTH the
 * interactive agent (AI picks) and the adversarial lab (deterministic picks)
 * so nothing bypasses the same wall.
 */
export async function persistProposedTransaction(input: {
  mandate: MandateForProposal;
  sessionId: string;
  proposal: TransactionProposal;
  fingerprint: string;
  condition: string;
  itemsSnapshot: TransactionItemSummary[];
  agentMeta: StoredAgentMeta | null;
  source: "AGENT" | "LAB";
  scenarioId: string | null;
  correlationId: string;
  now?: Date;
}): Promise<{ transactionId: string; evaluation: PolicyEvaluationResult }> {
  const now = input.now ?? new Date();
  const constraints = toMandateConstraints(input.mandate);
  const evaluation = evaluateTransaction(
    constraints,
    { ...input.proposal, fingerprint: input.fingerprint },
    {
      now,
      executedFingerprints: await executedFingerprintsFor(input.mandate.id),
      mandateStatus: input.mandate.status,
    }
  );

  const status = evaluation.decision === "ALLOW" ? "EVALUATED" : evaluation.decision === "REVIEW" ? "IN_REVIEW" : "BLOCKED";

  const transaction = await db.proposedTransaction.create({
    data: {
      mandateId: input.mandate.id,
      mandateVersion: input.mandate.version.version,
      sessionId: input.sessionId,
      merchant: input.proposal.merchant,
      items: JSON.stringify(input.itemsSnapshot),
      subtotal: input.proposal.subtotal,
      shipping: input.proposal.shipping,
      tax: input.proposal.tax,
      discount: input.proposal.discount,
      total: input.proposal.total,
      currency: input.proposal.currency,
      recurring: input.proposal.recurring,
      condition: input.condition,
      quantity: input.proposal.quantity,
      externalMetadata: input.proposal.externalMetadata ? JSON.stringify(input.proposal.externalMetadata) : null,
      riskSignals: input.proposal.riskSignals ? JSON.stringify(input.proposal.riskSignals) : null,
      fingerprint: input.fingerprint,
      status,
      source: input.source,
      scenarioId: input.scenarioId,
      correlationId: input.correlationId,
      agentMeta: input.agentMeta ? JSON.stringify(input.agentMeta) : null,
    },
    select: { id: true },
  });

  await db.policyEvaluation.create({
    data: {
      transactionId: transaction.id,
      mandateId: input.mandate.id,
      mandateVersion: input.mandate.version.version,
      decision: evaluation.decision,
      ruleOutcomes: JSON.stringify(evaluation.ruleOutcomes),
      reasons: JSON.stringify(evaluation.reasons),
      violations: JSON.stringify(evaluation.violations),
      warnings: JSON.stringify(evaluation.warnings),
      policyVersion: evaluation.policyVersion,
      evaluatedAt: now,
    },
  });

  await recordAuditEvent({
    actorType: "AGENT",
    actorId: "shopping-agent",
    eventType: TRANSACTION_EVENT_TYPES.TRANSACTION_PROPOSED,
    correlationId: input.correlationId,
    entityType: "transaction",
    entityId: transaction.id,
    mandateId: input.mandate.id,
    sessionId: input.sessionId,
    transactionId: transaction.id,
    payload: {
      source: input.source,
      scenarioId: input.scenarioId,
      merchant: input.proposal.merchant,
      totalMinor: input.proposal.total,
      currency: input.proposal.currency,
      itemCount: input.itemsSnapshot.length,
    },
  });

  await recordAuditEvent({
    actorType: "POLICY_ENGINE",
    eventType: TRANSACTION_EVENT_TYPES.POLICY_DECIDED,
    correlationId: input.correlationId,
    entityType: "transaction",
    entityId: transaction.id,
    mandateId: input.mandate.id,
    transactionId: transaction.id,
    evaluationId: evaluation.evaluationId,
    payload: {
      decision: evaluation.decision,
      policyVersion: evaluation.policyVersion,
      mandateVersion: input.mandate.version.version,
      violations: evaluation.violations,
      warnings: evaluation.warnings,
    },
  });

  if (evaluation.decision === "REVIEW") {
    await recordAuditEvent({
      actorType: "POLICY_ENGINE",
      eventType: TRANSACTION_EVENT_TYPES.TRANSACTION_REVIEW_REQUIRED,
      correlationId: input.correlationId,
      entityType: "transaction",
      entityId: transaction.id,
      mandateId: input.mandate.id,
      transactionId: transaction.id,
      evaluationId: evaluation.evaluationId,
      payload: { warnings: evaluation.warnings },
    });
  }

  if (evaluation.decision === "BLOCK") {
    await recordAuditEvent({
      actorType: "POLICY_ENGINE",
      eventType: TRANSACTION_EVENT_TYPES.TRANSACTION_BLOCKED,
      correlationId: input.correlationId,
      entityType: "transaction",
      entityId: transaction.id,
      mandateId: input.mandate.id,
      transactionId: transaction.id,
      evaluationId: evaluation.evaluationId,
      payload: { violations: evaluation.violations },
    });
  }

  return { transactionId: transaction.id, evaluation };
}

function mandateSummaryText(m: MandateForProposal): string {
  const c = toMandateConstraints(m);
  const parts = [
    `Maximum total: ${formatMoney(c.maxTotal, c.currency)}`,
    c.maxShipping !== null ? `Maximum shipping: ${formatMoney(c.maxShipping, c.currency)}` : "No shipping ceiling",
    `Recurring: ${c.allowRecurring ? "allowed" : "prohibited"}`,
    `Refurbished: ${c.allowRefurbished ? "allowed" : "prohibited (new only)"}`,
    `Max quantity: ${c.maxQuantity}`,
  ];
  return parts.join("; ");
}

/** POST /api/agent/search — the interactive shopping-agent run. */
export async function runAgentSearch(body: unknown): Promise<{
  correlationId: string;
  transaction: TransactionDetailResponse;
  agent: {
    provider: string;
    model: string;
    request: string;
    notes: string | null;
    picks: { sku: string; name: string | null; quantity: number; reason: string; resolved: boolean }[];
    warnings: string[];
  };
}> {
  const parsed = agentSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new MandateApiError(400, "VALIDATION_ERROR", "The agent request was not valid.", formatZodIssues(parsed.error));
  }
  const { mandateId, request } = parsed.data;
  const correlationId = parsed.data.correlationId ?? newCorrelationId();

  const mandate = await loadMandateForProposal(mandateId);
  if (!mandate) {
    throw new MandateApiError(404, "NOT_FOUND", "Mandate not found.");
  }
  if (mandate.status !== "ACTIVE") {
    throw new MandateApiError(
      409,
      "INVALID_STATE",
      `Only ACTIVE mandates can run the agent — this one is ${mandate.status.toLowerCase()}.`
    );
  }

  const products = await listCatalog();

  // Agent session — one per search run, tied to the mandate.
  const session = await db.agentSession.create({
    data: { userId: mandate.userId, mandateId: mandate.id, status: "ACTIVE" },
    select: { id: true },
  });
  await recordAuditEvent({
    actorType: "AGENT",
    actorId: "shopping-agent",
    eventType: TRANSACTION_EVENT_TYPES.AGENT_SESSION_STARTED,
    correlationId,
    entityType: "agent-session",
    entityId: session.id,
    mandateId: mandate.id,
    sessionId: session.id,
    payload: { request, mandateVersion: mandate.version.version },
  });
  await db.agentAction.create({
    data: {
      sessionId: session.id,
      actionType: "SEARCH_PRODUCTS",
      payload: JSON.stringify({ request, mandateId, catalogSize: products.length }),
    },
  });

  // 1. AI search — untrusted until it survives the schema wall.
  let search: Awaited<ReturnType<ReturnType<typeof getAIProvider>["searchProducts"]>>;
  try {
    search = await getAIProvider().searchProducts({
      userRequest: request,
      mandateSummary: mandateSummaryText(mandate),
      catalog: products.map(toAgentCatalogEntry),
    });
  } catch (err) {
    if (err instanceof AISearchError) {
      await recordAuditEvent({
        actorType: "SYSTEM",
        eventType: TRANSACTION_EVENT_TYPES.AGENT_SEARCH_COMPLETED,
        correlationId,
        entityType: "agent-session",
        entityId: session.id,
        sessionId: session.id,
        payload: { failed: true, reason: err.message },
      });
      throw new MandateApiError(
        422,
        "AGENT_SEARCH_FAILED",
        "The agent's search output did not pass strict validation. Nothing was proposed — please rephrase the request."
      );
    }
    console.error("[agent] search failed:", err instanceof Error ? err.message : "unknown error");
    throw new MandateApiError(503, "AI_UNAVAILABLE", "The AI agent is unavailable right now. Try again shortly.");
  }

  await recordAuditEvent({
    actorType: "AGENT",
    actorId: "shopping-agent",
    eventType: TRANSACTION_EVENT_TYPES.AGENT_SEARCH_COMPLETED,
    correlationId,
    entityType: "agent-session",
    entityId: session.id,
    sessionId: session.id,
    payload: {
      provider: search.provider,
      model: search.model,
      picks: search.picks.map((p) => ({ sku: p.sku, quantity: p.quantity })),
    },
  });

  // 2. Resolve picks against authoritative catalogue rows; drop hallucinated SKUs.
  const knownSkus = new Set(products.map((p) => p.sku));
  const warnings: string[] = [];
  const validPicks: CompositionPick[] = [];
  for (const pick of search.picks) {
    if (!knownSkus.has(pick.sku)) {
      warnings.push(`Agent proposed unknown SKU "${pick.sku}" — dropped. The catalogue is the agent's only world.`);
      continue;
    }
    validPicks.push({ sku: pick.sku, quantity: pick.quantity, reason: pick.reason });
  }
  if (validPicks.length === 0) {
    await db.agentAction.create({
      data: {
        sessionId: session.id,
        actionType: "PROPOSE_TRANSACTION",
        payload: JSON.stringify({ request }),
        result: JSON.stringify({ proposed: false, reason: "no valid picks", warnings }),
      },
    });
    await db.agentSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });
    throw new MandateApiError(
      422,
      "NO_MATCHING_PRODUCTS",
      "The agent found no matching products. Nothing was proposed — try a different request."
    );
  }

  // 3. Deterministic composition from DB rows.
  const composition = composeProposal({ sessionId: session.id, picks: validPicks, products });
  const itemsSnapshot: TransactionItemSummary[] = composition.picks.map((pick) => ({
    sku: pick.product.sku,
    name: pick.product.name,
    category: pick.product.category,
    merchant: pick.product.merchant,
    unitPrice: pick.product.price,
    lineTotal: pick.product.price * pick.quantity,
    quantity: pick.quantity,
    condition: pick.product.condition,
    recurring: pick.product.recurring,
    reason: pick.reason,
  }));
  const fingerprint = fingerprintProposal(mandate.id, composition.proposal);
  const agentMeta: StoredAgentMeta = {
    provider: search.provider,
    model: search.model,
    request,
    notes: search.notes ?? null,
    warnings,
  };

  await db.agentAction.create({
    data: {
      sessionId: session.id,
      actionType: "PROPOSE_TRANSACTION",
      payload: JSON.stringify({ request, picks: validPicks.map((p) => ({ sku: p.sku, quantity: p.quantity })) }),
    },
  });

  // 4. Evaluate + persist through the shared wall.
  const { transactionId, evaluation } = await persistProposedTransaction({
    mandate,
    sessionId: session.id,
    proposal: composition.proposal,
    fingerprint,
    condition: composition.condition,
    itemsSnapshot,
    agentMeta,
    source: "AGENT",
    scenarioId: null,
    correlationId,
  });

  await db.agentAction.create({
    data: {
      sessionId: session.id,
      actionType: "EVALUATE_POLICY",
      payload: JSON.stringify({ transactionId }),
      result: JSON.stringify({ decision: evaluation.decision, evaluationId: evaluation.evaluationId }),
    },
  });
  await db.agentSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });

  return {
    correlationId,
    transaction: await getTransactionDetail(transactionId),
    agent: {
      provider: search.provider,
      model: search.model,
      request,
      notes: search.notes ?? null,
      picks: search.picks.map((p) => ({
        sku: p.sku,
        name: products.find((prod) => prod.sku === p.sku)?.name ?? null,
        quantity: p.quantity,
        reason: p.reason,
        resolved: knownSkus.has(p.sku),
      })),
      warnings,
    },
  };
}

/** Re-usable catalog access for the lab. */
export { listCatalog, type CatalogProduct };
