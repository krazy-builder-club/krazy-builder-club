# Plan: Demo Use Case, Video Script and Product Description

Working plan for the submission video (target: under 3 minutes, still to be verified against the participants guide) and the product description. When the video is recorded and submitted, fold the outcome into [delivery](../delivery.md) and delete this file.

Numbers in `[brackets]` are placeholders. They must come from the synthetic fixtures, not be invented. Everything on screen must actually work (see [delivery](../delivery.md)).

## 1. The Use Case: "Emma's Home Is Getting Too Small"

**One-liner:** BOB notices a life moment before the customer asks, asks instead of pushing, and gets smarter when it's corrected.

**Persona (synthetic):** Emma, 34, lives in Leuven, rents a two-bedroom apartment, has two children and has just started a better-paid job.

Every fact about Emma comes from data a bank normally has:

| Brain file | What BOB knows | Evidence |
|---|---|---|
| `personality.md` | `likes_planning`, `prefers_advisor_for_big_decisions` | Customer statement, contact history |
| `situation.md` | `renting`, `family_two_children`, `new_job` | Monthly rent transfer, child benefit (Groeipakket) for two children, salary from a new employer that is [18%] higher |
| `experience.md` | Goal: "keep a €5,000 buffer"; history of past interactions | Customer statement, savings account balance |

**The four beats the jury must remember:**

1. **Librarian: the brain is built from data, and every line has evidence.** Transactions come in and the three files fill up, each claim linked to its source transaction.
2. **Proactor: Monday morning, no one clicks anything.**
   - *Pattern within Emma:* since daycare started she dips into her buffer and is now under her own goal of €5,000.
   - *Pattern across people:* [14 of 22] earlier customers in the same situation (renting, two kids, rising income) started looking for a bigger home within six months.
   - *Result:* BOB does **not** push a mortgage. It **asks a question**: "Is your home still big enough?" It offers a realistic budget view that also protects her buffer, and shows why it asks.
3. **Correction: BOB listens.** Emma answers "We're not moving, we're renovating the attic." The Librarian updates `situation.md`, the moving hypothesis disappears, and the next Monday run proposes renovation financing and the renovation premiums she may be entitled to. The correction doesn't just silence BOB; it makes the next suggestion better.
4. **Personal and scalable.** Jonas is in the same life stage but prefers self-service, so he gets a budget simulator in the app instead of an advisor call. Most customers on most Mondays get nothing: BOB reviewed [100] synthetic brains and spoke up [9] times. At KBC that is 2.3 million brains, one per customer, with no model to train.

**Why this use case:**
- Everyone recognises it. Housing is the biggest financial decision in most lives and touches loans, insurance, savings and advice. That covers KBC's "across products and channels".
- It shows **both** of the team's pattern ideas (within one person and across people) in one story.
- It is **not creepy**. Everything is based on data the bank already has (rent, salary, child benefit), and BOB *asks* instead of assuming.
- The correction beat answers the jury's first worry ("what if the AI is wrong?") before they ask it.
- Every step maps to the KBC brief: signals, situation/intent, automatic adaptation, channels, scale.

**Examples to avoid in the video:**
- *"Stopped going to the gym":* a bank sees the subscription payment, not the gym visits. A KBC jury will spot that immediately.
- Anything that infers pregnancy, health or other sensitive traits from purchases.
- Real KBC logos or screens presented as the real app. Use neutral mock-ups and say "synthetic data" on screen.

## 2. Video Script (target ≈ 2:50, ~390 words of voice-over)

Format: screen recording of the real demo plus voice-over and subtitles. A short face-to-camera intro and outro are optional.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Stream of transactions; a generic "Take out a loan now!" banner | "Your bank sees your salary come in, your rent go out, your kids grow up. It knows more about your life than almost anyone. And what does it do with that? It sends you the same ad as everyone else. We're the Krazy Builder Club, and this is BOB." |
| 0:15–0:25 | Emma's customer card, labelled **synthetic** | "Meet Emma. She's synthetic, but you know her: 34, two kids, renting an apartment in Leuven, just started a new job." |
| 0:25–0:50 | Events arrive; the three Markdown files fill up side by side, each new line highlighted with its evidence ID | "Every customer gets their own BOB: a brain made of three plain-text files. Who they are, where they are in life, and what they've been through. Our Librarian agent reads the bank data as it arrives and keeps that brain up to date. Every line points back to its evidence. No black box." |
| 0:50–1:25 | Clock jumps to Monday 07:00 (label: *simulated schedule*); Proactor run log; two insight panels | "Every Monday morning our Proactor wakes up. Nobody clicks anything. It reads Emma's brain and looks for two kinds of patterns. First, in her own life: since daycare started, she's been dipping into the €5,000 buffer she told us she wants to keep. Second, across people: BOB finds customers who were where Emma is now, renting, two kids, rising income, and checks what happened next. [14 of 22] started looking for a bigger home within six months." |
| 1:25–1:45 | Suggestion card, as the webhook delivers it to an app, Kate or an advisor screen, with a "Why am I seeing this?" section | "So BOB doesn't push a mortgage. It asks: 'Is your home still big enough? If you're thinking about more space, here's what's realistic on your budget, and how to protect your buffer along the way.' And it shows exactly why." |
| 1:45–2:10 | Emma types the correction; diff of `situation.md`; old card struck through; the next Monday card appears | "Emma answers: 'We're not moving. We're renovating the attic.' BOB listens. The Librarian updates her brain, the moving hypothesis is gone, and next Monday Emma gets what she actually needs: renovation financing and the premiums she's entitled to." |
| 2:10–2:30 | Split screen: Emma's card vs Jonas's card | "Same life stage, different person. Jonas prefers to do everything himself, so he doesn't get an advisor call. He gets a budget simulator in the app. And for most customers, on most Mondays, BOB decides the best thing to do is nothing." |
| 2:30–2:50 | Run summary: [100] brains reviewed, [9] suggestions, [91] stayed quiet; simple architecture diagram: bank data → Librarian → brains → Proactor → Kate / app / advisor | "This week BOB reviewed [100] synthetic customers and spoke up [9] times. At KBC that's 2.3 million brains, one per customer, with no new model to train, and every suggestion explainable and correctable. BOB isn't another feature. It's the memory behind Kate, the app and every advisor." |
| 2:50–3:00 | Logo, tagline, team names | "BOB. A bank that understands first, suggests second, and always shows why. Krazy Builder Club." |

**What the demo must show on screen** (checklist for the builders):
- [ ] An event feed showing incoming synthetic transactions
- [ ] The three brain files side by side, with new lines highlighted and evidence IDs visible
- [ ] A way to trigger the Monday run with a simulated clock (disclose this on screen)
- [ ] A suggestion with its evidence: own-life pattern plus cohort count computed from fixtures
- [ ] A correction input → brain diff → the old suggestion superseded → a new suggestion on the next run
- [ ] A second customer (Jonas) with a different action or channel
- [ ] A run summary: reviewed / suggested / no action
- [ ] No API keys, tokens or real data visible anywhere in the recording (this matters for the security audit)

**Recording tips:** record each beat separately and edit them together. Use the same fixture seed every time. Add subtitles, because juries often watch without sound. Export at 1080p. Rehearse the voice-over with a stopwatch and cut words before speeding up.

## 3. Product Description (to upload)

Adjust anything that doesn't actually work at submission time.

**Tagline:** *BOB: a memory for every customer. Understand first, suggest second, always show why.*

**Short (≈ 50 words):**

> BOB gives every bank customer their own "brain": readable files about their personality, life situation and experience, each claim linked to its evidence. Every Monday an AI agent reviews every brain, spots life moments by comparing with similar customers, and suggests one useful next step, or nothing. Customers can correct it, and it learns.

**Long (≈ 220 words):**

> Banks see the biggest moments of their customers' lives in their data: a new job, a growing family, a home that's getting too small. Yet they still talk to customers in segments and generic offers.
>
> BOB changes the foundation. Every customer gets their own "brain": three plain-text files describing their personality, current situation and experience, with every claim linked to the transaction or statement it came from. A **Librarian** agent keeps each brain up to date as new data arrives.
>
> Every Monday, a **Proactor** agent automatically reviews every brain and looks for two kinds of patterns: in the customer's own life (a savings buffer under pressure) and across similar customers (families in the same life stage who went on to look for a bigger home). It then proposes one useful next step, such as a question, information or a hand-off to an advisor, or it deliberately does nothing.
>
> Every suggestion shows its evidence and can be corrected by the customer. A correction updates the brain immediately and replaces outdated suggestions. BOB uses existing language models without training new ones, keeps one brain per customer, and delivers context to Kate, the app and advisors alike. It is built for 2.3 million customers.
>
> *Proof of concept built on [100] synthetic customers. No real customer data was used.*
