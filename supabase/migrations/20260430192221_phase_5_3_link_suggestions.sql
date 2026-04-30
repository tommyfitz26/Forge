-- Phase 5.3 — link_suggestions table for per-save AI link suggestions.
-- See UI-REDESIGN-SPEC.md §13.
--
-- The runSuggestLinks orchestrator (lib/ai/run-suggest-links.ts) fires after
-- a capture is created, a thread section is saved, or a journal entry is
-- created. Sonnet 4.6 picks 0–3 candidate links from the user's recent
-- content; the picks are written here as `pending`. The user sees them in
-- a SuggestionsPanel on the source's detail page and can Accept (writes a
-- links row + status='accepted') or Skip (status='dismissed').
--
-- The 24h dedupe lives on `source_snapshot_hash`: if the snapshot of the
-- source content matches a recent suggestion's hash, we skip the LLM call.
-- This prevents re-firing on every keystroke save.
--
-- ROLLBACK:
--   drop policy if exists link_suggestions_owner on public.link_suggestions;
--   drop table if exists public.link_suggestions;

create table public.link_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,

  -- The just-saved item that triggered the suggestion. Projects don't
  -- trigger suggestions (they're derived from captures), so the source
  -- kind set is one narrower than `links.source_kind`.
  source_kind text not null check (source_kind in ('capture','thread','journal_entry')),
  source_id uuid not null,

  -- The proposed target.
  target_kind text not null check (target_kind in ('capture','project','thread','journal_entry')),
  target_id uuid not null,

  -- LLM's brief justification — surfaced to the user as the chip subtitle
  -- and stored on the resulting `links.reason` when accepted.
  reason text not null check (length(trim(reason)) > 0),

  -- Lifecycle:
  --   'pending'   — shown to the user, waiting for action
  --   'accepted'  — user clicked Accept; a `links` row was written
  --   'dismissed' — user clicked Skip; row stays for 24h dedupe but
  --                 SuggestionsPanel ignores it
  status text not null default 'pending'
    check (status in ('pending','accepted','dismissed')),

  -- SHA-256 hex of the source content at the time the suggestion was
  -- generated. Used by the 24h dedupe check (see runSuggestLinks).
  source_snapshot_hash text not null,

  suggested_at timestamptz not null default now(),
  resolved_at timestamptz,

  -- A suggestion can't point to itself.
  constraint link_suggestions_no_self check (
    not (source_kind = target_kind and source_id = target_id)
  )
);

-- Lookups: pending suggestions for a given source (rendering the panel).
create index link_suggestions_source_pending_idx
  on public.link_suggestions (owner_id, source_kind, source_id, status, suggested_at desc);

-- Hash dedupe lookup.
create index link_suggestions_hash_idx
  on public.link_suggestions (owner_id, source_kind, source_id, source_snapshot_hash, suggested_at desc);

alter table public.link_suggestions enable row level security;
create policy link_suggestions_owner on public.link_suggestions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
