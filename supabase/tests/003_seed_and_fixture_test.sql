begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

select is(
  (select count(*)::integer from public.departments where organization_id = '10000000-0000-4000-8000-000000000001'),
  7,
  'seed creates seven realistic departments'
);
select is(
  (select count(*)::integer from public.documents where organization_id = '10000000-0000-4000-8000-000000000001'),
  12,
  'seed creates six old/new document pairs'
);
select is(
  (select count(*)::integer from public.policy_comparisons where organization_id = '10000000-0000-4000-8000-000000000001'),
  6,
  'seed creates six comparison records'
);
select ok(
  (select count(*) from public.evaluation_questions where organization_id = '10000000-0000-4000-8000-000000000001') >= 20,
  'seed contains at least twenty evaluation questions'
);
select ok(
  exists (
    select 1 from public.evaluation_questions
    where external_id = 'eval-010' and expected_risk = 'critical'
  ),
  'AI policy contradiction is represented in ground truth'
);
select ok(
  exists (
    select 1 from public.evaluation_questions
    where external_id = 'eval-021'
      and expected_answer = 'I could not find sufficient evidence in the uploaded policies.'
  ),
  'insufficient-evidence behavior has an exact evaluation case'
);

select * from finish();
rollback;
