/**
 * Deterministic risk-signal scanner (Phase 3 / §21).
 *
 * Scans UNTRUSTED external content (product descriptions, external metadata)
 * for prompt-injection and smuggled-recurring patterns. This is CODE, not an
 * LLM: the same content always produces the same signals. Signals feed rule
 * R-13 in the policy engine → the transaction is escalated to human review,
 * never silently trusted and never silently executed.
 *
 * Detection here is a backstop, not the primary defense. The primary defense
 * is structural: external content is DATA at every boundary (agent prompt,
 * schema wall, policy engine) and can never reach PayPal credentials,
 * authorization rules or the executor.
 */

export type RiskSignal =
  | "INJECTED_INSTRUCTIONS"
  | "UNTRUSTED_METADATA"
  | "RECURRING_SMUGGLE"
  | "ADVERSARIAL_LISTING";

/** Prompt-injection patterns — matched against untrusted text content. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above)\s+instructions?/i,
  /disregard\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above)?\s*instructions?/i,
  /you\s+are\s+(?:now\s+)?authorized/i,
  /system\s+prompt/i,
  /override\s+(?:the\s+)? polic(?:y|ies)/i,
  /bypass\s+(?:the\s+)? polic(?:y|ies)/i,
  /waive\s+(?:the\s+)?(?:shipping|policy|limits?)/i,
  /approve\s+(?:this|the)\s+(?:purchase|payment|order)\s+automatically/i,
  /pre-?authorized\s+by\s+the\s+buyer/i,
  /add\s+(?:a\s+|an\s+)?(?:premium|subscription|recurring|warranty|protection)/i,
];

/** Recurring-price smuggling patterns, e.g. "$129/month" or "$9.99 per month". */
const RECURRING_PATTERNS: RegExp[] = [
  /\$\s?\d+(?:\.\d{2})?\s*(?:\/|per\s+)\s*(?:month|mo|year|yr)\b/i,
  /\b\d+(?:\.\d{2})?\s*(?:\/|per\s+)\s*(?:month|mo|year|yr)\b/i,
];

/** Metadata keys that claim operator/system authority. */
const SUSPICIOUS_METADATA_KEY = /instruction|authoriz|override|system|policy|bypass|approve|admin/i;

function textSignals(text: string): RiskSignal[] {
  const signals: RiskSignal[] = [];
  if (INJECTION_PATTERNS.some((re) => re.test(text))) signals.push("INJECTED_INSTRUCTIONS");
  if (RECURRING_PATTERNS.some((re) => re.test(text))) signals.push("RECURRING_SMUGGLE");
  return signals;
}

export interface ScannableProduct {
  description: string;
  adversarial: boolean;
  /** Raw external metadata — a JSON string from the DB or a parsed object. */
  externalMetadata: unknown;
}

function scanMetadata(meta: unknown, set: Set<RiskSignal>): void {
  if (meta === null || meta === undefined) return;
  // Any external metadata at all is untrusted by definition.
  set.add("UNTRUSTED_METADATA");

  const serialized = typeof meta === "string" ? meta : JSON.stringify(meta);
  for (const signal of textSignals(serialized)) set.add(signal);

  // Normalize to a parsed object when possible (DB rows store JSON strings).
  let parsed: unknown = meta;
  if (typeof meta === "string") {
    try {
      parsed = JSON.parse(meta);
    } catch {
      parsed = null;
    }
  }
  if (parsed && typeof parsed === "object") {
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (SUSPICIOUS_METADATA_KEY.test(key)) set.add("UNTRUSTED_METADATA");
      if (typeof value === "string") {
        for (const signal of textSignals(value)) set.add(signal);
      }
    }
  }
}

/**
 * Scan a set of catalogue products for deterministic risk signals.
 * Returns a de-duplicated, stably-sorted signal list.
 */
export function scanProductsForRiskSignals(products: ScannableProduct[]): RiskSignal[] {
  const set = new Set<RiskSignal>();
  for (const product of products) {
    for (const signal of textSignals(product.description ?? "")) set.add(signal);
    scanMetadata(product.externalMetadata, set);
    if (product.adversarial) set.add("ADVERSARIAL_LISTING");
  }
  return Array.from(set).sort();
}
