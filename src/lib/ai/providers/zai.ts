/**
 * z-ai-web-dev-sdk provider — the default AI backend on the Z Cloud platform.
 * Server-only (SDK is never allowed in client code).
 *
 * Two capabilities, both behind strict JSON contracts:
 *  1. extractIntent  — natural-language mandate → schema-validated draft
 *  2. searchProducts  — shopping request → SKU picks from the controlled
 *                       catalogue (the agent proposes; deterministic code
 *                       composes and the policy engine disposes)
 *
 * Invalid or ambiguous output throws — the system fails safe.
 *
 * The prompts and validation gates live in providers/shared.ts so that every
 * provider enforces the identical mandate logic. This file implements only
 * the Z Cloud transport (ZAI.create → chat.completions).
 */

import ZAI from "z-ai-web-dev-sdk";
import { AIExtractionError, AISearchError, type MandateDraft } from "@/lib/ai/schemas";
import type { AIProvider, AgentCatalogEntry, IntentExtraction, ProductSearch } from "@/lib/ai/provider";
import { getEnv } from "@/lib/env";
import {
  EXTRACTION_SYSTEM_PROMPT,
  SEARCH_SYSTEM_PROMPT,
  buildSearchUserContent,
  parseJsonBlock,
  validateMandateDraft,
  validateProductSearchResult,
} from "@/lib/ai/providers/shared";

/** The model label this platform records when AI_MODEL is not set. */
export const ZAI_DEFAULT_MODEL_LABEL = "glm-4.6";

interface ChatCompletionShape {
  choices?: { message?: { content?: string } }[];
}

export class ZaiProvider implements AIProvider {
  readonly name = "zai";

  async extractIntent(naturalLanguage: string): Promise<IntentExtraction> {
    const env = getEnv();
    let completion: ChatCompletionShape;

    try {
      const zai = await ZAI.create();
      completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: naturalLanguage.slice(0, 4000) },
        ],
        thinking: { type: "disabled" },
      });
    } catch (err) {
      // Safe message only — SDK errors may contain internals.
      console.error("[zai-provider] chat completion failed:", err instanceof Error ? err.message : "unknown error");
      throw new AIExtractionError("AI provider request failed");
    }

    const content = completion.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      throw new AIExtractionError("model returned an empty response");
    }

    const draft: MandateDraft = validateMandateDraft(parseJsonBlock(content));
    return { draft, provider: this.name, model: env.AI_MODEL ?? ZAI_DEFAULT_MODEL_LABEL };
  }

  async searchProducts(request: {
    userRequest: string;
    mandateSummary: string;
    catalog: AgentCatalogEntry[];
  }): Promise<ProductSearch> {
    const env = getEnv();
    let completion: ChatCompletionShape;

    try {
      const zai = await ZAI.create();
      completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: SEARCH_SYSTEM_PROMPT },
          { role: "user", content: buildSearchUserContent(request) },
        ],
        thinking: { type: "disabled" },
      });
    } catch (err) {
      console.error("[zai-provider] search completion failed:", err instanceof Error ? err.message : "unknown error");
      throw new AISearchError("AI provider request failed");
    }

    const content = completion.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      throw new AISearchError("model returned an empty response");
    }

    return {
      ...validateProductSearchResult(parseJsonBlock(content)),
      provider: this.name,
      model: env.AI_MODEL ?? ZAI_DEFAULT_MODEL_LABEL,
    };
  }
}
