'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Archive,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Link2,
  Trash2,
} from 'lucide-react';
import type { CaptureKind, CaptureState } from '@/lib/capture/kinds';
import { togglePin } from '@/app/(app)/top-of-mind/actions';
import { trashCapture } from '@/app/(app)/trash/actions';
import { LinkPalette } from '@/components/links/LinkPalette';
import { PromoteToProjectModal } from './PromoteToProjectModal';

type Target = {
  id: string;
  title: string;
  kind: CaptureKind;
  state: CaptureState;
  isProject: boolean;
  projectId: string | null;
  isPinned: boolean;
};

type MenuState = {
  x: number;
  y: number;
  target: Target;
} | null;

type Ctx = {
  open: (e: ReactMouseEvent, target: Target) => void;
};

const ContextMenuCtx = createContext<Ctx | null>(null);

/** Provider — wraps a list of capture rows so any row can request the menu. */
export function CaptureContextMenuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MenuState>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<Target | null>(null);
  const [linkSource, setLinkSource] = useState<{ id: string } | null>(null);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const open = useCallback((e: ReactMouseEvent, target: Target) => {
    e.preventDefault();
    setState({ x: e.clientX, y: e.clientY, target });
  }, []);

  const close = useCallback(() => setState(null), []);

  // Close on outside click + Esc.
  useEffect(() => {
    if (!state) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    function onScroll() {
      close();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [state, close]);

  return (
    <ContextMenuCtx.Provider value={{ open }}>
      {children}
      {state && (
        <div
          ref={menuRef}
          className="forge-context-menu"
          style={{ left: state.x, top: state.y }}
          role="menu"
        >
          {state.target.isProject && state.target.projectId ? (
            <button
              type="button"
              className="forge-context-menu__item"
              data-primary="true"
              onClick={() => {
                router.push(`/projects/${state.target.projectId!}`);
                close();
              }}
            >
              <ArrowUpRight size={14} /> Open project
            </button>
          ) : (
            <button
              type="button"
              className="forge-context-menu__item"
              data-primary="true"
              onClick={() => {
                setPromoteTarget(state.target);
                setPromoteOpen(true);
                close();
              }}
            >
              <ArrowUpRight size={14} /> Make this a project
            </button>
          )}

          <button
            type="button"
            className="forge-context-menu__item"
            onClick={() => {
              const fd = new FormData();
              fd.set('source_kind', 'capture');
              fd.set('source_id', state.target.id);
              void togglePin(fd);
              close();
            }}
          >
            {state.target.isPinned ? (
              <>
                <BookmarkCheck size={14} /> Unpin from Top of mind
              </>
            ) : (
              <>
                <Bookmark size={14} /> Pin to Top of mind
              </>
            )}
          </button>

          <button
            type="button"
            className="forge-context-menu__item"
            onClick={() => {
              setLinkSource({ id: state.target.id });
              close();
            }}
          >
            <Link2 size={14} /> Link to…
          </button>

          <div className="forge-context-menu__sep" />

          <button
            type="button"
            className="forge-context-menu__item"
            onClick={() => {
              router.push(`/capture/${state.target.id}`);
              close();
            }}
          >
            <ExternalLink size={14} /> Open
            <span className="forge-context-menu__hint">↵</span>
          </button>

          {state.target.state !== 'archived' && (
            <button
              type="button"
              className="forge-context-menu__item"
              onClick={() => {
                router.push(`/capture/${state.target.id}#archive`);
                close();
              }}
            >
              <Archive size={14} /> Archive…
            </button>
          )}

          <div className="forge-context-menu__sep" />

          <button
            type="button"
            className="forge-context-menu__item"
            data-destructive="true"
            onClick={() => {
              void trashCapture(state.target.id);
              close();
            }}
          >
            <Trash2 size={14} /> Move to trash
          </button>
        </div>
      )}

      {promoteTarget && (
        <PromoteToProjectModal
          open={promoteOpen}
          onClose={() => {
            setPromoteOpen(false);
            setPromoteTarget(null);
          }}
          capture={{
            id: promoteTarget.id,
            title: promoteTarget.title,
            kind: promoteTarget.kind,
          }}
        />
      )}

      {linkSource && (
        <LinkPalette
          open
          onClose={() => setLinkSource(null)}
          source={{ kind: 'capture', id: linkSource.id }}
        />
      )}
    </ContextMenuCtx.Provider>
  );
}

/** Hook for capture rows to wire up onContextMenu. */
export function useCaptureContextMenu() {
  const ctx = useContext(ContextMenuCtx);
  if (!ctx) {
    throw new Error('useCaptureContextMenu must be used inside <CaptureContextMenuProvider>');
  }
  return ctx;
}

/** Wraps a clickable row that should respond to right-click. */
export function CaptureRow({
  target,
  className,
  onClick,
  children,
}: {
  target: Target;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const { open } = useCaptureContextMenu();
  return (
    <div
      className={className}
      onContextMenu={(e) => open(e, target)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
    >
      {children}
    </div>
  );
}
