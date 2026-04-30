import { Download, Database } from 'lucide-react';
import type { ExportCounts } from '@/lib/export/build-export';

const ROWS: Array<{ key: keyof Omit<ExportCounts, 'total'>; label: string }> = [
  { key: 'captures', label: 'Captures' },
  { key: 'projects', label: 'Projects' },
  { key: 'threads', label: 'Threads' },
  { key: 'journal_entries', label: 'Journal entries' },
  { key: 'tags', label: 'Tags' },
  { key: 'pins', label: 'Pins' },
  { key: 'intentions', label: "Today's-focus history" },
  { key: 'links', label: 'Links' },
  { key: 'capture_events', label: 'Capture events' },
  { key: 'content_versions', label: 'Content versions' },
];

export function ExportTab({ counts }: { counts: ExportCounts }) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `forge-export-${dateStamp}.json`;

  return (
    <div className="forge-settings">
      <section className="forge-settings__section">
        <h2 className="forge-settings__section-title">Export your data</h2>
        <p
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            color: 'var(--ink-2)',
            fontSize: 14.5,
            lineHeight: 1.55,
            margin: '0 0 14px',
          }}
        >
          One JSON file with everything you&apos;ve captured. Take it with you
          anywhere — paste it into another tool, archive it, or just keep a
          backup.
        </p>

        <div className="forge-settings__export-counts">
          {ROWS.map((r) => (
            <div key={r.key} className="forge-settings__export-row">
              <span>{r.label}</span>
              <span className="forge-settings__export-count">
                {counts[r.key].toLocaleString()}
              </span>
            </div>
          ))}
          <div className="forge-settings__export-row forge-settings__export-row--total">
            <span>Total rows</span>
            <span className="forge-settings__export-count">
              {counts.total.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="forge-settings__export-actions">
          <a
            href="/api/export"
            download={filename}
            className="forge-btn forge-btn--primary"
          >
            <Download size={14} /> Download {filename}
          </a>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--ink-3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Database size={11} /> Snapshot generated server-side
          </span>
        </div>

        <details
          style={{
            marginTop: 18,
            fontFamily: 'var(--serif)',
            fontSize: 13.5,
            color: 'var(--ink-2)',
            lineHeight: 1.55,
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'var(--ink-3)',
              marginBottom: 6,
            }}
          >
            What&apos;s NOT included
          </summary>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>API spending logs (kept on the server, not user content).</li>
            <li>
              Background-job run history and stuck-lease data (infrastructure
              telemetry).
            </li>
            <li>
              AI research outputs and pending suggestions — they&apos;re
              derived; re-run on demand.
            </li>
            <li>
              Push-notification subscriptions (device-specific, not portable).
            </li>
            <li>
              Weekly review digests (composed from captures; can be regenerated).
            </li>
          </ul>
        </details>
      </section>
    </div>
  );
}
