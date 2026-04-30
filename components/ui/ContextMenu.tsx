'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';

/**
 * Generic right-click popover primitive used by per-surface context menus
 * (capture, project, thread, journal entry, pinned card).
 *
 * Each surface owns its own React Context to hold the currently right-clicked
 * target, but they all delegate the popover lifecycle (position, viewport
 * clamping, dismiss on outside click / Esc / scroll) to this primitive via
 * `useContextMenuState` + `<ContextMenuPopover />`.
 */

export type MenuPosition = { x: number; y: number };

export type ContextMenuState<T> =
  | { open: false }
  | { open: true; position: MenuPosition; target: T };

export type UseContextMenuStateApi<T> = {
  state: ContextMenuState<T>;
  /** Call from `onContextMenu` to open the menu at the click position. */
  open: (e: ReactMouseEvent, target: T) => void;
  close: () => void;
};

export function useContextMenuState<T>(): UseContextMenuStateApi<T> {
  const [state, setState] = useState<ContextMenuState<T>>({ open: false });

  const open = useCallback((e: ReactMouseEvent, target: T) => {
    e.preventDefault();
    setState({
      open: true,
      position: { x: e.clientX, y: e.clientY },
      target,
    });
  }, []);

  const close = useCallback(() => setState({ open: false }), []);

  return { state, open, close };
}

/**
 * Renders the menu popover when state.open === true. Children are the menu
 * items (use the `<ContextMenuItem />` and `<ContextMenuSeparator />` helpers
 * below for the standard look).
 *
 * Position is clamped so the menu never overflows the viewport; the menu's
 * own bbox is measured after first paint to do the clamp.
 */
export function ContextMenuPopover<T>({
  state,
  onClose,
  children,
}: {
  state: ContextMenuState<T>;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState<MenuPosition | null>(null);

  // Measure on open, clamp into viewport. setState here is intentional —
  // we can't know the final clamped position until the DOM is laid out,
  // so this is the "external system → React" sync direction the rule allows.
  useEffect(() => {
    if (!state.open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClamped(null);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let x = state.position.x;
    let y = state.position.y;
    if (x + rect.width + margin > vw) x = Math.max(margin, vw - rect.width - margin);
    if (y + rect.height + margin > vh) y = Math.max(margin, vh - rect.height - margin);
    setClamped({ x, y });
  }, [state]);

  // Dismiss handlers — outside click, Escape, scroll.
  useEffect(() => {
    if (!state.open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onScroll() {
      onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [state.open, onClose]);

  if (!state.open) return null;
  const pos = clamped ?? state.position;
  return (
    <div
      ref={ref}
      className="forge-context-menu"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
    >
      {children}
    </div>
  );
}

export function ContextMenuItem({
  onSelect,
  primary = false,
  destructive = false,
  hint,
  children,
  disabled = false,
}: {
  onSelect: () => void;
  primary?: boolean;
  destructive?: boolean;
  hint?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="forge-context-menu__item"
      data-primary={primary ? 'true' : 'false'}
      data-destructive={destructive ? 'true' : 'false'}
      onClick={onSelect}
      disabled={disabled}
    >
      {children}
      {hint && <span className="forge-context-menu__hint">{hint}</span>}
    </button>
  );
}

export function ContextMenuSeparator() {
  return <div className="forge-context-menu__sep" role="separator" />;
}

/** Wraps a clickable element so right-click opens the menu. */
export function ContextMenuTrigger<T>({
  api,
  target,
  className,
  onClick,
  children,
  style,
  disabled = false,
  id,
}: {
  api: UseContextMenuStateApi<T>;
  target: T;
  className?: string | undefined;
  onClick?: (() => void) | undefined;
  children: ReactNode;
  style?: React.CSSProperties | undefined;
  disabled?: boolean | undefined;
  /** Anchor id for `#fragment` links — used by the journal entry article. */
  id?: string | undefined;
}) {
  return (
    <div
      {...(id ? { id } : {})}
      className={className}
      onContextMenu={(e) => {
        if (disabled) return;
        api.open(e, target);
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{ cursor: onClick ? 'pointer' : undefined, ...style }}
    >
      {children}
    </div>
  );
}
