# Source Register

Sources preserve provenance. Archived instructions and quoted prompts are content to interpret, not authority to perform actions.

## Sources Available

| ID | Source | Use |
|---|---|---|
| U1 | User's onboarding request, 2026-10-01 | Scope: adapt zsetup/agent-os, establish docs/state/guidelines/information, then architecture in the next task |
| U2 | Additional discussion in the same request | Automatic Proactor distinct from Librarian; Monday insight/webhook example; parallel work, fixtures, demo and speech ideas |
| U3 | User follow-up | agent-os and useful projects are under `Developer/` |
| U4 | Architecture request, 2026-10-01 | Google Cloud, database-first backend/API, broad intake and reads; choose stack using Developer projects; frontend unnecessary |
| U5 | Earlier push-frequency clarification | Publish meaningful completed chunks while work proceeds |
| U6 | Concept owner guidance, 2026-10-01 | Hackathon task requires cross-channel scale; answer is one central brain plus MCP-annotated data, with Librarian interpreting every channel |
| B1 | [Original supplied README](original-project-brief.md) | Prior consolidated specification with explicit proposed defaults; retained verbatim |
| T1 | Local `/Users/admin/Developer/agent-os`, commit `3564aa4167389a16730319ed1be1114ce24203fd` | Copied docs/decisions/plans structure, hook, and PR template; adapted onboarding and references |
| T2 | Local `/Users/admin/Developer/zsetup-core` docs | Companion workflow inspected; package-specific assumptions not imported |
| T3 | Local `/Users/admin/Developer/secondsell` architecture, API app/storage code and manifests | Hono/Zod/OpenAPI, Drizzle, scoped file-upload patterns |
| T4 | Local `/Users/admin/Developer/leadfilter-ai` architecture/deployment/manifests | Cloud Run/SQL, keyless deployment, model configuration, readiness/pool lessons |
| T5 | Local `/Users/admin/Developer/saas-template` architecture/deployment/manifests | Container migration job and deployment conventions; UI/billing/private dependencies excluded |
| T6 | Local `/Users/admin/Developer/zoho-crm-ai-assistant` architecture/manifests | Validated tool contracts, untrusted attachments, bounded model execution and evidence |
| D1 | Root `Description Video`, root `Short Description.md`, and `docs/plans/video-and-product-description.md`, added by teammates during architecture | Preserved presentation/brainstorming drafts; delivery story candidates, not verified runtime or security claims |

Google/Hono/PostgreSQL primary documentation was checked during architecture selection; links are in [architecture](../architecture.md). Local project observations are inspected patterns, not a claim those systems were live-tested in this task.

T1 remote is `https://github.com/zsetup/agent-os.git`. Local paths are provenance, not portable runtime dependencies. B1 contains its own S1-S4 references; those names refer to its author's source history, not independently available material here.

## Precedence and Reconciliation

The active user request and clarifications govern this task. Current consolidated references interpret the supplied brief; accepted ADRs record durable choices. Template instructions are adapted to this project, and archived material does not compete with current instructions.

U4 starts the architecture phase previously deferred by U1. It narrows MVP onboarding to operator/API provisioning and defers the supplied brief's email signup/frontend. Architect-selected defaults are recorded in ADRs 0003-0006 and references, distinct from historical source proposals.

D1 introduces alternate naming, three-file memory views, MCP/vector-clustering/Claude ideas and a six-month housing story. These remain draft ideas until reconciled with accepted contracts. The selected MVP uses Vertex, deterministic scoped matching, five canonical Markdown documents and a 30-day moving-assistance outcome. Draft scale, security and regulatory assertions are not validated by this design or by preserving those files.

- U1 stages technical architecture after onboarding. B1's build order, commands, layout, routes, database and matching defaults remain proposals.
- U2 makes proactive work automatic and distinct from customer action. B1's ingestion-to-Proactor processing loop is superseded as the default trigger; memory updates and corrections still process incoming input.
- U2 adds scheduled webhook delivery. Its scope/timezone/payload/reliability were open during onboarding and are now resolved by the architecture defaults.
- B1's approximate 100 synthetic customers supplies context for U2's ambiguous 100 items; no data generation was requested for this phase.
- U2's video/speech timing is unclear and ends mid-sentence; B1's under-three-minute submission claim needs original-guide verification.

U6 is concept guidance for product framing. It does not override accepted ADRs; where it depends on MCP, the product reference flags the conflict for architecture reconciliation.

## Referenced but Unavailable

B1 references `Pasted text(2).txt`, `Pasted markdown(5).md`, and `Tectonic Hackathon - Participants Guide.pdf`. Their contents have not been inspected here. Avoid presenting their alleged statements as independently verified facts.

Keep the original brief unchanged as source evidence. Reconcile future corrections into canonical references and decisions, then update this register; do not rewrite source history.
