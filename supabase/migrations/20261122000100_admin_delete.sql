-- Permanent delete from the admin view.
--
-- 1. DELETE policies on job_seekers and hiring_contacts, admin only, using the
--    same is_admin() check as the existing SELECT/UPDATE policies. There is no
--    policy for any other role, so anonymous and non-admin users are refused.
-- 2. rating_tokens.job_seeker_id must cascade, so deleting a job seeker also
--    removes their rating links (a deleted person's link then reads as unknown).
--
-- Safe to re-run.

drop policy if exists "admins can delete job seekers" on job_seekers;
create policy "admins can delete job seekers" on job_seekers
  for delete using (is_admin());

drop policy if exists "admins can delete hiring contacts" on hiring_contacts;
create policy "admins can delete hiring contacts" on hiring_contacts
  for delete using (is_admin());

alter table rating_tokens drop constraint if exists rating_tokens_job_seeker_id_fkey;
alter table rating_tokens add constraint rating_tokens_job_seeker_id_fkey
  foreign key (job_seeker_id) references job_seekers(id) on delete cascade;
