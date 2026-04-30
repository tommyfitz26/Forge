import { Sparkles } from 'lucide-react';
import { listPendingFor } from '@/lib/db/link-suggestions';
import type { LinkSourceKind } from '@/lib/types/links';
import { SuggestionsList } from './SuggestionsList';

/**
 * Server component. Fetches pending AI link suggestions touching this
 * anchor (in either direction — anchor-as-source OR anchor-as-target) and
 * hands them to the client list component for rendering. Renders nothing
 * if there are no pending suggestions.
 *
 * Bidirectional matters because journal entries don't have a per-entry
 * detail page: a suggestion seeded by a journal save displays on the linked
 * capture / thread / project page so the user can act on it.
 */
export async function SuggestionsPanel({
  source,
}: {
  source: { kind: LinkSourceKind; id: string };
}) {
  const suggestions = await listPendingFor(source.kind, source.id);
  if (suggestions.length === 0) return null;

  return (
    <section className="forge-suggestions">
      <header className="forge-suggestions__head">
        <Sparkles size={14} className="forge-suggestions__head-ico" />
        <span>We think this might connect to:</span>
      </header>
      <SuggestionsList suggestions={suggestions} />
    </section>
  );
}
