// Threads domain types (Phase 4.3.3).
//
// Mirrors UI-REDESIGN-SPEC.md §15. Locally-typed until `pnpm db:types` is
// re-run after applying the 20260430035915 migration.

import type { CaptureKind } from '@/lib/capture/kinds';
import type { ThreadSection } from '@/lib/threads/templates';

export const THREAD_STATUSES = ['in_progress', 'complete', 'archived'] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export type Thread = {
  id: string;
  owner_id: string;
  capture_id: string;
  kind: CaptureKind;
  sections: ThreadSection[];
  status: ThreadStatus;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
