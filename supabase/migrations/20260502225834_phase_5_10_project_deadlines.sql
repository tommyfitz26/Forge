-- Phase 5.10 — project_deadlines.
--
-- Forward-looking date markers on a project — kickoff, handoff, launch,
-- demo, "must hear back from X". Distinct from project_tasks (which are
-- doable items) and from projects.target_at (which is the single project-
-- wide finish line). Multiple deadlines per project, each with its own
-- date and label.
--
-- ROLLBACK:
--   drop policy if exists project_deadlines_owner on public.project_deadlines;
--   drop table if exists public.project_deadlines;

create table public.project_deadlines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(trim(title)) > 0 and length(title) <= 140),
  due_at date not null,
  -- pending: not yet hit. hit: marked done. missed: passed without hitting.
  -- v1 only writes 'pending' and 'hit'; 'missed' is a future helper for an
  -- eventual sweep job. UI treats anything past due_at && pending as overdue.
  status text not null default 'pending' check (status in ('pending','hit','missed')),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index project_deadlines_project_due_idx
  on public.project_deadlines (project_id, due_at);
create index project_deadlines_owner_pending_idx
  on public.project_deadlines (owner_id, due_at)
  where status = 'pending';

alter table public.project_deadlines enable row level security;
create policy project_deadlines_owner on public.project_deadlines
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
