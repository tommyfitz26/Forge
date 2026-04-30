-- Phase 5.2 — Replace the capture-only `links` table with a polymorphic
-- any-to-any model: source/target across capture, project, thread,
-- journal_entry. See UI-REDESIGN-SPEC.md §13.
--
-- Why drop and recreate (vs. migrate): the existing `links` table is
-- defined in the Phase-0 schema but nothing in the codebase writes to it
-- (verified by grep — pattern_detection writes to
-- weekly_summaries.patterns_detected jsonb instead). It is dead schema.
-- Replacing it cleanly is safer than retrofitting capture_a/capture_b.
--
-- ROLLBACK:
--   drop policy if exists links_owner on public.links;
--   drop table if exists public.links;
--   -- (then re-run the original Phase-0 capture-only definition)

-- ============================================================
-- 0. Drop the legacy capture-only links table
-- ============================================================

drop policy if exists links_via_capture on public.links;
drop index if exists public.links_unique;
drop table if exists public.links;

-- ============================================================
-- 1. New polymorphic links table
-- ============================================================

create table public.links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,

  -- Both endpoints are polymorphic. RLS gates the rows by owner; foreign
  -- key integrity for the polymorphic ids is enforced in the application
  -- layer (same pattern `pins` uses — see 20260430041912 migration).
  source_kind text not null check (source_kind in ('capture','project','thread','journal_entry')),
  source_id   uuid not null,
  target_kind text not null check (target_kind in ('capture','project','thread','journal_entry')),
  target_id   uuid not null,

  -- 'manual'        — user explicitly linked via UI
  -- 'ai_suggested'  — pattern_detection from the Sunday weekly review
  -- 'inferred'      — per-save Sonnet suggestion the user accepted (5.3)
  kind text not null check (kind in ('manual','ai_suggested','inferred')),

  -- Optional reasoning. For manual links: a one-line note from the user.
  -- For ai_suggested / inferred: the LLM's brief justification.
  reason text,

  created_at timestamptz not null default now(),
  -- Set when the user explicitly accepted an AI-inferred link. NULL for
  -- manual + ai_suggested (which are written as already-confirmed).
  accepted_at timestamptz,

  -- A link can't point to itself.
  constraint links_no_self check (
    not (source_kind = target_kind and source_id = target_id)
  )
);

-- Dedupe at the (owner, ordered-pair, kind) level. We canonicalize the
-- ordering at write time in app code: source comes before target by
-- (kind, id) lexicographic compare. The unique index reflects that order.
create unique index links_canonical_unique on public.links (
  owner_id, source_kind, source_id, target_kind, target_id, kind
);

-- Lookup indices: walking outbound links from a single source is the
-- common detail-page query; inbound likewise.
create index links_source_idx on public.links (owner_id, source_kind, source_id);
create index links_target_idx on public.links (owner_id, target_kind, target_id);

alter table public.links enable row level security;
create policy links_owner on public.links
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
