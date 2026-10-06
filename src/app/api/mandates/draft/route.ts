import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api";
import { createDraftMandate } from "@/lib/mandates/service";

/**
 * POST /api/mandates/draft — natural language in, schema-validated
 * interpretation out (§4 steps 1–7).
 *
 * Creates a DRAFT mandate row. Nothing is authorized: no version exists,
 * currentVersion stays 0, and the draft cannot be evaluated by policy.
 * Extraction failures return structured errors and create nothing.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    return jsonOk(await createDraftMandate(body));
  } catch (err) {
    return handleRouteError(err, "mandates:draft");
  }
}
