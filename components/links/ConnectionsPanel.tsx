import Link from 'next/link';
import {
  ScrollText,
  Hammer,
  AlignLeft,
  PenLine,
  Link2,
  Sparkles,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { listConnectionsFor } from '@/lib/db/links';
import type { Connection, LinkKind, LinkSourceKind } from '@/lib/types/links';
import { ConnectionRow } from './ConnectionRow';
import { OpenLinkPaletteButton } from './OpenLinkPaletteButton';

const KIND_ICON: Record<LinkSourceKind, LucideIcon> = {
  capture: ScrollText,
  project: Hammer,
  thread: AlignLeft,
  journal_entry: PenLine,
};

const LINK_KIND_ICON: Record<LinkKind, LucideIcon> = {
  manual: Link2,
  inferred: Sparkles,
  ai_suggested: Search,
};

const LINK_KIND_LABEL: Record<LinkKind, string> = {
  manual: 'manual',
  inferred: 'AI suggestion',
  ai_suggested: 'pattern detected',
};

/**
 * Server component. Renders the Connections panel for a detail page —
 * inbound + outbound links across all 4 source kinds. Shows the LLM
 * reasoning text inline below the row when present.
 */
export async function ConnectionsPanel({
  source,
}: {
  source: { kind: LinkSourceKind; id: string };
}) {
  const connections = await listConnectionsFor(source.kind, source.id);
  const outbound = connections.filter((c) => c.direction === 'out');
  const inbound = connections.filter((c) => c.direction === 'in');

  const empty = outbound.length === 0 && inbound.length === 0;

  return (
    <section className="forge-connections">
      <header className="forge-connections__head">
        <h2>Connections</h2>
        <OpenLinkPaletteButton source={source} />
      </header>

      {empty ? (
        <div className="forge-connections__empty">
          Nothing linked yet. Use{' '}
          <em style={{ fontStyle: 'italic' }}>Link to…</em> from the right-click
          menu, or the <strong>+ Link</strong> button above.
        </div>
      ) : (
        <div className="forge-connections__cols">
          {outbound.length > 0 && (
            <div className="forge-connections__col">
              <div className="forge-connections__col-label">Links from this</div>
              <ul>
                {outbound.map((c) => (
                  <ConnectionLi key={c.id} c={c} />
                ))}
              </ul>
            </div>
          )}
          {inbound.length > 0 && (
            <div className="forge-connections__col">
              <div className="forge-connections__col-label">Links to this</div>
              <ul>
                {inbound.map((c) => (
                  <ConnectionLi key={c.id} c={c} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ConnectionLi({ c }: { c: Connection }) {
  const KindIcon = KIND_ICON[c.other_kind];
  const LinkKindIcon = LINK_KIND_ICON[c.link_kind];
  return (
    <li className="forge-connections__li">
      <Link href={c.other_href} className="forge-connections__link">
        <KindIcon size={13} className="forge-connections__kind-ico" />
        <span className="forge-connections__title">{c.other_title}</span>
      </Link>
      <div className="forge-connections__sub">
        <LinkKindIcon size={11} />
        <span>{LINK_KIND_LABEL[c.link_kind]}</span>
        <ConnectionRow id={c.id} />
      </div>
      {c.reason && <p className="forge-connections__reason">{c.reason}</p>}
    </li>
  );
}
