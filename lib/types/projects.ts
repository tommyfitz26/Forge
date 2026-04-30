// Projects domain types (Phase 4.3.1).
//
// Locally-typed shape until `pnpm db:types` is re-run after applying the
// 20260430030211 migration. Once the generated `lib/types/db.ts` reflects the
// `projects` table, the queries in `lib/db/projects.ts` should switch to using
// the generated types and this file can be slimmed to extend them.
//
// Mirrors UI-REDESIGN-SPEC.md §15.

import type { CaptureKind } from '@/lib/capture/kinds';

export const PROJECT_STATUSES = ['active', 'archived', 'wrapped', 'paused'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const COVER_KINDS = ['gradient', 'photo'] as const;
export type CoverKind = (typeof COVER_KINDS)[number];

// The five cover gradient keys the picker offers. Defaults to the kind_seed
// mapping (idea→ember, research→gold, problem→moss, observation→plum). The
// fifth (`copper`) is an explicit user override that doesn't tie to a kind.
export const COVER_GRADIENT_KEYS = ['ember', 'gold', 'moss', 'plum', 'copper'] as const;
export type CoverGradientKey = (typeof COVER_GRADIENT_KEYS)[number];

export type Project = {
  id: string;
  owner_id: string;
  seed_capture_id: string | null;
  slug: string;
  title: string;
  deck: string | null;
  kind_seed: CaptureKind | null;
  cover_kind: CoverKind;
  cover_gradient_key: CoverGradientKey | null;
  cover_photo_path: string | null;
  stage: string | null;
  status: ProjectStatus;
  parts_kind: string;
  opened_at: string;
  target_at: string | null;
  progress_pct: number | null;
  last_activity_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** Default cover gradient keyed off the originating capture's kind. */
export function gradientKeyForKind(kind: CaptureKind | null): CoverGradientKey {
  switch (kind) {
    case 'idea':
      return 'ember';
    case 'research':
      return 'gold';
    case 'problem':
      return 'moss';
    case 'observation':
      return 'plum';
    default:
      return 'ember';
  }
}

/** CSS gradient string for a given key. Used by ProjectCover client component. */
export function gradientCssForKey(key: CoverGradientKey): string {
  switch (key) {
    case 'ember':
      return 'linear-gradient(135deg, #c47840 0%, #6e3812 100%)';
    case 'gold':
      return 'linear-gradient(135deg, #b88a3a 0%, #6a4e1a 100%)';
    case 'moss':
      return 'linear-gradient(135deg, #6b8a4a 0%, #2f4a1d 100%)';
    case 'plum':
      return 'linear-gradient(135deg, #8e5a82 0%, #4a2c5a 100%)';
    case 'copper':
      return 'linear-gradient(135deg, #d97c2e 0%, #8e4f1c 100%)';
  }
}
