import { handleRouteError, jsonOk } from "@/lib/api";
import { getLabOverview } from "@/lib/lab/service";

/**
 * GET /api/lab/scenarios — adversarial lab catalog + fixture status.
 * Fixtures (standard + expired mandate, seeded catalogue) are ensured on read.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(await getLabOverview());
  } catch (err) {
    return handleRouteError(err, "lab:scenarios");
  }
}
