import { handleRouteError, jsonOk } from "@/lib/api";
import { listTransactions } from "@/lib/transactions/service";

/**
 * GET /api/transactions — the Agent Activity Ledger (§19): every proposed
 * transaction with its latest decision, status and PayPal outcome.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(await listTransactions());
  } catch (err) {
    return handleRouteError(err, "transactions:list");
  }
}
