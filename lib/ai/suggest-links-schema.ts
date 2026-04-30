import { z } from 'zod';
import { LINK_SOURCE_KINDS } from '@/lib/types/links';

// Output of the suggest_links task. Sonnet picks 0–3 items from a candidate
// list with a short reason each. We cap reasoning length so a verbose model
// doesn't blow up the inline suggestion chip; the prompt asks for 15–30
// words but Zod just enforces sanity bounds.

export const SuggestLinksSchema = z.object({
  picks: z
    .array(
      z.object({
        target_kind: z.enum([...LINK_SOURCE_KINDS]),
        target_id: z.string().uuid(),
        reasoning: z.string().trim().min(1).max(280),
      }),
    )
    .max(3),
});

export type SuggestLinks = z.infer<typeof SuggestLinksSchema>;
