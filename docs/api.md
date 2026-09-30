# API Contract

Accepted design. Implemented locally and described by the generated [`apps/backend/openapi.json`](../apps/backend/openapi.json): health, `GET /me`, `POST/GET /customers` (with `external_id` lookup), `GET /customers/{id}`, event intake and reads, brain and document reads, grounded queries, and `GET /jobs/{id}`. Other routes below are not implemented yet; nothing is deployed. Platform owns shared Zod schemas and generated OpenAPI 3.1; changes update this reference. Persistence and internal roles live in [data](data.md), limits/execution in [architecture](architecture.md).

## Common Rules

Base path `/v1`; authentication `Authorization: Bearer <api_key>`. Workspace is derived from the verified key. `customer_id` is a scoped record ID; `external_id` is an integration's unique customer identity in that workspace, not a credential. Keys with customer grants must pass both capability and customer checks. Unauthorized record lookup returns `404`; invalid/revoked keys return `401`; missing capability returns `403` without disclosing target data.

JSON fields use `snake_case`, IDs are opaque strings, times are RFC3339 UTC, and monetary amounts use integer minor units plus ISO currency code. Flexible user JSON is preserved as supplied; only the standard envelope is normalized. Body-size limits, cursor pagination (default 20, maximum 100), and scrubbed errors apply consistently.

Every mutation accepts an `Idempotency-Key` header; ingestion/finalization/evaluation require it. Same key/route/body returns the prior result; changed body returns `409 idempotency_conflict`. Keys are scoped to the authenticated key/workspace. Source identity uniqueness additionally deduplicates events after the HTTP result retention window. Return server-generated `x-request-id` for correlation.

Error envelope:

```json
{"error":{"code":"unsupported_media_type","message":"This input cannot be extracted yet.","request_id":"req_example","details":{"file_id":"file_example"}}}
```

`413` means bounded size exceeded, `415` unsupported inline content type, `422` invalid envelope, `429` shared workspace admission limit, and `503` temporarily unavailable infrastructure. Unknown failures never expose raw exceptions. Flexible content is data, never trusted model/system instructions.

## Routes

| Method/path | Capability | Response/behavior |
|---|---|---|
| `GET /me` | Any valid key | `200` workspace, key ID, capabilities and customer-grant mode of the presented key; never the secret |
| `POST /customers` | `customers:write`, workspace-wide grant | `201` create from `external_id` and optional supplied metadata; commits the empty version-1 brain in the same transaction; metadata becomes a source event/job; existing `external_id` is `409 customer_exists` |
| `GET /customers` | `data:read` | `200` paginated customers filtered to key grants; `external_id=` selects an exact match |
| `GET /customers/{id}` | `data:read` | `200` permitted customer identity and processing state |
| `DELETE /customers/{id}` | `customers:write` | `202` durable deletion job; immediately disables reads and pending delivery |
| `POST /customers/{id}/events` | `sources:write` | `202` accepted source and Librarian job; no automatic Proactor trigger |
| `GET /customers/{id}/events` | `data:read` | `200` paginated permitted source metadata, optionally inline payload |
| `GET /customers/{id}/events/{event_id}` | `data:read` | `200` original permitted payload and extraction status |
| `POST /customers/{id}/uploads` | `sources:write` | `201` pending upload, create-only signed PUT URL and required headers |
| `POST /customers/{id}/uploads/{upload_id}/complete` | `sources:write` | `202` verified attachment source/extraction job; unknown file type is explicitly unsupported |
| `GET /customers/{id}/files/{file_id}` | `data:read` | `200` metadata/extraction status; `download=true` adds a short-lived URL for pinned original generation |
| `GET /customers/{id}/brain` | `data:read` | `200` latest/`version=`-selected structured memory, tree and documents; `format=markdown` returns one Markdown bundle; `404 brain_not_ready` only for customers without any snapshot |
| `GET /customers/{id}/brain/document?path=` | `data:read` | `200 text/markdown` for one canonical path (query parameter because paths contain `/`), optional `version`, ETag and pending-source headers; unknown path `400` |
| `POST /customers/{id}/query` | `query:run` | `202` grounded read-only query job, retrieved through jobs endpoint; optional `wait_seconds` (max 25) returns `200` with the finished job; also counts the model admission group |
| `POST /customers/{id}/evaluate` | `evaluate:run` | `202` manual Proactor job; does not send a webhook or alter weekly scheduling |
| `GET /customers/{id}/insights` | `insights:read` | `200` permitted insights, latest status/freshness/evidence |
| `POST /customers/{id}/feedback` | `feedback:write` | `202` confirm/dismiss/correct an insight; persist event and return processing job |
| `GET /jobs/{id}` | Related capability and scope | `200` state, result refs/query answer, attempt count and scrubbed error |
| `POST /subscriptions` | `subscriptions:manage` | `201` weekly schedule/customer scope and pending webhook challenge |
| `GET /subscriptions` | `subscriptions:manage` | `200` caller-owned permitted subscriptions; no secrets |
| `GET /subscriptions/{id}` | `subscriptions:manage` | `200` permitted schedule, destination and verification state |
| `PATCH /subscriptions/{id}` | `subscriptions:manage` | `200` change/disable; URL changes invalidate verification and queued sends |
| `DELETE /subscriptions/{id}` | `subscriptions:manage` | `204` disable/cancel future sends; retain operational history |
| `GET /subscriptions/{id}/reviews` | `subscriptions:manage` | `200` paginated review occurrences and partial/no-action/failure counts |
| `GET /subscriptions/{id}/deliveries` | `subscriptions:manage` | `200` delivery/attempt metadata without body secrets |

Operator provisioning/key lifecycle is an IAM-restricted CLI/administrative operation, not a public self-service signup route. Job access inherits the target capability and customer grant; a workspace-wide subscription job additionally requires subscription ownership. Revoked keys cannot poll old jobs or retrieve signed downloads.

`GET /health/live` reports process health without customer content; `GET /health/ready` checks database reachability and returns `503` when unavailable. Readiness does not call the model. `/openapi.json` describes the implemented schema; it must be generated and freshness-checked once routes exist. Swagger/reference rendering is optional developer documentation, not an application frontend.

## Intake Envelope

Accept JSON or `text/plain`. Plain text uses authenticated customer scope and is wrapped as a `note` event with the required HTTP idempotency key as source identity. JSON `payload` accepts any valid bounded JSON value. Known types may have structured validation; unknown `event_type` values are retained as generic supplied information.

```json
{
  "source": "bank_demo",
  "source_event_id": "message_019",
  "event_type": "note",
  "occurred_at": "2026-10-01T08:00:00Z",
  "payload": {"text": "I am moving on 20 October and want help planning."}
}
```

Plain text is stored with `source` `http_text`. JSON `payload` must be non-null. A `corrects_event_id` outside this customer is `422`.

Correction adds `corrects_event_id` or an assertion reference within `payload`; target must be in this customer. `received_at`, authoritative workspace, sequence and source revision are server-owned. Initial inline MIME types are JSON and plain text; raw binary uses upload endpoints.

Accepted response:

```json
{"event_id":"event_example","job_id":"job_example","status":"queued","source_revision":12}
```

An accepted source is not proof of successful extraction or brain update. Job results identify supported/unsupported processing, current brain version and unresolved evidence. Duplicate source identity with changed content returns conflict; append a correction instead of overwriting raw history.

## Files

Upload request contains filename, claimed MIME type and size. Server chooses object ID/key and returns method, signed URL, required content/generation headers and expiry. Caller uploads bytes directly to GCS, then completes by upload ID. A request-supplied bucket/URL/object key is never trusted. Finalization checks actual object generation/size/content signature and removes or quarantines rejected objects. Unsupported files remain inspectable as originals without claiming semantic extraction.

Signed downloads expire after five minutes and use attachment disposition. They are bearer URLs: do not log them, and disclosure can permit access until expiry even after application key revocation. Immediate hard revocation requires deleting/disabling the object generation; API authorization alone cannot retract an already issued URL. No automatic external URL fetching in the MVP.

## Brain and Query Results

`GET brain?version=N` returns a stored snapshot; absence selects latest. Return `customer_id`, `version`, `schema_version`, `source_watermark`, `current_source_revision`, `has_pending_sources`, `structured`, `documents` and evidence references. `tree` lists the folders and documents in display order; `documents` contains the canonical paths from [data](data.md#memory-contract). Responses carry `ETag`, `X-BOB-Brain-Version` and `X-BOB-Pending-Sources`. Never silently represent the latest committed brain as having incorporated queued input.

Query request: `{"question":"What moving help has this customer asked for?","wait_seconds":10}` (`Idempotency-Key` required). Acceptance returns `{job_id, status, brain_version}`, capturing the latest brain. On success, the job's result includes `question`, `answer`, `answerable`, `brain_version`, `source_watermark`, `cited_assertion_ids`, `evidence_event_ids`, `uncertainties` and `has_pending_sources`. Citations outside the captured brain are removed and disclosed as an uncertainty. No brain exists: reject `409 brain_not_ready`. It does not mutate memory or trigger delivery. Context/output bounds apply; query failures preserve memory.

Insight fields include `id`, customer, `kind`, candidate need/horizon, evidence basis, proposed action, explanation, uncertainties, brain/source versions, synthetic data label, cohort support when eligible, lifecycle and freshness. A displayed cohort rate is a count/rate in references, never a personalized probability. `no_action` and insufficient-support review reasons are available through jobs/reviews even when no insight is created.

Feedback body selects insight, `confirm | dismiss | correct`, optional text and scoped correction references. Confirmation acknowledges relevance, not permission for automatic finance actions. Invalidate affected insight/send eligibility in the acceptance transaction before Librarian finishes.

## Subscription Contract

```json
{
  "customer_scope": {"mode":"explicit","customer_ids":["customer_example"]},
  "schedule": {"frequency":"weekly","weekday":"monday","local_time":"09:00","timezone":"Europe/Brussels"},
  "webhook_url":"https://consumer.example.com/bob-insights"
}
```

`mode=all_active` requires a workspace-wide key; explicit IDs must be within current creator grants. Frequency is weekly initially. Timezone is a valid IANA name. Local time defaults to 09:00; omission of weekday defaults to Monday. The system stores the next UTC occurrence and uses architecture's missed-run/DST policy. Enabling requires verified destination and still-valid creator authority.

Create returns one signing secret once, subscription ID, state `pending_verification`, computed next run and challenge ID. Verify ownership by sending a non-secret random challenge with a short expiration; the consumer returns `{"challenge":"<same_value>"}`. Use the same SSRF-safe transport as delivery. Verification is asynchronous and retried within a short bounded window; failed destinations stay paused. Updating URL or rotating the secret requires re-verification and cancels incompatible frozen sends.

## Webhook Contract

Event body is frozen JSON UTF-8 with a stable `delivery_id`. Retries reuse exactly the body/delivery ID but a fresh signature timestamp. Initial event is `insight.created` per customer:

```json
{
  "schema_version": "1",
  "delivery_id": "delivery_example",
  "event_type": "insight.created",
  "occurred_at": "2026-10-05T07:00:00Z",
  "subscription_id": "subscription_example",
  "customer_id": "customer_example",
  "review_id": "review_example",
  "insight": {
    "id": "insight_example",
    "kind": "hypothesis_only",
    "candidate_need": "move_planning_help",
    "proposed_action": "SHOW_INFORMATION",
    "explanation": "The customer explicitly requested help planning a move.",
    "evidence_event_ids": ["event_example"],
    "brain_version": 3,
    "data_kind": "synthetic"
  }
}
```

Example IDs illustrate shapes, not real results. Public evidence IDs refer to this customer's API-accessible records; no cross-customer raw facts. Consumer needs its own valid API key to retrieve richer context; webhook possession does not grant API access.

Headers: `X-BOB-Delivery-Id`, `X-BOB-Timestamp` (Unix seconds), `X-BOB-Signature: v1=<hex>`. Signature is `HMAC-SHA256(signing_secret, timestamp + "." + exact_raw_body)`. Receiver checks timestamp within five minutes, uses constant-time comparison, then deduplicates delivery ID. Secrets are random per subscription, encrypted at rest; no API GET returns them.

Treat `2xx` as delivery accepted. Retry network/timeouts, `408`, `429`, and `5xx`, with capped exponential backoff/jitter (minimum one minute, maximum one hour) and at most eight attempts within 24 hours. Treat other `4xx` as terminal; `410` pauses the subscription. Do not follow `3xx`. Success may already have occurred when the sender sees a timeout: delivery is at least once, not exactly once. Recheck authorization, destination resolution and insight freshness before every attempt; cancelled/stale sends never retry. Receiver responses are metadata only, never instructions to the agents.

## Internal Handlers

Only IAM-authenticated scheduler/task identities can call `/internal/tick` or `/internal/jobs/{kind}`. The latter accepts only `{workspace_id, job_id}` and a closed kind allowlist. It loads canonical input from the database and validates job kind/state/scope. No arbitrary handler names, prompts, URLs, credentials, or customer lists are accepted from transport headers/body. Local drivers invoke the same handlers directly; disabling IAM on deployed worker is not a demo shortcut.
