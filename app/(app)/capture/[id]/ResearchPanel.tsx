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
    <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Research
          </h2>
          <ResearchStatusBadge status={status} />
        </div>
        {showRetry && (
          <RetryResearchButton
            captureId={captureId}
            label={status === 'skipped' ? 'Run research' : 'Retry research'}
          />
        )}
      </div>

      {status === 'pending' && (
        <p className="text-sm text-neutral-500">
          Queued. The research job runs in the background — refresh in a minute.
        </p>
      )}
      {status === 'running' && (
        <p className="text-sm text-neutral-500">
          Sonnet is searching the web — usually under 30 seconds. Refresh soon.
        </p>
      )}
      {status === 'failed' && !parsed?.success && (
        <p className="text-sm text-neutral-500">
          The last attempt didn&rsquo;t produce a valid result. Try again?
        </p>
      )}
      {status === 'skipped' && (
        <p className="text-sm text-neutral-500">
          Auto-research only runs on idea/research captures. Trigger it manually if
          you want a competitive scan for this one.
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span>
          confidence: <span className="font-medium">{data.confidence}</span>
        </span>
        <span>·</span>
        <span>{data.sources_count} sources</span>
        <span>·</span>
        <span>{new Date(data.generated_at).toLocaleString()}</span>
      </div>

      {data.market_context && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Market context
          </h3>
          <p className="mt-1 text-sm leading-relaxed">{data.market_context}</p>
        </div>
      )}

      {data.competitors.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Competitors
          </h3>
          <ul className="mt-1 space-y-1 text-sm">
            {data.competitors.map((c, i) => (
              <li key={`${c.name}-${i}`}>
                <span className="font-medium">
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {c.name}
                    </a>
                  ) : (
                    c.name
                  )}
                </span>
                <span className="text-neutral-500"> — {c.oneLiner}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.angles.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Angles
          </h3>
          <ul className="mt-1 space-y-2 text-sm">
            {data.angles.map((a, i) => (
              <li key={`${a.title}-${i}`}>
                <div className="font-medium">{a.title}</div>
                <div className="text-neutral-600 dark:text-neutral-400">
                  {a.reasoning}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.recent_news.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Recent news
          </h3>
          <ul className="mt-1 space-y-1 text-sm">
            {data.recent_news.map((n, i) => (
              <li key={`${n.url}-${i}`}>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                >
                  {n.title}
                </a>
                {n.date && (
                  <span className="ml-1 text-xs text-neutral-500">({n.date})</span>
                )}
                <div className="text-neutral-600 dark:text-neutral-400">
                  {n.summary}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
