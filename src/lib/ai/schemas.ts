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
 */
export const mandateDraftSchema = z
  .object({
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "ISO 4217 currency code, e.g. USD")
      .describe("Currency the user authorized, ISO 4217"),
    maxTotal: z.number().positive().describe("Maximum TOTAL spend in major units, e.g. 900 means 900.00"),
    maxShipping: z
      .number()
      .positive()
      .nullable()
      .describe("Maximum shipping cost in major units, or null if the user set no shipping ceiling"),
    allowRecurring: z.boolean().describe("true only if the user explicitly allows recurring/subscription charges"),
    allowRefurbished: z.boolean().describe("true only if the user explicitly allows refurbished items"),
    purchaseType: z.enum(["ONE_TIME", "RECURRING"]).describe("ONE_TIME unless the user explicitly authorizes subscriptions"),
    maxQuantity: z.number().int().positive().describe("Maximum total item quantity authorized"),
    validityDays: z
      .number()
      .int()
      .positive()
      .nullable()
      .describe("How many days from creation the mandate stays valid, or null if not stated (app default applies)"),
    allowedCategories: z
      .array(z.string())
      .nullable()
      .describe("Categories the user explicitly allows, or null if unrestricted"),
    blockedCategories: z
      .array(z.string())
      .nullable()
      .describe("Categories the user explicitly forbids, or null if none"),
    allowedMerchants: z.array(z.string()).nullable().describe("Merchants the user explicitly allows, or null"),
    blockedMerchants: z.array(z.string()).nullable().describe("Merchants the user explicitly forbids, or null"),
    clarificationNeeded: z
      .string()
      .nullable()
      .describe("If the mandate is too ambiguous to structure safely, a short question for the user; else null"),
  })
  .strict();

export type MandateDraft = z.infer<typeof mandateDraftSchema>;

/** Thrown when model output fails schema validation or cannot be parsed. */
export class AIExtractionError extends Error {
  constructor(reason: string) {
    super(`Intent extraction failed validation: ${reason}. The output was NOT trusted. Failing safe.`);
    this.name = "AIExtractionError";
  }
}
