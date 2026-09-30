# BOB (Bank-Organized Brain)
**Team:** krazybuildersclub

## Problem
Banks see a customer's biggest life moments in their data (a new job, a growing family, a home getting too small), but that data tracks numbers, not lives. So customers still get generic offers.

## Solution
BOB gives every customer a readable brain: five Markdown files built from bank data, where every line cites the source it came from.

- `overview.md`: a generated summary of the other four.
- `situation.md`: what is true now.
- `goals.md`: what they want, only as stated or confirmed by the customer.
- `personality.md`: how they decide and like to be helped.
- `experience.md`: what happened and how they reacted.

## How it works
- **Librarian (built):** an LLM agent reads incoming transactions, metadata, notes and corrections. It updates the brain as validated, evidence-linked facts. Code, not the model, renders the Markdown, and a correction retires the old fact instead of deleting it.
- **Ask BOB (built):** plain-English questions are answered only from that customer's brain, with sources.
- **Proactor (next):** every Monday it reviews each brain and compares it with similar customers' outcomes. It proposes one useful next step, or nothing.

## What customers get
The end goal: the bank simplifies customers' lives before they ask. Each suggestion shows why it is made and can be dismissed or corrected.
- **Ask, don't push:** Emma rents, has two kids and a better-paid job, and similar families often moved to a bigger home. BOB asks "Is your home still big enough?" instead of pushing a mortgage.
- **Show what matters:** a budget view that protects her own €5,000 savings buffer, which daycare costs pushed her under.
- **Prepare the next step:** when Emma answers "we're renovating the attic", the next suggestion covers renovation financing and premiums.
- **Use the right channel:** an advisor meeting for Emma, who prefers deciding in person; a budget simulator in the app for Jonas, who prefers self-service.
- **Stay quiet:** most customers get nothing on most Mondays.

## Built with
TypeScript/Hono API, PostgreSQL with row-level tenant isolation, LLM inference via OpenRouter, designed for Google Cloud Run. Prototype on 100 synthetic customers; no real customer data.
