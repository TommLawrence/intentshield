import { handleRouteError, jsonOk } from "@/lib/api";
import { getMandateDetail } from "@/lib/mandates/service";

/**
 * GET /api/mandates/:id — the full authorization record: original intent,
 * current terms, the AI's draft interpretation, immutable version history,
 * and the mandate's audit trail.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return jsonOk(await getMandateDetail(id));
  } catch (err) {
    return handleRouteError(err, "mandates:detail");
  }
}
