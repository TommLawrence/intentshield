/**
 * Live-market grounding service — Channel3 search + read-only policy check.
 *
 * Trust model:
 * - Channel3 offers are UNTRUSTED market data, exactly like AI proposals.
 *   They are never persisted and can never reach PayPal: this path creates
 *   no transaction record, no agent action and no audit event. It is an
 *   advisory lens — "what would the SAME deterministic policy engine say
 *   about this real live-market offer under the selected mandate?"
 * - Best-offer selection is deterministic (cheapest in-stock offer, domain
 *   as the stable tiebreaker) — the same no-nondeterminism discipline as
 *   the proposal composer.
 * - Prices cross the schema wall already converted to integer minor units;
 *   no float ever touches the policy engine.
 */

import { z } from "zod";

import {
  loadMandateForProposal,
  toMandateConstraints,
} from "@/lib/agent/service";
import {
  Channel3ApiError,
  Channel3NotConfiguredError,
  searchLiveMarket,
  type Channel3Product,
} from "@/lib/channel3/client";
import type {
  MarketProduct,
  MarketSearchResponse,
} from "@/lib/channel3/types";
import { newCorrelationId } from "@/lib/correlation";
import { MandateApiError } from "@/lib/mandates/service";
import { evaluateTransaction } from "@/lib/policy/engine";
import type { TransactionProposal } from "@/lib/policy/types";
import { formatZodIssues } from "@/lib/transactions/validation";

const QUERY_MIN = 3;
const QUERY_MAX = 200;
const PRODUCT_LIMIT = 12;

/** POST /api/market/search request body (strict — unknown fields rejected). */
export const marketSearchRequestSchema = z.strictObject({
  mandateId: z.string().trim().min(1).max(64),
  query: z
    .string()
    .trim()
    .min(QUERY_MIN, "Describe a product to search for")
    .max(QUERY_MAX, "Market query is too long"),
  /** Echoed by the UI to link separate operator actions into one trace. */
  correlationId: z.string().uuid().optional(),
});

/**
 * Deterministic best-offer pick: cheapest in-stock offer (an offer with no
 * availability data counts as in stock, per Channel3's contract), merchant
 * domain as the stable tiebreaker.
 */
function bestOffer(
  product: Channel3Product
): Channel3Product["offers"][number] | null {
  const inStock = product.offers.filter((o) => o.availability !== "OutOfStock");
  const pool = inStock.length > 0 ? inStock : product.offers;
  if (pool.length === 0) return null;
  const sorted = [...pool].sort(
    (a, b) => a.priceMinor - b.priceMinor || a.domain.localeCompare(b.domain)
  );
  return sorted[0];
}

/**
 * Compose the single-item read-only proposal the engine judges. Structurally
 * honest: one item, merchant = offer domain, total = subtotal (no shipping,
 * tax or discount is ever invented for a market listing), quantity 1.
 */
function toAdvisoryProposal(
  product: Channel3Product,
  offer: Channel3Product["offers"][number]
): TransactionProposal {
  return {
    // Session marker for traceability in the verdict — this proposal is
    // never persisted, so it never collides with real agent sessions.
    sessionId: "live-market-advisory",
    merchant: offer.domain,
    items: [
      {
        sku: `CH3-${product.id}`,
        name: product.title,
        category: product.category ?? "uncategorized",
        unitPrice: offer.priceMinor,
        quantity: 1,
        condition: offer.condition,
        recurring: false,
        merchant: offer.domain,
      },
    ],
    subtotal: offer.priceMinor,
    shipping: 0,
    tax: 0,
    discount: 0,
    total: offer.priceMinor,
    currency: offer.currency,
    recurring: false,
    quantity: 1,
    externalMetadata: null,
    riskSignals: [],
  };
}

/** POST /api/market/search — the live-market grounding run. */
export async function runMarketSearch(
  body: unknown
): Promise<MarketSearchResponse> {
  const parsed = marketSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new MandateApiError(
      400,
      "VALIDATION_ERROR",
      "The market search request was not valid.",
      formatZodIssues(parsed.error)
    );
  }
  const { mandateId, query } = parsed.data;
  const correlationId = parsed.data.correlationId ?? newCorrelationId();

  const mandate = await loadMandateForProposal(mandateId);
  if (!mandate) {
    throw new MandateApiError(404, "NOT_FOUND", "Mandate not found.");
  }
  if (mandate.status !== "ACTIVE") {
    throw new MandateApiError(
      409,
      "INVALID_STATE",
      `Only ACTIVE mandates can run a live market check — this one is ${mandate.status.toLowerCase()}.`
    );
  }

  let search: Awaited<ReturnType<typeof searchLiveMarket>>;
  try {
    search = await searchLiveMarket({
      query,
      currency: mandate.version.currency,
      limit: PRODUCT_LIMIT,
    });
  } catch (err) {
    if (err instanceof Channel3NotConfiguredError) {
      // Honest gate — the same contract the PayPal layer honors.
      throw new MandateApiError(
        409,
        "CHANNEL3_NOT_CONFIGURED",
        "Channel3 is not configured (CHANNEL3_API_KEY is not set). IntentShield never fakes live market data — add the key in .env and retry."
      );
    }
    if (err instanceof Channel3ApiError) {
      throw new MandateApiError(
        502,
        "CHANNEL3_ERROR",
        `Live market search failed. ${err.message}`
      );
    }
    throw err;
  }

  const constraints = toMandateConstraints(mandate);
  const now = new Date();

  const products: MarketProduct[] = [];
  for (const product of search.products) {
    const offer = bestOffer(product);
    // A product with no offers has nothing to judge — honestly skipped.
    if (!offer) continue;

    const evaluation = evaluateTransaction(
      constraints,
      toAdvisoryProposal(product, offer),
      {
        now,
        // Advisory only: a market lookup is not an execution attempt, so
        // duplicate semantics (R-12) do not apply — no fingerprint exists
        // anywhere because nothing is persisted from this path.
        executedFingerprints: [],
        mandateStatus: mandate.status,
      }
    );

    products.push({
      productId: product.id,
      title: product.title,
      brand: product.brand,
      imageUrl: product.imageUrl,
      category: product.category,
      offer: {
        domain: offer.domain,
        url: offer.url,
        priceMinor: offer.priceMinor,
        currency: offer.currency,
        availability: offer.availability,
        condition: offer.condition,
      },
      policy: {
        decision: evaluation.decision,
        firedRules: evaluation.ruleOutcomes
          .filter((o) => o.outcome !== "PASS")
          .map((o) => o.code),
        summary:
          evaluation.decision === "ALLOW"
            ? `All ${evaluation.ruleOutcomes.length} rules passed against the mandate.`
            : evaluation.violations[0] ?? evaluation.warnings[0] ?? "",
      },
    });
  }

  return {
    correlationId,
    market: { provider: "channel3", query, productCount: products.length },
    products,
  };
}
