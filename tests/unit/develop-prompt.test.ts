import { describe, it, expect } from 'vitest';
import { buildDevelopPrompt } from '@/lib/develop/prompt';
import type { Research } from '@/lib/ai/research-schema';
import type { CaptureKind } from '@/lib/capture/kinds';

const RESEARCH: Research = {
  competitors: [
    { name: 'Geekbot', url: 'https://geekbot.com', oneLiner: '5k+ teams; Slack-first.' },
    { name: 'Standuply', oneLiner: 'Jira integration.' },
  ],
  market_context: 'Async-first remote teams growing post-2024.',
  recent_news: [
    {
      title: 'Geekbot Series A',
      url: 'https://example.com/geekbot-a',
      summary: 'Raised $3.2M.',
      date: '2025-08-12',
    },
  ],
  angles: [
    { title: 'Voice-first wedge', reasoning: 'Existing players are text-first.' },
    { title: 'Calendar-native', reasoning: 'Skip Slack as the host.' },
  ],
  confidence: 'medium',
  sources_count: 9,
  generated_at: '2026-04-25T10:00:00Z',
};

const CAPTURE = {
  kind: 'idea' as CaptureKind,
  title: 'Voice-First Standup Bot',
  content: 'A bot that runs async standups by collecting voice memos.',
};

describe('buildDevelopPrompt', () => {
  describe('with research', () => {
    const prompt = buildDevelopPrompt({ capture: CAPTURE, research: RESEARCH });

    it('opens with the two-part framing', () => {
      expect(prompt).toContain('do two things, in order');
      expect(prompt).toContain('PART 1 — Audit + expand the research');
      expect(prompt).toContain('PART 2 — Pressure-test as a skeptical friend');
    });

    it('tells Claude to use web search liberally', () => {
      expect(prompt).toContain('web search liberally');
      expect(prompt).toContain('over-research than under-research');
    });

    it('embeds every research section', () => {
      expect(prompt).toContain('Geekbot');
      expect(prompt).toContain('https://geekbot.com');
      expect(prompt).toContain('Standuply');
      expect(prompt).toContain('Async-first remote teams');
      expect(prompt).toContain('Geekbot Series A');
      expect(prompt).toContain('2025-08-12');
      expect(prompt).toContain('Voice-first wedge');
    });

    it("uses the idea kind's full §4.6 question template", () => {
      expect(prompt).toMatch(/1\.\s+Who is the \*specific\* customer\?/);
      expect(prompt).toMatch(/2\.\s+Why now\?/);
      expect(prompt).toMatch(/3\.\s+What's the wedge/);
      expect(prompt).toMatch(/4\.\s+What's the strongest argument \*against\*/);
      expect(prompt).toMatch(/5\.\s+What would have to be true/);
    });

    it('bans motivational filler in the tone preface', () => {
      expect(prompt).toContain('No motivational filler');
      expect(prompt).toContain('"great idea"');
    });

    it('asks Claude to end with a 3-bullet summary', () => {
      expect(prompt).toContain('3-bullet summary I can paste back into Forge');
    });
  });

  describe('without research (research_status skipped/failed)', () => {
    const prompt = buildDevelopPrompt({ capture: CAPTURE, research: null });

    it('omits Part 1 entirely', () => {
      expect(prompt).not.toContain('PART 1');
      expect(prompt).not.toContain('Audit + expand');
    });

    it('still uses the §4.6 pressure-test header', () => {
      expect(prompt).toContain('Pressure-test as a skeptical friend');
    });

    it('omits the preliminary research block', () => {
      expect(prompt).not.toContain('Preliminary research');
      expect(prompt).not.toContain('Confidence:');
    });

    it('still includes the kind-specific template', () => {
      expect(prompt).toMatch(/Who is the \*specific\* customer\?/);
    });
  });

  describe('per-kind templates', () => {
    it.each([
      ['problem', /Who specifically experiences this/],
      ['idea', /Who is the \*specific\* customer/],
      ['observation', /What made this stick out to you/],
      ['research', /What specifically do you want to know/],
    ] as const)('routes %s captures to the right template', (kind, marker) => {
      const prompt = buildDevelopPrompt({
        capture: { ...CAPTURE, kind: kind as CaptureKind },
        research: null,
      });
      expect(prompt).toMatch(marker);
    });

    it('names the kind in the intro', () => {
      const idea = buildDevelopPrompt({ capture: { ...CAPTURE, kind: 'idea' }, research: null });
      const problem = buildDevelopPrompt({ capture: { ...CAPTURE, kind: 'problem' }, research: null });
      const research = buildDevelopPrompt({
        capture: { ...CAPTURE, kind: 'research' },
        research: null,
      });
      expect(idea).toContain('developing this idea');
      expect(problem).toContain('developing this problem');
      expect(research).toContain('developing this research question');
    });
  });

  describe('edge cases', () => {
    it('handles a capture with empty content gracefully', () => {
      const prompt = buildDevelopPrompt({
        capture: { ...CAPTURE, content: '' },
        research: null,
      });
      expect(prompt).toContain('_(no body)_');
    });

    it('handles research with no competitors / news / angles', () => {
      const sparse: Research = {
        competitors: [],
        market_context: 'TBD.',
        recent_news: [],
        angles: [],
        confidence: 'low',
        sources_count: 0,
        generated_at: '2026-04-25T10:00:00Z',
      };
      const prompt = buildDevelopPrompt({ capture: CAPTURE, research: sparse });
      expect(prompt).toContain('_None named._');
      expect(prompt).toContain('_None._');
      expect(prompt).toContain('_None considered._');
    });

    it('produces stable output across repeated calls (deterministic)', () => {
      const a = buildDevelopPrompt({ capture: CAPTURE, research: RESEARCH });
      const b = buildDevelopPrompt({ capture: CAPTURE, research: RESEARCH });
      expect(a).toBe(b);
    });
  });
});
