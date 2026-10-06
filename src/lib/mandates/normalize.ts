import type { MandateDraft } from "@/lib/ai/schemas";
import { parseMoneyToMinor } from "@/lib/money";
import type {
  ExtractionClassification,
  MissingMandateField,
  NormalizedMandateDraft,
} from "@/lib/mandates/types";
import { MANDATE_BOUNDS } from "@/lib/mandates/validation";

/**
 * Deterministic normalization for the mandate pipeline (§8).
 *
 * Everything here is PURE: same input → same output, no IO, no clock, no
 * randomness. Financial normalization NEVER uses floating point beyond the
 * single controlled decimal-string parse, and every result is re-checked
 * against explicit bounds. The model's representation is not trusted past
 * this module.
 */

/** Parse a major-unit amount string into minor units, enforcing bounds. Throws on violation. */
export function parseAmountToMinor(
  value: string,
  bound: number,
  label: string
): number {
  const minor = parseMoneyToMinor(value);
  if (minor < 1) {
    throw new Error(`${label} must be greater than zero`);
  }
  if (minor > bound) {
    throw new Error(`${label} exceeds the maximum allowed (${(bound / 100).toLocaleString("en-US")} units)`);
  }
  return minor;
}

/** Trim, cap length, drop empties, dedupe; optionally lowercase for matching. */
export function sanitizeStringList(
  items: string[] | null | undefined,
  options: { lowercase: boolean; maxItems: number }
): string[] | null {
  if (items === null || items === undefined) return null;
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const raw of items) {
    let item = raw.trim().slice(0, MANDATE_BOUNDS.MAX_LIST_ITEM_LENGTH);
    if (options.lowercase) item = item.toLowerCase();
    if (item.length === 0) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    sanitized.push(item);
    if (sanitized.length >= options.maxItems) break;
  }
  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Derive a short display title from the original instruction.
 * Deterministic and AI-free: first sentence, capped at 60 chars on a word
 * boundary. Display only — never authority.
 */
export function deriveMandateTitle(intent: string): string {
  const collapsed = intent.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "Spending mandate";
  const firstSentence = collapsed.split(/[.!?](\s|$)/)[0]?.trim() || collapsed;
  const source = firstSentence.length >= 8 ? firstSentence : collapsed;
  if (source.length <= 60) return source;
  const cut = source.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

/**
 * Convert a schema-validated AI draft (major units) into the canonical
 * normalized form (minor units, sanitized lists). Throws only if a
 * schema-valid number still fails money parsing — defense in depth.
 */
export function normalizeDraftToMinor(draft: MandateDraft): NormalizedMandateDraft {
  return {
    currency: draft.currency,
    maxTotal: draft.maxTotal === null ? null : parseMoneyToMinor(draft.maxTotal),
    maxShipping: draft.maxShipping === null ? null : parseMoneyToMinor(draft.maxShipping),
    allowRecurring: draft.allowRecurring,
    allowRefurbished: draft.allowRefurbished,
    purchaseType: draft.purchaseType,
    maxQuantity: Math.min(Math.max(Math.trunc(draft.maxQuantity), 1), MANDATE_BOUNDS.MAX_QUANTITY),
    validityDays: draft.validityDays,
    allowedCategories: sanitizeStringList(draft.allowedCategories, {
      lowercase: true,
      maxItems: MANDATE_BOUNDS.MAX_LIST_ITEMS,
    }),
    blockedCategories: sanitizeStringList(draft.blockedCategories, {
      lowercase: true,
      maxItems: MANDATE_BOUNDS.MAX_LIST_ITEMS,
    }),
    allowedMerchants: sanitizeStringList(draft.allowedMerchants, {
      lowercase: false,
      maxItems: MANDATE_BOUNDS.MAX_LIST_ITEMS,
    }),
    blockedMerchants: sanitizeStringList(draft.blockedMerchants, {
      lowercase: false,
      maxItems: MANDATE_BOUNDS.MAX_LIST_ITEMS,
    }),
    approvalMode: draft.approvalMode,
  };
}

/** Required fields that are missing — only the human can supply them (§7). */
export function missingFieldsFor(draft: NormalizedMandateDraft): MissingMandateField[] {
  const missing: MissingMandateField[] = [];
  if (draft.currency === null) missing.push("currency");
  if (draft.maxTotal === null) missing.push("maxTotal");
  return missing;
}

/**
 * Deterministic classification (§7): CLEAR only when every required financial
 * field is present AND the model did not ask for clarification. The SYSTEM
 * decides this — never the model.
 */
export function classifyDraft(
  draft: NormalizedMandateDraft,
  clarificationNeeded: string | null
): ExtractionClassification {
  if (missingFieldsFor(draft).length > 0) return "AMBIGUOUS";
  if (clarificationNeeded !== null && clarificationNeeded.trim().length > 0) return "AMBIGUOUS";
  return "CLEAR";
}

/**
 * Deterministic contradiction checks (§20). Ambiguous or conflicting
 * financial language must surface as warnings — it is never silently
 * resolved in either direction.
 */
export function checkFinancialContradictions(draft: {
  maxTotal: number | null;
  maxShipping: number | null;
  allowRecurring: boolean;
  purchaseType: NormalizedMandateDraft["purchaseType"];
}): string[] {
  const warnings: string[] = [];
  if (draft.maxTotal !== null && draft.maxShipping !== null && draft.maxShipping > draft.maxTotal) {
    warnings.push(
      "The shipping ceiling exceeds the total ceiling — these constraints contradict each other. Fix one before confirming."
    );
  }
  if (draft.purchaseType === "RECURRING" && !draft.allowRecurring) {
    warnings.push(
      "Purchase type is RECURRING but recurring charges are not allowed. Allow recurring charges or switch to a one-time purchase."
    );
  }
  return warnings;
}

/**
 * Validity window for a confirmed version. `validityDays` null → documented
 * default (30 days) — always displayed to the human, never silent.
 */
export function computeValidityWindow(validityDays: number | null, now: Date): {
  validFrom: Date;
  validUntil: Date;
  days: number;
} {
  const days = validityDays ?? MANDATE_BOUNDS.DEFAULT_VALIDITY_DAYS;
  const validFrom = new Date(now.getTime());
  const validUntil = new Date(now.getTime());
  validUntil.setUTCDate(validUntil.getUTCDate() + days);
  return { validFrom, validUntil, days };
}
