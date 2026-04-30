import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import type { HealthSummary, JobStatusKind } from '@/lib/db/settings-health';

const STATUS_COPY: Record<JobStatusKind, { label: string; tone: string }> = {
  green: { label: 'Healthy', tone: 'green' },
  yellow: { label: 'Overdue', tone: 'yellow' },
  red: { label: 'Failed', tone: 'red' },
  grey: { label: 'No telemetry', tone: 'grey' },
};

export function HealthTab({ data }: { data: HealthSummary }) {
  return (
    <div className="forge-settings">
      {data.stuckLeases.length > 0 && (
        <section
          className="forge-settings__alert"
          role="alert"
        >
          <AlertTriangle size={14} className="forge-settings__alert-ico" />
          <div>
            <strong>
              {data.stuckLeases.length} stuck{' '}
              {data.stuckLeases.length === 1 ? 'lease' : 'leases'}.
            </strong>{' '}
            <span style={{ color: 'var(--ink-2)' }}>
              The hourly research-recovery sweep should clear these automatically.
              If they linger, investigate.
            </span>
            <ul className="forge-settings__alert-list">
              {data.stuckLeases.map((s) => (
                <li key={s.id}>
                  <code>{s.job_name}</code> — running for {s.ageMinutes} min
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="forge-settings__section">
        <h2 className="forge-settings__section-title">Cron health</h2>
        <ul className="forge-settings__job-list">
          {data.jobs.map(({ job, status, lastRun, dailyGrid }) => {
            const sc = STATUS_COPY[status];
            return (
              <li key={job.jobName} className="forge-settings__job">
                <div className="forge-settings__job-head">
                  <span
                    className="forge-settings__pill"
                    data-tone={sc.tone}
                    title={sc.label}
                  >
                    {sc.label}
                  </span>
                  <span className="forge-settings__job-label">{job.label}</span>
                  <span className="forge-settings__job-cron">
                    <code>{job.cron}</code> · {job.tz}
                  </span>
                </div>
                <div className="forge-settings__job-desc">{job.description}</div>
                <div className="forge-settings__job-row">
                  <div className="forge-settings__job-meta">
                    {lastRun ? (
                      <>
                        Last run{' '}
                        <strong>
                          {formatDistanceToNow(new Date(lastRun.started_at), {
                            addSuffix: true,
                          })}
                        </strong>
                        {lastRun.error && (
                          <>
                            {' '}
                            <span style={{ color: 'var(--hot, #b94747)' }}>
                              · {lastRun.error}
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <em>No run history yet</em>
                    )}
                  </div>
                  <DailyGrid grid={dailyGrid} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function DailyGrid({
  grid,
}: {
  grid: Array<{ day: string; succeeded: number; failed: number }>;
}) {
  return (
    <div className="forge-settings__grid" aria-label="Last 7 days">
      {grid.map((c) => {
        const tone =
          c.failed > 0 ? 'red' : c.succeeded > 0 ? 'green' : 'empty';
        return (
          <div
            key={c.day}
            className="forge-settings__grid-cell"
            data-tone={tone}
            title={`${c.day} · ${c.succeeded} ok, ${c.failed} failed`}
          />
        );
      })}
    </div>
  );
}
