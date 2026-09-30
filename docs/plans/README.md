# `docs/plans/` — ephemeral working plans

Multi-step working plans live here **temporarily**. They are the one exception to the "no new
docs" rule — but they come with a **lifecycle**, so they never rot the way ad-hoc `*-plan.md` /
`*-handoff.md` files do.

## Rules

- **One plan per file**, named for the work: `plans/<area>-<thing>.md`.
- A plan is **ephemeral state**, not a home for facts. Durable decisions belong in an ADR; current
  status belongs in [`../STATE.md`](../STATE.md); system shape belongs in a reference doc.
- **Delete-when-done.** When a plan is complete, fold its outcome into `STATE.md` (and crystallize
  any durable decision into an ADR), then **delete the plan file**. A finished plan left lying
  around is exactly the rot this repo exists to avoid.
- Plans never live in the root of `docs/` — only here. They are **not** in the closed list of
  top-level docs and don't need an ADR to create (that's what this folder is for).

If this folder is empty, that's the healthy default.
