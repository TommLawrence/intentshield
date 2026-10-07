import { handleRouteError, jsonOk } from "@/lib/api";
import { listMandates } from "@/lib/mandates/service";

/**
 * GET /api/mandates — every mandate (DRAFT, ACTIVE, REVOKED) with its
 * headline authorization numbers. The authorization console's list feed.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(await listMandates());
  } catch (err) {
    return handleRouteError(err, "mandates:list");
  }
}
