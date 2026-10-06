# IntentShield — Shared Worklog

Project: IntentShield — a trust and policy firewall for AI-powered PayPal transactions.
Hackathon: PayPal AI Hackathon 2026 ("Build What's Next with PayPal and AI")
Developer: T L'ence (Crane Systems)

Core principle: AI interprets and proposes. Deterministic software authorizes. PayPal executes.
The LLM must never be the final authority over a financial action.

Session rules: STRICTLY NO CRON JOB. Phase discipline per project prompt §48: Phase 0 report +
Phase 1 foundation scaffold only, then STOP for checkpoint.

Platform adaptations (agreed): Next.js 16 App Router single-route SPA at `/` (platform constraint —
no other user-visible routes); Prisma + SQLite instead of Supabase Postgres (platform constraint);
backend APIs via Next.js route handlers (no server actions); AI via z-ai-web-dev-sdk in backend only;
no test code on this platform (tests land in the Codex handoff phase).

---
Task ID: 1
Agent: main (Z.ai Code)
Task: Environment inspection + worklog initialization (Phase 0 item A)

Work Log:
- Node v24.21.0, bun 1.3.14, git 2.47.3. Dev server already running on port 3000 (HTTP 200).
- package.json: Next.js 16.1.1, React 19, Tailwind 4 + tw-animate-css, full shadcn/ui (New York)
  component set present in src/components/ui, zod ^4.0.2, @prisma/client ^6.11.1,
  z-ai-web-dev-sdk ^0.0.18, next-themes, framer-motion 12, lucide-react, sonner — all needed
  deps already installed; NO new dependencies required for Phase 1.
- prisma/schema.prisma: SQLite datasource, template User/Post models (to be replaced).
- .env exists with DATABASE_URL=file:/home/z/my-project/db/custom.db (db folder convention).
- No .env.example, no LICENSE, no README.md yet — to be created in Task 2-a.
- src/app: layout.tsx (Geist fonts, Toaster), page.tsx (template), globals.css (shadcn tokens),
  api/route.ts (template health). No other user routes — platform requires single `/` route.
- Verified no secrets present anywhere in the repo.

Stage Summary:
- Environment is healthy and fully provisioned. Phase 1 can proceed with zero new installs.
- Dev server: leave running, single instance, port 3000.
---
Task ID: 2-b
Agent: full-stack-developer (UI foundation shell)
Task: Phase 1 UI foundation shell — single-route IntentShield control-room page with token system, all eight sections, and error boundaries.

Work Log:
- Read Task 1 log; confirmed deps (next-themes, framer-motion, lucide-react, full shadcn/ui) need no installs.
- Rewrote src/app/globals.css: IntentShield token system (dark values in .dark as default, light in :root), decision colors --allow/--review/--block + --surface-raised/--grid-line registered in @theme inline (utilities text-allow/bg-block/...), --radius 0.375rem, exact global thin-scrollbar block, hero blueprint-grid ::before (masked, never wider than viewport), html.js .reveal one-shot reveal pattern, smooth scroll + full prefers-reduced-motion kill switch. Removed unused template chart/sidebar tokens (no blue anywhere).
- Rewrote src/app/layout.tsx: Space Grotesk (500/600/700) + JetBrains Mono (400/500/600) via next/font (vars --font-space-grotesk/--font-jetbrains-mono mapped in @theme as font-display/font-data), Geist kept for body; ThemeProvider (next-themes, attribute="class", defaultTheme="dark", enableSystem={false}); IntentShield metadata; inline script adds html.js before paint so reveals work but content stays visible with JS off; Toaster kept.
- Built src/components/intentshield/: primitives (SectionHeading/MonoLabel/DecisionBadge), reveal (IntersectionObserver one-shot, unobserve), theme-toggle (CSS-driven Sun/Moon swap — no hydration mismatch), system-status (HealthResponse interface coded to the documented /api/health contract + shape validation; SystemStatusPill for header + section with skeleton-shaped loading rows, honest UNREACHABLE state with working RETRY, CHECKED hh:mm:ss UTC footer), site-header (sticky, backdrop blur, data-scrolled elevation via one passive listener, desktop anchor nav, mobile Sheet with aria-expanded/aria-controls, 44px touch targets), hero (eyebrow, emerald-accented H1, principle strip with accessible Tooltips + emerald middle chip, honest Phase-1 line → #roadmap), chain-rail (5 nodes, POLICY EVALUATION highlighted, vertical on mobile), decision-semantics (aria-pressed toggles, framer-motion panel ≤180ms, reduced-motion aware), trust-boundary (TRUSTED/UNTRUSTED columns + centered engine chip divider), rule-catalog (14 rules, shadcn Table in Card, max-h-96 scroll, sticky thead — added .rules-scroll override because shadcn's inner overflow-x-auto wrapper would break thead stickiness), roadmap (10-phase build manifest), site-footer (mt-auto, safe-area padding, honest sandbox copy).
- Created src/app/error.tsx, global-error.tsx (inline styles, dark), not-found.tsx (branded 404).
- page.tsx: root min-h-screen flex-col wrapper, header/main/footer landmarks, sections #overview #chain #trust #rules #status #roadmap with scroll-margin.
- bun run lint: clean (0 errors/warnings). Verified via headless browser at 390px and 1280px: no horizontal scroll (scrollWidth==390), console clean (no hydration warnings), decision panel toggles, RETRY re-fetches, sticky thead works, sheet closes + smooth-scrolls, light mode AA-readable, focus-visible emerald ring confirmed. curl: / = 200, /nonexistent-route = 404 (branded).

Stage Summary:
- Files created: src/app/error.tsx, src/app/global-error.tsx, src/app/not-found.tsx, and 12 files under src/components/intentshield/ (primitives, reveal, theme-toggle, system-status, site-header, hero, chain-rail, decision-semantics, trust-boundary, rule-catalog, roadmap, site-footer).
- Files modified: src/app/globals.css, src/app/layout.tsx, src/app/page.tsx. Nothing else touched (no prisma/, src/lib/, package.json, db/, .env, src/app/api/** changes). Only @/lib import used is @/lib/utils (cn).
- ORCHESTRATOR MUST KNOW: (1) GET /api/health does not exist yet — UI currently shows the honest UNREACHABLE state; build the route to the contract in the task spec (system-status.tsx holds the exact TypeScript interface) and both the header pill and #status section will light up with real data. (2) Header pill + status section each fetch once on mount (two GETs by design). (3) Theme default is dark via next-themes class on <html>; light values live on :root — with JS disabled the page falls back to light (accepted tradeoff). (4) The dev.log cross-origin/allowedDevOrigins warning is pre-existing platform noise, not from my files.

---
Task ID: 2-a
Agent: main (Z.ai Code)
Task: Phase 0 documentation set — README.md, ARCHITECTURE.md, SECURITY.md, .env.example, LICENSE; PayPal doc verification via web search.

Work Log:
- Verified current PayPal reality via z-ai web search: (a) Orders v2 remains the server-side standard (create/capture); (b) JavaScript SDK v6 is REAL — ground-up redesign, component-based, server-side auth with browser-safe client token, script at .../web-sdk/v6/core, onPayPalWebSdkLoaded callback, official sample repo paypal-examples/v6-web-sdk-sample-integration, v5+v6 must never coexist; (c) @paypal/agent-toolkit is real (npm; Vercel AI SDK/LangChain/OpenAI Agent SDK/MCP adapters) — decision: evaluate in Phase 5, only adopt if it adds value, always behind the guarded executor.
- Wrote README.md (problem/solution/why, chain, stack, quickstart, env table, sandbox setup, repo layout, roadmap, honest limitations, MIT).
- Wrote ARCHITECTURE.md — full Phase 0 deliverable: system diagram, repo structure, data model + constraints, trust boundaries, PayPal/AI/agent/policy designs, idempotency, observability, threat-model summary, dependency plan, platform adaptations (SQLite, single-route, zai provider, tests deferred), risks/unknowns (v6 wire-level details need Phase 5 verification), recommendations.
- Wrote SECURITY.md: trust boundaries, prompt-injection defence in depth (data-not-instructions → strict schema wall → deterministic backstop → R-13), secrets policy, LLM failure model, deterministic authorization, idempotency, audit design, execution boundaries, honest sandbox limitations.
- Created .env.example (placeholders only, server-side-only banner) and LICENSE (MIT, T L'ence).

Stage Summary:
- Phase 0 items A–O complete and persisted in repo docs. Key verified facts: PayPal JS SDK v6 exists (do not assume v5 patterns); agent toolkit real but deferred; Orders v2 endpoints as in the build plan.

---
Task ID: 3
Agent: main (Z.ai Code)
Task: Prisma schema — full IntentShield data model + db push.

Work Log:
- Replaced template User/Post schema with: User, Mandate, MandateVersion (@@unique mandateId+version), Product (adversarial flag, untrusted description/externalMetadata), AgentSession, AgentAction, ProposedTransaction (fingerprint indexed), PolicyEvaluation (all-rule outcomes JSON, policyVersion pinned), PaymentIntent (executionId UNIQUE, reference UNIQUE), PayPalOrder (paypalOrderId + captureId UNIQUE), AuditEvent (correlationId indexed, append-only by convention).
- All money = integer minor units. SQLite constraints honored: controlled-vocab strings + JSON-string fields, validated in src/lib.
- Ran `bun run db:push` — schema in sync, Prisma Client generated (v6.19.2).

Stage Summary:
- Data model complete per build-plan §14/§15/§24. Migration path to Postgres documented in ARCHITECTURE.md.

---
Task ID: 4
Agent: main (Z.ai Code)
Task: Core libraries — env validation, money, correlation, policy contracts, PayPal Orders v2 client, AI provider abstraction.

Work Log:
- src/lib/env.ts: Zod-validated env, cached; failures report FIELD NAMES only (never values); isPayPalConfigured() boolean helper.
- src/lib/money.ts: minor-unit helpers — formatMoney, toPayPalAmount ("900.00" for Orders v2), parseMoneyToMinor.
- src/lib/correlation.ts: newCorrelationId (uuid), newExecutionId ("exec_..."), transactionFingerprint (sha256), paymentReference ("IS-10xx").
- src/lib/policy/types.ts: POLICY_ENGINE_VERSION "1.0.0", RuleCode R-01..R-14, POLICY_RULES single-source catalog (drives UI + future engine), MandateConstraints, TransactionProposal (untrusted), EvaluationContext (explicit `now`), RuleOutcome (PASS recorded, not implied), PolicyEvaluationResult, PolicyEngine interface, normative decision semantics.
- src/lib/paypal/client.ts: server-only Orders v2 REST client — OAuth client-credentials with module-scoped token cache (60s expiry buffer), createOrder (intent CAPTURE, PayPal-Request-Id = executionId), captureOrder (PayPal-Request-Id = capture_executionId), getOrder; 10s AbortSignal timeouts; PayPalNotConfiguredError (NEVER simulated) and PayPalApiError (safe messages + debug IDs only, never tokens/secrets).
- src/lib/ai/provider.ts + providers/zai.ts + schemas.ts: AIProvider abstraction (factory via AI_PROVIDER), ZaiProvider via z-ai-web-dev-sdk (server-only), strict JSON contract prompt ("you do not authorize, you translate"), mandateDraftSchema .strict() (rejects hallucinated fields), amounts in major units converted deterministically, AIExtractionError fail-safe path.
- SECURITY FIX (disclosed): src/lib/db.ts prisma log changed ['query'] → ['error','warn'] — query logging dumps bound values (financial/operational data) into logs.

Stage Summary:
- All Phase 1 foundation contracts in place. No new dependencies. z-ai-web-dev-sdk used strictly server-side.

---
Task ID: 5
Agent: main (Z.ai Code)
Task: /api/health endpoint + honest /api root.

Work Log:
- Created src/app/api/health/route.ts: force-dynamic; real DB probe (SELECT 1); returns booleans only (paypal.configured, ai provider/model labels, policy engine version + rule count, timestamp); 200 always with status "ok"|"degraded" so the client can render which subsystem failed; safe error logging (message only).
- Replaced template hello-world src/app/api/route.ts with honest service pointer (service, phase, health URL).

Stage Summary:
- UI health chain now end-to-end: /api/health → SystemStatusPill + #status section render real data. Verified: {"status":"ok","database":{"connected":true},"paypal":{"configured":false,...},"ai":{"provider":"zai","model":"glm-4.6"},"policyEngine":{"version":"1.0.0","rules":14}}.

---
Task ID: 6
Agent: main (Z.ai Code)
Task: Verification — lint, cold start, browser E2E (agent-browser), VLM QA, dev.log review.

Work Log:
- bun run lint: clean (0 errors/warnings).
- Restarted dev server for clean cold start (single instance; killed the cached PrismaClient so the no-query-logging fix took effect). Cold start: Ready in ~620ms; GET / 200; GET /api/health 200. NOTE: this environment reaps background processes between tool invocations — dev server must be started double-fork detached: ((setsid bun run dev >/tmp/dev2.log 2>&1 &)) — currently running this way.
- Browser E2E (agent-browser): title correct; ZERO page errors, ZERO console errors/warnings (only React DevTools info + HMR); status section renders live health data (DATABASE CONNECTED · POLICY ENGINE 1.0.0 · 14 RULES · PAYPAL SANDBOX NOT CONFIGURED with honest hint · AI PROVIDER zai/glm-4.6 · CHECKED UTC); BLOCK decision toggle sets aria-pressed=true and reveals "Violates a hard rule. Never reaches PayPal — the executor structurally refuses blocked transactions."; theme toggle cycles dark↔light↔dark; 6 nav anchors all target real sections; 390px: scrollWidth==clientWidth (no horizontal overflow), footer pinned (0px gap); 2000px/5000px viewports: long-page footer pushed naturally, short-page footer pinned via min-h-screen flex-col mt-auto (footer bottom == viewport bottom, 0 gap).
- VLM QA on desktop hero screenshot: rendered properly, reads as serious fintech/security control-room UI (not a template), emerald/amber accents confirmed, no blue/purple.
- dev.log final review: all 200s, no errors, no prisma:query lines (security fix confirmed).

Stage Summary:
- Phase 1 foundation is browser-verified end-to-end. Honest states verified working (PayPal NOT CONFIGURED messaging, retry path).
