// Single source of truth for capture kinds and states.
// Mirrors the CHECK constraints on public.captures in the initial migration.

export const CAPTURE_KINDS = ['problem', 'idea', 'observation', 'research'] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

// 'serious' was removed in Phase 4.3.1. Promotion-to-project replaces it —
// see UI-REDESIGN-SPEC.md §8 (lifecycle states & graduation). Existing rows
// were migrated to 'developed' by 20260430030211_phase_4_3_1_projects.sql.
export const CAPTURE_STATES = ['raw', 'developed', 'archived'] as const;
export type CaptureState = (typeof CAPTURE_STATES)[number];

export const RESEARCH_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

// Research auto-runs on idea/research per SPEC §4.3. For problem/observation,
// it's user-triggered, so research_status is seeded as 'skipped'.
export function initialResearchStatus(kind: CaptureKind): ResearchStatus {
  return kind === 'idea' || kind === 'research' ? 'pending' : 'skipped';
}
