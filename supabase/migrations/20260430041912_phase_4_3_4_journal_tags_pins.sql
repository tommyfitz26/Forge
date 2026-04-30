-- Phase 4.3.4 — Three small tables: journal_entries, tags, pins.
-- See UI-REDESIGN-SPEC.md §15.
--
-- Journal entries are short dated text (the daily-writing surface).
-- Tags are free-form labels owned per-user; auto-created on first use.
-- Pins are cross-type "top of mind" markers (capture / project / thread / journal_entry).
--
-- ROLLBACK:
--   drop policy if exists pins_owner on public.pins;
--   drop table if exists public.pins;
--   drop policy if exists tags_owner on public.tags;
--   drop table if exists public.tags;
--   drop policy if exists journal_entries_owner on public.journal_entries;
--   drop table if exists public.journal_entries;

-- ============================================================
-- 1. journal_entries
-- ============================================================

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  written_at date not null default current_date,
  body text not null check (length(body) > 0),
  -- Free-form tag slugs. Each tag is also expected to exist in `public.tags`
  -- (auto-inserted by the createJournalEntry action). The text[] is the
  -- denormalized read path; the `tags` table is the canonical inventory.
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index journal_entries_owner_date_idx
  on public.journal_entries (owner_id, written_at desc)
  where deleted_at is null;

-- GIN index supports `tags @> ARRAY['slug']` filter on /tags/[slug].
create index journal_entries_tags_gin
  on public.journal_entries using gin (tags)
  where deleted_at is null;

alter table public.journal_entries enable row level security;
create policy journal_entries_owner on public.journal_entries
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- 2. tags
-- ============================================================

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  -- slug is the lowercase canonical form (autocomplete + URL).
  slug text not null check (length(slug) > 0 and length(slug) <= 60),
  color text,                              -- optional theme key (ember/gold/moss/plum/sky/hot)
  created_at timestamptz not null default now(),
  -- One row per (owner, slug). Multiple users could share a slug if
  -- multi-tenant ever lands.
  constraint tags_slug_per_owner unique (owner_id, slug)
);

create index tags_owner_idx on public.tags (owner_id, slug);

alter table public.tags enable row level security;
create policy tags_owner on public.tags
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ============================================================
-- 3. pins
-- ============================================================

create table public.pins (
  owner_id uuid not null references public.users(id) on delete cascade,
  -- The thing being pinned. Polymorphic by source_kind + source_id.
  source_kind text not null check (source_kind in ('capture','project','thread','journal_entry')),
  source_id uuid not null,
  pinned_at timestamptz not null default now(),
  primary key (owner_id, source_kind, source_id)
);

create index pins_owner_pinned_idx on public.pins (owner_id, pinned_at desc);

alter table public.pins enable row level security;
create policy pins_owner on public.pins
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Note: pins do NOT have a foreign-key constraint on source_id (it points to
-- four different tables depending on source_kind). When the source is deleted,
-- the pin row becomes orphaned. Cleanup happens in the application layer when
-- listing pins (filter out unresolvable rows). A periodic sweep job could be
-- added in Phase 5 if orphan accumulation becomes a concern.
