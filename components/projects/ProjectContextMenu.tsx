'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Archive,
  ArchiveRestore,
  Bookmark,
  BookmarkCheck,
  Trash2,
} from 'lucide-react';
import {
  ContextMenuItem,
  ContextMenuPopover,
  ContextMenuSeparator,
  ContextMenuTrigger,
  useContextMenuState,
  type UseContextMenuStateApi,
} from '@/components/ui/ContextMenu';
import { togglePin } from '@/app/(app)/top-of-mind/actions';
import { archiveProject, restoreProject } from '@/app/(app)/workshop/actions';
import { trashProject } from '@/app/(app)/trash/actions';
import type { ProjectStatus } from '@/lib/types/projects';

export type ProjectMenuTarget = {
  id: string;
  status: ProjectStatus;
  isPinned: boolean;
};

const Ctx = createContext<UseContextMenuStateApi<ProjectMenuTarget> | null>(null);

export function ProjectContextMenuProvider({ children }: { children: ReactNode }) {
  const api = useContextMenuState<ProjectMenuTarget>();
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
                router.push(`/projects/${api.state.open ? api.state.target.id : ''}`);
                api.close();
              }}
            >
              <ArrowUpRight size={14} /> Open project
            </ContextMenuItem>

            <ContextMenuItem
              onSelect={() => {
                if (!api.state.open) return;
                const fd = new FormData();
                fd.set('source_kind', 'project');
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

            <ContextMenuSeparator />

            {api.state.target.status === 'archived' ? (
              <ContextMenuItem
                onSelect={() => {
                  if (!api.state.open) return;
                  void restoreProject(api.state.target.id);
                  api.close();
                }}
              >
                <ArchiveRestore size={14} /> Restore from archive
              </ContextMenuItem>
            ) : (
              <ContextMenuItem
                onSelect={() => {
                  if (!api.state.open) return;
                  void archiveProject(api.state.target.id);
                  api.close();
                }}
              >
                <Archive size={14} /> Archive
              </ContextMenuItem>
            )}

            <ContextMenuItem
              destructive
              onSelect={() => {
                if (!api.state.open) return;
                void trashProject(api.state.target.id);
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

function useApi(): UseContextMenuStateApi<ProjectMenuTarget> {
  const api = useContext(Ctx);
  if (!api) {
    throw new Error('useProjectContextMenu must be used inside ProjectContextMenuProvider');
  }
  return api;
}

/** Wraps a project card so right-click opens the menu. */
export function ProjectRow({
  target,
  className,
  onClick,
  children,
  style,
}: {
  target: ProjectMenuTarget;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  const api = useApi();
  return (
    <ContextMenuTrigger
      api={api}
      target={target}
      className={className}
      {...(onClick ? { onClick } : {})}
      {...(style ? { style } : {})}
    >
      {children}
    </ContextMenuTrigger>
  );
}
