import { env } from '@/lib/env';
import type { CaptureKind } from '@/lib/capture/kinds';
import type { Research } from '@/lib/ai/research-schema';
import { summarizeResearch } from '@/lib/nudge/research-summary';
import type { PatternDetection } from '@/lib/ai/pattern-detection-schema';

// Formatters for the captures_block / patterns_block prompt variables used by
// pattern_detection (lib/ai/prompts/pattern_detection.md) and weekly_summary
// (lib/ai/prompts/weekly_summary.md). Pure functions — Stage 1 of the weekly
// review job composes the input rows from the DB, then hands them here.

export type CaptureForPatterns = {
  id: string;
  kind: CaptureKind;
  title: string;
  content: string;
  created_at: string;
};

export type CaptureForSummary = CaptureForPatterns & {
  research: Research | null;
};

// Hard upper bound on per-capture content length sent to the model. Voice
// transcripts can be a few paragraphs; 40 captures × 2KB caps the block at
// ~80KB / ~20K tokens, well under Sonnet's 200K context window.
const PER_CAPTURE_CONTENT_CAP = 2000;

function truncate(s: string, cap: number): string {
  if (s.length <= cap) return s;
  return `${s.slice(0, cap - 1).trimEnd()}…`;
}

/**
 * Format the captures block fed to pattern_detection. Strict id-first layout
 * so the model can copy UUIDs verbatim into its `pairs` output. Most-recent
 * first (caller responsibility, but we don't re-sort).
 */
export function formatPatternDetectionBlock(
  captures: CaptureForPatterns[],
): string {
  if (captures.length === 0) return '(none)';
  return captures
    .map((c) => {
      const body = truncate(c.content.replace(/\s+/g, ' ').trim(), PER_CAPTURE_CONTENT_CAP);
      return `${c.id} [${c.kind}] ${c.title}\n${body}`;
    })
    .join('\n\n');
}

/**
 * Format this-week's captures for the weekly_summary prompt. Includes
 * day-of-week (in APP_SCHEDULE_TZ) and a one-line research distillation when
 * a research row exists. The model uses this as the source of truth for the
 * per-capture summaries it returns.
 */
export function formatWeeklySummaryCapturesBlock(
  captures: CaptureForSummary[],
): string {
  if (captures.length === 0) return '(none)';
  return captures
    .map((c) => {
      const dow = dayOfWeek(c.created_at);
      const body = truncate(c.content.replace(/\s+/g, ' ').trim(), PER_CAPTURE_CONTENT_CAP);
      const lines = [
        `### [${kindTitleCase(c.kind)}] ${c.title} (${dow})`,
        `id: ${c.id}`,
        body,
      ];
      const researchLine = c.research ? summarizeResearch(c.research) : null;
      if (researchLine && researchLine !== '(none)') {
        lines.push(`Research: ${researchLine}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Format pattern_detection output for the weekly_summary prompt. Renders
 * each pair with both UUIDs and capture titles so the model can describe
 * patterns by content while keeping the IDs available if needed. Empty
 * input returns the literal `(none)` string the prompt expects.
 */
export function formatPatternsBlock(
  pairs: PatternDetection['pairs'],
  captureLookupById: Map<string, { kind: CaptureKind; title: string }>,
): string {
  if (pairs.length === 0) return '(none)';
  return pairs
    .map((p) => {
      const a = captureLookupById.get(p.capture_a);
      const b = captureLookupById.get(p.capture_b);
      const aLabel = a ? `[${a.kind}: ${a.title}]` : '[unknown]';
      const bLabel = b ? `[${b.kind}: ${b.title}]` : '[unknown]';
      return `- ${p.capture_a} ${aLabel} ↔ ${p.capture_b} ${bLabel}\n  ${p.reasoning}`;
    })
    .join('\n');
}

function kindTitleCase(kind: CaptureKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function dayOfWeek(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: env.APP_SCHEDULE_TZ,
    weekday: 'short',
  }).format(new Date(isoTimestamp));
}
