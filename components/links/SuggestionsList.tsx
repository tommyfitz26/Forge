'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import {
  ScrollText,
  Hammer,
  AlignLeft,
  PenLine,
  Check,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  acceptSuggestion,
  dismissSuggestion,
} from '@/app/(app)/links/suggestion-actions';
import type { HydratedSuggestion } from '@/lib/types/link-suggestions';
import type { LinkSourceKind } from '@/lib/types/links';

const KIND_ICON: Record<LinkSourceKind, LucideIcon> = {
  capture: ScrollText,
  project: Hammer,
  thread: AlignLeft,
  journal_entry: PenLine,
};

const KIND_LABEL: Record<LinkSourceKind, string> = {
  capture: 'capture',
  project: 'project',
  thread: 'thread',
  journal_entry: 'journal',
};

const AUTO_COLLAPSE_MS = 30_000;

/**
 * Inline list of AI link-suggestion chips. Each chip has Accept (writes a
 * `links` row with kind='inferred' and dismisses the suggestion) and Skip
 * (marks dismissed). After 30s of no interaction the panel collapses
 * visually — DB rows stay pending so they reappear on next page load.
 */
export function SuggestionsList({
  suggestions,
}: {
  suggestions: HydratedSuggestion[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Auto-collapse after 30s. UI only — backing rows stay pending.
  useEffect(() => {
    const handle = setTimeout(() => {
      setCollapsed(true);
    }, AUTO_COLLAPSE_MS);
    return () => clearTimeout(handle);
  }, []);

  if (collapsed) return null;

  const visible = suggestions.filter((s) => !resolvedIds.has(s.id));
  if (visible.length === 0) return null;

  function onAccept(id: string) {
    setPendingId(id);
    startTransition(async () => {
      try {
        await acceptSuggestion(id);
        setResolvedIds((prev) => new Set(prev).add(id));
      } finally {
        setPendingId(null);
      }
    });
  }

  function onSkip(id: string) {
    setPendingId(id);
    startTransition(async () => {
      try {
        await dismissSuggestion(id);
        setResolvedIds((prev) => new Set(prev).add(id));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <ul className="forge-suggestions__list">
      {visible.map((s) => {
        const Icon = KIND_ICON[s.other_kind];
        const isPending = pendingId === s.id;
        return (
          <li
            key={s.id}
            className="forge-suggestions__chip"
            data-pending={isPending ? 'true' : 'false'}
          >
            <Link
              href={s.other_href}
              className="forge-suggestions__chip-link"
            >
              <Icon size={13} className="forge-suggestions__chip-ico" />
              <span className="forge-suggestions__chip-title">{s.other_title}</span>
              <span className="forge-suggestions__chip-kind">
                {KIND_LABEL[s.other_kind]}
              </span>
            </Link>
            <p className="forge-suggestions__chip-reason">{s.reason}</p>
            <div className="forge-suggestions__chip-actions">
              <button
                type="button"
                className="forge-btn forge-btn--primary"
                onClick={() => onAccept(s.id)}
                disabled={isPending}
              >
                <Check size={12} /> Accept
              </button>
              <button
                type="button"
                className="forge-btn forge-btn--ghost"
                onClick={() => onSkip(s.id)}
                disabled={isPending}
              >
                <X size={12} /> Skip
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
