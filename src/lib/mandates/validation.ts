import { z } from "zod";

/**
 * Server-side request validation for the mandate lifecycle (§6, §8, §18).
 *
 * Everything crossing the trust boundary is validated here with `.strict()` /
 * `z.strictObject` — unknown fields are rejected, financial values arrive as
 * major-unit strings and are normalized deterministically in normalize.ts.
 *
 * These schemas are PURE (no db, no env) so they stay unit-testable.
 */

/** Currencies the platform supports (2-decimal, PayPal-friendly subset). */
export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Deterministic financial bounds — the backstop against hallucinated or
 * hostile amounts. A model or client claiming more is rejected outright.
 */
export const MANDATE_BOUNDS = {
  /** $1,000,000.00 — a personal spending authorization ceiling for this product. */
  MAX_TOTAL_MINOR: 100_000_000,
  /** $100,000.00 */
  MAX_SHIPPING_MINOR: 10_000_000,
  MAX_QUANTITY: 50,
  MAX_VALIDITY_DAYS: 730,
  /** Default validity window when the human stated none (always displayed, never silent). */
  DEFAULT_VALIDITY_DAYS: 30,
  MAX_LIST_ITEMS: 10,
  MAX_LIST_ITEM_LENGTH: 40,
  MIN_INSTRUCTION_LENGTH: 3,
  MAX_INSTRUCTION_LENGTH: 4000,
} as const;

/** Plain decimal amount string, e.g. "900", "900.5", "900.00". No exponents, no signs. */
const AMOUNT_STRING_REGEX = /^\d{1,9}(\.\d{1,2})?$/;

const amountString = z
  .string()
  .trim()
  .regex(AMOUNT_STRING_REGEX, "Enter a plain amount like 900 or 900.00 (max 2 decimals)");

const stringList = z
  .array(z.string().trim().min(1).max(MANDATE_BOUNDS.MAX_LIST_ITEM_LENGTH))
  .max(MANDATE_BOUNDS.MAX_LIST_ITEMS)
  .nullable();

/** POST /api/mandates/draft request body. */
export const draftRequestSchema = z.strictObject({
  instruction: z
    .string()
    .trim()
    .min(MANDATE_BOUNDS.MIN_INSTRUCTION_LENGTH, "Describe what you want to authorize")
    .max(MANDATE_BOUNDS.MAX_INSTRUCTION_LENGTH, "Instruction is too long"),
});

export type DraftRequest = z.infer<typeof draftRequestSchema>;

/**
 * POST /api/mandates/:id/confirm request body.
 *
 * This is the payload the HUMAN reviewed and confirmed. The server trusts
 * nothing about how it was produced — every field is re-validated and
 * re-normalized. Required financial fields (currency, maxTotal) are non-null
 * here: a mandate without them cannot be activated.
 */
export const confirmRequestSchema = z.strictObject({
  /** Echoed from the draft step so the audit chain links end-to-end. */
  correlationId: z.string().uuid().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Currency must be an ISO 4217 code, e.g. USD")
    .refine((c): c is SupportedCurrency => (SUPPORTED_CURRENCIES as readonly string[]).includes(c), {
      message: `Unsupported currency. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`,
    }),
  maxTotal: amountString,
  maxShipping: amountString.nullable(),
  allowRecurring: z.boolean(),
  allowRefurbished: z.boolean(),
  purchaseType: z.enum(["ONE_TIME", "RECURRING"]),
  maxQuantity: z
    .number()
    .int()
    .min(1, "Quantity must be at least 1")
    .max(MANDATE_BOUNDS.MAX_QUANTITY, "Quantity ceiling is too high"),
  validityDays: z
    .number()
    .int()
    .min(1, "Validity must be at least 1 day")
    .max(MANDATE_BOUNDS.MAX_VALIDITY_DAYS, "Validity cannot exceed 730 days")
    .nullable(),
  allowedCategories: stringList,
  blockedCategories: stringList,
  allowedMerchants: stringList,
  blockedMerchants: stringList,
  approvalMode: z.enum(["AUTO", "MANUAL_REVIEW"]),
});

export type ConfirmRequest = z.infer<typeof confirmRequestSchema>;

/** POST /api/mandates/:id/revoke request body. */
export const revokeRequestSchema = z.strictObject({
  correlationId: z.string().uuid().optional(),
  reason: z.string().trim().max(200).optional(),
});

export type RevokeRequest = z.infer<typeof revokeRequestSchema>;

/** Format a zod failure into safe, field-scoped issue summaries (no internals). */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "request"}: ${i.message}`);
}
