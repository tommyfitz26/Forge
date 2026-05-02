-- Phase 5.7 — Atlas: entities + mentions for the people/places/things surface.
-- See UI-REDESIGN-SPEC.md §14.
--
-- entities: one row per (owner, normalized_name, kind). The classifier
--   extracts entity names alongside the capture's title/kind; we normalize
--   (lowercase + collapse whitespace) for dedupe but keep the user-facing
--   `name` as written. mention_count + last_seen_at are denormalized caches
--   maintained by the persist path.
--
-- mentions: each (entity, capture) pair, written when the classifier
--   surfaces an entity for a new capture. ON CONFLICT DO NOTHING prevents
--   re-firing on the same pair if a capture is reclassified.
--
-- v1 scope:
--   - extraction-only (no manual entity entry)
--   - new captures only (skip backfill — could be a future cron)
--   - name-equality dedup (no merge UI)
--
-- ROLLBACK:
--   drop policy if exists mentions_owner on public.mentions;
--   drop table if exists public.mentions;
--   drop policy if exists entities_owner on public.entities;
--   drop table if exists public.entities;

-- ============================================================
-- 1. entities
-- ============================================================

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,

  -- User-facing name as the LLM extracted it ("Maren", "Quiet Light").
  -- Preserves capitalization and original spacing.
  name text not null check (length(trim(name)) > 0),
  -- Lowercase + whitespace-collapsed form used for dedupe. Same person
  -- mentioned as "Maren" / "  Maren " / "maren" → one row.
  normalized_name text not null check (length(normalized_name) > 0),

  kind text not null check (kind in ('person','place','thing')),

  -- Denormalized cache. Updated by the persist path on every new mention.
  -- The mentions table is the source of truth — the cache is a perf hint.
  mention_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedupe entities by (owner, normalized_name, kind). One person named
-- "Maren" and one place called "Maren" can coexist (different kinds).
create unique index entities_owner_norm_kind_unique
  on public.entities (owner_id, normalized_name, kind);

-- Browse list query: WHERE owner = $1 AND kind = $2 ORDER BY mention_count DESC.
create index entities_owner_kind_idx
  on public.entities (owner_id, kind, mention_count desc, last_seen_at desc);

alter table public.entities enable row level security;
create policy entities_owner on public.entities
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- 2. mentions
-- ============================================================

create table public.mentions (
  entity_id uuid not null references public.entities(id) on delete cascade,
  capture_id uuid not null references public.captures(id) on delete cascade,
  -- owner_id duplicated for fast RLS without joining entities.
  owner_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entity_id, capture_id)
);

-- Lookup all mentions of a single entity for the detail page.
create index mentions_entity_idx on public.mentions (entity_id, created_at desc);
-- Reverse: which entities does this capture mention? (for capture detail
-- page when we surface entities there in a follow-up.)
create index mentions_capture_idx on public.mentions (capture_id);

alter table public.mentions enable row level security;
create policy mentions_owner on public.mentions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
