-- Phase 4.3.5 — Intentions + streak_days + content_versions.
-- See UI-REDESIGN-SPEC.md §15.
--
-- intentions backs the Today's focus card (one row per (owner, day)).
-- streak_days is a per-day record of which sources counted toward the streak.
--   v1 reads source tables directly to compute the current streak; the table
--   exists for forward compatibility with a future daily cron that
--   materializes streak history without scanning source tables every read.
-- content_versions records every save of a thread or journal_entry. UI for
--   browsing versions is Phase 5; for now, the rows accumulate quietly.
--
-- ROLLBACK:
--   drop policy if exists content_versions_owner on public.content_versions;
--   drop table if exists public.content_versions;
--   drop policy if exists streak_days_owner on public.streak_days;
--   drop table if exists public.streak_days;
--   drop policy if exists intentions_owner on public.intentions;
--   drop table if exists public.intentions;

-- ============================================================
-- 1. intentions — one focus per day per owner
-- ============================================================

create table public.intentions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  day date not null default current_date,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- exactly one intention per day per owner; updates upsert on this conflict
  constraint intentions_one_per_day unique (owner_id, day)
);

create index intentions_owner_day_idx on public.intentions (owner_id, day desc);

alter table public.intentions enable row level security;
create policy intentions_owner on public.intentions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- 2. streak_days — materialized per-day source list
-- ============================================================

create table public.streak_days (
  owner_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  -- which sources contributed to this day counting:
  --   'capture' / 'focus' / 'journal' / 'developed' / 'promoted'
  sources text[] not null default '{}',
  primary key (owner_id, day)
);

create index streak_days_owner_day_idx on public.streak_days (owner_id, day desc);

alter table public.streak_days enable row level security;
create policy streak_days_owner on public.streak_days
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- 3. content_versions — versioning for threads + journal entries
-- ============================================================

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  -- owner_id duplicated for fast queries + RLS without joining the source.
  owner_id uuid not null references public.users(id) on delete cascade,
  source_kind text not null check (source_kind in ('thread','journal_entry')),
  source_id uuid not null,
  body_snapshot text not null,
  saved_at timestamptz not null default now()
);

create index content_versions_source_idx
  on public.content_versions (source_kind, source_id, saved_at desc);
create index content_versions_owner_idx
  on public.content_versions (owner_id, saved_at desc);

alter table public.content_versions enable row level security;
create policy content_versions_owner on public.content_versions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
