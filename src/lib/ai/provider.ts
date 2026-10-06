/**
 * AI provider abstraction (Phase 1).
 *
 * The LLM's ONLY jobs in IntentShield: intent extraction, product reasoning,
 * optional explanation/summarization. It is NEVER the authorization authority.
 * Every model-generated structure passes schema validation (schemas.ts)
 * before the system acts on it. This module is server-only, like everything
 * under src/lib/ai.
 */

import { ZaiProvider } from "@/lib/ai/providers/zai";
import { AIExtractionError, type MandateDraft } from "@/lib/ai/schemas";
import { getEnv } from "@/lib/env";

export interface IntentExtraction {
  draft: MandateDraft;
  provider: string;
  model: string;
}

export interface AIProvider {
  readonly name: string;
  /** Convert a natural-language spending mandate into a schema-validated draft. */
  extractIntent(naturalLanguage: string): Promise<IntentExtraction>;
}

export class UnknownAIProviderError extends Error {
  constructor(provider: string) {
    super(`Unknown AI provider "${provider}". Set AI_PROVIDER to a supported value (currently: "zai").`);
    this.name = "UnknownAIProviderError";
  }
}

export function getAIProvider(): AIProvider {
  const env = getEnv();
  switch (env.AI_PROVIDER) {
    case "zai":
      return new ZaiProvider();
    default:
      throw new UnknownAIProviderError(env.AI_PROVIDER);
  }
}

export { AIExtractionError };
export type { MandateDraft };
