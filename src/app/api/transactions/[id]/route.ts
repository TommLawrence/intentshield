import { handleRouteError, jsonOk } from "@/lib/api";
import { getTransactionDetail } from "@/lib/transactions/service";

/**
 * GET /api/transactions/:id — the Payment Intent Record (§18): human-readable
 * audit record covering intent, mandate, agent proposal, policy decision,
 * violations, PayPal outcome and the full timeline.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return jsonOk(await getTransactionDetail(id));
  } catch (err) {
    return handleRouteError(err, "transactions:detail");
  }
}
