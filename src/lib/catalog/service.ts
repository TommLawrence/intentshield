import { db } from "@/lib/db";
import { CATALOG_SEED } from "@/lib/catalog/seed-data";
import { scanProductsForRiskSignals, type RiskSignal } from "@/lib/catalog/risk";

/**
 * Catalogue service (Phase 3).
 *
 * The catalogue is the agent's controlled world: everything the agent can
 * "find" lives here, including deliberately adversarial listings. Seeding is
 * idempotent — safe to call on every read; the demo always works without a
 * manual seed step.
 *
 * Authoritative prices/conditions/recurring flags are the DB rows, never what
 * the agent says about them. The AI selects by SKU; deterministic code does
 * everything else.
 */

let seedPromise: Promise<void> | null = null;

async function seedOnce(): Promise<void> {
  const existing = await db.product.count();
  if (existing >= CATALOG_SEED.length) return;

  for (const product of CATALOG_SEED) {
    const riskSignals = scanProductsForRiskSignals([
      { description: product.description, adversarial: product.adversarial, externalMetadata: product.externalMetadata },
    ]);
    const shared = {
      // Refresh demo content so catalogue edits propagate on redeploy.
      name: product.name,
      category: product.category,
      merchant: product.merchant,
      price: product.price,
      currency: product.currency,
      condition: product.condition,
      recurring: product.recurring,
      recurringPrice: product.recurringPrice,
      recurringInterval: product.recurringInterval,
      shipping: product.shipping,
      description: product.description,
      adversarial: product.adversarial,
      externalMetadata: product.externalMetadata ? JSON.stringify(product.externalMetadata) : null,
      riskFlags: riskSignals.length > 0 ? JSON.stringify(riskSignals) : null,
    };
    await db.product.upsert({
      where: { sku: product.sku },
      update: shared,
      create: { sku: product.sku, ...shared },
    });
  }
}

/** Idempotent catalogue seeding — safe to call concurrently and repeatedly. */
export async function ensureCatalogSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedOnce().catch((err) => {
      // Reset so a later request can retry after a transient failure.
      seedPromise = null;
      throw err;
    });
  }
  await seedPromise;
}

/** Client-safe catalogue row shape (amounts in minor units). */
export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  merchant: string;
  price: number;
  currency: string;
  condition: "NEW" | "REFURBISHED";
  recurring: boolean;
  recurringPrice: number | null;
  recurringInterval: string | null;
  shipping: number;
  description: string;
  adversarial: boolean;
  /** Raw external metadata (JSON string) — UNTRUSTED, display/scan only. */
  externalMetadata: string | null;
  /** Deterministic signals for THIS product (composition recomputes across picks). */
  riskSignals: RiskSignal[];
}

function toCatalogProduct(row: {
  id: string;
  sku: string;
  name: string;
  category: string;
  merchant: string;
  price: number;
  currency: string;
  condition: string;
  recurring: boolean;
  recurringPrice: number | null;
  recurringInterval: string | null;
  shipping: number;
  description: string;
  adversarial: boolean;
  externalMetadata: string | null;
}): CatalogProduct {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    merchant: row.merchant,
    price: row.price,
    currency: row.currency,
    condition: row.condition === "REFURBISHED" ? "REFURBISHED" : "NEW",
    recurring: row.recurring,
    recurringPrice: row.recurringPrice,
    recurringInterval: row.recurringInterval,
    shipping: row.shipping,
    description: row.description,
    adversarial: row.adversarial,
    externalMetadata: row.externalMetadata,
    riskSignals: scanProductsForRiskSignals([
      { description: row.description, adversarial: row.adversarial, externalMetadata: row.externalMetadata },
    ]),
  };
}

/** Full catalogue, ordered by SKU. Seeding is guaranteed before the read. */
export async function listCatalog(): Promise<CatalogProduct[]> {
  await ensureCatalogSeeded();
  const rows = await db.product.findMany({ orderBy: { sku: "asc" } });
  return rows.map(toCatalogProduct);
}

/** Fetch specific SKUs (authoritative data for transaction composition). */
export async function getProductsBySkus(skus: string[]): Promise<CatalogProduct[]> {
  if (skus.length === 0) return [];
  const rows = await db.product.findMany({ where: { sku: { in: skus } }, orderBy: { sku: "asc" } });
  return rows.map(toCatalogProduct);
}

/** Human-facing catalogue summary for the /api/products response. */
export async function getCatalogWithStats(): Promise<{
  products: CatalogProduct[];
  stats: { total: number; adversarial: number; categories: string[] };
}> {
  const products = await listCatalog();
  const categories = Array.from(new Set(products.map((p) => p.category))).sort();
  return {
    products,
    stats: {
      total: products.length,
      adversarial: products.filter((p) => p.adversarial).length,
      categories,
    },
  };
}
