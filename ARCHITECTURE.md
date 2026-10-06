# IntentShield — Architecture

Phase 0 deliverable. Written before the foundation scaffold was built; the scaffold implements the slices marked **[P1]**.

**Thesis:** AI interprets. Policy decides. PayPal executes. The LLM is never the final authority over a financial action.

---

## 1. System overview

```
                 USER
                   │  natural-language spending mandate
                   ▼
          INTENTSHIELD UI (single-route app shell [P1])
                   │
                   ▼
           AI / AGENT LAYER (server-side)
        ┌────────────┴─────────────┐
   intent extraction          product search & reasoning
   (schema-validated [P1])    over controlled catalogue
        └────────────┬─────────────┘
                   ▼  AGENT PROPOSAL  (untrusted input)
           SCHEMA VALIDATION (Zod [P1 contracts])
                   ▼
        DETERMINISTIC POLICY ENGINE [P1 contracts]
                   │        (zero LLM dependency)
        ┌──────────┼──────────┐
        ▼          ▼          ▼
      ALLOW      REVIEW      BLOCK
        │       user confirm   │  structurally never reaches PayPal
        └──────────┴───────────┘
                   ▼
          GUARDED EXECUTOR (server-only)
                   ▼
       PAYPAL ORDERS v2 (server-side REST [P1 client])
                   ▼
          PAYPAL SANDBOX
                   ▼
     AUDIT / LEDGER DB (append-only events [P1 schema])
```

The browser never contains the PayPal secret and never performs privileged payment operations. All sensitive operations live behind the server boundary (Next.js route handlers / server lib code).

## 2. Repository structure

```
src/app/page.tsx             the product surface (this platform exposes one route)
src/app/api/health/          system status — booleans only, never secrets
src/app/api/*                (later phases) mandates, agent, policy, execute
src/components/intentshield/ UI foundation components
src/lib/env.ts               Zod-validated environment
src/lib/db.ts                Prisma client (singleton)
src/lib/money.ts             minor-unit helpers (integer cents everywhere)
src/lib/correlation.ts       correlationId, executionId, fingerprints, references
src/lib/policy/types.ts      rule catalog + mandate/proposal/evaluation contracts
src/lib/policy/engine.ts     (Phase 4) deterministic evaluator
src/lib/paypal/client.ts     Orders v2 REST client (token cache, idempotency)
src/lib/ai/provider.ts       provider abstraction + factory
src/lib/ai/providers/zai.ts  default provider (z-ai-web-dev-sdk, server-only)
src/lib/ai/schemas.ts        mandate-draft schema — strict, rejects hallucinated fields
prisma/schema.prisma         data model (see §3)
```

## 3. Data model (Prisma / SQLite)

| Model | Role | Key constraints |
|---|---|---|
| `User` | demo identity | — |
| `Mandate` | the human's authorization, as stated in natural language | status, `currentVersion` |
| `MandateVersion` | immutable structured constraints per version | `@@unique([mandateId, version])` |
| `Product` | controlled catalogue incl. adversarial entries | `sku` unique; `description`/`externalMetadata` are UNTRUSTED |
| `AgentSession` / `AgentAction` | observable agent behavior | action JSON snapshots (sanitized) |
| `ProposedTransaction` | agent proposal — untrusted input to policy | `fingerprint` indexed for duplicate detection |
| `PolicyEvaluation` | deterministic decision record | every rule outcome recorded, `policyVersion` pinned |
| `PaymentIntent` | execution record | `executionId` **unique** (idempotency), `reference` unique |
| `PayPalOrder` | PayPal execution truth | `paypalOrderId` **unique**, `captureId` **unique** |
| `AuditEvent` | append-only trail | indexed by `correlationId`, `(entityType, entityId)` |

Design decisions:

- **Money is integer minor units** from DB to policy engine to PayPal formatting (`money.ts`). No floats on money.
- **Mandates are versioned; transactions pin the exact version** they were evaluated against. An old transaction is never silently re-evaluated against a new mandate.
- **Snapshot + normalized hybrid:** important fields are normalized columns; `items` / `ruleOutcomes` / `rawSnapshot` keep JSON snapshots so the audit record stands alone even if the catalogue changes.
- SQLite specifics: no enums/arrays → controlled-vocab strings validated in `src/lib` + JSON-string fields.

## 4. Trust boundaries

```
┌─ TRUSTED ────────────────────────────┐   ┌─ UNTRUSTED ────────────────────────────┐
│ user mandate (the authorization)     │   │ merchant descriptions & product data  │
│ system policy (deterministic rules)  │   │ external metadata / arbitrary content  │
│ server-side executor (only PayPal    │   │ model-generated reasoning & output     │
│  path; browser holds no credentials) │   │ agent suggestions / proposals         │
└───────────────────────────────────────┘   └────────────────────────────────────────┘
                ▲                                        │
                └──────── INTENTSHIELD POLICY ENGINE ────┘
                     untrusted content may be reasoned about,
                     it can never ACQUIRE authority
```

Untrusted content may inform *what the agent proposes*; it can never modify the mandate, the policy, execution privileges or credentials. Concretely: the LLM receives product descriptions as **data** in prompts, its output passes strict schema validation (`.strict()` — no extra fields), and authorization decisions come only from the deterministic engine comparing proposals against the mandate.

## 5. PayPal integration approach

Verified against current PayPal developer documentation (searches performed during Phase 0):

- **Server-side Orders v2 REST** is the payment foundation: OAuth2 client-credentials token (`POST /v1/oauth2/token`), order creation (`POST /v2/checkout/orders`, `intent: CAPTURE`), capture (`POST /v2/checkout/orders/{id}/capture`). Base: `https://api-m.sandbox.paypal.com`. **[P1 implemented in `src/lib/paypal/client.ts`]** with token caching, 10s timeouts, safe errors (debug IDs only, never tokens), and `PayPal-Request-Id` idempotency derived from our `executionId`.
- **JavaScript SDK v6** — confirmed real and current: a ground-up redesign (component-based, server-side authentication with a browser-safe client token, script at `.../web-sdk/v6/core`, `onPayPalWebSdkLoaded` callback; official sample repo `paypal-examples/v6-web-sdk-sample-integration`). v5 and v6 must never be loaded on the same page. **Plan:** server generates the order (as today), browser SDK handles buyer approval UI, server captures. Wire-level integration lands in Phase 5 and must be verified against the official sample repo before shipping — do not assume v5 patterns.
- **`@paypal/agent-toolkit`** — confirmed real (npm; adapters for Vercel AI SDK, LangChain, OpenAI Agent SDK, MCP). **Decision: evaluate in Phase 5, adopt only if it adds genuine value.** Even if adopted, the toolkit would sit *behind* IntentShield's guarded executor — the agent may gain PayPal-adjacent tools, never unrestricted privileged execution.
- **Webhooks:** deferred by design (no stable HTTPS endpoint yet, none configured in the developer account). When added: verify signatures, store event IDs, enforce event idempotency, never trust unverified events.

## 6. AI architecture

- Provider abstraction (`AIProvider` interface, factory from `AI_PROVIDER`), default implementation `ZaiProvider` via z-ai-web-dev-sdk, server-only.
- **Use for:** intent extraction, product reasoning, optional explanation. **Never for:** authorization, limit checks, currency checks, expiry, idempotency — all deterministic.
- Model output is data, not authority: `mandateDraftSchema` is `.strict()` (hallucinated fields rejected), amounts arrive in major units and are converted to minor units in code, ambiguous output throws `AIExtractionError` and Phase 2 wiring routes it to clarification/REVIEW — never to assumed defaults.
- Failure model assumed: the model can misunderstand, emit invalid JSON, hallucinate, follow injected instructions, omit constraints. Every one of those failures lands in validation or policy — fail-safe.

## 7. Agent capability design

Tools the agent will expose (Phase 3+): `searchProducts`, `getProduct`, `buildCart`, `calculateCart`, `evaluateIntentShieldPolicy`, and `createPayPalOrder` — **implemented as a guarded executor**: it receives a validated proposal, loads the pinned mandate version, evaluates deterministically, checks idempotency, records the evaluation, and only then invokes PayPal. There is no unguarded PayPal function anywhere in the codebase for the agent to call.

## 8. Policy engine design

- Pure function: `evaluate(mandate, transaction, context) → PolicyEvaluationResult` with an explicit `now` in the context (deterministic, testable).
- 14 rules `R-01…R-14` (see `src/lib/policy/types.ts` — single source of truth; UI and engine both derive from it).
- Every rule records an outcome (`PASS` or the violation outcome) — passes are recorded, not implied.
- Decision semantics: `ALLOW` proceeds; `REVIEW` requires explicit human confirmation; `BLOCK` cannot reach PayPal (structural refusal in the executor).
- Engine version pinned on every evaluation record.

## 9. Idempotency design

- Application-level `executionId` (unique on `PaymentIntent`) is created **before** any PayPal call and replayed as `PayPal-Request-Id` on create and capture.
- PayPal order IDs and capture IDs are unique-constrained; retries (browser, network, agent, server) converge on the same stored records.
- Proposal `fingerprint` (sha256 of mandate+merchant+items+total+currency) feeds rule R-12 duplicate detection.

## 10. Observability

One `correlationId` per end-to-end request, attached to every `AuditEvent`: `session → intent → mandate version → agent action → policy evaluation → payment intent → PayPal order → capture`. Phase 6 surfaces this as the transaction timeline and the agent activity ledger (AG Grid is the preferred sponsor tool for the ledger — adopt there if it genuinely improves filtering/drill-down).

## 11. Security threat model (summary — full treatment in SECURITY.md)

| Threat | Mitigation |
|---|---|
| Prompt injection via merchant/product content | untrusted-content boundary; deterministic policy; schema-validated model output |
| LLM as authority | authorization lives only in the deterministic engine + guarded executor |
| Privilege escalation via model output | `.strict()` schemas; unknown fields rejected |
| Secret leakage | server-only env; health endpoint reports booleans; safe error messages; query logging disabled |
| Duplicate/replayed execution | executionId + PayPal-Request-Id + unique constraints + R-12 |
| Price/amount manipulation | integer minor units; total re-derived and checked, not trusted from the proposal |
| Browser-side privileged calls | no privileged PayPal code reachable from the client; server-only lib |
| XSS from merchant content | React escaping; no raw HTML injection of external content |

## 12. Dependency plan

Everything needed is already installed (Next.js 16, Zod 4, Prisma 6, z-ai-web-dev-sdk, shadcn/ui, next-themes). **No new dependencies in Phase 1.** Future candidates, each requiring justification: `@paypal/agent-toolkit` (Phase 5 evaluation), AG Grid (Phase 6 ledger, if it materially improves the audit experience). No Kubernetes, queues, event buses, blockchains or microservices — by design.

## 13. Platform adaptations

This scaffold was built in a constrained sandbox platform; three deviations from the ideal target stack, all deliberate and reversible:

1. **SQLite (Prisma) instead of Supabase Postgres.** The schema is written to map 1:1 to Postgres when the project moves to its own deployment.
2. **Single-route application shell** instead of `/dashboard /mandates /agent …` pages. The platform exposes only `/`; the app is structured as a single-surface foundation now and splits into routes when hosted standalone.
3. **AI provider = z-ai-web-dev-sdk (server-side)** rather than an external key-based provider, per platform rules. The abstraction preserves the prompt-file's `AI_PROVIDER`/`AI_MODEL` switchability.
4. **No test code on this platform** (platform rule). The deterministic engine and schemas were designed for isolated unit testing; tests land in the Codex continuation phase.

## 14. Risks & unknowns

- **PayPal JS SDK v6 wire-level details** (client-token endpoint specifics, exact component initialization) must be verified against the official `v6-web-sdk-sample-integration` repo during Phase 5. Verified to exist and to be a breaking redesign; not yet wired.
- **Agent toolkit value unproven** — adopt only if it strengthens the PayPal-centric story without weakening the IntentShield boundary.
- **Single demo identity, no real auth** — acceptable for the hackathon, called out honestly in DEMO.md later.
- **SQLite under demo load** — fine for a judge-driven demo; Postgres migration path documented.

## 15. Explicit recommendations

1. Keep the policy engine dependency-free and pure — it is the product's credibility core.
2. In Phase 5, implement buyer approval against the official v6 sample repo and confirm the client-token flow before writing custom code.
3. Seed the catalogue with all adversarial archetypes from the build plan (§29) so demo scenarios are deterministic and repeatable.
4. Keep every "sandbox/prototype" label visible in the UI — the product's honesty is part of its pitch.
