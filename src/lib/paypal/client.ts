/**
 * PayPal Orders v2 — server-side REST client (Phase 1 foundation).
 *
 * HARD RULES:
 * - Server-only. This module must never be imported from client components.
 *   Next.js API routes / server code are the only callers.
 * - Never simulated. When credentials are absent, operations throw
 *   PayPalNotConfiguredError — the product shows an honest "unavailable"
 *   state rather than a fake response.
 * - Idempotency: every create/capture sends PayPal-Request-Id derived from
 *   our application-level executionId, so a retried request can never
 *   double-execute.
 * - Errors surfaced to callers carry safe messages + PayPal debug IDs only.
 *   Access tokens and client secrets are never logged or thrown.
 */

import { getEnv, isPayPalConfigured } from "@/lib/env";
import { toPayPalAmount } from "@/lib/money";

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const LIVE_BASE = "https://api-m.paypal.com";
const REQUEST_TIMEOUT_MS = 10_000;

export class PayPalNotConfiguredError extends Error {
  constructor() {
    super(
      "PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to enable guarded sandbox execution."
    );
    this.name = "PayPalNotConfiguredError";
  }
}

export class PayPalApiError extends Error {
  readonly status: number;
  readonly debugId: string | null;
  constructor(message: string, status: number, debugId: string | null) {
    super(message);
    this.name = "PayPalApiError";
    this.status = status;
    this.debugId = debugId;
  }
}

export interface PayPalOrderResult {
  paypalOrderId: string;
  status: string;
  approveUrl: string | null;
}

export interface PayPalCaptureResult {
  paypalOrderId: string;
  captureId: string | null;
  status: string; // COMPLETED | DECLINED | ...
}

function baseUrl(): string {
  return getEnv().PAYPAL_ENVIRONMENT === "LIVE" ? LIVE_BASE : SANDBOX_BASE;
}

// ── Access token (module-scoped cache, refreshed before expiry) ────────────
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (!isPayPalConfigured()) throw new PayPalNotConfiguredError();
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const env = getEnv();
  const basic = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new PayPalApiError("PayPal authentication failed", res.status, res.headers.get("paypal-debug-id"));
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
}

async function raiseApiError(res: Response, operation: string): Promise<never> {
  let message = `PayPal ${operation} failed`;
  let debugId = res.headers.get("paypal-debug-id");
  try {
    const body = (await res.json()) as PayPalErrorBody;
    if (body?.message) message = `PayPal ${operation} failed: ${body.message}`;
    debugId = body?.debug_id ?? debugId;
  } catch {
    // non-JSON error body — keep the generic safe message
  }
  throw new PayPalApiError(message, res.status, debugId);
}

/**
 * Create an Orders v2 order with intent=CAPTURE.
 * `executionId` is the application-level idempotency key: it is stored on our
 * PaymentIntent (unique) and replayed as PayPal-Request-Id on retries.
 */
export async function createOrder(input: {
  executionId: string;
  amountMinor: number;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<PayPalOrderResult> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": input.executionId,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.executionId,
          description: input.description.slice(0, 127),
          amount: {
            currency_code: input.currency,
            value: toPayPalAmount(input.amountMinor),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            user_action: "PAY_NOW",
          },
        },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) await raiseApiError(res, "order creation");
  const order = (await res.json()) as {
    id: string;
    status: string;
    links?: { rel: string; href: string }[];
  };
  const approve = order.links?.find((l) => l.rel === "payer" || l.rel === "approve") ?? null;
  return { paypalOrderId: order.id, status: order.status, approveUrl: approve?.href ?? null };
}

/** Capture an approved order. Replay of `executionId` keeps retries idempotent. */
export async function captureOrder(orderId: string, executionId: string): Promise<PayPalCaptureResult> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `capture_${executionId}`,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) await raiseApiError(res, "order capture");
  const captured = (await res.json()) as {
    id: string;
    status: string;
    purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[];
  };
  const capture = captured.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
  return {
    paypalOrderId: captured.id,
    captureId: capture?.id ?? null,
    status: captured.status,
  };
}

/** Retrieve order state without side effects (used to reconcile status). */
export async function getOrder(orderId: string): Promise<{ id: string; status: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) await raiseApiError(res, "order lookup");
  const order = (await res.json()) as { id: string; status: string };
  return { id: order.id, status: order.status };
}
