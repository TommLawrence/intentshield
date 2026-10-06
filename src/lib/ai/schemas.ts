import { z } from "zod";

/**
 * Schema for AI-extracted mandate drafts.
 *
 * The model works in MAJOR units (e.g. 900 means $900.00) because that is the
 * natural language it is translating. Conversion to minor units happens in
 * deterministic code — never in the model.
 *
 * `.strict()` rejects hallucinated fields: model output gets no benefit of
 * the doubt and can never smuggle extra "authority" into a mandate.
 *
 * Phase 2 evolution: `currency`, `maxTotal` and `approvalMode` are NULLABLE.
 * A model that cannot confidently extract a financial constraint MUST return
 * null for it — never an invented value. This is the structural guarantee
 * behind ambiguity handling: the system surfaces what is missing and asks
 * the human; only the human's confirmation can supply a financial ceiling.
 */
export const mandateDraftSchema = z
  .object({
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "ISO 4217 currency code, e.g. USD")
      .nullable()
      .describe("Currency the user authorized, ISO 4217, or null if no currency is stated or inferable"),
    maxTotal: z
      .number()
      .positive()
      .nullable()
      .describe(
        "Maximum TOTAL spend in major units, e.g. 900 means 900.00. " +
          "null if the user stated no amount or only vague terms like 'reasonable'"
      ),
    maxShipping: z
      .number()
      .positive()
      .nullable()
      .describe("Maximum shipping cost in major units, or null if the user set no shipping ceiling"),
    allowRecurring: z.boolean().describe("true only if the user explicitly allows recurring/subscription charges"),
    allowRefurbished: z.boolean().describe("true only if the user explicitly allows refurbished/used items"),
    purchaseType: z.enum(["ONE_TIME", "RECURRING"]).describe("ONE_TIME unless the user explicitly authorizes subscriptions"),
    maxQuantity: z.number().int().positive().describe("Maximum total item quantity authorized; 1 when not stated (most restrictive)"),
    validityDays: z
      .number()
      .int()
      .positive()
      .nullable()
      .describe("How many days from creation the mandate stays valid, or null if not stated"),
    allowedCategories: z
      .array(z.string())
      .nullable()
      .describe("Categories the user explicitly allows (lowercase, e.g. \"laptops\"), or null if unrestricted"),
    blockedCategories: z
      .array(z.string())
      .nullable()
      .describe("Categories the user explicitly forbids, or null if none"),
    allowedMerchants: z.array(z.string()).nullable().describe("Merchants the user explicitly allows, or null"),
    blockedMerchants: z.array(z.string()).nullable().describe("Merchants the user explicitly forbids, or null"),
    approvalMode: z
      .enum(["AUTO", "MANUAL_REVIEW"])
      .nullable()
      .describe("MANUAL_REVIEW if the user asks to be consulted before spending; null if no preference is stated"),
    clarificationNeeded: z
      .string()
      .nullable()
      .describe(
        "If important constraints are missing, ambiguous, or contradictory: one short question " +
          "for the user naming exactly what must be clarified; else null"
      ),
  })
  .strict();

export type MandateDraft = z.infer<typeof mandateDraftSchema>;

/**
 * Schema for the shopping agent's catalogue search (Phase 3).
 *
 * The agent PROPOSES by SKU reference only — it never states prices, totals,
 * currencies or merchant names. Deterministic server code re-reads the
 * authoritative catalogue rows and composes the transaction. A model that
 * hallucinates a price has no effect: `.strict()` rejects extra fields and
 * unknown SKUs are dropped before composition.
 */
export const productSearchSchema = z.strictObject({
  picks: z
    .array(
      z.strictObject({
        sku: z.string().trim().min(1).max(32),
        quantity: z.number().int().min(1).max(10),
        reason: z.string().trim().max(300),
      })
    )
    .max(5)
    .describe("Products selected from the catalogue, by SKU exactly as listed"),
  notes: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .describe("One short shopping-agent remark for the human, or null"),
});

export type ProductSearchResult = z.infer<typeof productSearchSchema>;

/** Thrown when model output fails schema validation or cannot be parsed. */
export class AIExtractionError extends Error {
  constructor(reason: string) {
    super(`Intent extraction failed validation: ${reason}. The output was NOT trusted. Failing safe.`);
    this.name = "AIExtractionError";
  }
}

/** Thrown when the product-search completion fails schema validation. */
export class AISearchError extends Error {
  constructor(reason: string) {
    super(`Product search failed validation: ${reason}. The output was NOT trusted. Failing safe.`);
    this.name = "AISearchError";
  }
}
