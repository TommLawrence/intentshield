import { handleRouteError, jsonOk } from "@/lib/api";
import { getCatalogWithStats } from "@/lib/catalog/service";

/**
 * GET /api/products — the controlled catalogue (idempotently seeded on first
 * read). Amounts are integer minor units. Adversarial entries are clearly
 * flagged; descriptions/externalMetadata are UNTRUSTED display data.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(await getCatalogWithStats());
  } catch (err) {
    return handleRouteError(err, "products:list");
  }
}
