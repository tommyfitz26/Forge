import { describe, it, expect } from 'vitest';
import { loadPrompt } from '@/lib/ai/prompts';

describe('research.md prompt', () => {
  it('loads and substitutes all required vars', async () => {
    const out = await loadPrompt('research.md', {
      kind: 'idea',
      title: 'Voice First Standup Bot',
      content: 'Slack standup that you talk into instead of typing.',
    });
    expect(out).toContain('idea');
    expect(out).toContain('Voice First Standup Bot');
    expect(out).toContain('Slack standup that you talk into');
    // Sanity: prompt actually instructs model to call submit_research.
    expect(out).toContain('submit_research');
    expect(out).toContain('web_search');
    // No template tokens should remain after substitution.
    expect(out).not.toMatch(/\{\{\s*\w+\s*\}\}/);
  });
});
