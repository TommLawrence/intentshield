import { z } from "zod";

/**
 * Server-side request validation for the agent + transaction + lab lifecycle.
 *
 * Everything crossing the trust boundary is validated here with strict
 * objects — unknown fields are rejected. These schemas are PURE (no db, no
 * env) so they stay unit-testable.
 */

const correlationIdField = z.string().uuid().optional();

/** POST /api/agent/search request body. */
export const agentSearchRequestSchema = z.strictObject({
  mandateId: z.string().trim().min(1).max(64),
  request: z
    .string()
    .trim()
    .min(3, "Describe what the agent should find")
    .max(2000, "Shopping request is too long"),
  /** Echoed by the UI to link separate operator actions into one trace. */
  correlationId: correlationIdField,
});

export type AgentSearchRequest = z.infer<typeof agentSearchRequestSchema>;

/** POST /api/transactions/:id/review request body. */
export const reviewRequestSchema = z.strictObject({
  action: z.enum(["APPROVE", "REJECT"]),
  correlationId: correlationIdField,
  note: z.string().trim().max(200).optional(),
});

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

/** POST /api/transactions/:id/execute request body. */
export const executeRequestSchema = z.strictObject({
  correlationId: correlationIdField,
});

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

/** POST /api/transactions/:id/capture request body. */
export const captureRequestSchema = z.strictObject({
  correlationId: correlationIdField,
});

export type CaptureRequest = z.infer<typeof captureRequestSchema>;

/** POST /api/lab/run request body. */
export const labRunRequestSchema = z.strictObject({
  scenarioId: z.enum([
    "A_VALID_PURCHASE",
    "B_OVER_BUDGET",
    "C_SHIPPING_VIOLATION",
    "D_RECURRING_CHARGE",
    "E_REFURBISHED",
    "F_CURRENCY_MISMATCH",
    "G_EXPIRED_MANDATE",
    "H_DUPLICATE",
    "I_MISSING_FIELD",
    "J_PROMPT_INJECTION",
  ]),
});

export type LabRunRequest = z.infer<typeof labRunRequestSchema>;

/** Format a zod failure into safe, field-scoped issue summaries (no internals). */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "request"}: ${i.message}`);
}
