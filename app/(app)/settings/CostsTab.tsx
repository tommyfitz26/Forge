import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { CostsSummary } from '@/lib/db/settings-costs';

const dollarFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

function formatUsd(n: number): string {
  return dollarFmt.format(n);
}
function formatUsdShort(n: number): string {
  return n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`;
}

export function CostsTab({ data }: { data: CostsSummary }) {
  const max30Day = Math.max(0.001, ...data.trailing30Days.map((d) => d.totalUsd));

  return (
    <div className="forge-settings">
      {/* Month-to-date + budget bar */}
      <section className="forge-settings__row">
        <div className="forge-settings__hero">
          <div className="forge-settings__hero-label">Month to date</div>
          <div className="forge-settings__hero-num">{formatUsdShort(data.monthToDateUsd)}</div>
          <div className="forge-settings__hero-sub">
            of {formatUsdShort(data.monthlyBudgetUsd)} cap ·{' '}
            {data.pctUsed.toFixed(1)}% used
          </div>
          <div className="forge-settings__bar">
            <div
              className="forge-settings__bar-fill"
              data-warn={data.pctUsed >= 80 ? 'true' : 'false'}
              style={{ width: `${data.pctUsed}%` }}
            />
          </div>
        </div>

        <div className="forge-settings__sparkline">
          <div className="forge-settings__sparkline-label">
            Last 30 days
          </div>
          <div className="forge-settings__sparkline-bars">
            {data.trailing30Days.map((d) => (
              <div
                key={d.day}
                className="forge-settings__sparkline-bar"
                title={`${d.day} · ${formatUsdShort(d.totalUsd)}`}
                style={{ height: `${(d.totalUsd / max30Day) * 100}%` }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Per-task breakdown */}
      <section className="forge-settings__section">
        <h2 className="forge-settings__section-title">By task this month</h2>
        {data.perTask.length === 0 ? (
          <div className="forge-empty__msg" style={{ marginTop: 8 }}>
            Nothing logged this month yet.
          </div>
        ) : (
          <ul className="forge-settings__task-list">
            {data.perTask.map((t) => {
              const totalMtd = data.monthToDateUsd > 0 ? data.monthToDateUsd : 1;
              const pct = (t.totalUsd / totalMtd) * 100;
              return (
                <li key={t.task} className="forge-settings__task">
                  <div className="forge-settings__task-head">
                    <span className="forge-settings__task-name">{t.task}</span>
                    <span className="forge-settings__task-cost">{formatUsdShort(t.totalUsd)}</span>
                  </div>
                  <div className="forge-settings__bar forge-settings__bar--thin">
                    <div
                      className="forge-settings__bar-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="forge-settings__task-meta">
                    {t.callCount} {t.callCount === 1 ? 'call' : 'calls'}
                    {t.lastCallAt && (
                      <> · last {formatDistanceToNow(new Date(t.lastCallAt), { addSuffix: true })}</>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Recent expensive calls */}
      <section className="forge-settings__section">
        <h2 className="forge-settings__section-title">Top calls (last 30 days)</h2>
        {data.recentExpensive.length === 0 ? (
          <div className="forge-empty__msg" style={{ marginTop: 8 }}>
            No calls in the trailing window.
          </div>
        ) : (
          <table className="forge-settings__table">
            <thead>
              <tr>
                <th>When</th>
                <th>Task</th>
                <th>Provider</th>
                <th>In</th>
                <th>Out</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.recentExpensive.map((c) => (
                <tr key={c.id}>
                  <td>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</td>
                  <td>
                    {c.capture_id ? (
                      <Link
                        href={`/capture/${c.capture_id}`}
                        style={{ color: 'var(--ink-1)', textDecoration: 'none' }}
                      >
                        {c.task}
                      </Link>
                    ) : (
                      c.task
                    )}
                  </td>
                  <td>{c.provider}</td>
                  <td>{c.input_tokens ?? '—'}</td>
                  <td>{c.output_tokens ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatUsd(c.cost_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
