import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { newCorrelationId } from "@/lib/correlation";
import { getAIProvider } from "@/lib/ai/provider";
import { AIExtractionError } from "@/lib/ai/schemas";
import { recordAuditEvent } from "@/lib/audit";
import {
  checkFinancialContradictions,
  classifyDraft,
  deriveMandateTitle,
  missingFieldsFor,
  normalizeDraftToMinor,
  parseAmountToMinor,
  sanitizeStringList,
  computeValidityWindow,
} from "@/lib/mandates/normalize";
import {
  MANDATE_BOUNDS,
  confirmRequestSchema,
  draftRequestSchema,
  formatZodIssues,
  revokeRequestSchema,
} from "@/lib/mandates/validation";
import {
  MANDATE_EVENT_TYPES,
  type MandateDetailResponse,
  type MandateDraftResponse,
  type MandateListItem,
  type MandateVersionSummary,
  type MissingMandateField,
  type NormalizedMandateDraft,
} from "@/lib/mandates/types";

/**
 * Mandate lifecycle service — the ONLY code that mutates mandate state.
 *
 * State machine (explicit transitions only, §12):
 *   DRAFT --(human confirmation)--> ACTIVE     (creates immutable version 1)
 *   ACTIVE --(human revocation)---> REVOKED    (history preserved)
 *
 * There is no code path that activates a mandate without the human-confirmed
 * payload, and no code path that edits an existing version — amendments
 * (Phase 2+) create a new version row.
 */

/** Known, safe API error — carries an HTTP status and a stable code. */
export class MandateApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "MandateApiError";
  }
}

/** Structured shape persisted in Mandate.draftData (NON-AUTHORITATIVE). */
interface StoredDraftData {
  draft: NormalizedMandateDraft;
  missingFields: string[];
  clarificationQuestion: string | null;
  warnings: string[];
  meta: { provider: string; model: string; extractedAt: string };
}

const DEMO_USER_EMAIL = "demo@intentshield.local";

/** Hackathon MVP identity (documented in ARCHITECTURE.md — no auth until later phases). */
async function ensureDemoUser(): Promise<{ id: string }> {
  return db.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    select: { id: true },
    create: { email: DEMO_USER_EMAIL, displayName: "Demo Operator" },
  });
}

function parseStoredDraftData(raw: string | null): StoredDraftData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredDraftData;
    if (!parsed || typeof parsed !== "object" || !parsed.draft) return null;
    return parsed;
  } catch {
    console.error("[mandates] draftData was not parseable JSON — treating as absent");
    return null;
  }
}

type MandateWithVersions = Prisma.MandateGetPayload<{ include: { versions: true } }>;

function toVersionSummary(row: Prisma.MandateVersionGetPayload<object>): MandateVersionSummary {
  return {
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    currency: row.currency,
    maxTotal: row.maxTotal,
    maxShipping: row.maxShipping,
    allowRecurring: row.allowRecurring,
    allowRefurbished: row.allowRefurbished,
    purchaseType: row.purchaseType as MandateVersionSummary["purchaseType"],
    maxQuantity: row.maxQuantity,
    validFrom: row.validFrom.toISOString(),
    validUntil: row.validUntil.toISOString(),
    approvalMode: row.approvalMode as MandateVersionSummary["approvalMode"],
    allowedCategories: row.allowedCategories ? (JSON.parse(row.allowedCategories) as string[]) : null,
    blockedCategories: row.blockedCategories ? (JSON.parse(row.blockedCategories) as string[]) : null,
    allowedMerchants: row.allowedMerchants ? (JSON.parse(row.allowedMerchants) as string[]) : null,
    blockedMerchants: row.blockedMerchants ? (JSON.parse(row.blockedMerchants) as string[]) : null,
    isCurrent: true, // caller corrects this
  };
}

function toListItem(row: MandateWithVersions): MandateListItem {
  const draftData = parseStoredDraftData(row.draftData);
  let currency: string | null = null;
  let maxTotal: number | null = null;
  let validUntil: string | null = null;

  if (row.status === "DRAFT") {
    currency = draftData?.draft.currency ?? null;
    maxTotal = draftData?.draft.maxTotal ?? null;
  } else {
    const current = row.versions.find((v) => v.version === row.currentVersion);
    if (current) {
      currency = current.currency;
      maxTotal = current.maxTotal;
      validUntil = current.validUntil.toISOString();
    }
  }

  return {
    id: row.id,
    title: deriveMandateTitle(row.naturalLanguageIntent),
    status: row.status as MandateListItem["status"],
    currentVersion: row.currentVersion,
    currency,
    maxTotal,
    validUntil,
    createdAt: row.createdAt.toISOString(),
    missingCount: row.status === "DRAFT" ? (draftData?.missingFields.length ?? 0) : 0,
  };
}

async function buildDetail(mandateId: string): Promise<MandateDetailResponse> {
  const row = await db.mandate.findUnique({
    where: { id: mandateId },
    include: { versions: { orderBy: { version: "asc" } } },
  });
  if (!row) {
    throw new MandateApiError(404, "NOT_FOUND", "Mandate not found.");
  }

  const auditRows = await db.auditEvent.findMany({
    where: { mandateId: row.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { eventType: true, actorType: true, correlationId: true, createdAt: true },
  });

  const draftData = parseStoredDraftData(row.draftData);
  const versions = row.versions.map((v) => {
    const summary = toVersionSummary(v);
    summary.isCurrent = v.version === row.currentVersion;
    return summary;
  });

  return {
    id: row.id,
    title: deriveMandateTitle(row.naturalLanguageIntent),
    status: row.status as MandateDetailResponse["status"],
    currentVersion: row.currentVersion,
    instruction: row.naturalLanguageIntent,
    createdAt: row.createdAt.toISOString(),
    current: versions.find((v) => v.isCurrent) ?? null,
    draft: draftData
      ? {
          fields: draftData.draft,
          missingFields: draftData.missingFields as MissingMandateField[],
          clarificationQuestion: draftData.clarificationQuestion,
        }
      : null,
    versions,
    audit: auditRows.map((a) => ({
      eventType: a.eventType,
      actorType: a.actorType,
      correlationId: a.correlationId,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

// ── POST /api/mandates/draft ────────────────────────────────────────────────

export async function createDraftMandate(body: unknown): Promise<MandateDraftResponse> {
  const parsed = draftRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new MandateApiError(
      400,
      "VALIDATION_ERROR",
      "The request was not valid.",
      formatZodIssues(parsed.error)
    );
  }
  const instruction = parsed.data.instruction;
  const correlationId = newCorrelationId();

  // 1. AI interpretation (untrusted until it survives the schema wall).
  let extraction: Awaited<ReturnType<ReturnType<typeof getAIProvider>["extractIntent"]>>;
  try {
    extraction = await getAIProvider().extractIntent(instruction);
  } catch (err) {
    if (err instanceof AIExtractionError) {
      // Structured extraction failure — audit it, fail safe, create nothing.
      await recordAuditEvent({
        actorType: "SYSTEM",
        eventType: MANDATE_EVENT_TYPES.EXTRACTION_FAILED,
        correlationId,
        entityType: "mandate",
        payload: { reason: err.message, instructionLength: instruction.length },
      });
      throw new MandateApiError(
        422,
        "EXTRACTION_FAILED",
        "The AI interpretation did not pass strict validation. Nothing was created — please rephrase the instruction."
      );
    }
    console.error("[mandates] extraction failed:", err instanceof Error ? err.message : "unknown");
    await recordAuditEvent({
      actorType: "SYSTEM",
      eventType: MANDATE_EVENT_TYPES.EXTRACTION_FAILED,
      correlationId,
      entityType: "mandate",
      payload: { reason: "AI provider unavailable" },
    });
    throw new MandateApiError(503, "AI_UNAVAILABLE", "The AI interpreter is unavailable right now. Try again shortly.");
  }

  // 2. Deterministic normalization into minor units + classification.
  const normalized = normalizeDraftToMinor(extraction.draft);
  const missingFields = missingFieldsFor(normalized);
  const warnings = checkFinancialContradictions(normalized);
  const classification = classifyDraft(normalized, extraction.draft.clarificationNeeded);
  const meta = {
    provider: extraction.provider,
    model: extraction.model,
    extractedAt: new Date().toISOString(),
  };

  // 3. Persist the DRAFT row (no authorization exists yet — currentVersion 0).
  const user = await ensureDemoUser();
  const stored: StoredDraftData = {
    draft: normalized,
    missingFields,
    clarificationQuestion: extraction.draft.clarificationNeeded ?? null,
    warnings,
    meta,
  };
  const mandate = await db.mandate.create({
    data: {
      userId: user.id,
      naturalLanguageIntent: instruction,
      status: "DRAFT",
      currentVersion: 0,
      draftData: JSON.stringify(stored),
    },
    select: { id: true },
  });

  // 4. Audit the draft (and the clarification request when ambiguous).
  await recordAuditEvent({
    actorType: "SYSTEM",
    eventType: MANDATE_EVENT_TYPES.DRAFT_CREATED,
    correlationId,
    entityType: "mandate",
    entityId: mandate.id,
    mandateId: mandate.id,
    payload: {
      classification,
      draft: {
        currency: normalized.currency,
        maxTotalMinor: normalized.maxTotal,
        maxShippingMinor: normalized.maxShipping,
        allowRecurring: normalized.allowRecurring,
        purchaseType: normalized.purchaseType,
      },
      missingFields,
      provider: meta.provider,
      model: meta.model,
    },
  });
  if (classification === "AMBIGUOUS") {
    await recordAuditEvent({
      actorType: "SYSTEM",
      eventType: MANDATE_EVENT_TYPES.CLARIFICATION_REQUESTED,
      correlationId,
      entityType: "mandate",
      entityId: mandate.id,
      mandateId: mandate.id,
      payload: {
        missingFields,
        question: stored.clarificationQuestion,
        understood: { currency: normalized.currency, maxTotalMinor: normalized.maxTotal },
      },
    });
  }

  return {
    correlationId,
    mandateId: mandate.id,
    classification,
    title: deriveMandateTitle(instruction),
    instruction,
    draft: normalized,
    missingFields,
    clarificationQuestion: stored.clarificationQuestion,
    warnings,
    meta,
  };
}

// ── POST /api/mandates/:id/confirm ───────────────────────────────────────────

export async function confirmDraftMandate(mandateId: string, body: unknown): Promise<MandateDetailResponse> {
  const parsed = confirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new MandateApiError(
      400,
      "VALIDATION_ERROR",
      "The confirmation was not valid.",
      formatZodIssues(parsed.error)
    );
  }
  const payload = parsed.data;
  const correlationId = payload.correlationId ?? newCorrelationId();

  // Financial normalization of the human-confirmed values — deterministic wall.
  let maxTotalMinor: number;
  let maxShippingMinor: number | null = null;
  try {
    maxTotalMinor = parseAmountToMinor(payload.maxTotal, MANDATE_BOUNDS.MAX_TOTAL_MINOR, "Maximum total spend");
    maxShippingMinor =
      payload.maxShipping === null
        ? null
        : parseAmountToMinor(payload.maxShipping, MANDATE_BOUNDS.MAX_SHIPPING_MINOR, "Shipping limit");
  } catch (err) {
    throw new MandateApiError(
      400,
      "FINANCIAL_INVALID",
      err instanceof Error ? err.message : "One of the amounts is not valid."
    );
  }

  const contradictions = checkFinancialContradictions({
    maxTotal: maxTotalMinor,
    maxShipping: maxShippingMinor,
    allowRecurring: payload.allowRecurring,
    purchaseType: payload.purchaseType,
  });
  if (contradictions.length > 0) {
    throw new MandateApiError(400, "CONTRADICTION", "Conflicting constraints must be resolved before activation.", contradictions);
  }

  const mandate = await db.mandate.findUnique({ where: { id: mandateId }, select: { id: true, status: true } });
  if (!mandate) throw new MandateApiError(404, "NOT_FOUND", "Mandate not found.");
  if (mandate.status !== "DRAFT") {
    throw new MandateApiError(
      409,
      "INVALID_STATE",
      `This mandate is already ${mandate.status.toLowerCase()} — it cannot be confirmed again.`
    );
  }

  const now = new Date();
  const validity = computeValidityWindow(payload.validityDays, now);

  const allowedCategories = sanitizeStringList(payload.allowedCategories, { lowercase: true, maxItems: MANDATE_BOUNDS.MAX_LIST_ITEMS });
  const blockedCategories = sanitizeStringList(payload.blockedCategories, { lowercase: true, maxItems: MANDATE_BOUNDS.MAX_LIST_ITEMS });
  const allowedMerchants = sanitizeStringList(payload.allowedMerchants, { lowercase: false, maxItems: MANDATE_BOUNDS.MAX_LIST_ITEMS });
  const blockedMerchants = sanitizeStringList(payload.blockedMerchants, { lowercase: false, maxItems: MANDATE_BOUNDS.MAX_LIST_ITEMS });

  // What changed relative to the AI's draft — recorded for the trust story.
  const stored = parseStoredDraftData(
    (await db.mandate.findUnique({ where: { id: mandateId }, select: { draftData: true } }))?.draftData ?? null
  );
  const changedFromDraft: string[] = [];
  if (stored?.draft) {
    if (stored.draft.currency !== payload.currency) changedFromDraft.push("currency");
    if (stored.draft.maxTotal !== maxTotalMinor) changedFromDraft.push("maxTotal");
    if ((stored.draft.maxShipping ?? null) !== (maxShippingMinor ?? null)) changedFromDraft.push("maxShipping");
    if (stored.draft.allowRecurring !== payload.allowRecurring) changedFromDraft.push("allowRecurring");
    if (stored.draft.allowRefurbished !== payload.allowRefurbished) changedFromDraft.push("allowRefurbished");
    if (stored.draft.purchaseType !== payload.purchaseType) changedFromDraft.push("purchaseType");
    if (stored.draft.maxQuantity !== payload.maxQuantity) changedFromDraft.push("maxQuantity");
    if ((stored.draft.validityDays ?? null) !== (payload.validityDays ?? null)) changedFromDraft.push("validityDays");
    if ((stored.draft.approvalMode ?? null) !== payload.approvalMode) changedFromDraft.push("approvalMode");
  }

  const versionMeta = stored?.meta
    ? {
        provider: stored.meta.provider,
        model: stored.meta.model,
        extractedAt: stored.meta.extractedAt,
        confirmedBy: "HUMAN",
        correlationId,
        changedFromDraft,
      }
    : { confirmedBy: "HUMAN", correlationId };

  await db.$transaction(async (tx) => {
    await tx.mandateVersion.create({
      data: {
        mandateId,
        version: 1,
        currency: payload.currency,
        maxTotal: maxTotalMinor,
        maxShipping: maxShippingMinor,
        allowedCategories: allowedCategories ? JSON.stringify(allowedCategories) : null,
        blockedCategories: blockedCategories ? JSON.stringify(blockedCategories) : null,
        allowedMerchants: allowedMerchants ? JSON.stringify(allowedMerchants) : null,
        blockedMerchants: blockedMerchants ? JSON.stringify(blockedMerchants) : null,
        allowRecurring: payload.allowRecurring,
        allowRefurbished: payload.allowRefurbished,
        purchaseType: payload.purchaseType,
        maxQuantity: payload.maxQuantity,
        validFrom: validity.validFrom,
        validUntil: validity.validUntil,
        approvalMode: payload.approvalMode,
        extractionMeta: JSON.stringify(versionMeta),
      },
    });
    await tx.mandate.update({
      where: { id: mandateId },
      data: { status: "ACTIVE", currentVersion: 1 },
    });
    await recordAuditEvent(
      {
        actorType: "USER",
        actorId: DEMO_USER_EMAIL,
        eventType: MANDATE_EVENT_TYPES.CONFIRMED,
        correlationId,
        entityType: "mandate",
        entityId: mandateId,
        mandateId,
        payload: {
          version: 1,
          confirmed: {
            currency: payload.currency,
            maxTotalMinor: maxTotalMinor,
            maxShippingMinor: maxShippingMinor,
            allowRecurring: payload.allowRecurring,
            purchaseType: payload.purchaseType,
            validityDays: validity.days,
            approvalMode: payload.approvalMode,
          },
          changedFromDraft,
        },
      },
      tx
    );
    await recordAuditEvent(
      {
        actorType: "SYSTEM",
        eventType: MANDATE_EVENT_TYPES.VERSION_CREATED,
        correlationId,
        entityType: "mandate",
        entityId: mandateId,
        mandateId,
        payload: { version: 1, source: "CONFIRMATION" },
      },
      tx
    );
  });

  return buildDetail(mandateId);
}

// ── GET /api/mandates ────────────────────────────────────────────────────────

export async function listMandates(): Promise<{ mandates: MandateListItem[] }> {
  const rows = await db.mandate.findMany({
    include: { versions: true },
    orderBy: { createdAt: "desc" },
  });
  return { mandates: rows.map(toListItem) };
}

// ── GET /api/mandates/:id ────────────────────────────────────────────────────

export async function getMandateDetail(mandateId: string): Promise<MandateDetailResponse> {
  return buildDetail(mandateId);
}

// ── POST /api/mandates/:id/revoke ────────────────────────────────────────────

export async function revokeMandate(mandateId: string, body: unknown): Promise<MandateDetailResponse> {
  const parsed = revokeRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new MandateApiError(400, "VALIDATION_ERROR", "The revocation request was not valid.", formatZodIssues(parsed.error));
  }
  const correlationId = parsed.data.correlationId ?? newCorrelationId();

  const mandate = await db.mandate.findUnique({ where: { id: mandateId }, select: { id: true, status: true } });
  if (!mandate) throw new MandateApiError(404, "NOT_FOUND", "Mandate not found.");
  if (mandate.status !== "ACTIVE") {
    throw new MandateApiError(
      409,
      "INVALID_STATE",
      `Only active mandates can be revoked — this one is ${mandate.status.toLowerCase()}.`
    );
  }

  await db.$transaction(async (tx) => {
    await tx.mandate.update({ where: { id: mandateId }, data: { status: "REVOKED" } });
    await recordAuditEvent(
      {
        actorType: "USER",
        actorId: DEMO_USER_EMAIL,
        eventType: MANDATE_EVENT_TYPES.REVOKED,
        correlationId,
        entityType: "mandate",
        entityId: mandateId,
        mandateId,
        payload: { previousStatus: "ACTIVE", reason: parsed.data.reason ?? null },
      },
      tx
    );
  });

  return buildDetail(mandateId);
}
