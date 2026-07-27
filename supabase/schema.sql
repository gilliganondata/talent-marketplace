-- Extension needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ── Tables ──────────────────────────────────────────────

create table admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id),
  created_at timestamptz not null default now()
);

create table job_seekers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  linkedin_url text not null,
  location text not null,
  work_preference text check (work_preference in ('remote_only','prefers_remote','open_to_relocation','local_only')),
  relationship_note text,
  notes text,
  submitted_at timestamptz not null default now(),
  rating smallint check (rating between 1 and 5),
  admin_notes text,
  status text not null default 'active' check (status in ('active','archived')),
  helped_facilitate boolean not null default false,
  closed_at timestamptz
);

create table hiring_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  jd_url text not null,
  notes text,
  submitted_at timestamptz not null default now(),
  admin_notes text,
  status text not null default 'active' check (status in ('active','archived')),
  helped_facilitate boolean not null default false,
  closed_at timestamptz
);

create table rating_tokens (
  token uuid primary key default gen_random_uuid(),
  job_seeker_id uuid not null references job_seekers(id) on delete cascade,
  rating_value smallint not null check (rating_value between 1 and 5),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz
);

-- ── Row Level Security ──────────────────────────────────

alter table job_seekers enable row level security;
alter table hiring_contacts enable row level security;
alter table admins enable row level security;
alter table rating_tokens enable row level security;

create or replace function is_admin() returns boolean as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$ language sql security definer stable;

create policy "admins can read job seekers" on job_seekers
  for select using (is_admin());
create policy "admins can update job seekers" on job_seekers
  for update using (is_admin());

create policy "admins can read hiring contacts" on hiring_contacts
  for select using (is_admin());
create policy "admins can update hiring contacts" on hiring_contacts
  for update using (is_admin());

create policy "admins can read admins" on admins
  for select using (is_admin());

-- No policies at all for the public role on job_seekers/hiring_contacts —
-- intentional. Public submissions only happen through the functions below.
-- rating_tokens has no client-facing policy either — only touched server-side.

-- ── Public submission functions ─────────────────────────

create or replace function submit_job_seeker(
  p_name text,
  p_linkedin_url text,
  p_location text,
  p_work_preference text default null,
  p_relationship_note text default null,
  p_notes text default null,
  p_honeypot text default null
) returns void as $$
begin
  if p_honeypot is not null and p_honeypot <> '' then
    return; -- silently drop likely-bot submissions
  end if;

  insert into job_seekers (name, linkedin_url, location, work_preference, relationship_note, notes)
  values (p_name, p_linkedin_url, p_location, p_work_preference, p_relationship_note, p_notes);
end;
$$ language plpgsql security definer;

grant execute on function submit_job_seeker to anon;

create or replace function submit_hiring_contact(
  p_name text,
  p_email text,
  p_jd_url text,
  p_notes text default null,
  p_honeypot text default null
) returns void as $$
begin
  if p_honeypot is not null and p_honeypot <> '' then
    return;
  end if;

  insert into hiring_contacts (name, email, jd_url, notes)
  values (p_name, p_email, p_jd_url, p_notes);
end;
$$ language plpgsql security definer;

grant execute on function submit_hiring_contact to anon;