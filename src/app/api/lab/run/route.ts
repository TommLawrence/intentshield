import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api";
import { runScenario } from "@/lib/lab/service";

/**
 * POST /api/lab/run — run one adversarial scenario (A–J) end-to-end through
 * the REAL pipeline: deterministic composition → policy engine → persistence.
 * No mocks, no shortcuts — the same wall every transaction passes.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    return jsonOk(await runScenario(body));
  } catch (err) {
    return handleRouteError(err, "lab:run");
  }
}
