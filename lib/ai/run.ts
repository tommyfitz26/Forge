import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getAnthropic } from './anthropic';
import { loadPrompt } from './prompts';
import { TASKS, type TaskName } from './tasks';
import {
  extractText,
  extractTerminalToolInput,
  type ContentBlock,
} from './extract-tool-output';
import { createServiceClient } from '@/lib/supabase/service';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export class BudgetExceededError extends Error {
  constructor(public readonly spent: number, public readonly cap: number) {
    super(`Monthly LLM budget exceeded: $${spent.toFixed(4)} / $${cap.toFixed(2)}`);
  }
}

export class TaskValidationError extends Error {
  constructor(
    public readonly task: TaskName,
    public readonly issues: z.ZodIssue[],
    public readonly raw: string,
  ) {
    super(`Task ${task} failed schema validation after retry`);
  }
}

const STRICTER_RETRY_INSTRUCTION =
  'Your previous response could not be parsed as the required JSON. Respond again with ONLY valid JSON matching the exact shape specified — no prose, no code fences, no commentary.';

const TERMINAL_TOOL_RETRY_INSTRUCTION = (toolName: string) =>
  `Your previous response did not call ${toolName}. Continue from where you stopped, then call ${toolName} exactly once as your final action with the complete structured payload.`;

async function monthToDateCostUsd(): Promise<number> {
  // SPEC §11.2: pre-call check against MAX_MONTHLY_COST_USD. UTC month — the
  // cutover instant doesn't matter for a monthly cap.
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const service = createServiceClient();
  const { data, error } = await service
    .from('api_costs')
    .select('cost_usd')
    .gte('created_at', start.toISOString());
  if (error) {
    // Fail open: a logging-table read failure should not block the user.
    logger.warn('budget.read_failed', { err: error.message });
    return 0;
  }
  return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
}

function tryParseJson(raw: string): unknown {
  // Be forgiving: strip a single ```json … ``` fence if the model added one
  // despite instructions. Don't go further than that — repeated fallbacks
  // mask prompt drift.
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const text = fenced ? (fenced[1] ?? '') : raw;
  return JSON.parse(text);
}

export async function runTask<T extends TaskName>(
  task: T,
  vars: Record<string, string>,
  context?: { captureId?: string },
): Promise<z.infer<(typeof TASKS)[T]['outputSchema']>> {
  const def = TASKS[task];

  const spent = await monthToDateCostUsd();
  if (spent >= env.MAX_MONTHLY_COST_USD) {
    logger.warn('budget.exceeded', { task, spent, cap: env.MAX_MONTHLY_COST_USD });
    throw new BudgetExceededError(spent, env.MAX_MONTHLY_COST_USD);
  }

  const userPrompt = await loadPrompt(def.promptFile, vars);
  const anthropic = getAnthropic();

  // SPEC §11.3 baseline system prompt, applied to every task.
  const SYSTEM_BASELINE =
    "You are Forge, a thinking partner for a single user developing startup ideas and thinking through problems. Your stance is 'skeptical friend': you pressure-test ideas, surface holes, and ask the uncomfortable question before offering support. You avoid motivational filler. You are brief. You always respond in the exact JSON shape specified below.";

  const usesTerminalTool = 'terminalToolName' in def && typeof (def as { terminalToolName?: string }).terminalToolName === 'string';
  const terminalToolName = usesTerminalTool
    ? (def as { terminalToolName: string }).terminalToolName
    : null;
  const taskTools =
    'tools' in def ? ((def as { tools?: unknown[] }).tools ?? null) : null;

  const baseRequest = {
    model: def.model,
    max_tokens: def.maxTokens,
    temperature: def.temperature,
    system: SYSTEM_BASELINE,
    ...(taskTools ? { tools: taskTools } : {}),
  };

  let raw = '';
  let totalCostUsd = 0;
  let lastIssues: z.ZodIssue[] | null = null;
  let lastTerminalCallMissing = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const messages =
      attempt === 0
        ? [{ role: 'user' as const, content: userPrompt }]
        : [
            { role: 'user' as const, content: userPrompt },
            { role: 'assistant' as const, content: raw },
            {
              role: 'user' as const,
              content:
                lastTerminalCallMissing && terminalToolName
                  ? TERMINAL_TOOL_RETRY_INSTRUCTION(terminalToolName)
                  : STRICTER_RETRY_INSTRUCTION,
            },
          ];

    const started = Date.now();
    // SDK params type doesn't union server tools (web_search) with custom
    // tools cleanly; we intentionally pass both shapes — the API accepts them.
    // Cast keeps the non-streaming Message return type inferred correctly.
    const params = {
      ...baseRequest,
      messages,
    } as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming;
    const resp: Anthropic.Messages.Message = await anthropic.messages.create(params);
    const elapsedMs = Date.now() - started;

    const blocks = resp.content as ContentBlock[];
    raw = extractText(blocks);

    const inputTokens = resp.usage?.input_tokens ?? 0;
    const outputTokens = resp.usage?.output_tokens ?? 0;
    const callCost =
      (inputTokens * def.pricing.inputPer1M + outputTokens * def.pricing.outputPer1M) /
      1_000_000;
    totalCostUsd += callCost;

    logger.info('task.call', {
      task,
      attempt,
      mode: terminalToolName ? 'tool' : 'json',
      inputTokens,
      outputTokens,
      callCostUsd: Number(callCost.toFixed(6)),
      elapsedMs,
    });

    let parsed: unknown;
    if (terminalToolName) {
      parsed = extractTerminalToolInput(blocks, terminalToolName);
      if (parsed === undefined) {
        lastTerminalCallMissing = true;
        lastIssues = [
          {
            code: 'custom',
            path: [],
            message: `Model did not call terminal tool ${terminalToolName}`,
          } as z.ZodIssue,
        ];
        continue;
      }
      lastTerminalCallMissing = false;
    } else {
      try {
        parsed = tryParseJson(raw);
      } catch {
        lastIssues = [
          { code: 'custom', path: [], message: 'Output was not valid JSON' } as z.ZodIssue,
        ];
        continue;
      }
    }

    const result = def.outputSchema.safeParse(parsed);
    if (result.success) {
      await logCost(task, totalCostUsd, context?.captureId);
      return result.data as z.infer<(typeof TASKS)[T]['outputSchema']>;
    }
    lastIssues = result.error.issues;
  }

  // Both attempts failed — still log the cost we actually incurred so the
  // monthly budget reflects the spend, then surface a typed error.
  await logCost(task, totalCostUsd, context?.captureId);
  throw new TaskValidationError(task, lastIssues ?? [], raw);
}

async function logCost(
  task: TaskName,
  costUsd: number,
  captureId: string | undefined,
): Promise<void> {
  if (costUsd <= 0) return;
  try {
    const service = createServiceClient();
    await service.from('api_costs').insert({
      provider: 'anthropic',
      task,
      capture_id: captureId ?? null,
      input_tokens: null,
      output_tokens: null,
      cost_usd: Number(costUsd.toFixed(6)),
    });
  } catch (err) {
    logger.warn('task.cost_log_failed', {
      task,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
