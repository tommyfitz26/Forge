import 'server-only';
import { z } from 'zod';
import { CAPTURE_KINDS } from '@/lib/capture/kinds';

// Title style per SPEC §4.2 rule 2: 4–8 words, Title Case, no trailing
// punctuation. The prompt enforces style; Zod enforces structural sanity only.
export const ClassifyCaptureSchema = z.object({
  kind: z.enum([...CAPTURE_KINDS]),
  title: z.string().min(1).max(80),
});

export type ClassifyCapture = z.infer<typeof ClassifyCaptureSchema>;

// Per-1M-token pricing in USD (SPEC Appendix A). Used to compute cost from
// usage.input_tokens + usage.output_tokens for api_costs logging.
type Pricing = { inputPer1M: number; outputPer1M: number };

export type TaskDef<TSchema extends z.ZodTypeAny> = {
  model: string;
  promptFile: string;
  outputSchema: TSchema;
  maxTokens: number;
  temperature: number;
  pricing: Pricing;
};

export const TASKS = {
  classify_capture: {
    model: 'claude-haiku-4-5',
    promptFile: 'classify_capture.md',
    outputSchema: ClassifyCaptureSchema,
    maxTokens: 200,
    temperature: 0,
    pricing: { inputPer1M: 1, outputPer1M: 5 },
  },
} as const satisfies Record<string, TaskDef<z.ZodTypeAny>>;

export type TaskName = keyof typeof TASKS;
