import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api";
import { confirmDraftMandate } from "@/lib/mandates/service";

/**
 * POST /api/mandates/:id/confirm — the human authorization moment (§4 steps
 * 8–11). The reviewed payload is re-validated and re-normalized server-side
 * (nothing client-side is trusted), then one atomic transaction creates the
 * immutable MandateVersion 1 and transitions the mandate DRAFT → ACTIVE.
 *
 * Confirming a non-draft mandate is rejected with 409 — state transitions
 * are explicit and one-shot.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await parseJsonBody(request);
    return jsonOk(await confirmDraftMandate(id, body));
  } catch (err) {
    return handleRouteError(err, "mandates:confirm");
  }
}
