import 'server-only';
import { z } from 'zod';
import { CAPTURE_KINDS } from '@/lib/capture/kinds';
import { ResearchSchema, RESEARCH_TOOL_INPUT_SCHEMA } from './research-schema';
import { NudgeQuestionSchema } from './nudge-schema';
import { WeeklySummarySchema } from './weekly-summary-schema';
import { PatternDetectionSchema } from './pattern-detection-schema';
import { SuggestLinksSchema } from './suggest-links-schema';

// Title style per SPEC §4.2 rule 2: 4–8 words, Title Case, no trailing
// punctuation. The prompt enforces style; Zod enforces structural sanity only.
//
// Phase 5.7 — `entities` is a new optional output (defaults to []) feeding
// the Atlas surface. Marginal Haiku cost is ~50–80 output tokens per call
// (well under $0.001 incremental).
export const ENTITY_KINDS = ['person', 'place', 'thing'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ClassifyCaptureSchema = z.object({
  kind: z.enum([...CAPTURE_KINDS]),
  title: z.string().min(1).max(80),
  entities: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        kind: z.enum(ENTITY_KINDS),
      }),
    )
    .max(20)
    .default([]),
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
    // Phase 5.7 bumped from 200 → 400 to leave headroom for the entities
    // array on entity-dense captures.
    maxTokens: 400,
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
  // SPEC §4.5 — composes the per-capture digest, patterns intro, and
  // ready-to-develop list for the Sunday review. Sonnet 4.6 because the
  // input includes full capture bodies + distilled research and the writing
  // bar is higher than the Haiku tasks. JSON-text output (no terminal tool):
  // the schema is small and the runner's JSON-retry path covers boundary
  // cases. ~3-6k input tokens at steady state, max 4k output for headroom on
  // a busy week.
  weekly_summary: {
    model: 'claude-sonnet-4-6',
    promptFile: 'weekly_summary.md',
    outputSchema: WeeklySummarySchema,
    maxTokens: 4000,
    temperature: 0.3,
    pricing: { inputPer1M: 3, outputPer1M: 15 },
  },
  // SPEC §4.7 (Automatic) — proposes pairs of captures that may be about the
  // same underlying thing. Sonnet 4.6 is needed for the cross-capture
  // pattern-spotting. Lower temperature than weekly_summary because we want
  // *fewer false positives* over more variety — the user sees these as merge
  // suggestions and over-eagerness erodes trust quickly.
  pattern_detection: {
    model: 'claude-sonnet-4-6',
    promptFile: 'pattern_detection.md',
    outputSchema: PatternDetectionSchema,
    maxTokens: 1500,
    temperature: 0.2,
    pricing: { inputPer1M: 3, outputPer1M: 15 },
  },
  // Phase 5.3 — per-save link suggestion. Fires after capture create / thread
  // section save / journal create. Sonnet 4.6 (per Tommy's call): the cross-
  // content judgment about what genuinely connects is non-trivial and Haiku
  // would over-eagerly link superficially-related items, eroding trust.
  // Temperature 0.2 to match pattern_detection — we want fewer false
  // positives over variety. JSON-text output (no terminal tool) — schema is
  // small and the runner's JSON-retry path covers boundary cases.
  suggest_links: {
    model: 'claude-sonnet-4-6',
    promptFile: 'suggest_links.md',
    outputSchema: SuggestLinksSchema,
    maxTokens: 800,
    temperature: 0.2,
    pricing: { inputPer1M: 3, outputPer1M: 15 },
  },
} as const satisfies Record<string, TaskDef<z.ZodTypeAny>>;

export type TaskName = keyof typeof TASKS;
