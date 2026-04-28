import type { CaptureKind } from '@/lib/capture/kinds';
import type { Research } from '@/lib/ai/research-schema';

// SPEC §4.6 (post-revision) — generates the prompt the user copies into an
// external Claude session to develop a capture. Pure function: deterministic,
// no LLM call, no DB read. Inputs come from the capture detail page's already
// loaded data, so the same string is rendered server-side and copied to the
// clipboard client-side.
//
// Two structures, picked by whether research is present:
//   - HAS research: Part 1 = audit + expand the prior research, Part 2 = §4.6
//     pressure-test using the kind's question template.
//   - NO research (research_status in {skipped, failed}): straight to the
//     §4.6 pressure-test — no Part 1.
//
// The kind-specific question banks come from SPEC §4.6 verbatim. Tone preface
// ("skeptical friend") is shared across kinds.

type TemplateQuestion = string;

const TEMPLATES: Record<CaptureKind, TemplateQuestion[]> = {
  problem: [
    'Who specifically experiences this — you, a defined group, or a broad market?',
    "How often does it happen, and what's the current workaround?",
    "What's the real cost (time, money, frustration) if no one solves it?",
    "Who's tried to solve it already? Why haven't they won?",
  ],
  idea: [
    'Who is the *specific* customer? Name someone you know who fits.',
    'Why now? What changed in the last 1–3 years that makes this possible or needed?',
    "What's the wedge — the smallest v1 a real person would pay for or use weekly?",
    "What's the strongest argument *against* this idea? Steelman it.",
    'What would have to be true for this to be a big company?',
  ],
  observation: [
    'What made this stick out to you? Why did you bother capturing it?',
    'Does this connect to anything else you have noticed lately?',
    'Is there a problem or an idea hiding in this observation?',
  ],
  research: [
    'What specifically do you want to know — frame the answerable question.',
    'What would you do differently if the answer is X vs Y?',
    'Is this a quick scan or a real investigation?',
  ],
};

const KIND_NOUN: Record<CaptureKind, string> = {
  problem: 'problem',
  idea: 'idea',
  observation: 'observation',
  research: 'research question',
};

const TONE_PREFACE = `Push back. Surface holes. Ask the uncomfortable question before offering support. No motivational filler — phrases like "great idea", "exciting", or "I love this" are banned. Stay brief; aim for ≤3 sentences per turn.`;

const PART1_RESEARCH_AUDIT = `# PART 1 — Audit + expand the research

The research below was produced by a smaller model with web search. Treat it as a starting point, NOT as ground truth. Verify the named competitors actually exist and do what's claimed; flag anything stale, wrong, or missing. Then go deeper: find competitors that were missed, more recent news (especially funding, launches, shutdowns, regulatory shifts), and refine the market context. Use web search liberally — I'd rather you over-research than under-research.

When you're done with Part 1, give me a structured replacement:
- **Competitors** — each with what they do, a real link, and why they matter
- **Market context** — a tightened paragraph
- **Recent news** — with dates and links
- **2–3 angles worth exploring** that I haven't considered`;

function numberedList(items: TemplateQuestion[]): string {
  return items.map((q, i) => `${i + 1}. ${q}`).join('\n');
}

function formatResearch(r: Research): string {
  const competitors =
    r.competitors.length === 0
      ? '_None named._'
      : r.competitors
          .map((c) => {
            const link = c.url ? ` (${c.url})` : '';
            return `- **${c.name}**${link} — ${c.oneLiner}`;
          })
          .join('\n');

  const news =
    r.recent_news.length === 0
      ? '_None._'
      : r.recent_news
          .map((n) => {
            const date = n.date ? ` (${n.date})` : '';
            return `- **${n.title}**${date} — ${n.summary} [${n.url}]`;
          })
          .join('\n');

  const angles =
    r.angles.length === 0
      ? '_None considered._'
      : r.angles.map((a) => `- **${a.title}** — ${a.reasoning}`).join('\n');

  return [
    `**Competitors:**\n${competitors}`,
    `**Market context:** ${r.market_context}`,
    `**Recent news:**\n${news}`,
    `**Angles considered so far:**\n${angles}`,
    `_Confidence: ${r.confidence}. Sources cited: ${r.sources_count}. Generated: ${r.generated_at}._`,
  ].join('\n\n');
}

export type DevelopPromptInput = {
  capture: {
    kind: CaptureKind;
    title: string;
    content: string;
  };
  research: Research | null;
};

export function buildDevelopPrompt({ capture, research }: DevelopPromptInput): string {
  const noun = KIND_NOUN[capture.kind];
  const questions = numberedList(TEMPLATES[capture.kind]);

  const intro =
    research !== null
      ? `I want your help developing this ${noun}. I captured it in my idea-tracker app ("Forge") and another AI did some preliminary research on it. Your job is to do two things, in order.`
      : `I want your help developing this ${noun}. I captured it in my idea-tracker app ("Forge"). Your job is to pressure-test it as a skeptical friend.`;

  const pressureTestHeader =
    research !== null
      ? '# PART 2 — Pressure-test as a skeptical friend'
      : '# Pressure-test as a skeptical friend';

  const pressureTestBody = `${TONE_PREFACE}

Walk me through these one at a time, in order. Don't ask the next one until I've answered the previous. If my answer is weak, push back before moving on.

${questions}

When we're done, give me a 3-bullet summary I can paste back into Forge.`;

  const captureBlock = `# The capture

**Kind:** ${capture.kind}
**Title:** ${capture.title}

${capture.content || '_(no body)_'}`;

  const researchBlock =
    research !== null
      ? `# Preliminary research (audit + expand this in Part 1)

${formatResearch(research)}`
      : '';

  const sections = [
    intro,
    research !== null ? PART1_RESEARCH_AUDIT : null,
    pressureTestHeader,
    pressureTestBody,
    '---',
    captureBlock,
    researchBlock || null,
  ].filter((s): s is string => s !== null && s.length > 0);

  return sections.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
