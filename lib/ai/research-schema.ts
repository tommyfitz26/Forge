import { z } from 'zod';

// SPEC §4.3 — output of research_idea task. The Sonnet model fills this via the
// terminal `submit_research` tool, so structural validity is guaranteed; the
// Zod parse here covers semantic correctness only (string emptiness, enum
// values, etc).
export const ResearchSchema = z.object({
  competitors: z.array(
    z.object({
      name: z.string().min(1),
      url: z.string().url().optional(),
      oneLiner: z.string().min(1),
    }),
  ),
  market_context: z.string().min(1),
  recent_news: z.array(
    z.object({
      title: z.string().min(1),
      url: z.string().url(),
      summary: z.string().min(1),
      date: z.string().optional(),
    }),
  ),
  angles: z.array(
    z.object({
      title: z.string().min(1),
      reasoning: z.string().min(1),
    }),
  ),
  confidence: z.enum(['low', 'medium', 'high']),
  sources_count: z.number().int().nonnegative(),
  generated_at: z.string().min(1),
});

export type Research = z.infer<typeof ResearchSchema>;

// JSON schema mirror used as the `submit_research` tool's input_schema.
// Hand-written rather than generated to keep us off another dependency for one
// schema; if more terminal-tool tasks land, switch to zod-to-json-schema.
export const RESEARCH_TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    competitors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          oneLiner: { type: 'string' },
        },
        required: ['name', 'oneLiner'],
      },
    },
    market_context: { type: 'string' },
    recent_news: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          summary: { type: 'string' },
          date: { type: 'string' },
        },
        required: ['title', 'url', 'summary'],
      },
    },
    angles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          reasoning: { type: 'string' },
        },
        required: ['title', 'reasoning'],
      },
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    sources_count: { type: 'integer', minimum: 0 },
    generated_at: { type: 'string' },
  },
  required: [
    'competitors',
    'market_context',
    'recent_news',
    'angles',
    'confidence',
    'sources_count',
    'generated_at',
  ],
  additionalProperties: false,
} as const;
