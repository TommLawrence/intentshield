import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api";
import { reviewTransaction } from "@/lib/transactions/service";

/**
 * POST /api/transactions/:id/review — the human gate (§17 REVIEW semantics).
 *
 * APPROVE: only for transactions the engine marked REVIEW. Records a
 * PaymentIntent decidedBy USER (the human, not the model, is the authority)
 * and unlocks guarded execution.
 *
 * REJECT: the transaction is cancelled; history is preserved. Works for both
 * IN_REVIEW and accepted-but-not-yet-executed transactions.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await parseJsonBody(request);
    return jsonOk(await reviewTransaction(id, body));
  } catch (err) {
    return handleRouteError(err, "transactions:review");
  }
}
