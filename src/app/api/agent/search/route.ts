import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api";
import { runAgentSearch } from "@/lib/agent/service";

/**
 * POST /api/agent/search — the shopping-agent run (§47 steps 3–5).
 *
 * 1. Validates the request; the mandate must be ACTIVE with a confirmed version.
 * 2. Opens an agent session (fully persisted).
 * 3. The AI searches the controlled catalogue and proposes BY SKU ONLY —
 *    prices are recomputed from authoritative DB rows, never trusted from
 *    the model.
 * 4. The deterministic policy engine evaluates the composed proposal.
 * 5. The proposal, evaluation, agent actions and audit events are persisted
 *    under one correlationId.
 *
 * The AI never authorizes anything — the response carries the engine's
 * decision and the full Payment Intent Record data.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    return jsonOk(await runAgentSearch(body));
  } catch (err) {
    return handleRouteError(err, "agent:search");
  }
}
