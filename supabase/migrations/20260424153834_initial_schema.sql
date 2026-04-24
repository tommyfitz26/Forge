-- Forge initial schema — SPEC §6.1, §6.2, §6.3
-- Single-user app, public schema, dedicated free-tier Supabase project.
--
-- ROLLBACK (run in reverse order if this migration needs to be undone):
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists public.handle_new_user();
--   drop function if exists public.capture_belongs_to_me(uuid);
--   drop table if exists public.api_costs;
--   drop table if exists public.job_runs;
--   drop table if exists public.capture_events;
--   drop table if exists public.push_subscriptions;
--   drop table if exists public.weekly_summaries;
--   drop table if exists public.links;
--   drop table if exists public.nudges;
--   drop table if exists public.conversations;
--   drop table if exists public.research;
--   drop table if exists public.attachments;
--   drop table if exists public.captures;
--   drop table if exists public.users;

-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists pgcrypto;  -- for gen_random_uuid()

-- ============================================================================
-- users (single row; structure kept for future-proofing)
-- v1 has no per-user timezone — schedules use APP_SCHEDULE_TZ constant (SPEC §4.4).
-- CRITICAL: public.users.id MUST equal auth.users.id so RLS on auth.uid() matches.
-- ============================================================================

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default now(),
  settings jsonb not null default '{}'::jsonb
);

-- ============================================================================
-- captures (the main entity)
-- ============================================================================

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind text not null check (kind in ('problem','idea','observation','research')),
  state text not null default 'raw' check (state in ('raw','developed','serious','archived')),
  title text not null,
  content text not null,
  original_transcript text,
  source text not null default 'web' check (source in ('web','shortcut','siri','widget')),
  audio_duration_seconds int,
  research_status text default 'pending' check (research_status in ('pending','running','succeeded','failed','skipped')),
  -- NOTE: every research_status transition must also set updated_at = now() so the
  -- hourly research-recovery cron can detect stuck 'running' rows by updated_at age.
  archive_reason text
);

create index captures_user_state_idx on public.captures (user_id, state);
create index captures_user_created_idx on public.captures (user_id, created_at desc);

-- ============================================================================
-- attachments (photos, drawings)
-- ============================================================================

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures(id) on delete cascade,
  kind text not null check (kind in ('photo','drawing')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- research (Sonnet + web_search output)
-- ============================================================================

create table public.research (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures(id) on delete cascade,
  generated_at timestamptz not null default now(),
  model text not null,
  competitors jsonb not null default '[]'::jsonb,
  market_context text,
  recent_news jsonb not null default '[]'::jsonb,
  angles jsonb not null default '[]'::jsonb,
  confidence text check (confidence in ('low','medium','high')),
  sources_count int default 0,
  cost_usd numeric(10,4),
  raw_response jsonb
);

create unique index research_one_per_capture on public.research (capture_id);

-- ============================================================================
-- conversations (development Q&A sessions)
-- messages shape per SPEC §4.6 / §6.1:
--   { role: 'ai'|'user', content, ts,
--     intent?, template_question_index?, session_complete? (ai messages only) }
-- ============================================================================

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  messages jsonb not null default '[]'::jsonb,
  turn_count int not null default 0
);

create index conversations_capture_idx on public.conversations (capture_id, started_at desc);

-- ============================================================================
-- nudges
-- ============================================================================

create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures(id) on delete cascade,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  question text not null,
  responded_at timestamptz,
  response_summary text,
  skipped_reason text
);

create index nudges_capture_idx on public.nudges (capture_id);
create index nudges_scheduled_idx on public.nudges (scheduled_for);
create index nudges_sent_responded_idx on public.nudges (capture_id, sent_at, responded_at);

-- ============================================================================
-- links (manual or AI-suggested pairs)
-- IMPORTANT: always insert with capture_a = LEAST(id1, id2), capture_b = GREATEST(id1, id2).
-- The CHECK constraint enforces ordering so the unique index catches dupes in both orders.
-- ============================================================================

create table public.links (
  id uuid primary key default gen_random_uuid(),
  capture_a uuid not null references public.captures(id) on delete cascade,
  capture_b uuid not null references public.captures(id) on delete cascade,
  kind text not null check (kind in ('manual','ai_suggested')),
  reason text,
  created_at timestamptz not null default now(),
  last_suggested_at timestamptz,
  confirmed_at timestamptz,
  check (capture_a < capture_b)
);

create unique index links_unique on public.links (capture_a, capture_b);

-- ============================================================================
-- weekly_summaries (one per week; Stage 1 writes composing, Stage 2 writes sent)
-- ============================================================================

create table public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  week_of date not null,
  generated_at timestamptz not null default now(),
  email_content_md text,
  captures_included uuid[] not null default '{}',
  patterns_detected jsonb not null default '[]'::jsonb,
  status text not null default 'composing' check (status in ('composing','sent','failed')),
  email_message_id text,
  sent_at timestamptz,
  constraint weekly_sent_requires_email check (status <> 'sent' or email_content_md is not null)
);

create unique index weekly_unique_per_user_week on public.weekly_summaries (user_id, week_of);

-- ============================================================================
-- push_subscriptions (PWA web push)
-- ============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create unique index push_sub_unique on public.push_subscriptions (endpoint);

-- ============================================================================
-- capture_events (lifecycle audit log, also used for merge lineage per §4.7)
-- ============================================================================

create table public.capture_events (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references public.captures(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- job_runs (idempotency coordination for background jobs — SPEC §10.4 Layer B)
-- 'failed' + error='stale_lease' is the ONLY convention used (no 'interrupted' status).
-- ============================================================================

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  idempotency_key text not null,
  status text not null check (status in ('running','succeeded','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  result jsonb
);

create unique index job_runs_idempotency on public.job_runs (job_name, idempotency_key);

-- ============================================================================
-- api_costs (every Anthropic/OpenAI/Resend call logs one row)
-- ============================================================================

create table public.api_costs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null,
  task text not null,
  capture_id uuid references public.captures(id) on delete set null,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,6) not null
);

create index api_costs_created_idx on public.api_costs (created_at desc);
create index api_costs_capture_idx on public.api_costs (capture_id) where capture_id is not null;

-- ============================================================================
-- RLS helper: ownership check for capture-linked child tables (SPEC §6.2)
-- security definer so it can read captures even when the calling policy is
-- evaluating a row on a table the user doesn't have broad SELECT on. Locked
-- down to authenticated only.
-- ============================================================================

create or replace function public.capture_belongs_to_me(cap_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.captures c
    where c.id = cap_id and c.user_id = auth.uid()
  );
$$;

revoke all on function public.capture_belongs_to_me(uuid) from public, anon;
grant execute on function public.capture_belongs_to_me(uuid) to authenticated;

-- ============================================================================
-- Row Level Security (SPEC §6.2)
-- Enabled on every table. Service-role client bypasses RLS by design.
-- ============================================================================

-- Direct-ownership tables: id or user_id = auth.uid()

alter table public.users enable row level security;
create policy users_self on public.users
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

alter table public.captures enable row level security;
create policy captures_owner on public.captures
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.weekly_summaries enable row level security;
create policy weekly_summaries_owner on public.weekly_summaries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_owner on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Child tables: check via capture_belongs_to_me()

alter table public.attachments enable row level security;
create policy attachments_via_capture on public.attachments
  for all to authenticated
  using (capture_belongs_to_me(capture_id))
  with check (capture_belongs_to_me(capture_id));

alter table public.research enable row level security;
create policy research_via_capture on public.research
  for all to authenticated
  using (capture_belongs_to_me(capture_id))
  with check (capture_belongs_to_me(capture_id));

alter table public.conversations enable row level security;
create policy conversations_via_capture on public.conversations
  for all to authenticated
  using (capture_belongs_to_me(capture_id))
  with check (capture_belongs_to_me(capture_id));

alter table public.nudges enable row level security;
create policy nudges_via_capture on public.nudges
  for all to authenticated
  using (capture_belongs_to_me(capture_id))
  with check (capture_belongs_to_me(capture_id));

alter table public.capture_events enable row level security;
create policy capture_events_via_capture on public.capture_events
  for all to authenticated
  using (capture_belongs_to_me(capture_id))
  with check (capture_belongs_to_me(capture_id));

-- Links: both captures must belong to the user

alter table public.links enable row level security;
create policy links_via_both_captures on public.links
  for all to authenticated
  using (capture_belongs_to_me(capture_a) and capture_belongs_to_me(capture_b))
  with check (capture_belongs_to_me(capture_a) and capture_belongs_to_me(capture_b));

-- Operational tables: RLS enabled but NO policies granted.
-- Default-deny kicks in for anon/authenticated. Service-role bypasses RLS from jobs.

alter table public.job_runs enable row level security;

alter table public.api_costs enable row level security;

-- ============================================================================
-- First-login trigger (SPEC §6.3)
-- Inserts one row into public.users on auth.users insert, using the auth uid
-- as the PK so public.users.id = auth.uid() and RLS works.
-- Enforcement that email === OWNER_EMAIL happens in the login server action
-- and middleware (§14) — this trigger is safe even if a stranger's auth row
-- is ever inserted: their session is destroyed before they can read/write.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
