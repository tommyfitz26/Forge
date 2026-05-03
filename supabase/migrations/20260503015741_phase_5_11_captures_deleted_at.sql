-- Phase 5.11 — Add deleted_at to captures.
--
-- Until now captures used `state='archived'` for the hide-from-views path.
-- That's a separate flow from soft-delete: archived items live on /archive
-- and can still be linked to / mentioned in other contexts. The new
-- `deleted_at` column is the unified soft-delete column that mirrors the
-- pattern on threads, journal_entries, and projects, so captures can also
-- live in /trash with the same 30-day window.
--
-- Read paths that previously filtered by `state != 'archived'` now ALSO
-- need `deleted_at is null` to hide trashed captures. The relevant list
-- queries are updated in this same PR.
--
-- ROLLBACK:
--   drop index if exists captures_active_idx;
--   alter table public.captures drop column if exists deleted_at;

alter table public.captures
  add column deleted_at timestamptz;

create index captures_active_idx
  on public.captures (user_id, created_at desc)
  where deleted_at is null;
