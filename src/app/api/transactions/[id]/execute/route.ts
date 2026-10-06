import { headers } from "next/headers";

import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api";
import { executeTransaction } from "@/lib/transactions/service";

/**
 * POST /api/transactions/:id/execute — THE GUARDED EXECUTOR (§13).
 *
 * 1. Structural refusals first: BLOCKED transactions cannot be executed by
 *    any code path; IN_REVIEW requires prior human approval.
 * 2. Idempotency: a live AWAITING_BUYER order is returned as-is — retries
 *    can never create a second PayPal order.
 * 3. The policy engine RE-EVALUATES deterministically at execution time.
 * 4. Only then is PayPal Orders v2 called (server-side credentials only),
 *    with PayPal-Request-Id = executionId, returning the buyer-approval link.
 *
 * Without sandbox credentials the endpoint answers an honest 409
 * PAYPAL_NOT_CONFIGURED — IntentShield never fakes PayPal results.
 */

/** Derive the externally-visible origin (proxy-aware) for PayPal return URLs. */
async function externalOrigin(request: Request): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await parseJsonBody(request);
    const origin = await externalOrigin(request);
    return jsonOk(await executeTransaction(id, body, origin));
  } catch (err) {
    return handleRouteError(err, "transactions:execute");
  }
}
