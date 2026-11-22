-- RLS test for admin-only delete. Paste into the Supabase SQL Editor and run once.
--
-- It inserts sentinel rows, then tries SELECT / UPDATE / DELETE as:
--   anonymous, a signed-in user who is NOT in `admins`, and a real admin
-- and finally ends with a deliberate error whose message is the report. The
-- error rolls the whole thing back, so nothing is left behind. (The inserts
-- fire the notification webhook trigger, but pg_net queues requests inside the
-- transaction, so the rollback discards them. If you do get a notification
-- email for "RLS TEST", that's why; ignore it.)
--
-- Expected: every line starts with PASS. Requires at least one row in `admins`.

create or replace function pg_temp.attempt(actor_role text, actor_uid uuid, sql_text text)
returns text language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', actor_uid, 'role', actor_role)::text, true);
  execute format('set local role %I', actor_role);
  begin
    execute sql_text;
    get diagnostics n = row_count;
    reset role;
    return n || ' row(s)';
  exception when insufficient_privilege then
    reset role;
    return 'permission denied';
  end;
end $$;

do $$
declare
  rpt text := '';
  admin_uid uuid;
  nobody uuid := gen_random_uuid();   -- a signed-in user who is not an admin
  s uuid;
  h uuid;
  got text;
  actor record;
begin
  select user_id into admin_uid from admins limit 1;
  if admin_uid is null then
    raise exception 'No row in admins: add yourself first (see README step 6).';
  end if;

  insert into job_seekers (name, linkedin_url, location)
    values ('RLS TEST seeker', 'https://example.com', 'nowhere') returning id into s;
  insert into hiring_contacts (name, email, jd_url)
    values ('RLS TEST hiring', 'rls-test@example.com', 'https://example.com') returning id into h;
  insert into rating_tokens (job_seeker_id, rating_value) values (s, 3);

  -- Anonymous and non-admin: everything must be refused (0 rows or permission denied).
  for actor in
    select 'anon' as label, 'anon' as r, null::uuid as u
    union all select 'signed-in non-admin', 'authenticated', nobody
  loop
    foreach got in array array[
      pg_temp.attempt(actor.r, actor.u, format('select 1 from job_seekers where id = %L', s)),
      pg_temp.attempt(actor.r, actor.u, format('update job_seekers set admin_notes = ''x'' where id = %L', s)),
      pg_temp.attempt(actor.r, actor.u, format('delete from job_seekers where id = %L', s)),
      pg_temp.attempt(actor.r, actor.u, format('select 1 from hiring_contacts where id = %L', h)),
      pg_temp.attempt(actor.r, actor.u, format('update hiring_contacts set admin_notes = ''x'' where id = %L', h)),
      pg_temp.attempt(actor.r, actor.u, format('delete from hiring_contacts where id = %L', h))
    ] loop
      rpt := rpt || format(E'%s  %-22s %s\n',
        case when got in ('0 row(s)', 'permission denied') then 'PASS' else 'FAIL' end,
        actor.label, got);
    end loop;
  end loop;

  rpt := rpt || format(E'%s  rows still exist after refused deletes: %s\n',
    case when exists (select 1 from job_seekers where id = s)
          and exists (select 1 from hiring_contacts where id = h) then 'PASS' else 'FAIL' end,
    'job_seekers + hiring_contacts');

  -- Admin: delete must work on both tables.
  got := pg_temp.attempt('authenticated', admin_uid, format('delete from job_seekers where id = %L', s));
  rpt := rpt || format(E'%s  %-22s delete job_seekers -> %s\n',
    case when got = '1 row(s)' then 'PASS' else 'FAIL' end, 'admin', got);
  got := pg_temp.attempt('authenticated', admin_uid, format('delete from hiring_contacts where id = %L', h));
  rpt := rpt || format(E'%s  %-22s delete hiring_contacts -> %s\n',
    case when got = '1 row(s)' then 'PASS' else 'FAIL' end, 'admin', got);

  rpt := rpt || format(E'%s  rating_tokens cascaded when the seeker was deleted\n',
    case when not exists (select 1 from rating_tokens where job_seeker_id = s) then 'PASS' else 'FAIL' end);

  raise exception E'RLS test report (this error is intentional; it rolls everything back):\n\n%', rpt;
end $$;
