import { z } from 'zod';

// SPEC §4.5 — output of the weekly_summary task. The model receives the week's
// captures + already-detected patterns and produces the per-capture digest the
// email and /review/:weekId screen render from.
//
// Counts are intentionally NOT emitted by the model — Stage 1 derives them
// from the parsed payload + DB row count to avoid LLM miscount drift. See
// HANDOFF "phase-2c-weekly-tasks" for the broader payload shape.

const PerCaptureSummary = z.object({
  id: z.string().uuid(),
  summary: z.string().min(1).max(800),
  // Empty string is meaningful here: the capture has no research (problem /
  // observation kinds, or research_status !== 'succeeded'). Do not coerce to
  // "(none)" — the email composer renders the distinction.
  research_distilled: z.string().max(800),
});

export const WeeklySummarySchema = z.object({
  captures: z.array(PerCaptureSummary),
  // patterns_summary is the prose paragraph that introduces the "Patterns I
  // noticed" section in the email. Empty string when pattern_detection
  // returned zero pairs.
  patterns_summary: z.string().max(1200),
  ready_to_develop_ids: z.array(z.string().uuid()),
});

export type WeeklySummary = z.infer<typeof WeeklySummarySchema>;
