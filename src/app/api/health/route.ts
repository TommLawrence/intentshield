import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv, isPayPalConfigured } from "@/lib/env";
import { POLICY_ENGINE_VERSION, POLICY_RULES } from "@/lib/policy/types";

export const dynamic = "force-dynamic";

/**
 * Honest system status. Reports configuration state as booleans only —
 * never secret values, never token contents. Returns 200 with a `degraded`
 * status payload when the database is unreachable, so the client can still
 * render which subsystem failed.
 */
export async function GET() {
  let databaseConnected = false;
  try {
    await db.$queryRaw`SELECT 1`;
    databaseConnected = true;
  } catch (err) {
    console.error("[health] database check failed:", err instanceof Error ? err.message : "unknown error");
  }

  const env = getEnv();

  return NextResponse.json(
    {
      status: databaseConnected ? "ok" : "degraded",
      service: "intentshield",
      phase: "1-foundation",
      database: { connected: databaseConnected },
      paypal: {
        configured: isPayPalConfigured(),
        environment: env.PAYPAL_ENVIRONMENT,
      },
      ai: { provider: env.AI_PROVIDER, model: env.AI_MODEL },
      policyEngine: { version: POLICY_ENGINE_VERSION, rules: POLICY_RULES.length },
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
