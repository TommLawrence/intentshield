/**
 * Channel3 live-market types — shared by the server route and the client
 * panel. PURE TYPES ONLY: this module must never import server code (db,
 * env, fetch) so client components can import it safely.
 */

import type { PolicyDecision, RuleCode } from "@/lib/policy/types";

/** One merchant offer on a live Channel3 product. */
export interface MarketOffer {
  /** Merchant domain, e.g. "walmart.com" — the R-07 merchant input. */
  domain: string;
  /** The merchant's offer page (external, advisory link-out only). */
  url: string;
  /** Integer minor units, converted deterministically server-side. */
  priceMinor: number;
  currency: string;
  availability: string;
  condition: "NEW" | "REFURBISHED";
}

/** A live product with its best offer and the read-only policy verdict. */
export interface MarketProduct {
  productId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  offer: MarketOffer;
  policy: {
    decision: PolicyDecision;
    /** Rules that actually fired (outcome !== PASS). Empty = all passed. */
    firedRules: RuleCode[];
    /** One honest line of why — first violation/warning, or the pass count. */
    summary: string;
  };
}

/** POST /api/market/search response. */
export interface MarketSearchResponse {
  correlationId: string;
  market: {
    provider: "channel3";
    query: string;
    productCount: number;
  };
  products: MarketProduct[];
}
