import 'server-only';
import { z } from 'zod';
import { CAPTURE_KINDS } from '@/lib/capture/kinds';
import { ResearchSchema, RESEARCH_TOOL_INPUT_SCHEMA } from './research-schema';
import { NudgeQuestionSchema } from './nudge-schema';

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

// Tool-as-output pattern (SPEC §11.2): tasks may declare `tools` and a
// `terminalToolName`. The runner finds the last `tool_use` block whose name
// matches and uses its `input` as the parsed result, skipping JSON-text
// extraction. Anthropic server tools (e.g. web_search) coexist in the same
// array; only the terminal tool's `input` is treated as output.
type ServerTool = {
  type: string;
  name: string;
  max_uses?: number;
};
type CustomTool = {
  name: string;
  description: string;
  input_schema: object;
};
export type AnyTool = ServerTool | CustomTool;

export type TaskDef<TSchema extends z.ZodTypeAny> = {
  model: string;
  promptFile: string;
  outputSchema: TSchema;
  maxTokens: number;
  temperature: number;
  pricing: Pricing;
  tools?: AnyTool[];
  /** If set, runner extracts output from the matching tool_use block. */
  terminalToolName?: string;
};

// web_search server tool — the dated identifier MUST be the current one from
// Anthropic's docs at the time of edit, NOT copied from SPEC §11.1. The SDK
// rejects unknown identifiers. Last verified: 2026-04-27.
const WEB_SEARCH_TOOL_TYPE = 'web_search_20260209';

export const TASKS = {
  classify_capture: {
    model: 'claude-haiku-4-5',
    promptFile: 'classify_capture.md',
    outputSchema: ClassifyCaptureSchema,
    maxTokens: 200,
    temperature: 0,
    pricing: { inputPer1M: 1, outputPer1M: 5 },
  },
  research_idea: {
    model: 'claude-sonnet-4-6',
    promptFile: 'research.md',
    outputSchema: ResearchSchema,
    maxTokens: 4000,
    temperature: 0.3,
    pricing: { inputPer1M: 3, outputPer1M: 15 },
    tools: [
      { type: WEB_SEARCH_TOOL_TYPE, name: 'web_search', max_uses: 8 },
      {
        name: 'submit_research',
        description:
          'Submit the final structured research result. Call this exactly once after gathering enough information via web_search.',
        input_schema: RESEARCH_TOOL_INPUT_SCHEMA,
      },
    ],
    terminalToolName: 'submit_research',
  },
  // SPEC §4.4 — generates one Socratic question per nudge slot. Haiku 4.5 is
  // the right tool: ~$0.0002 per call, runs 2x/day. Temperature 0.4 keeps
  // questions varied across days for the same capture without going off-rails.
  nudge_question: {
    model: 'claude-haiku-4-5',
    promptFile: 'nudge_question.md',
    outputSchema: NudgeQuestionSchema,
    maxTokens: 200,
    temperature: 0.4,
    pricing: { inputPer1M: 1, outputPer1M: 5 },
  },
} as const satisfies Record<string, TaskDef<z.ZodTypeAny>>;

export type TaskName = keyof typeof TASKS;
