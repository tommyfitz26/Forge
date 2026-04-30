import { ResearchStatusBadge } from '@/components/ui/badge';
import { ResearchSchema } from '@/lib/ai/research-schema';
import type { ResearchStatus } from '@/lib/capture/kinds';
import { RetryResearchButton } from './RetryResearchButton';

type ResearchRow = {
  competitors: unknown;
  market_context: string | null;
  recent_news: unknown;
  angles: unknown;
  confidence: string | null;
  sources_count: number | null;
  generated_at: string;
};

export function ResearchPanel({
  captureId,
  status,
  research,
}: {
  captureId: string;
  status: ResearchStatus;
  research: ResearchRow | null;
}) {
  // Validate the row's JSON columns against the canonical schema. If the row
  // pre-dates a prompt change and no longer matches, fall back to a "failed"
  // render rather than crashing.
  const parsed = research
    ? ResearchSchema.safeParse({
        competitors: research.competitors ?? [],
        market_context: research.market_context ?? '',
        recent_news: research.recent_news ?? [],
        angles: research.angles ?? [],
        confidence: research.confidence,
        sources_count: research.sources_count,
        generated_at: research.generated_at,
      })
    : null;

  const showRetry = status === 'failed' || status === 'skipped';

  return (
    <section className="forge-research">
      <header className="forge-research__head">
        <div className="forge-research__title">
          <h2>Research</h2>
          <ResearchStatusBadge status={status} />
        </div>
        {showRetry && (
          <RetryResearchButton
            captureId={captureId}
            label={status === 'skipped' ? 'Run research' : 'Retry research'}
          />
        )}
      </header>

      {status === 'pending' && (
        <p className="forge-research__hint">
          Queued. The research job runs in the background — refresh in a minute.
        </p>
      )}
      {status === 'running' && (
        <p className="forge-research__hint">
          Sonnet is searching the web — usually under 30 seconds. Refresh soon.
        </p>
      )}
      {status === 'failed' && !parsed?.success && (
        <p className="forge-research__hint">
          The last attempt didn&rsquo;t produce a valid result. Try again?
        </p>
      )}
      {status === 'skipped' && (
        <p className="forge-research__hint">
          Auto-research only runs on idea / research captures. Trigger it manually
          if you want a competitive scan for this one.
        </p>
      )}

      {status === 'succeeded' && parsed?.success && (
        <ResearchBody data={parsed.data} />
      )}
    </section>
  );
}

function ResearchBody({
  data,
}: {
  data: import('zod').infer<typeof ResearchSchema>;
}) {
  return (
    <div className="forge-research__body">
      <div className="forge-research__meta">
        <span>
          confidence:{' '}
          <strong className="forge-research__meta-strong">{data.confidence}</strong>
        </span>
        <span className="forge-research__dot" />
        <span>{data.sources_count} sources</span>
        <span className="forge-research__dot" />
        <span>{new Date(data.generated_at).toLocaleString()}</span>
      </div>

      {data.market_context && (
        <div className="forge-research__section">
          <h3 className="forge-research__section-title">Market context</h3>
          <p className="forge-research__prose">{data.market_context}</p>
        </div>
      )}

      {data.competitors.length > 0 && (
        <div className="forge-research__section">
          <h3 className="forge-research__section-title">Competitors</h3>
          <ul className="forge-research__list">
            {data.competitors.map((c, i) => (
              <li key={`${c.name}-${i}`}>
                <span className="forge-research__list-name">
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {c.name}
                    </a>
                  ) : (
                    c.name
                  )}
                </span>
                <span className="forge-research__list-deck"> — {c.oneLiner}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.angles.length > 0 && (
        <div className="forge-research__section">
          <h3 className="forge-research__section-title">Angles</h3>
          <ul className="forge-research__angles">
            {data.angles.map((a, i) => (
              <li key={`${a.title}-${i}`}>
                <div className="forge-research__angle-title">{a.title}</div>
                <div className="forge-research__angle-reason">{a.reasoning}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.recent_news.length > 0 && (
        <div className="forge-research__section">
          <h3 className="forge-research__section-title">Recent news</h3>
          <ul className="forge-research__news">
            {data.recent_news.map((n, i) => (
              <li key={`${n.url}-${i}`}>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="forge-research__news-title"
                >
                  {n.title}
                </a>
                {n.date && (
                  <span className="forge-research__news-date">({n.date})</span>
                )}
                <div className="forge-research__news-summary">{n.summary}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
