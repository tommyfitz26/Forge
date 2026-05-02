// Atlas domain types (Phase 5.7).
//
// Locally-typed until `pnpm db:types` is re-run after applying the
// 20260502184915 migration.

import type { EntityKind } from '@/lib/ai/tasks';

export type Entity = {
  id: string;
  owner_id: string;
  name: string;
  normalized_name: string;
  kind: EntityKind;
  mention_count: number;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type Mention = {
  entity_id: string;
  capture_id: string;
  owner_id: string;
  created_at: string;
};

/** Hydrated row used by the entity detail page — mention plus a snapshot
 *  of the capture it points to. */
export type HydratedMention = {
  capture_id: string;
  capture_title: string;
  capture_kind: string;
  capture_state: string;
  capture_created_at: string;
  capture_preview: string;
  mention_created_at: string;
};

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  person: 'People',
  place: 'Places',
  thing: 'Things',
};
