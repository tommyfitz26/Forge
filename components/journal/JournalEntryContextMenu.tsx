'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { Bookmark, BookmarkCheck, Link2, Trash2 } from 'lucide-react';
import {
  ContextMenuItem,
  ContextMenuPopover,
  ContextMenuSeparator,
  ContextMenuTrigger,
  useContextMenuState,
  type UseContextMenuStateApi,
} from '@/components/ui/ContextMenu';
import { togglePin } from '@/app/(app)/top-of-mind/actions';
import { deleteJournalEntry } from '@/app/(app)/journal/actions';
import { LinkPalette } from '@/components/links/LinkPalette';

export type JournalEntryMenuTarget = {
  id: string;
  isPinned: boolean;
};

const Ctx = createContext<UseContextMenuStateApi<JournalEntryMenuTarget> | null>(null);

export function JournalEntryContextMenuProvider({ children }: { children: ReactNode }) {
  const api = useContextMenuState<JournalEntryMenuTarget>();
  const [linkSource, setLinkSource] = useState<{ id: string } | null>(null);

  return (
    <Ctx.Provider value={api}>
      {children}
      {linkSource && (
        <LinkPalette
          open
          onClose={() => setLinkSource(null)}
          source={{ kind: 'journal_entry', id: linkSource.id }}
        />
      )}
      <ContextMenuPopover state={api.state} onClose={api.close}>
        {api.state.open && (
          <>
            <ContextMenuItem
              primary
              onSelect={() => {
                if (!api.state.open) return;
                const fd = new FormData();
                fd.set('source_kind', 'journal_entry');
                fd.set('source_id', api.state.target.id);
                void togglePin(fd);
                api.close();
              }}
            >
              {api.state.target.isPinned ? (
                <>
                  <BookmarkCheck size={14} /> Unpin from Top of mind
                </>
              ) : (
                <>
                  <Bookmark size={14} /> Pin to Top of mind
                </>
              )}
            </ContextMenuItem>

            <ContextMenuItem
              onSelect={() => {
                if (!api.state.open) return;
                setLinkSource({ id: api.state.target.id });
                api.close();
              }}
            >
              <Link2 size={14} /> Link to…
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem
              destructive
              onSelect={() => {
                if (!api.state.open) return;
                void deleteJournalEntry(api.state.target.id);
                api.close();
              }}
            >
              <Trash2 size={14} /> Move to trash
            </ContextMenuItem>
          </>
        )}
      </ContextMenuPopover>
    </Ctx.Provider>
  );
}

function useApi(): UseContextMenuStateApi<JournalEntryMenuTarget> {
  const api = useContext(Ctx);
  if (!api) {
    throw new Error(
      'useJournalEntryContextMenu must be used inside JournalEntryContextMenuProvider',
    );
  }
  return api;
}

/** Wraps a journal entry article so right-click opens the menu. */
export function JournalEntryRow({
  target,
  className,
  children,
  style,
  id,
}: {
  target: JournalEntryMenuTarget;
  className?: string;
  children: ReactNode;
  style?: React.CSSProperties;
  /** Preserve the article's anchor id (`/journal#<entry-id>`). */
  id?: string;
}) {
  const api = useApi();
  return (
    <ContextMenuTrigger
      api={api}
      target={target}
      className={className}
      {...(id ? { id } : {})}
      {...(style ? { style } : {})}
    >
      {children}
    </ContextMenuTrigger>
  );
}
