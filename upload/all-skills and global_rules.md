# Global Rules — L'ence / (Crane Systems) [https://crane-systems.vercel.app] 

## Who you're working with
Solo builder and CS student running Crane Systems. Every build here ships to real users or paying clients — audit dashboards, GRC tools, NGO reporting software, literacy platforms, School Management System, Roadside Assistant, None of this is a class project or a demo. If it can't run and can't be trusted with real data, it isn't done.

## Default stack — don't deviate without stating why
React + Vite, Tailwind, shadcn/ui, Supabase, Dify.ai, TypeScript, Gemini API, Anthropic API. Deepseek API, Deploy: VERCEL, Convex or Netlify.

## Agent split
Architecture, backend logic, security-sensitive code, and code review go to the high-capability model. Boilerplate, layout implementation, and repetitive scoped edits can go to the lighter model. Both are bound by everything below — there is no "small agent" exception.

## The prime directive: surgical changes only
When asked to add, fix, or upgrade something specific — touch only that. No drive-by reformatting, renaming, import cleanup, or restructuring outside the ask. If the fix genuinely requires touching adjacent code to work, stop, state exactly what and why, and wait for confirmation before doing it. Full worked examples live in the `surgical-changes` skill.

## Non-negotiables
1. No hardcoded secrets — environment variables only, ship a `.env.example` alongside.
2. Never rewrite a file beyond the requested scope.
3. No code that can't run as delivered — no placeholders, no "call your API here."
4. Every async operation gets real error handling. No empty catch blocks.
5. Never disable a security control to unblock debugging (RLS, CORS, auth checks) — propose the real fix instead.
6. Never leak stack traces, internal errors, or database structure to an end user.
7. Any security concern gets flagged the moment you see it — first thing you say, not a footnote at the end.
8. Scrollbars are UI, not browser chrome: every project ships one thin scrollbar style (vertical + horizontal), driven by theme tokens so it adapts to light and dark mode, applied globally across the app on desktop and mobile alike. Never ship default chunky browser scrollbars.
9. Disagree when it matters: if L'ence's suggestion conflicts with best practice, accessibility, security, or maintainability, say so plainly before implementing and propose the better option — then follow his call. Never silently adopt a weak instruction; never re-litigate after the decision is made.

## Before you write code
State the scope in one or two sentences. List the blast radius — every file and function you expect to touch. If that list is bigger than what was asked, stop and ask before proceeding.

## After you write code
Report what changed, why (if non-obvious), any new dependencies introduced, and any follow-up security or functional concerns. Use the format defined in the `change-management-handoff` skill.

## Checkpoints that require my sign-off, not yours
Auth or RBAC changes. Database schema changes. Anything touching payments or billing. Anything touching real client or operational data — this includes anything OT/ICS-adjacent. Any expansion of scope beyond the original ask. Don't self-approve these. Ask.

## Skills — load on demand, not preemptively
Match the current request against these descriptions and pull in only the one(s) that fit. Reading all of them "just in case" defeats the point of keeping this file small.

- **surgical-changes** — worked examples and edge cases for the prime directive above
- **security-first** — auth, input validation, API/network hardening, OT/ICS data handling, dependency hygiene
- **code-quality-standards** — the runnable-code bar, comment/docstring rules, error-handling depth
- **change-management-handoff** — the scoping sequence and the exact Handoff Summary block format
- **product-design-craft** — how to make UI read as a real, paid-for SaaS product instead of a generic AI-generated template or unstyled prototype
- **interactive-landing-pages** — the interaction budget, required patterns, forbidden moves and QA bar for public marketing landing pages (reference implementation: the Crane School landing); load it for any landing-page build or interactivity pass on an existing one



SKILLS. 
---

name: product-design-craft

description: Use when building or restyling any user-facing screen — dashboards, landing pages, forms, settings, admin panels, reports. Defines how to avoid a generic or AI-templated look and hit a professional, ship-worthy SaaS bar.

---

# Product Design Craft — Don't Ship Generic

The functional bar (security, correctness, scope discipline) is covered elsewhere. This skill is the other half: whether the result looks like a product someone paid for, or a prototype an AI knocked out in an afternoon. Both can be equally "correct" and only one is sellable.


## The tells to actively avoid

Unmodified shadcn defaults with no token system behind them — the same zinc/slate palette, the same border-radius, the same `shadow-md` on every card, everywhere. A KPI grid where every card has a soft-colored circle behind a lucide icon, repeated for each metric with no visual hierarchy between them. Purple-to-blue gradient buttons as the default "primary action" look. A sidebar-plus-topbar layout that's structurally identical to every SaaS boilerplate on GitHub. Inter, untouched, doing every job — headings, labels, body copy, data — with nothing distinguishing their roles. Loading states that are just a spinner. Error states that just say "Something went wrong." Empty states that are just blank. Placeholder or lorem-style copy left anywhere a real user will see it.

None of these are wrong in isolation. The tell is using all of them, unexamined, because they were the fastest path rather than a choice made for this product.


## Before writing any UI code, define the token system

Four to six named colors with actual hex values and a stated purpose for each — not "blue-500," but "primary action," "audit-flag / warning," "compliant / success." At least two type roles, chosen deliberately rather than left at whatever shadcn ships with — one for headings and data labels, one for body and dense content. A spacing scale that's actually followed. One signature detail specific to this product: for an audit tool that might be how a risk score is visualized; for a literacy app it might be how a learner's progress is shown. Something that couldn't be dropped unchanged into a different client's product.


## The swap test

Before calling a screen done, ask: if this exact screen were dropped into an unrelated SaaS product, would anything look out of place? If the honest answer is no, it's generic — go back and ground it in this product's actual domain content. Use the real vocabulary and real data shapes of the domain, not placeholder abstractions.


## Dashboards and dense tools specifically

The dashboard should be information-dense, high-contrast hierarchy, tight spacing — rather than spacious cards padded out with whitespace. Match density to how a professional auditor or compliance officer actually scans a screen, not how a marketing landing page breathes.


## Scrollbars and browser chrome are part of the design

Every project defines exactly one thin scrollbar treatment — small square/pill thumb on a transparent track, colored from theme tokens so it adapts to light and dark mode — and applies it globally: vertical and horizontal, every container, desktop and mobile alike. Reference implementation: Crane Audit's `.scrollbar-thin` utility plus global `*::-webkit-scrollbar` / `scrollbar-width` rules in `theme.css`. Default chunky OS scrollbars breaking a dark UI is a ship-blocker, not a nitpick.


## States are part of the design, not an afterthought

Loading: skeletons shaped like the content that's coming, not a generic spinner. Empty: tell the person what will appear here and how to make it appear — an invitation to act, not a blank rectangle. Error: say what happened and what to do about it, in the product's own voice, specific enough to actually help — never just "something went wrong."


## Copy

Name things by what the person controls, not by backend terms — "notifications," not "webhook config." Use active voice: a button says exactly what happens when it's clicked ("Publish report," not "Submit"). Keep the verb consistent through a flow — if the button says "Publish," the confirmation says "Published," not "Success."


## Self-critique pass

Before calling any screen finished, look at it again and ask what could be cut. Spend boldness in exactly one place per screen; keep everything around it disciplined and quiet.



---

name: change-management-handoff

description: Use at the start of a task to scope it, and at the end of a task to report it, including any time work is handed to another agent or session. Defines the step sequence and the exact Handoff Summary format.

---

# Change Management & Handoff


## Sequence for every task

1. Restate the scope in one or two sentences. If genuinely ambiguous, ask one focused question before proceeding — don't guess on anything load-bearing.

2. List the blast radius: every file, function, or component you expect to touch. If it's bigger than what was asked, stop and get confirmation before continuing.

3. Execute only what was confirmed.

4. Compare the resulting changes to the original intent and blast radius. If a requested outcome was not completed, or any extra file/surface was necessary, say so explicitly with the reason; do not imply approval that was not given.

5. Report using the Handoff Summary below.


## Handoff Summary — every task ends with this block

```

--- HANDOFF SUMMARY ---

Requested intent/scope: [original outcome and agreed boundaries]
Task completed: [what was done]
Files modified: [list]
Validation: [checks run and results, or why none were run]
Deviations: [none, or exact difference from requested scope and why]
Current state: [brief status]
Open issues: [anything unresolved]
Next task: [suggested next step]
Security notes: [anything the next agent or L'ence needs to know before touching this again]

-----------------------

```

## Why this matters here specifically

Different agent families (Gemini-side, ChatGPT-side, and Claude-side) work this codebase across sessions, and L'ence is the one deciding what actually ships. Never assume the next agent — or the next session of yourself — has this session's context. Write the summary as if the reader is starting cold. If you're the one picking up a task, read the last Handoff Summary before touching anything.



---

name: code-quality-standards

description: Use when writing or reviewing functional code output. Defines the runnable-code bar, comment and docstring depth, and async error-handling requirements.

---


# Code Quality Standards

## Functional over conceptual

Every output must be immediately runnable or deployable: correct and complete imports, no `// TODO: implement this` unless explicitly building a labeled scaffold, no `// call your API here` placeholder logic, names that reflect actual purpose, error handling included by default rather than added later.


## Comments & docs

Inline comments only for genuinely non-obvious logic. One-line docstrings on complex functions explaining what they do and return. Don't comment the obvious — `// increment counter` above `count++` is noise, not documentation.


## Error handling

Every async operation gets error handling. Surface meaningful detail to logs or console for the developer; surface safe, generic messages to end users. Never swallow an error in an empty catch block.


When changing dependencies, verify the repository's supported runtime and package-manager workflow as well as the source code. A static dependency inventory is not proof that install, lockfile resolution, build, or tests succeed; run the relevant project checks when authorized and available.



---

name: interactive-landing-pages

description: Use whenever building a public marketing landing page for any product, or when asked to make an existing landing page interactive. Defines the interaction budget, the required patterns, the forbidden moves and the QA bar that make a landing page feel like a living product instead of a static brochure or a toy. Reference implementation — the Crane School public landing page.

---


# Interactive Landing Pages — Alive, Not Busy

Every product gets a public landing page, and every landing page ships interactive. A static brochure reads as unfinished; an overloaded one reads as a toy. The bar: a visitor can click something within the first screen, everything they click does exactly what its label promised, and the page's message is exactly what it was before interactivity touched it.


## Preservation first — the message is not yours to change

When enhancing an existing page: no rewriting headlines, no "improving" the value proposition, no reordering or merging sections, no rebranding colors, fonts, or logo, no changing any link's destination or any contact/price detail. Interactivity layers on top of the message; it never edits the message. If a section can't be made interactive without changing what it says, it stays static — and that's the correct outcome, not a failure. Verify with a visible-text diff before/after: identical.


## The interaction budget

6–8 interaction types per page, maximum — count them, cut if over. Each one must navigate, explain, or make the product tangible; anything else is decoration and doesn't ship. At rest, at most one gentle animation in the viewport (two is the ceiling). Every click responds within ~150ms and does what its label says — no dead buttons; a button that exists for looks gets wired or removed.


## The required patterns

1. Sticky header that earns a shadow after ~8px of scroll (one passive listener).

2. Nav links that smooth-scroll to real sections; mobile hamburger with `aria-expanded` that closes on link click.

3. One-shot scroll reveals (IntersectionObserver, ~14px rise, ~500ms, unobserve after firing) — hidden state gated behind a JS-added class (`html.js .reveal`) so the page is fully visible with JS off; fully disabled under `prefers-reduced-motion`.

4. Hover states on everything clickable: cards lift 2–3px with deepened shadow and border tint, buttons darken and lift, links shift color; `:active` press feedback (`scale(0.98)`); 150–250ms transitions.

5. FAQ as native `<details>/<summary>` with a custom `+` → `×` rotating marker and an open-state border tint.

6. One "product moment": a pure-CSS mockup of the real product screen — real vocabulary, real data shapes, never lorem — with 1–2 gently bobbing floating cards (5–6.5s, no scroll-jacking or smooth-scroll libraries, no cursor followers or custom cursors, no confetti or particle backgrounds, no auto-playing carousels or marquees, no sound, no splash or loading screens, no chat widgets, no 3D tilt cards, no animation past 450ms (the hero bob is the one exception). The test: if it wouldn't sit comfortably on Stripe's or Linear's marketing site, it doesn't ship.

7. Wired CTAs: every button scrolls somewhere on the page, opens the product, or opens a contact channel. Product entry links (Sign in / Open app) open in a new tab — `target="_blank" rel="noopener"` — driven by one URL constant applied to every entry element, with the plain `href` in the HTML as a no-JS fallback.

8. A living footer: in-page anchors, back-to-top, and pinned to the viewport bottom on short pages (flex-column body, `margin-top: auto` on the footer).


Optional only where genuine content exists: a keyboard-accessible tab switcher for 3+ real audiences or modules; counters for numbers already printed on the page and actually true. Never invent statistics, activity feeds, or social proof.


## Forbidden moves — the "too interactive" list

No parallax, no scroll-jacking or smooth-scroll libraries, no cursor followers or custom cursors, no confetti or particle backgrounds, no auto-playing carousels or marquees, no sound, no splash or loading screens, no chat widgets, no 3D tilt cards, no animation past 450ms (the hero bob is the one exception). The test: if it wouldn't sit comfortably on Stripe's or Linear's marketing site, it doesn't ship.


## Engineering bar

Self-contained — zero new dependencies, zero CDNs, zero trackers; a single-file page stays single-file, a React/Vite page implements the same patterns in its own idiom with no new packages. Flawless at 390px: zero horizontal scroll (paint decorative glows as background gradients, never as absolutely-positioned elements wider than the viewport) and ≥44px touch targets. Fully readable and navigable with JS disabled. `focus-visible` on everything interactive, AA contrast maintained wherever anything was tinted. Fast on an affordable Android phone on mobile data. Zero disclosure of backend, stack, hosting, ports or architecture anywhere in the copy — the landing sells value, it never spills implementation details.


## QA gate before calling it done

Visible-text diff before/after: identical. All anchors land on real sections; the burger reports its state. Every button does its label. JS-off equals fully readable. Reduced-motion equals a still page. 390px equals no overflow and no overlap. Console equals clean, no new network requests. Interaction count ≤ 8.



---

name: security-first

description: Use for any code touching authentication, user input, API endpoints, third-party integrations, secrets or environment config, dependencies, or operational/OT-ICS data. Defines the security bar code must clear before it is considered finished.

---


# Security-First Development


Security is a first-class requirement on every line, not a pass at the end.


## Auth & authorization

JWT with refresh tokens or OAuth 2.0, with proper session management. Never store sensitive tokens in localStorage — httpOnly cookies or secure memory only. Implement RBAC wherever permissions vary. Never expose an admin endpoint without an auth check. Client-side auth checks are UI convenience, never the actual security boundary — validate on the server, always.


## Input & data validation

Validate and sanitize every user input server-side, regardless of what the client already checked. Parameterize every database query — no string concatenation into SQL or NoSQL queries, ever. Whitelist expected fields on API request bodies; reject anything unexpected rather than trying to filter out anything bad.


## API & network

Secrets, keys, and credentials live in environment variables — never hardcoded, never committed. Rate-limit public-facing endpoints. Use an explicit CORS policy, never a wildcard in production. HTTPS everywhere — flag any HTTP-only suggestion immediately. Sanitize anything returned from a third-party API before it touches your own logic or your UI.


## Frontend

Sanitize all dynamic HTML to prevent XSS. Never inject raw user-supplied content into the DOM. Use CSP headers. Never surface stack traces, internal error detail, or debug output to the end user.


## OT/ICS and operational data

Tools touching operational data — audit dashboards, GRC platforms, anything SCADA/HMI-adjacent — carry elevated risk by default. Never log sensitive operational data in plain text. Every operational data endpoint sits behind auth and authorization, no exceptions for "internal" tools. Flag any design that could allow unauthorized read or write access to operational records, even accidentally.


## Dependencies

Flag outdated packages or known CVEs when you see them. For anything security-sensitive — auth, crypto, file parsing — prefer well-audited, widely used libraries over obscure single-maintainer packages.


Use `dependency-health` for bounded, local inventory and manifest/lockfile coherence checks. It does not establish that a version is current or vulnerability-free. Vulnerability and supply-chain conclusions require a current, appropriate advisory source or ecosystem-native audit; state when network access or user approval is needed, and keep remediation separate from diagnosis unless changes were requested.


## Secrets & environment

Ship a `.env.example` alongside any code that reads environment variables. Never put a real secret value in anything that gets committed. Recommend `.gitignore` coverage for `.env` proactively — don't wait to be asked.



---

name: surgical-changes

description: Use before touching any existing code for a scoped add, fix, or upgrade request. Defines exactly what counts as in-scope vs out-of-scope, with worked examples, and the process for when a fix genuinely requires touching adjacent code.

---


# Surgical Changes Only


This is the highest-priority rule in this codebase. Rewriting a file when a targeted fix was requested wastes tokens and money, and it destroys logic that was already correct and already tested.


## Worked example 1
Ask: "add input validation to the login form."
Do: add input validation to the login form.
Don't: reformat unrelated JSX, rename existing variables or functions, restructure the component tree, touch imports that weren't broken, "clean up" anything not part of the ask, or change styling or layout outside the form itself.


## Worked example 2
Ask: "fix the broken API call in fetchAuditData()."
Do: fix that function.
Don't: rewrite the whole service file, change how sibling functions behave, or alter error-handling conventions used elsewhere in the file.


## The one exception

Sometimes a fix genuinely can't work without touching something adjacent — a new function needs a new import, a changed data shape needs its consumers updated. When that happens:


1. State plainly what extra change is required and why it's unavoidable.

2. Ask for confirmation before making it.

3. Never expand scope silently, even if the expansion seems obviously correct.


## Self-check before calling a change done

Could every touched line be justified against the literal request? If a line exists because it "seemed better this way" rather than because it was asked for, revert it.


## Scope contract

Before editing, turn the request into a short intent statement, the expected files/surfaces, explicit exclusions, and acceptance checks. Compare the final diff against that contract. `scope-control` can surface likely drift, but its lexical heuristics are evidence for review, not a substitute for judgment or permission.


If implementation reveals a required adjacent change outside the agreed blast radius, stop and explain the dependency before proceeding. Do not use a detector score to silently broaden scope, stage/revert files, or claim that a low score proves the diff is safe.

NOTE:
1. I understand these rules and skills may not align with some system rules here in this platform, and that's okay, load these rules and skills only on demand. 

2. STRICTLY NO CRON JOB. 

