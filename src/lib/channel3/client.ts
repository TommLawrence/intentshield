/**
 * Channel3 live product search — server-side REST client.
 *
 * HARD RULES (mirrors the PayPal client discipline):
 * - Server-only. This module must never be imported from client components;
 *   Next.js API routes / server code are the only callers.
 * - Never simulated. When CHANNEL3_API_KEY is absent, search throws
 *   Channel3NotConfiguredError — the product shows an honest "unavailable"
 *   state rather than fake market data.
 * - The API key travels only in the x-api-key header. It is never logged,
 *   never part of any thrown error, never sent to the browser.
 * - Upstream responses are UNTRUSTED external data: everything passes a
 *   strict schema wall before use (the same discipline the AI provider
 *   output passes).
 * - Errors surfaced to callers carry safe, status-specific messages only.
 *
 * Contract source: https://api.trychannel3.com/openapi.json (POST /v1/search).
 */

import { z } from "zod";

import { getEnv } from "@/lib/env";
import { parseMoneyToMinor } from "@/lib/money";

const CHANNEL3_BASE_URL = "https://api.trychannel3.com";
const REQUEST_TIMEOUT_MS = 15_000;

export class Channel3NotConfiguredError extends Error {
  constructor() {
    super(
      "Channel3 is not configured. Set CHANNEL3_API_KEY to enable live market grounding."
    );
    this.name = "Channel3NotConfiguredError";
  }
}

export class Channel3ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "Channel3ApiError";
    this.status = status;
  }
}

/** Validated subset of Channel3's Product (OpenAPI: Product/SearchResponse). */
const searchResponseSchema = z.object({
  products: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string(),
        brands: z.array(z.object({ name: z.string() })).default([]),
        images: z
          .array(
            z.object({
              url: z.string(),
              cleaned_url: z.string().nullish(),
              is_main_image: z.boolean().default(false),
            })
          )
          .default([]),
        category: z.object({ title: z.string().nullish() }).nullish(),
        offers: z
          .array(
            z.object({
              url: z.string(),
              domain: z.string(),
              price: z.object({
                price: z.number().nonnegative(),
                currency: z.string(),
              }),
              availability: z.string(),
              condition: z.string().nullish(),
            })
          )
          .default([]),
      })
    )
    .default([]),
  next_page_token: z.string().nullish(),
});

/** Normalized live product — prices already in integer minor units. */
export interface Channel3Product {
  id: string;
  title: string;
  brand: string | null;
  /** Channel3's cleaned (background-removed) image when available. */
  imageUrl: string | null;
  category: string | null;
  offers: {
    url: string;
    domain: string;
    priceMinor: number;
    currency: string;
    availability: string;
    condition: "NEW" | "REFURBISHED";
  }[];
}

/** Human-safe, status-specific upstream failure text (never includes the key). */
function upstreamMessage(status: number, detail: string | null): string {
  switch (status) {
    case 401:
      return "Channel3 rejected the API key (401 unauthorized).";
    case 402:
      return "Channel3 reports no remaining search credits (402 payment required).";
    case 403:
      // Verified live: Channel3 answers a bad key with 403.
      return "Channel3 refused the request (403 forbidden — check the API key).";
    case 422:
      return `Channel3 rejected the request as invalid${detail ? `: ${detail}` : ""}.`;
    case 504:
      return "Channel3 timed out while searching (504).";
    default:
      return `Channel3 search failed (HTTP ${status}${detail ? `: ${detail}` : ""}).`;
  }
}

/** Pick the display image deterministically: main image, cleaned variant first. */
function pickImage(
  images: { url: string; cleaned_url?: string | null; is_main_image: boolean }[]
): string | null {
  const main = images.find((i) => i.is_main_image) ?? images[0];
  if (!main) return null;
  return main.cleaned_url ?? main.url;
}

export interface LiveMarketSearchParams {
  query: string;
  /** ISO 4217 — Channel3 localizes offers to this currency where possible. */
  currency?: string;
  /** 1–30 per the OpenAPI contract. */
  limit?: number;
}

/**
 * POST /v1/search against Channel3's live product graph.
 * Explicit filters match the API's own defaults (new-condition, in-stock
 * offers) so behavior is deterministic even if Channel3 changes defaults.
 */
export async function searchLiveMarket(
  params: LiveMarketSearchParams
): Promise<{ products: Channel3Product[] }> {
  const apiKey = getEnv().CHANNEL3_API_KEY;
  if (!apiKey) throw new Channel3NotConfiguredError();

  let res: Response;
  try {
    res = await fetch(`${CHANNEL3_BASE_URL}/v1/search`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: params.query,
        limit: Math.min(Math.max(params.limit ?? 12, 1), 30),
        filters: {
          conditions: ["new"],
          availability: ["InStock"],
        },
        config: params.currency
          ? { mode: "default", currency: params.currency }
          : { mode: "default" },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Third-party read-only lookup: no cookies, no same-origin state,
      // and never cached by Next.js — market data must be live or absent.
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Channel3ApiError(
        "Channel3 search timed out after 15 seconds.",
        504
      );
    }
    // Safe message only — never headers, never the key, never stack traces.
    throw new Channel3ApiError("Could not reach the Channel3 API.", 0);
  }

  if (!res.ok) {
    let detail: string | null = null;
    try {
      const body = (await res.json()) as { detail?: unknown } | null;
      if (body && typeof body.detail === "string") {
        detail = body.detail.slice(0, 200);
      }
    } catch {
      // Non-JSON error body — the status line is enough.
    }
    throw new Channel3ApiError(upstreamMessage(res.status, detail), res.status);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Channel3ApiError(
      "Channel3 returned a non-JSON response.",
      res.status
    );
  }

  const parsed = searchResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Channel3ApiError(
      "Channel3's response did not pass strict validation.",
      res.status
    );
  }

  return {
    products: parsed.data.products.map((p) => ({
      id: p.id,
      title: p.title,
      brand: p.brands[0]?.name ?? null,
      imageUrl: pickImage(p.images),
      category: p.category?.title ?? null,
      offers: p.offers.map((o) => ({
        url: o.url,
        domain: o.domain,
        priceMinor: parseMoneyToMinor(o.price.price),
        currency: o.price.currency.toUpperCase(),
        availability: o.availability,
        // Channel3's condition enum is "new" | "used" (refurbished is
        // coerced to null upstream); "used" maps to the mandate world's
        // not-new bucket so R-05 can judge it honestly.
        condition: o.condition === "used" ? "REFURBISHED" : "NEW",
      })),
    })),
  };
}
