-- Phase 5.6 — Backfill captures.media_kind from observable signals.
--
-- The column was added in 4.3.1 with a default of 'note' but nothing has
-- written to it since. /library needs accurate media_kind to bucket rows
-- into Audio / Visual / Text / Process shelves. Going forward, the create
-- paths set it explicitly (see app/(app)/capture/actions.ts +
-- app/api/capture/route.ts).
--
-- Signals we trust:
--   * an attachments row with kind='photo' for the capture → 'photo'
--   * original_transcript IS NOT NULL AND no photo attachment       → 'voice'
--   * everything else stays 'note' (web-clip detection from the existing
--     URL-in-content heuristic is too noisy; new web clips will be set
--     to 'clip' explicitly going forward)
--
-- Idempotent: only updates rows where media_kind = 'note' (the default).
--
-- ROLLBACK: no-op — the migration only changes column values, not schema.
--   To revert, run UPDATE captures SET media_kind = 'note';

-- 1. Photo attachments → media_kind='photo'
update public.captures
   set media_kind = 'photo'
 where media_kind = 'note'
   and exists (
     select 1 from public.attachments a
      where a.capture_id = captures.id
        and a.kind = 'photo'
   );

-- 2. Voice transcripts (and not already photo) → media_kind='voice'
update public.captures
   set media_kind = 'voice'
 where media_kind = 'note'
   and original_transcript is not null;
