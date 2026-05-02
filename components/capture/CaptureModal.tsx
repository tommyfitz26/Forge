'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PenLine, Mic, Camera, Link as LinkIcon, ChevronDown, Check } from 'lucide-react';
import { TextCapture } from '@/app/(app)/capture/TextCapture';
import { VoiceCapture } from '@/app/(app)/capture/VoiceCapture';
import { PhotoCapture } from '@/app/(app)/capture/PhotoCapture';
import { WebClipCapture } from './WebClipCapture';

export type CaptureTab = 'note' | 'voice' | 'photo' | 'clip';

/** Lightweight shape — just what the picker needs. AppShell passes this in
 *  from the same fetch that powers the sidebar project list. */
export type ModalProject = {
  id: string;
  title: string;
};

const TABS: { id: CaptureTab; label: string; icon: typeof PenLine }[] = [
  { id: 'note', label: 'Note', icon: PenLine },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'photo', label: 'Photo', icon: Camera },
  { id: 'clip', label: 'Web clip', icon: LinkIcon },
];

export function CaptureModal({
  open,
  initialTab,
  onClose,
  projects,
}: {
  open: boolean;
  initialTab: CaptureTab | undefined;
  onClose: () => void;
  /** Active projects available in the picker. Empty → just shows "Stream / no project". */
  projects: ModalProject[];
}) {
  const [tab, setTab] = useState<CaptureTab>(initialTab ?? 'note');
  const [selectedProject, setSelectedProject] = useState<ModalProject | null>(null);

  useEffect(() => {
    // Re-sync the active tab when the modal opens with a specific initialTab.
    // Also reset the project selection on each fresh open so a previous
    // selection doesn't leak into the next capture.
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      if (initialTab) setTab(initialTab);
      setSelectedProject(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open, initialTab]);

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="forge-modal-bg" onClick={onClose}>
      <div
        className="forge-modal forge-modal--capture forge-capture-host"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Quick capture"
      >
        {/* Tabs */}
        <div className="forge-cap-tabs" role="tablist">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                className="forge-cap-tab"
                data-active={tab === t.id ? 'true' : 'false'}
                onClick={() => setTab(t.id)}
                role="tab"
                aria-selected={tab === t.id}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <BodyForTab tab={tab} projectId={selectedProject?.id ?? null} />

        {/* Footer */}
        <div className="forge-cap-actions">
          <ProjectPicker
            projects={projects}
            value={selectedProject}
            onChange={setSelectedProject}
          />
          <span className="forge-cap-field">
            tags: <span className="forge-cap-field__val">+ add</span>
          </span>
          <span className="forge-cap-actions__hint">esc to close</span>
        </div>
      </div>
    </div>
  );
}

function BodyForTab({
  tab,
  projectId,
}: {
  tab: CaptureTab;
  projectId: string | null;
}): ReactNode {
  if (tab === 'note') {
    return (
      <div className="forge-cap-body">
        <TextCapture projectId={projectId} />
        <div className="forge-cap-body__hint">
          Tip: start with <code>idea:</code>, <code>problem:</code>, <code>observation:</code>, or <code>research:</code>{' '}
          to skip classification.
        </div>
      </div>
    );
  }
  if (tab === 'voice') {
    return (
      <div className="forge-cap-body">
        <VoiceCapture projectId={projectId} />
      </div>
    );
  }
  if (tab === 'photo') {
    return (
      <div className="forge-cap-body">
        <PhotoCapture projectId={projectId} />
      </div>
    );
  }
  if (tab === 'clip') {
    return (
      <div className="forge-cap-body">
        <WebClipCapture projectId={projectId} />
      </div>
    );
  }
  return null;
}

/**
 * Lightweight project dropdown for the capture modal footer. Inline popover —
 * no portal, no transition — clicking the trigger toggles a list anchored to
 * the trigger; an outside click or Esc dismisses. Keeps the modal-in-modal
 * surface minimal.
 */
function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: ModalProject[];
  value: ModalProject | null;
  onChange: (next: ModalProject | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Outside-click + Esc to dismiss.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = value ? value.title : 'Stream / no project';

  return (
    <span className="forge-cap-field forge-cap-projpick" ref={wrapRef}>
      project:{' '}
      <button
        type="button"
        className="forge-cap-field__val forge-cap-projpick__btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="forge-cap-projpick__menu" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            className="forge-cap-projpick__item"
            data-active={value === null ? 'true' : 'false'}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <span className="forge-cap-projpick__item-name">Stream / no project</span>
            {value === null && <Check size={12} />}
          </button>
          {projects.length === 0 ? (
            <div className="forge-cap-projpick__empty">
              No active projects yet — create one in Workshop.
            </div>
          ) : (
            projects.map((p) => {
              const active = value?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className="forge-cap-projpick__item"
                  data-active={active ? 'true' : 'false'}
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                >
                  <span className="forge-cap-projpick__item-name">{p.title}</span>
                  {active && <Check size={12} />}
                </button>
              );
            })
          )}
        </div>
      )}
    </span>
  );
}
