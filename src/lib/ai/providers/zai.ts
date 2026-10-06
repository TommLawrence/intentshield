/**
 * z-ai-web-dev-sdk provider — the default AI backend on this platform.
 * Server-only (SDK is never allowed in client code).
 *
 * Extracts a mandate draft via chat completions with a strict JSON contract,
 * then validates with `mandateDraftSchema`. Invalid or ambiguous output
 * throws AIExtractionError — the system fails safe (Phase 2 wiring routes
 * that to REVIEW / clarification, never to assumed defaults).
 */

import ZAI from "z-ai-web-dev-sdk";
import { AIExtractionError, mandateDraftSchema, type MandateDraft } from "@/lib/ai/schemas";
import type { AIProvider, IntentExtraction } from "@/lib/ai/provider";
import { getEnv } from "@/lib/env";

const SYSTEM_PROMPT = `You are the intent-extraction component of IntentShield, a payment authorization firewall.

Your ONLY job: translate the user's natural-language spending mandate into a single JSON object.

Rules:
- You do not authorize payments. You do not approve anything. You only translate.
- Output exactly one JSON object and nothing else — no prose, no markdown fences.
- If the user's constraint is not stated, use null (never guess, never infer defaults).
- Do not invent categories, merchants, limits, or permissions.
- If the mandate is too ambiguous to structure safely, set clarificationNeeded to one short question and leave maxTotal null is not allowed — instead still output your best reading of every field and use clarificationNeeded.
- Amounts are in MAJOR units: "under $900" means maxTotal = 900.
- allowRecurring / allowRefurbished are false unless the user EXPLICITLY allows them.

JSON shape:
{
  "currency": string (ISO 4217, e.g. "USD"),
  "maxTotal": number (major units),
  "maxShipping": number | null,
  "allowRecurring": boolean,
  "allowRefurbished": boolean,
  "purchaseType": "ONE_TIME" | "RECURRING",
  "maxQuantity": number,
  "validityDays": number | null,
  "allowedCategories": string[] | null,
  "blockedCategories": string[] | null,
  "allowedMerchants": string[] | null,
  "blockedMerchants": string[] | null,
  "clarificationNeeded": string | null
}`;

/** Extract the outermost JSON object from a completion, tolerating code fences. */
function parseJsonBlock(raw: string): unknown {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AIExtractionError("model output contained no JSON object");
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new AIExtractionError("model output was not parseable JSON");
  }
}

export class ZaiProvider implements AIProvider {
  readonly name = "zai";

  async extractIntent(naturalLanguage: string): Promise<IntentExtraction> {
    const env = getEnv();
    let completion: { choices?: { message?: { content?: string } }[] };

    try {
      const zai = await ZAI.create();
      completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: SYSTEM_PROMPT },
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

    const parsed = mandateDraftSchema.safeParse(parseJsonBlock(content));
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"}: ${i.message}`);
      console.error("[zai-provider] draft failed schema validation:", issues.join("; "));
      throw new AIExtractionError(`schema violations — ${issues.join("; ")}`);
    }

    const draft: MandateDraft = parsed.data;
    return { draft, provider: this.name, model: env.AI_MODEL };
  }
}
