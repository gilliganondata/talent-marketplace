-- Aligns job_seekers.work_preference with the options on the seeker form.
--
-- Older copies of schema.sql allowed remote_only / prefers_remote /
-- open_to_relocation / local_only, which rejects the current form's
-- remote_or_local and open_to_anything values. Safe to re-run. Instances whose
-- constraint already matches (the original instance) can skip it or run it
-- harmlessly.
--
-- NOT VALID: only new writes are checked, so existing rows holding an old value
-- (e.g. prefers_remote) don't make this migration fail. Re-map any such rows,
-- then run `alter table job_seekers validate constraint
-- job_seekers_work_preference_check;` if you want the whole table checked.

alter table job_seekers drop constraint if exists job_seekers_work_preference_check;

alter table job_seekers add constraint job_seekers_work_preference_check
  check (work_preference in (
    'remote_only', 'remote_or_local', 'open_to_relocation', 'open_to_anything', 'local_only'
  )) not valid;
