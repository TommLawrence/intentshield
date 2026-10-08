/**
 * OpenAI-compatible HTTP provider — for LOCAL and self-hosted deployments.
 *
 * Talks to any endpoint that implements the POST {base}/chat/completions
 * contract (OpenAI, OpenRouter, Ollama's /v1, LM Studio, vLLM, llama.cpp
 * server, …). Configured entirely through environment variables:
 *
 *   AI_BASE_URL — e.g. https://api.openai.com/v1 or http://localhost:11434/v1
 *                 (the URL up to and INCLUDING the version segment)
 *   AI_API_KEY  — bearer token; local servers (Ollama/LM Studio) accept any
 *                 non-empty placeholder value
 *   AI_MODEL    — the model name the endpoint expects, e.g. llama3.1
 *
 * This file implements ONLY the transport. The prompts, JSON extraction
 * rules and strict Zod validation gates are shared with the zai provider in
 * providers/shared.ts — mandate logic exists exactly once, so both providers
 * enforce the identical schema wall. Server-only module.
 */

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

const REQUEST_TIMEOUT_MS = 60_000;

/** Thrown when AI_PROVIDER=openai but required variables are missing. */
export class AIProviderConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `The OpenAI-compatible AI provider requires ${missing.join(", ")} to be set. ` +
        `Add them to .env (see .env.example). IntentShield reports missing configuration honestly — it never runs the AI layer half-configured.`
    );
    this.name = "AIProviderConfigError";
  }
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    const env = getEnv();
    const baseUrl = env.AI_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
    const apiKey = env.AI_API_KEY ?? "";
    const model = env.AI_MODEL ?? "";
    if (!baseUrl || !apiKey || !model) {
      const missing = [!baseUrl && "AI_BASE_URL", !apiKey && "AI_API_KEY", !model && "AI_MODEL"].filter(
        (name): name is string => Boolean(name)
      );
      throw new AIProviderConfigError(missing);
    }
    if (!/^https?:\/\//.test(baseUrl)) {
      // Fail fast with a clear, value-free message.
      throw new AIProviderConfigError(["AI_BASE_URL (must start with http:// or https://)"]);
    }
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Single chat completion against the OpenAI-compatible endpoint.
   * The request body stays deliberately minimal (model + messages) so that
   * every compatible server accepts it; JSON discipline is enforced by the
   * shared prompt and the strict Zod gate, not by optional API features.
   * `operation` selects which typed error the transport failure throws, so
   * callers keep the same instanceof semantics as the zai provider.
   */
  private async complete(
    systemPrompt: string,
    userContent: string,
    operation: "extract" | "search"
  ): Promise<string> {
    const fail = (reason: string): AIExtractionError | AISearchError =>
      operation === "extract"
        ? new AIExtractionError(reason)
        : new AISearchError(reason);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Network/timeout failures — message only, never internals or the key.
      console.error(
        "[openai-provider] request failed:",
        err instanceof Error ? err.message : "unknown error"
      );
      throw fail(`AI provider request failed (is AI_BASE_URL "${new URL(this.baseUrl).host}" reachable?)`);
    }

    if (!res.ok) {
      // Safe surfacing: status + a short sanitized reason. Never echo the key
      // or the full request body back into errors.
      let reason = "";
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        const msg = body?.error?.message;
        if (msg) reason = `: ${msg.slice(0, 200)}`;
      } catch {
        // non-JSON error body — keep the status-only message
      }
      console.error(`[openai-provider] endpoint answered ${res.status}${reason}`);
      throw fail(`AI provider request failed with HTTP ${res.status}${reason}`);
    }

    let data: ChatCompletionResponse;
    try {
      data = (await res.json()) as ChatCompletionResponse;
    } catch {
      throw fail("AI provider returned a non-JSON response body");
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      throw fail("model returned an empty response");
    }
    return content;
  }

  async extractIntent(naturalLanguage: string): Promise<IntentExtraction> {
    const content = await this.complete(EXTRACTION_SYSTEM_PROMPT, naturalLanguage.slice(0, 4000), "extract");
    const draft: MandateDraft = validateMandateDraft(parseJsonBlock(content));
    return { draft, provider: this.name, model: this.model };
  }

  async searchProducts(request: {
    userRequest: string;
    mandateSummary: string;
    catalog: AgentCatalogEntry[];
  }): Promise<ProductSearch> {
    const content = await this.complete(SEARCH_SYSTEM_PROMPT, buildSearchUserContent(request), "search");
    return {
      ...validateProductSearchResult(parseJsonBlock(content)),
      provider: this.name,
      model: this.model,
    };
  }
}
