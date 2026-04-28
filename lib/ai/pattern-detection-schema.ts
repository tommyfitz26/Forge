import { z } from 'zod';

// SPEC §4.7 (Automatic) — output of the pattern_detection task. The model
// inspects up to 40 recent non-archived captures and returns pairs that may
// secretly be about the same underlying thing. The Sunday review surfaces the
// pairs as merge suggestions; the writer of `links` rows uses these
// (capture_a, capture_b) IDs verbatim with `kind = 'ai_suggested'`.
//
// Empty `pairs` is the common case (zero or one capture/week is the steady
// state); the schema must accept it cleanly.

const Pair = z
  .object({
    capture_a: z.string().uuid(),
    capture_b: z.string().uuid(),
    reasoning: z.string().min(1).max(400),
  })
  .refine((p) => p.capture_a !== p.capture_b, {
    message: 'capture_a and capture_b must be different captures',
  });

export const PatternDetectionSchema = z.object({
  pairs: z.array(Pair).max(20),
});

export type PatternDetection = z.infer<typeof PatternDetectionSchema>;
