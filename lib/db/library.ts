// Library data fetcher (Phase 5.6).
//
// Pulls the Library set (per lib/capture/buckets.ts), buckets each row
// to a shelf, and hydrates Visual rows with signed photo URLs. The
// Process shelf is sourced from `research` instead of captures.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  libraryShelfFor,
  type CaptureMediaKind,
  type LibraryShelf,
} from '@/lib/capture/buckets';
import type { CaptureKind, CaptureState } from '@/lib/capture/kinds';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

const SIGNED_URL_TTL_SECONDS = 3600;

export type LibraryItem = {
  id: string;
  title: string;
  content: string;
  kind: CaptureKind;
  state: CaptureState;
  created_at: string;
  media_kind: CaptureMediaKind | null;
  source_url: string | null;
  shelf: Exclude<LibraryShelf, 'process'>;
  /** For Visual shelf — signed URL for the first attached photo, when found. */
  photoUrl: string | null;
};

export type ProcessItem = {
  research_id: string;
  capture_id: string;
  capture_title: string;
  capture_kind: CaptureKind;
  generated_at: string;
  market_context: string | null;
  competitor_count: number;
  angle_count: number;
  confidence: 'low' | 'medium' | 'high' | null;
  sources_count: number | null;
};

export type LibraryCounts = {
  audio: number;
  visual: number;
  text: number;
  process: number;
  total: number;
};

export async function listLibraryCaptures(): Promise<LibraryItem[]> {
  const supabase = await untypedSupabase();

  // Single query for all Library captures: photo OR clip OR research kind.
  const { data, error } = await supabase
    .from('captures')
    .select('id, title, content, kind, state, created_at, media_kind, source_url')
    .neq('state', 'archived')
    .is('deleted_at', null)
    .or('media_kind.in.(photo,clip),kind.eq.research')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    logger.error('library.list.failed', { err: error.message });
    return [];
  }

  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    content: string | null;
    kind: string;
    state: string;
    created_at: string;
    media_kind: string | null;
    source_url: string | null;
  }>;

  // Resolve Visual photos in one pass.
  const visualIds = rows
    .filter((r) => r.media_kind === 'photo')
    .map((r) => r.id);
  const photoUrlByCapture = new Map<string, string>();
  if (visualIds.length > 0) {
    const { data: atts } = await supabase
      .from('attachments')
      .select('capture_id, storage_path')
      .in('capture_id', visualIds)
      .eq('kind', 'photo')
      .order('created_at', { ascending: true });
    for (const a of (atts ?? []) as Array<{
      capture_id: string;
      storage_path: string;
    }>) {
      if (photoUrlByCapture.has(a.capture_id)) continue;
      const { data: signed } = await supabase.storage
        .from('attachments')
        .createSignedUrl(a.storage_path, SIGNED_URL_TTL_SECONDS);
      if (signed?.signedUrl) {
        photoUrlByCapture.set(a.capture_id, signed.signedUrl);
      }
    }
  }

  return rows
    .map((r) => {
      const signal = {
        kind: r.kind as CaptureKind,
        media_kind: (r.media_kind ?? null) as CaptureMediaKind | null,
      };
      const shelf = libraryShelfFor(signal);
      if (!shelf) return null;
      return {
        id: r.id,
        title: r.title,
        content: r.content ?? '',
        kind: r.kind as CaptureKind,
        state: r.state as CaptureState,
        created_at: r.created_at,
        media_kind: signal.media_kind,
        source_url: r.source_url,
        shelf,
        photoUrl: photoUrlByCapture.get(r.id) ?? null,
      } satisfies LibraryItem;
    })
    .filter((x): x is LibraryItem => x !== null);
}

/**
 * Process shelf — research outputs joined with their parent capture's
 * title + kind. One row per research record (the table has a unique index
 * on capture_id, so 1:1 with captures).
 */
export async function listProcessItems(): Promise<ProcessItem[]> {
  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('research')
    .select(
      'id, capture_id, generated_at, market_context, competitors, angles, confidence, sources_count',
    )
    .order('generated_at', { ascending: false })
    .limit(200);
  if (error) {
    logger.error('library.process.failed', { err: error.message });
    return [];
  }

  const rows = (data ?? []) as Array<{
    id: string;
    capture_id: string;
    generated_at: string;
    market_context: string | null;
    competitors: unknown;
    angles: unknown;
    confidence: 'low' | 'medium' | 'high' | null;
    sources_count: number | null;
  }>;

  const captureIds = rows.map((r) => r.capture_id);
  if (captureIds.length === 0) return [];

  const { data: captures } = await supabase
    .from('captures')
    .select('id, title, kind')
    .in('id', captureIds);

  const titleMap = new Map(
    ((captures ?? []) as Array<{ id: string; title: string; kind: string }>).map(
      (c) => [c.id, { title: c.title, kind: c.kind as CaptureKind }],
    ),
  );

  return rows
    .map((r) => {
      const cap = titleMap.get(r.capture_id);
      if (!cap) return null;
      return {
        research_id: r.id,
        capture_id: r.capture_id,
        capture_title: cap.title,
        capture_kind: cap.kind,
        generated_at: r.generated_at,
        market_context: r.market_context,
        competitor_count: Array.isArray(r.competitors) ? r.competitors.length : 0,
        angle_count: Array.isArray(r.angles) ? r.angles.length : 0,
        confidence: r.confidence,
        sources_count: r.sources_count,
      } satisfies ProcessItem;
    })
    .filter((x): x is ProcessItem => x !== null);
}

export async function libraryCounts(): Promise<LibraryCounts> {
  const [items, processItems] = await Promise.all([
    listLibraryCaptures(),
    listProcessItems(),
  ]);

  const counts: LibraryCounts = {
    audio: items.filter((i) => i.shelf === 'audio').length,
    visual: items.filter((i) => i.shelf === 'visual').length,
    text: items.filter((i) => i.shelf === 'text').length,
    process: processItems.length,
    total: items.length + processItems.length,
  };
  return counts;
}
