-- PolicyPulse AI foundational PostgreSQL extensions and domain types.
-- Keep extension-owned objects outside public so application schemas remain tidy.

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create type public.app_role as enum (
  'administrator',
  'policy_manager',
  'department_user',
  'auditor'
);

create type public.membership_status as enum (
  'invited',
  'active',
  'suspended'
);

create type public.document_designation as enum (
  'old',
  'new',
  'reference'
);

create type public.document_processing_status as enum (
  'uploaded',
  'extracting',
  'chunking',
  'embedding',
  'indexed',
  'failed'
);

create type public.comparison_status as enum (
  'draft',
  'queued',
  'processing',
  'quality_review',
  'awaiting_approval',
  'revision_requested',
  'approved',
  'rejected',
  'completed',
  'failed',
  'cancelled'
);

create type public.change_type as enum (
  'added',
  'removed',
  'modified',
  'deadline_change',
  'responsibility_change',
  'eligibility_change',
  'exception_added',
  'exception_removed',
  'compliance_requirement',
  'ambiguous_language',
  'implementation_gap'
);

create type public.risk_level as enum (
  'low',
  'medium',
  'high',
  'critical'
);

create type public.finding_status as enum (
  'open',
  'accepted',
  'dismissed',
  'resolved'
);

create type public.action_status as enum (
  'not_started',
  'in_progress',
  'blocked',
  'completed',
  'cancelled'
);

create type public.workflow_status as enum (
  'pending',
  'running',
  'paused',
  'awaiting_approval',
  'retry_scheduled',
  'completed',
  'failed',
  'cancelled'
);

create type public.job_status as enum (
  'queued',
  'running',
  'retry_scheduled',
  'completed',
  'failed',
  'cancelled'
);

create type public.approval_status as enum (
  'pending',
  'approved',
  'rejected',
  'revision_requested',
  'cancelled'
);

create type public.approval_decision_type as enum (
  'approved',
  'rejected',
  'revision_requested'
);

create type public.chat_message_role as enum (
  'user',
  'assistant',
  'system',
  'tool'
);

create type public.evaluation_variant as enum (
  'openai_without_rag',
  'openai_with_rag',
  'rag_agents_reflection'
);

create type public.operation_status as enum (
  'started',
  'succeeded',
  'failed',
  'cancelled'
);

create type public.report_format as enum (
  'markdown',
  'pdf',
  'html'
);
