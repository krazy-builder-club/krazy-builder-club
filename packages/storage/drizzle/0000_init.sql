CREATE TABLE "brain_snapshots" (
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"base_version" integer,
	"structured" jsonb NOT NULL,
	"documents" jsonb NOT NULL,
	"signature" jsonb NOT NULL,
	"source_watermark" integer NOT NULL,
	"model_version" text,
	"prompt_version" text,
	"schema_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_snapshots_workspace_id_customer_id_version_pk" PRIMARY KEY("workspace_id","customer_id","version"),
	CONSTRAINT "brain_snapshots_version_check" CHECK (version > 0)
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"generation" bigint,
	"filename" text NOT NULL,
	"claimed_mime" text NOT NULL,
	"detected_mime" text,
	"claimed_bytes" integer NOT NULL,
	"actual_bytes" integer,
	"sha256" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"extraction" jsonb,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "files_scope_unique" UNIQUE("workspace_id","customer_id","id"),
	CONSTRAINT "files_state_check" CHECK (state in ('pending', 'finalized', 'extracting', 'ready', 'unsupported', 'failed')),
	CONSTRAINT "files_generation_check" CHECK (state = 'pending' or generation is not null)
);
--> statement-breakpoint
CREATE TABLE "reference_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"brain_version" integer NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"evidence_available_at" timestamp with time zone NOT NULL,
	"horizon_days" integer NOT NULL,
	"followup_end_at" timestamp with time zone NOT NULL,
	"complete_at" timestamp with time zone,
	"observed_outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synthetic_reconstruction" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_cases_window_check" CHECK (evidence_available_at <= cutoff_at)
);
--> statement-breakpoint
CREATE TABLE "source_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb,
	"payload_text" text,
	"file_id" uuid,
	"payload_hash" text NOT NULL,
	"corrects_event_id" uuid,
	CONSTRAINT "source_events_identity_unique" UNIQUE("workspace_id","customer_id","source","source_event_id"),
	CONSTRAINT "source_events_sequence_unique" UNIQUE("workspace_id","customer_id","sequence"),
	CONSTRAINT "source_events_scope_unique" UNIQUE("workspace_id","customer_id","id"),
	CONSTRAINT "source_events_body_check" CHECK (num_nonnulls(payload, payload_text, file_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"workspace_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"destination_check" text,
	"status" text NOT NULL,
	"error_code" text,
	"response_code" integer,
	CONSTRAINT "delivery_attempts_delivery_id_attempt_pk" PRIMARY KEY("delivery_id","attempt")
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"brain_version" integer NOT NULL,
	"source_revision" integer NOT NULL,
	"review_id" uuid,
	"job_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"candidate_need" text,
	"horizon_days" integer,
	"action" text,
	"explanation" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cohort" jsonb,
	"uncertainties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lifecycle" text DEFAULT 'pending' NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insights_dedupe_unique" UNIQUE("workspace_id","dedupe_key"),
	CONSTRAINT "insights_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "insights_kind_check" CHECK (kind in ('cohort_supported', 'hypothesis_only', 'insufficient_cohort_support')),
	CONSTRAINT "insights_action_check" CHECK (action is null or action in ('ASK_A_QUESTION', 'SHOW_INFORMATION', 'PREPARE_ACTION', 'SCHEDULE_REMINDER', 'HAND_OFF', 'DO_NOTHING')),
	CONSTRAINT "insights_lifecycle_check" CHECK (lifecycle in ('pending', 'dismissed', 'superseded', 'stale'))
);
--> statement-breakpoint
CREATE TABLE "review_customers" (
	"workspace_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"captured_source_revision" integer NOT NULL,
	"captured_brain_version" integer,
	"job_id" uuid,
	"state" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	CONSTRAINT "review_customers_review_id_customer_id_pk" PRIMARY KEY("review_id","customer_id"),
	CONSTRAINT "review_customers_state_check" CHECK (state in ('pending', 'insight', 'no_action', 'stale', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "review_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"expected_count" integer DEFAULT 0 NOT NULL,
	"finished_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_occurrences_slot_unique" UNIQUE("subscription_id","scheduled_for"),
	CONSTRAINT "review_occurrences_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "review_occurrences_status_check" CHECK (status in ('running', 'completed', 'partial', 'skipped', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "subscription_customers" (
	"workspace_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	CONSTRAINT "subscription_customers_subscription_id_customer_id_pk" PRIMARY KEY("subscription_id","customer_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"creator_key_id" uuid NOT NULL,
	"scope_mode" text NOT NULL,
	"weekday" text DEFAULT 'monday' NOT NULL,
	"local_time" text DEFAULT '09:00' NOT NULL,
	"timezone" text NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'pending_verification' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"webhook_url" text NOT NULL,
	"verified_at" timestamp with time zone,
	"challenge_id" text,
	"challenge_expires_at" timestamp with time zone,
	"signing_key_ciphertext" text NOT NULL,
	"signing_key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "subscriptions_scope_check" CHECK (scope_mode in ('all_active', 'explicit')),
	CONSTRAINT "subscriptions_weekday_check" CHECK (weekday in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
	CONSTRAINT "subscriptions_state_check" CHECK (state in ('pending_verification', 'active', 'paused', 'disabled')),
	CONSTRAINT "subscriptions_https_check" CHECK (webhook_url like 'https://%')
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"insight_id" uuid NOT NULL,
	"event_type" text DEFAULT 'insight.created' NOT NULL,
	"payload_version" text DEFAULT '1' NOT NULL,
	"body" text NOT NULL,
	"body_sha256" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_once_unique" UNIQUE("subscription_id","insight_id","event_type"),
	CONSTRAINT "webhook_deliveries_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "webhook_deliveries_state_check" CHECK (state in ('pending', 'retry_wait', 'delivered', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "admission_windows" (
	"workspace_id" uuid NOT NULL,
	"key_id" uuid NOT NULL,
	"route_group" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "admission_windows_workspace_id_key_id_route_group_window_start_pk" PRIMARY KEY("workspace_id","key_id","route_group","window_start"),
	CONSTRAINT "admission_windows_group_check" CHECK (route_group in ('mutation', 'read', 'model'))
);
--> statement-breakpoint
CREATE TABLE "api_key_customers" (
	"workspace_id" uuid NOT NULL,
	"key_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	CONSTRAINT "api_key_customers_key_id_customer_id_pk" PRIMARY KEY("key_id","customer_id")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"capabilities" text[] NOT NULL,
	"all_customers" boolean NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_prefix_unique" UNIQUE("prefix"),
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash"),
	CONSTRAINT "api_keys_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "api_keys_capabilities_check" CHECK (capabilities <@ array['customers:write', 'sources:write', 'data:read', 'query:run', 'insights:read', 'feedback:write', 'evaluate:run', 'subscriptions:manage']::text[])
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"event_type" text NOT NULL,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_actor_check" CHECK (actor_type in ('api_key', 'operator', 'service'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"reference_eligible" boolean DEFAULT false NOT NULL,
	"source_revision" integer DEFAULT 0 NOT NULL,
	"current_brain_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_workspace_external_unique" UNIQUE("workspace_id","external_id"),
	CONSTRAINT "customers_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "customers_state_check" CHECK (state in ('active', 'deleting', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"workspace_id" uuid NOT NULL,
	"key_id" uuid NOT NULL,
	"route" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_records_workspace_id_key_id_route_idempotency_key_pk" PRIMARY KEY("workspace_id","key_id","route","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"data_kind" text DEFAULT 'synthetic' NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_data_kind_check" CHECK (data_kind in ('synthetic')),
	CONSTRAINT "workspaces_state_check" CHECK (state in ('active', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid,
	"kind" text NOT NULL,
	"operation_key" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" bigint DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_operation_unique" UNIQUE("workspace_id","operation_key"),
	CONSTRAINT "jobs_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "jobs_kind_check" CHECK (kind in ('librarian', 'extraction', 'upload_finalize', 'query', 'proactor', 'delivery', 'webhook_verification', 'customer_deletion')),
	CONSTRAINT "jobs_status_check" CHECK (status in ('queued', 'running', 'retry_wait', 'succeeded', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "model_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid,
	"job_id" uuid NOT NULL,
	"role" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"input_revisions" jsonb NOT NULL,
	"provider_request_id" text,
	"duration_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"usage" jsonb,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_runs_role_check" CHECK (role in ('librarian', 'librarian_query', 'proactor')),
	CONSTRAINT "model_runs_outcome_check" CHECK (outcome in ('succeeded', 'invalid_output', 'timeout', 'provider_error', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"queue" text NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"transport_name" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_job_generation_unique" UNIQUE("job_id","generation"),
	CONSTRAINT "outbox_queue_check" CHECK (queue in ('memory', 'analysis', 'delivery'))
);
--> statement-breakpoint
CREATE TABLE "usage_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"estimated_tokens" integer NOT NULL,
	"settled_tokens" integer,
	"cost_micros" bigint,
	"state" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "usage_reservations_state_check" CHECK (state in ('reserved', 'settled', 'released'))
);
--> statement-breakpoint
ALTER TABLE "brain_snapshots" ADD CONSTRAINT "brain_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_snapshots" ADD CONSTRAINT "brain_snapshots_workspace_id_customer_id_customers_workspace_id_id_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_customer_id_customers_workspace_id_id_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_cases" ADD CONSTRAINT "reference_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_cases" ADD CONSTRAINT "reference_cases_workspace_id_customer_id_brain_version_brain_snapshots_workspace_id_customer_id_version_fk" FOREIGN KEY ("workspace_id","customer_id","brain_version") REFERENCES "public"."brain_snapshots"("workspace_id","customer_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_workspace_id_customer_id_customers_workspace_id_id_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_workspace_id_customer_id_file_id_files_workspace_id_customer_id_id_fk" FOREIGN KEY ("workspace_id","customer_id","file_id") REFERENCES "public"."files"("workspace_id","customer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_workspace_id_customer_id_corrects_event_id_source_events_workspace_id_customer_id_id_fk" FOREIGN KEY ("workspace_id","customer_id","corrects_event_id") REFERENCES "public"."source_events"("workspace_id","customer_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_workspace_id_delivery_id_webhook_deliveries_workspace_id_id_fk" FOREIGN KEY ("workspace_id","delivery_id") REFERENCES "public"."webhook_deliveries"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_workspace_id_customer_id_customers_workspace_id_id_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_workspace_id_job_id_jobs_workspace_id_id_fk" FOREIGN KEY ("workspace_id","job_id") REFERENCES "public"."jobs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_customers" ADD CONSTRAINT "review_customers_workspace_id_review_id_review_occurrences_workspace_id_id_fk" FOREIGN KEY ("workspace_id","review_id") REFERENCES "public"."review_occurrences"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_customers" ADD CONSTRAINT "review_customers_workspace_id_customer_id_customers_workspace_id_id_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_customers" ADD CONSTRAINT "review_customers_workspace_id_job_id_jobs_workspace_id_id_fk" FOREIGN KEY ("workspace_id","job_id") REFERENCES "public"."jobs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_occurrences" ADD CONSTRAINT "review_occurrences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_occurrences" ADD CONSTRAINT "review_occurrences_workspace_id_subscription_id_subscriptions_workspace_id_id_fk" FOREIGN KEY ("workspace_id","subscription_id") REFERENCES "public"."subscriptions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_customers" ADD CONSTRAINT "subscription_customers_workspace_id_subscription_id_subscriptions_workspace_id_id_fk" FOREIGN KEY ("workspace_id","subscription_id") REFERENCES "public"."subscriptions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_customers" ADD CONSTRAINT "subscription_customers_workspace_id_customer_id_customers_workspace_id_id_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_creator_key_id_api_keys_workspace_id_id_fk" FOREIGN KEY ("workspace_id","creator_key_id") REFERENCES "public"."api_keys"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_subscription_id_subscriptions_workspace_id_id_fk" FOREIGN KEY ("workspace_id","subscription_id") REFERENCES "public"."subscriptions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_insight_id_insights_workspace_id_id_fk" FOREIGN KEY ("workspace_id","insight_id") REFERENCES "public"."insights"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_windows" ADD CONSTRAINT "admission_windows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_customers" ADD CONSTRAINT "api_key_customers_workspace_id_key_id_api_keys_workspace_id_id_fk" FOREIGN KEY ("workspace_id","key_id") REFERENCES "public"."api_keys"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_customers" ADD CONSTRAINT "api_key_customers_workspace_id_customer_id_customers_workspace_id_id_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_workspace_id_key_id_api_keys_workspace_id_id_fk" FOREIGN KEY ("workspace_id","key_id") REFERENCES "public"."api_keys"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_customer_id_customers_workspace_id_id_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_workspace_id_job_id_jobs_workspace_id_id_fk" FOREIGN KEY ("workspace_id","job_id") REFERENCES "public"."jobs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_workspace_id_job_id_jobs_workspace_id_id_fk" FOREIGN KEY ("workspace_id","job_id") REFERENCES "public"."jobs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_reservations" ADD CONSTRAINT "usage_reservations_workspace_id_job_id_jobs_workspace_id_id_fk" FOREIGN KEY ("workspace_id","job_id") REFERENCES "public"."jobs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reference_cases_cutoff_idx" ON "reference_cases" USING btree ("workspace_id","cutoff_at","complete_at");--> statement-breakpoint
CREATE INDEX "insights_customer_idx" ON "insights" USING btree ("workspace_id","customer_id","lifecycle","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_due_idx" ON "subscriptions" USING btree ("active","next_run_at");--> statement-breakpoint
CREATE INDEX "audit_events_workspace_time_idx" ON "audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "jobs_customer_idx" ON "jobs" USING btree ("workspace_id","customer_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("dispatched_at","next_attempt_at");