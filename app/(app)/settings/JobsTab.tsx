import { formatDistanceToNow } from 'date-fns';
import type { JobsSummary } from '@/lib/db/settings-jobs';

const TONE_BY_STATUS: Record<'running' | 'succeeded' | 'failed', string> = {
  running: 'yellow',
  succeeded: 'green',
  failed: 'red',
};

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function JobsTab({ data }: { data: JobsSummary }) {
  return (
    <div className="forge-settings">
      {data.jobs.map(({ job, invocations }) => (
        <section key={job.jobName} className="forge-settings__job-card">
          <header className="forge-settings__job-card-head">
            <div>
              <div className="forge-settings__job-label">{job.label}</div>
              <div className="forge-settings__job-cron">
                <code>{job.cron}</code> · {job.tz}
              </div>
            </div>
            <div className="forge-settings__job-card-url">
              <code>{job.url}</code>
            </div>
          </header>
          <div className="forge-settings__job-desc">{job.description}</div>

          {!job.hasRunHistory ? (
            <div className="forge-empty__msg" style={{ marginTop: 12, textAlign: 'left' }}>
              This job runs but doesn&apos;t claim a <code>job_runs</code> row, so per-invocation
              telemetry isn&apos;t available. Healthy if the captures it sweeps don&apos;t pile up
              in <code>research_status=&apos;running&apos;</code>.
            </div>
          ) : invocations.length === 0 ? (
            <div className="forge-empty__msg" style={{ marginTop: 12, textAlign: 'left' }}>
              No runs in the last 7 days.
            </div>
          ) : (
            <table className="forge-settings__table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {invocations.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      {formatDistanceToNow(new Date(inv.started_at), { addSuffix: true })}
                    </td>
                    <td>
                      <span
                        className="forge-settings__pill"
                        data-tone={TONE_BY_STATUS[inv.status]}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatDuration(inv.durationMs)}
                    </td>
                    <td className="forge-settings__job-card-notes">
                      {inv.error ? (
                        <span style={{ color: 'var(--hot, #b94747)' }}>{inv.error}</span>
                      ) : inv.result ? (
                        <code>{summarizeResult(inv.result)}</code>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}

function summarizeResult(r: Record<string, unknown>): string {
  // Pull the most informative fields out of the result blob.
  const interesting = [
    'sent', 'expired', 'failed',
    'usersNudged', 'targets', 'userCount',
    'captureId', 'nudgeId',
    'reason', 'skipped',
  ];
  const parts: string[] = [];
  for (const key of interesting) {
    if (key in r) parts.push(`${key}=${String(r[key])}`);
    if (parts.length >= 4) break;
  }
  return parts.length ? parts.join(' · ') : 'ok';
}
