import type { Research } from '@/lib/ai/research-schema';

// Compact formatter used to feed prior research into the nudge_question prompt.
// Keep this small — the goal is "remind the model that research exists and
// what its headline findings were", not "include the full blob." Caps each
// section to a hard upper bound so a sprawling research row can't blow the
// prompt budget.

const MAX_COMPETITORS = 5;
const MAX_NEWS = 1;
const MARKET_CONTEXT_CAP = 280;

export function summarizeResearch(research: Research | null): string {
  if (!research) return '(none)';

  const competitors =
    research.competitors.length === 0
      ? null
      : `Competitors: ${research.competitors
          .slice(0, MAX_COMPETITORS)
          .map((c) => c.name)
          .join(', ')}.`;

  const market =
    research.market_context.length > MARKET_CONTEXT_CAP
      ? `Market: ${research.market_context.slice(0, MARKET_CONTEXT_CAP - 1).trimEnd()}…`
      : `Market: ${research.market_context}`;

  const news =
    research.recent_news.length === 0
      ? null
      : `Recent: ${research.recent_news
          .slice(0, MAX_NEWS)
          .map((n) => (n.date ? `${n.title} (${n.date})` : n.title))
          .join('; ')}.`;

  const confidence = `Confidence: ${research.confidence}.`;

  return [competitors, market, news, confidence].filter(Boolean).join(' ');
}
