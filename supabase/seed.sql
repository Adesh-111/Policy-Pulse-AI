-- Idempotent local/demo seed. This does not create Auth users or Storage objects.
-- Upload the files in sample-policies through the application to exercise the
-- full validation/ingestion path; fixturePath metadata identifies each source.

insert into public.organizations (id, name, slug, is_active)
values (
  '10000000-0000-4000-8000-000000000001',
  'Northbridge College',
  'northbridge-college',
  true
)
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    is_active = excluded.is_active;

insert into public.departments (id, organization_id, code, name, description)
values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ADMIN', 'Administration', 'Institutional administration and governance'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'ACAD', 'Academic Affairs', 'Curriculum, teaching quality, and academic advising'),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'EXAM', 'Examination Office', 'Assessment administration and results'),
  ('a0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'STUAFF', 'Student Affairs', 'Student services, activities, and welfare'),
  ('a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'ITDPO', 'IT and Data Protection', 'Technology operations, security, privacy, and records'),
  ('a0000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'PLACE', 'Career Development Centre', 'Placements, employer engagement, and career services'),
  ('a0000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'HR', 'Human Resources', 'Faculty and staff administration')
on conflict (organization_id, code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true;

insert into public.settings (organization_id, key, value, description, is_client_visible)
values
  ('10000000-0000-4000-8000-000000000001', 'ingestion.chunk_size', '800', 'Default policy chunk size in tokens', false),
  ('10000000-0000-4000-8000-000000000001', 'ingestion.chunk_overlap', '120', 'Default adjacent chunk overlap in tokens', false),
  ('10000000-0000-4000-8000-000000000001', 'workflow.quality_threshold', '0.80', 'Automatic quality-review pass threshold', false),
  ('10000000-0000-4000-8000-000000000001', 'workflow.max_automatic_revisions', '2', 'Maximum automatic revisions before human review', false),
  ('10000000-0000-4000-8000-000000000001', 'retrieval.default_limit', '12', 'Default number of hybrid retrieval results', true),
  ('10000000-0000-4000-8000-000000000001', 'upload.maximum_bytes', '20971520', 'Maximum accepted policy upload size', false)
on conflict (organization_id, key) do update
set value = excluded.value,
    description = excluded.description,
    is_client_visible = excluded.is_client_visible;

insert into public.documents (
  id, organization_id, department_id, title, description, category, version,
  designation, effective_date, original_filename, mime_type, file_extension,
  file_size_bytes, storage_path, processing_status, metadata
)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'Attendance and Academic Participation Policy', 'Previous attendance standard', 'Attendance', '1.4', 'old', '2024-07-01', 'attendance-policy-old.md', 'text/markdown', 'md', 4096, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/attendance-policy-old.md', 'uploaded', '{"fixturePath":"sample-policies/attendance-policy-old.md","seedOnly":true}'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Attendance and Academic Participation Policy', 'Revised attendance standard', 'Attendance', '2.0', 'new', '2026-07-01', 'attendance-policy-new.md', 'text/markdown', 'md', 4600, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002/attendance-policy-new.md', 'uploaded', '{"fixturePath":"sample-policies/attendance-policy-new.md","seedOnly":true}'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'Examination Administration Policy', 'Previous examination operations policy', 'Examinations', '3.2', 'old', '2024-01-01', 'examinations-policy-old.md', 'text/markdown', 'md', 3900, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000003/examinations-policy-old.md', 'uploaded', '{"fixturePath":"sample-policies/examinations-policy-old.md","seedOnly":true}'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'Examination Administration Policy', 'Revised examination operations policy', 'Examinations', '4.0', 'new', '2026-01-01', 'examinations-policy-new.md', 'text/markdown', 'md', 4500, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000004/examinations-policy-new.md', 'uploaded', '{"fixturePath":"sample-policies/examinations-policy-new.md","seedOnly":true}'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Student Use of Artificial Intelligence Policy', 'Previous prohibition-based AI policy', 'Artificial Intelligence', '1.0', 'old', '2024-08-01', 'student-ai-usage-policy-old.md', 'text/markdown', 'md', 3000, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005/student-ai-usage-policy-old.md', 'uploaded', '{"fixturePath":"sample-policies/student-ai-usage-policy-old.md","seedOnly":true}'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Responsible Student Use of Generative AI Policy', 'Conditional-use AI policy', 'Artificial Intelligence', '2.0', 'new', '2026-08-01', 'student-ai-usage-policy-new.md', 'text/markdown', 'md', 3600, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000006/student-ai-usage-policy-new.md', 'uploaded', '{"fixturePath":"sample-policies/student-ai-usage-policy-new.md","seedOnly":true}'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'Student and Staff Data Privacy Policy', 'Previous privacy and retention policy', 'Data Privacy', '2.1', 'old', '2023-04-01', 'data-privacy-policy-old.md', 'text/markdown', 'md', 3300, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000007/data-privacy-policy-old.md', 'uploaded', '{"fixturePath":"sample-policies/data-privacy-policy-old.md","seedOnly":true}'),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'Privacy, Records, and Data Stewardship Policy', 'Revised privacy, records, and stewardship policy', 'Data Privacy', '3.0', 'new', '2026-04-01', 'data-privacy-policy-new.md', 'text/markdown', 'md', 4100, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000008/data-privacy-policy-new.md', 'uploaded', '{"fixturePath":"sample-policies/data-privacy-policy-new.md","seedOnly":true}'),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'Campus Placement Eligibility Policy', 'Previous placement eligibility standard', 'Placement', '1.3', 'old', '2024-06-01', 'placement-eligibility-policy-old.md', 'text/markdown', 'md', 2800, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000009/placement-eligibility-policy-old.md', 'uploaded', '{"fixturePath":"sample-policies/placement-eligibility-policy-old.md","seedOnly":true}'),
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'Campus Placement Eligibility and Fair Access Policy', 'Revised placement eligibility standard', 'Placement', '2.0', 'new', '2026-06-01', 'placement-eligibility-policy-new.md', 'text/markdown', 'md', 3500, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-00000000000a/placement-eligibility-policy-new.md', 'uploaded', '{"fixturePath":"sample-policies/placement-eligibility-policy-new.md","seedOnly":true}'),
  ('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Faculty Academic Responsibilities Policy', 'Previous faculty responsibilities policy', 'Faculty', '2.5', 'old', '2024-07-01', 'faculty-responsibilities-policy-old.md', 'text/markdown', 'md', 3100, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-00000000000b/faculty-responsibilities-policy-old.md', 'uploaded', '{"fixturePath":"sample-policies/faculty-responsibilities-policy-old.md","seedOnly":true}'),
  ('20000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Faculty Academic and Compliance Responsibilities Policy', 'Revised faculty responsibilities policy', 'Faculty', '3.0', 'new', '2026-07-01', 'faculty-responsibilities-policy-new.md', 'text/markdown', 'md', 3900, '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-00000000000c/faculty-responsibilities-policy-new.md', 'uploaded', '{"fixturePath":"sample-policies/faculty-responsibilities-policy-new.md","seedOnly":true}')
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    category = excluded.category,
    version = excluded.version,
    designation = excluded.designation,
    effective_date = excluded.effective_date,
    metadata = excluded.metadata;

insert into public.document_departments (document_id, department_id, organization_id)
values
  ('20000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001')
on conflict (document_id, department_id) do nothing;

insert into public.policy_comparisons (
  id, organization_id, old_document_id, new_document_id, title, status
)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Attendance policy 1.4 to 2.0', 'draft'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004', 'Examination policy 3.2 to 4.0', 'draft'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000006', 'Student AI policy 1.0 to 2.0', 'draft'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000008', 'Privacy policy 2.1 to 3.0', 'draft'),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-00000000000a', 'Placement policy 1.3 to 2.0', 'draft'),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-00000000000c', 'Faculty responsibilities 2.5 to 3.0', 'draft')
on conflict (id) do update
set title = excluded.title,
    old_document_id = excluded.old_document_id,
    new_document_id = excluded.new_document_id;

insert into public.evaluation_questions (
  organization_id, external_id, question, expected_answer, category,
  expected_sources, expected_change_types, expected_risk, difficulty, tags
)
values
  ('10000000-0000-4000-8000-000000000001', 'eval-001', 'What is the new minimum attendance requirement and what did it replace?', 'The new policy requires 80% attendance in each course, replacing 75% in each course.', 'change_detection', '[{"file":"attendance-policy-old.md","section":"2. Minimum attendance"},{"file":"attendance-policy-new.md","section":"2. Minimum attendance"}]', array['modified'::public.change_type], 'high', 'easy', array['attendance','threshold']),
  ('10000000-0000-4000-8000-000000000001', 'eval-002', 'How did medical attendance condonation change?', 'The cap fell from 10 points to five, the deadline moved from seven calendar days to three business days, and a review panel replaced the Head of Department as decision maker.', 'change_detection', '[{"file":"attendance-policy-old.md","section":"3. Medical condonation"},{"file":"attendance-policy-new.md","section":"3. Medical and disability-related exemption"}]', array['modified'::public.change_type,'deadline_change'::public.change_type,'responsibility_change'::public.change_type], 'high', 'medium', array['attendance','medical']),
  ('10000000-0000-4000-8000-000000000001', 'eval-003', 'What attendance level does the new policy require for laboratory and clinical courses?', 'It requires 85%, unless a statutory council requires more.', 'change_detection', '[{"file":"attendance-policy-new.md","section":"2. Minimum attendance"}]', array['added'::public.change_type], 'medium', 'easy', array['attendance','laboratory']),
  ('10000000-0000-4000-8000-000000000001', 'eval-004', 'Which units gained new responsibilities under the attendance revision?', 'Academic Affairs operates monitoring, advisors document intervention, and the Medical and Accessibility Review Panel decides exemptions.', 'department_impact', '[{"file":"attendance-policy-new.md","section":"6. Responsibility"}]', array['responsibility_change'::public.change_type], 'medium', 'medium', array['attendance','departments']),
  ('10000000-0000-4000-8000-000000000001', 'eval-005', 'How quickly must marks be submitted under the new examination policy?', 'Departments must submit approved marks within five calendar days after the examination, replacing ten calendar days.', 'change_detection', '[{"file":"examinations-policy-old.md","section":"5. Mark submission"},{"file":"examinations-policy-new.md","section":"5. Mark submission"}]', array['deadline_change'::public.change_type,'responsibility_change'::public.change_type], 'high', 'easy', array['examinations','deadline']),
  ('10000000-0000-4000-8000-000000000001', 'eval-006', 'What changed for question-paper submission?', 'The deadline changed from ten business days to fifteen calendar days, using a secure portal with department moderation, metadata, and accessibility checks.', 'change_detection', '[{"file":"examinations-policy-old.md","section":"2. Question papers"},{"file":"examinations-policy-new.md","section":"2. Question papers"}]', array['deadline_change'::public.change_type,'responsibility_change'::public.change_type,'compliance_requirement'::public.change_type], 'high', 'medium', array['examinations','security']),
  ('10000000-0000-4000-8000-000000000001', 'eval-007', 'How long are examination records retained under the new policy?', 'Seven years after result publication, replacing five years.', 'change_detection', '[{"file":"examinations-policy-old.md","section":"7. Results and corrections"},{"file":"examinations-policy-new.md","section":"7. Results, corrections, and retention"}]', array['modified'::public.change_type], 'medium', 'easy', array['examinations','retention']),
  ('10000000-0000-4000-8000-000000000001', 'eval-008', 'May students use generative AI in a graded assignment under the new student AI policy?', 'Only when the assessment brief expressly permits it and defines allowed functions; silence and independent assessments mean prohibited.', 'change_detection', '[{"file":"student-ai-usage-policy-new.md","section":"1. Permission model"}]', array['exception_added'::public.change_type,'modified'::public.change_type], 'high', 'easy', array['ai','students']),
  ('10000000-0000-4000-8000-000000000001', 'eval-009', 'What disclosure is required when student AI use is permitted?', 'The student names the tool, date, purpose, and influence and retains material prompts and outputs through the appeal period.', 'compliance_requirement', '[{"file":"student-ai-usage-policy-new.md","section":"2. Disclosure and evidence"}]', array['compliance_requirement'::public.change_type,'added'::public.change_type], 'medium', 'medium', array['ai','disclosure']),
  ('10000000-0000-4000-8000-000000000001', 'eval-010', 'Do the new student AI and faculty responsibility policies agree about AI-assisted graded work?', 'No. The student policy conditionally permits it while the faculty policy requires every graded assignment to prohibit generated content.', 'conflict_detection', '[{"file":"student-ai-usage-policy-new.md","section":"1. Permission model"},{"file":"faculty-responsibilities-policy-new.md","section":"4. Artificial intelligence in graded work"}]', array[]::public.change_type[], 'critical', 'hard', array['ai','conflict']),
  ('10000000-0000-4000-8000-000000000001', 'eval-011', 'What student-record retention period changed in the privacy policy?', 'Routine records moved from a general five-year period to three years after the last active relationship, with separate permanent and seven-year categories.', 'change_detection', '[{"file":"data-privacy-policy-old.md","section":"4. Retention"},{"file":"data-privacy-policy-new.md","section":"4. Retention schedule"}]', array['modified'::public.change_type], 'high', 'medium', array['privacy','retention']),
  ('10000000-0000-4000-8000-000000000001', 'eval-012', 'What is the new deadline for reporting a suspected data incident?', 'Within 24 hours of discovery to the service desk and Data Protection Office.', 'change_detection', '[{"file":"data-privacy-policy-new.md","section":"5. Incident response"}]', array['deadline_change'::public.change_type,'responsibility_change'::public.change_type], 'high', 'easy', array['privacy','incident']),
  ('10000000-0000-4000-8000-000000000001', 'eval-013', 'What must each department do under the new privacy policy?', 'Appoint a data steward to maintain an inventory, review access quarterly, coordinate deletion, and support rights-request searches.', 'department_impact', '[{"file":"data-privacy-policy-new.md","section":"2. Distributed responsibility"},{"file":"data-privacy-policy-new.md","section":"6. Individual rights requests"}]', array['responsibility_change'::public.change_type,'compliance_requirement'::public.change_type], 'high', 'medium', array['privacy','departments']),
  ('10000000-0000-4000-8000-000000000001', 'eval-014', 'How did the baseline placement CGPA requirement change?', 'It rose from 6.5 to 7.0 on a ten-point scale.', 'change_detection', '[{"file":"placement-eligibility-policy-old.md","section":"1. Baseline eligibility"},{"file":"placement-eligibility-policy-new.md","section":"1. Baseline eligibility"}]', array['eligibility_change'::public.change_type], 'high', 'easy', array['placement','cgpa']),
  ('10000000-0000-4000-8000-000000000001', 'eval-015', 'Did the backlog rule become stricter or more permissive in the new placement policy?', 'More permissive: it moved from no active backlog to one, though employers may be stricter.', 'change_detection', '[{"file":"placement-eligibility-policy-old.md","section":"1. Baseline eligibility"},{"file":"placement-eligibility-policy-new.md","section":"1. Baseline eligibility"}]', array['eligibility_change'::public.change_type,'exception_added'::public.change_type], 'medium', 'medium', array['placement','backlog']),
  ('10000000-0000-4000-8000-000000000001', 'eval-016', 'Is the placement attendance requirement consistent with the new general attendance policy?', 'No. Placement uses 75% per course while the attendance policy requires 80%, or 85% for laboratory and clinical courses.', 'conflict_detection', '[{"file":"placement-eligibility-policy-new.md","section":"1. Baseline eligibility"},{"file":"attendance-policy-new.md","section":"2. Minimum attendance"}]', array[]::public.change_type[], 'critical', 'hard', array['placement','attendance','conflict']),
  ('10000000-0000-4000-8000-000000000001', 'eval-017', 'When must faculty publish course and assessment information under the new policy?', 'Within five business days after classes begin, replacing ten business days.', 'change_detection', '[{"file":"faculty-responsibilities-policy-old.md","section":"1. Course preparation"},{"file":"faculty-responsibilities-policy-new.md","section":"1. Course preparation"}]', array['deadline_change'::public.change_type], 'medium', 'easy', array['faculty','deadline']),
  ('10000000-0000-4000-8000-000000000001', 'eval-018', 'How did the coursework feedback deadline change for faculty?', 'It shortened from 15 business days to 10 business days, with a recorded cohort-wide extension.', 'change_detection', '[{"file":"faculty-responsibilities-policy-old.md","section":"3. Assessment and feedback"},{"file":"faculty-responsibilities-policy-new.md","section":"3. Assessment and feedback"}]', array['deadline_change'::public.change_type,'exception_added'::public.change_type], 'medium', 'easy', array['faculty','feedback']),
  ('10000000-0000-4000-8000-000000000001', 'eval-019', 'How do the new faculty and examination mark deadlines fit together?', 'Faculty submit to the department in four calendar days so it can validate and meet the five-calendar-day institutional deadline.', 'cross_policy_alignment', '[{"file":"faculty-responsibilities-policy-new.md","section":"5. Examination duties"},{"file":"examinations-policy-new.md","section":"5. Mark submission"}]', array['deadline_change'::public.change_type,'responsibility_change'::public.change_type], 'high', 'hard', array['faculty','examinations']),
  ('10000000-0000-4000-8000-000000000001', 'eval-020', 'Which bundled policy conflicts should be treated as critical?', 'The student-versus-faculty AI permission conflict and the placement 75% versus attendance 80%/85% threshold conflict.', 'risk_assessment', '[{"file":"student-ai-usage-policy-new.md","section":"1. Permission model"},{"file":"faculty-responsibilities-policy-new.md","section":"4. Artificial intelligence in graded work"},{"file":"placement-eligibility-policy-new.md","section":"1. Baseline eligibility"},{"file":"attendance-policy-new.md","section":"2. Minimum attendance"}]', array[]::public.change_type[], 'critical', 'hard', array['conflict','risk']),
  ('10000000-0000-4000-8000-000000000001', 'eval-021', 'What is the cafeteria refund policy for unused meal credits?', 'I could not find sufficient evidence in the uploaded policies.', 'insufficient_evidence', '[]', array[]::public.change_type[], null, 'easy', array['insufficient-evidence']),
  ('10000000-0000-4000-8000-000000000001', 'eval-022', 'Who may reopen a locked mark sheet under the old and new policies?', 'The old policy allowed only the Controller; the new policy requires the Head of Department and Controller together.', 'citation_correctness', '[{"file":"examinations-policy-old.md","section":"5. Mark submission"},{"file":"examinations-policy-new.md","section":"5. Mark submission"}]', array['responsibility_change'::public.change_type,'compliance_requirement'::public.change_type], 'medium', 'medium', array['examinations','approval']),
  ('10000000-0000-4000-8000-000000000001', 'eval-023', 'What should the Examination Office change before implementing the new policies?', 'Use the central eligibility list, secure paper portal, second mark validation, standing accommodations, two-person reopening, and seven-year retention.', 'department_impact', '[{"file":"examinations-policy-new.md","section":"3. Candidate eligibility"},{"file":"examinations-policy-new.md","section":"5. Mark submission"},{"file":"examinations-policy-new.md","section":"7. Results, corrections, and retention"}]', array['responsibility_change'::public.change_type,'compliance_requirement'::public.change_type,'deadline_change'::public.change_type], 'high', 'hard', array['examinations','action-plan']),
  ('10000000-0000-4000-8000-000000000001', 'eval-024', 'Are the new privacy and examination policies aligned on examination-record retention?', 'Yes. Both use seven years after results and both preserve records under applicable holds.', 'cross_policy_alignment', '[{"file":"data-privacy-policy-new.md","section":"4. Retention schedule"},{"file":"examinations-policy-new.md","section":"7. Results, corrections, and retention"}]', array[]::public.change_type[], 'low', 'medium', array['privacy','examinations','retention'])
on conflict (organization_id, suite_version, external_id) do update
set question = excluded.question,
    expected_answer = excluded.expected_answer,
    category = excluded.category,
    expected_sources = excluded.expected_sources,
    expected_change_types = excluded.expected_change_types,
    expected_risk = excluded.expected_risk,
    difficulty = excluded.difficulty,
    tags = excluded.tags,
    is_active = true;
