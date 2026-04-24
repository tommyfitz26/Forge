// Single source of truth for capture kinds and states.
// Mirrors the CHECK constraints on public.captures in the initial migration.

export const CAPTURE_KINDS = ['problem', 'idea', 'observation', 'research'] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const CAPTURE_STATES = ['raw', 'developed', 'serious', 'archived'] as const;
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
