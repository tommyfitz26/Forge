-- Phase 4.3.3 — Threads table.
-- See UI-REDESIGN-SPEC.md §15 (data model) — kind-aware structured-expansion
-- canvases on top of captures. The `sections` jsonb is seeded from a per-kind
-- template at create time (see lib/threads/templates.ts). Mirrors the
-- develop-prompt template structure from SPEC.md §4.6 — the prompt asks Claude
-- these questions; the thread is where the user records the answers.
--
-- ROLLBACK:
--   drop policy if exists threads_owner on public.threads;
--   drop table if exists public.threads;

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  capture_id uuid not null references public.captures(id) on delete cascade,
  kind text not null check (kind in ('problem','idea','observation','research')),
  -- sections jsonb shape: [{ key: string, title: string, body: string }]
  -- seeded by lib/threads/templates.ts at insert time.
  sections jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress','complete','archived')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- One thread per capture. (Captures can have at most one expansion canvas;
  -- multiple "drafts" for the same idea use Scraps, not threads.)
  constraint threads_one_per_capture unique (capture_id)
);

create index threads_owner_status_idx on public.threads (owner_id, status) where deleted_at is null;
create index threads_owner_kind_idx on public.threads (owner_id, kind) where deleted_at is null;
create index threads_owner_updated_idx on public.threads (owner_id, updated_at desc) where deleted_at is null;

alter table public.threads enable row level security;

create policy threads_owner on public.threads
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
