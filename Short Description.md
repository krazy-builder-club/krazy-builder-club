# BOB (Bank-Organized Brain)
**Team:** krazybuildersclub

## Problem
Banks see a customer's biggest life moments in their data (a new job, a growing family, a home getting too small), but that data tracks numbers, not lives. So customers still get generic offers.

## Solution
BOB gives every customer a readable brain: plain Markdown built from bank data, where every line cites the source it came from.

- **Situation:** what is true now, plus goals.
- **Personality:** how they decide and like to be helped.
- **Experience:** what happened and how they reacted.

## How it works
- **Librarian (built):** an LLM agent reads incoming transactions, metadata, notes and corrections. It updates the brain as validated, evidence-linked facts. Code, not the model, renders the Markdown, and a correction retires the old fact instead of deleting it.
- **Ask BOB (built):** plain-English questions are answered only from that customer's brain, with sources.
- **Proactor (next):** every Monday it reviews each brain and compares it with similar customers' outcomes. It proposes one useful next step, or nothing.

## Built with
TypeScript/Hono API, PostgreSQL with row-level tenant isolation, LLM inference via OpenRouter, designed for Google Cloud Run. Prototype on 100 synthetic customers; no real customer data.
