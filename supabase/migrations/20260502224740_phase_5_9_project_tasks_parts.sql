-- Phase 5.9 — Per-project tasks + parts.
--
-- project_tasks: small, ordered to-do list anchored to one project. Backs
--   the Overview "Next steps" panel and the dedicated "Next steps" tab.
--   Status is open|done — no in_progress middle state, on purpose
--   (single-user app, three-state lists feel like overkill at v1).
--
-- project_parts: ordered list of the project's "chapters / songs / experiments
--   / whatever" — the inner-list label is the project's `parts_kind`. Each
--   part has a title, optional note, and a status (planned|in_progress|done).
--   Soft-delete via deleted_at so the Trash window applies.
--
-- ROLLBACK:
--   drop policy if exists project_parts_owner on public.project_parts;
--   drop table if exists public.project_parts;
--   drop policy if exists project_tasks_owner on public.project_tasks;
--   drop table if exists public.project_tasks;

-- ============================================================
-- 1. project_tasks
-- ============================================================

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  body text not null check (length(trim(body)) > 0 and length(body) <= 280),
  status text not null default 'open' check (status in ('open','done')),
  -- monotonic per-project sort key. Lower = higher in the list.
  -- Server actions assign next_position = max(position)+1 on insert.
  position integer not null default 0,
  due_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index project_tasks_project_status_idx
  on public.project_tasks (project_id, status, position);
create index project_tasks_owner_open_idx
  on public.project_tasks (owner_id, status)
  where status = 'open';

alter table public.project_tasks enable row level security;
create policy project_tasks_owner on public.project_tasks
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- 2. project_parts
-- ============================================================

create table public.project_parts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(trim(title)) > 0 and length(title) <= 140),
  note text check (length(note) <= 2000),
  status text not null default 'planned' check (status in ('planned','in_progress','done')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index project_parts_project_pos_idx
  on public.project_parts (project_id, position)
  where deleted_at is null;
create index project_parts_owner_idx
  on public.project_parts (owner_id, updated_at desc)
  where deleted_at is null;

alter table public.project_parts enable row level security;
create policy project_parts_owner on public.project_parts
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
