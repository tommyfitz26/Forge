'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, BookmarkCheck, Trash2 } from 'lucide-react';
import {
  ContextMenuItem,
  ContextMenuPopover,
  ContextMenuSeparator,
  ContextMenuTrigger,
  useContextMenuState,
  type UseContextMenuStateApi,
} from '@/components/ui/ContextMenu';
import { unpinItem } from '@/app/(app)/top-of-mind/actions';
import { deleteJournalEntry } from '@/app/(app)/journal/actions';
import { trashThread, trashProject } from '@/app/(app)/trash/actions';
import type { PinSourceKind } from '@/lib/types/pins';

export type PinnedCardMenuTarget = {
  sourceKind: PinSourceKind;
  sourceId: string;
  href: string;
};

const Ctx = createContext<UseContextMenuStateApi<PinnedCardMenuTarget> | null>(null);

export function PinnedCardContextMenuProvider({ children }: { children: ReactNode }) {
  const api = useContextMenuState<PinnedCardMenuTarget>();
  const router = useRouter();

  return (
    <Ctx.Provider value={api}>
      {children}
      <ContextMenuPopover state={api.state} onClose={api.close}>
        {api.state.open && (
          <>
            <ContextMenuItem
              primary
              onSelect={() => {
                if (!api.state.open) return;
                router.push(api.state.target.href);
                api.close();
              }}
            >
              <ArrowUpRight size={14} /> Open
            </ContextMenuItem>

            <ContextMenuItem
              onSelect={() => {
                if (!api.state.open) return;
                const fd = new FormData();
                fd.set('source_kind', api.state.target.sourceKind);
                fd.set('source_id', api.state.target.sourceId);
                void unpinItem(fd);
                api.close();
              }}
            >
              <BookmarkCheck size={14} /> Unpin
            </ContextMenuItem>

            {/* Move to trash — kind-specific. Captures don't show this option;
                they go to /archive instead. */}
            {api.state.target.sourceKind !== 'capture' && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  destructive
                  onSelect={() => {
                    if (!api.state.open) return;
                    const { sourceKind, sourceId } = api.state.target;
                    if (sourceKind === 'journal_entry') {
                      void deleteJournalEntry(sourceId);
                    } else if (sourceKind === 'thread') {
                      void trashThread(sourceId);
                    } else if (sourceKind === 'project') {
                      void trashProject(sourceId);
                    }
                    api.close();
                  }}
                >
                  <Trash2 size={14} /> Move to trash
                </ContextMenuItem>
              </>
            )}
          </>
        )}
      </ContextMenuPopover>
    </Ctx.Provider>
  );
}

function useApi(): UseContextMenuStateApi<PinnedCardMenuTarget> {
  const api = useContext(Ctx);
  if (!api) {
    throw new Error(
      'usePinnedCardContextMenu must be used inside PinnedCardContextMenuProvider',
    );
  }
  return api;
}

/** Wraps a pinned card so right-click opens the menu. */
export function PinnedCardRow({
  target,
  className,
  children,
  style,
}: {
  target: PinnedCardMenuTarget;
  className?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  const api = useApi();
  return (
    <ContextMenuTrigger
      api={api}
      target={target}
      className={className}
      {...(style ? { style } : {})}
    >
      {children}
    </ContextMenuTrigger>
  );
}
