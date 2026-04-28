import { z } from 'zod';

// SPEC §4.4 — output of the nudge_question task. The model picks one Socratic
// question and a one-sentence reason (logged for prompt-iteration debugging,
// never shown to the user).
//
// Hard caps:
//   question — must end with '?', word-count enforced loosely (8–22) to keep
//   the push preview legible. Loose because Haiku occasionally lands at 7 or
//   24; we'd rather accept than retry.
//   reasoning — short; if the model rambles we still accept but flag in tests.

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const NudgeQuestionSchema = z.object({
  question: z
    .string()
    .min(8)
    .max(220)
    .refine((s) => s.trim().endsWith('?'), { message: 'question must end with ?' })
    .refine((s) => wordCount(s) >= 6 && wordCount(s) <= 30, {
      message: 'question must be 6–30 words',
    }),
  reasoning: z.string().min(1).max(300),
});

export type NudgeQuestion = z.infer<typeof NudgeQuestionSchema>;
