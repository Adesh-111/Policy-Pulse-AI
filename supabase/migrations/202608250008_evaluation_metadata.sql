-- Version every persisted evaluation observation so results remain comparable
-- after prompts, metrics, or the bundled dataset evolve.

alter table public.evaluation_results
  add column if not exists run_id uuid,
  add column if not exists dataset_version text not null default '1.0.0',
  add column if not exists metric_version text not null default '1.0.0',
  add column if not exists prompt_version text not null default '1.0.0',
  add column if not exists model text,
  add column if not exists trace_id text,
  add column if not exists total_tokens integer generated always as (input_tokens + output_tokens) stored;

alter table public.evaluation_results
  add constraint evaluation_results_dataset_version_check
    check (char_length(btrim(dataset_version)) between 1 and 40) not valid,
  add constraint evaluation_results_metric_version_check
    check (char_length(btrim(metric_version)) between 1 and 40) not valid,
  add constraint evaluation_results_prompt_version_check
    check (char_length(btrim(prompt_version)) between 1 and 40) not valid,
  add constraint evaluation_results_total_tokens_check
    check (total_tokens >= 0) not valid;

alter table public.evaluation_results
  validate constraint evaluation_results_dataset_version_check;
alter table public.evaluation_results
  validate constraint evaluation_results_metric_version_check;
alter table public.evaluation_results
  validate constraint evaluation_results_prompt_version_check;
alter table public.evaluation_results
  validate constraint evaluation_results_total_tokens_check;

create index if not exists evaluation_results_run_idx
  on public.evaluation_results (organization_id, run_id, variant, created_at desc);

create index if not exists evaluation_results_label_idx
  on public.evaluation_results (organization_id, run_label, created_at desc);
