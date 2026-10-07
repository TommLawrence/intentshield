# IntentShield — 3-Minute Demo Script

Written for a **mobile-view screen recording** (the same flow works on desktop —
hover replaces tap). Say the **SAY** lines in your own voice, do the **DO**
actions as you speak. Total speaking time is about 2 minutes 45 seconds, which
leaves room for the two wait moments (mandate extraction, agent search).

**Before you record (2 minutes):**

1. Open the app on your phone (or responsive mode) — check the header pill says
   the system is **operational**.
2. Have the Mandate Console visible at the top of your scroll.
3. Do one practice run of steps 2–4 below so the AI response times feel natural.
4. Optional: clear old test rows you don't want on screen (`bun run db:studio`),
   but a ledger with history actually looks good — every row is proof.

---

## [0:00] The problem — 15 seconds

**DO:** Stay on the hero (top of the page).

**SAY:**
> "AI shopping agents are great at finding things to buy. The hard part is
> trust — how do you let an AI spend your money without handing it your whole
> wallet? This is IntentShield, a payment firewall for AI agents. Its answer is
> one sentence: **the AI interprets, policy decides, PayPal executes.**"

## [0:15] The three principles — 20 seconds

**DO:** Tap **AI INTERPRETS**, read the tooltip out loud. Tap **POLICY
DECIDES**, then **PAYPAL EXECUTES** — each tap opens its own explanation.

**SAY:**
> "Tap any of these to see what each part is allowed to do. The AI only
> *understands* my words — it has zero authority. A fixed rule engine *decides*,
> with no AI in the decision. And PayPal only *moves the money* after the rules
> say yes — guarded, on the server, fully recorded."

## [0:35] Step 1 — Turn my words into rules — 35 seconds

**DO:** Scroll to **01 · MANDATE CONSOLE**. Tap the **LAPTOP · FULL EXAMPLE**
chip, then tap **EXTRACT MANDATE**. Wait for the draft (a few seconds).

**SAY:**
> "First, I tell it what an agent may buy for me — in plain English. A laptop
> for work, at most nine hundred dollars, brand new, no subscriptions, shipping
> under forty. The AI reads this and drafts a structured version."

**DO:** When the review screen opens, scroll through the fields slowly.

**SAY:**
> "And here's the important part — nothing is authorized yet. I check every
> field. Maximum spend, shipping limit, condition, quantity, how long it's
> valid. If the AI got anything wrong, I fix it myself. Only when I confirm
> does this become my active authorization."

**DO:** Tap **CONFIRM**.

## [1:10] Step 2 — Let the agent shop — 30 seconds

**DO:** Scroll to **02 · AGENT & EXECUTION**. Pick your new mandate in the
**Spend under mandate** picker, tap the **STANDARD** example, then **RUN AGENT
SEARCH**. Wait (up to ~20 seconds).

**SAY:**
> "Now the shopping agent. I pick my mandate and ask for a laptop. The AI can
> only propose real catalogue products, by product code — it cannot invent a
> payment. Then, with no AI involved at all, the rule engine checks the
> proposal against my mandate — sixteen checks, every single time."

**DO:** When the result appears, briefly show the proposed product and the
rule list.

**SAY:**
> "Here's the proposal, and here's the verdict: **ALLOW — all sixteen rules
> passed.** Under budget, shipping within my limit, new condition, one-time
> purchase."

## [1:40] Step 3 — One decision, on the record — 35 seconds

**DO:** Tap the **green decision banner** — the full Payment Intent Record
opens. Scroll through it slowly as you speak.

**SAY:**
> "Tap the decision, and the full record opens. This is the heart of the
> product. At the top — my exact words, so intent is never lost. Then the
> mandate terms that were actually enforced. Then what the AI proposed — items,
> totals, tax. Then the decision, with every rule shown, pass or fail. Then the
> PayPal leg, a timeline, and a complete audit trail. One decision, on the
> record, permanently."

**DO:** Close the record.

## [2:15] Step 4 — What if the agent misbehaves? — 20 seconds

**DO:** Scroll to **03 · ADVERSARIAL LAB**. Tap **RUN** on **B — Amount above
budget**.

**SAY:**
> "So what happens when an agent misbehaves? The lab has ten ready-made
> attacks. Here the agent tries to spend over my limit — watch. **Blocked.**
> The exact rule is named, and the attempt is recorded forever. Every scenario
> runs the real pipeline — no mocks, no shortcuts."

## [2:35] The ledger and the honest ending — 25 seconds

**DO:** Scroll to **04 · ACTIVITY LEDGER**. Show a couple of rows, tap one to
reopen its record, close it.

**SAY:**
> "Everything lands in the ledger — every proposal, every decision, every
> blocked attack. Filter it, or tap any row for its full record.

> One last thing — honesty. PayPal here runs in sandbox mode, and without
> credentials the system *refuses* to execute and says so openly. It never
> fakes a successful payment. That's the whole idea: give AI permission to act
> — without giving it unlimited authority. IntentShield."

---

## If something goes wrong live

| Situation | Recovery line |
|---|---|
| Search takes long | "A real model call — this is genuinely searching the catalogue." |
| Verdict is REVIEW, not ALLOW | "The engine wants a human's yes first — watch." Then approve it. |
| Verdict is BLOCK (duplicate) | "It caught a repeat of the same purchase — by design. Nothing was charged twice." |
| Extraction fails validation | "The AI's answer didn't pass strict validation — so nothing was created. That's the schema wall working." |

**Never** say "it's broken" — every one of these is the product working.
