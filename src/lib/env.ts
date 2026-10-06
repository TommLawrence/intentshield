import { z } from "zod";

/**
 * Server-side environment validation. Validated once, cached.
 * Secrets are never logged or exposed — only booleans derived from them
 * may reach the client (e.g. `paypal.configured` in /api/health).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_ENVIRONMENT: z.enum(["SANDBOX", "LIVE"]).default("SANDBOX"),
  AI_PROVIDER: z.string().default("zai"),
  // OpenAI-compatible local provider (AI_PROVIDER=openai). All three are
  // required together; the provider reports missing names honestly and
  // never starts half-configured.
  AI_BASE_URL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  // Model label recorded on audit records; the zai provider falls back to
  // its platform default when unset. Required when AI_PROVIDER=openai.
  AI_MODEL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report field names only — never values (they may contain secrets).
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Environment validation failed for: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export function isPayPalConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}
