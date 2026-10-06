import { scanProductsForRiskSignals } from "@/lib/catalog/risk";
import { toPayPalAmount } from "@/lib/money";
import type { CatalogProduct } from "@/lib/catalog/service";
import type { ProposalItem, TransactionProposal } from "@/lib/policy/types";

/**
 * Deterministic transaction composition (Phase 3, §13).
 *
 * The agent selects products by SKU; THIS module composes the financial
 * proposal from authoritative catalogue rows. The agent's stated prices (if
 * any) are ignored — only DB values count. Tax is a flat 8% of subtotal
 * (documented demo simplification, integer minor units).
 *
 * Pure module: no db, no clock, no network.
 */

export const TAX_RATE_BASIS_POINTS = 800; // 8.00%

export interface CompositionPick {
  sku: string;
  quantity: number;
  reason: string;
}

export interface ResolvedPick extends CompositionPick {
  product: CatalogProduct;
}

export interface CompositionResult {
  proposal: TransactionProposal;
  /** The proposal's condition literal (NEW | REFURBISHED | MIXED). */
  condition: "NEW" | "REFURBISHED" | "MIXED";
  picks: ResolvedPick[];
}

/** Compose a well-formed proposal from catalogue picks. Unknown SKUs resolve to nothing. */
export function composeProposal(input: {
  sessionId: string;
  picks: CompositionPick[];
  products: CatalogProduct[];
  externalMetadata?: Record<string, unknown> | null;
}): CompositionResult {
  const bySku = new Map(input.products.map((p) => [p.sku, p]));
  const resolved: ResolvedPick[] = [];
  for (const pick of input.picks) {
    const product = bySku.get(pick.sku);
    if (product) resolved.push({ ...pick, product });
  }

  const items: ProposalItem[] = resolved.map((pick) => ({
    sku: pick.product.sku,
    name: pick.product.name,
    category: pick.product.category,
    unitPrice: pick.product.price,
    quantity: pick.quantity,
    condition: pick.product.condition,
    recurring: pick.product.recurring,
    merchant: pick.product.merchant,
  }));

  const subtotal = resolved.reduce((sum, p) => sum + p.product.price * p.quantity, 0);
  // Freight scales with units: unit shipping × quantity, summed per line.
  const shipping = resolved.reduce((sum, p) => sum + p.product.shipping * p.quantity, 0);
  const tax = Math.round((subtotal * TAX_RATE_BASIS_POINTS) / 10_000);
  const discount = 0;
  const total = subtotal + shipping + tax - discount;
  const quantity = resolved.reduce((sum, p) => sum + p.quantity, 0);
  const recurring = resolved.some((p) => p.product.recurring);
  const merchant = resolved[0]?.product.merchant ?? "";
  const currency = resolved[0]?.product.currency ?? "USD";
  const condition: "NEW" | "REFURBISHED" | "MIXED" = resolved.every((p) => p.product.condition === "NEW")
    ? "NEW"
    : resolved.every((p) => p.product.condition === "REFURBISHED")
      ? "REFURBISHED"
      : "MIXED";

  // Risk signals are recomputed here (full descriptions + external metadata),
  // NOT read from the agent. Signals are deterministic facts about content.
  const riskSignals = scanProductsForRiskSignals(
    resolved.map((p) => ({
      description: p.product.description,
      adversarial: p.product.adversarial,
      externalMetadata: p.product.externalMetadata,
    }))
  );

  const proposal: TransactionProposal = {
    sessionId: input.sessionId,
    merchant,
    items,
    subtotal,
    shipping,
    tax,
    discount,
    total,
    currency,
    recurring,
    quantity,
    externalMetadata: input.externalMetadata ?? null,
    riskSignals,
  };

  return { proposal, condition, picks: resolved };
}

/** Format a catalogue row for the agent's read-only context (major units). */
export function toAgentCatalogEntry(product: CatalogProduct): {
  sku: string;
  name: string;
  category: string;
  merchant: string;
  price: string;
  currency: string;
  condition: string;
  recurring: boolean;
  recurringPrice: string | null;
  recurringInterval: string | null;
  shipping: string;
  description: string;
} {
  return {
    sku: product.sku,
    name: product.name,
    category: product.category,
    merchant: product.merchant,
    price: toPayPalAmount(product.price),
    currency: product.currency,
    condition: product.condition,
    recurring: product.recurring,
    recurringPrice: product.recurringPrice !== null ? toPayPalAmount(product.recurringPrice) : null,
    recurringInterval: product.recurringInterval,
    shipping: toPayPalAmount(product.shipping),
    // Truncate UNTRUSTED description for the model context; the full text
    // lives in the DB and the UI. The scanner sees the full text regardless.
    description: product.description.slice(0, 160),
  };
}
