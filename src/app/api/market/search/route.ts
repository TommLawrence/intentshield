import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api";
import { runMarketSearch } from "@/lib/channel3/market-service";

/**
 * POST /api/market/search — live market grounding (Channel3), advisory only.
 *
 * 1. Validates the request; the mandate must be ACTIVE.
 * 2. Queries Channel3's live product graph (real products, real merchants,
 *    real prices) — or fails honestly with 409 CHANNEL3_NOT_CONFIGURED
 *    when CHANNEL3_API_KEY is absent. IntentShield never fakes market data.
 * 3. Runs the SAME deterministic policy engine against each product's best
 *    offer — strictly read-only: no transaction record, no agent action,
 *    no audit event, and nothing that could ever reach PayPal.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    return jsonOk(await runMarketSearch(body));
  } catch (err) {
    return handleRouteError(err, "market:search");
  }
}
