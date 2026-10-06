/**
 * Mandate domain types — shared between server services and the client UI.
 *
 * This file MUST stay free of server-only imports (db, env, SDK): the
 * authorization console imports these types directly.
 *
 * Money convention: every amount below is INTEGER MINOR UNITS (cents) once
 * it crosses the API boundary. Humans edit major units in the UI; the server
 * re-normalizes deterministically. The model's major-unit output is never
 * trusted past normalization (see normalize.ts).
 */

/** Explicit lifecycle states (Phase 2 scope: DRAFT, ACTIVE, REVOKED). */
export const MANDATE_STATUSES = ["DRAFT", "ACTIVE", "REVOKED", "EXPIRED"] as const;
export type MandateStatus = (typeof MANDATE_STATUSES)[number];

/** Deterministic classification of an extraction — decided by CODE, not the model. */
export type ExtractionClassification = "CLEAR" | "AMBIGUOUS";

export type PurchaseType = "ONE_TIME" | "RECURRING";
export type ApprovalMode = "AUTO" | "MANUAL_REVIEW";

/**
 * A normalized, schema-validated mandate interpretation.
 * Null financial fields mean "not stated by the human" — they are NEVER
 * silently filled. A mandate cannot be activated while `currency` or
 * `maxTotal` is null.
 */
export interface NormalizedMandateDraft {
  currency: string | null;
  /** Minor units. */
  maxTotal: number | null;
  /** Minor units; null = no shipping ceiling stated. */
  maxShipping: number | null;
  allowRecurring: boolean;
  allowRefurbished: boolean;
  purchaseType: PurchaseType;
  maxQuantity: number;
  validityDays: number | null;
  allowedCategories: string[] | null;
  blockedCategories: string[] | null;
  allowedMerchants: string[] | null;
  blockedMerchants: string[] | null;
  approvalMode: ApprovalMode | null;
}

/** Field keys that must be human-supplied before a draft can be activated. */
export type MissingMandateField = "currency" | "maxTotal";

export interface MandateDraftMeta {
  provider: string;
  model: string;
  extractedAt: string; // ISO 8601
}

/** Response of POST /api/mandates/draft — a DRAFT row now exists, nothing is authorized. */
export interface MandateDraftResponse {
  correlationId: string;
  mandateId: string;
  classification: ExtractionClassification;
  title: string;
  instruction: string;
  draft: NormalizedMandateDraft;
  missingFields: MissingMandateField[];
  clarificationQuestion: string | null;
  /** Deterministic constraint warnings (e.g. contradictory ceilings). */
  warnings: string[];
  meta: MandateDraftMeta;
}

/** Row in the mandate list (GET /api/mandates). */
export interface MandateListItem {
  id: string;
  title: string;
  status: MandateStatus;
  currentVersion: number;
  currency: string | null;
  /** Minor units. */
  maxTotal: number | null;
  validUntil: string | null; // ISO; null while DRAFT
  createdAt: string; // ISO
  /** Number of required fields the extraction could not determine (DRAFT only). */
  missingCount: number;
}

/** One immutable version of a mandate's authorization terms. */
export interface MandateVersionSummary {
  version: number;
  createdAt: string; // ISO
  currency: string;
  /** Minor units. */
  maxTotal: number;
  /** Minor units; null = no shipping ceiling. */
  maxShipping: number | null;
  allowRecurring: boolean;
  allowRefurbished: boolean;
  purchaseType: PurchaseType;
  maxQuantity: number;
  validFrom: string; // ISO
  validUntil: string; // ISO
  approvalMode: ApprovalMode;
  allowedCategories: string[] | null;
  blockedCategories: string[] | null;
  allowedMerchants: string[] | null;
  blockedMerchants: string[] | null;
  /** True when this row is the mandate's currentVersion. */
  isCurrent: boolean;
}

export interface MandateAuditEventSummary {
  eventType: string;
  actorType: string;
  correlationId: string;
  createdAt: string; // ISO
}

/** Response of GET /api/mandates/:id — the full authorization record. */
export interface MandateDetailResponse {
  id: string;
  title: string;
  status: MandateStatus;
  currentVersion: number;
  instruction: string;
  createdAt: string; // ISO
  /** Current authorization terms; null while DRAFT (nothing authorized yet). */
  current: MandateVersionSummary | null;
  /** The AI's original interpretation, kept for the trust story. */
  draft: {
    fields: NormalizedMandateDraft;
    missingFields: MissingMandateField[];
    clarificationQuestion: string | null;
  } | null;
  versions: MandateVersionSummary[]; // ascending by version
  audit: MandateAuditEventSummary[]; // newest first
}

/** Uniform API error shape — codes are stable, messages are human-safe. */
export interface MandateApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Audit event type vocabulary for the mandate lifecycle (§17). */
export const MANDATE_EVENT_TYPES = {
  DRAFT_CREATED: "MANDATE_DRAFT_CREATED",
  CLARIFICATION_REQUESTED: "MANDATE_CLARIFICATION_REQUESTED",
  EXTRACTION_FAILED: "MANDATE_EXTRACTION_FAILED",
  CONFIRMED: "MANDATE_CONFIRMED",
  VERSION_CREATED: "MANDATE_VERSION_CREATED",
  REVOKED: "MANDATE_REVOKED",
} as const;

/** Human-readable labels for missing-field keys (used by UI + errors). */
export const MISSING_FIELD_LABELS: Record<MissingMandateField, string> = {
  currency: "Currency",
  maxTotal: "Maximum total spend",
};
