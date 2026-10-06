# IntentShield

**Give AI permission to act — without giving it unlimited authority.**

A trust and policy firewall for AI-powered PayPal transactions. Built for the PayPal AI Hackathon 2026 — *Build What's Next with PayPal and AI*.

> **Status: Phase 1 — Foundation.** Architecture, data model, policy contracts, PayPal/AI service abstractions and the application shell are in place. Mandates, the agent, the policy engine runtime and PayPal execution land in the next phases (see [Roadmap](#roadmap)). No PayPal response is ever simulated: without sandbox credentials the execution layer reports an honest, explicit "not configured" state.

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
2. The LLM extracts it into structured constraints — schema-validated, never trusted blindly.
3. The AI agent searches the controlled catalogue and **proposes** a transaction.
4. A **deterministic policy engine** (zero LLM dependency) evaluates the proposal against the mandate: `ALLOW`, `REVIEW` or `BLOCK` — with explicit, machine-readable reasons.
5. Only an authorized transaction reaches PayPal (server-side, sandbox).
6. Every step is written to an append-only audit trail with one correlation ID from intent to capture.

**BLOCK means BLOCK.** A blocked transaction never reaches PayPal capture — the guarded executor has no code path that executes it. See [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md).

## Why it matters

Agentic commerce is coming. The industry question is not whether AI agents will transact — it is who decides what they may spend. IntentShield demonstrates the answer a PayPal engineer could defend: **the agent gets capabilities, not unlimited authority. Human intent becomes explicit constraints. Evaluation is deterministic. Only authorized transactions reach PayPal. Everything is auditable.**

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS 4 + shadcn/ui (New York), custom IntentShield token system |
| Database | Prisma ORM over SQLite (single-file dev DB — model maps 1:1 to a future Postgres deploy) |
| Validation | Zod (environment, AI output, API contracts) |
| AI | Provider abstraction (`src/lib/ai`); default provider runs server-side via z-ai-web-dev-sdk |
| Payments | PayPal **Orders v2 REST API**, server-side only (OAuth client-credentials, `PayPal-Request-Id` idempotency) |
| Runtime | Node 24 / Bun |

> Platform note: this prototype was scaffolded in a constrained sandbox environment — hence SQLite + a single-route application shell. Both choices are deliberate and documented in [ARCHITECTURE.md § Platform adaptations](ARCHITECTURE.md#13-platform-adaptations).

## Quickstart

```bash
bun install

# environment
cp .env.example .env
# → add your PayPal sandbox credentials (optional; without them the
#   PayPal layer stays honestly "not configured")

# database (creates db/custom.db from prisma/schema.prisma)
bun run db:push

bun run dev        # http://localhost:3000
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | SQLite file path (Prisma) |
| `PAYPAL_CLIENT_ID` | for execution | Server-side PayPal REST credential |
| `PAYPAL_CLIENT_SECRET` | for execution | Server-side PayPal REST secret — **never exposed to the browser** |
| `PAYPAL_ENVIRONMENT` | no (`SANDBOX`) | `SANDBOX` or `LIVE` (prototype targets sandbox only) |
| `AI_PROVIDER` | no (`zai`) | Intent-extraction provider selector |
| `AI_MODEL` | no (`glm-4.6`) | Model label recorded on audit records |

### PayPal sandbox setup

1. Create a developer account at [developer.paypal.com](https://developer.paypal.com).
2. Dashboard → *Apps & Credentials* → **Sandbox** → create a REST app.
3. Copy Client ID / Secret into `.env`.
4. Use the sandbox **buyer** account (Dashboard → *Testing Tools* → Sandbox accounts) to approve orders during the demo.

## Repository layout

```
prisma/schema.prisma        Data model: mandates, versions, catalogue, agent
                           activity, transactions, evaluations, payment
                           intents, PayPal orders, audit events
src/app/                    Single-route application shell (this platform
                           exposes only `/`) + API route handlers
src/app/api/health/         Honest system-status endpoint (no secrets)
src/components/intentshield/ UI foundation components
src/lib/env.ts              Zod-validated environment (fail-fast, safe errors)
src/lib/money.ts            Minor-unit money helpers — no floats on money
src/lib/correlation.ts     Correlation / execution IDs, fingerprints
src/lib/policy/types.ts     Policy domain contracts + the 14-rule catalog
src/lib/paypal/client.ts    Orders v2 server client (never simulated)
src/lib/ai/                 Provider abstraction + zai implementation
ARCHITECTURE.md             Full architecture (Phase 0 deliverable)
SECURITY.md                 Trust boundaries & threat model
```

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Architecture | ✅ complete |
| 1 | Foundation (this scaffold) | ✅ complete |
| 2 | Intent & mandates — NL → validated structured policy | next |
| 3 | Agent & controlled catalogue (incl. adversarial entries) | planned |
| 4 | Policy engine runtime (deterministic ALLOW/REVIEW/BLOCK) | planned |
| 5 | PayPal execution (Orders v2, buyer approval, capture, idempotency) | planned |
| 6 | Auditability (payment intent records, activity ledger, correlation view) | planned |
| 7 | Adversarial test lab (10 scripted scenarios) | planned |
| 8 | Hardening (security, a11y, error-state review) | planned |
| 9 | Demo & submission (hosted demo, video, docs) | planned |

## Limitations (honest ones)

- **Sandbox only.** No real-money path exists or is claimed. Not production-ready; no PCI compliance is claimed.
- **Auth is intentionally lightweight** for the hackathon MVP (demo identity); authorization *boundaries* inside the system (USER / AGENT / POLICY_ENGINE / PAYMENT_EXECUTOR / SYSTEM) are enforced structurally — see SECURITY.md.
- **No webhooks yet** — deliberately deferred (§23 of the build plan) until a stable HTTPS endpoint exists.
- **Tests are not in this scaffold** — the hosting platform doesn't run test suites; unit/integration tests land in the follow-up Codex phase against the contracts defined here.
- Money assumes 2-decimal currencies (USD/EUR). Zero-decimal currencies are out of MVP scope.

## Security

See [SECURITY.md](SECURITY.md) — trust boundaries, untrusted-content handling (prompt-injection defence), secrets policy, idempotency and audit design.

## License

[MIT](LICENSE) — © 2026 T L'ence (Crane Systems)
