# IntentShield

**Give AI permission to act — without giving it unlimited authority.**

A trust and policy firewall for AI-powered PayPal transactions. Built for the PayPal AI Hackathon 2026 — *Build What's Next with PayPal and AI*.

> **Status: working end-to-end prototype.** The full chain is implemented and verified:
> natural-language mandate → AI interpretation → strict schema validation → human confirmation →
> versioned authorization → AI agent search/proposal → deterministic policy evaluation →
> ALLOW / REVIEW / BLOCK → guarded executor → PayPal Sandbox buyer approval → capture →
> complete Payment Intent Record + audit trail. The complete chain has been exercised against a
> live PayPal Sandbox order ($884.92, captured). No PayPal response is ever simulated: without
> sandbox credentials the execution layer reports an honest, explicit "not configured" state —
> which is the expected behaviour on a fresh deployment (see [Running on the Z Cloud
> platform](LOCAL_SETUP.md#9-running-on-the-z-cloud-platform-judges--reviewers)).

## Try it live

IntentShield runs on the Z Cloud platform at
**[IntentShield](https://intentshield.space-z.ai)** — open it there to try the demo yourself.

- **No sign-up required.** On the platform the AI provider is `zai` (the Z Cloud
  SDK default) and the SQLite database are configured out of the box; the
  catalogue and Adversarial Lab seed themselves on first use.
- **Running it locally?** The platform `zai` provider is unavailable off-cloud,
  so local runs use any **OpenAI-compatible endpoint** instead — set
  `AI_PROVIDER=openai` plus `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL` in `.env`
  (e.g. DeepSeek, OpenRouter, Ollama, LM Studio). See
  [LOCAL_SETUP.md §3](LOCAL_SETUP.md#3-create-env-and-configure-the-ai-provider).
- **PayPal execution needs your own Sandbox credentials.** IntentShield never
  simulates a payment — add your `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`
  (with `PAYPAL_ENVIRONMENT=SANDBOX`) and a sandbox buyer account, then run the
  full golden path. Without credentials the execute step answers an honest
  `409 PAYPAL_NOT_CONFIGURED`. See [§9 of LOCAL_SETUP.md](LOCAL_SETUP.md#9-running-on-the-z-cloud-platform-judges--reviewers).
- **Source code:** [github.com/TommLawrence/intentshield](https://github.com/TommLawrence/intentshield).

---

## The problem

AI agents are increasingly capable of interpreting requests, finding products, constructing carts and initiating transactions. The hard problem is not *"can an agent make a payment?"* — it is:

> **How do we determine what the agent is actually authorized to pay for?**

Handing an LLM a PayPal credential hands it unlimited authority. The model can misread intent, hallucinate fields, or follow malicious instructions injected into merchant content — and nothing in the payment path would stop it.

## The solution

IntentShield sits between the AI agent and PayPal payment execution:

```
USER INTENT → AI AGENT → INTENTSHIELD POLICY → PAYPAL → AUDIT
```

**AI interprets. Policy decides. PayPal executes.**

1. A user states a natural-language spending mandate ("Buy a business laptop, max $900 total, new only, no subscriptions, shipping under $40").
2. The LLM extracts it into structured constraints — schema-validated, never trusted blindly. **A human confirms; an immutable version 1 is created.**
3. The AI agent searches the controlled catalogue and **proposes by SKU only** — prices are recomputed from authoritative database rows, never from the model.
4. A **deterministic policy engine** (zero LLM dependency, 16 rules) evaluates the proposal against the mandate: `ALLOW`, `REVIEW` or `BLOCK` — with explicit, machine-readable reasons for every rule, every time.
5. Only an authorized transaction reaches PayPal (server-side, sandbox) — through a **guarded executor** that re-evaluates policy at execution time and is idempotent by construction.
6. Every step is written to an append-only audit trail with one correlation ID from intent to capture, surfaced as a human-readable **Payment Intent Record**.

**BLOCK means BLOCK.** A blocked transaction never reaches PayPal capture — the guarded executor has no code path that executes it. The **Adversarial Lab** on the page proves it live with ten scripted attacks (over-budget, smuggled subscriptions, currency games, expired mandates, duplicate/retry double-charges, missing fields, merchant prompt injection…).

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS 4 + shadcn/ui (New York), custom IntentShield token system |
| Database | Prisma ORM over SQLite (single-file dev DB — model maps 1:1 to a future Postgres deploy) |
| Validation | Zod (environment, AI output, API contracts — `.strict()` everywhere) |
| AI | Provider abstraction (`src/lib/ai`) — two interchangeable server-side providers: `zai` (Z Cloud SDK) and `openai` (any OpenAI-compatible HTTP endpoint) |
| Live market | [Channel3](https://trychannel3.com) product search API (100M+ real products) — advisory live-market grounding, strictly read-only |
| Payments | PayPal **Orders v2 REST API**, server-side only (OAuth client-credentials, `PayPal-Request-Id` idempotency) |
| Runtime | Node 24 / Bun |

> Design note: the single-file SQLite database and the single-page control-room shell are deliberate prototype choices — both documented in [ARCHITECTURE.md](ARCHITECTURE.md).

## Quickstart

> **Running it on your own machine?** Follow **[LOCAL_SETUP.md](LOCAL_SETUP.md)** — the
> exact step-by-step guide (local AI provider via Ollama/OpenAI/OpenRouter, PayPal
> Sandbox wiring, database init, and the full golden path). No Z Cloud platform
> services are required.

The short version:

```bash
bun install

# environment
cp .env.example .env
# → set AI_PROVIDER=openai + AI_BASE_URL/AI_API_KEY/AI_MODEL for a local
#   OpenAI-compatible model (see LOCAL_SETUP.md); add your PayPal sandbox
#   credentials to enable guarded execution (without them the PayPal layer
#   stays honestly "not configured")

# database (creates db/custom.db from prisma/schema.prisma)
bun run setup

bun run dev        # http://localhost:3000
```

The product catalogue (16 products, incl. 7 deliberately adversarial listings) and the
adversarial-lab fixture mandates are **seeded automatically and idempotently** on first use —
no manual seed step.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | SQLite file path (Prisma, resolved relative to `prisma/`) |
| `PAYPAL_CLIENT_ID` | for execution | Server-side PayPal REST credential |
| `PAYPAL_CLIENT_SECRET` | for execution | Server-side PayPal REST secret — **never exposed to the browser** |
| `PAYPAL_ENVIRONMENT` | no (`SANDBOX`) | `SANDBOX` or `LIVE` (prototype targets sandbox only) |
| `AI_PROVIDER` | no (`zai`) | `zai` (Z Cloud SDK) or `openai` (any OpenAI-compatible endpoint) |
| `AI_BASE_URL` | for `openai` | Endpoint base including the version segment, e.g. `http://localhost:11434/v1` |
| `AI_API_KEY` | for `openai` | Bearer key for the endpoint (any non-empty value for local servers) |
| `AI_MODEL` | for `openai` | Model name the endpoint expects, e.g. `llama3.1` (audit label for `zai`) |
| `CHANNEL3_API_KEY` | for live market | Server-side Channel3 key — powers the LIVE MARKET panel (see below) |

### PayPal execution

The guarded executor implements the full Orders v2 flow: order creation with a complete
purchase-unit breakdown (items, shipping, tax — reconciled before the call), the payer-approval
link, return-URL handling (`/?intent=…`), order-state verification via `getOrder` before capture,
and idempotent capture (`PayPal-Request-Id = capture_<executionId>`).

**To enable it** (everything else already works without it):

1. Create a developer account at [developer.paypal.com](https://developer.paypal.com).
2. Dashboard → *Apps & Credentials* → **Sandbox** → create a REST app.
3. Copy Client ID / Secret into `.env`, restart the dev server.
4. Use the sandbox **buyer** account (Dashboard → *Testing Tools* → Sandbox accounts) to approve orders during the demo.

Without credentials the execute endpoint returns `409 PAYPAL_NOT_CONFIGURED` with setup
instructions, records a `PAYPAL_NOT_CONFIGURED` audit event, and creates **nothing** — the
prototype never fakes a PayPal result.

### Live market grounding (Channel3)

The agent brief can ground any request in the **real live market**: `POST /api/market/search`
queries Channel3's product graph (100M+ products, thousands of real merchants, live prices)
and runs the **same deterministic policy engine** against each product's best offer — merchant
allowlists, amount ceilings, currency and condition rules applied to real-world offers.

Strictly advisory and read-only: no transaction record, agent action or audit event is
created, and nothing on this path can reach PayPal. Channel3's merchant checkout is coming
soon — external retailers are not payable through this prototype; the controlled catalogue
remains the agent's only payable world.

Without `CHANNEL3_API_KEY` the endpoint returns `409 CHANNEL3_NOT_CONFIGURED` and the panel
says so honestly — market data is never simulated.

## The policy engine (16 rules, deterministic)

| Code | Rule | On violation |
|---|---|---|
| R-01 | Amount ceiling | BLOCK |
| R-02 | Shipping ceiling | BLOCK |
| R-03 | Currency mismatch | BLOCK |
| R-04 | Recurring charge | BLOCK |
| R-05 | Condition (refurbished) | BLOCK |
| R-06 | Category restriction | BLOCK |
| R-07 | Merchant restriction | BLOCK |
| R-08 | Quantity limit | BLOCK |
| R-09 | Mandate expired | BLOCK |
| R-10 | Mandate not yet valid | BLOCK |
| R-11 | Missing critical field | BLOCK |
| R-12 | Duplicate execution (idempotency) | BLOCK |
| R-13 | Untrusted external metadata (injection signals) | REVIEW |
| R-14 | Structural inconsistency | BLOCK |
| R-15 | Mandate approval mode (MANUAL_REVIEW) | REVIEW |
| R-16 | Mandate not ACTIVE | BLOCK |

Same inputs → same decision, always: no LLM, no network, no clock reads inside the engine
(time arrives via an explicit context). Every rule runs on every evaluation; a PASS is
recorded, never implied. The rule catalog in `src/lib/policy/types.ts` is the single source
consumed by both the engine and the UI.

## Repository layout

```
prisma/schema.prisma        Data model: mandates + versions, catalogue, agent
                           sessions/actions, transactions, policy evaluations,
                           payment intents, PayPal orders, append-only audit
src/app/                    Single-page control-room shell + API route handlers
src/app/api/               health · mandates · products · agent/search ·
                           transactions (+review/execute/capture) · lab
src/components/intentshield/ Control-room UI: mandate console, agent &
                           execution, adversarial lab, activity ledger +
                           Payment Intent Record dialog
src/lib/policy/             Rule catalog + the deterministic engine
src/lib/agent/              Search service + pure transaction composition
src/lib/transactions/       PIR, review gate, guarded executor, capture
src/lib/catalog/            Seed data + deterministic risk-signal scanner
src/lib/paypal/client.ts    Orders v2 server client (never simulated)
src/lib/ai/                 Provider abstraction + zai implementation
ARCHITECTURE.md             Full architecture
SECURITY.md                 Trust boundaries & threat model
```

## Limitations (honest ones)

- **Sandbox only.** No real-money path exists or is claimed. Not production-ready; no PCI compliance is claimed.
- **The live PayPal sandbox leg has been exercised** against a real Sandbox order ($884.92, captured end-to-end). On a fresh deployment without credentials the execute step answers an honest `409 PAYPAL_NOT_CONFIGURED` — that is the designed behaviour, not an untested path. Adding sandbox credentials is the only step needed to run the live leg.
- **Auth is intentionally lightweight** for the hackathon MVP (demo identity); authorization *boundaries* inside the system (USER / AGENT / POLICY_ENGINE / PAYMENT_EXECUTOR / SYSTEM) are enforced structurally — see SECURITY.md.
- **No webhooks yet** — deliberately deferred until a stable HTTPS endpoint exists; capture state is verified synchronously against PayPal instead.
- **Tests are not bundled yet** — the Adversarial Lab serves as the live, in-app scenario suite (ten attacks through the real pipeline); unit/integration tests land in a follow-up pass against the contracts defined here.
- Tax is a flat 8% of subtotal (integer minor units) — a documented demo simplification.
- Money assumes 2-decimal currencies (USD/EUR). Zero-decimal currencies are out of MVP scope.
- The live-market panel is advisory only — it never creates a transaction or reaches PayPal, and external-retailer purchases are out of scope until Channel3's merchant checkout ships.

## Security

See [SECURITY.md](SECURITY.md) — trust boundaries, untrusted-content handling (prompt-injection defence in depth), secrets policy, idempotency and audit design.

## License

[MIT](LICENSE) — © 2026 T L'ence [Crane Systems](https://crane-systems.vercel.app/)
