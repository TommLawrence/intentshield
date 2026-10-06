/**
 * AI provider abstraction.
 *
 * The LLM's ONLY jobs in IntentShield: intent extraction, product reasoning,
 * optional explanation/summarization. It is NEVER the authorization authority.
 * Every model-generated structure passes schema validation (schemas.ts)
 * before the system acts on it. This module is server-only, like everything
 * under src/lib/ai.
 */

import { ZaiProvider } from "@/lib/ai/providers/zai";
import { OpenAICompatibleProvider } from "@/lib/ai/providers/openai";
import { AIExtractionError, type MandateDraft } from "@/lib/ai/schemas";
import { getEnv } from "@/lib/env";

export interface IntentExtraction {
  draft: MandateDraft;
  provider: string;
  model: string;
}

/** A catalogue entry the agent is allowed to "see" (read-only data). */
export interface AgentCatalogEntry {
  sku: string;
  name: string;
  category: string;
  merchant: string;
  price: string; // major units, pre-formatted
  currency: string;
  condition: string;
  recurring: boolean;
  recurringPrice: string | null; // major units, pre-formatted
  recurringInterval: string | null;
  shipping: string; // major units, pre-formatted
  description: string; // truncated, UNTRUSTED data
}

export interface ProductSearch {
  picks: { sku: string; quantity: number; reason: string }[];
  notes: string | null;
  provider: string;
  model: string;
}

export interface AIProvider {
  readonly name: string;
  /** Convert a natural-language spending mandate into a schema-validated draft. */
  extractIntent(naturalLanguage: string): Promise<IntentExtraction>;
  /**
   * Shopping-agent catalogue search. The model returns SKU references only;
   * prices/totals are recomputed from authoritative DB rows by deterministic
   * code — the model's proposal is never a financial fact.
   */
  searchProducts(request: {
    userRequest: string;
    mandateSummary: string;
    catalog: AgentCatalogEntry[];
  }): Promise<ProductSearch>;
}

export class UnknownAIProviderError extends Error {
  constructor(provider: string) {
    super(`Unknown AI provider "${provider}". Set AI_PROVIDER to "openai" (local, OpenAI-compatible) or "zai" (Z Cloud platform).`);
    this.name = "UnknownAIProviderError";
  }
}

export function getAIProvider(): AIProvider {
  const env = getEnv();
  switch (env.AI_PROVIDER) {
    case "zai":
      return new ZaiProvider();
    case "openai":
      return new OpenAICompatibleProvider();
    default:
      throw new UnknownAIProviderError(env.AI_PROVIDER);
  }
}

export { AIExtractionError };
export type { MandateDraft };
export { AIProviderConfigError } from "@/lib/ai/providers/openai";
