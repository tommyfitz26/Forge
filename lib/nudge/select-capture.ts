import type { CaptureKind, CaptureState, ResearchStatus } from '@/lib/capture/kinds';

// SPEC §4.4 step 2: weighted strategy for picking which capture to nudge on.
// "Prefer oldest undeveloped, then ideas with fresh research, then problems
// without recent engagement."
//
// Translated into a tiered comparator:
//   tier 1 — state='raw' AND research_status='succeeded'  (oldest first)
//   tier 2 — state='raw' AND kind='idea'                  (oldest first)
//   tier 3 — state='raw'                                  (oldest first)
//   tier 4 — state='developed'                            (oldest first)
//
// Within each tier we sort by created_at ascending so the oldest neglected
// capture wins. Ties broken by id (stable, deterministic for tests).

export type NudgeCandidate = {
  id: string;
  kind: CaptureKind;
  state: CaptureState;
  research_status: ResearchStatus;
  created_at: string;
};

const TIER_ORDER = ['raw_with_research', 'raw_idea', 'raw_other', 'developed'] as const;
type Tier = (typeof TIER_ORDER)[number];

function tierFor(c: NudgeCandidate): Tier | null {
  if (c.state === 'raw') {
    if (c.research_status === 'succeeded') return 'raw_with_research';
    if (c.kind === 'idea') return 'raw_idea';
    return 'raw_other';
  }
  if (c.state === 'developed') return 'developed';
  // 'serious' and 'archived' are filtered upstream by the eligibility query —
  // defense-in-depth only.
  return null;
}

export function selectCapture(candidates: NudgeCandidate[]): NudgeCandidate | null {
  const ranked = candidates
    .map((c) => ({ c, tier: tierFor(c) }))
    .filter((r): r is { c: NudgeCandidate; tier: Tier } => r.tier !== null);

  if (ranked.length === 0) return null;

  ranked.sort((a, b) => {
    const tierDiff = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    if (tierDiff !== 0) return tierDiff;
    const dateDiff = a.c.created_at.localeCompare(b.c.created_at);
    if (dateDiff !== 0) return dateDiff;
    return a.c.id.localeCompare(b.c.id);
  });

  return ranked[0]?.c ?? null;
}
