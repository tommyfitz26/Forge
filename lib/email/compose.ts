import 'server-only';
import { env } from '@/lib/env';
import type { CaptureKind } from '@/lib/capture/kinds';
import type { WeeklySummary } from '@/lib/ai/weekly-summary-schema';
import { renderMarkdownToHtml } from './markdown';

// SPEC §4.5 — composes the email + push payloads from the Sonnet output and
// the captures that were summarized. Pure function — Stage 1 stores the
// markdown; Stage 2 re-renders HTML + sends.

type CaptureMeta = {
  id: string;
  kind: CaptureKind;
  title: string;
};

export type ComposeInput = {
  weekId: string;
  weekOf: string; // YYYY-MM-DD
  summary: WeeklySummary;
  captures: CaptureMeta[];
};

export type ComposedEmail = {
  subject: string;
  markdown: string;
  html: string;
  text: string;
  pushBody: string;
};

export function composeWeeklyReviewEmail(input: ComposeInput): ComposedEmail {
  const { weekOf, summary, captures } = input;
  const lookup = new Map(captures.map((c) => [c.id, c] as const));

  const captureCount = summary.captures.length;
  const patternCount = countPatternsFromSummary(summary);
  const readyCount = summary.ready_to_develop_ids.length;

  const subject = `This week in Forge — ${weekOf}`;
  const markdown = buildMarkdown(input, lookup, {
    captureCount,
    patternCount,
    readyCount,
  });
  const html = renderMarkdownToHtml(markdown);
  // Plain-text fallback. Markdown reads fine as plaintext (headers and **bold**
  // are still legible) so we pass it through verbatim rather than running it
  // through a markdown→text stripper.
  const text = markdown;
  const pushBody = composePushBody({ captureCount, patternCount, readyCount });

  return { subject, markdown, html, text, pushBody };
}

type Counts = { captureCount: number; patternCount: number; readyCount: number };

export function composePushBody({
  captureCount,
  patternCount,
  readyCount,
}: Counts): string {
  // Push preview is short (Apple ~110 chars). Match SPEC §4.5 example phrasing
  // — terse, comma-separated. Pluralize honestly.
  const parts: string[] = [];
  parts.push(`${captureCount} new ${pluralize('capture', captureCount)}`);
  if (patternCount > 0) {
    parts.push(`${patternCount} ${pluralize('pattern', patternCount)} spotted`);
  }
  if (readyCount > 0) {
    parts.push(`${readyCount} ready to develop`);
  }
  return `Your weekly review is ready — ${parts.join(', ')}.`;
}

// patterns_summary is a free-text paragraph (or empty). We don't try to count
// individual patterns from prose — Stage 1 caches the pattern_detection
// pairs in `weekly_summaries.patterns_detected`, but the composer doesn't
// receive that directly. For the email banner we just say "1 pattern" if the
// summary is non-empty, else 0. Crude but correct for the user-facing copy.
function countPatternsFromSummary(summary: WeeklySummary): number {
  return summary.patterns_summary.trim() === '' ? 0 : 1;
}

function buildMarkdown(
  input: ComposeInput,
  lookup: Map<string, CaptureMeta>,
  counts: Counts,
): string {
  const { weekId, summary } = input;
  const reviewUrl = `${env.NEXT_PUBLIC_APP_URL}/review/${weekId}`;

  const out: string[] = [];
  out.push('# This week in Forge');
  out.push('');
  out.push(`**${counts.captureCount} ${pluralize('capture', counts.captureCount)}. ${counts.patternCount} ${pluralize('pattern', counts.patternCount)}. ${counts.readyCount} ${pluralize('idea', counts.readyCount)} ready to develop.**`);
  out.push('');

  if (summary.captures.length > 0) {
    out.push('## New captures');
    out.push('');
    for (const entry of summary.captures) {
      const meta = lookup.get(entry.id);
      const kindLabel = meta ? titleCaseKind(meta.kind) : 'Capture';
      const title = meta?.title ?? '(unknown title)';
      out.push(`### [${kindLabel}] ${title}`);
      out.push('');
      out.push(entry.summary);
      if (entry.research_distilled.trim() !== '') {
        out.push('');
        out.push(`_Research:_ ${entry.research_distilled}`);
      }
      out.push('');
    }
  }

  if (summary.patterns_summary.trim() !== '') {
    out.push('## Patterns I noticed');
    out.push('');
    out.push(summary.patterns_summary);
    out.push('');
  }

  if (summary.ready_to_develop_ids.length > 0) {
    out.push('## Ready to develop');
    out.push('');
    const readyTitles = summary.ready_to_develop_ids
      .map((id) => lookup.get(id)?.title)
      .filter((t): t is string => Boolean(t));
    if (readyTitles.length > 0) {
      out.push(`${readyTitles.length} ${pluralize('idea', readyTitles.length)} ripe for a conversation:`);
      out.push('');
      for (const t of readyTitles) {
        out.push(`- ${t}`);
      }
      out.push('');
    }
    out.push(`[Open in Forge](${reviewUrl})`);
    out.push('');
  } else {
    out.push(`[Open the weekly review](${reviewUrl})`);
    out.push('');
  }

  return out.join('\n');
}

function titleCaseKind(kind: CaptureKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function pluralize(word: string, n: number): string {
  // Tiny pluralizer — only words this composer actually uses.
  if (n === 1) return word;
  return `${word}s`;
}
