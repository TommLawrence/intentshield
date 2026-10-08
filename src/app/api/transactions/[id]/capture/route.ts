import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api";
import { captureTransaction } from "@/lib/transactions/service";

/**
 * POST /api/transactions/:id/capture — capture after PayPal buyer approval.
 *
 * The buyer's approval is verified against PayPal (getOrder) before any
 * capture attempt; the capture call replays PayPal-Request-Id = executionId so
 * a retried request can never double-charge. Terminal states are idempotent.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await parseJsonBody(request);
    return jsonOk(await captureTransaction(id, body));
  } catch (err) {
    return handleRouteError(err, "transactions:capture");
  }
}
