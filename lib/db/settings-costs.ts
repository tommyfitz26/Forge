// Phase 5.4 — /settings/costs data fetcher.
//
// All queries hit `api_costs`. Single-user app: RLS doesn't gate this table
// (it's per-row metadata, not user-scoped — see SPEC §11.2). We just trust
// the OWNER_EMAIL gate at the route level.

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export type CostsSummary = {
  monthToDateUsd: number;
  monthlyBudgetUsd: number;
  pctUsed: number;
  perTask: Array<{
    task: string;
    totalUsd: number;
    callCount: number;
    lastCallAt: string | null;
  }>;
  trailing30Days: Array<{ day: string; totalUsd: number }>;
  recentExpensive: Array<{
    id: string;
    task: string;
    provider: string;
    cost_usd: number;
    input_tokens: number | null;
    output_tokens: number | null;
    created_at: string;
    capture_id: string | null;
  }>;
};

const TRAILING_DAYS = 30;

export async function getCostsSummary(): Promise<CostsSummary> {
  const supabase = await untypedSupabase();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  const trailingStart = new Date(Date.now() - TRAILING_DAYS * 86_400_000);
  trailingStart.setUTCHours(0, 0, 0, 0);
  const trailingStartIso = trailingStart.toISOString();

  // Pull all rows in the trailing-30 window in one go — small enough.
  // Includes month-to-date as a subset.
  const { data, error } = await supabase
    .from('api_costs')
    .select('id, task, provider, cost_usd, input_tokens, output_tokens, created_at, capture_id')
    .gte('created_at', trailingStartIso)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    logger.error('settings.costs.failed', { err: error.message });
    return emptySummary();
  }

  const rows = (data ?? []) as Array<{
    id: string;
    task: string;
    provider: string;
    cost_usd: number;
    input_tokens: number | null;
    output_tokens: number | null;
    created_at: string;
    capture_id: string | null;
  }>;

  // Month-to-date sum.
  const mtdRows = rows.filter((r) => r.created_at >= monthStartIso);
  const monthToDateUsd = mtdRows.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);

  // Per-task aggregate — month-to-date only (helps focus on what's
  // actually being spent THIS month, not the trailing window).
  const taskMap = new Map<
    string,
    { totalUsd: number; callCount: number; lastCallAt: string | null }
  >();
  for (const r of mtdRows) {
    const prev = taskMap.get(r.task) ?? { totalUsd: 0, callCount: 0, lastCallAt: null };
    prev.totalUsd += Number(r.cost_usd ?? 0);
    prev.callCount += 1;
    if (!prev.lastCallAt || r.created_at > prev.lastCallAt) prev.lastCallAt = r.created_at;
    taskMap.set(r.task, prev);
  }
  const perTask = [...taskMap.entries()]
    .map(([task, v]) => ({ task, ...v }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  // Trailing-30-days bucketed by ISO day.
  const dayMap = new Map<string, number>();
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + Number(r.cost_usd ?? 0));
  }
  const trailing30Days: Array<{ day: string; totalUsd: number }> = [];
  const cursor = new Date(trailingStart);
  for (let i = 0; i < TRAILING_DAYS; i++) {
    const day = cursor.toISOString().slice(0, 10);
    trailing30Days.push({ day, totalUsd: dayMap.get(day) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Top-cost recent calls.
  const recentExpensive = [...rows]
    .sort((a, b) => Number(b.cost_usd ?? 0) - Number(a.cost_usd ?? 0))
    .slice(0, 10);

  const monthlyBudgetUsd = env.MAX_MONTHLY_COST_USD;
  const pctUsed =
    monthlyBudgetUsd > 0 ? Math.min(100, (monthToDateUsd / monthlyBudgetUsd) * 100) : 0;

  return {
    monthToDateUsd,
    monthlyBudgetUsd,
    pctUsed,
    perTask,
    trailing30Days,
    recentExpensive,
  };
}

function emptySummary(): CostsSummary {
  return {
    monthToDateUsd: 0,
    monthlyBudgetUsd: env.MAX_MONTHLY_COST_USD,
    pctUsed: 0,
    perTask: [],
    trailing30Days: [],
    recentExpensive: [],
  };
}
