import { handleRouteError, jsonOk, parseJsonBody } from "@/lib/api";
import { revokeMandate } from "@/lib/mandates/service";

/**
 * POST /api/mandates/:id/revoke — revocation (§16). ACTIVE → REVOKED only.
 * Every version row and audit event is preserved; the mandate simply stops
 * being an authority for future phases.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await parseJsonBody(request);
    return jsonOk(await revokeMandate(id, body));
  } catch (err) {
    return handleRouteError(err, "mandates:revoke");
  }
}
